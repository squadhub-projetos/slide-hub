import { motion } from 'framer-motion'
import { Copy, Eye, Palette, PencilLine, Pin, Plus, Search, Star, Trash2, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { BrandLogoOverlay } from '../../components/brand/BrandLogoOverlay'
import {
  defaultComposition,
  defaultGradient,
  defaultIcons,
  defaultImagery,
  defaultLogoRules,
  defaultTextRules,
  defaultTexture,
  defaultTypography,
} from '../../config/defaultStyles'
import { renderStyleThumbnail } from '../../services/ai/slideArtwork'
import { useProjectStore } from '../../state/projectStore'
import { useStyleStore } from '../../state/styleStore'
import { useUiStore } from '../../state/uiStore'
import type { DesignStyle } from '../../types'
import { uid } from '../../utils/id'
import { svgToDataUrl } from '../../utils/svg'
import { StyleEditor } from './StyleEditor'

function blankStyle(): DesignStyle {
  const now = new Date().toISOString()
  return {
    id: uid('style'),
    brandId: null,
    name: '',
    client: 'SquadHub',
    description: '',
    theme: 'dark',
    palette: {
      background: '#070b16',
      surface: '#101a30',
      primary: '#2563eb',
      secondary: '#7c3aed',
      accent: '#22d3ee',
      text: '#e7ecf5',
      muted: '#8b96ab',
    },
    typography: defaultTypography(),
    contrast: 'high',
    gradient: defaultGradient(),
    composition: defaultComposition(),
    icons: defaultIcons(),
    imagery: defaultImagery(),
    texture: defaultTexture(),
    density: 'balanced',
    visualDirection: 'Sóbrio, futurista e de alto contraste',
    compositionRules: 'Um ponto focal por slide, respiro generoso',
    keywords: [],
    aiInstructions: '',
    textRules: defaultTextRules(),
    logoRules: defaultLogoRules({ coBranding: 'client-only', required: false }),
    webAssetPolicy: 'attachments-only',
    brandAssetIds: [],
    isSystem: false,
    favorite: false,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  }
}

interface EditorState {
  style: DesignStyle
  readOnly: boolean
}

function StyleCard({ style, onOpen }: { style: DesignStyle; onOpen: (state: EditorState) => void }) {
  const duplicate = useStyleStore((s) => s.duplicate)
  const remove = useStyleStore((s) => s.remove)
  const toggleFavorite = useStyleStore((s) => s.toggleFavorite)
  const setDefault = useStyleStore((s) => s.setDefault)
  const project = useProjectStore((s) => s.project)
  const patchProject = useProjectStore((s) => s.patchProject)
  const patchPlannerConfig = useProjectStore((s) => s.patchPlannerConfig)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const toast = useUiStore((s) => s.toast)

  const thumb = useMemo(() => svgToDataUrl(renderStyleThumbnail(style)), [style])
  const paletteSwatches: (keyof DesignStyle['palette'])[] = ['background', 'primary', 'secondary', 'accent', 'text']

  const apply = () => {
    if (!project) {
      toast('info', 'Crie um projeto primeiro', 'Use “Novo projeto” no topo para aplicar um estilo.')
      return
    }
    patchProject({ styleId: style.id })
    patchPlannerConfig({ styleId: style.id })
    toast('success', 'Estilo aplicado', `“${style.name}” agora guia a geração desta apresentação.`)
  }

  const duplicateToEdit = () => {
    const copy = duplicate(style.id)
    if (copy) {
      toast('info', 'Cópia criada', 'Você está editando a cópia — o estilo oficial permanece intacto.')
      onOpen({ style: copy, readOnly: false })
    }
  }

  return (
    <motion.article
      className="panel style-card"
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      aria-label={`Estilo ${style.name}`}
    >
      <div className="style-card-thumb">
        <img src={thumb} alt={`Miniatura do estilo ${style.name}`} loading="lazy" />
        <BrandLogoOverlay style={style} />
        <div className="style-card-flags">
          {style.isSystem && <span className="badge badge-violet">Oficial</span>}
          {style.isDefault && <span className="badge badge-cyan">Padrão</span>}
        </div>
        <button
          type="button"
          className={`style-card-fav ${style.favorite ? '' : 'off'}`}
          aria-label={style.favorite ? 'Remover dos favoritos' : 'Marcar como favorito'}
          aria-pressed={style.favorite}
          data-tip={style.favorite ? 'Favorito' : 'Favoritar'}
          onClick={() => toggleFavorite(style.id)}
        >
          <Star size={15} fill={style.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="style-card-body">
        {style.client && <span className="style-card-client">{style.client}</span>}
        <h3>{style.name}</h3>
        <p className="style-card-desc">{style.description}</p>
        <div className="style-card-palette" aria-hidden="true">
          {paletteSwatches.map((key) => (
            <i key={key} style={{ background: style.palette[key] }} title={key} />
          ))}
        </div>
      </div>

      <div className="style-card-foot">
        {style.isSystem ? (
          <>
            <button
              type="button"
              className="btn-icon"
              data-tip="Visualizar detalhes"
              aria-label={`Ver detalhes de ${style.name}`}
              onClick={() => onOpen({ style, readOnly: true })}
            >
              <Eye size={14} />
            </button>
            <button
              type="button"
              className="btn-icon"
              data-tip="Duplicar para editar"
              aria-label={`Duplicar ${style.name} para editar`}
              onClick={duplicateToEdit}
            >
              <Copy size={14} />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-icon" data-tip="Editar" aria-label={`Editar ${style.name}`} onClick={() => onOpen({ style, readOnly: false })}>
              <PencilLine size={14} />
            </button>
            <button
              type="button"
              className="btn-icon"
              data-tip="Duplicar"
              aria-label={`Duplicar ${style.name}`}
              onClick={() => {
                duplicate(style.id)
                toast('success', 'Estilo duplicado')
              }}
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              className="btn-icon"
              data-tip="Excluir"
              aria-label={`Excluir ${style.name}`}
              onClick={() =>
                requestConfirm({
                  title: `Excluir “${style.name}”?`,
                  message: 'O estilo será removido da biblioteca. Apresentações existentes não são alteradas.',
                  confirmLabel: 'Excluir estilo',
                  danger: true,
                  onConfirm: () => {
                    remove(style.id)
                    toast('success', 'Estilo excluído')
                  },
                })
              }
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
        <button
          type="button"
          className="btn-icon"
          data-tip="Definir como padrão"
          aria-label={`Definir ${style.name} como padrão`}
          onClick={() => {
            setDefault(style.id)
            toast('success', 'Estilo padrão atualizado', `Novas apresentações usarão “${style.name}”.`)
          }}
        >
          <Pin size={14} />
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={apply}>
          <Wand2 size={13} aria-hidden="true" /> Aplicar
        </button>
      </div>
    </motion.article>
  )
}

export function StylesView() {
  const styles = useStyleStore((s) => s.styles)
  const upsert = useStyleStore((s) => s.upsert)
  const toast = useUiStore((s) => s.toast)
  const [query, setQuery] = useState('')
  const [client, setClient] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)

  const clients = useMemo(() => [...new Set(styles.map((s) => s.client).filter(Boolean))].sort(), [styles])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return styles.filter((style) => {
      if (client && style.client !== client) return false
      if (onlyFavorites && !style.favorite) return false
      if (!q) return true
      const haystack = `${style.name} ${style.client} ${style.description} ${style.keywords.join(' ')}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [styles, query, client, onlyFavorites])

  return (
    <div className="styles-view">
      <div className="styles-toolbar">
        <h2>
          Biblioteca de <span className="gradient-text">estilos</span>
        </h2>
        <div className="search">
          <Search size={14} aria-hidden="true" />
          <input
            className="field-control"
            type="search"
            placeholder="Pesquisar estilos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Pesquisar estilos"
          />
        </div>
        <select
          className="field-control"
          style={{ width: 180 }}
          value={client}
          onChange={(e) => setClient(e.target.value)}
          aria-label="Filtrar por cliente"
        >
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites((v) => !v)}
          style={onlyFavorites ? { borderColor: 'rgba(251,191,36,.5)', color: '#fde294' } : undefined}
        >
          <Star size={14} fill={onlyFavorites ? 'currentColor' : 'none'} aria-hidden="true" /> Favoritos
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditor({ style: blankStyle(), readOnly: false })}>
          <Plus size={14} aria-hidden="true" /> Criar estilo
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Palette}
            title={styles.length === 0 ? 'Nenhum estilo cadastrado' : 'Nada encontrado'}
            description={
              styles.length === 0
                ? 'Crie o primeiro estilo visual da SquadHub ou de um cliente para reutilizá-lo nas gerações.'
                : 'Nenhum estilo corresponde à busca ou aos filtros atuais.'
            }
            actions={
              <button type="button" className="btn btn-primary" onClick={() => setEditor({ style: blankStyle(), readOnly: false })}>
                <Plus size={15} aria-hidden="true" /> Criar estilo
              </button>
            }
          />
        </div>
      ) : (
        <div className="styles-grid">
          {filtered.map((style) => (
            <StyleCard key={style.id} style={style} onOpen={setEditor} />
          ))}
        </div>
      )}

      <StyleEditor
        open={editor !== null}
        style={editor?.style ?? null}
        readOnly={editor?.readOnly ?? false}
        onClose={() => setEditor(null)}
        onSave={(style) => {
          upsert(style)
          toast('success', 'Estilo salvo', `“${style.name}” está disponível na biblioteca.`)
        }}
      />
    </div>
  )
}
