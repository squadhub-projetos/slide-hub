import { useCallback, useState } from 'react'
import { flattenVersionToPng } from '../services/rendering/composeSlide'
import { currentVersionOf, useProjectStore } from '../state/projectStore'
import { useStyleStore } from '../state/styleStore'
import { useUiStore } from '../state/uiStore'
import type { ExportOptions, Slide } from '../types'

export interface ExportState {
  status: 'idle' | 'preparing' | 'done' | 'error'
  format: ExportOptions['format'] | null
  progress: number
  stage: 'flatten' | 'pack' | null
}

/**
 * Orquestra as exportações: achata cada slide (variação selecionada +
 * revisões + logos oficiais compostos) e empacota em PPTX/ZIP.
 */
export function useExport() {
  const [state, setState] = useState<ExportState>({ status: 'idle', format: null, progress: 0, stage: null })
  const toast = useUiStore((s) => s.toast)

  const run = useCallback(
    async (format: ExportOptions['format'], slides: Slide[], fileName: string) => {
      setState({ status: 'preparing', format, progress: 0, stage: 'flatten' })
      try {
        const styleStore = useStyleStore.getState()
        const project = useProjectStore.getState().project
        const style = styleStore.getById(project?.styleId ?? null) ?? styleStore.getDefault()

        const images: string[] = []
        for (let i = 0; i < slides.length; i++) {
          const version = currentVersionOf(slides[i])
          if (!version) throw new Error(`O slide ${i + 1} não possui uma versão gerada.`)
          images.push(await flattenVersionToPng(version, style))
          setState({ status: 'preparing', format, progress: ((i + 1) / slides.length) * 0.7, stage: 'flatten' })
        }

        setState({ status: 'preparing', format, progress: 0.72, stage: 'pack' })
        const onProgress = (done: number, total: number) =>
          setState({ status: 'preparing', format, progress: 0.7 + (done / total) * 0.3, stage: 'pack' })
        // Import dinâmico: pptxgenjs/jszip só entram no bundle quando exportar.
        const name =
          format === 'pptx'
            ? await (await import('../services/export/pptxExporter')).exportPptx(images, fileName, onProgress)
            : await (await import('../services/export/zipExporter')).exportZip(images, fileName, onProgress)

        useProjectStore.getState().markVersionsExported()
        setState({ status: 'done', format, progress: 1, stage: null })
        toast('success', 'Download pronto', `${name} foi gerado com sucesso.`)
      } catch (error) {
        setState({ status: 'error', format, progress: 0, stage: null })
        toast(
          'error',
          format === 'pptx' ? 'Falha ao exportar PPTX' : 'Falha ao exportar ZIP',
          error instanceof Error ? error.message : 'Tente novamente.',
        )
      }
    },
    [toast],
  )

  return { state, run }
}
