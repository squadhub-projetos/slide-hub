import { create } from 'zustand'
import type { AssetResolution, LibraryAsset } from '../types'
import { enqueueSync } from '../services/cloud/syncEngine'
import { blobStore } from '../services/storage/blobStore'
import { storage } from '../services/storage/localStorageAdapter'
import { getSignedUrl } from '../services/cloud/signedUrls'
import { sha256Hex } from '../utils/hash'
import { uid } from '../utils/id'
import { useUiStore } from './uiStore'

/**
 * Biblioteca organizacional de ativos reutilizáveis (logos, fotos, ícones…).
 * Metadados no localStorage/registro; binário no IndexedDB e no Storage.
 */

const KEY = 'library-assets'
const objectUrls = new Map<string, string>()

interface LibraryState {
  assets: LibraryAsset[]
  hydrated: boolean
  hydrate: () => Promise<void>
  addFromFile: (file: File, meta?: Partial<LibraryAsset>) => Promise<LibraryAsset | null>
  update: (id: string, patch: Partial<LibraryAsset>) => void
  archive: (id: string) => void
  remove: (id: string) => Promise<void>
  getById: (id: string | null | undefined) => LibraryAsset | null
  /** URL exibível: object URL local ou signed URL do bucket. */
  previewUrl: (asset: LibraryAsset) => Promise<string | null>
  resolveByAlias: (query: string, context: { projectKey?: string; brandId?: string | null; slideAssetIds?: string[] }) => AssetResolution | null
}

function persist(assets: LibraryAsset[]) {
  void storage.write(KEY, assets)
}

function sync(asset: LibraryAsset) {
  void enqueueSync({
    recordType: 'asset',
    recordKey: asset.id,
    projectKey: asset.scope === 'project' ? asset.projectKey : null,
    name: asset.name,
    payload: { ...asset, localBlobKey: undefined },
    status: asset.archived ? 'archived' : 'active',
    schemaVersion: 3,
    uploadBlobKey: asset.storagePath ? undefined : asset.localBlobKey,
  })
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

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  assets: [],
  hydrated: false,

  hydrate: async () => {
    const stored = await storage.read<LibraryAsset[]>(KEY)
    set({ assets: stored ?? [], hydrated: true })
  },

  addFromFile: async (file, meta = {}) => {
    if (file.size > 20 * 1024 * 1024) {
      useUiStore.getState().toast('error', 'Arquivo muito grande', 'Limite de 20MB por ativo.')
      return null
    }
    const id = uid('lib')
    const localBlobKey = `libasset:${id}`
    await blobStore.put(localBlobKey, file)
    const size = file.type.startsWith('image/') ? await readImageSize(file) : null
    const sha256 = await sha256Hex(await file.arrayBuffer())
    const now = new Date().toISOString()
    const asset: LibraryAsset = {
      id,
      name: meta.name ?? file.name.replace(/\.[^.]+$/, ''),
      type: meta.type ?? (file.type.startsWith('image/') ? 'photo' : 'document-reference'),
      description: meta.description ?? '',
      aliases: meta.aliases ?? [],
      tags: meta.tags ?? [],
      brandId: meta.brandId,
      scope: meta.scope ?? 'global',
      projectKey: meta.projectKey,
      localBlobKey,
      mimeType: file.type || 'application/octet-stream',
      width: size?.width,
      height: size?.height,
      fileSize: file.size,
      sha256,
      source: meta.source ?? 'upload',
      sourceUrl: meta.sourceUrl,
      exactUsage: meta.exactUsage ?? (meta.type === 'logo'),
      allowCrop: meta.allowCrop ?? true,
      allowColorChange: meta.allowColorChange ?? false,
      createdAt: now,
      updatedAt: now,
    }
    set((s) => {
      const next = [...s.assets, asset]
      persist(next)
      return { assets: next }
    })
    sync(asset)
    return asset
  },

  update: (id, patch) => {
    set((s) => {
      const next = s.assets.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a))
      persist(next)
      const updated = next.find((a) => a.id === id)
      if (updated) sync(updated)
      return { assets: next }
    })
  },

  archive: (id) => {
    get().update(id, { archived: true })
    useUiStore.getState().toast('success', 'Ativo arquivado', 'Ele deixa de aparecer, mas os usos existentes continuam válidos.')
  },

  remove: async (id) => {
    const asset = get().assets.find((a) => a.id === id)
    const url = objectUrls.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrls.delete(id)
    }
    set((s) => {
      const next = s.assets.filter((a) => a.id !== id)
      persist(next)
      return { assets: next }
    })
    if (asset?.localBlobKey) await blobStore.remove(asset.localBlobKey)
    void enqueueSync({ recordType: 'asset', recordKey: id, name: asset?.name ?? id, payload: {}, status: 'archived', schemaVersion: 3 })
  },

  getById: (id) => (id ? (get().assets.find((a) => a.id === id) ?? null) : null),

  previewUrl: async (asset) => {
    const cached = objectUrls.get(asset.id)
    if (cached) return cached
    if (asset.localBlobKey) {
      const blob = await blobStore.get(asset.localBlobKey)
      if (blob) {
        const url = URL.createObjectURL(blob)
        objectUrls.set(asset.id, url)
        return url
      }
    }
    if (asset.storagePath) return getSignedUrl(asset.storagePath)
    return null
  },

  /**
   * Resolução por alias, na prioridade documentada:
   * slide → projeto → marca → global. (Busca oficial na web e upload
   * são etapas posteriores tratadas pelo chamador.)
   */
  resolveByAlias: (query, context) => {
    const n = normalize(query)
    if (!n) return null
    const active = get().assets.filter((a) => !a.archived)

    const scoreOf = (asset: LibraryAsset): { score: number; alias: string } => {
      let best = 0
      let alias = asset.name
      for (const candidate of [asset.name, ...asset.aliases, ...asset.tags]) {
        const c = normalize(candidate)
        if (!c) continue
        let s = 0
        if (c === n) s = 1
        else if (n.includes(c) || c.includes(n)) s = 0.8
        if (s > best) {
          best = s
          alias = candidate
        }
      }
      return { score: best, alias }
    }

    const tiers: { origin: AssetResolution['origin']; filter: (a: LibraryAsset) => boolean }[] = [
      { origin: 'slide', filter: (a) => Boolean(context.slideAssetIds?.includes(a.id)) },
      { origin: 'project', filter: (a) => a.scope === 'project' && a.projectKey === context.projectKey },
      { origin: 'brand', filter: (a) => a.scope === 'brand' && a.brandId === context.brandId },
      { origin: 'global', filter: (a) => a.scope === 'global' },
    ]
    for (const tier of tiers) {
      let best: AssetResolution | null = null
      for (const asset of active.filter(tier.filter)) {
        const { score, alias } = scoreOf(asset)
        if (score >= 0.6 && score > ((best as AssetResolution | null)?.asset ? scoreOf(best!.asset).score : 0)) {
          best = { asset, origin: tier.origin, matchedAlias: alias }
        }
      }
      if (best) return best
    }
    return null
  },
}))
