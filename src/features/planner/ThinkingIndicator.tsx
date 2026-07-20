import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AI_MODE } from '../../services/ai'
import { useAiStatusStore } from '../../state/aiStatusStore'

/**
 * Indicador honesto de espera pela IA: mostra tempo real decorrido em
 * vez de fingir etapas granulares que o backend não expõe (planDeck é
 * uma única chamada request/response, sem streaming intermediário).
 * O tempo é o próprio sinal — mock resolve em ~1-2s, IA real demora
 * bem mais, o que já funciona como evidência do que está acontecendo.
 * Isolado num componente próprio para o tick de 300ms não re-renderizar
 * a tela de chat inteira.
 */
export function ThinkingIndicator() {
  const [elapsedMs, setElapsedMs] = useState(0)
  const planningStatus = useAiStatusStore((s) => s.planningStatus)

  useEffect(() => {
    const startedAt = Date.now()
    const interval = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 300)
    return () => window.clearInterval(interval)
  }, [])

  const seconds = (elapsedMs / 1000).toFixed(1)
  // Estado REAL do pipeline (planejamento → produção N/M) quando existe.
  const label = planningStatus ?? (AI_MODE === 'mock' ? 'Simulação local processando' : 'Consultando a IA')

  return (
    <div className="msg assistant" aria-live="polite">
      <div className="msg-avatar" aria-hidden="true">
        <Sparkles size={14} />
      </div>
      <div className="msg-bubble msg-typing" aria-label={`${label}, ${seconds} segundos decorridos`}>
        <i /><i /><i />
        <span className="msg-typing-elapsed">{label}</span>
        <span className="msg-typing-elapsed mono">{seconds}s</span>
      </div>
    </div>
  )
}
