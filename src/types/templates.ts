/** Tipos do sistema de templates de slide (layouts concretos, 16:9). */

export type TemplateLayerType =
  | 'text-placeholder'
  | 'image-placeholder'
  | 'icon-placeholder'
  | 'chart-placeholder'
  | 'table-placeholder'
  | 'shape'
  | 'line'
  | 'arrow'
  | 'logo'
  | 'asset'
  | 'ai-region'
  | 'group'

/** Papel semântico usado por bindings e pelo planner. */
export type LayerRole =
  | 'title'
  | 'subtitle'
  | 'body'
  | 'support'
  | 'metric-value'
  | 'metric-label'
  | 'quote'
  | 'kicker'
  | 'footer'
  | 'slide-number'
  | 'next-title'
  | 'card-title'
  | 'card-body'
  | 'decorative'
  | 'background'
  | 'none'

/**
 * Binding semântico resolvido na renderização.
 * Ex.: "slide.title", "slide.metric.value", "project.brand.logo",
 * "asset:n8n", "snippet:A seguir", "slide.next.title".
 */
export type TemplateBinding = string

export interface LayerTextStyle {
  fontRole: 'heading' | 'body' | 'numbers'
  size: number
  weight: number
  color: string | 'auto' | 'accent' | 'muted'
  align: 'left' | 'center' | 'right'
  uppercase: boolean
  lineHeight: number
  maxLines: number
  maxChars: number
  autoShrink: boolean
}

export interface LayerShapeStyle {
  fill: string | 'auto-surface' | 'auto-accent' | 'none'
  stroke: string | 'auto' | 'none'
  strokeWidth: number
  radius: number
  opacity: number
  shadow: boolean
}

export interface AiRegionBehavior {
  mode: 'generate' | 'use-attachment' | 'use-library'
  preserveComposition: boolean
  allowCrop: boolean
  creativity: 'conservative' | 'balanced' | 'creative' | 'experimental'
  localPrompt: string
  localNegativePrompt: string
}

export interface TemplateLayer {
  id: string
  type: TemplateLayerType
  name: string
  /** Coordenadas normalizadas 0..1 relativas ao slide 16:9. */
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  opacity: number
  visible: boolean
  locked: boolean
  groupId?: string
  role?: LayerRole
  binding?: TemplateBinding
  /** Texto fixo/placeholder semântico ("Título principal", "Frase de efeito"…). */
  placeholderLabel?: string
  text?: LayerTextStyle
  shape?: LayerShapeStyle
  generationBehavior?: AiRegionBehavior
  assetId?: string
  snippetId?: string
  /** Índice do item quando a camada representa um item de lista/card. */
  contentIndex?: number
}

export interface SlideTemplate {
  id: string
  name: string
  description: string
  styleId: string | null
  brandId: string | null
  /** Categoria semântica para recomendação (capa, indicadores, processo…). */
  kind: string
  keywords: string[]
  layers: TemplateLayer[]
  snippetIds: string[]
  isSystem: boolean
  /** Presente quando um template oficial recebeu override do usuário. */
  overriddenAt?: string
  previousVersions?: { savedAt: string; layers: TemplateLayer[] }[]
  createdAt: string
  updatedAt: string
}

export interface TemplateVersion {
  savedAt: string
  layers: TemplateLayer[]
}
