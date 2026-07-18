import type { PendingSyncOperation, RecordEnvelope, RecordType } from '../../types'
import { blobStore, idbKv, SYNC_STORE } from '../storage/blobStore'
import { useSyncStore } from '../../state/syncStore'
import { cloudApi, CloudUnavailableError } from './cloudApi'

/**
 * Motor de sincronização Supabase ⇄ IndexedDB.
 *
 * Fluxo de salvamento: estado React → IndexedDB (fila) → pendente →
 * upsert no Supabase → confirmado → item removido da fila. Em falha,
 * o dado local permanece e a fila tenta novamente com backoff.
 *
 * Conflitos: cada operação carrega o baseUpdatedAt CONHECIDO (o
 * updated_at devolvido pelo último upsert bem-sucedido daquele
 * registro). Só existindo essa base é que vale a pena gastar uma
 * requisição extra checando o remoto antes de escrever — sem base,
 * não há nada para comparar, então o GET prévio é pulado. Se o
 * remoto estiver mais novo E o payload diferir, nada é sobrescrito —
 * o conflito vai para a UI (manter local / usar remoto).
 *
 * Deduplicação: um hash raso do payload é comparado ao último hash
 * efetivamente enfileirado para a mesma record_key. Ações que não
 * alteram o conteúdo (navegar entre slides, trocar de aba) não geram
 * nenhuma escrita no IndexedDB nem chamada de rede — é isso que evita
 * a "tempestade de sincronização" ao simplesmente clicar em um slide.
 */

const MAX_ATTEMPTS = 6
let processing = false
let timer: number | undefined

/** Último payload efetivamente enfileirado, por record_key — evita reenvio de conteúdo idêntico. */
const lastEnqueuedHash = new Map<string, string>()
/** updated_at remoto conhecido após o último upsert bem-sucedido, por record_key. */
const lastKnownUpdatedAt = new Map<string, string>()

function recordKeyOf(recordType: string, recordKey: string): string {
  return `${recordType}:${recordKey}`
}

function stableHash(op: Pick<PendingSyncOperation, 'payload' | 'status' | 'name' | 'position'>): string {
  try {
    return JSON.stringify([op.name, op.status, op.position, op.payload])
  } catch {
    // Payload não serializável (não deveria acontecer) — força o envio.
    return `unstable:${Date.now()}`
  }
}

async function refreshPendingCount(): Promise<number> {
  const entries = await idbKv.entries<PendingSyncOperation>(SYNC_STORE)
  useSyncStore.getState().setPendingCount(entries.length)
  return entries.length
}

/**
 * Enfileira (ou substitui) a sincronização de um registro — SOMENTE se o
 * conteúdo realmente mudou desde o último enfileiramento. Chamadas com
 * payload idêntico (ex.: apenas navegar entre slides) são no-op.
 */
export async function enqueueSync(op: Omit<PendingSyncOperation, 'id' | 'attempts' | 'queuedAt'>): Promise<void> {
  const key = recordKeyOf(op.recordType, op.recordKey)
  const hash = stableHash(op)
  if (lastEnqueuedHash.get(key) === hash) return // conteúdo inalterado — nada a sincronizar

  lastEnqueuedHash.set(key, hash)
  const item: PendingSyncOperation = {
    ...op,
    id: key,
    attempts: 0,
    queuedAt: new Date().toISOString(),
    baseUpdatedAt: lastKnownUpdatedAt.get(key),
  }
  await idbKv.set(SYNC_STORE, key, item)
  useSyncStore.getState().setRecordStatus(op.recordType, op.recordKey, 'pending')
  useSyncStore.getState().setOverall('pending')
  await refreshPendingCount()
  scheduleProcess(2500)
}

export function scheduleProcess(delayMs = 0): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void processQueue(), delayMs)
}

function payloadsDiffer(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) !== JSON.stringify(b)
  } catch {
    return true
  }
}

