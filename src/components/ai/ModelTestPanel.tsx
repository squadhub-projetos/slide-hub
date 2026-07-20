import { CheckCircle2, FlaskConical, GitCompareArrows, Loader2, RotateCcw, Send, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toAttachmentsForAi } from '../../services/attachments/attachmentService'
import { recordAiCall } from '../../state/aiDiagnosticsStore'
import { useAiTestConfigStore } from '../../state/aiTestConfigStore'
import { useAttachmentStore } from '../../state/attachmentStore'
import { useProjectStore } from '../../state/projectStore'
import { useStyleStore } from '../../state/styleStore'
import { useUiStore } from '../../state/uiStore'
import type { AiTestConfig, DeckPlan, PlanProvenance } from '../../types'
import { uid } from '../../utils/id'

const MODE_LABELS: Record<AiTestConfig['executionMode'], string> = {
  fast: 'Rápido',
  balanced: 'Equilibrado',
  quality: 'Qualidade',
  custom: 'Personalizado',
}

const VISUAL_LABELS: Record<AiTestConfig['visualStrategy'], string> = {
  auto: 'Automática',
  'template-assets': 'Template e ativos',
  hybrid: 'Híbrida',
  'ai-creative': 'Criativa por IA',
  none: 'Sem geração de imagem',
}

interface BenchResult {
  key: string
  provider: string
  model: string
  ok: boolean
  durationMs: number
  plan?: DeckPlan
  meta?: PlanProvenance
  error?: string
}

type TestState = { state: 'idle' } | { state: 'testing' } | { state: 'ok'; ms: number } | { state: 'fail'; reason: string }

/**
 * "Modelo de IA — testes": seleção POR ETAPA (planejamento, slides,
 * revisão), teste de disponibilidade de modelo, comparação lado a lado e
 * restauração da configuração recomendada. Modelos vêm do servidor
 * (/api/ai/capabilities); nada aqui vê ou transporta chaves.
 */
