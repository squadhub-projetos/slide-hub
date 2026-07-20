import { HttpError } from './http'

/**
 * Catálogo central de provedores/modelos de IA — alimentado SOMENTE por
 * variáveis de ambiente. Nenhum ID de modelo é inventado no código; o
 * que não estiver configurado no ambiente não aparece nem pode ser usado.
 * Nunca exporta chaves para fora do servidor.
 *
 * Cada ETAPA do pipeline tem seus próprios modelos e timeout:
 * chat, planejamento, produção por slide, revisão e imagem — o modelo
 * mais avançado nunca é usado automaticamente para tudo.
 */

export type TextProviderId = 'openai' | 'anthropic'
export type ExecutionMode = 'fast' | 'balanced' | 'quality' | 'custom'
export type AiStage = 'chat' | 'planning' | 'slide-production' | 'revision' | 'image-generation'

export interface StageModels {
  chat: string[]
  planning: string[]
  slideProduction: string[]
  revision: string[]
}

export interface StageDefaults {
  chat: string | null
  planning: string | null
  slideProduction: string | null
  revision: string | null
}

export interface ProviderCatalog {
  id: TextProviderId
  /** Nome amigável exibido na interface. */
  label: string
  configured: boolean
  models: StageModels
  defaults: StageDefaults
  /** Compatibilidade com o seletor antigo (planner/slide). */
  plannerModels: string[]
  slideModels: string[]
  defaultPlannerModel: string | null
  defaultSlideModel: string | null
}

export interface AiCatalog {
  providers: ProviderCatalog[]
  defaultProvider: TextProviderId | 'auto'
  executionMode: ExecutionMode
  providerFallbackEnabled: boolean
  image: {
    provider: string
    models: string[]
    defaultModel: string | null
  }
  timeouts: {
    chatMs: number
    plannerMs: number
    slideMs: number
    revisionMs: number
    imageMs: number
    uploadMs: number
    /** Compatibilidade (operações antigas de texto). */
    textMs: number
  }
  maxRetries: number
  concurrency: {
    slides: number
    images: number
  }
  parallelSlideProduction: boolean
  diagnosticsEnabled: boolean
  benchmarkEnabled: boolean
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
}

/**
 * ANTHROPIC_API_KEY é o nome principal; CLAUDE_API_KEY é aceita como
 * fallback temporário de compatibilidade. O valor NUNCA sai do servidor.
 */
export function anthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || undefined
}

/** Listas por etapa com fallback em cascata (etapa → planner → legado). */
function stageLists(prefix: 'OPENAI' | 'ANTHROPIC', legacy: string[]): StageModels {
  const planner = list(process.env[`AI_${prefix}_PLANNER_MODELS`])
  const base = planner.length > 0 ? planner : legacy
  const chat = list(process.env[`AI_${prefix}_CHAT_MODELS`])
  const slide = list(process.env[`AI_${prefix}_SLIDE_MODELS`])
  const revision = list(process.env[`AI_${prefix}_REVISION_MODELS`])
  return {
    chat: chat.length > 0 ? chat : base,
    planning: base,
    slideProduction: slide.length > 0 ? slide : base,
    revision: revision.length > 0 ? revision : slide.length > 0 ? slide : base,
  }
}

function stageDefaults(prefix: 'OPENAI' | 'ANTHROPIC', models: StageModels): StageDefaults {
  return {
    chat: process.env[`AI_DEFAULT_${prefix}_CHAT_MODEL`] ?? models.chat[0] ?? null,
    planning: process.env[`AI_DEFAULT_${prefix}_PLANNER_MODEL`] ?? models.planning[0] ?? null,
    slideProduction: process.env[`AI_DEFAULT_${prefix}_SLIDE_MODEL`] ?? models.slideProduction[0] ?? null,
    revision: process.env[`AI_DEFAULT_${prefix}_REVISION_MODEL`] ?? models.revision[0] ?? null,
  }
}

