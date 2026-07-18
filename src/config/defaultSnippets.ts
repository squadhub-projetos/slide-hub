import type { Snippet, TemplateLayer } from '../types'

/** Snippets oficiais — conjuntos reutilizáveis de camadas. */

const SEEDED_AT = '2026-07-17T09:00:00.000Z'
let seq = 0

function sl(partial: Partial<TemplateLayer> & Pick<TemplateLayer, 'type' | 'x' | 'y' | 'width' | 'height'>): TemplateLayer {
  seq += 1
  return {
    id: `sn${seq}`,
    name: partial.name ?? partial.type,
    rotation: 0,
    zIndex: seq,
    opacity: 1,
    visible: true,
    locked: false,
    ...partial,
  }
}

function textLayer(
  x: number, y: number, w: number, h: number,
  opts: { label: string; binding?: string; size?: number; align?: 'left' | 'center' | 'right'; color?: 'auto' | 'accent' | 'muted'; uppercase?: boolean; weight?: number },
): TemplateLayer {
  return sl({
    type: 'text-placeholder',
    x, y, width: w, height: h,
    name: opts.label,
    placeholderLabel: opts.label,
    binding: opts.binding,
    text: {
      fontRole: 'body',
      size: opts.size ?? 16,
      weight: opts.weight ?? 500,
      color: opts.color ?? 'auto',
      align: opts.align ?? 'left',
      uppercase: opts.uppercase ?? false,
      lineHeight: 1.3,
      maxLines: 2,
      maxChars: 140,
      autoShrink: true,
    },
  })
}

function snippet(
  id: string,
  name: string,
  description: string,
  category: string,
  aliases: string[],
  layers: TemplateLayer[],
  parameters: Snippet['parameters'] = [],
  usageRules = '',
): Snippet {
  seq = 0
  return {
    id, name, description, category, aliases,
    tags: aliases,
    brandId: null,
    layers,
    parameters,
    usageRules,
    isSystem: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  }
}

