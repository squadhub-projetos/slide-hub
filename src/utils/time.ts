export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const minutes = Math.floor(s / 60)
  const seconds = s % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}min ${String(seconds).padStart(2, '0')}s`
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.round(diff / 1000)
  if (seconds < 10) return 'agora'
  if (seconds < 60) return `há ${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `há ${minutes}min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  return new Date(iso).toLocaleDateString('pt-BR')
}
