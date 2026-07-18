import { Archive, Copy, Grid2x2, Images, List, PencilLine, Plus, Trash2, UploadCloud } from 'lucide-react'
import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Modal } from '../../components/Modal'
import { ALL_BRANDS } from '../../config/brands'
import { useLibraryStore } from '../../state/libraryStore'
import { useProjectStore } from '../../state/projectStore'
import { useSnippetStore } from '../../state/snippetStore'
import { useTemplateStore } from '../../state/templateStore'
import { useUiStore } from '../../state/uiStore'
import type { LibraryAsset, LibraryAssetType } from '../../types'
import { shortHash } from '../../utils/hash'

const TYPE_LABELS: Record<LibraryAssetType, string> = {
  logo: 'Logo', icon: 'Ícone', photo: 'Fotografia', product: 'Produto', person: 'Pessoa',
  screenshot: 'Screenshot', chart: 'Gráfico', diagram: 'Diagrama', illustration: 'Ilustração',
  texture: 'Textura', background: 'Fundo', decorative: 'Decorativo', 'document-reference': 'Documento',
}

function AssetPreview({ asset }: { asset: LibraryAsset }) {
  const previewUrl = useLibraryStore((s) => s.previewUrl)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void previewUrl(asset).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [asset, previewUrl])
  if (!src) return <span className="skeleton" style={{ position: 'absolute', inset: 0 }} />
  return <img src={src} alt={asset.name} loading="lazy" />
}

