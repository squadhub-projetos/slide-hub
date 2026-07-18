import type { DesignStyle, PlannedSlide, SlideLayout } from '../../types'
import { createRng, hashString, pick } from '../../utils/random'
import { escapeXml } from '../../utils/svg'

export const SLIDE_W = 1600
export const SLIDE_H = 900

/** Traduz instruções em linguagem natural para modificadores do renderer estruturado. */
export function parseRevisionMods(instructions: string): ArtworkMods {
  const text = instructions.toLowerCase()
  return {
    reduceText: /reduz|menos texto|enxut|resum|curto/.test(text),
    emphasizeNumber: /númer|numero|dado|métric|metric|destaca/.test(text),
    swapImagery: /imagem|visual|ilustra|gráfic|grafic|troca/.test(text),
    boostContrast: /contraste|legib|escur|clare/.test(text),
    altComposition: /composi|layout|invert|posi|reorganiz|reposicion/.test(text),
    simplify: /simplifi|limp|minimal|menos elemento|remov/.test(text),
  }
}

/** Modificadores aplicados quando o usuário solicita alterações. */
export interface ArtworkMods {
  reduceText?: boolean
  emphasizeNumber?: boolean
  swapImagery?: boolean
  boostContrast?: boolean
  altComposition?: boolean
  simplify?: boolean
  fixText?: boolean
  repositionElement?: boolean
  adjustHierarchy?: boolean
  removeElement?: boolean
}

export interface ArtworkInput {
  plan: Pick<PlannedSlide, 'title' | 'subtitle' | 'objective' | 'content' | 'layout' | 'visualDirection'>
  style: DesignStyle
  projectTitle: string
  index: number
  total: number
  seed: number
  mods?: ArtworkMods
}

interface Ctx extends ArtworkInput {
  rng: () => number
  mods: ArtworkMods
  text: string
  muted: string
  heading: string
  body: string
  numbers: string
  radius: number
  pad: number
  light: boolean
}

const FONT_STACKS: Record<string, string> = {
  Georgia: "Georgia, 'Times New Roman', serif",
  Cambria: 'Cambria, Georgia, serif',
  'Palatino Linotype': "'Palatino Linotype', Palatino, Georgia, serif",
  'Segoe UI': "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Verdana: 'Verdana, Geneva, sans-serif',
  'Trebuchet MS': "'Trebuchet MS', 'Segoe UI', sans-serif",
  Impact: "Impact, 'Arial Black', sans-serif",
  Consolas: "Consolas, 'Courier New', monospace",
  'Courier New': "'Courier New', Courier, monospace",
}

export const SLIDE_FONTS = Object.keys(FONT_STACKS)

/** Pilha CSS segura para uma fonte de slide (também usada no canvas). */
export function fontStack(font: string): string {
  return FONT_STACKS[font] ?? FONT_STACKS['Segoe UI']
}

function stack(font: string): string {
  return fontStack(font)
}

const TRAILING_STOPWORDS =
  /\s+(de|da|do|das|dos|para|pra|com|em|no|na|nos|nas|e|que|a|o|as|os|um|uma|sobre)$/i

function shortLabel(text: string, count: number): string {
  let words = text.split(/\s+/).filter(Boolean).slice(0, count).join(' ')
  for (let i = 0; i < 3; i++) {
    const next = words.replace(TRAILING_STOPWORDS, '')
    if (next === words) break
    words = next
  }
  return words || text.split(/\s+/)[0] || ''
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[,.;:]$/, '')}…`
    return kept
  }
  return lines
}

function tspans(lines: string[], x: number, y: number, lineHeight: number): string {
  return lines
    .map((line, i) => `<tspan x="${x}" y="${y + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')
}

