import { AlertTriangle, Check, Cloud, CloudOff, Loader2, RefreshCw, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Modal } from '../Modal'
import { cloudApi } from '../../services/cloud/cloudApi'
import { listPending, processQueue, resolveConflict, scheduleProcess } from '../../services/cloud/syncEngine'
import { blobStore } from '../../services/storage/blobStore'
import { useLibraryStore } from '../../state/libraryStore'
import { useProjectStore } from '../../state/projectStore'
import { useSnippetStore } from '../../state/snippetStore'
import { useStyleStore } from '../../state/styleStore'
import { useSyncStore } from '../../state/syncStore'
import { useTemplateStore } from '../../state/templateStore'
import { useUiStore } from '../../state/uiStore'
import type { RecordEnvelope } from '../../types'
import { SYNC_STATUS_LABELS } from '../../types/sync'

interface ImportItem {
  envelope: RecordEnvelope
  kind: string
  selected: boolean
  uploadBlobKey?: string
}

/** Painel de sincronização: estado, conflitos e importação inicial segura. */
export function SyncPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sync = useSyncStore()
  const toast = useUiStore((s) => s.toast)
  const [pendingCount, setPendingCount] = useState(0)
  const [importItems, setImportItems] = useState<ImportItem[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (open) void listPending().then((entries) => setPendingCount(entries.length))
  }, [open, sync.pendingCount])

  const scanLocalData = async () => {
    setScanning(true)
    try {
      const items: ImportItem[] = []
      const remoteByKey = new Map<string, string>()
      for (const type of ['project', 'style', 'template', 'snippet', 'asset'] as const) {
        try {
          const { records } = await cloudApi.listRecords(type)
          for (const r of records) remoteByKey.set(`${type}:${r.record_key}`, r.updated_at ?? '')
        } catch {
          // nuvem indisponível: a prévia ainda mostra o que existe localmente
        }
      }
      const push = (envelope: RecordEnvelope, kind: string, uploadBlobKey?: string) => {
        if (remoteByKey.has(`${envelope.record_type}:${envelope.record_key}`)) return
        items.push({ envelope, kind, selected: true, uploadBlobKey })
      }
      const project = useProjectStore.getState().project
      if (project) {
        push(
          {
            record_type: 'project', record_key: project.id, project_key: project.id,
            name: project.name,
            payload: { ...project, slides: undefined, slideIds: project.slides.map((s) => s.id) },
            status: 'active', schema_version: 3,
          },
          `Projeto — ${project.name}`,
        )
        project.slides.forEach((slide, index) =>
          push(
            {
              record_type: 'slide', record_key: slide.id, project_key: project.id, position: index,
              name: slide.plan.title,
              payload: { ...slide, versions: slide.versions.map((v) => ({ ...v, imageDataUrl: undefined, rawImageDataUrl: undefined })) },
              status: 'active', schema_version: 3,
            },
            `Slide ${index + 1} — ${slide.plan.title}`,
          ),
        )
      }
      for (const style of useStyleStore.getState().styles.filter((s) => !s.isSystem)) {
        push({ record_type: 'style', record_key: style.id, name: style.name, payload: style, status: 'active', schema_version: 3 }, `Estilo — ${style.name}`)
      }
      const tplStore = useTemplateStore.getState()
      for (const template of [...tplStore.userTemplates, ...Object.values(tplStore.overrides)]) {
        push({ record_type: 'template', record_key: template.id, name: template.name, payload: template, status: 'active', schema_version: 3 }, `Template — ${template.name}`)
      }
      for (const snippet of useSnippetStore.getState().userSnippets) {
        push({ record_type: 'snippet', record_key: snippet.id, name: snippet.name, payload: snippet, status: 'active', schema_version: 3 }, `Snippet — ${snippet.name}`)
      }
      for (const asset of useLibraryStore.getState().assets.filter((a) => !a.archived)) {
        push(
          { record_type: 'asset', record_key: asset.id, name: asset.name, payload: { ...asset, localBlobKey: undefined }, status: 'active', schema_version: 3 },
          `Ativo — ${asset.name}`,
          asset.storagePath ? undefined : asset.localBlobKey,
        )
      }
      setImportItems(items)
    } finally {
      setScanning(false)
    }
  }

  const runImport = async () => {
    if (!importItems) return
    setImporting(true)
    try {
      const selected = importItems.filter((i) => i.selected)
      // 1. Blobs de ativos sobem primeiro
      for (const item of selected) {
        if (!item.uploadBlobKey) continue
        const blob = await blobStore.get(item.uploadBlobKey)
        if (!blob) continue
        const buffer = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000))
        const uploaded = await cloudApi.upload({
          kind: 'library',
          key: item.envelope.record_key,
          filename: item.envelope.name || 'arquivo',
          mimeType: blob.type || 'application/octet-stream',
          base64: btoa(binary),
        })
        item.envelope.payload = { ...(item.envelope.payload as Record<string, unknown>), storagePath: uploaded.storagePath }
        useLibraryStore.getState().update(item.envelope.record_key, { storagePath: uploaded.storagePath })
      }
      // 2. Registros em lotes
      for (let i = 0; i < selected.length; i += 50) {
        await cloudApi.upsertMany(selected.slice(i, i + 50).map((s) => s.envelope))
      }
      useSyncStore.getState().markSynced()
      toast('success', 'Dados sincronizados', `${selected.length} registros enviados para a nuvem. Os dados locais foram mantidos.`)
      setImportItems(null)
    } catch (error) {
      toast('error', 'Falha na importação', error instanceof Error ? error.message : 'Tente novamente.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={open} title="Sincronização com a nuvem" onClose={onClose} width={640}>
      <div className="sync-panel">
        <div className="sync-status-row">
          {sync.online ? <Cloud size={16} aria-hidden="true" /> : <CloudOff size={16} aria-hidden="true" />}
          <strong>{SYNC_STATUS_LABELS[sync.overall]}</strong>
          {pendingCount > 0 && <span className="badge badge-warning">{pendingCount} pendente(s)</span>}
          {sync.cloudAvailable === false && <span className="badge badge-danger">Nuvem indisponível</span>}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              scheduleProcess(0)
              void processQueue()
            }}
          >
            <RefreshCw size={13} aria-hidden="true" /> Sincronizar agora
          </button>
        </div>

        {sync.conflicts.length > 0 && (
          <div className="sync-conflicts">
            <h4>
              <AlertTriangle size={13} aria-hidden="true" /> Conflitos detectados
            </h4>
            {sync.conflicts.map((conflict) => (
              <div key={conflict.recordKey} className="sync-conflict">
                <div>
                  <strong>{conflict.name}</strong>
                  <small>
                    Remoto atualizado em {new Date(conflict.remoteUpdatedAt).toLocaleString('pt-BR')} — nada foi
                    sobrescrito.
                  </small>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void resolveConflict(conflict.recordType, conflict.recordKey, 'keep-local')}
                >
                  Manter local
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void resolveConflict(conflict.recordType, conflict.recordKey, 'use-remote')}
                >
                  Usar remoto
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="sync-import">
          <h4>Sincronizar dados locais</h4>
          <p className="text-muted">
            Identifica projetos, estilos, templates, snippets e ativos que ainda não estão na nuvem. Nada é
            enviado sem a sua confirmação e os dados locais são mantidos.
          </p>
          {importItems === null ? (
            <button type="button" className="btn btn-ghost" disabled={scanning} onClick={() => void scanLocalData()}>
              {scanning ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <UploadCloud size={14} aria-hidden="true" />}
              {scanning ? 'Analisando dados locais…' : 'Analisar dados locais'}
            </button>
          ) : importItems.length === 0 ? (
            <p className="sync-empty">
              <Check size={13} aria-hidden="true" /> Tudo que existe localmente já está na nuvem.
            </p>
          ) : (
            <>
              <ul className="sync-import-list" aria-label="Registros a enviar">
                {importItems.map((item, index) => (
                  <li key={item.envelope.record_key}>
                    <label className="att-flag">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) =>
                          setImportItems((list) =>
                            list ? list.map((x, i) => (i === index ? { ...x, selected: e.target.checked } : x)) : list,
                          )
                        }
                      />
                      {item.kind}
                    </label>
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportItems(null)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary btn-sm" disabled={importing} onClick={() => void runImport()}>
                  {importing ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <UploadCloud size={13} aria-hidden="true" />}
                  {importing ? 'Enviando…' : `Enviar ${importItems.filter((i) => i.selected).length} registro(s)`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
