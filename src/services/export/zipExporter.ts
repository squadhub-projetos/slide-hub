import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { sanitizeFileName } from '../../utils/filename'

/**
 * Gera um .zip com as imagens finais achatadas, numeradas na ordem da
 * apresentação: 01-slide.png, 02-slide.png, ...
 */
export async function exportZip(
  images: string[],
  fileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const zip = new JSZip()
  images.forEach((png, index) => {
    const base64 = png.split(',')[1]
    zip.file(`${String(index + 1).padStart(2, '0')}-slide.png`, base64, { base64: true })
    onProgress?.(index + 1, images.length)
  })

  const blob = await zip.generateAsync({ type: 'blob' })
  const name = `${sanitizeFileName(fileName)}.zip`
  saveAs(blob, name)
  return name
}
