---
inclusion: auto
---

# Bugs Corrigidos — 25 de Abril de 2026

## Resumo: 6 bugs corrigidos, sistema funcionando ponta a ponta

---

## BUG 1 — Loop infinito no ask_finalizar (CRÍTICO)
**Causa:** A coluna `finalize_redirect_count` não existia no banco. Quando o bot tentava salvar `{conversation_step, finalize_redirect_count}`, o Supabase rejeitava o update INTEIRO (erro PGRST204). O `conversation_step` nunca mudava → cliente preso em loop.
**Correção:** Substituído `finalize_redirect_count` por `rescue_attempts` (coluna já existente).
**Arquivo:** `supabase/functions/evolution-webhook/handlers/bot-flow.ts` (linha ~1152)

## BUG 2 — "Telefone do consultor" bloqueava finalização
**Causa:** `validateCustomerForPortal()` comparava `phone_landline` com `consultant_phone`. Quando o testador usava o mesmo número da instância WhatsApp, a validação rejeitava com "Telefone do consultor não pode ser usado".
**Correção:** Removida a checagem de telefone do consultor da validação final. Essa checagem já existe nos steps `ask_phone` e `ask_phone_confirm`.
**Arquivo:** `supabase/functions/_shared/validators.ts` (linha ~120)

## BUG 3 — Mensagem duplicada "Estou aqui!" após finalização
**Causa:** O bloco `finalizando` limpa todos os updates após salvar diretamente no banco. O `index.ts` via `reply=""` e `updates={}` e disparava o fallback de segurança.
**Correção:** Adicionado marcador `__inline_sent` para indicar que o handler já enviou mensagem.
**Arquivos:** `bot-flow.ts` (final) + `index.ts` (safety check)

## BUG 4 — Playwright usava telefone errado no portal (CRÍTICO)
**Causa:** `formatarDados()` usava `cliente.phone_whatsapp` (número do remetente do WhatsApp) em vez de `cliente.phone_landline` (telefone real do cliente confirmado no chat).
**Correção:** Agora usa `phone_landline` com fallback para `phone_whatsapp`.
**Arquivo:** `worker-portal/playwright-automation.mjs` (função `formatarDados`)

## BUG 5 — Botões não funcionam na Evolution API
**Causa:** `sendButtons()` da Evolution API não renderiza botões no WhatsApp.
**Correção:** Criada função `sendOptions()` que converte botões em opções numeradas (1️⃣, 2️⃣, 3️⃣).
**Arquivo:** `bot-flow.ts` (helper `sendOptions`)

## BUG 6 — Telefone com +55/traços não aceito
**Causa:** `ask_phone` não tratava formatos como `+55 11 94574-4147`.
**Correção:** Strip do prefixo `55` e caracteres não-numéricos antes de validar.
**Arquivo:** `bot-flow.ts` (case `ask_phone`)

---

## REGRAS PERMANENTES (nunca violar)

1. **phone_whatsapp** = número do remetente do WhatsApp (chave da conversa). NUNCA alterar nos updates (causa duplicate key).
2. **phone_landline** = telefone real do cliente, confirmado no chat. É esse que vai pro portal iGreen.
3. **phone_contact_confirmed** = true somente quando o cliente explicitamente confirmou ou digitou o telefone.
4. **Email e telefone** são SEMPRE coletados do cliente via WhatsApp. NUNCA usar fallback hardcoded.
5. **Botões** não funcionam na Evolution API. Sempre usar `sendOptions()` com opções numeradas.
6. **Colunas novas** no banco devem ser criadas via migração SQL ANTES de usar no código. Se a coluna não existe, o update inteiro falha.
7. **O Playwright** deve usar `phone_landline` para preencher o portal, não `phone_whatsapp`.
8. **Deploy de edge functions:** `supabase functions deploy <nome> --project-ref zlzasfhcxcznaprrragl --no-verify-jwt`
9. **Deploy do worker:** Rebuild no Easypanel (puxa do GitHub automaticamente).
10. **Nunca** incluir `finalize_redirect_count` nos updates — usar `rescue_attempts` como contador de anti-loop.
