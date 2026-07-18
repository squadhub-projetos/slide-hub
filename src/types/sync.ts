/** Tipos da sincronização Supabase ⇄ IndexedDB. */

export type RecordType = 'project' | 'slide' | 'style' | 'template' | 'snippet' | 'asset' | 'settings'

/** Envelope genérico espelhando public.slide_hub_records. */
export interface RecordEnvelope<T = unknown> {
  id?: string
  workspace_key?: string
  record_type: RecordType
  record_key: string
  project_key?: string | null
  position?: number | null
  name: string
  payload: T
  status: 'active' | 'archived'
  schema_version: number
  expires_at?: string | null
  created_at?: string
  updated_at?: string
}

export type SyncStatus =
  | 'local-only'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'
  | 'conflict'

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  'local-only': 'Salvo localmente',
  pending: 'Aguardando sincronização',
  syncing: 'Sincronizando…',
  synced: 'Salvo na nuvem',
  offline: 'Offline',
  error: 'Falha na sincronização',
  conflict: 'Conflito',
}

export interface PendingSyncOperation {
  id: string
  recordType: RecordType
  recordKey: string
  projectKey?: string | null
  position?: number | null
  name: string
  payload: unknown
  status: 'active' | 'archived'
  schemaVersion: number
  /** updated_at remoto conhecido no momento do enfileiramento (detecção de conflito). */
  baseUpdatedAt?: string
  /** Blob local a subir antes do upsert (assets). */
  uploadBlobKey?: string
  uploadStoragePath?: string
  attempts: number
  queuedAt: string
  lastError?: string
}

export interface SyncConflict {
  recordType: RecordType
  recordKey: string
  name: string
  localUpdatedAt: string
  remoteUpdatedAt: string
  remotePayload: unknown
}

/** Metadados de um objeto no Storage, registrados no banco (nunca o binário). */
export interface SupabaseAssetMetadata {
  bucket: string
  storagePath: string
  mimeType: string
  fileSize: number
  sha256: string
  width?: number
  height?: number
}
