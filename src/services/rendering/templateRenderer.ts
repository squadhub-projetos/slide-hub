import type { DesignStyle, PlannedSlide, SlideTemplate, Snippet, TemplateLayer } from '../../types'
import { fontStack } from '../ai/slideArtwork'
import { createRng, hashString } from '../../utils/random'

export const RENDER_W = 1920
export const RENDER_H = 1080

/**
 * Renderização híbrida "Guiado por template" / "Estruturado":
 * camadas determinísticas (textos, números, formas, ícones, gráficos,
 * snippets) desenhadas pela aplicação; regiões de IA recebem imagens
 * reais fornecidas em `regionImages`. O resultado é achatado em PNG.
 * Logos oficiais NÃO entram aqui — são compostos por composeSlide.
 */

export interface TemplateRenderContext {
  template: SlideTemplate
  style: DesignStyle
  plan: PlannedSlide
  snippets: Snippet[]
  /** layerId → dataURL de imagem real (regiões de IA / placeholders de imagem). */
  regionImages?: Record<string, string>
  /** assetId/binding → dataURL de ativo da biblioteca. */
  assetImages?: Record<string, string>
  /** Valores de parâmetros de snippets (por binding "param.x"). */
  params?: Record<string, string>
  projectName: string
  slideNumber: number
  totalSlides: number
  nextSlideTitle?: string
}

function contentTitle(item: string): { title: string; rest: string } {
  const cut = item.search(/[:—-]\s/)
  if (cut > 3 && cut < 60) return { title: item.slice(0, cut).trim(), rest: item.slice(cut + 1).trim() }
  const words = item.split(' ')
  if (words.length <= 5) return { title: item, rest: '' }
  return { title: words.slice(0, 4).join(' '), rest: item }
}