export function ModelTestPanel() {
  const config = useAiTestConfigStore((s) => s.config)
  const capabilities = useAiTestConfigStore((s) => s.capabilities)
  const patch = useAiTestConfigStore((s) => s.patch)
  const reset = useAiTestConfigStore((s) => s.reset)
  const loadCapabilities = useAiTestConfigStore((s) => s.loadCapabilities)
  const toast = useUiStore((s) => s.toast)

  const [compareOpen, setCompareOpen] = useState(false)
  const [briefText, setBriefText] = useState('')
  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<BenchResult[]>([])
  const [testState, setTestState] = useState<TestState>({ state: 'idle' })

  useEffect(() => {
    if (!capabilities) void loadCapabilities()
  }, [capabilities, loadCapabilities])

  useEffect(() => {
    if (briefText) return
    const messages = useProjectStore.getState().project?.plannerMessages ?? []
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) setBriefText(lastUser.text)
  }, [compareOpen, briefText])

  const plannerProvider = capabilities?.providers.find((p) => p.id === config.provider)
  const slideProviderId = config.slideProvider && config.slideProvider !== 'auto' ? config.slideProvider : config.provider
  const slideProviderCat = capabilities?.providers.find((p) => p.id === slideProviderId)

  const benchOptions = useMemo(
    () =>
      (capabilities?.providers ?? [])
        .filter((p) => p.configured)
        .flatMap((p) => p.models.planning.map((m) => ({ key: `${p.id}:${m}`, label: `${p.label} · ${m}` }))),
    [capabilities],
  )

  /** Valida disponibilidade do modelo de planejamento selecionado. */
  const testModel = async () => {
    const provider = config.provider === 'auto' ? 'openai' : config.provider
    const model = config.plannerModel ?? plannerProvider?.defaults.planning
    if (!model) return
    setTestState({ state: 'testing' })
    try {
      const response = await fetch('/api/ai/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      })
      const payload = (await response.json()) as { ok?: boolean; reason?: string; durationMs?: number; error?: string }
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
      setTestState(payload.ok ? { state: 'ok', ms: payload.durationMs ?? 0 } : { state: 'fail', reason: payload.reason ?? 'Modelo indisponível' })
    } catch (error) {
      setTestState({ state: 'fail', reason: error instanceof Error ? error.message.slice(0, 80) : 'falha' })
    }
  }

  const runOne = async (key: string): Promise<BenchResult> => {
    const [provider, model] = key.split(':')
    const project = useProjectStore.getState().project
    const style = useStyleStore.getState().getById(project?.plannerConfig.styleId ?? null) ?? useStyleStore.getState().getDefault()
    const owned = project ? useAttachmentStore.getState().byOwner(project.id) : []
    const attachments = await toAttachmentsForAi(owned.filter((a) => a.role !== 'do-not-use'))
    const startedAt = Date.now()
    try {
      const response = await fetch('/api/ai/plan-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: briefText,
          config: project?.plannerConfig ?? {},
          style,
          attachments,
          provider,
          model,
          mode: 'full',
          executionMode: config.executionMode === 'custom' ? 'fast' : config.executionMode,
        }),
      })
      const payload = (await response.json()) as { plan?: DeckPlan; meta?: PlanProvenance; error?: string }
      if (!response.ok || !payload.plan) throw new Error(payload.error ?? `HTTP ${response.status}`)
      recordAiCall({
        endpoint: '/ai/plan-deck (benchmark)',
        kind: 'real',
        provider,
        operation: 'benchmark',
        executionMode: payload.meta?.executionMode,
        model: payload.meta?.model ?? model,
        startedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        httpStatus: response.status,
        ok: true,
        schemaValid: payload.meta?.schemaValid,
        requestId: payload.meta?.requestId,
        inputTokens: payload.meta?.inputTokens,
        outputTokens: payload.meta?.outputTokens,
        origin: 'real',
      })
      return { key, provider, model, ok: true, durationMs: Date.now() - startedAt, plan: payload.plan, meta: payload.meta }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro inesperado'
      recordAiCall({
        endpoint: '/ai/plan-deck (benchmark)',
        kind: 'real',
        provider,
        operation: 'benchmark',
        model,
        startedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        ok: false,
        error: message.slice(0, 200),
        origin: 'real',
      })
      return { key, provider, model, ok: false, durationMs: Date.now() - startedAt, error: message }
    }
  }

  const runCompare = async () => {
    if (!modelA || running || !briefText.trim()) return
    setRunning(true)
    setResults([])
    const keys = [modelA, modelB].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i)
    const settled = await Promise.all(keys.map(runOne))
    setResults(settled)
    setRunning(false)
  }

  /** Aplicar um resultado NUNCA é automático — só neste clique. */
  const applyResult = (result: BenchResult) => {
    if (!result.plan) return
    if (!useProjectStore.getState().project) useProjectStore.getState().newProject()
    useProjectStore.getState().appendMessage({
      id: uid('msg'),
      role: 'assistant',
      text:
        result.plan.assistantMessage?.trim() ||
        `Plano do benchmark (${result.provider} · ${result.model}) aplicado à conversa.`,
      plan: { ...result.plan, provenance: result.meta },
      createdAt: new Date().toISOString(),
    })
    toast('success', 'Resultado aplicado', 'O plano entrou no chat da aba Planejar — revise e envie para gerar.')
  }

  if (!capabilities) {
    return <p className="text-muted" style={{ fontSize: 12.5 }}>Carregando catálogo de modelos…</p>
  }

  const stageSelect = (
    id: string,
    label: string,
    models: string[],
    value: string | null,
    defaultLabel: string,
    onChange: (v: string | null) => void,
    disabled = false,
  ) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="field-control"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{defaultLabel}</option>
        {models.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )

  return (
    <section className="model-test" aria-label="Modelo de IA — testes">
      <header className="model-test-head">
        <FlaskConical size={13} aria-hidden="true" />
        <strong>Modelo de IA — testes</strong>
        <span className="text-muted">modelos separados por etapa</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            reset()
            setTestState({ state: 'idle' })
          }}
        >
          <RotateCcw size={12} aria-hidden="true" /> Restaurar recomendado
        </button>
      </header>

      <div className="model-test-grid">
        <div className="field">
          <label htmlFor="mt-mode">Modo</label>
          <select
            id="mt-mode"
            className="field-control"
            value={config.executionMode}
            onChange={(e) => patch({ executionMode: e.target.value as AiTestConfig['executionMode'] })}
          >
            {(Object.keys(MODE_LABELS) as AiTestConfig['executionMode'][]).map((m) => (
              <option key={m} value={m}>{MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mt-provider">Provedor (planejamento)</label>
          <select
            id="mt-provider"
            className="field-control"
            value={config.provider}
            onChange={(e) => {
              patch({ provider: e.target.value as AiTestConfig['provider'] })
              setTestState({ state: 'idle' })
            }}
          >
            <option value="auto">Automático</option>
            {capabilities.providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured}>
                {p.label}{p.configured ? '' : ' (chave não configurada)'}
              </option>
            ))}
          </select>
        </div>
        {stageSelect(
          'mt-planner',
          'Modelo do planejamento',
          plannerProvider?.models.planning ?? [],
          config.plannerModel,
          config.provider === 'auto' ? 'Automático' : `Padrão (${plannerProvider?.defaults.planning ?? '—'})`,
          (v) => {
            patch({ plannerModel: v })
            setTestState({ state: 'idle' })
          },
          config.provider === 'auto',
        )}
        <div className="field">
          <label htmlFor="mt-slide-provider">Provedor (slides)</label>
          <select
            id="mt-slide-provider"
            className="field-control"
            value={config.slideProvider ?? ''}
            onChange={(e) => patch({ slideProvider: (e.target.value || null) as AiTestConfig['slideProvider'] })}
          >
            <option value="">Mesmo do planejamento</option>
            {capabilities.providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured}>{p.label}</option>
            ))}
          </select>
        </div>
        {stageSelect(
          'mt-slide',
          'Modelo dos slides',
          slideProviderCat?.models.slideProduction ?? [],
          config.slideModel,
          `Padrão (${slideProviderCat?.defaults.slideProduction ?? 'automático'})`,
          (v) => patch({ slideModel: v }),
        )}
        {stageSelect(
          'mt-revision',
          'Modelo de revisão',
          slideProviderCat?.models.revision ?? [],
          config.revisionModel,
          `Padrão (${slideProviderCat?.defaults.revision ?? 'automático'})`,
          (v) => patch({ revisionModel: v }),
        )}
        <div className="field">
          <label htmlFor="mt-visual">Estratégia visual</label>
          <select
            id="mt-visual"
            className="field-control"
            value={config.visualStrategy}
            onChange={(e) => patch({ visualStrategy: e.target.value as AiTestConfig['visualStrategy'] })}
          >
            {(Object.keys(VISUAL_LABELS) as AiTestConfig['visualStrategy'][]).map((v) => (
              <option key={v} value={v}>{VISUAL_LABELS[v]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mt-influence">Influência das referências</label>
          <select
            id="mt-influence"
            className="field-control"
            value={config.referenceInfluence}
            onChange={(e) => patch({ referenceInfluence: e.target.value as AiTestConfig['referenceInfluence'] })}
          >
            <option value="light">Leve — só atmosfera e paleta</option>
            <option value="moderate">Moderada — estrutura e ritmo (padrão)</option>
            <option value="strong">Forte — próxima da referência, sem copiar</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="mt-image-model">Modelo de imagem</label>
          <select id="mt-image-model" className="field-control" value={capabilities.image.defaultModel ?? ''} disabled>
            {capabilities.image.models.map((m) => (
              <option key={m} value={m}>{m} ({capabilities.image.provider})</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mt-concurrency">Concorrência dos slides</label>
          <select
            id="mt-concurrency"
            className="field-control"
            value={config.slideConcurrency}
            onChange={(e) => patch({ slideConcurrency: Number(e.target.value) })}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n} em paralelo</option>
            ))}
          </select>
        </div>
        <label className="model-test-check">
          <input
            type="checkbox"
            checked={config.parallelSlideProduction}
            onChange={(e) => patch({ parallelSlideProduction: e.target.checked })}
          />
          Produção paralela por slide (planejamento leve + slides em paralelo)
        </label>
        <label className="model-test-check">
          <input
            type="checkbox"
            checked={config.generateImagesOnlyWhenNeeded}
            onChange={(e) => patch({ generateImagesOnlyWhenNeeded: e.target.checked })}
          />
          Gerar imagens somente quando necessário
        </label>
      </div>

      <div className="model-test-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={config.provider === 'auto' || testState.state === 'testing'} onClick={() => void testModel()}>
          {testState.state === 'testing' ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
          Testar modelo
        </button>
        {testState.state === 'ok' && (
          <span className="model-test-ok"><CheckCircle2 size={12} aria-hidden="true" /> disponível ({testState.ms}ms)</span>
        )}
        {testState.state === 'fail' && (
          <span className="model-test-fail"><XCircle size={12} aria-hidden="true" /> {testState.reason}</span>
        )}
        {capabilities.benchmarkEnabled && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={compareOpen}
            onClick={() => setCompareOpen((v) => !v)}
          >
            <GitCompareArrows size={13} aria-hidden="true" /> Comparar modelos
          </button>
        )}
      </div>

      {capabilities.benchmarkEnabled && compareOpen && (
        <div className="model-test-bench-body">
          <textarea
            className="field-control"
            rows={2}
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            placeholder="Briefing usado na comparação…"
            aria-label="Briefing da comparação"
          />
          <div className="model-test-bench-row">
            <select className="field-control" value={modelA} onChange={(e) => setModelA(e.target.value)} aria-label="Modelo A">
              <option value="">Modelo A…</option>
              {benchOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <select className="field-control" value={modelB} onChange={(e) => setModelB(e.target.value)} aria-label="Modelo B">
              <option value="">Modelo B (opcional)…</option>
              {benchOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!modelA || running || !briefText.trim()}
              onClick={() => void runCompare()}
            >
              {running ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <GitCompareArrows size={13} aria-hidden="true" />}
              {running ? 'Executando…' : 'Executar teste'}
            </button>
          </div>

          {results.length > 0 && (
            <div className="model-test-results">
              {results.map((r) => (
                <div key={r.key} className={`model-test-result ${r.ok ? '' : 'error'}`}>
                  <div className="model-test-result-head">
                    <strong>{r.provider === 'anthropic' ? 'Claude' : 'OpenAI'} · {r.model}</strong>
                    <span className="mono">{(r.durationMs / 1000).toFixed(1)}s</span>
                  </div>
                  {r.ok && r.plan ? (
                    <>
                      <div className="model-test-result-meta mono">
                        ~{(r.meta?.inputTokens ?? 0)}/{(r.meta?.outputTokens ?? 0)} tokens
                        {r.meta?.retried ? ' · 1 retry' : ' · 0 retries'}
                        {' · '}anexos usados: {r.plan.attachmentsUsed?.length ?? 0}
                        {' · '}layouts: {[...new Set(r.plan.slides.map((s) => s.layout))].length}
                      </div>
                      <p className="model-test-result-title">{r.plan.title}</p>
                      <ol className="model-test-result-slides">
                        {r.plan.slides.slice(0, 10).map((s) => (
                          <li key={s.id}>{s.title} <span className="text-muted">({s.layout})</span></li>
                        ))}
                      </ol>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyResult(r)}>
                        <Send size={12} aria-hidden="true" /> Aplicar este resultado
                      </button>
                    </>
                  ) : (
                    <p className="model-test-result-error">{r.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
