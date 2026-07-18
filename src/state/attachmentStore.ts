import { create } from 'zustand'
import { deleteAttachmentBlob, getAttachmentBlob, ingestFile, MAX_ATTACHMENTS_PER_OWNER } from '../services/attachments/attachmentService'
import { attachmentRepository } from '../services/storage/repositories'
import type { AttachmentAsset, AttachmentSource } from '../types/attachments'
import { useUiStore } from './uiStore'

// Object URLs vivem fora do estado reativo e são revogados na remoção.
const objectUrls = new Map<string, string>()

export async function getAttachmentPreviewUrl(attachment: AttachmentAsset): Promise<string | null> {
  const existing = objectUrls.get(attachment.id)
  if (existing) return existing
  const blob = await getAttachmentBlob(attachment)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  objectUrls.set(attachment.id, url)
  return url
}

function revokePreview(id: string) {
  const url = objectUrls.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrls.delete(id)
  }
}

let saveTimer: number | undefined

function persist(attachments: AttachmentAsset[]) {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    void attachmentRepository.save(attachments)
  }, 300)
}

interface AttachmentState {
  attachments: AttachmentAsset[]
  hydrated: boolean
  hydrate: () => Promise<void>
  addFiles: (files: File[], ownerId: string, source: AttachmentSource) => Promise<AttachmentAsset[]>
  update: (id: string, patch: Partial<AttachmentAsset>) => void
  remove: (id: string) => Promise<void>
  byOwner: (ownerId: string) => AttachmentAsset[]
  byIds: (ids: string[]) => AttachmentAsset[]
}

export const useAttachmentStore = create<AttachmentState>((set, get) => ({
  attachments: [],
  hydrated: false,

  hydrate: async () => {
    const stored = await attachmentRepository.load()
    set({ attachments: stored ?? [], hydrated: true })
  },

  addFiles: async (files, ownerId, source) => {
    const toast = useUiStore.getState().toast
    const current = get().attachments.filter((a) => a.ownerId === ownerId)
    const budget = MAX_ATTACHMENTS_PER_OWNER - current.length
    if (budget <= 0) {
      toast('error', 'Limite de anexos atingido', `Máximo de ${MAX_ATTACHMENTS_PER_OWNER} anexos por projeto.`)
      return []
    }
    const accepted = files.slice(0, budget)
    if (accepted.length < files.length) {
      toast('info', 'Alguns arquivos ficaram de fora', 'O limite de anexos do projeto foi atingido.')
    }
    const ingested: AttachmentAsset[] = []
    for (const file of accepted) {
      try {
        ingested.push(await ingestFile(file, ownerId, source))
      } catch (error) {
        toast('error', 'Anexo recusado', error instanceof Error ? error.message : file.name)
      }
    }
    if (ingested.length > 0) {
      set((s) => {
        const next = [...s.attachments, ...ingested]
        persist(next)
        return { attachments: next }
      })
      const unsupported = ingested.filter((a) => a.processing === 'unsupported')
      if (unsupported.length > 0) {
        toast(
          'info',
          'Anexo guardado sem análise',
          unsupported.map((a) => `${a.fileName}: ${a.processingNote}`).join(' '),
        )
      }
    }
    return ingested
  },

  update: (id, patch) => {
    set((s) => {
      const next = s.attachments.map((a) =>
        a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a,
      )
      persist(next)
      return { attachments: next }
    })
  },

  remove: async (id) => {
    const attachment = get().attachments.find((a) => a.id === id)
    revokePreview(id)
    set((s) => {
      const next = s.attachments.filter((a) => a.id !== id)
      persist(next)
      return { attachments: next }
    })
    if (attachment) await deleteAttachmentBlob(attachment)
  },

  byOwner: (ownerId) => get().attachments.filter((a) => a.ownerId === ownerId),
  byIds: (ids) => get().attachments.filter((a) => ids.includes(a.id)),
}))
