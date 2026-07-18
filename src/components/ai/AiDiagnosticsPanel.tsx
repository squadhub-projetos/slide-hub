import { AlertCircle, CheckCircle2, FlaskConical, Sparkles, Trash2 } from 'lucide-react'
import { Modal } from '../Modal'
import { useAiDiagnosticsStore } from '../../state/aiDiagnosticsStore'
import { AI_MODE } from '../../services/ai'
import { aiModeLabel, useAiStatusStore } from '../../state/aiStatusStore'

/**
 * Painel de diagnóstico — prova visível de que a IA foi realmente
 * chamada: endpoint, modelo, horário, duração, status HTTP, tokens
 * aproximados, origem (real/mock), erro e requestId.
 *
 * NUNCA exibe: chave de API, header Authorization, prompt completo ou
 * qualquer dado sensível — isso porque `aiDiagnosticsStore` nunca
 * recebe esses dados em primeiro lugar (ver ApiAiProvider.post()).
 */
export function AiDiagnosticsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const records = useAiDiagnosticsStore((s) => s.records)
  const clear = useAiDiagnosticsStore((s) => s.clear)
  const server = useAiStatusStore((s) => s.server)
  const readiness = useAiStatusStore((s) => s.readiness)
  const { label } = aiModeLabel(readiness)

  return (
    <Modal
      open={open}
      title="Diagnóstico da IA"
      onClose={onClose}
      width={720}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clear} disabled={records.length === 0}>
            <Trash2 size={13} aria-hidden="true" /> Limpar histórico
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      <div className="ai-diag">
        <div className="ai-diag-summary">
          <span className={`badge ${AI_MODE === 'mock' ? 'badge-warning' : 'badge-success'}`}>
            {AI_MODE === 'mock' ? <FlaskConical size={12} aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
            Modo ativo: {label}
          </span>
          {server && (
            <span className="text-muted">
              modelo de texto {server.textModel} · modelo de imagem {server.imageModel} · workspace {server.workspace}
            </span>
          )}
        </div>
        <p className="text-muted ai-diag-note">
          Nunca exibe chave, header de autorização ou prompt completo — apenas metadados da chamada.
        </p>

        {records.length === 0 ? (
          <p className="ai-diag-empty">
            Nenhuma chamada registrada ainda nesta sessão. Envie um briefing na aba Planejar ou gere um slide para
            ver o registro aqui.
          </p>
        ) : (
          <ul className="ai-diag-list">
            {records.map((r) => (
              <li key={r.id} className={`ai-diag-item ${r.ok ? 'ok' : 'error'}`}>
                <span className="ai-diag-icon">
                  {r.ok ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertCircle size={15} aria-hidden="true" />}
                </span>
                <div className="ai-diag-body">
                  <div className="ai-diag-line">
                    <strong>{r.endpoint}</strong>
                    <span className={`badge ${r.kind === 'mock' ? 'badge-warning' : 'badge-cyan'}`}>
                      {r.kind === 'mock' ? 'simulação' : 'real'}
                    </span>
                    {r.httpStatus !== undefined && <span className="mono ai-diag-status">HTTP {r.httpStatus}</span>}
                  </div>
                  <div className="ai-diag-meta mono">
                    {new Date(r.startedAt).toLocaleTimeString('pt-BR')} · {r.model} · {(r.durationMs / 1000).toFixed(2)}s
                    {r.schemaValid !== undefined && ` · schema ${r.schemaValid ? 'válido' : 'inválido'}`}
                    {(r.inputTokens || r.outputTokens) && ` · ~${(r.inputTokens ?? 0) + (r.outputTokens ?? 0)} tokens`}
                    {r.requestId && ` · id ${r.requestId.slice(0, 16)}…`}
                  </div>
                  {r.error && <div className="ai-diag-error">{r.error}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
