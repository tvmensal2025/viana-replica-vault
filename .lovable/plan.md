

## Instalar Sentry — 3 ambientes

Você confirmou: **Frontend + Worker VPS + Edge Functions**, com DSN como secret/env var.

## O que será feito

### 1. Frontend React (Vite) — `@sentry/react`
- Instalar `@sentry/react`
- Inicializar em `src/main.tsx` (antes do `createRoot`) com:
  - `dsn: import.meta.env.VITE_SENTRY_DSN`
  - `tracesSampleRate: 0.1` (10% das transações)
  - `replaysSessionSampleRate: 0.0`, `replaysOnErrorSampleRate: 1.0` (replay só em erro)
  - `environment: import.meta.env.MODE`
  - Integration: `Sentry.browserTracingIntegration()` + `Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })` (LGPD-safe — não vaza dados de cliente)
- Envolver `<App />` com `<Sentry.ErrorBoundary fallback={...}>` para capturar erros de render
- Adicionar `VITE_SENTRY_DSN` ao `.env` (você cola o DSN lá)

### 2. Worker VPS (Node/Express) — `@sentry/node`
- Adicionar `@sentry/node` e `@sentry/profiling-node` ao `worker-portal/package.json`
- Criar `worker-portal/instrument.mjs` (carregado **antes** de tudo via `node --import ./instrument.mjs server.mjs`):
  - `Sentry.init({ dsn: process.env.SENTRY_DSN, sendDefaultPii: true, tracesSampleRate: 0.2, profilesSampleRate: 0.2 })`
- Atualizar script `start` em `package.json`: `node --import ./instrument.mjs server.mjs`
- Em `server.mjs`: chamar `Sentry.setupExpressErrorHandler(app)` **depois** de todas as rotas e antes do error handler customizado
- Capturar erros do Playwright manualmente nos `try/catch` da `playwright-automation.mjs` com `Sentry.captureException(err, { tags: { phase, customer_id } })`
- Você adiciona `SENTRY_DSN` no `.env` do worker na VPS

### 3. Edge Functions Supabase (Deno) — via secret `SENTRY_DSN`
- Adicionar secret `SENTRY_DSN` (vou pedir após aprovar o plano)
- Criar helper `supabase/functions/_shared/sentry.ts` que:
  - Importa `@sentry/deno` via `https://esm.sh/@sentry/deno@8`
  - Inicializa uma única vez por isolate (`Sentry.init({ dsn, environment, tracesSampleRate: 0.1 })`)
  - Exporta `captureError(err, context)` — wrap simples
- Instrumentar as 4 funções críticas (resto fica passivo, só importa o helper):
  - `evolution-webhook/index.ts` — captura erros do bot/OCR
  - `_shared/ocr.ts` — captura falhas Gemini
  - `worker-callback/index.ts` — captura erros do worker
  - `send-scheduled-messages/index.ts` — captura falhas de envio
- Wrap nos `catch` principais com tags: `{ function, phase, customer_id }`

## Detalhes técnicos importantes

- **DSN é "público" por design** mas mesmo assim guardamos como secret pra poder rotacionar sem rebuild (sua escolha)
- **LGPD/Privacidade:** Replay com `maskAllText: true` + `blockAllMedia: true` impede vazamento de CPF/RG/conta de energia
- **Performance:** `tracesSampleRate` baixo (0.1–0.2) pra não estourar quota Sentry
- **Worker `--import` flag** requer Node 20.6+ — seu `engines` permite `>=18`, então também adiciono fallback `import './instrument.mjs'` no topo do `server.mjs` caso a flag não funcione
- **Deno isolates:** Sentry init roda no top-level do helper, mas com guard `if (!initialized)` pra não duplicar entre invocações quentes

## Ordem de execução (após aprovação)

1. Pedir secret `SENTRY_DSN` (Edge Functions) — você cola o DSN
2. Adicionar `VITE_SENTRY_DSN` ao `.env` (eu instruo onde)
3. Instalar `@sentry/react` no frontend
4. Atualizar `worker-portal/package.json` + criar `instrument.mjs`
5. Criar `_shared/sentry.ts` + instrumentar 4 edge functions
6. Validar: gerar erro de teste em cada ambiente e checar no painel Sentry

## Arquivos afetados

- `src/main.tsx`, `src/App.tsx`, `.env`, `package.json`
- `worker-portal/package.json`, `worker-portal/instrument.mjs` (novo), `worker-portal/server.mjs`, `worker-portal/playwright-automation.mjs`
- `supabase/functions/_shared/sentry.ts` (novo)
- `supabase/functions/evolution-webhook/index.ts`, `_shared/ocr.ts`, `worker-callback/index.ts`, `send-scheduled-messages/index.ts`

