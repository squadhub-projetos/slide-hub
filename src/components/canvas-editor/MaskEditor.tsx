import { Brush, Eraser, Eye, EyeOff, Redo2, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Modal } from '../Modal'
import { DEFAULT_MASK_COLOR, useImageMask } from '../../hooks/useImageMask'

/** Resolução interna do canvas de marcação (reescalada na exportação). */
const DRAW_W = 1280
const DRAW_H = 720

/** Poucas cores com contraste sobre slides claros e escuros — vermelho primeiro. */
const MASK_COLORS = [DEFAULT_MASK_COLOR, '#22d3ee', '#fbbf24', '#ffffff']

interface MaskEditorProps {
  open: boolean
  imageSrc: string
  /** Dimensões reais da imagem que será enviada para edição. */
  imageWidth: number
  imageHeight: number
  onCancel: () => void
  onApply: (maskDataUrl: string) => void
}

/**
 * Edição localizada com pincel: o usuário pinta a região a alterar sobre
 * o slide; a máscara PNG (canal alfa) sai nas dimensões exatas da imagem.
 * A cor é só orientação visual — nunca entra no arquivo final.
 */
export function MaskEditor({ open, imageSrc, imageWidth, imageHeight, onCancel, onApply }: MaskEditorProps) {
  const mask = useImageMask()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [maskVisible, setMaskVisible] = useState(true)

  useEffect(() => {
    if (open && canvasRef.current) {
      const canvas = canvasRef.current
      canvas.width = DRAW_W
      canvas.height = DRAW_H
      mask.bindCanvas(canvas)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Cursor circular no tamanho REAL do traço na tela (canvas 1280 → ~"50%"
  // de escala típica), na cor escolhida — o usuário vê o que vai pintar.
  const cursor = useMemo(() => {
    const canvas = canvasRef.current
    const scale = canvas ? canvas.getBoundingClientRect().width / DRAW_W : 0.72
    const d = Math.max(6, Math.min(64, Math.round(mask.brushSize * scale)))
    const r = d / 2
    const stroke = mask.tool === 'eraser' ? '%23ffffff' : encodeURIComponent(mask.color)
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d + 2}' height='${d + 2}'><circle cx='${r + 1}' cy='${r + 1}' r='${r}' fill='none' stroke='${stroke}' stroke-width='1.5'/></svg>`
    return `url("data:image/svg+xml,${svg.replace(/#/g, '%23')}") ${r + 1} ${r + 1}, crosshair`
    // getBoundingClientRect é estável enquanto o modal está aberto.
  }, [mask.brushSize, mask.color, mask.tool])

  const toCanvasCoords = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * DRAW_W,
      y: ((event.clientY - rect.top) / rect.height) * DRAW_H,
    }
  }

  const apply = () => {
    const dataUrl = mask.exportMask(imageWidth, imageHeight)
    if (dataUrl) onApply(dataUrl)
  }

  return (
    <Modal
      open={open}
      title="Marcar área para editar"
      onClose={onCancel}
      width={980}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!mask.hasMarks} onClick={apply}>
            Aplicar seleção
          </button>
        </>
      }
    >
      <p className="mask-hint">
        A marcação orienta a área principal da alteração e <strong>não aparece no arquivo final</strong> —
        é apenas um guia para a IA. Elementos próximos também podem ser ajustados para manter a
        composição coerente.
      </p>

      <div className="mask-toolbar" role="toolbar" aria-label="Ferramentas de marcação">
        <button
          type="button"
          className={`btn btn-ghost btn-sm ${mask.tool === 'brush' ? 'active-tool' : ''}`}
          aria-pressed={mask.tool === 'brush'}
          onClick={() => mask.setTool('brush')}
        >
          <Brush size={14} aria-hidden="true" /> Pincel
        </button>
        <button
          type="button"
          className={`btn btn-ghost btn-sm ${mask.tool === 'eraser' ? 'active-tool' : ''}`}
          aria-pressed={mask.tool === 'eraser'}
          onClick={() => mask.setTool('eraser')}
        >
          <Eraser size={14} aria-hidden="true" /> Borracha
        </button>
        <label className="mask-size">
          Tamanho
          <input
            type="range"
            min={4}
            max={160}
            value={mask.brushSize}
            onChange={(e) => mask.setBrushSize(Number(e.target.value))}
            aria-label="Tamanho do pincel"
          />
          <span className="mono" style={{ fontSize: 11, minWidth: 26 }}>{mask.brushSize}px</span>
        </label>
        <div className="mask-colors" role="group" aria-label="Cor da marcação">
          {MASK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`mask-color ${mask.color === c ? 'on' : ''}`}
              style={{ background: c }}
              aria-label={`Cor ${c}`}
              aria-pressed={mask.color === c}
              onClick={() => mask.setColor(c)}
            />
          ))}
          <input
            type="color"
            value={mask.color}
            onChange={(e) => mask.setColor(e.target.value)}
            aria-label="Cor personalizada"
            className="mask-color-custom"
          />
        </div>
        <span className="spacer" style={{ flex: 1 }} />
        <button type="button" className="btn-icon" data-tip="Desfazer" aria-label="Desfazer" disabled={!mask.canUndo} onClick={mask.undo}>
          <Undo2 size={15} />
        </button>
        <button type="button" className="btn-icon" data-tip="Refazer" aria-label="Refazer" disabled={!mask.canRedo} onClick={mask.redo}>
          <Redo2 size={15} />
        </button>
        <button type="button" className="btn-icon" data-tip="Limpar" aria-label="Limpar marcação" onClick={mask.clear}>
          <Trash2 size={15} />
        </button>
        <button
          type="button"
          className="btn-icon"
          data-tip={maskVisible ? 'Ocultar máscara' : 'Mostrar máscara'}
          aria-label={maskVisible ? 'Ocultar máscara' : 'Mostrar máscara'}
          onClick={() => setMaskVisible((v) => !v)}
        >
          {maskVisible ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </div>

      <div className="mask-stage">
        <img src={imageSrc} alt="Slide em edição" draggable={false} />
        <canvas
          ref={canvasRef}
          style={{ opacity: maskVisible ? 1 : 0, cursor }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            const { x, y } = toCanvasCoords(e)
            mask.pointerDown(x, y)
          }}
          onPointerMove={(e) => {
            const { x, y } = toCanvasCoords(e)
            mask.pointerMove(x, y)
          }}
          onPointerUp={() => mask.pointerUp()}
          onPointerLeave={() => mask.pointerUp()}
          aria-label="Área de marcação sobre o slide"
        />
      </div>
    </Modal>
  )
}
