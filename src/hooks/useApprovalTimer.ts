import { useEffect, useRef, useState } from 'react'
import { usePageVisibility } from './usePageVisibility'

export interface ApprovalTimerOptions {
  /** Duração total em segundos (90 por padrão; reduzível em dev). */
  duration: number
  /** O timer só corre quando ativo (preview pronto, aguardando decisão). */
  active: boolean
  /** Pausa externa (ex.: usuário escrevendo uma solicitação de alteração). */
  paused: boolean
  /** Mudança deste valor reinicia a contagem (novo slide ou nova versão). */
  resetKey: string
  onExpire: () => void
}

export interface ApprovalTimerState {
  remaining: number
  progress: number
  running: boolean
}

/**
 * Timer de aprovação automática: conta apenas com o preview pronto,
 * pausa quando a aba perde visibilidade ou o usuário está revisando,
 * e dispara onExpire exatamente uma vez ao chegar a zero.
 */
export function useApprovalTimer(options: ApprovalTimerOptions): ApprovalTimerState {
  const { duration, active, paused, resetKey, onExpire } = options
  const visible = usePageVisibility()
  const [remaining, setRemaining] = useState(duration)
  const expiredRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    expiredRef.current = false
    setRemaining(duration)
  }, [resetKey, duration])

  const running = active && !paused && visible && remaining > 0

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const interval = window.setInterval(() => {
      const now = performance.now()
      const delta = (now - last) / 1000
      last = now
      setRemaining((value) => {
        const next = Math.max(0, value - delta)
        if (next === 0 && !expiredRef.current) {
          expiredRef.current = true
          window.setTimeout(() => onExpireRef.current(), 0)
        }
        return next
      })
    }, 200)
    return () => window.clearInterval(interval)
  }, [running])

  return {
    remaining,
    progress: duration > 0 ? remaining / duration : 0,
    running,
  }
}
