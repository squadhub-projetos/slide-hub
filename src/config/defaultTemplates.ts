import type { LayerRole, SlideTemplate, TemplateLayer, TemplateLayerType } from '../types'
import { GAUSTEC_BRAND_ID, GET_CHURCH_BRAND_ID, SQUADHUB_BRAND_ID } from './brands'

/**
 * Templates oficiais — layouts concretos, com camadas e posições reais
 * (coordenadas normalizadas 0..1). Cada builder produz uma ESTRUTURA
 * diferente; os tokens visuais vêm do estilo na renderização.
 */

const SEEDED_AT = '2026-07-17T09:00:00.000Z'
let layerSeq = 0

function layer(
  type: TemplateLayerType,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<TemplateLayer> = {},
): TemplateLayer {
  layerSeq += 1
  return {
    id: `l${layerSeq}`,
    type,
    name: extra.name ?? type,
    x, y, width: w, height: h,
    rotation: 0,
    zIndex: layerSeq,
    opacity: 1,
    visible: true,
    locked: false,
    ...extra,
  }
}

function text(
  role: LayerRole,
  x: number, y: number, w: number, h: number,
  opts: { size?: number; label?: string; binding?: string; align?: 'left' | 'center' | 'right'; weight?: number; color?: 'auto' | 'accent' | 'muted'; maxLines?: number; index?: number } = {},
): TemplateLayer {
  return layer('text-placeholder', x, y, w, h, {
    name: opts.label ?? role,
    role,
    binding: opts.binding ?? bindingForRole(role, opts.index),
    placeholderLabel: opts.label ?? defaultLabel(role),
    contentIndex: opts.index,
    text: {
      fontRole: role === 'metric-value' ? 'numbers' : role === 'title' || role === 'card-title' ? 'heading' : 'body',
      size: opts.size ?? defaultSize(role),
      weight: opts.weight ?? (role === 'title' || role === 'metric-value' ? 700 : role === 'card-title' ? 600 : 400),
      color: opts.color ?? (role === 'kicker' || role === 'metric-value' ? 'accent' : role === 'support' || role === 'footer' ? 'muted' : 'auto'),
      align: opts.align ?? 'left',
      uppercase: role === 'kicker' || role === 'footer',
      lineHeight: 1.22,
      maxLines: opts.maxLines ?? (role === 'title' ? 3 : 4),
      maxChars: role === 'title' ? 90 : 220,
      autoShrink: true,
    },
  })
}

function bindingForRole(role: LayerRole, index?: number): string {
  switch (role) {
    case 'title': return 'slide.title'
    case 'subtitle': return 'slide.subtitle'
    case 'kicker': return 'slide.kicker'
    case 'quote': return 'slide.keyMessage'
    case 'body': case 'card-body': return `slide.content.${index ?? 0}`
    case 'card-title': return `slide.contentTitle.${index ?? 0}`
    case 'metric-value': return `slide.metric.value.${index ?? 0}`
    case 'metric-label': return `slide.metric.label.${index ?? 0}`
    case 'footer': return 'project.footer'
    case 'slide-number': return 'slide.number'
    case 'next-title': return 'slide.next.title'
    default: return ''
  }
}

function defaultLabel(role: LayerRole): string {
  const map: Partial<Record<LayerRole, string>> = {
    title: 'Título principal', subtitle: 'Subtítulo', body: 'Texto de apoio', support: 'Texto de apoio',
    'metric-value': 'Indicador', 'metric-label': 'Rótulo do indicador', quote: 'Frase de efeito',
    kicker: 'Categoria', footer: 'Rodapé institucional', 'card-title': 'Título do card',
    'card-body': 'Texto do card', 'next-title': 'Título do próximo slide',
  }
  return map[role] ?? 'Texto'
}