function extractMetric(text: string): { value: string; label: string } {
  const match = text.match(/(R\$\s?[\d.,]+\s?[MK]?|[\d.,]+\s?(?:%|x|pts|p\.p\.|dias|M|K)|\+[\d.,]+)/)
  if (match) {
    return { value: match[1].trim(), label: text.replace(match[1], '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Indicador' }
  }
  return { value: '—', label: text.slice(0, 60) }
}

export function resolveBinding(binding: string | undefined, ctx: TemplateRenderContext): string {
  if (!binding) return ''
  const { plan } = ctx
  if (binding.startsWith('param.')) return ctx.params?.[binding.slice(6)] ?? ''
  if (binding.startsWith('slide.content.')) {
    const index = Number(binding.split('.')[2] ?? 0)
    return plan.content[index] ?? ''
  }
  if (binding.startsWith('slide.contentTitle.')) {
    const index = Number(binding.split('.')[2] ?? 0)
    return plan.content[index] ? contentTitle(plan.content[index]).title : ''
  }
  if (binding.startsWith('slide.metric.value.')) {
    const index = Number(binding.split('.')[3] ?? 0)
    const source = plan.evidence[index] ?? plan.content[index] ?? ''
    return source ? extractMetric(source).value : ''
  }
  if (binding.startsWith('slide.metric.label.')) {
    const index = Number(binding.split('.')[3] ?? 0)
    const source = plan.evidence[index] ?? plan.content[index] ?? ''
    return source ? extractMetric(source).label : ''
  }
  switch (binding) {
    case 'slide.title': return plan.title
    case 'slide.subtitle': return plan.subtitle || plan.objective
    case 'slide.kicker': return plan.objective.split(' ').slice(0, 4).join(' ')
    case 'slide.keyMessage': return plan.keyMessage || plan.title
    case 'slide.body': return plan.content.join('\n')
    case 'slide.quote': return plan.keyMessage || plan.content[0] || ''
    case 'slide.next.title': return ctx.nextSlideTitle ?? ''
    case 'slide.number': return `${String(ctx.slideNumber).padStart(2, '0')} / ${String(ctx.totalSlides).padStart(2, '0')}`
    case 'project.footer': return ctx.projectName.toUpperCase()
    default: return ''
  }
}

function colorOf(value: string | undefined, style: DesignStyle, fallback: string): string {
  switch (value) {
    case 'auto': case undefined: return fallback
    case 'accent': return style.palette.accent
    case 'muted': return style.palette.muted
    case 'auto-surface': return style.palette.surface
    case 'auto-accent': return style.palette.accent
    case 'none': return 'transparent'
    default: return value
  }
}

function drawWrappedText(
  ctx2d: CanvasRenderingContext2D,
  layer: TemplateLayer,
  text: string,
  style: DesignStyle,
): void {
  const t = layer.text
  if (!t || !text) return
  const x = layer.x * RENDER_W
  const y = layer.y * RENDER_H
  const w = layer.width * RENDER_W
  const h = layer.height * RENDER_H
  const family = fontStack(
    t.fontRole === 'heading' ? style.typography.heading : t.fontRole === 'numbers' ? style.typography.numbers : style.typography.body,
  )
  const content = (t.uppercase ? text.toUpperCase() : text).slice(0, t.maxChars)
  let size = t.size * (RENDER_H / 900) * (style.typography.scale / 100)

  const layout = (fontSize: number): string[] => {
    ctx2d.font = `${t.weight} ${fontSize}px ${family}`
    const words = content.split(/\s+/)
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (ctx2d.measureText(candidate).width > w && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
    return lines
  }

  let lines = layout(size)
  if (t.autoShrink) {
    while ((lines.length > t.maxLines || lines.length * size * t.lineHeight > h + size) && size > 10) {
      size *= 0.92
      lines = layout(size)
    }
  }
  if (lines.length > t.maxLines) {
    lines = lines.slice(0, t.maxLines)
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[,.;:]$/, '')}…`
  }

  ctx2d.font = `${t.weight} ${size}px ${family}`
  ctx2d.fillStyle = colorOf(t.color, style, style.palette.text)
  ctx2d.textBaseline = 'top'
  ctx2d.textAlign = t.align
  const anchorX = t.align === 'center' ? x + w / 2 : t.align === 'right' ? x + w : x
  lines.forEach((line, i) => {
    ctx2d.fillText(line, anchorX, y + i * size * t.lineHeight)
  })
  ctx2d.textAlign = 'left'
}

function drawImageCover(ctx2d: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, radius = 0): void {
  ctx2d.save()
  if (radius > 0) {
    ctx2d.beginPath()
    ctx2d.roundRect(x, y, w, h, radius)
    ctx2d.clip()
  }
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx2d.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx2d.restore()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Falha ao carregar imagem da camada.'))
    image.src = src
  })
}

/** Renderiza o template + conteúdo em PNG data URL (1920×1080). */
export async function renderTemplate(ctx: TemplateRenderContext): Promise<string> {
  const { template, style } = ctx
  const canvas = document.createElement('canvas')
  canvas.width = RENDER_W
  canvas.height = RENDER_H
  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) throw new Error('Canvas 2D indisponível.')
  await document.fonts.ready.catch(() => undefined)

  // Fundo do estilo
  const grad = ctx2d.createLinearGradient(0, 0, RENDER_W, RENDER_H)
  grad.addColorStop(0, style.palette.background)
  grad.addColorStop(1, style.gradient.kind === 'none' ? style.palette.background : style.palette.surface)
  ctx2d.fillStyle = grad
  ctx2d.fillRect(0, 0, RENDER_W, RENDER_H)

  // Camadas do template + snippets aplicados
  const snippetLayers: TemplateLayer[] = ctx.snippets.flatMap((snippet, si) =>
    snippet.layers.map((l) => ({ ...l, id: `${snippet.id}:${l.id}`, zIndex: 500 + si * 20 + l.zIndex })),
  )
  const layers = [...template.layers, ...snippetLayers]
    .filter((l) => l.visible)
    .sort((a, b) => a.zIndex - b.zIndex)

  const rng = createRng(hashString(template.id + ctx.plan.id))

  for (const layer of layers) {
    const x = layer.x * RENDER_W
    const y = layer.y * RENDER_H
    const w = layer.width * RENDER_W
    const h = layer.height * RENDER_H
    ctx2d.save()
    ctx2d.globalAlpha = layer.opacity
    if (layer.rotation) {
      ctx2d.translate(x + w / 2, y + h / 2)
      ctx2d.rotate((layer.rotation * Math.PI) / 180)
      ctx2d.translate(-(x + w / 2), -(y + h / 2))
    }

    switch (layer.type) {
      case 'text-placeholder': {
        drawWrappedText(ctx2d, layer, resolveBinding(layer.binding, ctx), style)
        break
      }
      case 'shape': {
        const s = layer.shape
        if (!s) break
        if (s.shadow) {
          ctx2d.shadowColor = 'rgba(0,0,0,0.25)'
          ctx2d.shadowBlur = 24
          ctx2d.shadowOffsetY = 8
        }
        const fill = colorOf(s.fill, style, style.palette.surface)
        if (fill !== 'transparent') {
          ctx2d.fillStyle = fill
          ctx2d.globalAlpha = layer.opacity * s.opacity
          ctx2d.beginPath()
          ctx2d.roundRect(x, y, w, h, Math.min(s.radius * (RENDER_H / 900), Math.min(w, h) / 2))
          ctx2d.fill()
        }
        ctx2d.shadowColor = 'transparent'
        if (s.stroke && s.stroke !== 'none') {
          ctx2d.strokeStyle = colorOf(s.stroke, style, style.palette.muted)
          ctx2d.lineWidth = s.strokeWidth * (RENDER_H / 900)
          ctx2d.beginPath()
          ctx2d.roundRect(x, y, w, h, Math.min(s.radius * (RENDER_H / 900), Math.min(w, h) / 2))
          ctx2d.stroke()
        }
        break
      }
      case 'line': {
        ctx2d.strokeStyle = colorOf(layer.shape?.stroke, style, style.palette.muted)
        ctx2d.globalAlpha = layer.opacity * (layer.shape?.opacity ?? 1)
        ctx2d.lineWidth = Math.max(1, (layer.shape?.strokeWidth ?? 1) * (RENDER_H / 900))
        ctx2d.beginPath()
        ctx2d.moveTo(x, y + h / 2)
        ctx2d.lineTo(x + w, y + h / 2)
        ctx2d.stroke()
        break
      }
      case 'arrow': {
        ctx2d.strokeStyle = colorOf(layer.shape?.stroke === 'auto' ? 'accent' : layer.shape?.stroke, style, style.palette.accent)
        ctx2d.lineWidth = Math.max(2, (layer.shape?.strokeWidth ?? 2) * (RENDER_H / 900))
        ctx2d.lineCap = 'round'
        const midY = y + h / 2
        ctx2d.beginPath()
        ctx2d.moveTo(x, midY)
        ctx2d.lineTo(x + w, midY)
        ctx2d.moveTo(x + w - h * 0.5, midY - h * 0.4)
        ctx2d.lineTo(x + w, midY)
        ctx2d.lineTo(x + w - h * 0.5, midY + h * 0.4)
        ctx2d.stroke()
        break
      }
      case 'icon-placeholder': {
        // Glifo abstrato determinístico — nunca finge ser um ícone real
        ctx2d.fillStyle = `${style.palette.accent}22`
        ctx2d.beginPath()
        ctx2d.roundRect(x, y, w, h, Math.min(w, h) * 0.24)
        ctx2d.fill()
        ctx2d.strokeStyle = style.palette.accent
        ctx2d.lineWidth = Math.max(2, RENDER_H / 450)
        const variant = (layer.contentIndex ?? 0) % 3
        ctx2d.beginPath()
        if (variant === 0) {
          ctx2d.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.26, 0, Math.PI * 2)
        } else if (variant === 1) {
          ctx2d.moveTo(x + w * 0.28, y + h * 0.66)
          ctx2d.lineTo(x + w * 0.5, y + h * 0.3)
          ctx2d.lineTo(x + w * 0.72, y + h * 0.66)
        } else {
          ctx2d.rect(x + w * 0.28, y + h * 0.3, w * 0.44, h * 0.4)
        }
        ctx2d.stroke()
        break
      }
      case 'chart-placeholder': {
        ctx2d.strokeStyle = `${style.palette.muted}55`
        ctx2d.lineWidth = 1
        ctx2d.strokeRect(x, y, w, h)
        const bars = 5
        for (let i = 0; i < bars; i++) {
          const bh = h * (0.25 + rng() * 0.65)
          ctx2d.fillStyle = i === bars - 2 ? style.palette.accent : `${style.palette.primary}88`
          ctx2d.fillRect(x + w * 0.08 + i * (w * 0.18), y + h - bh, w * 0.12, bh)
        }
        break
      }
      case 'table-placeholder': {
        ctx2d.strokeStyle = `${style.palette.muted}44`
        ctx2d.lineWidth = 1
        for (let r = 0; r <= 3; r++) {
          ctx2d.beginPath()
          ctx2d.moveTo(x, y + (h / 3) * r)
          ctx2d.lineTo(x + w, y + (h / 3) * r)
          ctx2d.stroke()
        }
        for (let c = 0; c <= 3; c++) {
          ctx2d.beginPath()
          ctx2d.moveTo(x + (w / 3) * c, y)
          ctx2d.lineTo(x + (w / 3) * c, y + h)
          ctx2d.stroke()
        }
        break
      }
      case 'image-placeholder':
      case 'ai-region': {
        const src = ctx.regionImages?.[layer.id]
        if (src) {
          const img = await loadImage(src)
          drawImageCover(ctx2d, img, x, y, w, h, layer.type === 'image-placeholder' ? 14 : 0)
        } else {
          // Sem imagem: preenchimento decorativo do estilo (modo estruturado)
          const fillGrad = ctx2d.createLinearGradient(x, y, x + w, y + h)
          fillGrad.addColorStop(0, `${style.palette.primary}26`)
          fillGrad.addColorStop(1, `${style.palette.secondary}1f`)
          ctx2d.fillStyle = fillGrad
          ctx2d.beginPath()
          ctx2d.roundRect(x, y, w, h, layer.type === 'image-placeholder' ? 14 : 0)
          ctx2d.fill()
          ctx2d.strokeStyle = `${style.palette.accent}44`
          ctx2d.setLineDash([8, 8])
          ctx2d.stroke()
          ctx2d.setLineDash([])
        }
        break
      }
      case 'asset': {
        const src =
          (layer.assetId && ctx.assetImages?.[layer.assetId]) ||
          (layer.binding && ctx.assetImages?.[layer.binding])
        if (src) {
          const img = await loadImage(src)
          const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight)
          const dw = img.naturalWidth * scale
          const dh = img.naturalHeight * scale
          ctx2d.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
        }
        break
      }
      case 'logo':
      case 'group':
        break
    }
    ctx2d.restore()
  }

  return canvas.toDataURL('image/png')
}
