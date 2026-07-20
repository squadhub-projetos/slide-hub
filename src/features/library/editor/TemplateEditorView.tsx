import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  Columns3,
  Copy,
  Eye,
  EyeOff,
  Grid3x3,
  Group,
  Lock,
  LockOpen,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  Rows3,
  Save,
  Trash2,
  Undo2,
  Ungroup,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStyleStore } from '../../../state/styleStore'
import { useSnippetStore } from '../../../state/snippetStore'
import { useTemplateStore } from '../../../state/templateStore'
import { useUiStore } from '../../../state/uiStore'
import type { LayerTextStyle, SlideTemplate, Snippet, TemplateLayer, TemplateLayerType } from '../../../types'
import { uid } from '../../../utils/id'
import { useTemplateEditor } from './useTemplateEditor'

/**
 * Editor visual de templates 16:9 — workspace com canvas, toolbar,
 * lista de camadas e inspector. Templates oficiais são editados
 * DIRETAMENTE (o salvamento vira um override; "Restaurar padrão" desfaz).
 */

const INSERT_ITEMS: { label: string; make: () => Omit<TemplateLayer, 'id' | 'zIndex'> }[] = [
  { label: 'Título', make: () => textLayer('Título principal', 'title', 44, 'slide.title') },
  { label: 'Subtítulo', make: () => textLayer('Subtítulo', 'subtitle', 24, 'slide.subtitle') },
  { label: 'Caixa de texto', make: () => textLayer('Texto', 'body', 18, '') },
  { label: 'Texto de apoio', make: () => textLayer('Texto de apoio', 'support', 15, '') },
  { label: 'Número em destaque', make: () => textLayer('Número em destaque', 'metric-value', 72, 'slide.metric.value.0') },
  { label: 'Bloco de citação', make: () => textLayer('Frase de efeito', 'quote', 32, 'slide.keyMessage') },
  { label: 'Rodapé', make: () => textLayer('Rodapé institucional', 'footer', 12, 'project.footer') },
  { label: 'Número do slide', make: () => textLayer('Número do slide', 'slide-number', 12, 'slide.number') },
  { label: 'Placeholder de imagem', make: () => base('image-placeholder', 'Imagem de apoio', 0.3, 0.3) },
  { label: 'Imagem (área gerada por IA)', make: () => aiRegion() },
  { label: 'Placeholder de ícone', make: () => base('icon-placeholder', 'Ícone relacionado', 0.05, 0.09) },
  { label: 'Placeholder de gráfico', make: () => base('chart-placeholder', 'Gráfico do indicador', 0.3, 0.3) },
  { label: 'Placeholder de tabela', make: () => base('table-placeholder', 'Tabela', 0.34, 0.3) },
  { label: 'Forma', make: () => shape('Forma', 'auto-surface') },
  { label: 'Card', make: () => shape('Card', 'auto-surface', true) },
  { label: 'Faixa de destaque', make: () => ({ ...shape('Faixa de destaque', 'auto-accent'), height: 0.01 }) },
  { label: 'Linha', make: () => ({ ...base('line', 'Linha', 0.3, 0.004), shape: { fill: 'none', stroke: 'auto', strokeWidth: 1, radius: 0, opacity: 0.5, shadow: false } }) },
  { label: 'Seta', make: () => ({ ...base('arrow', 'Seta', 0.08, 0.04), shape: { fill: 'none', stroke: 'auto', strokeWidth: 2, radius: 0, opacity: 1, shadow: false } }) },
  { label: 'Logo', make: () => base('logo', 'Logo da marca', 0.12, 0.06) },
  { label: 'Ativo da biblioteca', make: () => base('asset', 'Ativo da biblioteca', 0.12, 0.12) },
]

function base(type: TemplateLayerType, name: string, w: number, h: number): Omit<TemplateLayer, 'id' | 'zIndex'> {
  return {
    type, name, placeholderLabel: name,
    x: 0.35, y: 0.35, width: w, height: h,
    rotation: 0, opacity: 1, visible: true, locked: false,
  }
}

