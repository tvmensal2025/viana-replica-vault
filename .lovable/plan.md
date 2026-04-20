

# Plano: Build 100% verde + arquivos modulares (sem quebrar nada)

## Diagnóstico

**Build quebrado agora**: `evolution-webhook/index.ts` linha 222 referencia `RATE_LIMIT_MAX` e `RATE_LIMIT_WINDOW_MS` que moveram para `_helpers.ts` e não foram re-importadas.

**Arquivos gigantes** (relatório de auditoria):
| Arquivo | Linhas | Status |
|---|---|---|
| `supabase/functions/evolution-webhook/index.ts` | 1.702 | Crítico |
| `worker-portal/playwright-automation.mjs` | 1.661 | Fora do build (Worker VPS) |
| `src/hooks/useWhatsApp.ts` | 854 | Grande |
| `src/components/whatsapp/TemplateManager.tsx` | 830 | Grande |
| `supabase/functions/sync-igreen-customers/index.ts` | ~700 | Médio |

**Outros pontos do relatório**:
- 282 erros lint em `whapi-analysis/` (cópia antiga do projeto)
- `SUPABASE_PUBLISHABLE_KEY` hardcoded em `evolutionApi.ts`
- `recover-stuck-otp` sem auth de cron
- Chunks pesados (`xlsx` 424KB, `jspdf` 416KB) carregam no bundle inicial

## O que vamos fazer (5 commits, ordem segura)

### Commit 1 — FIX URGENTE do build (obrigatório, 1 arquivo)
- Exportar `RATE_LIMIT_MAX` e `RATE_LIMIT_WINDOW_MS` do `_helpers.ts`
- Importar no `index.ts` do webhook
- Build volta a passar imediatamente

### Commit 2 — Limpar lint e segurança (baixo risco)
- Criar `.eslintignore` com: `whapi-analysis/`, `worker-portal/`, `screenshots/`, `dist/`, `supabase/.temp/`
- Resultado: **282 erros de lint somem** sem deletar nada
- `src/services/evolutionApi.ts`: trocar key hardcoded por `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` (já existe no `.env`)
- `supabase/functions/recover-stuck-otp/index.ts`: validar `x-cron-secret` contra `Deno.env.get("CRON_SECRET")` antes de processar

### Commit 3 — Modularizar `evolution-webhook/index.ts` (1.702 → ~400 linhas)
Criar pasta `supabase/functions/evolution-webhook/handlers/` com:
- `connection.ts` — handlers de QR, OPEN, CLOSE, conexão
- `messages.ts` — `handleMessageUpsert`, dispatch por tipo
- `media.ts` — download + upload MinIO de áudio/imagem/documento
- `bot-flow.ts` — orquestração das fases do bot (saudação → conta → docs → perguntas)
- `ocr-pipeline.ts` — chamada Gemini + parsing + fallback

`index.ts` fica só com: CORS, parse do body, dedup, dispatch para o handler certo. **Todos os imports preservados** — quem chama de fora não muda.

### Commit 4 — Modularizar `useWhatsApp.ts` (854 → ~250 linhas)
Quebrar em 4 hooks já existentes na pasta `src/hooks/whatsapp/`:
- `useWhatsAppInstance.ts` — init, connect, disconnect (já existe parcialmente)
- `useWhatsAppMessages.ts` — send, receive, history
- `useWhatsAppQR.ts` — geração e refresh do QR
- `useWhatsAppStatus.ts` — polling adaptativo de status

`useWhatsApp.ts` vira um **barrel export** que combina os 4 — componentes que importam `useWhatsApp` continuam funcionando sem mudança.

### Commit 5 — Lazy load de chunks pesados (performance)
- `xlsx` (424KB) → `const XLSX = await import('xlsx')` dentro do handler de Exportar em `CustomerImportExport.tsx`
- `jspdf` (416KB) → idem onde for usado para gerar PDF
- Resultado: **bundle inicial cai ~840KB**, só baixa quando o usuário clica em Exportar/PDF

### Commit 6 — Modularizar `TemplateManager.tsx` (830 → ~200 linhas) [opcional]
Quebrar em:
- `TemplateList.tsx` — listagem + filtros
- `TemplateForm.tsx` — criar/editar template
- `TemplateScheduler.tsx` — agendamento
- `TemplateManager.tsx` — orquestrador + tabs

## O que NÃO vamos fazer

- **Mexer no `playwright-automation.mjs`** — está no Worker VPS, fora do build do Lovable, deploy manual
- **Quebrar `sync-igreen-customers`** — funciona, escopo de outro PR
- **Adicionar testes em massa** — escopo de outro PR (mencionado no relatório mas é trabalho separado)
- **Remover `whapi-analysis/`** — só ignorar no lint/git; remoção física precisa `git rm -r --cached` na VPS

## Tabela de risco

| Commit | Arquivos | Risco | Reverte fácil? |
|---|---|---|---|
| 1 — Fix build | 2 | Zero | Sim |
| 2 — Lint+segurança | 3 | Zero | Sim |
| 3 — Webhook modular | ~6 novos + index | Médio (testar com lead simulado) | Sim, isolado |
| 4 — useWhatsApp modular | 4 + barrel | Baixo (exports preservados) | Sim |
| 5 — Lazy xlsx/jspdf | 2 | Zero | Sim |
| 6 — TemplateManager modular | 4 novos + index | Baixo | Sim |

## Resultado final esperado

- Build verde (zero TS errors)
- Lint limpo (de 282 erros para ~0)
- Segurança: chave em env, cron com auth
- **Maior arquivo do projeto cai de 1.702 para ~400 linhas**
- Bundle inicial ~840KB menor (lazy chunks)
- Cada hook/handler com responsabilidade única, fácil de achar bug

Cada commit é testável isoladamente e independente — se o Commit 3 der problema, reverto só ele e o Commit 1 e 2 continuam.