export const SYSTEM_SNIPPETS: Snippet[] = [
  snippet(
    'snip-impact-phrase',
    'Frase de efeito inferior',
    'Faixa inferior com uma frase de destaque no estilo da marca.',
    'destaque',
    ['frase de efeito', 'frase inferior', 'faixa inferior', 'mensagem final'],
    [
      sl({ type: 'shape', x: 0, y: 0.86, width: 1, height: 0.14, name: 'Faixa', shape: { fill: 'auto-surface', stroke: 'none', strokeWidth: 0, radius: 0, opacity: 0.92, shadow: false } }),
      sl({ type: 'shape', x: 0, y: 0.86, width: 1, height: 0.006, name: 'Filete', shape: { fill: 'auto-accent', stroke: 'none', strokeWidth: 0, radius: 0, opacity: 1, shadow: false } }),
      textLayer(0.06, 0.895, 0.82, 0.07, { label: 'Frase de efeito', binding: 'param.phrase', size: 22, weight: 600 }),
      sl({ type: 'icon-placeholder', x: 0.9, y: 0.89, width: 0.035, height: 0.062, name: 'Ícone opcional', placeholderLabel: 'Ícone opcional' }),
    ],
    [
      { id: 'phrase', name: 'Frase', type: 'text', required: true, binding: 'slide.keyMessage' },
      { id: 'alignment', name: 'Alinhamento', type: 'select', required: false, defaultValue: 'left', options: ['left', 'center'] },
    ],
    'Usar uma única frase curta; não empilhar com outros rodapés.',
  ),
  snippet(
    'snip-tool-logos',
    'Logos das ferramentas no canto',
    'Container horizontal de logos de ferramentas/softwares no canto do slide.',
    'marca',
    ['logos das ferramentas', 'logos no canto', 'ferramentas', 'logos de softwares'],
    [
      sl({ type: 'shape', x: 0.62, y: 0.9, width: 0.33, height: 0.07, name: 'Container', shape: { fill: 'auto-surface', stroke: 'none', strokeWidth: 0, radius: 10, opacity: 0.7, shadow: false } }),
      sl({ type: 'asset', x: 0.635, y: 0.912, width: 0.055, height: 0.046, name: 'Logo 1', binding: 'param.logos.0' }),
      sl({ type: 'asset', x: 0.705, y: 0.912, width: 0.055, height: 0.046, name: 'Logo 2', binding: 'param.logos.1' }),
      sl({ type: 'asset', x: 0.775, y: 0.912, width: 0.055, height: 0.046, name: 'Logo 3', binding: 'param.logos.2' }),
      sl({ type: 'asset', x: 0.845, y: 0.912, width: 0.055, height: 0.046, name: 'Logo 4', binding: 'param.logos.3' }),
    ],
    [
      { id: 'logos', name: 'Logos', type: 'asset-list', required: true, binding: 'project.toolLogos' },
      { id: 'monochrome', name: 'Monocromático', type: 'boolean', required: false, defaultValue: false },
      { id: 'position', name: 'Posição', type: 'select', required: false, defaultValue: 'bottom-right', options: ['bottom-right', 'bottom-left', 'top-right'] },
    ],
    'Máximo de 4 logos; resolver ativos por alias na biblioteca — nunca gerar logos.',
  ),
  snippet(
    'snip-next',
    'A seguir',
    'Seta com "A seguir" e o título do próximo slide, no canto inferior direito.',
    'navegação',
    ['a seguir', 'próximo slide', 'próximo assunto', 'seta a seguir'],
    [
      textLayer(0.6, 0.88, 0.12, 0.045, { label: 'A seguir', binding: 'param.label', size: 13, color: 'accent', uppercase: true }),
      sl({ type: 'arrow', x: 0.6, y: 0.93, width: 0.045, height: 0.03, name: 'Seta', shape: { fill: 'none', stroke: 'auto', strokeWidth: 2, radius: 0, opacity: 1, shadow: false } }),
      textLayer(0.66, 0.915, 0.3, 0.055, { label: 'Título do próximo slide', binding: 'slide.next.title', size: 18, weight: 600 }),
    ],
    [
      { id: 'nextSlideTitle', name: 'Título do próximo slide', type: 'slide-reference', required: true, binding: 'slide.next.title' },
      { id: 'label', name: 'Rótulo', type: 'text', required: false, defaultValue: 'A seguir' },
      { id: 'arrowStyle', name: 'Estilo da seta', type: 'select', required: false, defaultValue: 'line', options: ['line', 'solid'] },
      { id: 'position', name: 'Posição', type: 'select', required: false, defaultValue: 'bottom-right', options: ['bottom-right', 'bottom-left'] },
    ],
    'Vincula automaticamente o título do próximo slide do plano.',
  ),
  snippet(
    'snip-kpi',
    'Indicador principal',
    'KPI em destaque com valor grande e rótulo.',
    'dados',
    ['kpi', 'indicador principal', 'kpi em destaque', 'número em destaque'],
    [
      sl({ type: 'shape', x: 0.7, y: 0.12, width: 0.24, height: 0.26, name: 'Card do KPI', shape: { fill: 'auto-surface', stroke: 'none', strokeWidth: 0, radius: 14, opacity: 1, shadow: true } }),
      textLayer(0.72, 0.15, 0.2, 0.12, { label: 'Valor do indicador', binding: 'slide.metric.value.0', size: 44, color: 'accent', weight: 700 }),
      textLayer(0.72, 0.29, 0.2, 0.05, { label: 'Rótulo do indicador', binding: 'slide.metric.label.0', size: 13, color: 'muted', uppercase: true }),
    ],
    [{ id: 'value', name: 'Valor', type: 'text', required: true, binding: 'slide.metric.value.0' }],
  ),
  snippet(
    'snip-footer',
    'Rodapé institucional',
    'Rodapé com nome do projeto, marca e número do slide.',
    'institucional',
    ['rodapé', 'rodapé institucional', 'footer'],
    [
      sl({ type: 'line', x: 0.06, y: 0.925, width: 0.88, height: 0.002, name: 'Linha', shape: { fill: 'none', stroke: 'auto', strokeWidth: 1, radius: 0, opacity: 0.3, shadow: false } }),
      textLayer(0.06, 0.945, 0.5, 0.035, { label: 'Rodapé institucional', binding: 'project.footer', size: 11, color: 'muted', uppercase: true }),
      textLayer(0.88, 0.945, 0.06, 0.035, { label: 'Número do slide', binding: 'slide.number', size: 11, color: 'accent', align: 'right' }),
    ],
  ),
  snippet(
    'snip-section-number',
    'Número de seção',
    'Número grande de seção no canto superior.',
    'navegação',
    ['número de seção', 'seção', 'capítulo'],
    [
      textLayer(0.06, 0.08, 0.14, 0.16, { label: 'Número da seção', binding: 'param.number', size: 64, color: 'accent', weight: 700 }),
      sl({ type: 'line', x: 0.06, y: 0.26, width: 0.06, height: 0.003, name: 'Filete', shape: { fill: 'none', stroke: 'auto', strokeWidth: 2, radius: 0, opacity: 0.8, shadow: false } }),
    ],
    [{ id: 'number', name: 'Número', type: 'number', required: true, defaultValue: 1 }],
  ),
  snippet(
    'snip-confidential',
    'Selo de confidencialidade',
    'Selo discreto de material confidencial.',
    'institucional',
    ['confidencial', 'selo de confidencialidade', 'sigiloso'],
    [
      sl({ type: 'shape', x: 0.8, y: 0.05, width: 0.15, height: 0.05, name: 'Selo', shape: { fill: 'none', stroke: 'auto', strokeWidth: 1, radius: 6, opacity: 0.7, shadow: false } }),
      textLayer(0.8, 0.062, 0.15, 0.03, { label: 'CONFIDENCIAL', binding: 'param.label', size: 10, color: 'muted', align: 'center', uppercase: true }),
    ],
    [{ id: 'label', name: 'Texto', type: 'text', required: false, defaultValue: 'Confidencial' }],
  ),
  snippet(
    'snip-decision',
    'Destaque de decisão',
    'Bloco destacado para a decisão que precisa ser tomada.',
    'destaque',
    ['decisão', 'destaque de decisão', 'aprovação necessária'],
    [
      sl({ type: 'shape', x: 0.06, y: 0.78, width: 0.55, height: 0.13, name: 'Bloco', shape: { fill: 'auto-surface', stroke: 'auto', strokeWidth: 1, radius: 10, opacity: 1, shadow: true } }),
      sl({ type: 'shape', x: 0.06, y: 0.78, width: 0.008, height: 0.13, name: 'Filete', shape: { fill: 'auto-accent', stroke: 'none', strokeWidth: 0, radius: 0, opacity: 1, shadow: false } }),
      textLayer(0.085, 0.795, 0.12, 0.035, { label: 'DECISÃO', size: 11, color: 'accent', uppercase: true }),
      textLayer(0.085, 0.835, 0.5, 0.06, { label: 'Decisão necessária', binding: 'param.decision', size: 17, weight: 600 }),
    ],
    [{ id: 'decision', name: 'Decisão', type: 'text', required: true }],
  ),
  snippet(
    'snip-next-step',
    'Próximo passo',
    'Chamada de próximo passo com seta e prazo.',
    'navegação',
    ['próximo passo', 'proximo passo', 'call to action', 'próxima ação'],
    [
      sl({ type: 'arrow', x: 0.06, y: 0.85, width: 0.05, height: 0.035, name: 'Seta', shape: { fill: 'none', stroke: 'auto', strokeWidth: 2.5, radius: 0, opacity: 1, shadow: false } }),
      textLayer(0.13, 0.845, 0.5, 0.05, { label: 'Próximo passo', binding: 'param.step', size: 19, weight: 600 }),
      textLayer(0.13, 0.9, 0.4, 0.04, { label: 'Prazo/responsável', binding: 'param.deadline', size: 13, color: 'muted' }),
    ],
    [
      { id: 'step', name: 'Próximo passo', type: 'text', required: true },
      { id: 'deadline', name: 'Prazo', type: 'text', required: false },
    ],
  ),
  snippet(
    'snip-data-source',
    'Fonte dos dados',
    'Nota de fonte dos dados no rodapé.',
    'dados',
    ['fonte dos dados', 'fonte', 'referência dos dados'],
    [
      textLayer(0.06, 0.955, 0.6, 0.03, { label: 'Fonte dos dados', binding: 'param.source', size: 10, color: 'muted' }),
    ],
    [{ id: 'source', name: 'Fonte', type: 'text', required: true }],
    'Sempre citar a fonte real — nunca inventar.',
  ),
]

export const SYSTEM_SNIPPET_IDS = new Set(SYSTEM_SNIPPETS.map((s) => s.id))
