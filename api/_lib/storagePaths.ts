import { HttpError } from './http.js'

/**
 * Todos os caminhos do bucket são gerados AQUI, no servidor — o cliente
 * nunca envia um storagePath arbitrário para escrita.
 *
 * Estrutura:
 *   {workspace}/projects/{projectKey}/uploads|generated|revisions|masks|thumbnails|exports/...
 *   {workspace}/library/{assetKey}-{safeFilename}
 */

const KEY_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/

export function assertSafeKey(value: string, label: string): string {
  if (!KEY_PATTERN.test(value)) {
    throw new HttpError(400, `${label} inválido: use apenas letras, números, hífen e sublinhado.`)
  }
  return value
}

export function sanitizeFilename(raw: string): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100)
  if (!cleaned || cleaned === '.' || cleaned.includes('/') || cleaned.includes('\\')) {
    throw new HttpError(400, 'Nome de arquivo inválido.')
  }
  return cleaned.toLowerCase()
}

export type ProjectArea = 'uploads' | 'generated' | 'revisions' | 'masks' | 'thumbnails' | 'exports'

export function projectPath(
  workspace: string,
  projectKey: string,
  area: ProjectArea,
  ...segments: string[]
): string {
  assertSafeKey(projectKey, 'projectKey')
  for (const segment of segments.slice(0, -1)) assertSafeKey(segment, 'segmento de caminho')
  const last = segments.at(-1)
  if (last && !KEY_PATTERN.test(last)) sanitizeFilename(last)
  return [workspace, 'projects', projectKey, area, ...segments].join('/')
}

export function libraryPath(workspace: string, assetKey: string, filename: string): string {
  assertSafeKey(assetKey, 'assetKey')
  return `${workspace}/library/${assetKey}-${sanitizeFilename(filename)}`
}

/** Valida um path para LEITURA/EXCLUSÃO: precisa pertencer ao workspace. */
export function assertWorkspacePath(workspace: string, path: string): string {
  if (
    typeof path !== 'string' ||
    path.length > 400 ||
    path.includes('..') ||
    path.includes('\\') ||
    !path.startsWith(`${workspace}/`)
  ) {
    throw new HttpError(400, 'Caminho de storage inválido.')
  }
  return path
}