function defaultSize(role: LayerRole): number {
  const map: Partial<Record<LayerRole, number>> = {
    title: 64, subtitle: 26, kicker: 15, body: 20, support: 18, quote: 44,
    'metric-value': 88, 'metric-label': 16, footer: 12, 'card-title': 21, 'card-body': 15,
    'next-title': 30,
  }
  return map[role] ?? 18
}

function card(x: number, y: number, w: number, h: number, name = 'Card'): TemplateLayer {
  return layer('shape', x, y, w, h, {
    name,
    shape: { fill: 'auto-surface', stroke: 'none', strokeWidth: 0, radius: 12, opacity: 1, shadow: true },
  })
}

function accentBar(x: number, y: number, w: number, h: number): TemplateLayer {
  return layer('shape', x, y, w, h, {
    name: 'Barra de destaque',
    shape: { fill: 'auto-accent', stroke: 'none', strokeWidth: 0, radius: 2, opacity: 1, shadow: false },
  })
}

function aiRegion(x: number, y: number, w: number, h: number, prompt: string, name = 'Imagem gerada por IA'): TemplateLayer {
  return layer('ai-region', x, y, w, h, {
    name,
    role: 'background',
    placeholderLabel: name,
    generationBehavior: {
      mode: 'generate',
      preserveComposition: true,
      allowCrop: true,
      creativity: 'balanced',
      localPrompt: prompt,
      localNegativePrompt: 'texto, letras, logos, marcas',
    },
  })
}

function iconPh(x: number, y: number, size: number, index = 0): TemplateLayer {
  return layer('icon-placeholder', x, y, size, size * (16 / 9), {
    name: 'Ícone relacionado',
    placeholderLabel: 'Ícone relacionado',
    contentIndex: index,
  })
}

function imagePh(x: number, y: number, w: number, h: number, label = 'Imagem de apoio'): TemplateLayer {
  return layer('image-placeholder', x, y, w, h, { name: label, placeholderLabel: label })
}

function footerRow(): TemplateLayer[] {
  return [
    text('footer', 0.06, 0.94, 0.5, 0.035, { align: 'left' }),
    text('slide-number', 0.88, 0.94, 0.06, 0.035, { align: 'right', color: 'accent', label: 'Número do slide' }),
  ]
}

/* ------------------------------------------------------------- builders */

type Builder = () => TemplateLayer[]

