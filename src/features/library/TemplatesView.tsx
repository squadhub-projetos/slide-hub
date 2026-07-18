import { Copy, LayoutTemplate, PencilLine, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { renderTemplate } from '../../services/rendering/templateRenderer'
import { useStyleStore } from '../../state/styleStore'
import { useTemplateStore } from '../../state/templateStore'
import { useUiStore } from '../../state/uiStore'
import type { SlideTemplate } from '../../types'
import { samplePlanFor } from './sampleContent'

/** Miniatura REAL do template (renderizada com conteúdo de amostra). */
export function TemplateThumb({ template }: { template: SlideTemplate }) {
  const getStyle = useStyleStore((s) => s.getById)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const style = getStyle(template.styleId) ?? useStyleStore.getState().getDefault()
    if (!style) return
    void renderTemplate({
      template,
      style,
      plan: samplePlanFor(template.kind),
      snippets: [],
      projectName: style.client || 'SquadHub',
      slideNumber: 1,
      totalSlides: 10,
    })
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [template, getStyle])
  return (
    <span className="tpl-thumb">
      {src ? <img src={src} alt={`Miniatura do template ${template.name}`} loading="lazy" /> : <span className="skeleton" style={{ position: 'absolute', inset: 0 }} />}
    </span>
  )
}

interface TemplatesViewProps {
  onEdit: (template: SlideTemplate) => void
}

export function TemplatesView({ onEdit }: TemplatesViewProps) {
  const store = useTemplateStore()
  const styles = useStyleStore((s) => s.styles)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const toast = useUiStore((s) => s.toast)
  const [styleFilter, setStyleFilter] = useState('')
  const [query, setQuery] = useState('')

  const templates = store.all()
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter((t) => {
      if (styleFilter && t.styleId !== styleFilter) return false
      if (!q) return true
      return `${t.name} ${t.kind} ${t.keywords.join(' ')}`.toLowerCase().includes(q)
    })
  }, [templates, styleFilter, query])

  return (
    <div className="lib-section">
      <div className="lib-toolbar">
        <input
          className="field-control"
          type="search"
          placeholder="Buscar templates…"
          style={{ width: 220 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar templates"
        />
        <select className="field-control" style={{ width: 220 }} value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)} aria-label="Filtrar por estilo">
          <option value="">Todos os estilos</option>
          {styles.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onEdit(store.createBlank(styleFilter || styles[0]?.id || null))}
        >
          <Plus size={14} aria-hidden="true" /> Criar template
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <EmptyState icon={LayoutTemplate} title="Nenhum template" description="Nenhum template corresponde à busca/filtros." />
        </div>
      ) : (
        <div className="tpl-grid">
          {filtered.map((template) => (
            <article key={template.id} className="tpl-card" aria-label={`Template ${template.name}`}>
              <TemplateThumb template={template} />
              <div className="tpl-card-body">
                <strong>{template.name}</strong>
                <small>
                  {styles.find((s) => s.id === template.styleId)?.name ?? 'Sem estilo'} · {template.layers.length} camadas
                </small>
                <div className="tpl-card-flags">
                  {template.isSystem && <span className="badge badge-violet">Oficial</span>}
                  {store.isOverridden(template.id) && <span className="badge badge-warning">Override</span>}
                </div>
              </div>
              <div className="tpl-card-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(template)}>
                  <PencilLine size={13} aria-hidden="true" /> Editar template
                </button>
                {store.isOverridden(template.id) && (
                  <button
                    type="button"
                    className="btn-icon"
                    data-tip="Restaurar padrão"
                    aria-label={`Restaurar padrão de ${template.name}`}
                    onClick={() =>
                      requestConfirm({
                        title: 'Restaurar padrão?',
                        message: 'O override será removido e a versão oficial voltará a valer.',
                        confirmLabel: 'Restaurar padrão',
                        danger: true,
                        onConfirm: () => store.restoreDefault(template.id),
                      })
                    }
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="btn-icon"
                  data-tip="Duplicar"
                  aria-label={`Duplicar ${template.name}`}
                  onClick={() => {
                    store.duplicate(template.id)
                    toast('success', 'Template duplicado')
                  }}
                >
                  <Copy size={13} />
                </button>
                {!template.isSystem && (
                  <button
                    type="button"
                    className="btn-icon"
                    data-tip="Excluir"
                    aria-label={`Excluir ${template.name}`}
                    onClick={() =>
                      requestConfirm({
                        title: `Excluir “${template.name}”?`,
                        message: 'O template será removido da biblioteca. Slides já gerados não são alterados.',
                        confirmLabel: 'Excluir template',
                        danger: true,
                        onConfirm: () => store.remove(template.id),
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
    </div>
  )
}
