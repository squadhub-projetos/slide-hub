import { FileText, ImagePlus, Paperclip, PencilLine, Trash2, ZoomIn } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Modal } from '../Modal'
import { getAttachmentPreviewUrl, useAttachmentStore } from '../../state/attachmentStore'
import { ROLE_LABELS, SCOPE_LABELS } from '../../services/attachments/attachmentLabels'
import { isImageAttachment } from '../../services/attachments/attachmentService'
import type { AttachmentAsset, AttachmentRole, AttachmentScope } from '../../types/attachments'

function AttachmentThumb({ attachment }: { attachment: AttachmentAsset }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (isImageAttachment(attachment)) {
      void getAttachmentPreviewUrl(attachment).then((u) => {
        if (!cancelled) setUrl(u)
      })
    }
    return () => {
      cancelled = true
    }
  }, [attachment])
  if (url) return <img src={url} alt="" draggable={false} />
  return <FileText size={16} aria-hidden="true" />
}

interface MetaModalProps {
  attachment: AttachmentAsset | null
  slideOptions: { id: string; title: string }[]
  onClose: () => void
}

function AttachmentMetaModal({ attachment, slideOptions, onClose }: MetaModalProps) {
  const update = useAttachmentStore((s) => s.update)
  const [draft, setDraft] = useState<AttachmentAsset | null>(attachment)
  const [zoomUrl, setZoomUrl] = useState<string | null>(null)

  useEffect(() => {
    setDraft(attachment)
    setZoomUrl(null)
    if (attachment && isImageAttachment(attachment)) {
      void getAttachmentPreviewUrl(attachment).then(setZoomUrl)
    }
  }, [attachment])

  if (!draft) return null
  const patch = (p: Partial<AttachmentAsset>) => setDraft((d) => (d ? { ...d, ...p } : d))

  const flag = (key: keyof AttachmentAsset, label: string) => (
    <label className="att-flag">
      <input
        type="checkbox"
        checked={Boolean(draft[key])}
        onChange={(e) => patch({ [key]: e.target.checked } as Partial<AttachmentAsset>)}
      />
      {label}
    </label>
  )

  return (
    <Modal
      open={attachment !== null}
      title={`Anexo — ${draft.fileName}`}
      onClose={onClose}
      width={680}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              update(draft.id, draft)
              onClose()
            }}
          >
            Salvar anexo
          </button>
        </>
      }
    >
      <div className="att-meta-grid">
        <div className="att-meta-preview">
          {zoomUrl ? (
            <img src={zoomUrl} alt={draft.name} />
          ) : (
            <div className="att-meta-file">
              <FileText size={28} aria-hidden="true" />
              <span>{draft.mimeType}</span>
            </div>
          )}
          {draft.processingNote && <p className="att-note">{draft.processingNote}</p>}
        </div>
        <div className="att-meta-form">
          <div className="field">
            <label htmlFor="att-name">Nome amigável</label>
            <input id="att-name" className="field-control" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="att-desc">O que o arquivo representa</label>
            <textarea id="att-desc" className="field-control" rows={2} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="att-usage">Como deve ser usado</label>
            <textarea id="att-usage" className="field-control" rows={2} value={draft.usage} onChange={(e) => patch({ usage: e.target.value })} />
          </div>
          <div className="att-meta-row">
            <div className="field">
              <label htmlFor="att-role">Papel</label>
              <select id="att-role" className="field-control" value={draft.role} onChange={(e) => patch({ role: e.target.value as AttachmentRole })}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="att-scope">Escopo</label>
              <select id="att-scope" className="field-control" value={draft.scope} onChange={(e) => patch({ scope: e.target.value as AttachmentScope })}>
                {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          {draft.scope === 'selected-slides' && slideOptions.length > 0 && (
            <div className="field">
              <label>Slides vinculados</label>
              <div className="att-slide-links">
                {slideOptions.map((slide, index) => (
                  <label key={slide.id} className="att-flag">
                    <input
                      type="checkbox"
                      checked={draft.linkedSlideIds.includes(slide.id)}
                      onChange={(e) =>
                        patch({
                          linkedSlideIds: e.target.checked
                            ? [...draft.linkedSlideIds, slide.id]
                            : draft.linkedSlideIds.filter((id) => id !== slide.id),
                        })
                      }
                    />
                    {String(index + 1).padStart(2, '0')} · {slide.title}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="att-flags">
            {flag('required', 'Uso obrigatório')}
            {flag('referenceOnly', 'Apenas referência')}
            {flag('allowCrop', 'Pode ser recortado')}
            {flag('allowTransform', 'Pode ser alterado')}
            {flag('mustAppearExactly', 'Deve aparecer exatamente como enviado')}
          </div>
        </div>
      </div>
    </Modal>
  )
}

interface AttachmentAreaProps {
  ownerId: string
  slideOptions?: { id: string; title: string }[]
  compact?: boolean
  emptyHint?: string
}

/**
 * Experiência completa de anexos: botão, drag and drop, lista visual com
 * metadados e edição. O paste é tratado pelo composer pai via
 * `filesFromClipboard`.
 */
export function AttachmentArea({ ownerId, slideOptions = [], compact = false, emptyHint }: AttachmentAreaProps) {
  const attachments = useAttachmentStore((s) => s.attachments).filter((a) => a.ownerId === ownerId)
  const addFiles = useAttachmentStore((s) => s.addFiles)
  const remove = useAttachmentStore((s) => s.remove)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [editing, setEditing] = useState<AttachmentAsset | null>(null)
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const files = [...event.dataTransfer.files]
    if (files.length > 0) void addFiles(files, ownerId, 'drop')
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    if (files.length > 0) void addFiles(files, ownerId, 'upload')
    event.target.value = ''
  }

  return (
    <div
      className={`att-area ${dragOver ? 'drag' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="visually-hidden"
        onChange={onPick}
        accept="image/*,.pdf,.txt,.csv,.docx,.pptx,.xlsx"
        aria-label="Selecionar arquivos para anexar"
      />
      <div className="att-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()}>
          <Paperclip size={14} aria-hidden="true" /> Anexar arquivos
        </button>
        {!compact && (
          <span className="att-hint">
            <ImagePlus size={12} aria-hidden="true" /> Arraste, cole (Ctrl+V) ou selecione — PNG, JPG, WebP, SVG, GIF, TXT, CSV…
          </span>
        )}
      </div>

      {attachments.length === 0 && emptyHint && <p className="att-empty">{emptyHint}</p>}

      {attachments.length > 0 && (
        <ul className="att-list" aria-label="Anexos">
          {attachments.map((attachment) => (
            <li key={attachment.id} className={`att-item ${attachment.processing}`}>
              <span className="att-thumb">
                <AttachmentThumb attachment={attachment} />
              </span>
              <span className="att-info">
                <strong>{attachment.name || attachment.fileName}</strong>
                <small>
                  {ROLE_LABELS[attachment.role]} · {SCOPE_LABELS[attachment.scope]}
                  {attachment.linkedSlideIds.length > 0 && ` · ${attachment.linkedSlideIds.length} slide(s)`}
                  {attachment.processing === 'unsupported' && ' · não analisado'}
                </small>
                {!compact && attachment.description && <small className="att-desc">{attachment.description}</small>}
              </span>
              <span className="att-actions">
                {isImageAttachment(attachment) && (
                  <button
                    type="button"
                    className="btn-icon"
                    data-tip="Ampliar"
                    aria-label={`Ampliar ${attachment.name}`}
                    onClick={() =>
                      void getAttachmentPreviewUrl(attachment).then(
                        (url) => url && setZoom({ url, name: attachment.name || attachment.fileName }),
                      )
                    }
                  >
                    <ZoomIn size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="btn-icon"
                  data-tip="Editar metadados"
                  aria-label={`Editar ${attachment.name}`}
                  onClick={() => setEditing(attachment)}
                >
                  <PencilLine size={13} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  data-tip="Remover"
                  aria-label={`Remover ${attachment.name}`}
                  onClick={() => void remove(attachment.id)}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <AttachmentMetaModal attachment={editing} slideOptions={slideOptions} onClose={() => setEditing(null)} />

      <Modal open={zoom !== null} title={zoom?.name ?? ''} onClose={() => setZoom(null)} width={860}>
        {zoom && <img src={zoom.url} alt={zoom.name} style={{ width: '100%', borderRadius: 8 }} />}
      </Modal>
    </div>
  )
}
