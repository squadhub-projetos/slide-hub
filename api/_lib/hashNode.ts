import { createHash } from 'node:crypto'

/** SHA-256 hex de um buffer/string (server-side). */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}
