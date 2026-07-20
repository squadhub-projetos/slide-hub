import type { AttachmentForAi } from './attachments'
import type { BrandLogoRules, WebAssetPolicy } from './brands'

export type { AttachmentAsset, AttachmentForAi, AttachmentRole, AttachmentScope } from './attachments'
export type {
  AiCallRecord,
  AiCapabilities,
  AiMode,
  AiReadiness,
  AiStageModelCatalog,
  AiTestConfig,
  CreativeVersionMeta,
  GeneratedImageMetadata,
  GenerationSource,
  GenerationStage,
  LightPlan,
  LightPlanSlide,
  PlanProvenance,
  ReferenceInfluence,
  RenderStrategy,
  RevisionIntensity,
  TextOverlayElement,
  TextOverlaySpec,
} from './generation'
export { GENERATION_STAGE_LABELS, RENDER_STRATEGY_LABELS, REVISION_INTENSITY_LABELS } from './generation'
export type {
  AiRegionBehavior,
  LayerRole,
  LayerShapeStyle,
  LayerTextStyle,
  SlideTemplate,
  TemplateAiReference,
  TemplateBinding,
  TemplateLayer,
  TemplateLayerType,
  TemplateVersion,
} from './templates'
export type {
  AssetAlias,
  AssetResolution,
  AssetScope,
  LibraryAsset,
  LibraryAssetType,
  Snippet,
  SnippetMatch,
  SnippetParameter,
  SnippetParameterType,
} from './library'
export type {
  PendingSyncOperation,
  RecordEnvelope,
  RecordType,
  SupabaseAssetMetadata,
  SyncConflict,
  SyncStatus,
} from './sync'
export type {
  BrandDefinition,
  BrandLogoRules,
  CoBrandingMode,
  LogoPlacement,
  LogoVariant,
  OfficialAssetSuggestion,
  WebAssetPolicy,
} from './brands'

/** Proporção suportada pela apresentação. */
export type AspectRatio = '16:9'

export type MeetingType = 'checkpoint' | 'kickoff' | 'townhall' | 'proposal'
export type AudienceScope = 'internal' | 'external'

export type SlideLayout =
  | 'cover'
  | 'textImage'
  | 'bigNumber'
  | 'comparison'
  | 'process'
  | 'timeline'
  | 'conclusion'
  | 'cta'

export type SlideStatus =
  | 'pending'
  | 'generating'
  | 'awaiting'
  | 'revised'
  | 'approvedManual'
  | 'approvedAuto'
  | 'error'

export type ImageQualityPreset = 'draft' | 'high' | '4k'
export type VariationCount = 1 | 2 | 3

export type VersionOrigin = 'generation' | 'revision' | 'mask-edit' | 'duplicate' | 'migrated'

export interface SlideVersion {
  id: string
  label: string
  /** Arte vetorial (renderer estruturado). */
  svg?: string
  /** Imagem rasterizada final; persistida no repositório de blobs local. */
  imageDataUrl?: string
  /** Chave do blob no IndexedDB quando a imagem sai do localStorage. */
  imageStorageKey?: string
  /** Visual bruto da IA (antes do overlay de textos) — base das revisões. */
  rawImageDataUrl?: string
  rawStorageKey?: string
  /** Rodada de geração — variações da mesma rodada compartilham o groupId. */
  groupId: string
  variationIndex: number
  prompt: string
  negativePrompt: string
  styleId: string | null
  model: string
  quality: string
  resolution: string
  attachmentIds: string[]
  maskUsed: boolean
  origin: VersionOrigin
  /** Estratégia usada nesta versão. */
  strategy?: import('./generation').RenderStrategy
  /** Origem real do arquivo (openai | renderer | mock). */
  fileSource?: import('./generation').GenerationSource
  templateId?: string | null
  snippetIds?: string[]
  /** Metadados completos da geração/edição real. */
  generation?: import('./generation').GeneratedImageMetadata
  /** Diagnóstico criativo: arquétipo, referências, influência e overlay. */
  creative?: import('./generation').CreativeVersionMeta
  /** true quando uma edição não produziu alteração visual detectável (hash igual). */
  unchangedFromSource?: boolean
  revisionNote?: string
  createdAt: string
  exportedAt?: string
}

export interface PlannedSlide {
  id: string
  order: number
  title: string
  subtitle: string
  objective: string
  keyMessage: string
  content: string[]
  evidence: string[]
  speakerIntent: string
  layout: SlideLayout
  visualDirection: string
  brandInstructions: string
  attachmentIds: string[]
  productionPrompt: string
  negativePrompt: string
  /** Estratégia de renderização deste slide (recomendada pela IA, editável). */
  renderStrategy?: import('./generation').RenderStrategy
  /** Template escolhido ('auto' = recomendação; null = sem template). */
  templateId?: string | null
  recommendedTemplateKind?: string
  snippetIds?: string[]
  editedManually?: boolean
}

