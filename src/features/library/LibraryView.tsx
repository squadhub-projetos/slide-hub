import { motion } from 'framer-motion'
import { lazy, Suspense, useState } from 'react'
import { StylesView } from '../styles/StylesView'
import { AssetsView } from './AssetsView'
import { SnippetsView } from './SnippetsView'
import { TemplatesView } from './TemplatesView'
import type { SlideTemplate, TemplateLayer } from '../../types'
import './library.css'

const TemplateEditorView = lazy(() =>
  import('./editor/TemplateEditorView').then((m) => ({ default: m.TemplateEditorView })),
)

type LibrarySection = 'styles' | 'templates' | 'snippets' | 'assets'

const SECTIONS: { id: LibrarySection; label: string; hint: string }[] = [
  { id: 'styles', label: 'Estilos', hint: 'Identidade visual das marcas' },
  { id: 'templates', label: 'Templates', hint: 'Layouts concretos de slide' },
  { id: 'snippets', label: 'Snippets', hint: 'Blocos reutilizáveis' },
  { id: 'assets', label: 'Ativos', hint: 'Logos, fotos e arquivos' },
]

interface EditorState {
  template: SlideTemplate
  onSaveOverride?: (name: string, layers: TemplateLayer[]) => void
}

/**
 * Área de identidade e biblioteca visual — Estilos, Templates, Snippets
 * e Ativos numa navegação interna (a navegação global continua com 3 abas).
 */
export function LibraryView() {
  const [section, setSection] = useState<LibrarySection>('styles')
  const [editor, setEditor] = useState<EditorState | null>(null)

  return (
    <div className="library-view">
      <header className="library-head">
        <div>
          <h1>
            Identidade & <span className="gradient-text">biblioteca</span>
          </h1>
          <p className="text-muted">Estilos definem a linguagem; templates definem o layout; snippets e ativos são reutilizáveis em tudo.</p>
        </div>
        <nav className="library-nav" role="tablist" aria-label="Seções da biblioteca">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              className={`library-nav-item ${section === s.id ? 'on' : ''}`}
              onClick={() => setSection(s.id)}
            >
              {section === s.id && (
                <motion.span className="library-nav-pill" layoutId="library-pill" transition={{ type: 'spring', stiffness: 460, damping: 38 }} />
              )}
              <span className="library-nav-label">
                {s.label}
                <small>{s.hint}</small>
              </span>
            </button>
          ))}
        </nav>
      </header>

      <motion.div
        key={section}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        style={{ minHeight: 0, flex: 1 }}
      >
        {section === 'styles' && <StylesView />}
        {section === 'templates' && <TemplatesView onEdit={(template) => setEditor({ template })} />}
        {section === 'snippets' && (
          <SnippetsView onEditLayers={(template, save) => setEditor({ template, onSaveOverride: save })} />
        )}
        {section === 'assets' && <AssetsView />}
      </motion.div>

      {editor && (
        <Suspense fallback={<div className="tpl-editor-loading">Carregando editor…</div>}>
          <TemplateEditorView
            template={editor.template}
            onSaveOverride={editor.onSaveOverride}
            onClose={() => setEditor(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
