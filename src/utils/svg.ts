export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Rasteriza um SVG (autocontido, sem recursos externos) em PNG.
 * Usado nas exportações PPTX/ZIP para que cada slide vire uma imagem real.
 */
export function svgToPngDataUrl(svg: string, width = 1920, height = 1080): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D indisponível neste navegador.'))
        return
      }
      ctx.drawImage(image, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => reject(new Error('Falha ao rasterizar o slide.'))
    image.src = svgToDataUrl(svg)
  })
}