/** Biblioteca organizacional de ativos reutilizáveis (logo do n8n etc.). */
export function AssetsView() {
  const store = useLibraryStore()
  const toast = useUiStore((s) => s.toast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [editing, setEditing] = useState<LibraryAsset | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const assets = store.assets.filter((a) => !a.archived)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assets.filter((a) => {
      if (typeFilter && a.type !== typeFilter) return false
      if (!q) return true
      return `${a.name} ${a.description} ${a.aliases.join(' ')} ${a.tags.join(' ')}`.toLowerCase().includes(q)
    })
  }, [assets, query, typeFilter])

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      const asset = await store.addFromFile(file)
      if (asset) setEditing(asset)
    }
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles([...(event.target.files ?? [])])
    event.target.value = ''
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    void addFiles([...event.dataTransfer.files])
  }

  return (
    <div
      className={`lib-section ${dragOver ? 'drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="lib-toolbar">
        <input
          className="field-control" type="search" placeholder="Buscar por nome, alias ou tag (ex.: n8n)…"
          style={{ width: 260 }} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar ativos"
        />
        <select className="field-control" style={{ width: 170 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button type="button" className="btn-icon" data-tip="Grade" aria-label="Ver em grade" onClick={() => setView('grid')}><Grid2x2 size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Lista" aria-label="Ver em lista" onClick={() => setView('list')}><List size={15} /></button>
        <span style={{ flex: 1 }} />
        <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
          <Plus size={14} aria-hidden="true" /> Adicionar ativo
          <input type="file" multiple className="visually-hidden" onChange={onPick} accept="image/*,.pdf" />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Images}
            title="Nenhum ativo na biblioteca"
            description="Salve logos (ex.: n8n), fotos, ícones e texturas reutilizáveis. Depois, cite-os pelo nome no planner — 'coloque o logo do n8n no canto' — e a aplicação os encontra por alias."
            actions={
              <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                <UploadCloud size={15} aria-hidden="true" /> Enviar arquivo
                <input type="file" multiple className="visually-hidden" onChange={onPick} accept="image/*,.pdf" />
              </label>
            }
          />
        </div>
      ) : (
        <div className={view === 'grid' ? 'asset-grid' : 'asset-list-view'}>
          {filtered.map((asset) => (
            <article key={asset.id} className="asset-card" aria-label={`Ativo ${asset.name}`}>
              <span className="asset-thumb">
                <AssetPreview asset={asset} />
              </span>
              <div className="asset-body">
                <strong>{asset.name}</strong>
                <small>
                  {TYPE_LABELS[asset.type]} · {asset.scope}
                  {asset.storagePath ? ' · na nuvem' : ' · local'}
                </small>
                {asset.aliases.length > 0 && <small className="text-muted">aliases: {asset.aliases.slice(0, 3).join(', ')}</small>}
              </div>
              <div className="tpl-card-actions">
                <button type="button" className="btn-icon" data-tip="Editar" aria-label={`Editar ${asset.name}`} onClick={() => setEditing(asset)}><PencilLine size={13} /></button>
                <button
                  type="button" className="btn-icon" data-tip="Copiar referência" aria-label={`Copiar referência de ${asset.name}`}
                  onClick={() => {
                    void navigator.clipboard.writeText(`asset:${asset.aliases[0] ?? asset.name}`)
                    toast('success', 'Referência copiada', `Use "${`asset:${asset.aliases[0] ?? asset.name}`}" em prompts e bindings.`)
                  }}
                >
                  <Copy size={13} />
                </button>
                <button type="button" className="btn-icon" data-tip="Arquivar" aria-label={`Arquivar ${asset.name}`} onClick={() => store.archive(asset.id)}><Archive size={13} /></button>
                <button
                  type="button" className="btn-icon" data-tip="Excluir" aria-label={`Excluir ${asset.name}`}
                  onClick={() => {
                    const usage = findUsage(asset)
                    requestConfirm({
                      title: `Excluir “${asset.name}”?`,
                      message: usage.length > 0
                        ? `Este ativo está em uso em: ${usage.join('; ')}. Prefira arquivar. Excluir remove o arquivo do armazenamento quando for seguro.`
                        : 'Nenhum uso encontrado. O arquivo local será removido; o objeto na nuvem é mantido até limpeza segura.',
                      confirmLabel: usage.length > 0 ? 'Excluir mesmo assim' : 'Excluir ativo',
                      danger: true,
                      onConfirm: () => void store.remove(asset.id),
                    })
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <AssetMetaModal asset={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

/** Onde o ativo é usado (templates, snippets e slides do projeto atual). */
function findUsage(asset: LibraryAsset): string[] {
  const usage: string[] = []
  for (const t of useTemplateStore.getState().all()) {
    if (t.layers.some((l) => l.assetId === asset.id)) usage.push(`template "${t.name}"`)
  }
  for (const s of useSnippetStore.getState().all()) {
    if (s.layers.some((l) => l.assetId === asset.id)) usage.push(`snippet "${s.name}"`)
  }
  const project = useProjectStore.getState().project
  if (project?.slides.some((s) => s.plan.attachmentIds.includes(asset.id))) {
    usage.push(`projeto "${project.name}"`)
  }
  return usage
}

function AssetMetaModal({ asset, onClose }: { asset: LibraryAsset | null; onClose: () => void }) {
  const store = useLibraryStore()
  const [draft, setDraft] = useState<LibraryAsset | null>(asset)
  useEffect(() => setDraft(asset), [asset])
  if (!draft) return null
  const patch = (p: Partial<LibraryAsset>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const usage = findUsage(draft)

  return (
    <Modal
      open={asset !== null}
      title={`Ativo — ${draft.name || 'novo'}`}
      onClose={onClose}
      width={680}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            type="button" className="btn btn-primary"
            onClick={() => { store.update(draft.id, draft); onClose() }}
          >
            Salvar ativo
          </button>
        </>
      }
    >
      <div className="att-meta-grid">
        <div className="att-meta-preview">
          <span className="asset-thumb" style={{ position: 'relative', display: 'block', aspectRatio: '16/10' }}>
            <AssetPreview asset={draft} />
          </span>
          <dl className="version-meta" style={{ marginTop: 10 }}>
            <div><dt>Formato</dt><dd>{draft.mimeType}</dd></div>
            <div><dt>Dimensões</dt><dd>{draft.width ? `${draft.width}×${draft.height}` : '—'}</dd></div>
            <div><dt>Tamanho</dt><dd>{Math.round(draft.fileSize / 1024)}KB</dd></div>
            <div><dt>SHA-256</dt><dd className="mono">{shortHash(draft.sha256)}</dd></div>
            <div><dt>Origem</dt><dd>{draft.source}</dd></div>
            <div><dt>Storage</dt><dd className="mono">{draft.storagePath ? '✓ nuvem' : 'local'}</dd></div>
          </dl>
          {usage.length > 0 && (
            <p className="att-note">Em uso: {usage.join('; ')}</p>
          )}
        </div>
        <div className="att-meta-form">
          <div className="field">
            <label>Nome</label>
            <input className="field-control" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div className="field">
            <label>Descrição</label>
            <textarea className="field-control" rows={2} value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Ex.: Logo oficial da plataforma de automação n8n" />
          </div>
          <div className="field">
            <label>Aliases (separados por vírgula — como o prompt encontra este ativo)</label>
            <input
              className="field-control"
              value={draft.aliases.join(', ')}
              placeholder="n8n, logo n8n, automação n8n"
              onChange={(e) => patch({ aliases: e.target.value.split(',').map((a) => a.trim()).filter(Boolean) })}
            />
          </div>
          <div className="att-meta-row">
            <div className="field">
              <label>Tipo</label>
              <select
                className="field-control" value={draft.type}
                onChange={(e) => patch({ type: e.target.value as LibraryAssetType, exactUsage: e.target.value === 'logo' ? true : draft.exactUsage })}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Escopo</label>
              <select className="field-control" value={draft.scope} onChange={(e) => patch({ scope: e.target.value as LibraryAsset['scope'] })}>
                <option value="global">Global</option>
                <option value="brand">Marca</option>
                <option value="project">Projeto</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Marca associada</label>
            <select className="field-control" value={draft.brandId ?? ''} onChange={(e) => patch({ brandId: e.target.value || undefined })}>
              <option value="">Nenhuma</option>
              {ALL_BRANDS.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tags (separadas por vírgula)</label>
            <input
              className="field-control" value={draft.tags.join(', ')}
              onChange={(e) => patch({ tags: e.target.value.split(',').map((a) => a.trim()).filter(Boolean) })}
            />
          </div>
          <div className="att-flags">
            <label className="att-flag">
              <input type="checkbox" checked={draft.exactUsage} onChange={(e) => patch({ exactUsage: e.target.checked })} />
              Utilizar exatamente como enviado (nunca redesenhar)
            </label>
            <label className="att-flag">
              <input type="checkbox" checked={draft.allowCrop} onChange={(e) => patch({ allowCrop: e.target.checked })} />
              Pode recortar
            </label>
            <label className="att-flag">
              <input type="checkbox" checked={draft.allowColorChange} onChange={(e) => patch({ allowColorChange: e.target.checked })} />
              Pode alterar cor (versão monocromática)
            </label>
          </div>
        </div>
      </div>
    </Modal>
  )
}