function textBlock(
  ctx: Ctx,
  text: string,
  opts: {
    x: number
    y: number
    size: number
    width: number
    maxLines?: number
    font?: string
    weight?: number
    fill?: string
    lineHeight?: number
    anchor?: 'start' | 'middle' | 'end'
    spacing?: number
    opacity?: number
  },
): { svg: string; lines: number; height: number } {
  const {
    x, y, size, width,
    maxLines = 3,
    font = ctx.body,
    fill = ctx.text,
    anchor = 'start',
    opacity = 1,
  } = opts
  const isHeading = font === ctx.heading
  const weight = opts.weight ?? (isHeading ? ctx.style.typography.headingWeight : 400)
  const spacing = opts.spacing ?? (isHeading ? ctx.style.typography.letterSpacing : 0)
  const rendered = isHeading && ctx.style.typography.uppercaseTitles ? text.toUpperCase() : text
  const lineHeight = opts.lineHeight ?? Math.round(size * 1.28)
  const charW = size * (isHeading ? 0.56 : 0.52)
  const lines = wrap(rendered, Math.max(6, Math.floor(width / charW)), maxLines)
  const svg = `<text font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}" opacity="${opacity}">${tspans(lines, x, y, lineHeight)}</text>`
  return { svg, lines: lines.length, height: lines.length * lineHeight }
}

function kicker(ctx: Ctx, label: string, x: number, y: number, anchor: 'start' | 'middle' = 'start'): string {
  return `<text x="${x}" y="${y}" font-family="${ctx.body}" font-size="22" font-weight="600" fill="${ctx.style.palette.accent}" text-anchor="${anchor}" letter-spacing="6">${escapeXml(label.toUpperCase())}</text>`
}

function pageFooter(ctx: Ctx): string {
  const { palette } = ctx.style
  const n = String(ctx.index + 1).padStart(2, '0')
  return `
    <line x1="${ctx.pad}" y1="${SLIDE_H - 64}" x2="${SLIDE_W - ctx.pad}" y2="${SLIDE_H - 64}" stroke="${ctx.muted}" stroke-opacity="0.28" stroke-width="1"/>
    <text x="${ctx.pad}" y="${SLIDE_H - 32}" font-family="${ctx.body}" font-size="18" fill="${ctx.muted}" letter-spacing="3">${escapeXml(ctx.projectTitle.toUpperCase().slice(0, 60))}</text>
    <text x="${SLIDE_W - ctx.pad}" y="${SLIDE_H - 32}" font-family="${ctx.body}" font-size="18" fill="${palette.accent}" text-anchor="end" letter-spacing="3">${n} / ${String(ctx.total).padStart(2, '0')}</text>
  `
}

