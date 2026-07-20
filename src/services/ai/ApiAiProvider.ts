import type {
  AiProvider,
  DeckPlan,
  GenerateSlideRequest,
  LightPlan,
  LightPlanSlide,
  OfficialAssetSuggestion,
  PlanDeckRequest,
  PlannedSlide,
  PlanProvenance,
  ReplanSlideRequest,
  ReviseSlideRequest,
  SlideResult,
} from '../../types'
import { recordAiCall } from '../../state/aiDiagnosticsStore'
import { plannerOverrides, slideOverrides, useAiTestConfigStore } from '../../state/aiTestConfigStore'
import { useAiStatusStore } from '../../state/aiStatusStore'
import { useUiStore } from '../../state/uiStore'
import { runWithConcurrency } from '../../utils/concurrency'
import { buildMasterPrompt } from './mockPlanner'

const REQUEST_TIMEOUT_MS = 180_000

interface PlanDeckResponse {
  plan: DeckPlan
  meta?: PlanProvenance
}

interface LightPlanResponse {
  plan: LightPlan
  meta?: PlanProvenance
}

interface SingleSlideResponse {
  plan: PlannedSlide
  meta?: PlanProvenance
}

/**
 * Provider real: fala apenas com endpoints internos (/api/*) hospedados
 * na Vercel. A chave de IA vive exclusivamente no servidor — este código
 * nunca vê nem transporta a chave. Erros reais aparecem como erros:
 * NUNCA há substituição silenciosa por mock.
 *
 * Planejamento em DUAS FASES (modos fast/balanced/custom):
 *  1. plan-light — estrutura e narrativa (chamada curta);
 *  2. slide-production — texto final de cada slide, em PARALELO com
 *     limite de concorrência; falha de um slide não derruba os demais.
 * O modo quality mantém o plano monolítico rico em uma chamada.
 */
