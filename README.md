# Slide Hub

Estúdio interno da **SquadHub** para planejar, gerar, revisar e exportar apresentações com IA — com geração de imagem real (gpt-image-2), persistência no Supabase e uma biblioteca visual de estilos, templates, snippets e ativos.

## Os três modos de renderização

Cada projeto e cada slide escolhe (badge visível no preview; a IA recomenda por slide):

| Estratégia | O que acontece | Origem do arquivo |
| --- | --- | --- |
| **Criativo por IA** | O modelo de imagem gera o visual de verdade (arquivo novo, hash novo). Padrão: a IA gera o visual e a aplicação aplica textos e logos deterministicamente; opcionalmente a IA gera o slide completo. Revisões usam **edição de imagem** (com máscara e intensidade: ajuste sutil / alteração moderada / recriação visual). | `openai` |
| **Guiado por template** (padrão) | O template define posições e placeholders; textos, números, ícones, gráficos e snippets são renderizados deterministicamente; **regiões de IA** recebem imagens reais do modelo; tudo é achatado em uma imagem final. | `openai + renderer` |
| **Estruturado** | Somente camadas estruturadas (indicadores, tabelas, fluxos, precisão textual). Nunca é apresentado como imagem gerada por IA. | `renderer` |

## IA real vs. Simulação — sem fallback silencioso

- `VITE_USE_MOCK_AI=false` → **IA real**: somente endpoints internos `/api`; chave ausente ou API fora do ar aparecem como **erros reais** (indicador no topo: *IA real / Configuração incompleta / API indisponível*). Nada é substituído por mock.
- `VITE_USE_MOCK_AI=true` → **Modo simulação**, rotulado no topo e nas imagens (selo "SIMULAÇÃO"): arte abstrata distinta a cada chamada, hashes diferentes por versão, metadados `provider: mock`. Serve para desenvolver o fluxo sem custo — nunca se passa pela OpenAI.

Toda geração/edição real registra `GeneratedImageMetadata` (modelo, hashes SHA-256 do prompt/origem/saída, dimensões, qualidade, duração, `storagePath`) — visível no painel **Detalhes da versão** (provider, estratégia, tipo, tempo, hash abreviado, template, snippets, prompt, origem do arquivo). Se uma edição retornar **hash idêntico** ao da origem, a interface avisa ("A edição não produziu uma alteração visual detectável") e oferece tentar novamente / reforçar / mudar escopo / mudar intensidade.

## Estilo × Template × Snippet × Ativo

- **Estilo**: identidade (cores, fontes, gradientes, linguagem, regras de logo/prompt). Não define composição fixa.
- **Template**: layout concreto 16:9 com camadas tipadas (`TemplateLayer`), placeholders semânticos, bindings (`slide.title`, `slide.metric.value.0`, `asset:n8n`, `snippet:A seguir`) e regiões de IA. 34 templates oficiais com estruturas realmente distintas (SquadHub Tech Dark/Light, Gaustec Engineering, Get Church Signature).
- **Snippet**: conjunto reutilizável de camadas com parâmetros ("Frase de efeito inferior", "Logos das ferramentas", "A seguir", KPI, rodapé…). Pode ser citado no planner com `@snippet("Nome")` **ou** linguagem natural — o sistema mostra qual snippet interpretou e nunca inventa um inexistente.
- **Ativo**: arquivo reutilizável com aliases (ex.: logo do n8n com aliases "n8n, logo n8n"). Resolução por prioridade: slide → projeto → marca → global → busca oficial confirmada → pedir upload. Logos existentes **nunca** são regenerados.

A aba **Estilos** virou a área *Identidade & biblioteca* com quatro seções internas (Estilos · Templates · Snippets · Ativos). O **editor visual de templates** tem canvas 16:9 com zoom, grade, área segura, snapping com guias, lista de camadas, inspector, undo/redo, agrupamento, alinhamento/distribuição, atalhos (Del, Ctrl+C/V/D/Z/Shift+Z, setas) e **"Salvar seleção como snippet"**. Templates oficiais são editados **diretamente** — o salvamento vira um *override* com histórico; **Restaurar padrão** desfaz; há **Salvar como novo**.

## Persistência: Supabase + IndexedDB

