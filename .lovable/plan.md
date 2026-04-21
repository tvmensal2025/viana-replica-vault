

## Diagnóstico: por que o OTP não chega no portal

O cliente digitou `873723` no WhatsApp e **o webhook capturou corretamente** (salvou em `customers.otp_code`). Mas o portal nunca recebeu o código por **3 problemas em cadeia**:

### Problema 1: Variável de ambiente errada no Supabase (CRÍTICO)
O webhook (`otp-intercept.ts`) tenta avisar o worker via `Deno.env.get("WORKER_PORTAL_URL")` — **mas o secret cadastrado no Supabase chama `PORTAL_WORKER_URL`** (invertido). Resultado: o webhook salva no banco, mas **nunca POSTa para `/confirm-otp` do worker**. O worker só descobre o OTP via polling no Supabase a cada 4.5s (estratégia 2 do `aguardarOTP`).

### Problema 2: VALDEIR atual nem chegou ao "aguardando OTP"
Logs mostram que esta automação travou na FASE 4 (WhatsApp) com `Modal MUI interceptando pointer events` e virou `automation_failed` ANTES de clicar em Finalizar. Browser fechou. Quando o cliente digitou `873723`, **não havia browser aberto** para receber o código.

### Problema 3: Link facial não sai pelo WhatsApp
Mesmo nas automações que **funcionaram** (VALDEIR antigo + SIRLENE — ambos com `link_facial` salvo no banco), o `sendLinkToCustomer()` no `server.mjs` falha com `Whapi 401`. Isso porque o `pageUrl` retornado é a URL do portal iGreen e ele tenta Evolution + Whapi como fallback. O **`sendFacialLinkToCustomer` (que usa Evolution e funciona) nunca chega a ser efetivo** porque a função genérica do server sobrescreve a tentativa.

---

## Plano de correção

### 1. Webhook Supabase — `otp-intercept.ts`
Aceitar **ambos** os nomes de env (`WORKER_PORTAL_URL` E `PORTAL_WORKER_URL`) para notificação imediata ao worker (zero polling lag).

### 2. Worker `playwright-automation.mjs` — Modal MUI bloqueando phone
Antes de clicar em qualquer campo da FASE 4 (WhatsApp), fechar qualquer Modal/dialog visível com `Escape` ou clicar no backdrop. Isso resolve o `automation_failed` recorrente do VALDEIR.

### 3. Worker `playwright-automation.mjs` — aumentar timeout OTP
Mudar `aguardarOTP(customerId, 120000)` para `300000` (5 min). Cliente leva tempo até olhar o WhatsApp depois que o código chega.

### 4. Worker `server.mjs` — desativar fallback Whapi quebrado
Remover o fallback Whapi do `sendLinkToCustomer` (linhas 332-350). Se Evolution falhar, log de erro claro e parar — sem tentar token Whapi morto que polui logs.

### 5. Worker `server.mjs` — não enviar URL do portal genérica
Detectar se `pageUrl` é a URL do portal iGreen (não-facial) e **pular o envio**. O link facial real já é enviado dentro do `playwright-automation.mjs` via `sendFacialLinkToCustomer` (que funciona). Hoje o server envia uma URL inútil por cima.

### 6. Reativar lead VALDEIR atual (UPDATE pontual)
Resetar o lead `24712654-5b2d-40fe-a7d0-fe71cfec7cfe` (status → `data_complete`, limpar `otp_code` e `error_message`) para que o auto-recovery reprocesse com as correções dos passos 2 e 3.

---

## Detalhes técnicos

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `supabase/functions/evolution-webhook/handlers/otp-intercept.ts` | `Deno.env.get("WORKER_PORTAL_URL") \|\| Deno.env.get("PORTAL_WORKER_URL")` |
| 2 | `worker-portal/playwright-automation.mjs` (FASE 4) | `await page.keyboard.press('Escape').catch(()=>{}); await page.locator('.MuiBackdrop-root').click({force:true,timeout:2000}).catch(()=>{});` antes do `phone` |
| 3 | `worker-portal/playwright-automation.mjs` linha 1529 | `aguardarOTP(customerId, 300000)` |
| 4 | `worker-portal/server.mjs` linhas 332-350 | Remover bloco Whapi fallback |
| 5 | `worker-portal/server.mjs` linha 164 | `if (result?.pageUrl && !result.pageUrl.includes('digital.igreenenergy.com.br')) await sendLinkToCustomer(...)` |
| 6 | Migração SQL pontual | `UPDATE customers SET status='data_complete', otp_code=NULL, error_message=NULL WHERE id='24712654-5b2d-40fe-a7d0-fe71cfec7cfe'` |

### O que NÃO vou alterar
- Não vou desabilitar o intercept de OTP (funciona)
- Não vou mexer no fluxo do browser além de fechar Modal MUI
- Não vou deletar o `_whapiSettings` ainda (usado para `whapi-media:` legado de mídia antiga)

### Após o deploy
Itens 1-5 entram em vigor automaticamente (Edge Function + EasyPanel auto-deploy do worker). Item 6 reativa o lead atual para reprocessar.

