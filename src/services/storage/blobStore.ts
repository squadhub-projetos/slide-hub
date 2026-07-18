/**
 * Repositório de blobs em IndexedDB — anexos e imagens de versões nunca
 * entram no localStorage. A interface é mínima de propósito para permitir
 * troca futura por Supabase Storage/S3 sem tocar na UI.
 */

export interface BlobStore {
  put(key: string, blob: Blob): Promise<void>
  get(key: string): Promise<Blob | null>
  remove(key: string): Promise<void>
  keys(): Promise<string[]>
}

const DB_NAME = 'slidehub-blobs'
const STORE = 'blobs'
/** Fila de sincronização com o Supabase (operações pendentes). */
export const SYNC_STORE = 'sync-queue'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
      if (!request.result.objectStoreNames.contains(SYNC_STORE)) {
        request.result.createObjectStore(SYNC_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponível.'))
  })
}

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb()
  return dbPromise
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE,
): Promise<T> {
  return db().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(storeName, mode)
        const request = run(transaction.objectStore(storeName))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Falha no armazenamento local.'))
      }),
  )
}

/** Acesso genérico a valores JSON num object store do IndexedDB. */
export const idbKv = {
  async get<T>(storeName: string, key: string): Promise<T | null> {
    const result = await tx<unknown>('readonly', (s) => s.get(key), storeName)
    return (result as T | undefined) ?? null
  },
  async set(storeName: string, key: string, value: unknown): Promise<void> {
    await tx('readwrite', (s) => s.put(value, key), storeName)
  },
  async remove(storeName: string, key: string): Promise<void> {
    await tx('readwrite', (s) => s.delete(key), storeName)
  },
  async entries<T>(storeName: string): Promise<[string, T][]> {
    const database = await db()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const keysReq = store.getAllKeys()
      const valsReq = store.getAll()
      transaction.oncomplete = () =>
        resolve(keysReq.result.map((k, i) => [String(k), valsReq.result[i] as T]))
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao ler fila local.'))
    })
  },
}

class IndexedDbBlobStore implements BlobStore {
  async put(key: string, blob: Blob): Promise<void> {
    await tx('readwrite', (store) => store.put(blob, key))
  }

  async get(key: string): Promise<Blob | null> {
    const result = await tx<unknown>('readonly', (store) => store.get(key))
    return result instanceof Blob ? result : null
  }

  async remove(key: string): Promise<void> {
    await tx('readwrite', (store) => store.delete(key))
  }

  async keys(): Promise<string[]> {
    const result = await tx<IDBValidKey[]>('readonly', (store) => store.getAllKeys())
    return result.map(String)
  }
}

export const blobStore: BlobStore = new IndexedDbBlobStore()

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'))
    reader.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/data:(.*?)(;|$)/)?.[1] ?? 'application/octet-stream'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
