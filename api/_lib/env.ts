/**
 * Configuração do servidor. A OPENAI_API_KEY existe SOMENTE aqui —
 * nunca com prefixo VITE_, nunca no bundle do frontend.
 */
export interface ServerEnv {
  apiKey: string | undefined
  textModel: string
  imageModel: string
  imageQuality: string
  imageSize: string
  webSearchEnabled: boolean
  supabaseUrl: string | undefined
  supabaseSecretKey: string | undefined
  supabaseTable: string
  supabaseBucket: string
  workspaceKey: string
}

export function readEnv(): ServerEnv {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    textModel: process.env.OPENAI_TEXT_MODEL ?? 'gpt-5.6',
    imageModel: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
    imageQuality: process.env.OPENAI_IMAGE_QUALITY ?? 'high',
    imageSize: process.env.OPENAI_IMAGE_SIZE ?? '2048x1152',
    webSearchEnabled: process.env.OPENAI_ENABLE_WEB_SEARCH === 'true',
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    supabaseTable: process.env.SUPABASE_TABLE ?? 'slide_hub_records',
    supabaseBucket: process.env.SUPABASE_BUCKET ?? 'slide-hub-assets',
    workspaceKey: process.env.SLIDE_HUB_WORKSPACE_KEY ?? 'squadhub',
  }
}

/** Presets de qualidade expostos na interface. */
export function resolveImageParams(preset: string | undefined, env: ServerEnv): { size: string; quality: string } {
  switch (preset) {
    case 'draft':
      return { size: '1536x864', quality: 'medium' }
    case '4k':
      return { size: '3840x2160', quality: 'high' }
    case 'high':
    default:
      return { size: env.imageSize, quality: env.imageQuality }
  }
}
