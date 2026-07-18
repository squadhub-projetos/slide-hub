/**
 * Teste de integração do Supabase (banco + Storage).
 * Uso: npm run test:supabase   (carrega .env.local via --env-file)
 *
 * Testa: insert → select → upload → download → remoção do arquivo →
 * remoção do registro. Usa IDs claramente marcados como teste e limpa
 * tudo ao final. Nunca imprime segredos.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'

const required = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']
for (const name of required) {
  if (!process.env[name]) {
    console.error(`✗ Variável ausente: ${name}. Configure no .env.local.`)
    process.exit(1)
  }
}
const TABLE = process.env.SUPABASE_TABLE ?? 'slide_hub_records'
const BUCKET = process.env.SUPABASE_BUCKET ?? 'slide-hub-assets'
const WORKSPACE = process.env.SLIDE_HUB_WORKSPACE_KEY ?? 'squadhub'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const runId = randomUUID().slice(0, 8)
const recordKey = `test-supabase-${runId}`
const storagePath = `${WORKSPACE}/projects/test-supabase-${runId}/uploads/test-${runId}.txt`
let failed = false

function ok(step, detail = '') {
  console.log(`✓ ${step}${detail ? ` — ${detail}` : ''}`)
}
function fail(step, message) {
  failed = true
  console.error(`✗ ${step} — ${message}`)
}

// PNG não é necessário: um arquivo de texto valida o Storage igualmente.
const fileContent = Buffer.from(`slide-hub supabase test ${runId} @ ${new Date().toISOString()}`)
const fileHash = createHash('sha256').update(fileContent).digest('hex')

try {
  // 1. Insert no banco
  const { error: insertError } = await supabase.from(TABLE).upsert(
    {
      workspace_key: WORKSPACE,
      record_type: 'settings',
      record_key: recordKey,
      name: `Teste automatizado ${runId}`,
      payload: { kind: 'test-supabase', runId, fileHash },
      status: 'active',
      schema_version: 3,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_key,record_type,record_key' },
  )
  if (insertError) throw new Error(`Insert falhou: ${insertError.message} (a tabela ${TABLE} existe?)`)
  ok('Insert no banco', `record_key=${recordKey}`)

  // 2. Select
  const { data: selected, error: selectError } = await supabase
    .from(TABLE)
    .select('record_key, payload')
    .eq('workspace_key', WORKSPACE)
    .eq('record_type', 'settings')
    .eq('record_key', recordKey)
    .single()
  if (selectError || !selected) throw new Error(`Select falhou: ${selectError?.message ?? 'registro não encontrado'}`)
  if (selected.payload?.runId !== runId) throw new Error('Payload retornado difere do gravado.')
  ok('Select', 'payload íntegro')

  // 3. Upload no Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileContent, { contentType: 'text/plain', upsert: true })
  if (uploadError) throw new Error(`Upload falhou: ${uploadError.message} (o bucket ${BUCKET} existe?)`)
  ok('Upload no Storage', storagePath)

  // 4. Download + verificação de integridade
  const { data: downloaded, error: downloadError } = await supabase.storage.from(BUCKET).download(storagePath)
  if (downloadError || !downloaded) throw new Error(`Download falhou: ${downloadError?.message ?? 'sem dados'}`)
  const downloadedHash = createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex')
  if (downloadedHash !== fileHash) throw new Error('Hash do download difere do upload.')
  ok('Download', `sha256=${fileHash.slice(0, 12)}… íntegro`)

  // 5. Remoção do arquivo
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (removeError) throw new Error(`Remoção do arquivo falhou: ${removeError.message}`)
  ok('Remoção do arquivo')

  // 6. Remoção do registro
  const { error: deleteError } = await supabase
    .from(TABLE)
    .delete()
    .eq('workspace_key', WORKSPACE)
    .eq('record_type', 'settings')
    .eq('record_key', recordKey)
  if (deleteError) throw new Error(`Remoção do registro falhou: ${deleteError.message}`)
  ok('Remoção do registro')

  console.log(`\nSupabase OK — tabela "${TABLE}", bucket "${BUCKET}", workspace "${WORKSPACE}".`)
} catch (error) {
  fail('Teste do Supabase', error instanceof Error ? error.message : String(error))
  // Limpeza best-effort para não deixar lixo em falhas parciais
  await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
  await supabase.from(TABLE).delete().eq('workspace_key', WORKSPACE).eq('record_type', 'settings').eq('record_key', recordKey)
}

process.exit(failed ? 1 : 0)
