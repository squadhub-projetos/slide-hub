/** Estratégia de renderização de um slide. */
export type RenderStrategy = 'ai-generated' | 'template-guided' | 'structured'

export const RENDER_STRATEGY_LABELS: Record<RenderStrategy, string> = {
  'ai-generated': 'Criativo por IA',
  'template-guided': 'Híbrido (template + IA)',
  structured: 'Guiado por template',
}

/** Influência das referências visuais sobre a composição criativa. */
export type ReferenceInfluence = 'light' | 'moderate' | 'strong'

/**
 * Layout de textos decidido pela IA/compilador — posições normalizadas
 * (0..1), validadas contra safe areas, sobreposição e área do logo.
 * Substitui os slots rígidos do template no modo Criativo por IA.
 */
export interface TextOverlayElement {
  id: string
  type: 'title' | 'subtitle' | 'body' | 'label' | 'number' | 'footer'
  text: string
  x: number
  y: number
  width: number
  height: number
  alignment: 'left' | 'center' | 'right'
  emphasis?: 'normal' | 'medium' | 'strong'
  colorRole: 'auto' | 'accent' | 'muted'
  fontRole: 'heading' | 'body' | 'numbers'
  size: number
  maxLines?: number
}

export interface TextOverlaySpec {
  elements: TextOverlayElement[]
  /** Faixa de legibilidade opcional atrás dos textos (0..1). */
  scrim?: { y: number; height: number; opacity: number }
}

/** Metadados criativos de uma versão gerada (diagnóstico visual). */
export interface CreativeVersionMeta {
  compositionArchetype: string
  referenceIds: string[]
  referenceInfluence: ReferenceInfluence
  promptChars: number
  overlaySpec?: TextOverlaySpec
}

/** Origem real do arquivo de imagem de uma versão. */
export type GenerationSource = 'openai' | 'renderer' | 'mock'

/** Modo efetivo do provedor de IA no frontend. */
export type AiMode = 'real' | 'mock'

/** Estado da configuração do modo real, reportado pelo servidor. */
export type AiReadiness = 'ready' | 'missing-key' | 'unreachable' | 'checking'

export type RevisionIntensity = 'subtle' | 'moderate' | 'recreate'

export const REVISION_INTENSITY_LABELS: Record<RevisionIntensity, string> = {
  subtle: 'Ajuste sutil',
  moderate: 'Alteração moderada',
  recreate: 'Recriação visual',
}

/** Metadados registrados para toda geração/edição real de imagem. */
export interface GeneratedImageMetadata {
  provider: 'openai' | 'mock' | 'renderer'
  model: string
  requestId?: string
  generationId: string
  source: 'generation' | 'edit'
  promptHash: string
  sourceImageHash?: string
  outputHash: string
  mimeType: string
  width: number
  height: number
  quality: string
  storagePath?: string
  assetRecordKey?: string
  createdAt: string
  durationMs: number
}

/** Proveniência de um plano — prova de qual provedor/modelo o produziu. */
export interface PlanProvenance {
  provider: 'openai' | 'anthropic' | 'mock'
  model: string
  /** Modo de execução usado (fast/balanced/quality/custom). */
  executionMode?: string
  requestId?: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  schemaValid: boolean
  retried?: boolean
  createdAt: string
  /** Duração por etapa no servidor (sem conteúdo, sem segredos). */
  stages?: { validationMs?: number; modelMs?: number; totalMs?: number }
  promptChars?: number
  historyCount?: number
  attachmentsCount?: number
}

/** Registro de uma chamada de IA para o painel de diagnóstico (sem segredos). */
export interface AiCallRecord {
  id: string
  endpoint: string
  kind: 'real' | 'mock'
  model: string
  /** Provedor efetivo (openai/anthropic/local). */
  provider?: string
  /** Operação (planejamento, imagem, revisão…). */
  operation?: string
  executionMode?: string
  startedAt: string
  durationMs: number
  httpStatus?: number
  ok: boolean
  schemaValid?: boolean
  requestId?: string
  inputTokens?: number
  outputTokens?: number
  promptChars?: number
  attachmentsCount?: number
  retries?: number
  /** Origem da resposta: IA real, cache, simulação ou fallback. */
  origin?: 'real' | 'cache' | 'simulation' | 'fallback'
  error?: string
}

