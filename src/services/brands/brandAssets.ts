import { getBrand, SQUADHUB_BRAND_ID } from '../../config/brands'
import type { DesignStyle } from '../../types'
import type { BrandLogoRules, LogoVariant } from '../../types/brands'

/**
 * Serviço central de ativos de marca: resolve o arquivo oficial em data URL,
 * gera variantes de COR (a geometria nunca é tocada) e calcula o layout
 * determinístico dos logos sobre o slide — usado tanto no preview quanto
 * no achatamento final de exportação.
 */

const dataUrlCache = new Map<string, Promise<string>>()
const sizeCache = new Map<string, Promise<{ width: number; height: number }>>()

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Falha ao ler o ativo da marca.'))
    reader.readAsDataURL(blob)
  })
}

async function fetchAssetDataUrl(assetUrl: string): Promise<string> {
  const response = await fetch(assetUrl)
  if (!response.ok) throw new Error(`Ativo de marca indisponível (${response.status}).`)
  return blobToDataUrl(await response.blob())
}

/**
 * Normaliza o tamanho intrínseco (width/height explícitos a partir do
 * viewBox, para medição confiável) e recolore APENAS os preenchimentos
 * do wordmark SquadHub — as formas nunca são tocadas.
 */
function recolorSquadhubSvg(svgText: string, variant: LogoVariant): string {
  let svg = svgText.replace('width="100%" height="100%"', 'width="2165" height="524"')
  if (variant === 'color') return svg
  const wordmarkColor = variant === 'mono-dark' ? 'rgb(11,34,66)' : 'rgb(252,251,251)'
  const symbolColor = variant === 'mono-dark' ? 'rgb(0,122,178)' : 'rgb(0,154,220)'
  svg = svg
    .replaceAll('fill:rgb(252,251,251)', `fill:${wordmarkColor}`)
    .replaceAll('fill:rgb(0,154,220)', `fill:${symbolColor}`)
  return svg
}

function svgTextToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Data URL do logo oficial de uma marca, na variante de cor pedida. */
export function getBrandLogoDataUrl(brandId: string, variant: LogoVariant = 'color'): Promise<string> {
  const brand = getBrand(brandId)
  if (!brand) return Promise.reject(new Error(`Marca desconhecida: ${brandId}`))
  const cacheKey = `${brandId}:${variant}`
  let cached = dataUrlCache.get(cacheKey)
  if (!cached) {
    cached = (async () => {
      if (brandId === SQUADHUB_BRAND_ID) {
        const response = await fetch(brand.logoAsset)
        if (!response.ok) throw new Error('Logo da SquadHub indisponível.')
        return svgTextToDataUrl(recolorSquadhubSvg(await response.text(), variant))
      }
      // PNGs de clientes nunca são recoloridos — sempre o arquivo exato.
      return fetchAssetDataUrl(brand.logoAsset)
    })()
    dataUrlCache.set(cacheKey, cached)
  }
  return cached
}

export function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  let cached = sizeCache.get(dataUrl)
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('Falha ao medir o logo.'))
      image.src = dataUrl
    })
    sizeCache.set(dataUrl, cached)
  }
  return cached
}

export interface LogoLayer {
  brandId: string
  dataUrl: string
  /** Posição/tamanho em fração da largura/altura do slide (0..1). */
  x: number
  y: number
  width: number
  height: number
}

function pickVariant(rules: BrandLogoRules, brandId: string, theme: 'dark' | 'light'): LogoVariant {
  if (rules.variant !== 'auto') return rules.variant
  if (brandId === SQUADHUB_BRAND_ID) return theme === 'light' ? 'mono-dark' : 'color'
  return 'color'
}

/**
 * Resolve as camadas de logo de um estilo (respeitando co-branding) com
 * posições determinísticas. `slideAspect` = largura/altura (16/9).
 */
export async function resolveLogoLayers(style: DesignStyle, slideAspect = 16 / 9): Promise<LogoLayer[]> {
  const rules = style.logoRules
  const ids: string[] = []
  const styleBrand = style.brandId

  if (!styleBrand || styleBrand === SQUADHUB_BRAND_ID) {
    if (rules.coBranding !== 'client-only') ids.push(SQUADHUB_BRAND_ID)
  } else {
    if (rules.coBranding === 'client-only') ids.push(styleBrand)
    else if (rules.coBranding === 'squadhub-only') ids.push(SQUADHUB_BRAND_ID)
    else ids.push(styleBrand, SQUADHUB_BRAND_ID)
  }

  const layers: LogoLayer[] = []
  const margin = rules.safeAreaPct / 100
  let cursorX: number | null = null

  for (const brandId of ids) {
    const brand = getBrand(brandId)
    if (!brand) continue
    const dataUrl = await getBrandLogoDataUrl(brandId, pickVariant(rules, brandId, style.theme))
    const natural = await getImageSize(dataUrl)
    const logoAspect = natural.width / Math.max(natural.height, 1)
    // Logos secundários (co-branding) entram com 70% do tamanho do principal.
    const width = (rules.widthPct / 100) * (layers.length === 0 ? 1 : 0.7)
    const height = (width / logoAspect) * slideAspect

    const alignRight = rules.placement.endsWith('right')
    const alignBottom = rules.placement.startsWith('bottom')
    let x: number
    if (cursorX === null) {
      x = alignRight ? 1 - margin - width : margin
    } else {
      // Segundo logo lado a lado, afastado do primeiro.
      x = alignRight ? cursorX - 0.02 - width : cursorX + 0.02
    }
    const y = alignBottom ? 1 - margin * slideAspect - height : margin * slideAspect
    layers.push({ brandId, dataUrl, x, y, width, height })
    cursorX = alignRight ? x : x + width
  }
  return layers
}

/** Paleta dominante extraída do próprio arquivo do logo (amostragem em canvas). */
export async function extractPaletteFromAsset(assetUrl: string, maxColors = 4): Promise<string[]> {
  const dataUrl = await fetchAssetDataUrl(assetUrl)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 96 / image.naturalWidth)
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        reject(new Error('Canvas indisponível.'))
        return
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const buckets = new Map<string, { r: number; g: number; b: number; n: number }>()
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
        if (a < 200) continue
        // Ignora quase-branco/quase-preto (fundo e texto) na dominância.
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        if (max > 242 || (max - min < 18 && max > 200)) continue
        const key = `${r >> 5}-${g >> 5}-${b >> 5}`
        const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
        bucket.r += r
        bucket.g += g
        bucket.b += b
        bucket.n += 1
        buckets.set(key, bucket)
      }
      const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0')
      const colors = [...buckets.values()]
        .sort((a, b) => b.n - a.n)
        .slice(0, maxColors)
        .map((b) => `#${toHex(b.r / b.n)}${toHex(b.g / b.n)}${toHex(b.b / b.n)}`)
      resolve(colors)
    }
    image.onerror = () => reject(new Error('Falha ao carregar o logo para extração de paleta.'))
    image.src = dataUrl
  })
}
