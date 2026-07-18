/**
 * Contrato mínimo de persistência. A implementação atual usa localStorage;
 * uma futura versão pode trocar por Supabase/REST sem alterar a interface
 * nem os stores — basta fornecer outro adapter assíncrono.
 */
export interface StorageAdapter {
  read<T>(key: string): Promise<T | null>
  write<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}
