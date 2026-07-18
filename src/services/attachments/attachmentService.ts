import type { AttachmentAsset, AttachmentForAi, AttachmentSource } from '../../types/attachments'
import { uid } from '../../utils/id'
import { blobStore, blobToDataUrl } from '../storage/blobStore'

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_OWNER = 20
/** Lado máximo enviado à IA — imagens maiores são reduzidas no cliente. */
const AI_IMAGE_MAX_SIDE = 1536

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'image/gif',
  'image/bmp',
])

const TEXT_TYPES = new Set(['text/plain', 'text/csv'])

const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const UNSUPPORTED_CONVERSION = new Set(['image/heic', 'image/heif'])

export function isImageAttachment(a: Pick<AttachmentAsset, 'mimeType'>): boolean {
  return IMAGE_TYPES.has(a.mimeType)
}

function inferMime(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    svg: 'image/svg+xml', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp',
    heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
    txt: 'text/plain', csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return map[ext] ?? 'application/octet-stream'
}

function readImageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

/**
 * Ingere um arquivo: valida, extrai o que é possível extrair de verdade,
 * grava o blob no IndexedDB e devolve os metadados. Formatos que não
 * conseguimos interpretar são marcados claramente como tal.
 */
export async function ingestFile(
  file: File,
  ownerId: string,
  source: AttachmentSource,
): Promise<AttachmentAsset> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`“${file.name}” excede o limite de ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB.`)
  }
  const mimeType = inferMime(file)
  const id = uid('att')
  const storageKey = `att:${id}`
  const now = new Date().toISOString()

  const base: AttachmentAsset = {
    id,
    name: file.name.replace(/\.[^.]+$/, ''),
    fileName: file.name,
    mimeType,
    role: IMAGE_TYPES.has(mimeType) ? 'visual-reference' : 'support-document',
    description: '',
    usage: '',
    scope: 'deck',
    linkedSlideIds: [],
    required: false,
    referenceOnly: false,
    allowCrop: true,
    allowTransform: true,
    mustAppearExactly: false,
    source,
    storageKey,
    processing: 'ready',
    sizeBytes: file.size,
    ownerId,
    createdAt: now,
    updatedAt: now,
  }

  if (UNSUPPORTED_CONVERSION.has(mimeType)) {
    base.processing = 'unsupported'
    base.processingNote =
      'HEIC/HEIF não é convertido nesta versão. Exporte como PNG ou JPEG e anexe novamente.'
  } else if (IMAGE_TYPES.has(mimeType)) {
    const size = await readImageSize(file)
    if (size) {
      base.width = size.width
      base.height = size.height
    }
    if (mimeType === 'image/gif') {
      base.processingNote = 'GIF: apenas o primeiro frame é considerado.'
    }
  } else if (TEXT_TYPES.has(mimeType)) {
    const text = await file.text()
    base.textContent = text.slice(0, 20_000)
    base.processingNote = text.length > 20_000 ? 'Texto truncado em 20 mil caracteres.' : undefined
  } else if (DOCUMENT_TYPES.has(mimeType)) {
    base.processing = 'unsupported'
    base.processingNote =
      'O conteúdo deste documento não é interpretado nesta versão — ele é guardado apenas como material de apoio.'
  } else {
    base.processing = 'unsupported'
    base.processingNote = 'Formato não interpretado. O arquivo fica guardado, mas não é analisado.'
  }

  await blobStore.put(storageKey, file)
  return base
}

export async function getAttachmentBlob(attachment: AttachmentAsset): Promise<Blob | null> {
  return blobStore.get(attachment.storageKey)
}

export async function deleteAttachmentBlob(attachment: AttachmentAsset): Promise<void> {
  await blobStore.remove(attachment.storageKey)
}

/** Reduz uma imagem para envio à IA (payload menor, sem perder o original). */
async function downscaleForAi(blob: Blob, mimeType: string): Promise<string> {
  const dataUrl = await blobToDataUrl(blob)
  if (mimeType === 'image/svg+xml') return dataUrl
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const largest = Math.max(image.naturalWidth, image.naturalHeight)
      if (largest <= AI_IMAGE_MAX_SIDE) {
        resolve(dataUrl)
        return
      }
      const scale = AI_IMAGE_MAX_SIDE / largest
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.naturalWidth * scale)
      canvas.height = Math.round(image.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

/** Converte anexos para a forma enviada aos providers de IA. */
export async function toAttachmentsForAi(attachments: AttachmentAsset[]): Promise<AttachmentForAi[]> {
  const result: AttachmentForAi[] = []
  for (const attachment of attachments) {
    if (attachment.role === 'do-not-use') continue
    const forAi: AttachmentForAi = {
      id: attachment.id,
      name: attachment.name || attachment.fileName,
      mimeType: attachment.mimeType,
      role: attachment.role,
      description: attachment.description,
      usage: attachment.usage,
      mustAppearExactly: attachment.mustAppearExactly,
      referenceOnly: attachment.referenceOnly,
      allowCrop: attachment.allowCrop,
      textContent: attachment.textContent,
    }
    if (isImageAttachment(attachment) && attachment.processing === 'ready') {
      const blob = await getAttachmentBlob(attachment)
      if (blob) forAi.imageDataUrl = await downscaleForAi(blob, attachment.mimeType)
    }
    result.push(forAi)
  }
  return result
}