- **Supabase** (fonte compartilhada): tabela única `public.slide_hub_records` (envelope genérico — um registro por projeto/slide/estilo/template/snippet/ativo; upsert por `workspace_key + record_type + record_key`) e bucket privado `slide-hub-assets` (`{workspace}/projects/{projectKey}/{uploads|generated|revisions|masks|thumbnails|exports}/…` e `{workspace}/library/…`). Nunca gravamos base64 no Postgres; o banco guarda `storagePath`, MIME, hash, dimensões e metadados.
- **URLs assinadas**: o bucket é privado; só o `storagePath` é persistido. O cliente pede URLs temporárias (`/api/storage/sign`), cacheia em memória e renova ao expirar.
- **IndexedDB** (cache local, fallback offline e fila): estado React → IndexedDB → fila pendente → upsert no Supabase → confirmado. Em falha, o dado local permanece e a fila re-tenta com backoff. Estados visíveis no topo (Salvo localmente / Sincronizando / Salvo na nuvem / Offline / Falha / Conflito). Conflitos preservam as duas versões (manter local · usar remoto); sem edição concorrente detectada vale last-write-wins.
- **"Sincronizar dados locais"** (painel de nuvem): identifica o que ainda não subiu, mostra prévia, envia em lotes com confirmação — nada é enviado automaticamente no boot.

## Endpoints internos

`/api/ai/plan-deck` (gpt-5.6, Responses API + Structured Outputs, reasoning high) · `/api/ai/generate-slide` e `/api/ai/revise-slide` (gpt-image-2 generate/edit; persistem a saída no Storage e devolvem metadados+hashes) · `/api/ai/analyze-attachments` · `/api/ai/status` · `/api/brands/search-official-assets` (web search, apenas domínios oficiais, sempre com confirmação) · `/api/storage/{records,upload,sign,delete-object}`. Timeout, retry com backoff só para erros transitórios (geração de imagem: no máximo 1 retry automático), validação de payload/MIME/tamanho/paths e logs sem segredos/base64.

Em desenvolvimento, um **bridge no Vite** serve `/api` com os mesmos handlers (produção = Vercel).

## Scripts

```bash
npm install
npm run dev              # dev com bridge /api
npm run build            # tsc -b (app+node+api) && vite build
npm run lint             # oxlint
npm run test:supabase    # insert/select/upload/download/limpeza no Supabase real
npm run test:openai-image  # TESTE PAGO opcional — exige RUN_PAID_AI_TEST=true
```

O teste pago gera uma imagem econômica, salva no Storage, registra metadados, pede uma edição e **verifica que o hash mudou**; limpa tudo (ou `KEEP_TEST_DATA=true` preserva). Nunca roda em install/build/e2e.

## Variáveis (.env.example)

Servidor (Vercel, nunca `VITE_*`): `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL=gpt-5.6`, `OPENAI_IMAGE_MODEL=gpt-image-2`, `OPENAI_IMAGE_QUALITY=high`, `OPENAI_IMAGE_SIZE=2048x1152`, `OPENAI_ENABLE_WEB_SEARCH=true`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_TABLE=slide_hub_records`, `SUPABASE_BUCKET=slide-hub-assets`, `SLIDE_HUB_WORKSPACE_KEY=squadhub`. Frontend: `VITE_USE_MOCK_AI`.

> ⚠️ A chave secreta do Supabase e a da OpenAI existem apenas no servidor. O cliente administrativo (`api/_lib/supabaseAdmin.ts`) jamais é importado por `src/`.

## Exportação

PPTX e ZIP usam a **versão selecionada**, achatada (variação escolhida + revisões + textos + logos oficiais compostos), na ordem correta, 16:9 sem bordas. Slides estruturados achatam o renderer; slides de IA usam a imagem real.

## Custos

Antes de gerar, a interface mostra estratégia/modelo/qualidade/variações e uma estimativa **qualitativa** (baixo/médio/alto — sem inventar valores). 3 variações ≈ 3× o custo por rodada; 4K multiplica de novo (aviso explícito). Idempotency keys evitam duplicação; não há retry automático irrestrito em geração.

## Deploy (Vercel)

Importar o repositório (preset Vite; `api/` é detectada), configurar as variáveis de servidor acima + `VITE_USE_MOCK_AI=false` e publicar.

## Limitações conhecidas

- A integração real de imagem/planejamento está implementada e o caminho Supabase foi exercitado contra o ambiente real; as chamadas pagas à OpenAI só são exercitadas via `npm run test:openai-image` (gated) — sem esse teste, trate como *implementado, mas não exercitado contra a API real*.
- No modo simulação, máscara e intensidade orientam a arte simulada (rotulada) — não há edição de pixels real.
- HEIC/PDF/DOCX/PPTX/XLSX são guardados sem interpretação de conteúdo (informado na interface).
- Um projeto ativo por navegador; multiusuário simultâneo usa detecção de conflito simples (não é CRDT).
