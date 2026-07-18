/**
 * Teste PAGO e OPCIONAL da integração real de imagem (gpt-image-2).
 * NUNCA roda em install/build/e2e. Exige confirmação explícita:
 *
 *   RUN_PAID_AI_TEST=true npm run test:openai-image
 *
 * Fluxo: gera uma imagem pequena/econômica → salva no Storage → registra
 * metadados → pede uma edição simples → verifica que o hash MUDOU →
 * limpa os dados (KEEP_TEST_DATA=true preserva para inspeção).
 */
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'

if (process.env.RUN_PAID_AI_TEST !== 'true') {
  console.error('✗ Teste pago abortado. Defina RUN_PAID_AI_TEST=true para executar (gera custo real na OpenAI).')
  process.exit(1)
}
if (!process.env.OPENAI_API_KEY) {
  console.error('✗ OPENAI_API_KEY ausente no ambiente.')
  process.exit(1)
}

const MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2'
const SIZE = '1024x1024' // menor tamanho aceito — teste econômico
const QUALITY = 'low'
const keep = process.env.KEEP_TEST_DATA === 'true'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 170_000, maxRetries: 0 })
const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY)
const supabase = hasSupabase
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null
const TABLE = process.env.SUPABASE_TABLE ?? 'slide_hub_records'
const BUCKET = process.env.SUPABASE_BUCKET ?? 'slide-hub-assets'
const WORKSPACE = process.env.SLIDE_HUB_WORKSPACE_KEY ?? 'squadhub'

const runId = randomUUID().slice(0, 8)
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex')
const cleanupPaths = []
const cleanupRecords = []

try {
  console.log(`• Modelo ${MODEL}, tamanho ${SIZE}, qualidade ${QUALITY} (teste econômico ${runId})`)

  // 1. Geração
  const started = Date.now()
  const generated = await openai.images.generate({
    model: MODEL,
    prompt: 'Fundo abstrato corporativo azul-marinho com formas geométricas suaves, sem texto, sem logos.',
    n: 1,
    size: SIZE,
    quality: QUALITY,
  })
  const genB64 = generated.data?.[0]?.b64_json
  if (!genB64) throw new Error('Geração não retornou imagem.')
  const genBuffer = Buffer.from(genB64, 'base64')
  const genHash = sha(genBuffer)
  console.log(`✓ Geração real em ${Date.now() - started}ms — ${genBuffer.length} bytes, sha256=${genHash.slice(0, 12)}…`)

  // 2-3. Storage + metadados
  if (supabase) {
    const genPath = `${WORKSPACE}/projects/test-openai-${runId}/generated/test/${runId}-gen.png`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(genPath, genBuffer, { contentType: 'image/png', upsert: true })
    if (upErr) throw new Error(`Upload da geração falhou: ${upErr.message}`)
    cleanupPaths.push(genPath)
    const recordKey = `test-openai-${runId}-gen`
    const { error: recErr } = await supabase.from(TABLE).upsert(
      {
        workspace_key: WORKSPACE, record_type: 'asset', record_key: recordKey,
        name: `Teste OpenAI ${runId} (geração)`,
        payload: {
          role: 'generated-image', bucket: BUCKET, storagePath: genPath, mimeType: 'image/png',
          fileSize: genBuffer.length, sha256: genHash,
          generation: { provider: 'openai', model: MODEL, source: 'generation', quality: QUALITY, size: SIZE },
        },
        status: 'active', schema_version: 3, updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_key,record_type,record_key' },
    )
    if (recErr) throw new Error(`Registro de metadados falhou: ${recErr.message}`)
    cleanupRecords.push(recordKey)
    console.log(`✓ Imagem no Storage (${genPath}) + metadados registrados`)
  } else {
    console.log('• Supabase não configurado — pulando persistência (teste da OpenAI continua).')
  }

  // 4. Edição simples
  const editStarted = Date.now()
  const { toFile } = await import('openai')
  const edited = await openai.images.edit({
    model: MODEL,
    image: [await toFile(genBuffer, 'source.png', { type: 'image/png' })],
    prompt: 'Adicione um círculo dourado grande no centro da imagem.',
    n: 1,
    size: SIZE,
    quality: QUALITY,
  })
  const editB64 = edited.data?.[0]?.b64_json
  if (!editB64) throw new Error('Edição não retornou imagem.')
  const editBuffer = Buffer.from(editB64, 'base64')
  const editHash = sha(editBuffer)
  console.log(`✓ Edição real em ${Date.now() - editStarted}ms — sha256=${editHash.slice(0, 12)}…`)

  // 5. Hash mudou?
  if (editHash === genHash) {
    throw new Error('A edição retornou hash IDÊNTICO ao original — sem alteração visual detectável.')
  }
  console.log('✓ Hash da edição difere do original — alteração visual real confirmada')

  if (supabase) {
    const editPath = `${WORKSPACE}/projects/test-openai-${runId}/revisions/test/${runId}-edit.png`
    const { error } = await supabase.storage.from(BUCKET).upload(editPath, editBuffer, { contentType: 'image/png', upsert: true })
    if (!error) cleanupPaths.push(editPath)
  }

  // 6. Limpeza (ou preservação para inspeção)
  if (keep) {
    console.log(`• KEEP_TEST_DATA=true — dados preservados para inspeção: ${cleanupPaths.join(', ')}`)
  } else if (supabase) {
    if (cleanupPaths.length) await supabase.storage.from(BUCKET).remove(cleanupPaths)
    for (const key of cleanupRecords) {
      await supabase.from(TABLE).delete().eq('workspace_key', WORKSPACE).eq('record_type', 'asset').eq('record_key', key)
    }
    console.log('✓ Dados de teste removidos')
  }

  console.log('\nIntegração real OpenAI de imagem: OK (geração + edição + hash distinto).')
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  if (supabase && cleanupPaths.length && !keep) {
    await supabase.storage.from(BUCKET).remove(cleanupPaths).catch(() => {})
  }
  process.exit(1)
}
