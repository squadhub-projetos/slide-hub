import { cloudApi } from './cloudApi'

/**
 * Cache em memória de URLs assinadas do bucket privado.
 * Só o storagePath é persistido; URLs expiram e são renovadas aqui.
 */

interface CachedUrl {
  url: string
  expiresAt: number
}

const cache = new Map<string, CachedUrl>()
const inflight = new Map<string, Promise<string | null>>()
const SAFETY_MARGIN_MS = 60_000

export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const cached = cache.get(storagePath)
  if (cached && cached.expiresAt > Date.now() + SAFETY_MARGIN_MS) return cached.url

  let pending = inflight.get(storagePath)
  if (!pending) {
    pending = (async () => {
      try {
        const { urls, expiresInSeconds } = await cloudApi.sign([storagePath])
        const url = urls[storagePath] ?? null
        if (url) cache.set(storagePath, { url, expiresAt: Date.now() + expiresInSeconds * 1000 })
        return url
      } catch {
        return null
      } finally {
        inflight.delete(storagePath)
      }
    })()
    inflight.set(storagePath, pending)
  }
  return pending
}

export function invalidateSignedUrl(storagePath: string): void {
  cache.delete(storagePath)
}
