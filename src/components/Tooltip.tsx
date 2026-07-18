import { cloneElement, isValidElement, useCallback, useId, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  /** Texto do tooltip — também vira o rótulo acessível se o filho não tiver aria-label. */
  label: string
  /** Elemento único (botão/ícone) que dispara o tooltip por hover ou foco. */
  children: ReactElement
  /** Lado preferido; inverte automaticamente se não houver espaço na viewport. */
  side?: 'top' | 'bottom'
}

const MARGIN = 8
const OFFSET = 8
const ESTIMATED_HEIGHT = 30
const SHOW_DELAY = 250

/**
 * Tooltip renderizado via portal em document.body, com detecção de
 * colisão real contra a viewport: abre no lado preferido e inverte
 * automaticamente quando falta espaço — o caso concreto que motivou
 * isto são os ícones do cabeçalho, colados ao topo da janela, cujo
 * balão "para cima" ficava cortado pela barra do navegador. Funciona
 * por hover e por foco de teclado; não depende de overflow do pai.
 */
export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'top' | 'bottom' } | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const showTimer = useRef<number | undefined>(undefined)
  const id = useId()

  const measure = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const fitsAbove = spaceAbove >= ESTIMATED_HEIGHT + OFFSET
    const fitsBelow = spaceBelow >= ESTIMATED_HEIGHT + OFFSET
    const placement: 'top' | 'bottom' =
      side === 'top' ? (fitsAbove ? 'top' : 'bottom') : fitsBelow ? 'bottom' : 'top'
    const top = placement === 'top' ? rect.top - OFFSET : rect.bottom + OFFSET
    const left = Math.min(Math.max(rect.left + rect.width / 2, MARGIN), window.innerWidth - MARGIN)
    setPos({ left, top, placement })
  }, [side])

  const show = useCallback(() => {
    window.clearTimeout(showTimer.current)
    showTimer.current = window.setTimeout(() => {
      measure()
      setVisible(true)
    }, SHOW_DELAY)
  }, [measure])

  const hide = useCallback(() => {
    window.clearTimeout(showTimer.current)
    setVisible(false)
  }, [])

  if (!isValidElement(children)) return children

  const child = children as ReactElement<Record<string, unknown>>
  const trigger = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
    },
    'aria-describedby': visible ? id : undefined,
    'aria-label': (child.props['aria-label'] as string | undefined) ?? label,
    onMouseEnter: (e: React.MouseEvent) => {
      ;(child.props.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e)
      show()
    },
    onMouseLeave: (e: React.MouseEvent) => {
      ;(child.props.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e)
      hide()
    },
    onFocus: (e: React.FocusEvent) => {
      ;(child.props.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e)
      show()
    },
    onBlur: (e: React.FocusEvent) => {
      ;(child.props.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e)
      hide()
    },
  })

  return (
    <>
      {trigger}
      {visible &&
        pos &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className={`tooltip-portal ${pos.placement}`}
            style={{ left: pos.left, top: pos.top }}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  )
}