/** Configuração de testes do seletor "Modelo de IA — testes" — por etapa. */
export interface AiTestConfig {
  provider: 'auto' | 'openai' | 'anthropic'
  plannerModel: string | null
  /** Provedor da produção por slide (null = mesmo do planejamento). */
  slideProvider: 'auto' | 'openai' | 'anthropic' | null
  /** null = mesmo do planejamento. */
  slideModel: string | null
  chatModel: string | null
  revisionModel: string | null
  executionMode: 'fast' | 'balanced' | 'quality' | 'custom'
  visualStrategy: 'auto' | 'template-assets' | 'hybrid' | 'ai-creative' | 'none'
  /** Quanto as referências visuais influenciam a composição criativa. */
  referenceInfluence: ReferenceInfluence
  generateImagesOnlyWhenNeeded: boolean
  /** Produção paralela por slide (planner leve + N chamadas curtas). */
  parallelSlideProduction: boolean
  slideConcurrency: number
}

/** Modelos por etapa reportados pelo servidor. */
export interface AiStageModelCatalog {
  chat: string[]
  planning: string[]
  slideProduction: string[]
  revision: string[]
  imageGeneration: string[]
}

/** Capacidades reportadas pelo servidor (sem segredos). */
export interface AiCapabilities {
  providers: {
    id: 'openai' | 'anthropic'
    label: string
    available: boolean
    configured: boolean
    models: AiStageModelCatalog
    defaults: { chat: string | null; planning: string | null; slideProduction: string | null; revision: string | null }
    plannerModels: string[]
    slideModels: string[]
    defaultPlannerModel: string | null
    defaultSlideModel: string | null
  }[]
  defaults?: {
    provider: string
    executionMode: string
    imageModel: string | null
    slideConcurrency: number
    parallelSlideProduction: boolean
  }
  defaultProvider: 'auto' | 'openai' | 'anthropic'
  executionMode: string
  executionModes: string[]
  providerFallbackEnabled: boolean
  image: { provider: string; models: string[]; defaultModel: string | null }
  timeouts?: Record<string, number>
  concurrency?: { slides: number; images: number }
  diagnosticsEnabled: boolean
  benchmarkEnabled: boolean
  visualStrategies: string[]
}

/** Estrutura leve devolvida pelo planejamento em duas fases. */
export interface LightPlanSlide {
  order: number
  layout: string
  title: string
  message: string
  contentHints: string[]
  requiresImage: boolean
  assetIds: string[]
}

export interface LightPlan {
  assistantMessage: string
  title: string
  subtitle: string
  centralMessage: string
  narrative: string
  meetingType: string
  audienceScope: string
  audienceSegment: string
  objective: string
  understanding: string
  inferred: string[]
  missingInformation: string[]
  slides: LightPlanSlide[]
  clarifyingQuestions: string[]
}

/** Etapas reais do processo de geração (nunca progresso por timeout). */
export type GenerationStage =
  | 'idle'
  | 'preparing'
  | 'resolving-template'
  | 'resolving-assets'
  | 'building-prompt'
  | 'calling-ai'
  | 'receiving'
  | 'compositing'
  | 'storing'
  | 'finalizing'

export const GENERATION_STAGE_LABELS: Record<GenerationStage, string> = {
  idle: '',
  preparing: 'Preparando briefing…',
  'resolving-template': 'Resolvendo template…',
  'resolving-assets': 'Resolvendo ativos…',
  'building-prompt': 'Criando prompt visual…',
  'calling-ai': 'Enviando para a IA…',
  receiving: 'Recebendo imagem…',
  compositing: 'Aplicando textos e logos…',
  storing: 'Armazenando…',
  finalizing: 'Finalizando preview…',
}
