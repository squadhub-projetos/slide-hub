import type { DesignStyle, PlannedSlide, SlideTemplate, TemplateLayer, TextOverlaySpec } from '../../types'
import { renderTemplate } from './templateRenderer'

/**
 * Composição do modo "Criativo por IA": a IA gera o VISUAL e a aplicação
 * aplica textos (e depois logos) de forma determinística — melhor
 * ortografia, precisão e edição.
 *
 * O LAYOUT dos textos vem do `TextOverlaySpec` decidido pelo arquétipo
 * de composição (validado contra safe areas/logo/colisões) — cada slide
 * posiciona os textos de forma diferente; os slots do template de
 * referência NUNCA são reutilizados aqui.
 */

function specToLayers(spec: TextOverlaySpec, style: DesignStyle): TemplateLayer[] {
  const layers: TemplateLayer[] = [
    {
      id: 'bg', type: 'ai-region', name: 'Visual gerado', x: 0, y: 0, width: 1, height: 1,
      rotation: 0, zIndex: 1, opacity: 1, visible: true, locked: true,
    },
  ]
  if (spec.scrim) {
    layers.push({
      id: 'scrim', type: 'shape', name: 'Legibilidade', x: 0, y: spec.scrim.y, width: 1, height: spec.scrim.height,
      rotation: 0, zIndex: 2, opacity: spec.scrim.opacity, visible: true, locked: true,
      shape: { fill: style.palette.background, stroke: 'none', strokeWidth: 0, radius: 0, opacity: spec.scrim.opacity, shadow: false },
    })
  }
  spec.elements.forEach((el, i) => {
    if (!el.text) return
    layers.push({
      id: el.id, type: 'text-placeholder', name: el.type, role: el.type === 'title' ? 'title' : 'body',
      binding: undefined, staticText: el.text,
      x: el.x, y: el.y, width: el.width, height: el.height,
      rotation: 0, zIndex: 3 + i, opacity: 1, visible: true, locked: true,
      text: {
        fontRole: el.fontRole,
        size: el.size,
        weight: el.emphasis === 'strong' ? 700 : el.emphasis === 'medium' ? 600 : 400,
        color: el.colorRole === 'accent' ? 'accent' : el.colorRole === 'muted' ? 'muted' : 'auto',
        align: el.alignment,
        uppercase: false,
        lineHeight: el.type === 'title' ? 1.12 : 1.35,
        maxLines: el.maxLines ?? 3,
        maxChars: el.type === 'title' ? 120 : 220,
        autoShrink: true,
      },
    })
  })
  return layers
}

export async function composeAiVisualWithText(options: {
  aiImageDataUrl: string
  plan: PlannedSlide
  style: DesignStyle
  projectName: string
  slideNumber: number
  totalSlides: number
  /** Layout dos textos decidido pelo arquétipo; ausente = padrão inferior-esquerdo. */
  overlaySpec?: TextOverlaySpec
}): Promise<string> {
  const { plan, style } = options
  const isCover = plan.layout === 'cover' || plan.layout === 'cta'

  const spec: TextOverlaySpec = options.overlaySpec ?? {
    elements: [
      {
        id: 'title', type: 'title', text: plan.title,
        x: 0.06, y: isCover ? 0.58 : 0.68, width: 0.72, height: 0.18,
        alignment: 'left', emphasis: 'strong', colorRole: 'auto', fontRole: 'heading',
        size: isCover ? 56 : 40, maxLines: 2,
      },
      {
        id: 'subtitle', type: 'subtitle', text: plan.keyMessage,
        x: 0.06, y: isCover ? 0.78 : 0.85, width: 0.6, height: 0.09,
        alignment: 'left', colorRole: 'muted', fontRole: 'body', size: 20, maxLines: 2,
      },
    ],
    scrim: { y: isCover ? 0.5 : 0.62, height: isCover ? 0.5 : 0.38, opacity: 0.82 },
  }

  const overlay: SlideTemplate = {
    id: 'overlay-ai',
    name: 'Overlay de texto',
    description: '',
    styleId: style.id,
    brandId: style.brandId,
    kind: 'overlay',
    keywords: [],
    snippetIds: [],
    isSystem: true,
    createdAt: '',
    updatedAt: '',
    layers: [
      ...specToLayers(spec, style),
      {
        id: 'num', type: 'text-placeholder', name: 'Número', role: 'slide-number', binding: 'slide.number',
        x: 0.88, y: 0.92, width: 0.06, height: 0.04,
        rotation: 0, zIndex: 40, opacity: 1, visible: true, locked: true,
        text: { fontRole: 'body', size: 13, weight: 600, color: 'accent', align: 'right', uppercase: false, lineHeight: 1.2, maxLines: 1, maxChars: 12, autoShrink: false },
      },
    ],
  }

  return renderTemplate({
    template: overlay,
    style,
    plan,
    snippets: [],
    regionImages: { bg: options.aiImageDataUrl },
    projectName: options.projectName,
    slideNumber: options.slideNumber,
    totalSlides: options.totalSlides,
  })
}
