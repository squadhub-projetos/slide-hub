import type { DesignStyle, SlideVersion } from '../../types'
import { svgToDataUrl } from '../../utils/svg'
import { resolveLogoLayers } from '../brands/brandAssets'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Falha ao carregar imagem para composição.'))
    image.src = src
  })
}

export function versionBaseSrc(version: SlideVersion | null | undefined): string | null {
  if (!version) return null
  if (version.imageDataUrl) return version.imageDataUrl
  if (version.svg) return svgToDataUrl(version.svg)
  return null
}

/**
 * Achata uma versão do slide em PNG final: arte gerada + logos oficiais
 * aplicados como camadas exatas (nunca redesenhados pela IA). É a mesma
 * matemática de posicionamento usada no preview (BrandLogoOverlay).
 */
export async function flattenVersionToPng(
  version: SlideVersion,
  style: DesignStyle | null,
  width = 1920,
  height = 1080,
): Promise<string> {
  const baseSrc = versionBaseSrc(version)
  if (!baseSrc) throw new Error('A versão não possui imagem para exportar.')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.')

  const base = await loadImage(baseSrc)
  ctx.drawImage(base, 0, 0, width, height)

  if (style) {
    const layers = await resolveLogoLayers(style, width / height)
    for (const layer of layers) {
      const logo = await loadImage(layer.dataUrl)
      ctx.drawImage(logo, layer.x * width, layer.y * height, layer.width * width, layer.height * height)
    }
  }

  return canvas.toDataURL('image/png')
}
