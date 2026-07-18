/** Papel que um anexo cumpre na apresentação. */
export type AttachmentRole =
  | 'logo'
  | 'photo'
  | 'person'
  | 'product'
  | 'software'
  | 'chart'
  | 'diagram'
  | 'screenshot'
  | 'visual-reference'
  | 'required-content'
  | 'support-document'
  | 'texture'
  | 'do-not-use'

/** Onde o anexo pode ser utilizado. */
export type AttachmentScope = 'deck' | 'selected-slides' | 'planning-only' | 'visual-reference-only'

export type AttachmentProcessing = 'ready' | 'processing' | 'unsupported' | 'error'

export type AttachmentSource = 'upload' | 'paste' | 'drop' | 'web'

export interface AttachmentAsset {
  id: string
  /** Nome amigável definido pelo usuário. */
  name: string
  fileName: string
  mimeType: string
  role: AttachmentRole
  description: string
  /** Como o arquivo deve ser usado. */
  usage: string
  scope: AttachmentScope
  linkedSlideIds: string[]
  required: boolean
  referenceOnly: boolean
  allowCrop: boolean
  allowTransform: boolean
  mustAppearExactly: boolean
  source: AttachmentSource
  sourceUrl?: string
  /** Chave do blob no repositório (IndexedDB nesta versão). */
  storageKey: string
  /** Texto extraído (TXT/CSV). Nunca fingimos ter lido formatos não suportados. */
  textContent?: string
  processing: AttachmentProcessing
  processingNote?: string
  width?: number
  height?: number
  sizeBytes: number
  /** projectId ou styleId dono do anexo. */
  ownerId: string
  createdAt: string
  updatedAt: string
}

/** Forma enviada aos providers de IA (nunca inclui o blob inteiro sem necessidade). */
export interface AttachmentForAi {
  id: string
  name: string
  mimeType: string
  role: AttachmentRole
  description: string
  usage: string
  mustAppearExactly: boolean
  referenceOnly: boolean
  allowCrop: boolean
  /** Data URL apenas para imagens dentro do limite de tamanho. */
  imageDataUrl?: string
  textContent?: string
}
