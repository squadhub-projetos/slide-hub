export function uid(prefix = ''): string {
  const rand = crypto.getRandomValues(new Uint32Array(2))
  const body = `${Date.now().toString(36)}${rand[0].toString(36)}${rand[1].toString(36)}`
  return prefix ? `${prefix}_${body}` : body
}
