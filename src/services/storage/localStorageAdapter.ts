import type { StorageAdapter } from './StorageAdapter'

const NAMESPACE = 'slidehub'

export class LocalStorageAdapter implements StorageAdapter {
  async read<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(`${NAMESPACE}:${key}`)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(`${NAMESPACE}:${key}`, JSON.stringify(value))
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(`${NAMESPACE}:${key}`)
  }
}

export const storage: StorageAdapter = new LocalStorageAdapter()