async function processOne(item: PendingSyncOperation): Promise<'done' | 'retry' | 'conflict'> {
  const sync = useSyncStore.getState()
  const key = recordKeyOf(item.recordType, item.recordKey)
  sync.setRecordStatus(item.recordType, item.recordKey, 'syncing')

  // Checagem de conflito: só vale a pena o round-trip extra quando
  // conhecemos uma base para comparar (evita GET às cegas em toda escrita).
  if (item.baseUpdatedAt) {
    const { record: remote } = await cloudApi.getRecord(item.recordType as RecordType, item.recordKey)
    if (
      remote?.updated_at &&
      new Date(remote.updated_at).getTime() > new Date(item.baseUpdatedAt).getTime() &&
      payloadsDiffer(remote.payload, item.payload)
    ) {
      sync.setRecordStatus(item.recordType, item.recordKey, 'conflict')
      sync.addConflict({
        recordType: item.recordType as RecordType,
        recordKey: item.recordKey,
        name: item.name,
        localUpdatedAt: item.queuedAt,
        remoteUpdatedAt: remote.updated_at,
        remotePayload: remote.payload,
      })
      return 'conflict'
    }
  }

  // Blob associado (assets) sobe antes do registro.
  let payload = item.payload
  if (item.uploadBlobKey && item.uploadStoragePath === undefined) {
    const blob = await blobStore.get(item.uploadBlobKey)
    if (blob) {
      const base64 = await blobToBase64(blob)
      const uploaded = await cloudApi.upload({
        kind: 'library',
        key: item.recordKey,
        filename: item.name || 'arquivo',
        mimeType: blob.type || 'application/octet-stream',
        base64,
      })
      payload = { ...(payload as Record<string, unknown>), storagePath: uploaded.storagePath }
    }
  }

  const { record } = await cloudApi.upsertRecord({
    record_type: item.recordType as RecordType,
    record_key: item.recordKey,
    project_key: item.projectKey ?? null,
    position: item.position ?? null,
    name: item.name,
    payload,
    status: item.status,
    schema_version: item.schemaVersion,
  })
  if (record?.updated_at) lastKnownUpdatedAt.set(key, record.updated_at)
  sync.setRecordStatus(item.recordType, item.recordKey, 'synced')
  return 'done'
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export async function processQueue(): Promise<void> {
  if (processing) return
  const sync = useSyncStore.getState()
  if (!sync.online) {
    sync.setOverall('offline')
    return
  }
  processing = true
  try {
    const entries = await idbKv.entries<PendingSyncOperation>(SYNC_STORE)
    if (entries.length === 0) {
      if (sync.conflicts.length === 0 && sync.lastSyncedAt) sync.setOverall('synced')
      return
    }
    sync.setOverall('syncing')
    let hadFailure = false
    for (const [key, item] of entries) {
      try {
        const result = await processOne(item)
        if (result !== 'retry') await idbKv.remove(SYNC_STORE, key)
      } catch (error) {
        hadFailure = true
        const attempts = item.attempts + 1
        const message = error instanceof Error ? error.message.slice(0, 200) : 'erro'
        if (attempts >= MAX_ATTEMPTS) {
          useSyncStore.getState().setRecordStatus(item.recordType, item.recordKey, 'error')
        }
        await idbKv.set(SYNC_STORE, key, { ...item, attempts, lastError: message })
        if (error instanceof CloudUnavailableError) {
          useSyncStore.getState().setCloudAvailable(false)
          break
        }
      }
    }
    const remaining = await refreshPendingCount()
    if (remaining === 0 && useSyncStore.getState().conflicts.length === 0) {
      useSyncStore.getState().markSynced()
    } else if (hadFailure) {
      useSyncStore.getState().setOverall('error')
      scheduleProcess(15_000)
    }
  } finally {
    processing = false
  }
}

/** Resolução de conflito escolhida pelo usuário. */
export async function resolveConflict(
  recordType: RecordType,
  recordKey: string,
  resolution: 'keep-local' | 'use-remote',
  applyRemote?: (payload: unknown) => void,
): Promise<void> {
  const key = recordKeyOf(recordType, recordKey)
  const item = await idbKv.get<PendingSyncOperation>(SYNC_STORE, key)
  if (resolution === 'use-remote') {
    const { record } = await cloudApi.getRecord(recordType, recordKey)
    if (record && applyRemote) applyRemote(record.payload)
    if (record?.updated_at) lastKnownUpdatedAt.set(key, record.updated_at)
    await idbKv.remove(SYNC_STORE, key)
  } else if (item) {
    // Manter local: reenvia ignorando a base remota (decisão explícita do usuário).
    lastKnownUpdatedAt.delete(key)
    await idbKv.set(SYNC_STORE, key, { ...item, baseUpdatedAt: undefined, attempts: 0 })
  }
  useSyncStore.getState().resolveConflict(recordKey)
  await refreshPendingCount()
  scheduleProcess(200)
}

export function listPending(): Promise<[string, PendingSyncOperation][]> {
  return idbKv.entries<PendingSyncOperation>(SYNC_STORE)
}

/** Inicialização: listeners de rede + verificação da nuvem + fila residual. */
export async function initSyncEngine(): Promise<void> {
  const sync = useSyncStore.getState()
  window.addEventListener('online', () => {
    useSyncStore.getState().setOnline(true)
    scheduleProcess(500)
  })
  window.addEventListener('offline', () => useSyncStore.getState().setOnline(false))
  try {
    const status = await cloudApi.aiStatus()
    sync.setCloudAvailable(status.supabaseConfigured)
  } catch {
    sync.setCloudAvailable(false)
  }
  await refreshPendingCount()
  scheduleProcess(1500)
}

/** Envelope pronto a partir de dados de um registro (para importação em lote). */
export function toEnvelope(op: Omit<PendingSyncOperation, 'id' | 'attempts' | 'queuedAt'>): RecordEnvelope {
  return {
    record_type: op.recordType as RecordType,
    record_key: op.recordKey,
    project_key: op.projectKey ?? null,
    position: op.position ?? null,
    name: op.name,
    payload: op.payload,
    status: op.status,
    schema_version: op.schemaVersion,
  }
}
