import PptxGenJS from 'pptxgenjs'
import { sanitizeFileName } from '../../utils/filename'

/**
 * Gera um .pptx 16:9 a partir das imagens finais já achatadas
 * (arte + logos oficiais compostos). Cada imagem cobre o slide inteiro,
 * sem bordas nem deformação.
 */
export async function exportPptx(
  images: string[],
  fileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'SQUADHUB_WIDE', width: 10, height: 5.625 })
  pptx.layout = 'SQUADHUB_WIDE'
  pptx.author = 'Slide Hub — SquadHub'

  images.forEach((png, index) => {
    const slide = pptx.addSlide()
    slide.addImage({ data: png, x: 0, y: 0, w: 10, h: 5.625 })
    onProgress?.(index + 1, images.length)
  })

  const name = `${sanitizeFileName(fileName)}.pptx`
  await pptx.writeFile({ fileName: name })
  return name
}