function textLayer(name: string, role: TemplateLayer['role'], size: number, binding: string): Omit<TemplateLayer, 'id' | 'zIndex'> {
  return {
    ...base('text-placeholder', name, 0.4, 0.1),
    role,
    binding: binding || undefined,
    text: {
      fontRole: role === 'title' ? 'heading' : role === 'metric-value' ? 'numbers' : 'body',
      size, weight: role === 'title' || role === 'metric-value' ? 700 : 400,
      color: role === 'metric-value' ? 'accent' : role === 'footer' || role === 'support' ? 'muted' : 'auto',
      align: 'left', uppercase: role === 'footer',
      lineHeight: 1.25, maxLines: 3, maxChars: 160, autoShrink: true,
    },
  }
}

function shape(name: string, fill: string, shadow = false): Omit<TemplateLayer, 'id' | 'zIndex'> {
  return {
    ...base('shape', name, 0.24, 0.3),
    shape: { fill, stroke: 'none', strokeWidth: 0, radius: 12, opacity: 1, shadow },
  }
}

function aiRegion(): Omit<TemplateLayer, 'id' | 'zIndex'> {
  return {
    ...base('ai-region', 'Imagem gerada por IA', 0.4, 0.5),
    role: 'background',
    generationBehavior: {
      mode: 'generate', preserveComposition: true, allowCrop: true,
      creativity: 'balanced', localPrompt: '', localNegativePrompt: 'texto, letras, logos',
    },
  }
}

const LAYER_TYPE_LABEL: Record<TemplateLayerType, string> = {
  'text-placeholder': 'Texto',
  'image-placeholder': 'Imagem',
  'icon-placeholder': 'Ícone',
  'chart-placeholder': 'Gráfico',
  'table-placeholder': 'Tabela',
  shape: 'Forma',
  line: 'Linha',
  arrow: 'Seta',
  logo: 'Logo',
  asset: 'Ativo',
  'ai-region': 'Região de IA',
  group: 'Grupo',
}

interface TemplateEditorViewProps {
  template: SlideTemplate
  onClose: () => void
  /** Quando presente, o salvamento é delegado (ex.: edição de camadas de snippet). */
  onSaveOverride?: (name: string, layers: TemplateLayer[]) => void
}

