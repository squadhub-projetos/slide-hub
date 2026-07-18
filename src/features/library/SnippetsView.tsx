import { Copy, PencilLine, Plus, Puzzle, Shapes, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Modal } from '../../components/Modal'
import { useSnippetStore } from '../../state/snippetStore'
import { useUiStore } from '../../state/uiStore'
import type { Snippet, SlideTemplate } from '../../types'
import { uid } from '../../utils/id'

interface SnippetsViewProps {
  onEditLayers: (wrapper: SlideTemplate, save: (name: string, layers: SlideTemplate['layers']) => void) => void
}

/** Biblioteca de snippets: metadados aqui; camadas no editor visual. */
export function SnippetsView({ onEditLayers }: SnippetsViewProps) {
  const store = useSnippetStore()
  const toast = useUiStore((s) => s.toast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const [editing, setEditing] = useState<Snippet | null>(null)

  const snippets = store.all()

  const editLayers = (snippet: Snippet) => {
    const wrapper: SlideTemplate = {
      id: `snippet-wrapper-${snippet.id}`,
      name: snippet.name,
      description: snippet.description,
      styleId: null,
      brandId: snippet.brandId,
      kind: 'snippet',
      keywords: snippet.tags,
      layers: snippet.layers,
      snippetIds: [],
      isSystem: false,
      createdAt: snippet.createdAt,
      updatedAt: snippet.updatedAt,
    }
    onEditLayers(wrapper, (name, layers) => {
      store.save({ ...snippet, name, layers })
    })
  }

  const createBlank = () => {
    const now = new Date().toISOString()
    const snippet: Snippet = {
      id: uid('snip'),
      name: 'Novo snippet',
      description: '',
      category: 'personalizado',
      tags: [],
      aliases: [],
      brandId: null,
      layers: [],
      parameters: [],
      usageRules: '',
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    }
    store.save(snippet)
    setEditing(snippet)
  }

  return (
    <div className="lib-section">
      <div className="lib-toolbar">
        <span className="text-muted" style={{ fontSize: 13 }}>
          Conjuntos reutilizáveis de camadas. Cite-os no planner com <code>@snippet("Nome")</code> ou em linguagem natural.
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={createBlank}>
          <Plus size={14} aria-hidden="true" /> Criar snippet
        </button>
      </div>

      {snippets.length === 0 ? (
        <div className="panel">
          <EmptyState icon={Puzzle} title="Nenhum snippet" description="Crie um snippet vazio ou salve uma seleção do editor de templates." />
        </div>
      ) : (
        <div className="snip-grid">
          {snippets.map((snippet) => (
            <article key={snippet.id} className="snip-card" aria-label={`Snippet ${snippet.name}`}>
              <div className="snip-card-head">
                <Shapes size={15} aria-hidden="true" />
                <strong>{snippet.name}</strong>
                {snippet.isSystem && <span className="badge badge-violet">Oficial</span>}
              </div>
              <p>{snippet.description}</p>
              <small className="text-muted">
                {snippet.layers.length} camada(s) · {snippet.parameters.length} parâmetro(s)
                {snippet.aliases.length > 0 && ` · aliases: ${snippet.aliases.slice(0, 3).join(', ')}`}
              </small>
              <div className="tpl-card-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(snippet)}>
                  <PencilLine size={13} aria-hidden="true" /> Metadados
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => editLayers(snippet)}>
                  <Shapes size={13} aria-hidden="true" /> Camadas
                </button>
                <button
                  type="button" className="btn-icon" data-tip="Duplicar" aria-label={`Duplicar ${snippet.name}`}
                  onClick={() => { store.duplicate(snippet.id); toast('success', 'Snippet duplicado') }}
                >
                  <Copy size={13} />
                </button>
                {!snippet.isSystem && (
                  <button
                    type="button" className="btn-icon" data-tip="Excluir" aria-label={`Excluir ${snippet.name}`}
                    onClick={() =>
                      requestConfirm({
                        title: `Excluir “${snippet.name}”?`,
                        message: 'O snippet será removido da biblioteca.',
                        confirmLabel: 'Excluir snippet',
                        danger: true,
                        onConfirm: () => store.remove(snippet.id),
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <SnippetMetaModal snippet={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function SnippetMetaModal({ snippet, onClose }: { snippet: Snippet | null; onClose: () => void }) {
  const store = useSnippetStore()
  const [draft, setDraft] = useState<Snippet | null>(snippet)
  useEffect(() => setDraft(snippet), [snippet])
  if (!draft) return null
  const patch = (p: Partial<Snippet>) => setDraft((d) => (d ? { ...d, ...p } : d))

  return (
    <Modal
      open={snippet !== null}
      title={`Snippet — ${draft.name}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            type="button" className="btn btn-primary"
            onClick={() => { store.save(draft); onClose() }}
          >
            Salvar
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label>Nome</label>
          <input className="field-control" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>Descrição</label>
          <textarea className="field-control" rows={2} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
        </div>
        <div className="att-meta-row">
          <div className="field">
            <label>Categoria</label>
            <input className="field-control" value={draft.category} onChange={(e) => patch({ category: e.target.value })} />
          </div>
          <div className="field">
            <label>Marca (opcional)</label>
            <input className="field-control" value={draft.brandId ?? ''} onChange={(e) => patch({ brandId: e.target.value || null })} />
          </div>
        </div>
        <div className="field">
          <label>Aliases (separados por vírgula — usados pelo prompt)</label>
          <input
            className="field-control"
            value={draft.aliases.join(', ')}
            onChange={(e) => patch({ aliases: e.target.value.split(',').map((a) => a.trim()).filter(Boolean) })}
          />
        </div>
        <div className="field">
          <label>Tags (separadas por vírgula)</label>
          <input
            className="field-control"
            value={draft.tags.join(', ')}
            onChange={(e) => patch({ tags: e.target.value.split(',').map((a) => a.trim()).filter(Boolean) })}
          />
        </div>
        <div className="field">
          <label>Regras de uso</label>
          <textarea className="field-control" rows={2} value={draft.usageRules} onChange={(e) => patch({ usageRules: e.target.value })} />
        </div>
        {draft.parameters.length > 0 && (
          <div className="field">
            <label>Parâmetros declarados</label>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)' }}>
              {draft.parameters.map((p) => (
                <li key={p.id}>
                  <code>{p.id}</code> ({p.type}){p.required ? ' — obrigatório' : ''}{p.binding ? ` — binding: ${p.binding}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
