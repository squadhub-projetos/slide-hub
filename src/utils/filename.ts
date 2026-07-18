const INVALID_CHARS = /[\\/:*?"<>|#%&{}$!'@+`=]/g

/**
 * Sanitiza nomes de arquivo digitados pelo usuário: remove caracteres
 * inválidos, normaliza acentos/espaços e garante um fallback.
 */
export function sanitizeFileName(raw: string, fallback = 'apresentacao'): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(INVALID_CHARS, '')
    // Travessões/en-dashes viram hífen simples (títulos como "A — B").
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  return cleaned || fallback
}

/** Sufixo horário curto para evitar sobrescrever downloads anteriores. */
export function uniqueSuffix(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}