export interface Slide {
  id: string
  plan: PlannedSlide
  status: SlideStatus
  versions: SlideVersion[]
  currentVersionId: string | null
  /** Rodada ativa: usada para saber quando todas as variações ficaram prontas. */
  activeGroupId: string | null
  requestedVariations: number
  error?: string
}

export interface DeckInsights {
  understanding: string
  centralMessage: string
  keyInsights: string[]
  decisionsToProvoke: string[]
  inferred: string[]
  assumptions: string[]
  missingInformation: string[]
  communicationRisks: string[]
  narrativeSuggestion: string
  /** O que o usuário informou DIRETAMENTE (sem inferência). Opcional p/ planos antigos. */
  statedFacts?: string[]
  audienceInterpretation?: string
  intent?: string
}

export interface DeckPlan {
  /**
   * Fala conversacional da IA exibida no chat (o que entendeu/inferiu/falta).
   * Opcional para compatibilidade com planos salvos antes deste campo.
   */
  assistantMessage?: string
  title: string
  subtitle: string
  meetingType: MeetingType
  audienceScope: AudienceScope
  audienceSegment: string
  objective: string
  executiveSummary: string
  centralMessage: string
  narrativeLogic: string
  insights: DeckInsights
  recommendedSlideCount: number
  attachmentsUsed: { attachmentId: string; usage: string }[]
  slides: PlannedSlide[]
  masterPrompt: string
  /** Até 3 perguntas quando faltar informação crítica. */
  clarifyingQuestions?: string[]
  /** Prova de origem do plano (IA real × simulação) — preenchida pelo provider. */
  provenance?: import('./generation').PlanProvenance
}

export interface PlannerConfig {
  meetingType: MeetingType
  audienceScope: AudienceScope
  audienceSegment: string
  objective: string
  customObjective: string
  slideCount: number
  tone: string
  language: 'pt-BR' | 'en-US'
  aspect: AspectRatio
  styleId: string | null
  variationsPerSlide: VariationCount
  imageQuality: ImageQualityPreset
  webAssetPolicy: WebAssetPolicy
  /** Estratégia padrão do projeto (cada slide pode divergir). */
  defaultStrategy: import('./generation').RenderStrategy
  /**
   * Modo "Criativo por IA": 'overlay' = IA gera o visual e a aplicação
   * aplica textos e logos (padrão); 'full' = IA gera o slide completo.
   */
  aiComposition: 'overlay' | 'full'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  plan?: DeckPlan
  attachmentIds?: string[]
  createdAt: string
}

export type ProjectPhase = 'setup' | 'working' | 'complete'

export interface DeckStats {
  manualApprovals: number
  autoApprovals: number
  revisions: number
  startedAt: string | null
  finishedAt: string | null
}

export interface DeckProject {
  id: string
  name: string
  fileName: string
  prompt: string
  slideCount: number
  styleId: string | null
  aspect: AspectRatio
  language: PlannerConfig['language']
  phase: ProjectPhase
  plan: DeckPlan | null
  slides: Slide[]
  currentSlideIndex: number
  plannerMessages: ChatMessage[]
  plannerConfig: PlannerConfig
  stats: DeckStats
  createdAt: string
  updatedAt: string
}

export interface StylePalette {
  background: string
  surface: string
  primary: string
  secondary: string
  accent: string
  text: string
  muted: string
}

export interface StyleTypography {
  heading: string
  body: string
  numbers: string
  headingWeight: number
  uppercaseTitles: boolean
  letterSpacing: number
  maxLevels: number
  scale: number
  alignment: 'left' | 'center'
}

export type StyleDensity = 'very-clean' | 'clean' | 'balanced' | 'informative' | 'dense'
export type StyleContrast = 'low' | 'medium' | 'high'
export type StyleTheme = 'dark' | 'light'

export type GradientKind = 'none' | 'linear' | 'radial' | 'mesh' | 'aurora' | 'diffuse'

export interface StyleGradient {
  kind: GradientKind
  /** Ângulo/direção em graus para gradientes lineares. */
  direction: number
  intensity: number
  colorCount: 2 | 3
  opacity: number
  focus: 'center' | 'top' | 'bottom' | 'corner'
  solidFallback: string
}

export type VisualLanguage =
  | 'photographic'
  | 'editorial'
  | 'corporate'
  | 'futuristic'
  | 'technical'
  | 'diagrammatic'
  | 'illustration'
  | '3d'
  | 'collage'
  | 'solid-shapes'
  | 'geometric'
  | 'organic'
  | 'minimalist'
  | 'cinematic'

export type ShapeLanguage =
  | 'straight'
  | 'rounded'
  | 'organic'
  | 'angular'
  | 'technical'
  | 'solid'
  | 'outlined'
  | 'asymmetric'

export type CreativityLevel = 'conservative' | 'balanced' | 'creative' | 'experimental'
export type StructuralPrecision = 'organic' | 'balanced' | 'solid' | 'technical'

export interface StyleComposition {
  visualLanguages: VisualLanguage[]
  dominantLanguage: VisualLanguage
  shapes: ShapeLanguage[]
  cornerRadius: number
  lineWeight: number
  fillLevel: number
  glow: number
  shadow: number
  transparency: number
  creativity: CreativityLevel
  structuralPrecision: StructuralPrecision
}

