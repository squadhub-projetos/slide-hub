import type { TemplateLayer } from './templates'

/** ------------------------------------------------------------------ Snippets */

export type SnippetParameterType =
  | 'text'
  | 'number'
  | 'asset'
  | 'asset-list'
  | 'color'
  | 'icon'
  | 'slide-reference'
  | 'boolean'
  | 'select'

export interface SnippetParameter {
  id: string
  name: string
  type: SnippetParameterType
  required: boolean
  defaultValue?: string | number | boolean
  /** Binding preenchido pelo planner quando possível (ex.: slide.next.title). */
  binding?: string
  options?: string[]
}

/** Conjunto reutilizável de camadas (frase de efeito, logos no canto, "A seguir"…). */
export interface Snippet {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  aliases: string[]
  brandId: string | null
  layers: TemplateLayer[]
  parameters: SnippetParameter[]
  usageRules: string
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

/** Resultado da resolução de um snippet citado em prompt/linguagem natural. */
export interface SnippetMatch {
  snippet: Snippet
  matchedText: string
  score: number
  explicit: boolean
}

/** ------------------------------------------------------------------ Ativos */

export type LibraryAssetType =
  | 'logo'
  | 'icon'
  | 'photo'
  | 'product'
  | 'person'
  | 'screenshot'
  | 'chart'
  | 'diagram'
  | 'illustration'
  | 'texture'
  | 'background'
  | 'decorative'
  | 'document-reference'

export type AssetScope = 'global' | 'brand' | 'project'

export type AssetAlias = string

export interface LibraryAsset {
  id: string
  name: string
  type: LibraryAssetType
  description: string
  aliases: AssetAlias[]
  tags: string[]
  brandId?: string
  scope: AssetScope
  /** Projeto dono quando scope === 'project'. */
  projectKey?: string
  /** Caminho no bucket privado (nunca URL assinada persistida). */
  storagePath?: string
  /** Chave do blob local (IndexedDB) enquanto não sincronizado. */
  localBlobKey?: string
  mimeType: string
  width?: number
  height?: number
  fileSize: number
  sha256: string
  source: 'upload' | 'web' | 'generated' | 'system'
  sourceUrl?: string
  attribution?: string
  exactUsage: boolean
  allowCrop: boolean
  allowColorChange: boolean
  backgroundVariants?: string[]
  preferredPlacement?: string
  archived?: boolean
  createdAt: string
  updatedAt: string
}

export interface AssetResolution {
  asset: LibraryAsset
  /** De onde veio a resolução, na ordem de prioridade documentada. */
  origin: 'slide' | 'project' | 'brand' | 'global' | 'official-search'
  matchedAlias: string
}