const build: Record<string, Builder> = {
  cover: () => [
    aiRegion(0, 0, 1, 1, 'Fundo conceitual de capa alinhado ao tema, com área limpa à esquerda para o título'),
    text('kicker', 0.07, 0.3, 0.5, 0.05),
    accentBar(0.07, 0.365, 0.055, 0.008),
    text('title', 0.07, 0.42, 0.62, 0.3, { size: 76 }),
    text('subtitle', 0.07, 0.72, 0.5, 0.1),
  ],
  coverTech: () => [
    layer('shape', 0, 0, 0.035, 1, { name: 'Faixa lateral', shape: { fill: 'auto-accent', stroke: 'none', strokeWidth: 0, radius: 0, opacity: 1, shadow: false } }),
    text('kicker', 0.09, 0.18, 0.5, 0.05),
    text('title', 0.09, 0.3, 0.58, 0.26, { size: 66 }),
    text('subtitle', 0.09, 0.58, 0.46, 0.1),
    imagePh(0.66, 0.16, 0.28, 0.62, 'Recorte de equipamento'),
    layer('line', 0.09, 0.76, 0.85, 0.002, { name: 'Divisor', shape: { fill: 'none', stroke: 'auto', strokeWidth: 1, radius: 0, opacity: 0.4, shadow: false } }),
    ...footerRow(),
  ],
  coverOrganic: () => [
    aiRegion(0, 0, 1, 1, 'Cenário orgânico suave inspirado em crescimento e conexão, luz difusa, área central limpa'),
    text('kicker', 0.5, 0.3, 0.4, 0.05, { align: 'center' }),
    text('title', 0.15, 0.4, 0.7, 0.24, { size: 68, align: 'center' }),
    text('subtitle', 0.25, 0.66, 0.5, 0.09, { align: 'center' }),
  ],
  titleImage: () => [
    text('kicker', 0.06, 0.12, 0.4, 0.05),
    text('title', 0.06, 0.2, 0.42, 0.24, { size: 46 }),
    text('body', 0.06, 0.47, 0.4, 0.12, { index: 0 }),
    text('body', 0.06, 0.6, 0.4, 0.12, { index: 1 }),
    text('body', 0.06, 0.73, 0.4, 0.12, { index: 2 }),
    aiRegion(0.52, 0.12, 0.42, 0.74, 'Imagem conceitual relacionada ao conteúdo do slide'),
    ...footerRow(),
  ],
  pillars3: () => {
    const layers: TemplateLayer[] = [
      text('title', 0.06, 0.1, 0.7, 0.13, { size: 44 }),
      text('subtitle', 0.06, 0.24, 0.6, 0.07, { size: 20 }),
    ]
    for (let i = 0; i < 3; i++) {
      const x = 0.06 + i * 0.31
      layers.push(
        card(x, 0.36, 0.27, 0.48, `Pilar ${i + 1}`),
        iconPh(x + 0.02, 0.4, 0.045, i),
        text('card-title', x + 0.02, 0.52, 0.23, 0.08, { index: i }),
        text('card-body', x + 0.02, 0.61, 0.23, 0.2, { index: i }),
      )
    }
    return [...layers, ...footerRow()]
  },
  process: () => {
    const layers: TemplateLayer[] = [text('title', 0.06, 0.1, 0.75, 0.12, { size: 42 })]
    for (let i = 0; i < 4; i++) {
      const x = 0.06 + i * 0.235
      layers.push(
        layer('shape', x, 0.32, 0.05, 0.089, {
          name: `Etapa ${i + 1}`,
          shape: { fill: 'auto-accent', stroke: 'none', strokeWidth: 0, radius: 999, opacity: 1, shadow: false },
        }),
        text('card-title', x, 0.46, 0.2, 0.07, { index: i, size: 19 }),
        text('card-body', x, 0.54, 0.2, 0.24, { index: i }),
      )
      if (i < 3) {
        layers.push(layer('arrow', x + 0.16, 0.35, 0.06, 0.03, { name: 'Conector', shape: { fill: 'none', stroke: 'auto', strokeWidth: 2, radius: 0, opacity: 0.6, shadow: false } }))
      }
    }
    return [...layers, ...footerRow()]
  },
  processAngular: () => {
    const layers: TemplateLayer[] = [text('title', 0.06, 0.09, 0.8, 0.12, { size: 40 })]
    for (let i = 0; i < 5; i++) {
      const x = 0.05 + i * 0.185
      layers.push(
        layer('shape', x, 0.3, 0.165, 0.12, {
          name: `Fase ${i + 1}`,
          shape: { fill: i === 4 ? 'auto-accent' : 'auto-surface', stroke: 'auto', strokeWidth: 1, radius: 2, opacity: 1, shadow: false },
        }),
        text('card-title', x + 0.012, 0.325, 0.14, 0.07, { index: i, size: 15 }),
        text('card-body', x + 0.012, 0.46, 0.14, 0.3, { index: i, size: 13 }),
      )
    }
    return [...layers, layer('line', 0.05, 0.44, 0.88, 0.002, { name: 'Linha de fluxo', shape: { fill: 'none', stroke: 'auto', strokeWidth: 1, radius: 0, opacity: 0.35, shadow: false } }), ...footerRow()]
  },
  cards6: () => {
    const layers: TemplateLayer[] = [text('title', 0.06, 0.08, 0.75, 0.11, { size: 40 })]
    for (let i = 0; i < 6; i++) {
      const x = 0.06 + (i % 3) * 0.31
      const y = 0.24 + Math.floor(i / 3) * 0.34
      layers.push(
        card(x, y, 0.27, 0.29, `Card ${i + 1}`),
        iconPh(x + 0.018, y + 0.03, 0.032, i),
        text('card-title', x + 0.075, y + 0.045, 0.175, 0.07, { index: i, size: 17 }),
        text('card-body', x + 0.018, y + 0.13, 0.23, 0.14, { index: i, size: 13 }),
      )
    }
    return [...layers, ...footerRow()]
  },
  indicators: () => {
    const layers: TemplateLayer[] = [text('title', 0.06, 0.1, 0.7, 0.12, { size: 42 })]
    for (let i = 0; i < 3; i++) {
      const x = 0.06 + i * 0.31
      layers.push(
        accentBar(x, 0.34, 0.04, 0.007),
        text('metric-value', x, 0.38, 0.27, 0.2, { index: i }),
        text('metric-label', x, 0.6, 0.27, 0.06, { index: i }),
        text('card-body', x, 0.67, 0.27, 0.14, { index: i, size: 14 }),
      )
    }
    return [...layers, ...footerRow()]
  },
  indicators4: () => {
    const layers: TemplateLayer[] = [text('title', 0.06, 0.09, 0.75, 0.11, { size: 40 })]
    for (let i = 0; i < 4; i++) {
      const x = 0.06 + i * 0.23
      layers.push(
        card(x, 0.28, 0.2, 0.46, `Indicador ${i + 1}`),
        text('metric-value', x + 0.015, 0.33, 0.17, 0.16, { index: i, size: 54 }),
        text('metric-label', x + 0.015, 0.52, 0.17, 0.06, { index: i }),
        text('card-body', x + 0.015, 0.59, 0.17, 0.12, { index: i, size: 13 }),
      )
    }
    return [...layers, text('support', 0.06, 0.8, 0.6, 0.06, { label: 'Fonte dos dados' }), ...footerRow()]
  },
  comparison: () => [
    text('title', 0.06, 0.09, 0.8, 0.11, { size: 42 }),
    card(0.06, 0.24, 0.42, 0.6, 'Painel A'),
    text('card-title', 0.09, 0.28, 0.36, 0.07, { index: 0 }),
    text('card-body', 0.09, 0.38, 0.36, 0.4, { index: 0 }),
    card(0.52, 0.24, 0.42, 0.6, 'Painel B'),
    accentBar(0.52, 0.24, 0.42, 0.008),
    text('card-title', 0.55, 0.28, 0.36, 0.07, { index: 1, color: 'accent' }),
    text('card-body', 0.55, 0.38, 0.36, 0.4, { index: 1 }),
    ...footerRow(),
  ],
  impact: () => [
    aiRegion(0, 0, 1, 1, 'Fundo dramático e minimalista com profundidade, sem elementos que disputem com o texto'),
    accentBar(0.44, 0.3, 0.12, 0.008),
    text('quote', 0.12, 0.38, 0.76, 0.26, { align: 'center', size: 48 }),
    text('support', 0.3, 0.68, 0.4, 0.06, { align: 'center' }),
  ],
  conclusion: () => {
    const layers: TemplateLayer[] = [text('title', 0.06, 0.1, 0.8, 0.14, { size: 48 })]
    for (let i = 0; i < 3; i++) {
      const y = 0.32 + i * 0.17
      layers.push(
        text('metric-value', 0.06, y, 0.07, 0.11, { index: i, size: 40, label: 'Número de seção' }),
        text('card-body', 0.16, y + 0.015, 0.7, 0.13, { index: i, size: 19 }),
        layer('line', 0.16, y + 0.135, 0.78, 0.002, { name: 'Divisor', shape: { fill: 'none', stroke: 'auto', strokeWidth: 1, radius: 0, opacity: 0.25, shadow: false } }),
      )
    }
    return [...layers, ...footerRow()]
  },
  conclusionExec: () => [
    text('title', 0.06, 0.1, 0.55, 0.13, { size: 44 }),
    text('body', 0.06, 0.28, 0.5, 0.14, { index: 0 }),
    text('body', 0.06, 0.44, 0.5, 0.14, { index: 1 }),
    text('body', 0.06, 0.6, 0.5, 0.14, { index: 2 }),
    card(0.62, 0.28, 0.32, 0.46, 'Destaque de decisão'),
    accentBar(0.62, 0.28, 0.32, 0.008),
    text('card-title', 0.645, 0.33, 0.27, 0.07, { index: 3, label: 'Decisão necessária' }),
    text('card-body', 0.645, 0.42, 0.27, 0.26, { index: 3 }),
    ...footerRow(),
  ],
  nextTopic: () => [
    text('kicker', 0.08, 0.36, 0.3, 0.05, { label: 'A seguir' }),
    layer('arrow', 0.08, 0.47, 0.09, 0.05, { name: 'Seta', shape: { fill: 'none', stroke: 'auto', strokeWidth: 3, radius: 0, opacity: 1, shadow: false } }),
    text('next-title', 0.2, 0.44, 0.65, 0.16, { size: 52 }),
    text('support', 0.2, 0.62, 0.5, 0.07),
  ],
  timeline: () => {
    const layers: TemplateLayer[] = [
      text('title', 0.06, 0.1, 0.75, 0.12, { size: 42 }),
      layer('line', 0.08, 0.52, 0.84, 0.003, { name: 'Linha do tempo', shape: { fill: 'none', stroke: 'auto', strokeWidth: 2, radius: 0, opacity: 0.5, shadow: false } }),
    ]
    for (let i = 0; i < 4; i++) {
      const x = 0.09 + i * 0.225
      const above = i % 2 === 0
      layers.push(
        layer('shape', x, 0.505, 0.016, 0.028, { name: `Marco ${i + 1}`, shape: { fill: 'auto-accent', stroke: 'none', strokeWidth: 0, radius: 999, opacity: 1, shadow: false } }),
        text('card-title', x - 0.02, above ? 0.3 : 0.6, 0.2, 0.06, { index: i, size: 16, color: 'accent' }),
        text('card-body', x - 0.02, above ? 0.36 : 0.66, 0.2, 0.14, { index: i, size: 13 }),
      )
    }
    return [...layers, ...footerRow()]
  },
  beforeAfter: () => [
    text('title', 0.06, 0.09, 0.8, 0.11, { size: 40 }),
    text('card-title', 0.06, 0.25, 0.4, 0.06, { index: 0, label: 'Antes' }),
    imagePh(0.06, 0.33, 0.4, 0.42, 'Situação anterior'),
    text('card-body', 0.06, 0.77, 0.4, 0.1, { index: 0, size: 14 }),
    text('card-title', 0.54, 0.25, 0.4, 0.06, { index: 1, label: 'Depois', color: 'accent' }),
    imagePh(0.54, 0.33, 0.4, 0.42, 'Situação atual'),
    text('card-body', 0.54, 0.77, 0.4, 0.1, { index: 1, size: 14 }),
    layer('arrow', 0.475, 0.5, 0.05, 0.05, { name: 'Seta', shape: { fill: 'none', stroke: 'auto', strokeWidth: 3, radius: 0, opacity: 1, shadow: false } }),
    ...footerRow(),
  ],
  risksActions: () => {
    const layers: TemplateLayer[] = [
      text('title', 0.06, 0.09, 0.8, 0.11, { size: 40 }),
      text('card-title', 0.06, 0.23, 0.42, 0.06, { index: 0, label: 'Risco' }),
      text('card-title', 0.54, 0.23, 0.4, 0.06, { index: 1, label: 'Ação', color: 'accent' }),
    ]
    for (let i = 0; i < 3; i++) {
      const y = 0.31 + i * 0.19
      layers.push(
        card(0.06, y, 0.42, 0.16, `Risco ${i + 1}`),
        text('card-body', 0.08, y + 0.03, 0.38, 0.11, { index: i * 2, size: 15 }),
        card(0.54, y, 0.4, 0.16, `Ação ${i + 1}`),
        text('card-body', 0.56, y + 0.03, 0.36, 0.11, { index: i * 2 + 1, size: 15 }),
      )
    }
    return [...layers, ...footerRow()]
  },
  people: () => {
    const layers: TemplateLayer[] = [text('title', 0.06, 0.09, 0.8, 0.12, { size: 42 })]
    for (let i = 0; i < 4; i++) {
      const x = 0.08 + i * 0.22
      layers.push(
        imagePh(x, 0.28, 0.17, 0.3, 'Foto da pessoa'),
        text('card-title', x, 0.62, 0.17, 0.06, { index: i, size: 17, align: 'center' }),
        text('card-body', x, 0.69, 0.17, 0.1, { index: i, size: 13, align: 'center' }),
      )
    }
    return [...layers, ...footerRow()]
  },
  launch: () => [
    aiRegion(0, 0, 1, 1, 'Cenário de lançamento com energia e profundidade, área central limpa'),
    text('kicker', 0.5, 0.26, 0.3, 0.05, { align: 'center' }),
    text('title', 0.15, 0.34, 0.7, 0.22, { size: 62, align: 'center' }),
    layer('shape', 0.38, 0.62, 0.24, 0.1, { name: 'Botão de ação', shape: { fill: 'auto-accent', stroke: 'none', strokeWidth: 0, radius: 999, opacity: 1, shadow: true } }),
    text('support', 0.38, 0.648, 0.24, 0.05, { align: 'center', label: 'Chamada para ação', color: 'auto' }),
  ],
}

