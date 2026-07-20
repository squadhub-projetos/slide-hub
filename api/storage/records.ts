import { readEnv } from '../_lib/env.js'
import {
  handleError,
  requireBody,
  requirePost,
  requireString,
  optionalString,
  HttpError,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import {
  SupabaseRecordRepository,
  assertRecordType,
  validateRecordInput,
} from '../_lib/records.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

/**
 * Multiplexador de operações sobre slide_hub_records:
 *   op: 'get' | 'list' | 'listByProject' | 'upsert' | 'upsertMany' | 'archive' | 'delete'
 * Um único endpoint evita dezenas de rotas redundantes; cada operação
 * valida seu próprio payload.
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const env = readEnv()
    const repo = new SupabaseRecordRepository(getSupabaseAdmin(env), env.supabaseTable, env.workspaceKey)
    const op = requireString(body, 'op', 24)

    switch (op) {
      case 'get': {
        const record = await repo.getRecord(assertRecordType(body.record_type), requireString(body, 'record_key', 120))
        res.status(200).json({ record })
        return
      }
      case 'list': {
        const records = await repo.listRecords(assertRecordType(body.record_type), {
          projectKey: optionalString(body, 'project_key', 120),
          includeArchived: body.include_archived === true,
        })
        res.status(200).json({ records })
        return
      }
      case 'listByProject': {
        const records = await repo.listByProject(requireString(body, 'project_key', 120))
        res.status(200).json({ records })
        return
      }
      case 'upsert': {
        const record = await repo.upsertRecord(validateRecordInput(body.record))
        res.status(200).json({ record })
        return
      }
      case 'upsertMany': {
        if (!Array.isArray(body.records)) throw new HttpError(400, 'records deve ser uma lista.')
        if (body.records.length > 100) throw new HttpError(413, 'Máximo de 100 registros por lote.')
        const records = await repo.upsertMany(body.records.map((r, i) => validateRecordInput(r, i)))
        res.status(200).json({ records })
        return
      }
      case 'archive': {
        await repo.archiveRecord(assertRecordType(body.record_type), requireString(body, 'record_key', 120))
        res.status(200).json({ ok: true })
        return
      }
      case 'delete': {
        await repo.deleteRecord(assertRecordType(body.record_type), requireString(body, 'record_key', 120))
        res.status(200).json({ ok: true })
        return
      }
      default:
        throw new HttpError(400, `Operação desconhecida: ${op}.`)
    }
  } catch (error) {
    handleError(res, error, 'storage/records')
  }
}
