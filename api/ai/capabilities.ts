import { handleError, type ApiRequest, type ApiResponse } from '../_lib/http'
import { readAiCatalog } from '../_lib/aiConfig'

/**
 * Catálogo público de provedores/modelos habilitados, POR ETAPA — alimenta
 * o seletor "Modelo de IA — testes". Retorna SOMENTE presença/listas/
 * defaults; nunca chaves, headers, prompts ou variáveis inteiras.
 */
export default async function handler(_req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const catalog = readAiCatalog()
    res.status(200).json({
      providers: catalog.providers.map((p) => ({
        id: p.id,
        label: p.label,
        available: p.configured,
        configured: p.configured,
        models: {
          chat: p.models.chat,
          planning: p.models.planning,
          slideProduction: p.models.slideProduction,
          revision: p.models.revision,
          imageGeneration: p.id === catalog.image.provider ? catalog.image.models : [],
        },
        defaults: p.defaults,
        // Compatibilidade com o seletor anterior:
        plannerModels: p.plannerModels,
        slideModels: p.slideModels,
        defaultPlannerModel: p.defaultPlannerModel,
        defaultSlideModel: p.defaultSlideModel,
      })),
      defaults: {
        provider: catalog.defaultProvider,
        executionMode: catalog.executionMode,
        imageModel: catalog.image.defaultModel,
        slideConcurrency: catalog.concurrency.slides,
        parallelSlideProduction: catalog.parallelSlideProduction,
      },
      defaultProvider: catalog.defaultProvider,
      executionMode: catalog.executionMode,
      executionModes: ['fast', 'balanced', 'quality', 'custom'],
      providerFallbackEnabled: catalog.providerFallbackEnabled,
      image: catalog.image,
      timeouts: catalog.timeouts,
      concurrency: catalog.concurrency,
      diagnosticsEnabled: catalog.diagnosticsEnabled,
      benchmarkEnabled: catalog.benchmarkEnabled,
      visualStrategies: ['auto', 'template-assets', 'hybrid', 'ai-creative', 'none'],
    })
  } catch (error) {
    handleError(res, error, 'ai/capabilities')
  }
}
