import { create } from 'zustand'
import type { SyncConflict, SyncStatus } from '../types'

interface SyncState {
  /** Estado agregado exibido no header. */
  overall: SyncStatus
  pendingCount: number
  online: boolean
  cloudAvailable: boolean | null
  lastSyncedAt: number | null
  conflicts: SyncConflict[]
  /** Estado por registro (`${type}:${key}`). */
  records: Record<string, SyncStatus>
  setOverall: (status: SyncStatus) => void
  setPendingCount: (count: number) => void
  setOnline: (online: boolean) => void
  setCloudAvailable: (available: boolean) => void
  setRecordStatus: (recordType: string, recordKey: string, status: SyncStatus) => void
  addConflict: (conflict: SyncConflict) => void
  resolveConflict: (recordKey: string) => void
  markSynced: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  overall: 'local-only',
  pendingCount: 0,
  online: navigator.onLine,
  cloudAvailable: null,
  lastSyncedAt: null,
  conflicts: [],
  records: {},

  setOverall: (overall) => set({ overall }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setOnline: (online) => set((s) => ({ online, overall: online ? s.overall : 'offline' })),
  setCloudAvailable: (cloudAvailable) => set({ cloudAvailable }),
  setRecordStatus: (recordType, recordKey, status) =>
    set((s) => ({ records: { ...s.records, [`${recordType}:${recordKey}`]: status } })),
  addConflict: (conflict) =>
    set((s) => ({
      conflicts: s.conflicts.some((c) => c.recordKey === conflict.recordKey)
        ? s.conflicts
        : [...s.conflicts, conflict],
      overall: 'conflict',
    })),
  resolveConflict: (recordKey) =>
    set((s) => {
      const conflicts = s.conflicts.filter((c) => c.recordKey !== recordKey)
      return { conflicts, overall: conflicts.length > 0 ? 'conflict' : s.overall }
    }),
  markSynced: () => set({ overall: 'synced', lastSyncedAt: Date.now() }),
}))
