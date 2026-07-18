import { useCallback, useRef, useState } from 'react'

export interface MaskTools {
  tool: 'brush' | 'eraser'
  setTool: (tool: 'brush' | 'eraser') => void
  brushSize: number
  setBrushSize: (size: number) => void
  /** Cor visível da marcação (hex). Só orienta o usuário — a máscara exportada usa apenas o canal alfa. */
  color: string
  setColor: (color: string) => void
  canUndo: boolean
  canRedo: boolean
  hasMarks: boolean
  undo: () => void
  redo: () => void
  clear: () => void
  bindCanvas: (canvas: HTMLCanvasElement | null) => void
  pointerDown: (x: number, y: number) => void
  pointerMove: (x: number, y: number) => void
  pointerUp: () => void
  /**
   * Exporta a máscara PNG com canal alfa nas dimensões EXATAS pedidas
   * (mesmas da imagem original): área pintada = transparente (editar),
   * restante = opaco (preservar) — formato esperado pelo endpoint de edição.
   */
  exportMask: (width: number, height: number) => string | null
}

/** Vermelho como padrão: cor natural de marcação/revisão, com contraste em slides claros e escuros. */
export const DEFAULT_MASK_COLOR = '#ef4444'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full, 16)
  if (Number.isNaN(n) || full.length !== 6) return `rgba(239, 68, 68, ${alpha})`
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Lógica do pincel de edição localizada, desacoplada da apresentação. */
export function useImageMask(): MaskTools {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const historyRef = useRef<ImageData[]>([])
  const redoRef = useRef<ImageData[]>([])
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush')
  // Pincel fino por padrão (~7px na tela com o canvas de 1280 renderizado a ~900px).
  const [brushSize, setBrushSize] = useState(10)
  const [color, setColor] = useState(DEFAULT_MASK_COLOR)
  const [historyVersion, setHistoryVersion] = useState(0)

  const ctx = () => canvasRef.current?.getContext('2d', { willReadFrequently: true }) ?? null

  const snapshot = useCallback(() => {
    const context = ctx()
    const canvas = canvasRef.current
    if (!context || !canvas) return
    historyRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height))
    if (historyRef.current.length > 30) historyRef.current.shift()
    redoRef.current = []
    setHistoryVersion((v) => v + 1)
  }, [])

  const bindCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
    historyRef.current = []
    redoRef.current = []
    setHistoryVersion((v) => v + 1)
  }, [])

  const stroke = useCallback(
    (x: number, y: number, connect: boolean) => {
      const context = ctx()
      if (!context) return
      context.globalCompositeOperation = tool === 'brush' ? 'source-over' : 'destination-out'
      const paint = hexToRgba(color, 0.85)
      context.strokeStyle = paint
      context.fillStyle = paint
      context.lineWidth = brushSize
      context.lineCap = 'round'
      context.lineJoin = 'round'
      if (connect) {
        context.lineTo(x, y)
        context.stroke()
      } else {
        context.beginPath()
        context.arc(x, y, brushSize / 2, 0, Math.PI * 2)
        context.fill()
        context.beginPath()
        context.moveTo(x, y)
      }
    },
    [tool, brushSize, color],
  )

  const pointerDown = useCallback(
    (x: number, y: number) => {
      snapshot()
      drawingRef.current = true
      stroke(x, y, false)
    },
    [snapshot, stroke],
  )

  const pointerMove = useCallback(
    (x: number, y: number) => {
      if (!drawingRef.current) return
      stroke(x, y, true)
    },
    [stroke],
  )

  const pointerUp = useCallback(() => {
    drawingRef.current = false
    setHistoryVersion((v) => v + 1)
  }, [])

  const undo = useCallback(() => {
    const context = ctx()
    const canvas = canvasRef.current
    const previous = historyRef.current.pop()
    if (!context || !canvas || !previous) return
    redoRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height))
    context.putImageData(previous, 0, 0)
    setHistoryVersion((v) => v + 1)
  }, [])

  const redo = useCallback(() => {
    const context = ctx()
    const canvas = canvasRef.current
    const next = redoRef.current.pop()
    if (!context || !canvas || !next) return
    historyRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height))
    context.putImageData(next, 0, 0)
    setHistoryVersion((v) => v + 1)
  }, [])

  const clear = useCallback(() => {
    const context = ctx()
    const canvas = canvasRef.current
    if (!context || !canvas) return
    snapshot()
    context.clearRect(0, 0, canvas.width, canvas.height)
    setHistoryVersion((v) => v + 1)
  }, [snapshot])

  const hasMarks = (() => {
    void historyVersion
    const context = ctx()
    const canvas = canvasRef.current
    if (!context || !canvas) return false
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 3; i < data.length; i += 64) {
      if (data[i] > 0) return true
    }
    return false
  })()

  const exportMask = useCallback((width: number, height: number): string | null => {
    const canvas = canvasRef.current
    const context = ctx()
    if (!canvas || !context) return null

    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const outCtx = out.getContext('2d')
    if (!outCtx) return null

    // Fundo opaco (preservar tudo)...
    outCtx.fillStyle = '#ffffff'
    outCtx.fillRect(0, 0, width, height)
    // ...e a marcação vira transparência (área a editar), reescalada
    // do canvas de desenho para a resolução exata da imagem original.
    outCtx.globalCompositeOperation = 'destination-out'
    outCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height)
    return out.toDataURL('image/png')
  }, [])

  return {
    tool,
    setTool,
    brushSize,
    setBrushSize,
    color,
    setColor,
    canUndo: historyRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
    hasMarks,
    undo,
    redo,
    clear,
    bindCanvas,
    pointerDown,
    pointerMove,
    pointerUp,
    exportMask,
  }
}
