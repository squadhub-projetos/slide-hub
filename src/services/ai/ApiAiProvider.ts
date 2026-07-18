import type {
  AiProvider,
  DeckPlan,
  GenerateSlideRequest,
  OfficialAssetSuggestion,
  PlanDeckRequest,
  PlannedSlide,
  PlanProvenance,
  ReplanSlideRequest,
  ReviseSlideRequest,
  SlideResult,
} from '../../types'
import { recordAiCall } from '../../state/aiDiagnosticsStore'

const REQUEST_TIMEOUT_MS = 180_000

interface PlanDeckResponse {
  plan: DeckPlan
  meta?: PlanProvenance
}

interface SingleSlideResponse {
  plan: PlannedSlide
  meta?: PlanProvenance
}

/**
 * Provider real: fala apenas com endpoints internos (/api/*) hospedados
 * na Vercel. A OPENAI_API_KEY vive exclusivamente no servidor — este
 * código nunca vê nem transporta a chave. Erros reais aparecem como
 * erros: NUNCA há substituição silenciosa por mock.
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
          : response.status === 429 ? 'Limite do provedor de IA atingido. Aguarde e tente novamente.'
          : response.status === 401 || response.status === 403 ? 'Falha de autenticação com o provedor de IA.'
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

  async planDeck(req: PlanDeckRequest): Promise<DeckPlan> {
    const { plan, meta } = await this.post<PlanDeckResponse>('/ai/plan-deck', req)
    if (meta) {
      recordAiCall({
        endpoint: '/ai/plan-deck (modelo)',
        kind: 'real',
        model: meta.model,
        startedAt: meta.createdAt,
        durationMs: meta.durationMs,
        ok: true,
        schemaValid: meta.schemaValid,
        requestId: meta.requestId,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
      })
    }
    return { ...plan, provenance: meta }
  }

  async replanSlide(req: ReplanSlideRequest): Promise<PlannedSlide> {
    const { plan, meta } = await this.post<SingleSlideResponse>('/ai/plan-deck', {
      ...req,
      mode: 'single-slide',
    })
    if (meta) {
      recordAiCall({
        endpoint: '/ai/plan-deck (replan)',
        kind: 'real',
        model: meta.model,
        startedAt: meta.createdAt,
        durationMs: meta.durationMs,
        ok: true,
        schemaValid: meta.schemaValid,
        requestId: meta.requestId,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
      })
    }
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