/* ------------------------------------------------------------- catálogo */

interface TemplateSpec {
  key: string
  name: string
  kind: string
  builder: keyof typeof build
  keywords: string[]
}

function makeSet(styleId: string, brandId: string, prefix: string, specs: TemplateSpec[]): SlideTemplate[] {
  return specs.map((spec) => {
    layerSeq = 0
    return {
      id: `tpl-${prefix}-${spec.key}`,
      name: spec.name,
      description: `${spec.name} — template oficial do estilo.`,
      styleId,
      brandId,
      kind: spec.kind,
      keywords: spec.keywords,
      layers: build[spec.builder](),
      snippetIds: [],
      isSystem: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    }
  })
}

const SQUADHUB_SPECS: TemplateSpec[] = [
  { key: 'cover', name: 'Capa', kind: 'cover', builder: 'cover', keywords: ['capa', 'abertura'] },
  { key: 'title-image', name: 'Título + imagem', kind: 'textImage', builder: 'titleImage', keywords: ['imagem', 'contexto'] },
  { key: 'pillars', name: 'Três pilares', kind: 'pillars', builder: 'pillars3', keywords: ['pilares', 'cultura', 'valores'] },
  { key: 'process', name: 'Processo horizontal', kind: 'process', builder: 'process', keywords: ['processo', 'etapas'] },
  { key: 'cards6', name: 'Seis cards', kind: 'cards', builder: 'cards6', keywords: ['cards', 'tópicos'] },
  { key: 'indicators', name: 'Indicadores', kind: 'bigNumber', builder: 'indicators', keywords: ['kpi', 'indicadores', 'números'] },
  { key: 'comparison', name: 'Comparação', kind: 'comparison', builder: 'comparison', keywords: ['comparação', 'antes', 'depois'] },
  { key: 'impact', name: 'Frase de impacto', kind: 'impact', builder: 'impact', keywords: ['frase', 'citação', 'mensagem'] },
  { key: 'conclusion', name: 'Conclusão', kind: 'conclusion', builder: 'conclusion', keywords: ['conclusão', 'fechamento'] },
  { key: 'next', name: 'Próximo assunto', kind: 'next', builder: 'nextTopic', keywords: ['a seguir', 'transição'] },
]

