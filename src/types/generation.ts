/** Estratégia de renderização de um slide. */
export type RenderStrategy = 'ai-generated' | 'template-guided' | 'structured'

export const RENDER_STRATEGY_LABELS: Record<RenderStrategy, string> = {
  'ai-generated': 'Criativo por IA',
  'template-guided': 'Guiado por template',
  structured: 'Estruturado',
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
  provider: 'openai' | 'mock'
  model: string
  requestId?: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  schemaValid: boolean
  retried?: boolean
  createdAt: string
}

/** Registro de uma chamada de IA para o painel de diagnóstico (sem segredos). */
export interface AiCallRecord {
  id: string
  endpoint: string
  kind: 'real' | 'mock'
  model: string
  startedAt: string
  durationMs: number
  httpStatus?: number
  ok: boolean
  schemaValid?: boolean
  requestId?: string
  inputTokens?: number
  outputTokens?: number
  error?: string
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
