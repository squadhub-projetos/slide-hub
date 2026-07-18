import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AttachmentArea } from '../../components/attachments/AttachmentArea'
import { BrandLogoOverlay } from '../../components/brand/BrandLogoOverlay'
import { Modal } from '../../components/Modal'
import { ALL_BRANDS } from '../../config/brands'
import { renderStylePreview, SLIDE_FONTS, type StylePreviewKind } from '../../services/ai/slideArtwork'
import type {
  CoBrandingMode,
  CreativityLevel,
  DesignStyle,
  GradientKind,
  IconMode,
  ImageTreatment,
  LogoPlacement,
  ShapeLanguage,
  StructuralPrecision,
  StyleContrast,
  StyleDensity,
  StyleTheme,
  TextureKind,
  VisualLanguage,
  WebAssetPolicy,
} from '../../types'
import { svgToDataUrl } from '../../utils/svg'
import { relativeTime } from '../../utils/time'

const VISUAL_LANGUAGES: { id: VisualLanguage; label: string }[] = [
  { id: 'photographic', label: 'Fotográfico' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'corporate', label: 'Corporativo' },
  { id: 'futuristic', label: 'Futurista' },
  { id: 'technical', label: 'Técnico' },
  { id: 'diagrammatic', label: 'Diagramático' },
  { id: 'illustration', label: 'Ilustração' },
  { id: '3d', label: '3D' },
  { id: 'collage', label: 'Colagem' },
  { id: 'solid-shapes', label: 'Formas sólidas' },
  { id: 'geometric', label: 'Geométrico' },
  { id: 'organic', label: 'Orgânico' },
  { id: 'minimalist', label: 'Minimalista' },
  { id: 'cinematic', label: 'Cinematográfico' },
]

const SHAPES: { id: ShapeLanguage; label: string }[] = [
  { id: 'straight', label: 'Retas' },
  { id: 'rounded', label: 'Arredondadas' },
  { id: 'organic', label: 'Orgânicas' },
  { id: 'angular', label: 'Angulares' },
  { id: 'technical', label: 'Técnicas' },
  { id: 'solid', label: 'Sólidas' },
  { id: 'outlined', label: 'Contornadas' },
  { id: 'asymmetric', label: 'Assimétricas' },
]

const TREATMENTS: { id: ImageTreatment; label: string }[] = [
  { id: 'full-bleed', label: 'Full bleed' },
  { id: 'person-cutout', label: 'Recorte de pessoa' },
  { id: 'framed-photo', label: 'Fotografia em moldura' },
  { id: 'collage', label: 'Colagem' },
  { id: 'duotone', label: 'Duotone' },
  { id: 'monochrome', label: 'Monocromática' },
  { id: 'background-removed', label: 'Fundo removido' },
  { id: 'shape-integrated', label: 'Integração com formas' },
  { id: 'software-screen', label: 'Tela de software' },
  { id: 'device-mockup', label: 'Mockup de dispositivo' },
  { id: 'diagram', label: 'Diagrama' },
  { id: 'texture', label: 'Imagem como textura' },
]

const PREVIEW_KINDS: { id: StylePreviewKind; label: string }[] = [
  { id: 'cover', label: 'Capa' },
  { id: 'process', label: 'Processo' },
  { id: 'indicators', label: 'Indicadores' },
  { id: 'conclusion', label: 'Conclusão' },
]

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="se-group">
      <h4>{title}</h4>
      {children}
    </div>
  )
}