export const SYSTEM_TEMPLATES: SlideTemplate[] = [
  ...makeSet('style-squadhub-tech-dark', SQUADHUB_BRAND_ID, 'shdark', SQUADHUB_SPECS),
  ...makeSet('style-squadhub-tech-light', SQUADHUB_BRAND_ID, 'shlight', SQUADHUB_SPECS),
  ...makeSet('style-gaustec-engineering', GAUSTEC_BRAND_ID, 'gaustec', [
    { key: 'cover', name: 'Capa técnica', kind: 'cover', builder: 'coverTech', keywords: ['capa', 'técnica'] },
    { key: 'cards-icons', name: 'Três cards com ícones', kind: 'pillars', builder: 'pillars3', keywords: ['cards', 'ícones'] },
    { key: 'process', name: 'Processo industrial', kind: 'process', builder: 'processAngular', keywords: ['processo', 'produção', 'pcp'] },
    { key: 'indicators', name: 'Indicadores operacionais', kind: 'bigNumber', builder: 'indicators4', keywords: ['kpi', 'operação', 'estoque'] },
    { key: 'before-after', name: 'Antes e depois', kind: 'comparison', builder: 'beforeAfter', keywords: ['antes', 'depois'] },
    { key: 'schedule', name: 'Cronograma', kind: 'timeline', builder: 'timeline', keywords: ['cronograma', 'prazos'] },
    { key: 'risks', name: 'Riscos e ações', kind: 'risks', builder: 'risksActions', keywords: ['riscos', 'ações', 'mitigação'] },
    { key: 'conclusion', name: 'Conclusão executiva', kind: 'conclusion', builder: 'conclusionExec', keywords: ['conclusão', 'decisão'] },
  ]),
  ...makeSet('style-get-church-signature', GET_CHURCH_BRAND_ID, 'getchurch', [
    { key: 'cover', name: 'Capa', kind: 'cover', builder: 'coverOrganic', keywords: ['capa'] },
    { key: 'concept', name: 'Conceito', kind: 'impact', builder: 'impact', keywords: ['conceito', 'ideia'] },
    { key: 'timeline', name: 'Linha do tempo', kind: 'timeline', builder: 'timeline', keywords: ['linha do tempo', 'história'] },
    { key: 'stages', name: 'Etapas criativas', kind: 'process', builder: 'process', keywords: ['etapas', 'criação'] },
    { key: 'people', name: 'Pessoas envolvidas', kind: 'people', builder: 'people', keywords: ['pessoas', 'time', 'equipe'] },
    { key: 'launch', name: 'Lançamento', kind: 'cta', builder: 'launch', keywords: ['lançamento', 'estreia'] },
    { key: 'quote', name: 'Frase', kind: 'impact', builder: 'impact', keywords: ['frase', 'citação'] },
    { key: 'conclusion', name: 'Conclusão', kind: 'conclusion', builder: 'conclusion', keywords: ['conclusão'] },
  ]),
]

export const SYSTEM_TEMPLATE_IDS = new Set(SYSTEM_TEMPLATES.map((t) => t.id))

/** Recomenda um template do estilo para um tipo de slide do plano. */
export function recommendTemplate(
  templates: SlideTemplate[],
  styleId: string | null,
  layoutKind: string,
): SlideTemplate | null {
  const pool = templates.filter((t) => t.styleId === styleId)
  const fallbackPool = pool.length > 0 ? pool : templates
  const kindMap: Record<string, string[]> = {
    cover: ['cover'],
    textImage: ['textImage', 'cards'],
    bigNumber: ['bigNumber'],
    comparison: ['comparison'],
    process: ['process'],
    timeline: ['timeline'],
    conclusion: ['conclusion'],
    cta: ['cta', 'next', 'impact'],
  }
  const wanted = kindMap[layoutKind] ?? [layoutKind]
  for (const kind of wanted) {
    const found = fallbackPool.find((t) => t.kind === kind)
    if (found) return found
  }
  return fallbackPool[0] ?? null
}
