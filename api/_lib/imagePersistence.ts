import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServerEnv } from './env.js'
import { sha256Hex } from './hashNode.js'
import { SupabaseRecordRepository } from './records.js'
import { projectPath, type ProjectArea } from './storagePaths.js'
import { getSupabaseAdmin, isSupabaseConfigured } from './supabaseAdmin.js'

export interface PersistedImage {
  storagePath?: string
  assetRecordKey?: string
  outputHash: string
  fileSize: number
}

function parseSize(size: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/i.exec(size)
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 0, height: 0 }
}

/**
 * Persiste uma imagem gerada no bucket privado + registra o asset no banco.
 * Se o Supabase não estiver configurado, devolve apenas o hash (a geração
 * não é bloqueada, mas o storagePath fica ausente e isso é visível).
 */
export async function persistGeneratedImage(options: {
  env: ServerEnv
  buffer: Buffer
  projectKey: string
  slideKey: string
  versionKey: string
  area: Extract<ProjectArea, 'generated' | 'revisions' | 'masks'>
  metadata: Record<string, unknown>
}): Promise<PersistedImage> {
  const { env, buffer } = options
  const outputHash = sha256Hex(buffer)
  if (!isSupabaseConfigured(env)) {
    return { outputHash, fileSize: buffer.length }
  }

  const supabase: SupabaseClient = getSupabaseAdmin(env)
  const storagePath = projectPath(
    env.workspaceKey,
    options.projectKey,
    options.area,
    options.slideKey,
    `${options.versionKey}.png`,
  )

  const { error: uploadError } = await supabase.storage
    .from(env.supabaseBucket)
    .upload(storagePath, buffer, { contentType: 'image/png', upsert: true })
  if (uploadError) {
    // Não falha a geração por causa do storage; o chamador decide como reportar.
    console.error(`[storage] upload falhou: ${uploadError.message.slice(0, 200)}`)
    return { outputHash, fileSize: buffer.length }
  }

  const { width, height } = parseSize(String(options.metadata.resolution ?? ''))
  const assetRecordKey = `genimg-${options.versionKey}`
  try {
    const repo = new SupabaseRecordRepository(supabase, env.supabaseTable, env.workspaceKey)
    await repo.upsertRecord({
      record_type: 'asset',
      record_key: assetRecordKey,
      project_key: options.projectKey,
      name: `Imagem gerada — slide ${options.slideKey}`,
      payload: {
        role: 'generated-image',
        bucket: env.supabaseBucket,
        storagePath,
        mimeType: 'image/png',
        fileSize: buffer.length,
        sha256: outputHash,
        width,
        height,
        slideKey: options.slideKey,
        versionKey: options.versionKey,
        generation: options.metadata,
      },
      schema_version: 3,
    })
  } catch (error) {
    console.error(`[storage] registro do asset falhou: ${error instanceof Error ? error.message.slice(0, 200) : 'erro'}`)
  }

  return { storagePath, assetRecordKey, outputHash, fileSize: buffer.length }
}
