import type { DesignStyle } from '../../types'
import { createRng } from '../../utils/random'

/**
 * Arte simulada do MODO SIMULAÇÃO — visualmente distinta a cada chamada
 * (seed + entropia real) e SEMPRE rotulada. Nunca se passa por saída
 * da OpenAI: quem consome registra fileSource: 'mock'.
 */

export function renderMockAiImage(options: {
  style: DesignStyle
  seed: number
  width?: number
  height?: number
  label?: boolean
}): string {
  const { style } = options
  const width = options.width ?? 1920
  const height = options.height ?? 1080
  // Entropia real além do seed: versões consecutivas nunca são idênticas.
  const rng = createRng(options.seed ^ (Math.floor(Math.random() * 0xffffff) + Date.now() % 100000))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível.')

  const palette = [style.palette.primary, style.palette.secondary, style.palette.accent]

  // Fundo em gradiente com ângulo aleatório
  const angle = rng() * Math.PI * 2
  const grad = ctx.createLinearGradient(
    width / 2 - Math.cos(angle) * width,
    height / 2 - Math.sin(angle) * height,
    width / 2 + Math.cos(angle) * width,
    height / 2 + Math.sin(angle) * height,
  )
  grad.addColorStop(0, style.palette.background)
  grad.addColorStop(1, style.palette.surface)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  // Blobs difusos
  for (let i = 0; i < 4 + Math.floor(rng() * 3); i++) {
    const x = rng() * width
    const y = rng() * height
    const r = (0.15 + rng() * 0.3) * width
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r)
    const color = palette[Math.floor(rng() * palette.length)]
    blob.addColorStop(0, `${color}${Math.floor(40 + rng() * 60).toString(16).padStart(2, '0')}`)
    blob.addColorStop(1, `${color}00`)
    ctx.fillStyle = blob
    ctx.fillRect(0, 0, width, height)
  }

  // Formas variadas (círculos, faixas, ondas)
  const kind = Math.floor(rng() * 3)
  ctx.globalAlpha = 0.5
  if (kind === 0) {
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      ctx.arc(rng() * width, rng() * height, (0.03 + rng() * 0.12) * width, 0, Math.PI * 2)
      ctx.strokeStyle = palette[i % 3]
      ctx.lineWidth = 2 + rng() * 6
      ctx.stroke()
    }
  } else if (kind === 1) {
    for (let i = 0; i < 5; i++) {
      ctx.save()
      ctx.translate(rng() * width, rng() * height)
      ctx.rotate(rng() * Math.PI)
      ctx.fillStyle = palette[i % 3]
      ctx.globalAlpha = 0.12 + rng() * 0.25
      ctx.fillRect(-width * 0.4, 0, width * 0.8, 20 + rng() * 90)
      ctx.restore()
    }
  } else {
    ctx.beginPath()
    ctx.moveTo(0, height * (0.5 + rng() * 0.3))
    for (let x = 0; x <= width; x += 40) {
      ctx.lineTo(x, height * 0.6 + Math.sin(x / (90 + rng() * 60) + rng() * 9) * height * 0.18)
    }
    ctx.lineTo(width, height)
    ctx.lineTo(0, height)
    ctx.closePath()
    ctx.fillStyle = palette[Math.floor(rng() * 3)]
    ctx.globalAlpha = 0.2
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Rótulo obrigatório de simulação
  if (options.label !== false) {
    const tag = 'SIMULAÇÃO'
    ctx.font = `600 ${Math.round(height * 0.022)}px 'Segoe UI', sans-serif`
    const w = ctx.measureText(tag).width + height * 0.03
    const h = height * 0.045
    const x = width - w - height * 0.025
    const y = height - h - height * 0.025
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 8)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.fillText(tag, x + height * 0.015, y + h / 2 + 1)
  }

  return canvas.toDataURL('image/png')
}
