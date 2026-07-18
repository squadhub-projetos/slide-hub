import { Check, ChevronDown, Search, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { DesignStyle } from '../types'

interface StylePickerProps {
  id?: string
  styles: DesignStyle[]
  value: string | null
  onChange: (styleId: string | null) => void
  /** Rótulo da opção "sem estilo específico" (volta ao padrão da biblioteca). */
  emptyLabel?: string
}

/** Amostra de cores do estilo — preview visual sem carregar imagem. */
function Swatch({ style }: { style: DesignStyle | null }) {
  const colors = style
    ? [style.palette.background, style.palette.primary, style.palette.accent]
    : ['#0b1120', '#334155', '#64748b']
  return (
    <span className="style-swatch" aria-hidden="true">
      {colors.map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  )
}

/**
 * Combobox de estilo visual: busca por nome/cliente/palavras-chave,
 * preview de paleta, favoritos primeiro, navegação por teclado
 * (setas/Enter/Escape) e opção de voltar ao padrão da biblioteca.
 */
export function StylePicker({ id, styles, value, onChange, emptyLabel = 'Padrão da biblioteca' }: StylePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = styles.find((s) => s.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? styles.filter((s) => `${s.name} ${s.client} ${s.keywords.join(' ')}`.toLowerCase().includes(q))
      : [...styles]
    return list.sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        Number(b.isDefault) - Number(a.isDefault) ||
        a.name.localeCompare(b.name),
    )
  }, [styles, query])

  /** null no topo = opção "padrão da biblioteca". */
  const options: (DesignStyle | null)[] = useMemo(() => [null, ...filtered], [filtered])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index, open])

  const choose = (style: DesignStyle | null) => {
    onChange(style?.id ?? null)
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((i) => Math.min(i + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(options[index] ?? null)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="style-picker" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="style-picker-trigger field-control"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Swatch style={selected} />
        <span className="style-picker-name">
          {selected ? selected.name : emptyLabel}
          {selected?.client ? <small> · {selected.client}</small> : null}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <div className="style-picker-pop" role="dialog" aria-label="Escolher estilo visual">
          <div className="style-picker-search">
            <Search size={13} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar estilo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Buscar estilo por nome"
            />
          </div>
          <ul className="style-picker-list" role="listbox" aria-label="Estilos disponíveis" ref={listRef}>
            {options.map((style, i) => {
              const isSelected = (style?.id ?? null) === value
              return (
                <li key={style?.id ?? 'default'} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-active={i === index || undefined}
                    className={`style-picker-item ${i === index ? 'focused' : ''}`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => choose(style)}
                  >
                    <Swatch style={style} />
                    <span className="style-picker-name">
                      {style ? style.name : emptyLabel}
                      {style?.client ? <small> · {style.client}</small> : null}
                    </span>
                    {style?.favorite && <Star size={11} className="style-picker-fav" aria-label="Favorito" />}
                    {isSelected && <Check size={13} className="style-picker-check" aria-hidden="true" />}
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && query && <li className="style-picker-empty">Nenhum estilo encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
