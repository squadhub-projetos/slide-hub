import type { DeckProject, DesignStyle } from '../../types'
import type { AttachmentAsset } from '../../types/attachments'
import { storage } from './localStorageAdapter'

export const SCHEMA_VERSION = 3

export interface AppPrefs {
  approvalSeconds: number
  activeTab: 'planner' | 'generator' | 'styles'
  onboarded: boolean
}

export const DEFAULT_PREFS: AppPrefs = {
  approvalSeconds: 90,
  activeTab: 'generator',
  onboarded: false,
}

const KEYS = {
  project: 'project',
  styles: 'styles',
  prefs: 'prefs',
  attachments: 'attachments',
  schema: 'schema',
} as const

export const projectRepository = {
  load: () => storage.read<DeckProject>(KEYS.project),
  save: (project: DeckProject) => storage.write(KEYS.project, project),
  clear: () => storage.remove(KEYS.project),
}

export const styleRepository = {
  load: () => storage.read<DesignStyle[]>(KEYS.styles),
  save: (styles: DesignStyle[]) => storage.write(KEYS.styles, styles),
}

export const prefsRepository = {
  load: () => storage.read<AppPrefs>(KEYS.prefs),
  save: (prefs: AppPrefs) => storage.write(KEYS.prefs, prefs),
}

/** Metadados dos anexos (os blobs vivem no IndexedDB — ver blobStore). */
export const attachmentRepository = {
  load: () => storage.read<AttachmentAsset[]>(KEYS.attachments),
  save: (attachments: AttachmentAsset[]) => storage.write(KEYS.attachments, attachments),
}

export const schemaRepository = {
  load: () => storage.read<number>(KEYS.schema),
  save: (version: number) => storage.write(KEYS.schema, version),
}
