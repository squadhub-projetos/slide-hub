import type { RecordEnvelope, RecordType } from '../../types'
import { uid } from '../../utils/id'

/**
 * Cliente dos endpoints internos de persistência (/api/storage/*).
 * Timeout, retry com backoff para erros transitórios (429/5xx/rede) e
 * idempotency key por operação de escrita.
 */

const TIMEOUT_MS = 45_000
const MAX_RETRIES = 2

export class CloudUnavailableError extends Error {}

async function post<T>(path: string, body: unknown, options: { retries?: number } = {}): Promise<T> {
  const retries = options.retries ?? MAX_RETRIES
  const idempotencyKey = uid('idem')
  let lastError: Error = new CloudUnavailableError('Sem conexão com a nuvem.')

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (response.ok) return (await response.json()) as T
      const detail = await response
        .json()
        .then((p: { error?: string }) => p.error ?? '')
        .catch(() => '')
      const transient = response.status === 429 || response.status >= 500
      lastError = new Error(`${path} (${response.status})${detail ? `: ${detail}` : ''}`)
      if (!transient) throw lastError
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new Error(`${path}: tempo limite excedido.`)
      } else if (error instanceof TypeError) {
        lastError = new CloudUnavailableError(`${path}: rede indisponível.`)
      } else if (error instanceof Error && !(error.message.includes('(4') && !error.message.includes('(429'))) {
        lastError = error
      } else {
        throw error
      }
    } finally {
      window.clearTimeout(timer)
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt + Math.random() * 400))
    }
  }
  throw lastError
}

export interface ServerAiStatus {
  openaiConfigured: boolean
  supabaseConfigured: boolean
  textModel: string
  imageModel: string
  imageQuality: string
  imageSize: string
  webSearchEnabled: boolean
  workspace: string
}

export const cloudApi = {
  async aiStatus(): Promise<ServerAiStatus> {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch('/api/ai/status', { signal: controller.signal })
      if (!response.ok) throw new CloudUnavailableError(`status ${response.status}`)
      return (await response.json()) as ServerAiStatus
    } finally {
      window.clearTimeout(timer)
    }
  },

  getRecord: (record_type: RecordType, record_key: string) =>
    post<{ record: RecordEnvelope | null }>('/api/storage/records', { op: 'get', record_type, record_key }),

  listRecords: (record_type: RecordType, project_key?: string) =>
    post<{ records: RecordEnvelope[] }>('/api/storage/records', { op: 'list', record_type, project_key }),

  listByProject: (project_key: string) =>
    post<{ records: RecordEnvelope[] }>('/api/storage/records', { op: 'listByProject', project_key }),

  upsertRecord: (record: RecordEnvelope) =>
    post<{ record: RecordEnvelope }>('/api/storage/records', { op: 'upsert', record }, { retries: 1 }),

  upsertMany: (records: RecordEnvelope[]) =>
    post<{ records: RecordEnvelope[] }>('/api/storage/records', { op: 'upsertMany', records }, { retries: 1 }),

  archiveRecord: (record_type: RecordType, record_key: string) =>
    post<{ ok: boolean }>('/api/storage/records', { op: 'archive', record_type, record_key }),

  deleteRecord: (record_type: RecordType, record_key: string) =>
    post<{ ok: boolean }>('/api/storage/records', { op: 'delete', record_type, record_key }),

  upload: (input: {
    kind: 'project' | 'library'
    projectKey?: string
    area?: string
    key: string
    filename: string
    mimeType: string
    base64: string
  }) =>
    post<{ storagePath: string; bucket: string; fileSize: number; sha256: string; mimeType: string }>(
      '/api/storage/upload',
      input,
      { retries: 1 },
    ),

  sign: (paths: string[]) =>
    post<{ urls: Record<string, string | null>; expiresInSeconds: number }>('/api/storage/sign', { paths }),

  deleteObject: (path: string) => post<{ ok: boolean }>('/api/storage/delete-object', { path }),
}