/** Texturas configuráveis do estilo. */
function textureLayer(ctx: Ctx): string {
  const { kind, intensity } = ctx.style.texture
  const alpha = Math.min(0.2, (intensity / 100) * 0.2)
  const ink = ctx.light ? '0 0 0' : '1 1 1'
  if (kind === 'none' || intensity <= 0) return ''
  if (kind === 'grain' || kind === 'noise' || kind === 'paper') {
    return `
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="${kind === 'paper' ? 0.5 : 0.9}" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 ${ink.split(' ')[0]} 0 0 0 0 ${ink.split(' ')[1]} 0 0 0 0 ${ink.split(' ')[2]} 0 0 0 ${alpha} 0"/></filter>
      <rect width="${SLIDE_W}" height="${SLIDE_H}" filter="url(#grain)"/>`
  }
  if (kind === 'grid') {
    const lines: string[] = []
    for (let x = 80; x < SLIDE_W; x += 80) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${SLIDE_H}"/>`)
    for (let y = 80; y < SLIDE_H; y += 80) lines.push(`<line x1="0" y1="${y}" x2="${SLIDE_W}" y2="${y}"/>`)
    return `<g stroke="${ctx.text}" stroke-opacity="${alpha * 0.5}" stroke-width="1">${lines.join('')}</g>`
  }
  if (kind === 'dots') {
    const rng = createRng(ctx.seed + 17)
    const dots = Array.from({ length: 140 }, () => {
      const x = rng() * SLIDE_W
      const y = rng() * SLIDE_H
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="1.4" fill="${ctx.text}" fill-opacity="${alpha}"/>`
    })
    return dots.join('')
  }
  if (kind === 'tech-lines') {
    return `<g stroke="${ctx.style.palette.accent}" stroke-opacity="${alpha}" stroke-width="1">
      ${Array.from({ length: 8 }, (_, i) => `<line x1="${(i + 1) * 180}" y1="0" x2="${(i + 1) * 180}" y2="${SLIDE_H}"/>`).join('')}
    </g>`
  }
  return ''
}

/** Fundo com gradiente configurável + camadas decorativas variadas por seed. */
function background(ctx: Ctx): string {
  const { palette } = ctx.style
  const gradient = ctx.style.gradient
  const g = Math.min(100, Math.max(0, gradient.intensity)) / 100
  const opacity = Math.min(100, Math.max(0, gradient.opacity)) / 100
  const rng = ctx.rng
  const variant = ctx.mods.swapImagery ? Math.floor(rng() * 97) % 4 : Math.floor(rng() * 4)

  let base: string
  let baseFill: string
  if (gradient.kind === 'none') {
    base = ''
    baseFill = gradient.solidFallback || palette.background
  } else if (gradient.kind === 'linear') {
    const rad = (gradient.direction * Math.PI) / 180
    const x2 = (0.5 + Math.cos(rad) / 2).toFixed(2)
    const y2 = (0.5 + Math.sin(rad) / 2).toFixed(2)
    base = `<linearGradient id="bg" x1="${(1 - Number(x2)).toFixed(2)}" y1="${(1 - Number(y2)).toFixed(2)}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${palette.background}"/><stop offset="1" stop-color="${palette.surface}"/></linearGradient>`
    baseFill = 'url(#bg)'
  } else {
    base = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.background}"/><stop offset="1" stop-color="${palette.surface}"/></linearGradient>`
    baseFill = 'url(#bg)'
  }

  const focusMap = { center: [0.5, 0.5], top: [0.5, 0.08], bottom: [0.5, 0.92], corner: [0.85, 0.1] } as const
  const [fx, fy] = focusMap[gradient.focus]
  const glowA = `<radialGradient id="glowA" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${palette.primary}" stop-opacity="${(0.5 * g + 0.08) * opacity}"/><stop offset="1" stop-color="${palette.primary}" stop-opacity="0"/></radialGradient>`
  const glowB = `<radialGradient id="glowB" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${palette.secondary}" stop-opacity="${(0.42 * g + 0.06) * opacity}"/><stop offset="1" stop-color="${palette.secondary}" stop-opacity="0"/></radialGradient>`
  const glowC = gradient.colorCount === 3
    ? `<radialGradient id="glowC" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${palette.accent}" stop-opacity="${0.28 * g * opacity}"/><stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/></radialGradient>`
    : ''

  let glows = ''
  if (gradient.kind !== 'none') {
    glows = `<ellipse cx="${fx * SLIDE_W}" cy="${fy * SLIDE_H}" rx="620" ry="480" fill="url(#glowA)"/>
      <ellipse cx="${(1 - fx) * SLIDE_W}" cy="${(1 - fy) * SLIDE_H}" rx="520" ry="400" fill="url(#glowB)"/>
      ${gradient.colorCount === 3 ? `<ellipse cx="${SLIDE_W / 2}" cy="${SLIDE_H * 0.7}" rx="480" ry="360" fill="url(#glowC)"/>` : ''}`
    if (gradient.kind === 'aurora' || gradient.kind === 'mesh') {
      glows += `<ellipse cx="${400 + rng() * 300}" cy="${200 + rng() * 200}" rx="500" ry="220" fill="url(#glowB)" transform="rotate(-18 700 300)"/>`
    }
  }

  let deco = ''
  const decoOpacity = ctx.light ? 0.5 : 1
  if (!ctx.mods.simplify) {
    if (variant === 0) {
      deco = `<g stroke="${ctx.text}" stroke-opacity="${0.05 * decoOpacity}" stroke-width="1">
          ${Array.from({ length: 9 }, (_, i) => `<line x1="${(i + 1) * 160}" y1="0" x2="${(i + 1) * 160}" y2="${SLIDE_H}"/>`).join('')}
        </g>`
    } else if (variant === 1) {
      const cx = 1350 + rng() * 150
      const cy = 180 + rng() * 240
      deco = `<g fill="none" stroke="${palette.accent}" stroke-opacity="${(0.18 * g + 0.05) * decoOpacity}">
          <circle cx="${cx}" cy="${cy}" r="180" stroke-width="1.5"/>
          <circle cx="${cx}" cy="${cy}" r="300" stroke-width="1"/>
          <circle cx="${cx}" cy="${cy}" r="430" stroke-width="0.7"/>
        </g>`
    } else if (variant === 2) {
      deco = `<g stroke="${palette.secondary}" stroke-opacity="${(0.22 * g + 0.05) * decoOpacity}" stroke-width="1.4">
          <path d="M -80 ${640 + rng() * 120} L ${560 + rng() * 200} ${240 + rng() * 120} L 1700 ${520 + rng() * 160}" fill="none"/>
          <path d="M -80 ${760 + rng() * 80} L ${640 + rng() * 200} ${380 + rng() * 120} L 1700 ${660 + rng() * 120}" fill="none" stroke-opacity="0.1"/>
        </g>`
    } else {
      const dots = Array.from({ length: 60 }, () => {
        const x = 1080 + rng() * 480
        const y = 60 + rng() * 480
        return `<circle cx="${x}" cy="${y}" r="${1 + rng() * 2.4}" fill="${palette.accent}" fill-opacity="${(0.12 + rng() * 0.3) * decoOpacity}"/>`
      }).join('')
      deco = dots
    }
  }

  return `
    <defs>${base}${glowA}${glowB}${glowC}</defs>
    <rect width="${SLIDE_W}" height="${SLIDE_H}" fill="${gradient.kind === 'none' ? baseFill : palette.background}"/>
    ${gradient.kind !== 'none' ? `<rect width="${SLIDE_W}" height="${SLIDE_H}" fill="${baseFill}"/>` : ''}
    ${glows}
    ${deco}
    ${textureLayer(ctx)}
  `
}

function bullets(ctx: Ctx, items: string[], x: number, y: number, width: number, size = 26): string {
  const list = ctx.mods.reduceText ? items.slice(0, 2) : items
  const denseGap: Record<string, number> = { 'very-clean': 38, clean: 32, balanced: 24, informative: 18, dense: 14 }
  const gap = denseGap[ctx.style.density] ?? 24
  let cursor = y
  let out = ''
  for (const item of list) {
    const block = textBlock(ctx, item, {
      x: x + 34, y: cursor, size, width: width - 34,
      maxLines: ctx.mods.reduceText ? 1 : 2, fill: ctx.text, opacity: 0.92, weight: 400,
    })
    out += `<circle cx="${x + 8}" cy="${cursor - size * 0.32}" r="5" fill="${ctx.style.palette.accent}"/>` + block.svg
    cursor += block.height + gap
  }
  return out
}

function abstractPanel(ctx: Ctx, x: number, y: number, w: number, h: number): string {
  const { palette } = ctx.style
  const rng = ctx.rng
  const r = Math.min(ctx.radius * 1.6, 40)
  const kind = ctx.mods.swapImagery ? (Math.floor(rng() * 89) + 1) % 3 : Math.floor(rng() * 3)
  let art = ''
  if (kind === 0) {
    const bars = Array.from({ length: 5 }, (_, i) => {
      const bh = h * (0.22 + rng() * 0.55)
      const bw = w / 9
      const bx = x + w * 0.14 + i * (w * 0.155)
      return `<rect x="${bx}" y="${y + h * 0.82 - bh}" width="${bw}" height="${bh}" rx="${Math.min(10, r)}" fill="${i === 3 ? palette.accent : palette.primary}" fill-opacity="${i === 3 ? 0.95 : 0.32 + i * 0.1}"/>`
    }).join('')
    art = bars + `<line x1="${x + w * 0.1}" y1="${y + h * 0.82}" x2="${x + w * 0.9}" y2="${y + h * 0.82}" stroke="${ctx.muted}" stroke-opacity="0.4"/>`
  } else if (kind === 1) {
    const cx = x + w * (0.4 + rng() * 0.2)
    const cy = y + h * (0.42 + rng() * 0.16)
    art = `
      <circle cx="${cx}" cy="${cy}" r="${h * 0.3}" fill="${palette.primary}" fill-opacity="0.5"/>
      <circle cx="${cx + w * 0.16}" cy="${cy + h * 0.14}" r="${h * 0.2}" fill="${palette.accent}" fill-opacity="0.85"/>
      <circle cx="${cx - w * 0.18}" cy="${cy + h * 0.2}" r="${h * 0.12}" fill="${palette.secondary}" fill-opacity="0.65"/>
      <circle cx="${cx}" cy="${cy}" r="${h * 0.4}" fill="none" stroke="${palette.accent}" stroke-opacity="0.4" stroke-dasharray="3 8"/>`
  } else {
    const path = Array.from({ length: 7 }, (_, i) => {
      const px = x + w * 0.1 + (i * w * 0.8) / 6
      const py = y + h * 0.72 - h * (rng() * 0.28 + (i / 6) * 0.28)
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(0)} ${py.toFixed(0)}`
    }).join(' ')
    art = `
      <path d="${path}" fill="none" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${path} L ${x + w * 0.9} ${y + h * 0.82} L ${x + w * 0.1} ${y + h * 0.82} Z" fill="${palette.accent}" fill-opacity="0.14" stroke="none"/>`
  }
  const surfaceOpacity = ctx.light ? 0.9 : 0.72
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${palette.surface}" fill-opacity="${surfaceOpacity}" stroke="${ctx.muted}" stroke-opacity="0.3"/>
    ${art}
  `
}

function extractMetric(ctx: Ctx): string {
  for (const line of ctx.plan.content) {
    const match = line.match(/(R\$\s?[\d.,]+\s?[MK]?|[\d.,]+\s?(?:%|x|pts|M|K)|\+[\d.,]+)/)
    if (match) return match[1]
  }
  return pick(ctx.rng, ['—', '···'])
}

// ---------------------------------------------------------------- layouts

function layoutCover(ctx: Ctx): string {
  const { plan, pad } = ctx
  const title = textBlock(ctx, plan.title, {
    x: pad, y: 400, size: ctx.mods.reduceText ? 88 : 96, width: 1180, maxLines: 3,
    font: ctx.heading, lineHeight: ctx.mods.reduceText ? 100 : 108, spacing: -1,
  })
  const subtitleText = plan.subtitle || plan.objective
  const subtitle = ctx.mods.reduceText
    ? ''
    : textBlock(ctx, subtitleText, {
        x: pad, y: 420 + title.height, size: 30, width: 940, maxLines: 2, fill: ctx.muted,
      }).svg
  return `
    ${kicker(ctx, ctx.style.client || 'SquadHub', pad, 240)}
    <rect x="${pad}" y="268" width="72" height="5" rx="2.5" fill="${ctx.style.palette.accent}"/>
    ${title.svg}
    ${subtitle}
  `
}

function layoutTextImage(ctx: Ctx): string {
  const { plan, pad } = ctx
  const flip = ctx.mods.altComposition
  const textX = flip ? 880 : pad
  const panelX = flip ? pad : 880
  const title = textBlock(ctx, plan.title, {
    x: textX, y: 250, size: 54, width: 620, maxLines: 3, font: ctx.heading, lineHeight: 64,
  })
  return `
    ${kicker(ctx, shortLabel(plan.objective, 3), textX, 176)}
    ${title.svg}
    ${bullets(ctx, plan.content, textX, 300 + title.height, 600)}
    ${abstractPanel(ctx, panelX, 170, 620, 560)}
    ${pageFooter(ctx)}
  `
}

function layoutBigNumber(ctx: Ctx): string {
  const { plan, pad } = ctx
  const metric = extractMetric(ctx)
  const size = ctx.mods.emphasizeNumber ? 320 : 260
  const support = ctx.mods.emphasizeNumber ? plan.content.slice(0, 1) : plan.content.slice(0, 3)
  return `
    ${kicker(ctx, shortLabel(plan.objective, 4), pad, 176)}
    <text x="${pad - 8}" y="${540}" font-family="${ctx.numbers}" font-size="${size}" font-weight="700" fill="${ctx.style.palette.accent}" letter-spacing="-6">${escapeXml(metric)}</text>
    ${textBlock(ctx, plan.title, { x: pad, y: 640, size: 44, width: 820, maxLines: 2, font: ctx.heading, lineHeight: 54 }).svg}
    ${bullets(ctx, support, 1010, 320, 480, 24)}
    <line x1="960" y1="240" x2="960" y2="660" stroke="${ctx.muted}" stroke-opacity="0.3"/>
    ${pageFooter(ctx)}
  `
}

function layoutComparison(ctx: Ctx): string {
  const { plan, pad } = ctx
  const half = plan.content.length > 1 ? Math.ceil(plan.content.length / 2) : 1
  const left = plan.content.slice(0, half)
  const right = plan.content.slice(half)
  const r = Math.min(ctx.radius * 1.4, 32)
  const surfaceOpacity = ctx.light ? 0.95 : 0.55
  const panel = (x: number, label: string, items: string[], accent: boolean) => `
    <rect x="${x}" y="260" width="620" height="470" rx="${r}" fill="${ctx.style.palette.surface}" fill-opacity="${accent ? surfaceOpacity : surfaceOpacity * 0.7}" stroke="${accent ? ctx.style.palette.accent : ctx.muted}" stroke-opacity="${accent ? 0.8 : 0.3}" stroke-width="${accent ? 2 : 1}"/>
    <text x="${x + 44}" y="${332}" font-family="${ctx.heading}" font-size="32" font-weight="${ctx.style.typography.headingWeight}" fill="${accent ? ctx.style.palette.accent : ctx.text}">${escapeXml(label)}</text>
    ${bullets(ctx, items.length ? items : ['—'], x + 44, 400, 540, 24)}
  `
  return `
    ${kicker(ctx, 'Comparativo', pad, 150)}
    ${textBlock(ctx, plan.title, { x: pad, y: 212, size: 48, width: 1360, maxLines: 1, font: ctx.heading }).svg}
    ${panel(pad, 'Cenário atual', left, false)}
    ${panel(860, 'Proposto', right, true)}
    <circle cx="800" cy="495" r="34" fill="${ctx.style.palette.background}" stroke="${ctx.style.palette.accent}" stroke-width="1.5"/>
    <text x="800" y="504" font-family="${ctx.body}" font-size="20" font-weight="700" fill="${ctx.style.palette.accent}" text-anchor="middle">VS</text>
    ${pageFooter(ctx)}
  `
}

function layoutProcess(ctx: Ctx): string {
  const { plan, pad } = ctx
  const steps = ctx.mods.reduceText ? plan.content.slice(0, 3) : plan.content.slice(0, 4)
  const count = Math.max(steps.length, 2)
  const w = (SLIDE_W - pad * 2 - (count - 1) * 40) / count
  const items = steps
    .map((step, i) => {
      const x = pad + i * (w + 40)
      return `
        <line x1="${x}" y1="330" x2="${x + w}" y2="330" stroke="${ctx.style.palette.accent}" stroke-opacity="${0.25 + (i / count) * 0.7}" stroke-width="3"/>
        <circle cx="${x + 10}" cy="330" r="10" fill="${ctx.style.palette.background}" stroke="${ctx.style.palette.accent}" stroke-width="3"/>
        <text x="${x}" y="416" font-family="${ctx.numbers}" font-size="58" font-weight="700" fill="${ctx.style.palette.accent}" fill-opacity="0.9">${String(i + 1).padStart(2, '0')}</text>
        ${textBlock(ctx, step, { x, y: 472, size: 24, width: w - 16, maxLines: 4, opacity: 0.92 }).svg}
      `
    })
    .join('')
  return `
    ${kicker(ctx, 'Como funciona', pad, 150)}
    ${textBlock(ctx, plan.title, { x: pad, y: 216, size: 50, width: 1360, maxLines: 1, font: ctx.heading }).svg}
    ${items}
    ${pageFooter(ctx)}
  `
}

function layoutTimeline(ctx: Ctx): string {
  const { plan, pad } = ctx
  const points = plan.content.slice(0, 4)
  const count = Math.max(points.length, 2)
  const y = 520
  const startX = pad + 40
  const endX = SLIDE_W - pad - 40
  const step = (endX - startX) / (count - 1)
  const marks = points
    .map((label, i) => {
      const x = startX + i * step
      const above = i % 2 === 0
      const block = textBlock(ctx, label, {
        x, y: above ? y - 120 : y + 96, size: 23, width: step * 0.86, maxLines: 3,
        anchor: 'start', opacity: 0.92,
      })
      return `
        <line x1="${x}" y1="${above ? y - 76 : y + 24}" x2="${x}" y2="${y}" stroke="${ctx.muted}" stroke-opacity="0.5" stroke-dasharray="2 6"/>
        <circle cx="${x}" cy="${y}" r="12" fill="${ctx.style.palette.background}" stroke="${ctx.style.palette.accent}" stroke-width="3.5"/>
        <text x="${x}" y="${above ? y + 52 : y - 34}" font-family="${ctx.body}" font-size="20" font-weight="700" fill="${ctx.style.palette.accent}" letter-spacing="2">FASE ${i + 1}</text>
        ${block.svg}
      `
    })
    .join('')
  return `
    ${kicker(ctx, 'Linha do tempo', pad, 150)}
    ${textBlock(ctx, plan.title, { x: pad, y: 216, size: 50, width: 1360, maxLines: 1, font: ctx.heading }).svg}
    <line x1="${startX - 30}" y1="${y}" x2="${endX + 30}" y2="${y}" stroke="${ctx.style.palette.accent}" stroke-opacity="0.55" stroke-width="3"/>
    ${marks}
    ${pageFooter(ctx)}
  `
}

function layoutConclusion(ctx: Ctx): string {
  const { plan } = ctx
  const items = ctx.mods.reduceText ? plan.content.slice(0, 2) : plan.content.slice(0, 3)
  const count = Math.max(items.length, 1)
  const w = (SLIDE_W - ctx.pad * 2 - (count - 1) * 48) / count
  const surfaceOpacity = ctx.light ? 0.92 : 0.66
  const cards = items
    .map((item, i) => {
      const x = ctx.pad + i * (w + 48)
      return `
        <rect x="${x}" y="470" width="${w}" height="240" rx="${Math.min(ctx.radius * 1.4, 28)}" fill="${ctx.style.palette.surface}" fill-opacity="${surfaceOpacity}" stroke="${ctx.muted}" stroke-opacity="0.3"/>
        <text x="${x + 36}" y="${546}" font-family="${ctx.numbers}" font-size="40" font-weight="700" fill="${ctx.style.palette.accent}">${String(i + 1).padStart(2, '0')}</text>
        ${textBlock(ctx, item, { x: x + 36, y: 596, size: 23, width: w - 72, maxLines: 3, opacity: 0.92 }).svg}
      `
    })
    .join('')
  return `
    ${kicker(ctx, 'Principais pontos', ctx.pad, 168, 'start')}
    ${textBlock(ctx, plan.title, { x: ctx.pad, y: 268, size: 66, width: 1380, maxLines: 2, font: ctx.heading, lineHeight: 78 }).svg}
    ${cards}
  `
}

function layoutCta(ctx: Ctx): string {
  const { plan } = ctx
  const mid = SLIDE_W / 2
  const title = textBlock(ctx, plan.title, {
    x: mid, y: 400, size: 84, width: 1240, maxLines: 2, font: ctx.heading,
    anchor: 'middle', lineHeight: 96, spacing: -1,
  })
  const support = ctx.mods.reduceText
    ? ''
    : textBlock(ctx, plan.content[0] ?? plan.objective, {
        x: mid, y: 428 + title.height, size: 28, width: 900, maxLines: 2, fill: ctx.muted, anchor: 'middle',
      }).svg
  const btnY = 470 + title.height + (ctx.mods.reduceText ? 0 : 90)
  const label = plan.content[1] ?? 'Vamos conversar'
  const btnW = Math.max(300, Math.min(560, label.length * 17 + 120))
  const btnText = ctx.light ? '#ffffff' : ctx.style.palette.background
  return `
    ${kicker(ctx, ctx.style.client || 'SquadHub', mid, 236, 'middle')}
    ${title.svg}
    ${support}
    <rect x="${mid - btnW / 2}" y="${btnY}" width="${btnW}" height="86" rx="${Math.min(ctx.radius * 2, 43)}" fill="${ctx.style.palette.accent}"/>
    <text x="${mid}" y="${btnY + 54}" font-family="${ctx.body}" font-size="28" font-weight="700" fill="${btnText}" text-anchor="middle">${escapeXml(label.slice(0, 40))}</text>
  `
}

const LAYOUTS: Record<SlideLayout, (ctx: Ctx) => string> = {
  cover: layoutCover,
  textImage: layoutTextImage,
  bigNumber: layoutBigNumber,
  comparison: layoutComparison,
  process: layoutProcess,
  timeline: layoutTimeline,
  conclusion: layoutConclusion,
  cta: layoutCta,
}

/**
 * Renderiza a composição 16:9 completa de um slide como SVG autocontido.
 * Nota: os logos oficiais NÃO fazem parte desta arte — são compostos como
 * camada exata pelo sistema (preview e exportação), nunca "gerados".
 */
export function renderSlideSvg(input: ArtworkInput): string {
  const mods = input.mods ?? {}
  const style = input.style
  const light = style.theme === 'light'
  const contrastBoost = mods.boostContrast || style.contrast === 'high'
  const text = contrastBoost ? (light ? '#0a0f1a' : '#ffffff') : style.palette.text
  const muted = contrastBoost ? style.palette.text : style.palette.muted
  const densityPad: Record<string, number> = {
    'very-clean': 150, clean: 140, balanced: 120, informative: 104, dense: 96,
  }
  const ctx: Ctx = {
    ...input,
    mods,
    rng: createRng(input.seed + hashString(input.plan.layout)),
    text,
    muted,
    heading: stack(style.typography.heading),
    body: stack(style.typography.body),
    numbers: stack(style.typography.numbers || style.typography.heading),
    radius: style.composition.cornerRadius,
    pad: densityPad[style.density] ?? 120,
    light,
  }
  const layout = LAYOUTS[input.plan.layout] ?? layoutTextImage
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_W}" height="${SLIDE_H}" viewBox="0 0 ${SLIDE_W} ${SLIDE_H}">${background(ctx)}${layout(ctx)}</svg>`
}

export type StylePreviewKind = 'cover' | 'process' | 'indicators' | 'conclusion'

const PREVIEW_PLANS: Record<StylePreviewKind, ArtworkInput['plan']> = {
  cover: {
    title: 'Título da apresentação',
    subtitle: 'Subtítulo de apoio com a mensagem central',
    objective: 'Abrir com impacto',
    content: ['Mensagem de apoio'],
    layout: 'cover',
    visualDirection: 'Capa demonstrativa',
  },
  process: {
    title: 'Como o processo funciona',
    subtitle: '',
    objective: 'Explicar etapas',
    content: ['Diagnóstico do cenário', 'Desenho da solução', 'Implantação em ondas', 'Operação e evolução'],
    layout: 'process',
    visualDirection: 'Etapas numeradas',
  },
  indicators: {
    title: 'Indicador central do período',
    subtitle: '',
    objective: 'Apresentar resultados',
    content: ['68% de evolução no trimestre', 'Meta do ciclo superada', 'Fonte: dados reais do projeto'],
    layout: 'bigNumber',
    visualDirection: 'Número em superdestaque',
  },
  conclusion: {
    title: 'O que levamos daqui',
    subtitle: '',
    objective: 'Consolidar mensagens',
    content: ['Primeira mensagem-chave', 'Segunda mensagem-chave', 'Terceira mensagem-chave'],
    layout: 'conclusion',
    visualDirection: 'Cartões numerados',
  },
}

/** Preview 16:9 de um estilo para um tipo de slide específico. */
export function renderStylePreview(style: DesignStyle, kind: StylePreviewKind): string {
  return renderSlideSvg({
    plan: PREVIEW_PLANS[kind],
    style,
    projectTitle: style.client || style.name,
    index: 0,
    total: 1,
    seed: hashString(style.id + kind + style.updatedAt),
  })
}

/** Miniatura 16:9 usada na biblioteca de estilos. */
export function renderStyleThumbnail(style: DesignStyle): string {
  return renderSlideSvg({
    plan: {
      ...PREVIEW_PLANS.cover,
      title: style.name,
      subtitle: style.description || style.visualDirection,
    },
    style,
    projectTitle: style.client || 'SquadHub',
    index: 0,
    total: 1,
    seed: hashString(style.id + style.updatedAt),
  })
}
