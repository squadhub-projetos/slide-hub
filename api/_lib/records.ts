import type { SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from './http.js'

/**
 * Repositório genérico sobre public.slide_hub_records.
 * Upsert baseado na restrição única workspace_key + record_type + record_key.
 */

export const RECORD_TYPES = ['project', 'slide', 'style', 'template', 'snippet', 'asset', 'settings'] as const
export type RecordType = (typeof RECORD_TYPES)[number]

export interface RecordRow {
  id?: string
  workspace_key: string
  record_type: RecordType
  record_key: string
  project_key?: string | null
  position?: number | null
  name: string
  payload: unknown
  status: string
  schema_version: number
  expires_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface RecordInput {
  record_type: RecordType
  record_key: string
  project_key?: string | null
  position?: number | null
  name: string
  payload: unknown
  status?: string
  schema_version?: number
  expires_at?: string | null
}

export function assertRecordType(value: unknown): RecordType {
  if (typeof value !== 'string' || !RECORD_TYPES.includes(value as RecordType)) {
    throw new HttpError(400, `record_type inválido. Permitidos: ${RECORD_TYPES.join(', ')}.`)
  }
  return value as RecordType
}

const MAX_PAYLOAD_JSON = 900_000 // ~0,9MB — blobs nunca vão para o Postgres

export function validateRecordInput(raw: unknown, index = 0): RecordInput {
  if (typeof raw !== 'object' || raw === null) throw new HttpError(400, `Registro ${index} inválido.`)
  const r = raw as Record<string, unknown>
  const record_type = assertRecordType(r.record_type)
  const record_key = String(r.record_key ?? '')
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(record_key)) {
    throw new HttpError(400, `record_key inválido no registro ${index}.`)
  }
  const payloadJson = JSON.stringify(r.payload ?? {})
  if (payloadJson.length > MAX_PAYLOAD_JSON) {
    throw new HttpError(413, `Payload do registro ${record_key} excede o limite (${Math.round(payloadJson.length / 1024)}KB). Arquivos devem ir para o Storage.`)
  }
  if (payloadJson.includes('"data:image/')) {
    throw new HttpError(400, `Payload do registro ${record_key} contém base64 de imagem — use o Storage.`)
  }
  return {
    record_type,
    record_key,
    project_key: typeof r.project_key === 'string' ? r.project_key : null,
    position: typeof r.position === 'number' ? Math.round(r.position) : null,
    name: String(r.name ?? '').slice(0, 300),
    payload: r.payload ?? {},
    status: r.status === 'archived' ? 'archived' : 'active',
    schema_version: typeof r.schema_version === 'number' ? Math.round(r.schema_version) : 3,
    expires_at: typeof r.expires_at === 'string' ? r.expires_at : null,
  }
}

export class SupabaseRecordRepository {
  private readonly db: SupabaseClient
  private readonly table: string
  private readonly workspace: string

  constructor(db: SupabaseClient, table: string, workspace: string) {
    this.db = db
    this.table = table
    this.workspace = workspace
  }

  private base() {
    return this.db.from(this.table)
  }

  async getRecord(recordType: RecordType, recordKey: string): Promise<RecordRow | null> {
    const { data, error } = await this.base()
      .select('*')
      .eq('workspace_key', this.workspace)
      .eq('record_type', recordType)
      .eq('record_key', recordKey)
      .maybeSingle()
    if (error) throw new HttpError(502, `Falha ao buscar registro: ${error.message}`)
    return (data as RecordRow | null) ?? null
  }

  async listRecords(recordType: RecordType, options: { projectKey?: string; includeArchived?: boolean; limit?: number } = {}): Promise<RecordRow[]> {
    let query = this.base()
      .select('*')
      .eq('workspace_key', this.workspace)
      .eq('record_type', recordType)
      .order('position', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(Math.min(options.limit ?? 500, 1000))
    if (options.projectKey) query = query.eq('project_key', options.projectKey)
    if (!options.includeArchived) query = query.eq('status', 'active')
    const { data, error } = await query
    if (error) throw new HttpError(502, `Falha ao listar registros: ${error.message}`)
    return (data ?? []) as RecordRow[]
  }

  async listByProject(projectKey: string): Promise<RecordRow[]> {
    const { data, error } = await this.base()
      .select('*')
      .eq('workspace_key', this.workspace)
      .eq('project_key', projectKey)
      .eq('status', 'active')
    if (error) throw new HttpError(502, `Falha ao listar projeto: ${error.message}`)
    return (data ?? []) as RecordRow[]
  }

  async upsertRecord(input: RecordInput): Promise<RecordRow> {
    const row = {
      workspace_key: this.workspace,
      ...input,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await this.base()
      .upsert(row, { onConflict: 'workspace_key,record_type,record_key' })
      .select()
      .single()
    if (error) throw new HttpError(502, `Falha ao gravar registro: ${error.message}`)
    return data as RecordRow
  }

  async upsertMany(inputs: RecordInput[]): Promise<RecordRow[]> {
    if (inputs.length === 0) return []
    const now = new Date().toISOString()
    const rows = inputs.map((input) => ({ workspace_key: this.workspace, ...input, updated_at: now }))
    const { data, error } = await this.base()
      .upsert(rows, { onConflict: 'workspace_key,record_type,record_key' })
      .select()
    if (error) throw new HttpError(502, `Falha no upsert em lote: ${error.message}`)
    return (data ?? []) as RecordRow[]
  }

  async archiveRecord(recordType: RecordType, recordKey: string): Promise<void> {
    const { error } = await this.base()
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('workspace_key', this.workspace)
      .eq('record_type', recordType)
      .eq('record_key', recordKey)
    if (error) throw new HttpError(502, `Falha ao arquivar registro: ${error.message}`)
  }

  async deleteRecord(recordType: RecordType, recordKey: string): Promise<void> {
    const { error } = await this.base()
      .delete()
      .eq('workspace_key', this.workspace)
      .eq('record_type', recordType)
      .eq('record_key', recordKey)
    if (error) throw new HttpError(502, `Falha ao excluir registro: ${error.message}`)
  }
}
