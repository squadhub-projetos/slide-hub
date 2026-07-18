import { AnimatePresence, motion } from 'framer-motion'
import { Brush, ImagePlus, Lightbulb, Loader2, Send, X } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import type { AttachmentForAi, RevisionIntensity, Slide } from '../../types'
import { REVISION_INTENSITY_LABELS } from '../../types/generation'
import type { ReviseOptions } from '../../hooks/useSlideGeneration'

/**
 * Atalhos opcionais — a IA entende tudo isso em linguagem natural; o
 * menu existe só como lembrete discreto, nunca como fileira de chips.
 */
const SUGGESTIONS = [
  'Reduza o texto e deixe o título mais forte',
  'Use a imagem que anexei',
  'Destaque o número principal',
  'Deixe mais executivo e direto',
  'Simplifique a composição',
  'Preserve todo o restante',
]

interface RevisionFile {
  name: string
  dataUrl: string
  mimeType: string
}

function readFile(file: File): Promise<RevisionFile | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, dataUrl: reader.result as string, mimeType: file.type })
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

interface RevisionComposerProps {
  slide: Slide
  open: boolean
  defaultVariations: number
  maskDataUrl: string | null
  onOpenMask: () => void
  onClearMask: () => void
  onClose: () => void
  onSubmit: (instructions: string, options: ReviseOptions) => Promise<boolean>
}

/**
 * Solicitação de alterações centrada em linguagem natural: descreva o
 * que deve mudar ("reduza o texto, use a imagem anexada à direita e
 * preserve o restante") — a IA interpreta com base no slide atual,
 * histórico, estilo, anexos e na área marcada. Pausa o contador
 * enquanto estiver aberto.
 */
export function RevisionComposer({
  slide,
  open,
  defaultVariations,
  maskDataUrl,
  onOpenMask,
  onClearMask,
  onClose,
  onSubmit,
}: RevisionComposerProps) {
  const [instructions, setInstructions] = useState('')
  const [files, setFiles] = useState<RevisionFile[]>([])
  const [variations, setVariations] = useState(defaultVariations)
  const [intensity, setIntensity] = useState<RevisionIntensity>('moderate')
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInstructions('')
    setFiles([])
    setVariations(defaultVariations)
    setIntensity('moderate')
    setSuggestionsOpen(false)
  }, [slide.id, defaultVariations])

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!suggestionsOpen) return
    const onDown = (event: MouseEvent) => {
      if (!suggestionsRef.current?.contains(event.target as Node)) setSuggestionsOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [suggestionsOpen])

  const addFiles = async (incoming: File[]) => {
    const read = await Promise.all(incoming.map(readFile))
    setFiles((prev) => [...prev, ...read.filter((f): f is RevisionFile => f !== null)].slice(0, 5))
  }

  const onPaste = (event: ClipboardEvent) => {
    const pasted = [...event.clipboardData.items]
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null)
    if (pasted.length > 0) {
      event.preventDefault()
      void addFiles(pasted)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    void addFiles([...event.dataTransfer.files])
  }

  const submit = async () => {
    const text = instructions.trim()
    if (!text || busy) return
    setBusy(true)
    const extraAttachments: AttachmentForAi[] = files.map((f, i) => ({
      id: `rev-${i}`,
      name: f.name,
      mimeType: f.mimeType,
      role: 'visual-reference',
      description: 'Imagem anexada na solicitação de alteração',
      usage: 'Usar como referência/conteúdo desta revisão',
      mustAppearExactly: false,
      referenceOnly: false,
      allowCrop: true,
      imageDataUrl: f.dataUrl,
    }))
    const ok = await onSubmit(text, {
      variations,
      intensity,
      maskDataUrl: maskDataUrl ?? undefined,
      editScope: maskDataUrl ? 'masked-area' : 'full-slide',
      extraAttachments,
    })
    setBusy(false)
    if (ok) {
      setInstructions('')
      setFiles([])
      onClearMask()
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`revision-composer-wide ${dragOver ? 'drag' : ''}`}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="revision-head">
            <strong>Solicitar alterações</strong>
            <label className="revision-scope" aria-label="Escopo da revisão">
              <select
                className="field-control"
                value={maskDataUrl ? 'masked' : 'full'}
                onChange={(e) => {
                  if (e.target.value === 'masked') onOpenMask()
                  else onClearMask()
                }}
              >
                <option value="full">Slide inteiro</option>
                <option value="masked">Apenas área marcada</option>
              </select>
            </label>
            {maskDataUrl ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClearMask}>
                <X size={12} aria-hidden="true" /> Remover marcação
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenMask}>
                <Brush size={12} aria-hidden="true" /> Marcar área no slide
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn-icon" aria-label="Fechar composer" onClick={onClose}>
              <X size={15} />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="field-control"
            rows={3}
            placeholder="Descreva a alteração com as suas palavras — ex.: “Reduza o texto, deixe o título mais forte e use a imagem anexada à direita. Preserve o restante.”"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onPaste={onPaste}
            aria-label="Instruções de alteração"
          />

          {files.length > 0 && (
            <div className="revision-files">
              {files.map((f, i) => (
                <span key={i} className="revision-file">
                  <img src={f.dataUrl} alt={f.name} />
                  <button
                    type="button"
                    aria-label={`Remover ${f.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="revision-foot">
            <div className="revision-foot-left">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={13} aria-hidden="true" /> Anexar referência
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
              <div className="revision-suggestions" ref={suggestionsRef}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-expanded={suggestionsOpen}
                  aria-haspopup="menu"
                  onClick={() => setSuggestionsOpen((v) => !v)}
                >
                  <Lightbulb size={13} aria-hidden="true" /> Sugestões
                </button>
                {suggestionsOpen && (
                  <div className="revision-suggestions-pop" role="menu" aria-label="Sugestões de alteração">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        onClick={() => {
                          setInstructions((v) => (v ? `${v.replace(/\.?\s*$/, '. ')}${s}` : s))
                          setSuggestionsOpen(false)
                          textareaRef.current?.focus()
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label className="revision-inline-select">
                Intensidade
                <select
                  className="field-control"
                  value={intensity}
                  onChange={(e) => setIntensity(e.target.value as RevisionIntensity)}
                  aria-label="Intensidade da alteração"
                >
                  {(Object.keys(REVISION_INTENSITY_LABELS) as RevisionIntensity[]).map((level) => (
                    <option key={level} value={level}>{REVISION_INTENSITY_LABELS[level]}</option>
                  ))}
                </select>
              </label>
              <label className="revision-inline-select">
                Variações
                <select
                  className="field-control"
                  value={variations}
                  onChange={(e) => setVariations(Number(e.target.value))}
                  aria-label="Variações da revisão"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={instructions.trim() === '' || busy}
              onClick={() => void submit()}
            >
              {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
              {busy ? 'Gerando nova versão…' : 'Gerar nova versão'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