export function TemplateEditorView({ template, onClose, onSaveOverride }: TemplateEditorViewProps) {
  const editor = useTemplateEditor(template.layers)
  const saveTemplate = useTemplateStore((s) => s.saveTemplate)
  const saveAsNew = useTemplateStore((s) => s.saveAsNew)
  const restoreDefault = useTemplateStore((s) => s.restoreDefault)
  const isOverridden = useTemplateStore((s) => s.isOverridden(template.id))
  const saveSnippet = useSnippetStore((s) => s.save)
  const getStyle = useStyleStore((s) => s.getById)
  const toast = useUiStore((s) => s.toast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)

  const [name, setName] = useState(template.name)
  const [aiRef, setAiRef] = useState(template.aiReference ?? {})
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [showGrid, setShowGrid] = useState(true)
  const [insertOpen, setInsertOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; corner?: string; moved: boolean } | null>(null)

  const style = getStyle(template.styleId) ?? useStyleStore.getState().getDefault()
  const primary = editor.selectedLayers[0] ?? null

  // Atalhos de teclado do editor
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const mod = event.ctrlKey || event.metaKey
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        editor.deleteSelected()
      } else if (mod && event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault()
        editor.redo()
      } else if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        editor.undo()
      } else if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        editor.copySelected()
      } else if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        editor.paste()
      } else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        editor.duplicateSelected()
      } else if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        const step = event.shiftKey ? 0.02 : 0.004
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        editor.snapshot()
        editor.moveSelected(dx, dy)
      } else if (event.key === 'Escape') {
        editor.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor])

  const stageSize = useMemo(() => {
    const w = 960 * zoom
    return { width: w, height: w * (9 / 16) }
  }, [zoom])

  const onLayerPointerDown = (event: ReactPointerEvent, layer: TemplateLayer) => {
    event.stopPropagation()
    if (layer.locked) {
      editor.select(layer.id, event.shiftKey)
      return
    }
    if (!editor.selection.includes(layer.id)) editor.select(layer.id, event.shiftKey)
    editor.snapshot()
    dragRef.current = { mode: 'move', startX: event.clientX, startY: event.clientY, moved: false }
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onHandlePointerDown = (event: ReactPointerEvent, corner: string) => {
    event.stopPropagation()
    editor.snapshot()
    dragRef.current = { mode: 'resize', startX: event.clientX, startY: event.clientY, corner, moved: false }
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = (event.clientX - drag.startX) / stageSize.width
    const dy = (event.clientY - drag.startY) / stageSize.height
    if (Math.abs(dx) + Math.abs(dy) < 0.001) return
    drag.moved = true
    drag.startX = event.clientX
    drag.startY = event.clientY
    if (drag.mode === 'move') {
      editor.moveSelected(dx, dy)
    } else {
      editor.patchSelected((l) => {
        let { x, y, width, height } = l
        if (drag.corner?.includes('e')) width = Math.max(0.02, width + dx)
        if (drag.corner?.includes('s')) height = Math.max(0.02, height + dy)
        if (drag.corner?.includes('w')) {
          width = Math.max(0.02, width - dx)
          x = x + dx
        }
        if (drag.corner?.includes('n')) {
          height = Math.max(0.02, height - dy)
          y = y + dy
        }
        return { x, y, width, height }
      }, false)
    }
  }

  const onPointerUp = () => {
    dragRef.current = null
    editor.clearGuides()
  }

  const save = () => {
    if (onSaveOverride) {
      onSaveOverride(name, editor.layers)
      toast('success', 'Camadas salvas')
      return
    }
    saveTemplate({ ...template, name, layers: editor.layers, aiReference: aiRef })
    toast('success', 'Template salvo', template.isSystem ? 'Override aplicado — o oficial pode ser restaurado a qualquer momento.' : undefined)
  }

  const saveSelectionAsSnippet = () => {
    if (editor.selectedLayers.length === 0) return
    const minX = Math.min(...editor.selectedLayers.map((l) => l.x))
    const minY = Math.min(...editor.selectedLayers.map((l) => l.y))
    const now = new Date().toISOString()
    const snippet: Snippet = {
      id: uid('snip'),
      name: `Snippet de ${name}`,
      description: `Criado a partir de uma seleção de ${editor.selectedLayers.length} camada(s) do template "${name}".`,
      category: 'personalizado',
      tags: [],
      aliases: [],
      brandId: template.brandId,
      layers: editor.selectedLayers.map((l, i) => ({ ...l, id: `s${i}`, x: l.x - minX, y: l.y - minY, groupId: undefined })),
      parameters: [],
      usageRules: '',
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    }
    saveSnippet(snippet)
    toast('success', 'Snippet criado', 'A seleção foi salva na biblioteca de snippets — edite nome, aliases e parâmetros por lá.')
  }

  return (
    <div className="tpl-editor" role="dialog" aria-modal="true" aria-label={`Editor de template — ${name}`}>
      <header className="tpl-editor-head">
        <input
          className="field-control tpl-editor-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nome do template"
        />
        {template.isSystem && (
          <span className="badge badge-violet">{isOverridden ? 'Oficial · com override' : 'Oficial'}</span>
        )}
        <span style={{ flex: 1 }} />
        {template.isSystem && isOverridden && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              requestConfirm({
                title: 'Restaurar padrão?',
                message: 'O override será removido e a versão oficial voltará a valer. As suas alterações serão perdidas.',
                confirmLabel: 'Restaurar padrão',
                danger: true,
                onConfirm: () => {
                  restoreDefault(template.id)
                  onClose()
                },
              })
            }
          >
            Restaurar padrão
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const created = saveAsNew({ ...template, layers: editor.layers }, `${name} (novo)`)
            toast('success', 'Salvo como novo', `“${created.name}” foi criado na biblioteca.`)
          }}
        >
          Salvar como novo
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          <X size={14} aria-hidden="true" /> Descartar alterações
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>
          <Save size={14} aria-hidden="true" /> Salvar template
        </button>
      </header>

      <div className="tpl-editor-toolbar" role="toolbar" aria-label="Ferramentas do editor">
        <div style={{ position: 'relative' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setInsertOpen((v) => !v)} aria-expanded={insertOpen}>
            <Plus size={14} aria-hidden="true" /> Inserir
          </button>
          {insertOpen && (
            <div className="tpl-insert-menu" role="menu">
              {INSERT_ITEMS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    editor.addLayer(item.make())
                    setInsertOpen(false)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="tpl-toolbar-sep" />
        <button type="button" className="btn-icon" data-tip="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!editor.canUndo} onClick={editor.undo}><Undo2 size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" disabled={!editor.canRedo} onClick={editor.redo}><Redo2 size={15} /></button>
        <span className="tpl-toolbar-sep" />
        <button type="button" className="btn-icon" data-tip="Duplicar (Ctrl+D)" aria-label="Duplicar" onClick={editor.duplicateSelected}><Copy size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Excluir (Delete)" aria-label="Excluir" onClick={editor.deleteSelected}><Trash2 size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Agrupar" aria-label="Agrupar" onClick={editor.groupSelected}><Group size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Desagrupar" aria-label="Desagrupar" onClick={editor.ungroupSelected}><Ungroup size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Trazer para frente" aria-label="Trazer para frente" onClick={() => editor.reorder('front')}><ArrowUpToLine size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Enviar para trás" aria-label="Enviar para trás" onClick={() => editor.reorder('back')}><ArrowDownToLine size={15} /></button>
        <span className="tpl-toolbar-sep" />
        <button type="button" className="btn-icon" data-tip="Alinhar à esquerda" aria-label="Alinhar à esquerda" onClick={() => editor.align('left')}><AlignStartVertical size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Centralizar na horizontal" aria-label="Centralizar horizontal" onClick={() => editor.align('center-h')}><AlignCenterVertical size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Alinhar à direita" aria-label="Alinhar à direita" onClick={() => editor.align('right')}><AlignEndVertical size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Alinhar ao topo" aria-label="Alinhar ao topo" onClick={() => editor.align('top')}><AlignStartHorizontal size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Centralizar na vertical" aria-label="Centralizar vertical" onClick={() => editor.align('center-v')}><AlignCenterHorizontal size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Alinhar à base" aria-label="Alinhar à base" onClick={() => editor.align('bottom')}><AlignEndHorizontal size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Distribuir na horizontal" aria-label="Distribuir horizontal" onClick={() => editor.distribute('h')}><Columns3 size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Distribuir na vertical" aria-label="Distribuir vertical" onClick={() => editor.distribute('v')}><Rows3 size={15} /></button>
        <span className="tpl-toolbar-sep" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={editor.selection.length === 0} onClick={saveSelectionAsSnippet}>
          Salvar seleção como snippet
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn-icon" data-tip="Grade" aria-label="Alternar grade" onClick={() => setShowGrid((v) => !v)}><Grid3x3 size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Diminuir zoom" aria-label="Diminuir zoom" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}><ZoomOut size={15} /></button>
        <span className="tpl-zoom mono">{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn-icon" data-tip="Aumentar zoom" aria-label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))}><ZoomIn size={15} /></button>
        <button type="button" className="btn-icon" data-tip="Ajustar à tela" aria-label="Ajustar à tela" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}><Maximize2 size={15} /></button>
      </div>

      <div className="tpl-editor-body">
        <aside className="tpl-layer-list" aria-label="Camadas">
          <h4>Camadas</h4>
          {[...editor.layers].sort((a, b) => b.zIndex - a.zIndex).map((layer) => (
            <div
              key={layer.id}
              className={`tpl-layer-row ${editor.selection.includes(layer.id) ? 'on' : ''}`}
              onClick={(e) => editor.select(layer.id, e.shiftKey)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && editor.select(layer.id)}
            >
              <span className="tpl-layer-type">{LAYER_TYPE_LABEL[layer.type]}</span>
              <span className="tpl-layer-name">{layer.name}</span>
              <button
                type="button" className="btn-icon" aria-label={layer.visible ? 'Ocultar' : 'Mostrar'}
                onClick={(e) => { e.stopPropagation(); editor.setLayers((prev) => prev.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l))) }}
              >
                {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button
                type="button" className="btn-icon" aria-label={layer.locked ? 'Desbloquear' : 'Bloquear'}
                onClick={(e) => { e.stopPropagation(); editor.setLayers((prev) => prev.map((l) => (l.id === layer.id ? { ...l, locked: !l.locked } : l))) }}
              >
                {layer.locked ? <Lock size={12} /> : <LockOpen size={12} />}
              </button>
            </div>
          ))}
        </aside>

        <div className="tpl-canvas-wrap" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div
            ref={stageRef}
            className={`tpl-canvas ${showGrid ? 'grid' : ''}`}
            style={{
              width: stageSize.width,
              height: stageSize.height,
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              background: style ? `linear-gradient(135deg, ${style.palette.background}, ${style.palette.surface})` : undefined,
            }}
            onPointerDown={() => editor.select(null)}
          >
            <div className="tpl-safe-area" aria-hidden="true" />
            {editor.guides.v !== null && <div className="tpl-guide v" style={{ left: `${editor.guides.v * 100}%` }} />}
            {editor.guides.h !== null && <div className="tpl-guide h" style={{ top: `${editor.guides.h * 100}%` }} />}
            {[...editor.layers].sort((a, b) => a.zIndex - b.zIndex).map((layer) => {
              const selected = editor.selection.includes(layer.id)
              return (
                <div
                  key={layer.id}
                  className={`tpl-layer ${layer.type} ${selected ? 'selected' : ''} ${layer.locked ? 'locked' : ''} ${layer.visible ? '' : 'hidden-layer'}`}
                  style={{
                    left: `${layer.x * 100}%`,
                    top: `${layer.y * 100}%`,
                    width: `${layer.width * 100}%`,
                    height: `${layer.height * 100}%`,
                    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
                    opacity: layer.visible ? Math.max(0.25, layer.opacity) : 0.15,
                    zIndex: layer.zIndex,
                    borderRadius: layer.shape ? layer.shape.radius : undefined,
                    background:
                      layer.type === 'shape'
                        ? layer.shape?.fill === 'auto-accent'
                          ? style?.palette.accent
                          : `${style?.palette.surface}cc`
                        : undefined,
                  }}
                  onPointerDown={(e) => onLayerPointerDown(e, layer)}
                >
                  <span className="tpl-layer-label">{layer.placeholderLabel ?? layer.name}</span>
                  {selected && !layer.locked && (
                    <>
                      {['nw', 'ne', 'sw', 'se'].map((corner) => (
                        <span
                          key={corner}
                          className={`tpl-handle ${corner}`}
                          onPointerDown={(e) => onHandlePointerDown(e, corner)}
                          role="presentation"
                        />
                      ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <aside className="tpl-inspector" aria-label="Inspector">
          <h4>Inspector</h4>
          {!primary ? (
            <div className="tpl-inspector-fields">
              <p className="text-muted" style={{ fontSize: 12.5 }}>
                Selecione uma camada no canvas ou na lista. Shift+clique seleciona várias.
              </p>
              {/* "Referência para a IA": como o modo Criativo deve se
                  INSPIRAR neste template — linguagem visual, nunca slots.
                  Salvo junto ao template; quando vazio, o perfil é
                  derivado automaticamente das camadas. */}
              <h4 style={{ marginTop: 14 }}>Referência para a IA</h4>
              <div className="field">
                <label htmlFor="tplai-desc">Descrição visual</label>
                <textarea
                  id="tplai-desc"
                  className="field-control"
                  rows={3}
                  placeholder="Atmosfera, composição, contraste — gerado automaticamente quando vazio."
                  value={aiRef.description ?? ''}
                  onChange={(e) => setAiRef((r) => ({ ...r, description: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="tplai-princ">Princípios da composição</label>
                <textarea
                  id="tplai-princ"
                  className="field-control"
                  rows={2}
                  placeholder="O que faz esta composição funcionar."
                  value={aiRef.principles ?? ''}
                  onChange={(e) => setAiRef((r) => ({ ...r, principles: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="tplai-roles">Tipos de slide recomendados</label>
                <input
                  id="tplai-roles"
                  className="field-control"
                  placeholder="abertura, processo, dados…"
                  value={aiRef.suitableRoles ?? ''}
                  onChange={(e) => setAiRef((r) => ({ ...r, suitableRoles: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="tplai-avoid">Padrões a evitar</label>
                <textarea
                  id="tplai-avoid"
                  className="field-control"
                  rows={2}
                  placeholder="O que NUNCA copiar desta referência."
                  value={aiRef.avoid ?? ''}
                  onChange={(e) => setAiRef((r) => ({ ...r, avoid: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="tplai-prompt">Exemplo de prompt</label>
                <textarea
                  id="tplai-prompt"
                  className="field-control"
                  rows={2}
                  placeholder="Prompt no espírito desta referência (opcional)."
                  value={aiRef.examplePrompt ?? ''}
                  onChange={(e) => setAiRef((r) => ({ ...r, examplePrompt: e.target.value }))}
                />
              </div>
              <p className="text-muted" style={{ fontSize: 11.5 }}>
                Usado pelo modo Criativo por IA como linguagem visual — os slots deste template
                nunca são preenchidos automaticamente nesse modo. Salve o template para aplicar.
              </p>
            </div>
          ) : (
            <InspectorFields layer={primary} editor={editor} />
          )}
        </aside>
      </div>
    </div>
  )
}

function InspectorFields({ layer, editor }: { layer: TemplateLayer; editor: ReturnType<typeof useTemplateEditor> }) {
  const patch = (p: Partial<TemplateLayer>) => editor.patchSelected(p)
  const patchText = (p: Partial<LayerTextStyle>) =>
    editor.patchSelected((l) => ({ text: l.text ? { ...l.text, ...p } : l.text }))
  const num = (value: number) => Math.round(value * 1000) / 1000

  return (
    <div className="tpl-inspector-fields">
      <div className="field">
        <label>Nome</label>
        <input className="field-control" value={layer.name} onChange={(e) => patch({ name: e.target.value })} />
      </div>
      <div className="tpl-inspector-grid">
        <div className="field"><label>X</label><input type="number" step={0.01} className="field-control" value={num(layer.x)} onChange={(e) => patch({ x: Number(e.target.value) })} /></div>
        <div className="field"><label>Y</label><input type="number" step={0.01} className="field-control" value={num(layer.y)} onChange={(e) => patch({ y: Number(e.target.value) })} /></div>
        <div className="field"><label>Largura</label><input type="number" step={0.01} className="field-control" value={num(layer.width)} onChange={(e) => patch({ width: Math.max(0.02, Number(e.target.value)) })} /></div>
        <div className="field"><label>Altura</label><input type="number" step={0.01} className="field-control" value={num(layer.height)} onChange={(e) => patch({ height: Math.max(0.02, Number(e.target.value)) })} /></div>
        <div className="field"><label>Rotação</label><input type="number" className="field-control" value={layer.rotation} onChange={(e) => patch({ rotation: Number(e.target.value) })} /></div>
        <div className="field"><label>Opacidade</label><input type="number" step={0.05} min={0} max={1} className="field-control" value={layer.opacity} onChange={(e) => patch({ opacity: Math.max(0, Math.min(1, Number(e.target.value))) })} /></div>
      </div>
      <div className="field">
        <label>Binding (papel semântico)</label>
        <input
          className="field-control mono-area"
          placeholder="slide.title, slide.metric.value.0, asset:n8n…"
          value={layer.binding ?? ''}
          onChange={(e) => patch({ binding: e.target.value || undefined })}
        />
      </div>
      {layer.text && (
        <>
          <div className="tpl-inspector-grid">
            <div className="field"><label>Tamanho</label><input type="number" className="field-control" value={layer.text.size} onChange={(e) => patchText({ size: Number(e.target.value) })} /></div>
            <div className="field">
              <label>Peso</label>
              <select className="field-control" value={layer.text.weight} onChange={(e) => patchText({ weight: Number(e.target.value) })}>
                <option value={400}>Regular</option><option value={600}>Semibold</option><option value={700}>Bold</option>
              </select>
            </div>
            <div className="field">
              <label>Alinhamento</label>
              <select className="field-control" value={layer.text.align} onChange={(e) => patchText({ align: e.target.value as LayerTextStyle['align'] })}>
                <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
              </select>
            </div>
            <div className="field">
              <label>Cor</label>
              <select className="field-control" value={String(layer.text.color)} onChange={(e) => patchText({ color: e.target.value as LayerTextStyle['color'] })}>
                <option value="auto">Automática</option><option value="accent">Destaque</option><option value="muted">Suave</option>
              </select>
            </div>
            <div className="field"><label>Máx. linhas</label><input type="number" min={1} className="field-control" value={layer.text.maxLines} onChange={(e) => patchText({ maxLines: Math.max(1, Number(e.target.value)) })} /></div>
            <div className="field"><label>Máx. caracteres</label><input type="number" min={10} className="field-control" value={layer.text.maxChars} onChange={(e) => patchText({ maxChars: Math.max(10, Number(e.target.value)) })} /></div>
          </div>
          <label className="att-flag">
            <input type="checkbox" checked={layer.text.uppercase} onChange={(e) => patchText({ uppercase: e.target.checked })} />
            Caixa alta
          </label>
          <label className="att-flag">
            <input type="checkbox" checked={layer.text.autoShrink} onChange={(e) => patchText({ autoShrink: e.target.checked })} />
            Redução automática (overflow)
          </label>
        </>
      )}
      {layer.generationBehavior && (
        <>
          <div className="field">
            <label>Comportamento da IA</label>
            <select
              className="field-control"
              value={layer.generationBehavior.mode}
              onChange={(e) =>
                editor.patchSelected((l) => ({
                  generationBehavior: l.generationBehavior ? { ...l.generationBehavior, mode: e.target.value as 'generate' | 'use-attachment' | 'use-library' } : l.generationBehavior,
                }))
              }
            >
              <option value="generate">Gerar imagem</option>
              <option value="use-attachment">Usar anexo</option>
              <option value="use-library">Usar biblioteca</option>
            </select>
          </div>
          <div className="field">
            <label>Prompt local da região</label>
            <textarea
              className="field-control mono-area"
              rows={2}
              value={layer.generationBehavior.localPrompt}
              onChange={(e) =>
                editor.patchSelected((l) => ({
                  generationBehavior: l.generationBehavior ? { ...l.generationBehavior, localPrompt: e.target.value } : l.generationBehavior,
                }))
              }
            />
          </div>
          <div className="field">
            <label>Negative prompt local</label>
            <textarea
              className="field-control mono-area"
              rows={1}
              value={layer.generationBehavior.localNegativePrompt}
              onChange={(e) =>
                editor.patchSelected((l) => ({
                  generationBehavior: l.generationBehavior ? { ...l.generationBehavior, localNegativePrompt: e.target.value } : l.generationBehavior,
                }))
              }
            />
          </div>
        </>
      )}
      <div className="tpl-inspector-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch({ locked: !layer.locked })}>
          {layer.locked ? <LockOpen size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}
          {layer.locked ? 'Desbloquear' : 'Bloquear'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch({ visible: !layer.visible })}>
          {layer.visible ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
          {layer.visible ? 'Ocultar' : 'Mostrar'}
        </button>
        <button type="button" className="btn-icon" aria-label="Diminuir camada" data-tip="- z-index" onClick={() => editor.reorder('back')}><Minus size={13} /></button>
      </div>
    </div>
  )
}
