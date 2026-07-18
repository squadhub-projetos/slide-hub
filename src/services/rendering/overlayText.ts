import type { DesignStyle, PlannedSlide, SlideTemplate } from '../../types'
import { renderTemplate } from './templateRenderer'

/**
 * Composição padrão do modo "Criativo por IA": a IA gera o VISUAL e a
 * aplicação aplica textos (e depois logos) de forma determinística —
 * melhor ortografia, precisão e edição. (§ "IA gera o visual".)
 */
export async function composeAiVisualWithText(options: {
  aiImageDataUrl: string
  plan: PlannedSlide
  style: DesignStyle
  projectName: string
  slideNumber: number
  totalSlides: number
}): Promise<string> {
  const { plan } = options
  const isCover = plan.layout === 'cover' || plan.layout === 'cta'
  const overlay: SlideTemplate = {
    id: 'overlay-ai',
    name: 'Overlay de texto',
    description: '',
    styleId: options.style.id,
    brandId: options.style.brandId,
    kind: 'overlay',
    keywords: [],
    snippetIds: [],
    isSystem: true,
    createdAt: '',
    updatedAt: '',
    layers: [
      {
        id: 'bg', type: 'ai-region', name: 'Visual gerado', x: 0, y: 0, width: 1, height: 1,
        rotation: 0, zIndex: 1, opacity: 1, visible: true, locked: true,
      },
      {
        id: 'scrim', type: 'shape', name: 'Legibilidade', x: 0, y: isCover ? 0.5 : 0.62, width: 1, height: isCover ? 0.5 : 0.38,
        rotation: 0, zIndex: 2, opacity: 0.82, visible: true, locked: true,
        shape: { fill: options.style.palette.background, stroke: 'none', strokeWidth: 0, radius: 0, opacity: 0.82, shadow: false },
      },
      {
        id: 'title', type: 'text-placeholder', name: 'Título', role: 'title', binding: 'slide.title',
        x: 0.06, y: isCover ? 0.58 : 0.68, width: 0.72, height: 0.18,
        rotation: 0, zIndex: 3, opacity: 1, visible: true, locked: true,
        text: { fontRole: 'heading', size: isCover ? 56 : 40, weight: 700, color: 'auto', align: 'left', uppercase: false, lineHeight: 1.15, maxLines: 2, maxChars: 110, autoShrink: true },
      },
      {
        id: 'subtitle', type: 'text-placeholder', name: 'Mensagem', role: 'subtitle', binding: 'slide.keyMessage',
        x: 0.06, y: isCover ? 0.78 : 0.85, width: 0.6, height: 0.09,
        rotation: 0, zIndex: 4, opacity: 1, visible: true, locked: true,
        text: { fontRole: 'body', size: 20, weight: 400, color: 'muted', align: 'left', uppercase: false, lineHeight: 1.3, maxLines: 2, maxChars: 160, autoShrink: true },
      },
      {
        id: 'num', type: 'text-placeholder', name: 'Número', role: 'slide-number', binding: 'slide.number',
        x: 0.88, y: 0.92, width: 0.06, height: 0.04,
        rotation: 0, zIndex: 5, opacity: 1, visible: true, locked: true,
        text: { fontRole: 'body', size: 13, weight: 600, color: 'accent', align: 'right', uppercase: false, lineHeight: 1.2, maxLines: 1, maxChars: 12, autoShrink: false },
      },
    ],
  }

  // O scrim usa cor concreta do estilo (não token 'auto-surface') para
  // gradação correta sobre a foto.
  return renderTemplate({
    template: overlay,
    style: options.style,
    plan,
    snippets: [],
    regionImages: { bg: options.aiImageDataUrl },
    projectName: options.projectName,
    slideNumber: options.slideNumber,
    totalSlides: options.totalSlides,
  })
}