export function readAiCatalog(): AiCatalog {
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY)
  const anthropicConfigured = Boolean(anthropicApiKey())

  // Compatibilidade: OPENAI_TEXT_MODEL segue valendo como default quando
  // as listas novas não estiverem definidas.
  const legacyOpenAi = [process.env.OPENAI_TEXT_MODEL ?? 'gpt-5.6']
  const openaiModels = stageLists('OPENAI', legacyOpenAi)
  const anthropicModels = stageLists('ANTHROPIC', [])
  const openaiDefaults = stageDefaults('OPENAI', openaiModels)
  const anthropicDefaults = stageDefaults('ANTHROPIC', anthropicModels)

  const providers: ProviderCatalog[] = [
    {
      id: 'openai',
      label: 'OpenAI',
      configured: openaiConfigured,
      models: openaiModels,
      defaults: openaiDefaults,
      plannerModels: openaiModels.planning,
      slideModels: openaiModels.slideProduction,
      defaultPlannerModel: openaiDefaults.planning,
      defaultSlideModel: openaiDefaults.slideProduction,
    },
    {
      id: 'anthropic',
      label: 'Claude',
      configured: anthropicConfigured,
      models: anthropicModels,
      defaults: anthropicDefaults,
      plannerModels: anthropicModels.planning,
      slideModels: anthropicModels.slideProduction,
      defaultPlannerModel: anthropicDefaults.planning,
      defaultSlideModel: anthropicDefaults.slideProduction,
    },
  ]

  const rawDefault = process.env.AI_DEFAULT_PROVIDER ?? process.env.AI_DEFAULT_TEXT_PROVIDER
  const defaultProvider: AiCatalog['defaultProvider'] =
    rawDefault === 'openai' || rawDefault === 'anthropic' ? rawDefault : 'auto'
  const rawMode = process.env.AI_EXECUTION_MODE ?? process.env.AI_DEFAULT_EXECUTION_MODE
  const executionMode: ExecutionMode =
    rawMode === 'balanced' || rawMode === 'quality' || rawMode === 'custom' ? rawMode : 'fast'

  const legacyText = int(process.env.AI_TEXT_TIMEOUT_MS, 120_000)

  return {
    providers,
    defaultProvider,
    executionMode,
    providerFallbackEnabled: process.env.AI_PROVIDER_FALLBACK_ENABLED === 'true',
    image: {
      provider: process.env.AI_IMAGE_PROVIDER ?? 'openai',
      models: list(process.env.AI_IMAGE_MODELS).length > 0
        ? list(process.env.AI_IMAGE_MODELS)
        : [process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2'],
      defaultModel: process.env.AI_DEFAULT_IMAGE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
    },
    timeouts: {
      chatMs: int(process.env.AI_CHAT_TIMEOUT_MS, 20_000),
      // O planejamento leve e a produção por slide são chamadas CURTAS —
      // não herdam o timeout de 2 minutos do plano monolítico antigo.
      plannerMs: int(process.env.AI_PLANNER_TIMEOUT_MS, 45_000),
      slideMs: int(process.env.AI_SLIDE_TIMEOUT_MS, 40_000),
      revisionMs: int(process.env.AI_REVISION_TIMEOUT_MS, 40_000),
      imageMs: int(process.env.AI_IMAGE_TIMEOUT_MS, 120_000),
      uploadMs: int(process.env.AI_UPLOAD_TIMEOUT_MS, 30_000),
      textMs: legacyText,
    },
    maxRetries: int(process.env.AI_MAX_RETRIES, 1),
    concurrency: {
      slides: int(process.env.AI_SLIDE_CONCURRENCY, 3),
      images: int(process.env.AI_IMAGE_CONCURRENCY, 1),
    },
    parallelSlideProduction: process.env.AI_PARALLEL_SLIDE_PRODUCTION !== 'false',
    diagnosticsEnabled: process.env.AI_DIAGNOSTICS_ENABLED !== 'false',
    benchmarkEnabled: process.env.AI_BENCHMARK_ENABLED !== 'false',
  }
}

function stageKey(stage: AiStage): keyof StageModels {
  switch (stage) {
    case 'chat': return 'chat'
    case 'planning': return 'planning'
    case 'slide-production': return 'slideProduction'
    case 'revision': return 'revision'
    default: return 'planning'
  }
}

export function stageTimeoutMs(catalog: AiCatalog, stage: AiStage): number {
  switch (stage) {
    case 'chat': return catalog.timeouts.chatMs
    case 'planning': return catalog.timeouts.plannerMs
    case 'slide-production': return catalog.timeouts.slideMs
    case 'revision': return catalog.timeouts.revisionMs
    case 'image-generation': return catalog.timeouts.imageMs
  }
}

/**
 * Roteador determinístico de modelo por etapa. provider 'auto' escolhe o
 * primeiro provedor CONFIGURADO (openai → anthropic); modelo pedido
 * precisa estar habilitado para a etapa (erro claro se não). Nunca
 * escolhe provedor sem chave e nunca decide aleatoriamente.
 */
export function resolveStageSelection(
  catalog: AiCatalog,
  stage: AiStage,
  requestedProvider?: string,
  requestedModel?: string,
): { provider: TextProviderId; model: string } {
  if (requestedProvider && requestedProvider !== 'auto' && requestedProvider !== 'openai' && requestedProvider !== 'anthropic') {
    throw new HttpError(400, `Provedor desconhecido: "${requestedProvider.slice(0, 24)}". Use openai, anthropic ou auto.`)
  }
  const wanted =
    requestedProvider === 'openai' || requestedProvider === 'anthropic'
      ? requestedProvider
      : catalog.defaultProvider
  const key = stageKey(stage)

  const pick = (id: TextProviderId): { provider: TextProviderId; model: string } | null => {
    const p = catalog.providers.find((x) => x.id === id)
    if (!p?.configured) return null
    if (requestedModel) {
      if (!p.models[key].includes(requestedModel)) return null
      return { provider: id, model: requestedModel }
    }
    const fallback = p.defaults[key]
    return fallback ? { provider: id, model: fallback } : null
  }

  if (wanted === 'openai' || wanted === 'anthropic') {
    const sel = pick(wanted)
    if (sel) return sel
    const p = catalog.providers.find((x) => x.id === wanted)
    if (!p?.configured) {
      throw new HttpError(
        503,
        wanted === 'openai' ? 'A chave da OpenAI não está configurada.' : 'A chave da Anthropic não está configurada.',
      )
    }
    throw new HttpError(400, `O modelo selecionado não está disponível para ${p.label} nesta etapa.`)
  }

  for (const id of ['openai', 'anthropic'] as const) {
    const sel = pick(id)
    if (sel) return sel
  }
  throw new HttpError(503, 'Nenhum provedor de IA está configurado (OPENAI_API_KEY ou ANTHROPIC_API_KEY).')
}

/** Compatibilidade com chamadas antigas (etapa de planejamento). */
export function resolvePlannerSelection(
  catalog: AiCatalog,
  requestedProvider?: string,
  requestedModel?: string,
): { provider: TextProviderId; model: string } {
  return resolveStageSelection(catalog, 'planning', requestedProvider, requestedModel)
}