function Slider({
  id, label, value, min, max, step = 1, suffix = '', onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} ({value}{suffix})
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        className="field-control"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function MultiCheck<T extends string>({
  options, values, onChange, label,
}: {
  options: { id: T; label: string }[]
  values: T[]
  onChange: (values: T[]) => void
  label: string
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="se-multicheck" role="group" aria-label={label}>
        {options.map((option) => (
          <label key={option.id} className={`se-check ${values.includes(option.id) ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={values.includes(option.id)}
              onChange={(e) =>
                onChange(e.target.checked ? [...values, option.id] : values.filter((v) => v !== option.id))
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  )
}

interface StyleEditorProps {
  open: boolean
  style: DesignStyle | null
  readOnly?: boolean
  onClose: () => void
  onSave: (style: DesignStyle) => void
}

/** Editor visual completo do estilo, com preview 16:9 em tempo real. */
export function StyleEditor({ open, style, readOnly = false, onClose, onSave }: StyleEditorProps) {
  const [draft, setDraft] = useState<DesignStyle | null>(style)
  const [previewKind, setPreviewKind] = useState<StylePreviewKind>('cover')

  useEffect(() => {
    if (open) {
      setDraft(style)
      setPreviewKind('cover')
    }
  }, [open, style])

  const previewUrl = useMemo(
    () => (draft ? svgToDataUrl(renderStylePreview(draft, previewKind)) : ''),
    [draft, previewKind],
  )

  if (!draft) return null

  const patch = (p: Partial<DesignStyle>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const patchPalette = (key: keyof DesignStyle['palette'], value: string) =>
    setDraft((d) => (d ? { ...d, palette: { ...d.palette, [key]: value } } : d))
  const patchTypo = (p: Partial<DesignStyle['typography']>) =>
    setDraft((d) => (d ? { ...d, typography: { ...d.typography, ...p } } : d))
  const patchGradient = (p: Partial<DesignStyle['gradient']>) =>
    setDraft((d) => (d ? { ...d, gradient: { ...d.gradient, ...p } } : d))
  const patchComposition = (p: Partial<DesignStyle['composition']>) =>
    setDraft((d) => (d ? { ...d, composition: { ...d.composition, ...p } } : d))
  const patchIcons = (p: Partial<DesignStyle['icons']>) =>
    setDraft((d) => (d ? { ...d, icons: { ...d.icons, ...p } } : d))
  const patchImagery = (p: Partial<DesignStyle['imagery']>) =>
    setDraft((d) => (d ? { ...d, imagery: { ...d.imagery, ...p } } : d))
  const patchTexture = (p: Partial<DesignStyle['texture']>) =>
    setDraft((d) => (d ? { ...d, texture: { ...d.texture, ...p } } : d))
  const patchLogoRules = (p: Partial<DesignStyle['logoRules']>) =>
    setDraft((d) => (d ? { ...d, logoRules: { ...d.logoRules, ...p } } : d))
  const patchTextRules = (p: Partial<DesignStyle['textRules']>) =>
    setDraft((d) => (d ? { ...d, textRules: { ...d.textRules, ...p } } : d))

  const colorField = (key: keyof DesignStyle['palette'], label: string) => (
    <div className="field">
      <label htmlFor={`se-color-${key}`}>{label}</label>
      <input
        id={`se-color-${key}`}
        type="color"
        className="field-control"
        value={draft.palette[key]}
        onChange={(e) => patchPalette(key, e.target.value)}
      />
    </div>
  )

  const textArea = (key: keyof DesignStyle['textRules'], label: string, rows = 2) => (
    <div className="field">
      <label htmlFor={`se-tr-${key}`}>{label}</label>
      <textarea
        id={`se-tr-${key}`}
        className="field-control"
        rows={rows}
        value={draft.textRules[key]}
        onChange={(e) => patchTextRules({ [key]: e.target.value })}
      />
    </div>
  )

  return (
    <Modal
      open={open}
      title={readOnly ? `Detalhes — ${draft.name}` : draft.name ? `Editar estilo — ${draft.name}` : 'Novo estilo'}
      onClose={onClose}
      width={1180}
      footer={
        readOnly ? (
          <button type="button" className="btn btn-ghost" onClick={onClose}>Fechar</button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={draft.name.trim() === ''}
              onClick={() => {
                onSave(draft)
                onClose()
              }}
            >
              Salvar estilo
            </button>
          </>
        )
      }
    >
      <div className="style-editor-grid">
        <fieldset className="style-editor-form" disabled={readOnly} style={{ border: 'none', margin: 0, padding: 0 }}>
          <div className="row">
            <div className="field">
              <label htmlFor="se-name">Nome</label>
              <input id="se-name" className="field-control" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="se-client">Cliente</label>
              <input id="se-client" className="field-control" value={draft.client} onChange={(e) => patch({ client: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="se-desc">Descrição</label>
            <textarea id="se-desc" className="field-control" rows={2} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
          </div>

          <Group title="Identidade e logos">
            <div className="row">
              <div className="field">
                <label htmlFor="se-brand">Marca associada</label>
                <select
                  id="se-brand"
                  className="field-control"
                  value={draft.brandId ?? ''}
                  onChange={(e) => patch({ brandId: e.target.value || null })}
                >
                  <option value="">Sem marca (sem logo automático)</option>
                  {ALL_BRANDS.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-cobrand">Co-branding</label>
                <select
                  id="se-cobrand"
                  className="field-control"
                  value={draft.logoRules.coBranding}
                  onChange={(e) => patchLogoRules({ coBranding: e.target.value as CoBrandingMode })}
                >
                  <option value="client-only">Somente cliente</option>
                  <option value="client-plus-squadhub">Cliente + SquadHub</option>
                  <option value="squadhub-only">Somente SquadHub</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="se-logo-pos">Posição do logo</label>
                <select
                  id="se-logo-pos"
                  className="field-control"
                  value={draft.logoRules.placement}
                  onChange={(e) => patchLogoRules({ placement: e.target.value as LogoPlacement })}
                >
                  <option value="top-left">Superior esquerdo</option>
                  <option value="top-right">Superior direito</option>
                  <option value="bottom-left">Inferior esquerdo</option>
                  <option value="bottom-right">Inferior direito</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-logo-variant">Cor do logo</label>
                <select
                  id="se-logo-variant"
                  className="field-control"
                  value={draft.logoRules.variant}
                  onChange={(e) => patchLogoRules({ variant: e.target.value as DesignStyle['logoRules']['variant'] })}
                >
                  <option value="auto">Automática (pelo tema)</option>
                  <option value="color">Colorida</option>
                  <option value="mono-light">Monocromática clara</option>
                  <option value="mono-dark">Monocromática escura</option>
                </select>
              </div>
            </div>
            <div className="row">
              <Slider id="se-logo-w" label="Tamanho do logo" value={draft.logoRules.widthPct} min={4} max={24} suffix="% da largura" onChange={(v) => patchLogoRules({ widthPct: v })} />
              <Slider id="se-logo-safe" label="Margem de segurança" value={draft.logoRules.safeAreaPct} min={2} max={10} suffix="%" onChange={(v) => patchLogoRules({ safeAreaPct: v })} />
            </div>
            <div className="se-flags">
              <label className="se-check">
                <input type="checkbox" checked={draft.logoRules.watermark} onChange={(e) => patchLogoRules({ watermark: e.target.checked })} />
                Marca d’água
              </label>
              <label className="se-check">
                <input type="checkbox" checked={draft.logoRules.required} onChange={(e) => patchLogoRules({ required: e.target.checked })} />
                Uso obrigatório do logo
              </label>
            </div>
          </Group>

          <Group title="Fundo e gradientes">
            <div className="row">
              <div className="field">
                <label htmlFor="se-theme">Tema</label>
                <select id="se-theme" className="field-control" value={draft.theme} onChange={(e) => patch({ theme: e.target.value as StyleTheme })}>
                  <option value="dark">Escuro</option>
                  <option value="light">Claro</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-grad-kind">Gradiente</label>
                <select id="se-grad-kind" className="field-control" value={draft.gradient.kind} onChange={(e) => patchGradient({ kind: e.target.value as GradientKind })}>
                  <option value="none">Sem gradiente</option>
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                  <option value="mesh">Mesh</option>
                  <option value="aurora">Aurora</option>
                  <option value="diffuse">Luz difusa</option>
                </select>
              </div>
            </div>
            <div className="row-3">
              <Slider id="se-grad-int" label="Intensidade" value={draft.gradient.intensity} min={0} max={100} suffix="%" onChange={(v) => patchGradient({ intensity: v })} />
              <Slider id="se-grad-op" label="Opacidade" value={draft.gradient.opacity} min={0} max={100} suffix="%" onChange={(v) => patchGradient({ opacity: v })} />
              <Slider id="se-grad-dir" label="Direção" value={draft.gradient.direction} min={0} max={360} suffix="°" onChange={(v) => patchGradient({ direction: v })} />
            </div>
            <div className="row-3">
              <div className="field">
                <label htmlFor="se-grad-colors">Cores</label>
                <select id="se-grad-colors" className="field-control" value={draft.gradient.colorCount} onChange={(e) => patchGradient({ colorCount: Number(e.target.value) as 2 | 3 })}>
                  <option value={2}>2 cores</option>
                  <option value={3}>3 cores</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-grad-focus">Posição do foco</label>
                <select id="se-grad-focus" className="field-control" value={draft.gradient.focus} onChange={(e) => patchGradient({ focus: e.target.value as DesignStyle['gradient']['focus'] })}>
                  <option value="center">Centro</option>
                  <option value="top">Topo</option>
                  <option value="bottom">Base</option>
                  <option value="corner">Canto</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-grad-solid">Fundo sólido alternativo</label>
                <input id="se-grad-solid" type="color" className="field-control" value={draft.gradient.solidFallback} onChange={(e) => patchGradient({ solidFallback: e.target.value })} />
              </div>
            </div>
            <div className="row-3">
              {colorField('background', 'Fundo')}
              {colorField('surface', 'Superfície')}
              {colorField('text', 'Texto')}
            </div>
            <div className="row-3">
              {colorField('primary', 'Primária')}
              {colorField('secondary', 'Secundária')}
              {colorField('accent', 'Destaque')}
            </div>
          </Group>

          <Group title="Tipografia">
            <div className="row-3">
              <div className="field">
                <label htmlFor="se-font-h">Título</label>
                <select id="se-font-h" className="field-control" value={draft.typography.heading} onChange={(e) => patchTypo({ heading: e.target.value })}>
                  {SLIDE_FONTS.map((f) => (<option key={f}>{f}</option>))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-font-b">Corpo</label>
                <select id="se-font-b" className="field-control" value={draft.typography.body} onChange={(e) => patchTypo({ body: e.target.value })}>
                  {SLIDE_FONTS.map((f) => (<option key={f}>{f}</option>))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-font-n">Números</label>
                <select id="se-font-n" className="field-control" value={draft.typography.numbers} onChange={(e) => patchTypo({ numbers: e.target.value })}>
                  {SLIDE_FONTS.map((f) => (<option key={f}>{f}</option>))}
                </select>
              </div>
            </div>
            <div className="row-3">
              <div className="field">
                <label htmlFor="se-weight">Peso do título</label>
                <select id="se-weight" className="field-control" value={draft.typography.headingWeight} onChange={(e) => patchTypo({ headingWeight: Number(e.target.value) })}>
                  <option value={400}>Regular</option>
                  <option value={600}>Semibold</option>
                  <option value={700}>Bold</option>
                  <option value={800}>Extrabold</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-contrast">Contraste</label>
                <select id="se-contrast" className="field-control" value={draft.contrast} onChange={(e) => patch({ contrast: e.target.value as StyleContrast })}>
                  <option value="low">Baixo</option>
                  <option value="medium">Médio</option>
                  <option value="high">Alto</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-align">Alinhamento</label>
                <select id="se-align" className="field-control" value={draft.typography.alignment} onChange={(e) => patchTypo({ alignment: e.target.value as 'left' | 'center' })}>
                  <option value="left">À esquerda</option>
                  <option value="center">Centralizado</option>
                </select>
              </div>
            </div>
            <div className="row-3">
              <Slider id="se-spacing" label="Espaçamento" value={draft.typography.letterSpacing} min={-2} max={8} step={0.5} suffix="px" onChange={(v) => patchTypo({ letterSpacing: v })} />
              <Slider id="se-levels" label="Níveis tipográficos" value={draft.typography.maxLevels} min={2} max={5} onChange={(v) => patchTypo({ maxLevels: v })} />
              <Slider id="se-scale" label="Tamanho relativo" value={draft.typography.scale} min={80} max={120} suffix="%" onChange={(v) => patchTypo({ scale: v })} />
            </div>
            <label className="se-check">
              <input type="checkbox" checked={draft.typography.uppercaseTitles} onChange={(e) => patchTypo({ uppercaseTitles: e.target.checked })} />
              Títulos em caixa alta
            </label>
          </Group>

          <Group title="Linguagem visual">
            <MultiCheck options={VISUAL_LANGUAGES} values={draft.composition.visualLanguages} onChange={(v) => patchComposition({ visualLanguages: v })} label="Linguagens (selecione uma ou mais)" />
            <div className="field">
              <label htmlFor="se-dominant">Predominante</label>
              <select id="se-dominant" className="field-control" value={draft.composition.dominantLanguage} onChange={(e) => patchComposition({ dominantLanguage: e.target.value as VisualLanguage })}>
                {(draft.composition.visualLanguages.length > 0 ? draft.composition.visualLanguages : ['corporate' as VisualLanguage]).map((id) => (
                  <option key={id} value={id}>{VISUAL_LANGUAGES.find((l) => l.id === id)?.label ?? id}</option>
                ))}
              </select>
            </div>
          </Group>

          <Group title="Formas">
            <MultiCheck options={SHAPES} values={draft.composition.shapes} onChange={(v) => patchComposition({ shapes: v })} label="Vocabulário de formas" />
            <div className="row-3">
              <Slider id="se-radius" label="Arredondamento" value={draft.composition.cornerRadius} min={0} max={32} suffix="px" onChange={(v) => patchComposition({ cornerRadius: v })} />
              <Slider id="se-line" label="Espessura de linha" value={draft.composition.lineWeight} min={0.5} max={4} step={0.1} suffix="px" onChange={(v) => patchComposition({ lineWeight: v })} />
              <Slider id="se-fill" label="Nível de preenchimento" value={draft.composition.fillLevel} min={0} max={100} suffix="%" onChange={(v) => patchComposition({ fillLevel: v })} />
            </div>
            <div className="row-3">
              <Slider id="se-glow" label="Brilho" value={draft.composition.glow} min={0} max={100} suffix="%" onChange={(v) => patchComposition({ glow: v })} />
              <Slider id="se-shadow" label="Sombra" value={draft.composition.shadow} min={0} max={100} suffix="%" onChange={(v) => patchComposition({ shadow: v })} />
              <Slider id="se-transp" label="Transparência" value={draft.composition.transparency} min={0} max={100} suffix="%" onChange={(v) => patchComposition({ transparency: v })} />
            </div>
            <div className="field">
              <label htmlFor="se-density">Densidade</label>
              <select id="se-density" className="field-control" value={draft.density} onChange={(e) => patch({ density: e.target.value as StyleDensity })}>
                <option value="very-clean">Muito limpa</option>
                <option value="clean">Limpa</option>
                <option value="balanced">Equilibrada</option>
                <option value="informative">Informativa</option>
                <option value="dense">Densa</option>
              </select>
            </div>
          </Group>

          <Group title="Ícones">
            <div className="row-3">
              <div className="field">
                <label htmlFor="se-icon-mode">Estilo</label>
                <select id="se-icon-mode" className="field-control" value={draft.icons.mode} onChange={(e) => patchIcons({ mode: e.target.value as IconMode })}>
                  <option value="none">Não usar</option>
                  <option value="linear">Lineares</option>
                  <option value="solid">Sólidos</option>
                  <option value="duotone">Duotone</option>
                  <option value="technical">Técnicos</option>
                  <option value="illustrated">Ilustrados</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-icon-freq">Frequência</label>
                <select id="se-icon-freq" className="field-control" value={draft.icons.frequency} onChange={(e) => patchIcons({ frequency: e.target.value as DesignStyle['icons']['frequency'] })}>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-icon-size">Tamanho</label>
                <select id="se-icon-size" className="field-control" value={draft.icons.size} onChange={(e) => patchIcons({ size: e.target.value as DesignStyle['icons']['size'] })}>
                  <option value="small">Pequeno</option>
                  <option value="medium">Médio</option>
                  <option value="large">Grande</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="se-icon-color">Cor dos ícones</label>
                <input id="se-icon-color" type="color" className="field-control" value={draft.icons.color} onChange={(e) => patchIcons({ color: e.target.value })} />
              </div>
              <div className="se-flags" style={{ alignSelf: 'end' }}>
                <label className="se-check">
                  <input type="checkbox" checked={draft.icons.preferLibrary} onChange={(e) => patchIcons({ preferLibrary: e.target.checked })} />
                  Priorizar biblioteca existente
                </label>
                <label className="se-check">
                  <input type="checkbox" checked={draft.icons.allowGenerated} onChange={(e) => patchIcons({ allowGenerated: e.target.checked })} />
                  Permitir ícones gerados
                </label>
              </div>
            </div>
          </Group>

          <Group title="Tratamento de imagens">
            <MultiCheck options={TREATMENTS} values={draft.imagery.treatments} onChange={(v) => patchImagery({ treatments: v })} label="Tratamentos permitidos" />
            <div className="field">
              <label htmlFor="se-img-dir">Direção das imagens</label>
              <input id="se-img-dir" className="field-control" value={draft.imagery.direction} onChange={(e) => patchImagery({ direction: e.target.value })} />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="se-creativity">Criatividade visual</label>
                <select id="se-creativity" className="field-control" value={draft.composition.creativity} onChange={(e) => patchComposition({ creativity: e.target.value as CreativityLevel })}>
                  <option value="conservative">Conservadora</option>
                  <option value="balanced">Equilibrada</option>
                  <option value="creative">Criativa</option>
                  <option value="experimental">Experimental</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-precision">Precisão estrutural</label>
                <select id="se-precision" className="field-control" value={draft.composition.structuralPrecision} onChange={(e) => patchComposition({ structuralPrecision: e.target.value as StructuralPrecision })}>
                  <option value="organic">Orgânica</option>
                  <option value="balanced">Equilibrada</option>
                  <option value="solid">Formas sólidas e definidas</option>
                  <option value="technical">Técnica e diagramática</option>
                </select>
              </div>
            </div>
          </Group>

          <Group title="Texturas e efeitos">
            <div className="row">
              <div className="field">
                <label htmlFor="se-texture">Textura</label>
                <select id="se-texture" className="field-control" value={draft.texture.kind} onChange={(e) => patchTexture({ kind: e.target.value as TextureKind })}>
                  <option value="none">Nenhuma</option>
                  <option value="grain">Grão leve</option>
                  <option value="paper">Papel</option>
                  <option value="noise">Ruído</option>
                  <option value="grid">Grid</option>
                  <option value="dots">Pontos</option>
                  <option value="tech-lines">Linhas técnicas</option>
                  <option value="reflection">Reflexo</option>
                  <option value="glow">Glow</option>
                  <option value="depth">Profundidade</option>
                  <option value="soft-shadow">Sombra suave</option>
                </select>
              </div>
              <Slider id="se-texture-int" label="Intensidade da textura" value={draft.texture.intensity} min={0} max={100} suffix="%" onChange={(v) => patchTexture({ intensity: v })} />
            </div>
          </Group>

          <Group title="Regras textuais para a IA">
            <div className="field">
              <label htmlFor="se-visual">Direção visual</label>
              <input id="se-visual" className="field-control" value={draft.visualDirection} onChange={(e) => patch({ visualDirection: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="se-comp">Regras de composição</label>
              <input id="se-comp" className="field-control" value={draft.compositionRules} onChange={(e) => patch({ compositionRules: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="se-ai">Instruções positivas (prompt do estilo)</label>
              <textarea id="se-ai" className="field-control" rows={3} value={draft.aiInstructions} onChange={(e) => patch({ aiInstructions: e.target.value })} />
            </div>
            {textArea('requiredElements', 'Elementos obrigatórios')}
            {textArea('forbiddenElements', 'Elementos proibidos')}
            {textArea('negativePrompt', 'Negative prompt')}
            {textArea('usageExamples', 'Exemplos de uso')}
            {textArea('whenNotToUse', 'Quando não usar o estilo')}
            {textArea('maxTextRules', 'Quantidade máxima de texto')}
            {textArea('chartRules', 'Regras de gráficos')}
            {textArea('photoRules', 'Regras de fotografias')}
            {textArea('logoRules', 'Regras de logos')}
            <div className="field">
              <label htmlFor="se-keywords">Palavras-chave (separadas por vírgula)</label>
              <input
                id="se-keywords"
                className="field-control"
                value={draft.keywords.join(', ')}
                onChange={(e) => patch({ keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
              />
            </div>
            <div className="field">
              <label htmlFor="se-webpolicy">Ativos externos</label>
              <select id="se-webpolicy" className="field-control" value={draft.webAssetPolicy} onChange={(e) => patch({ webAssetPolicy: e.target.value as WebAssetPolicy })}>
                <option value="attachments-only">Somente anexos</option>
                <option value="suggest-official">Sugerir ativos oficiais da internet</option>
                <option value="no-external">Não utilizar marcas externas</option>
              </select>
            </div>
          </Group>

          <Group title="Referências e ativos da marca">
            <AttachmentArea
              ownerId={draft.id}
              emptyHint="Logos, exemplos de slides, paletas, ícones, texturas e documentos de identidade visual — com descrição, papel e regras de uso."
            />
          </Group>
        </fieldset>

        <div className="style-editor-preview">
          <div className="se-preview-tabs" role="tablist" aria-label="Tipo de preview">
            {PREVIEW_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                role="tab"
                aria-selected={previewKind === kind.id}
                className={`se-preview-tab ${previewKind === kind.id ? 'on' : ''}`}
                onClick={() => setPreviewKind(kind.id)}
              >
                {kind.label}
              </button>
            ))}
          </div>
          <div className="frame">
            <img src={previewUrl} alt={`Preview do estilo ${draft.name} (${previewKind})`} />
            <BrandLogoOverlay style={draft} />
          </div>
          <div className="caption">
            Preview 16:9 em tempo real · criado {relativeTime(draft.createdAt)} · atualizado {relativeTime(draft.updatedAt)}
            {readOnly && ' · estilo do sistema (somente leitura — duplique para editar)'}
          </div>
        </div>
      </div>
    </Modal>
  )
}