export class ApiAiProvider implements AiProvider {
  private readonly baseUrl: string

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl
  }

  private async post<T>(path: string, body: unknown, diag?: { model?: string }): Promise<T> {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const startedAt = Date.now()
    const startedIso = new Date().toISOString()
    let httpStatus: number | undefined
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      httpStatus = response.status
      if (!response.ok) {
        let detail = ''
        try {
          const payload = (await response.json()) as { error?: string }
          detail = payload.error ?? ''
        } catch {
          detail = await response.text().catch(() => '')
        }
        const friendly =
          response.status === 503 ? detail || 'Chave da IA não configurada no servidor.'
          : response.status === 429 ? detail || 'Limite do provedor de IA atingido. Aguarde e tente novamente.'
          : response.status === 504 ? detail || 'A chamada excedeu o tempo limite.'
          : response.status === 401 || response.status === 403 ? detail || 'Falha de autenticação com o provedor de IA.'
          : detail
        throw new Error(`Falha na chamada ${path} (${response.status}). ${friendly}`.trim())
      }
      const parsed = (await response.json()) as T
      recordAiCall({
        endpoint: path,
        kind: 'real',
        model: diag?.model ?? 'servidor',
        startedAt: startedIso,
        durationMs: Date.now() - startedAt,
        httpStatus,
        ok: true,
      })
      return parsed
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? `A chamada ${path} excedeu o tempo limite (${REQUEST_TIMEOUT_MS / 1000}s).`
          : error instanceof TypeError
            ? `Sem conexão com ${path} — endpoint indisponível.`
            : error instanceof Error
              ? error.message
              : 'Erro inesperado.'
      recordAiCall({
        endpoint: path,
        kind: 'real',
        model: diag?.model ?? 'servidor',
        startedAt: startedIso,
        durationMs: Date.now() - startedAt,
        httpStatus,
        ok: false,
        error: message.slice(0, 200),
      })
      throw new Error(message)
    } finally {
      window.clearTimeout(timeout)
    }
  }

  private recordStage(meta: PlanProvenance | undefined, operation: string, fallbackModel: string) {
    if (!meta) return
    recordAiCall({
      endpoint: '/ai/plan-deck (modelo)',
      kind: 'real',
      provider: meta.provider,
      operation,
      executionMode: meta.executionMode,
      model: meta.model ?? fallbackModel,
      startedAt: meta.createdAt,
      durationMs: meta.durationMs,
      ok: true,
      schemaValid: meta.schemaValid,
      requestId: meta.requestId,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      promptChars: meta.promptChars,
      attachmentsCount: meta.attachmentsCount,
      retries: meta.retried ? 1 : 0,
      origin: 'real',
    })
  }

  async planDeck(req: PlanDeckRequest): Promise<DeckPlan> {
    const testCfg = useAiTestConfigStore.getState().config
    const overrides = plannerOverrides()
    const mode = req.executionMode ?? overrides.executionMode ?? 'fast'

    // Modo Qualidade (ou paralelismo desligado): plano monolítico rico.
    if (mode === 'quality' || !testCfg.parallelSlideProduction) {
      const { plan, meta } = await this.post<PlanDeckResponse>('/ai/plan-deck', { ...req, ...overrides, mode: 'full' })
      this.recordStage(meta, 'planejamento (completo)', 'planner')
      return { ...plan, provenance: meta }
    }

    /* -------- fase 1: planejamento leve -------- */
    const status = useAiStatusStore.getState().setPlanningStatus
    const totalStartedAt = Date.now()
    status('Interpretando o briefing…')
    let light: LightPlan
    let planMeta: PlanProvenance | undefined
    try {
      const response = await this.post<LightPlanResponse>('/ai/plan-deck', {
        ...req,
        ...overrides,
        mode: 'plan-light',
      })
      light = response.plan
      planMeta = response.meta
      this.recordStage(planMeta, 'planejamento (leve)', 'planner')
    } catch (error) {
      status(null)
      throw error
    }

    // Perguntas de esclarecimento: devolve sem produzir slides.
    if (light.slides.length === 0) {
      status(null)
      return this.assemblePlan(req, light, [], planMeta, Date.now() - totalStartedAt)
    }

    /* -------- fase 2: produção paralela por slide -------- */
    const total = light.slides.length
    let done = 0
    status(`Planejamento concluído — produzindo ${total} slides em paralelo…`)
    const deckSummary = [
      `Título: ${light.title}`,
      `Mensagem central: ${light.centralMessage}`,
      `Narrativa: ${light.narrative}`,
      `Público: ${light.audienceScope === 'internal' ? 'interno' : 'externo'} · ${light.audienceSegment} · Objetivo: ${light.objective}`,
      `Idioma: ${req.config.language} · Tom: ${req.config.tone}`,
    ].join('\n')
    // Contexto econômico por slide: metadados dos anexos SEM base64.
    const attachmentsMeta = req.attachments.map((a) => ({ ...a, imageDataUrl: undefined, textContent: a.textContent?.slice(0, 1200) }))
    const sOverrides = slideOverrides()
    const concurrency = Math.max(1, Math.min(4, testCfg.slideConcurrency))

    const results = await runWithConcurrency(light.slides, concurrency, async (stub, i) => {
      const adjacent = `anterior: ${light.slides[i - 1]?.title ?? '(início)'} | seguinte: ${light.slides[i + 1]?.title ?? '(fim)'}`
      const relevant = attachmentsMeta.filter((a) => stub.assetIds.includes(a.id))
      const attempt = () =>
        this.post<SingleSlideResponse>('/ai/plan-deck', {
          brief: req.brief.slice(0, 2000),
          config: req.config,
          style: req.style,
          attachments: relevant,
          mode: 'slide-production',
          deckSummary,
          slideStub: stub,
          adjacentSummaries: adjacent,
          ...sOverrides,
        })
      try {
        // Retry independente por slide (1x) — falha não derruba os demais.
        let response: SingleSlideResponse
        try {
          response = await attempt()
        } catch {
          response = await attempt()
        }
        this.recordStage(response.meta, `slide ${stub.order}`, 'slide')
        done += 1
        status(`Produzindo slides (${done}/${total})…`)
        return response.plan
      } catch (error) {
        done += 1
        status(`Produzindo slides (${done}/${total})…`)
        throw error
      }
    })

    status('Montando o plano…')
    const slides: PlannedSlide[] = results.map((r, i) =>
      r.status === 'fulfilled' ? { ...r.value, id: `slide-${i + 1}`, order: i + 1 } : stubToSlide(light.slides[i], i),
    )
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? i + 1 : null))
      .filter((n): n is number => n !== null)
    if (failed.length > 0) {
      useUiStore.getState().toast(
        'error',
        `Slide${failed.length > 1 ? 's' : ''} ${failed.join(', ')} com conteúdo provisório`,
        'A produção falhou nesses slides — os demais estão prontos. Use "Replanejar com IA" no slide para tentar novamente.',
      )
    }
    status(null)
    return this.assemblePlan(req, light, slides, planMeta, Date.now() - totalStartedAt)
  }

  /** Monta o DeckPlan final a partir do plano leve + slides produzidos. */
  private assemblePlan(
    req: PlanDeckRequest,
    light: LightPlan,
    slides: PlannedSlide[],
    planMeta: PlanProvenance | undefined,
    totalMs: number,
  ): DeckPlan {
    const meetingTypes = ['checkpoint', 'kickoff', 'townhall', 'proposal'] as const
    const meetingType = (meetingTypes as readonly string[]).includes(light.meetingType)
      ? (light.meetingType as DeckPlan['meetingType'])
      : req.config.meetingType
    const base: Omit<DeckPlan, 'masterPrompt'> = {
      assistantMessage: light.assistantMessage,
      title: light.title || 'Apresentação',
      subtitle: light.subtitle,
      meetingType,
      audienceScope: light.audienceScope === 'external' ? 'external' : 'internal',
      audienceSegment: light.audienceSegment || req.config.audienceSegment,
      objective: light.objective || req.config.objective,
      executiveSummary: light.narrative,
      centralMessage: light.centralMessage,
      narrativeLogic: light.narrative,
      insights: {
        understanding: light.understanding,
        centralMessage: light.centralMessage,
        keyInsights: [],
        decisionsToProvoke: [],
        inferred: light.inferred,
        assumptions: [],
        missingInformation: light.missingInformation,
        communicationRisks: [],
        narrativeSuggestion: light.narrative,
      },
      recommendedSlideCount: slides.length || light.slides.length,
      attachmentsUsed: slides.flatMap((s) => s.attachmentIds.map((attachmentId) => ({ attachmentId, usage: `Slide ${s.order}` }))),
      slides,
      clarifyingQuestions: light.clarifyingQuestions,
    }
    const provenance: PlanProvenance | undefined = planMeta
      ? { ...planMeta, durationMs: totalMs, stages: { ...planMeta.stages, totalMs } }
      : undefined
    return {
      ...base,
      masterPrompt: slides.length > 0 ? buildMasterPrompt(base, req.config, req.style, req.attachments) : '',
      provenance,
    }
  }

  async replanSlide(req: ReplanSlideRequest): Promise<PlannedSlide> {
    const { plan, meta } = await this.post<SingleSlideResponse>('/ai/plan-deck', {
      ...req,
      ...slideOverrides(),
      mode: 'single-slide',
    })
    this.recordStage(meta, 'replanejamento de slide', 'revision')
    return plan
  }

  generateSlide(req: GenerateSlideRequest): Promise<SlideResult> {
    return this.post<SlideResult>('/ai/generate-slide', req)
  }

  reviseSlide(req: ReviseSlideRequest): Promise<SlideResult> {
    return this.post<SlideResult>('/ai/revise-slide', req)
  }

  searchOfficialAssets(brief: string, brands: string[]): Promise<OfficialAssetSuggestion[]> {
    return this.post<{ suggestions: OfficialAssetSuggestion[] }>('/brands/search-official-assets', {
      brief,
      brands,
    }).then((r) => r.suggestions)
  }
}

/**
 * Slide provisório determinístico quando a produção daquele slide falhou:
 * honesto (marcado como editado manualmente, com aviso na interface) e
 * substituível pelo "Replanejar com IA" individual — nunca esconde a falha.
 */
function stubToSlide(stub: LightPlanSlide, index: number): PlannedSlide {
  const layouts = ['cover', 'textImage', 'bigNumber', 'comparison', 'process', 'timeline', 'conclusion', 'cta'] as const
  return {
    id: `slide-${index + 1}`,
    order: index + 1,
    title: stub.title,
    subtitle: '',
    objective: stub.message,
    keyMessage: stub.message,
    content: stub.contentHints.length > 0 ? stub.contentHints : [stub.message],
    evidence: [],
    speakerIntent: '',
    layout: (layouts as readonly string[]).includes(stub.layout) ? (stub.layout as PlannedSlide['layout']) : 'textImage',
    visualDirection: '',
    brandInstructions: '',
    attachmentIds: stub.assetIds,
    productionPrompt: `${stub.title}: ${stub.message}`,
    negativePrompt: '',
    editedManually: true,
  }
}