export type IconMode = 'none' | 'linear' | 'solid' | 'duotone' | 'technical' | 'illustrated'

export interface StyleIcons {
  mode: IconMode
  frequency: 'low' | 'medium' | 'high'
  size: 'small' | 'medium' | 'large'
  color: string
  allowGenerated: boolean
  preferLibrary: boolean
}

export type ImageTreatment =
  | 'full-bleed'
  | 'person-cutout'
  | 'framed-photo'
  | 'collage'
  | 'duotone'
  | 'monochrome'
  | 'background-removed'
  | 'shape-integrated'
  | 'software-screen'
  | 'device-mockup'
  | 'diagram'
  | 'texture'

export interface StyleImagery {
  treatments: ImageTreatment[]
  direction: string
}

export type TextureKind =
  | 'none'
  | 'grain'
  | 'paper'
  | 'noise'
  | 'grid'
  | 'dots'
  | 'tech-lines'
  | 'reflection'
  | 'glow'
  | 'depth'
  | 'soft-shadow'

export interface StyleTexture {
  kind: TextureKind
  intensity: number
}

export interface StyleTextRules {
  positivePrompt: string
  requiredElements: string
  forbiddenElements: string
  negativePrompt: string
  usageExamples: string
  whenNotToUse: string
  maxTextRules: string
  chartRules: string
  photoRules: string
  logoRules: string
}

export interface DesignStyle {
  id: string
  brandId: string | null
  name: string
  client: string
  description: string
  theme: StyleTheme
  palette: StylePalette
  typography: StyleTypography
  contrast: StyleContrast
  gradient: StyleGradient
  composition: StyleComposition
  icons: StyleIcons
  imagery: StyleImagery
  texture: StyleTexture
  density: StyleDensity
  visualDirection: string
  compositionRules: string
  keywords: string[]
  aiInstructions: string
  textRules: StyleTextRules
  logoRules: BrandLogoRules
  webAssetPolicy: WebAssetPolicy
  brandAssetIds: string[]
  /** Estilos do sistema são fixados no início e não podem ser excluídos/editados. */
  isSystem: boolean
  favorite: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface ExportOptions {
  fileName: string
  format: 'pptx' | 'zip'
}

// ------------------------------------------------------------------ IA

export interface PlanDeckRequest {
  brief: string
  config: PlannerConfig
  style: DesignStyle | null
  attachments: AttachmentForAi[]
  /** Turnos anteriores do chat (sem planos/anexos) — a IA usa a conversa toda. */
  history?: { role: 'user' | 'assistant'; text: string }[]
  /** Overrides do seletor "Modelo de IA — testes" (validados no servidor). */
  provider?: 'openai' | 'anthropic'
  model?: string
  executionMode?: 'fast' | 'balanced' | 'quality' | 'custom'
}

export interface ReplanSlideRequest {
  brief: string
  config: PlannerConfig
  style: DesignStyle | null
  plan: DeckPlan
  slideId: string
  instructions?: string
}

export interface GenerateSlideRequest {
  projectTitle: string
  projectKey: string
  slideKey: string
  masterPrompt: string
  slidePlan: PlannedSlide
  index: number
  total: number
  style: DesignStyle
  seed: number
  variations: number
  quality: ImageQualityPreset
  attachments: AttachmentForAi[]
  strategy: import('./generation').RenderStrategy
}

export interface ReviseSlideRequest extends GenerateSlideRequest {
  instructions: string
  previousImage: { svg?: string; dataUrl?: string }
  /** Hash SHA-256 da imagem de origem (detecção de saída idêntica). */
  sourceImageHash?: string
  /** PNG com canal alfa, mesmas dimensões da imagem — edição localizada. */
  maskDataUrl?: string
  editScope: 'masked-area' | 'full-slide'
  intensity: import('./generation').RevisionIntensity
}

export interface GeneratedImage {
  svg?: string
  dataUrl?: string
  metadata?: import('./generation').GeneratedImageMetadata
  /** true quando a edição não produziu alteração visual detectável. */
  unchangedFromSource?: boolean
}

export interface SlideResult {
  images: GeneratedImage[]
  model: string
  quality: string
  resolution: string
  fileSource: import('./generation').GenerationSource
}

/**
 * Contrato do provedor de IA. `MockAiProvider` implementa tudo localmente;
 * `ApiAiProvider` delega para endpoints internos (/api/*) no servidor,
 * onde a OPENAI_API_KEY vive — nunca no frontend.
 */
export interface AiProvider {
  planDeck(req: PlanDeckRequest): Promise<DeckPlan>
  replanSlide(req: ReplanSlideRequest): Promise<PlannedSlide>
  generateSlide(req: GenerateSlideRequest): Promise<SlideResult>
  reviseSlide(req: ReviseSlideRequest): Promise<SlideResult>
  searchOfficialAssets(
    brief: string,
    brands: string[],
  ): Promise<import('./brands').OfficialAssetSuggestion[]>
}
