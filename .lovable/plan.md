

# Auditoria de Robustez - Pontos de Melhoria

O sistema esta muito bem construido. Identifiquei **6 pontos de risco** que podem ser reforçados sem quebrar nada:

---

## 1. Worker Portal - Chromium ainda quebrando (CRITICO)

O erro **persiste em producao**: o Worker VPS esta usando o Chromium do Playwright (`/root/.cache/ms-playwright/chromium-1208/`) em vez do sistema (`/usr/bin/chromium`). O `headless: true` esta configurado no codigo, mas o servidor no VPS **nao esta rodando via Docker** (ou o Docker nao foi rebuilded). Resultado: 1 lead preso em `automation_failed`.

**Correcao**: Forçar `executablePath` no codigo para `/usr/bin/chromium` como fallback fixo, e adicionar deteccao automatica do binario disponivel.

---

## 2. Leads presos sem recuperacao automatica

Existem leads com `status = automation_failed` ou `worker_offline` que ficam presos para sempre. Nao ha mecanismo de retry automatico.

**Correcao**: Adicionar um cron job (Edge Function `send-scheduled-messages` ou nova) que verifica leads presos ha mais de 10 minutos e reenvia ao Worker.

---

## 3. Erro de UUID vazio no banco

O log do Postgres mostra `invalid input syntax for type uuid: ""`. Algum codigo esta passando string vazia em vez de `null` para um campo UUID.

**Correcao**: Adicionar validacao nos pontos de insert/update para converter `""` em `null` antes de enviar ao Supabase.

---

## 4. Edge Function sem rate limiting

O webhook Evolution aceita qualquer volume de requests sem throttling. Um usuario mal-intencionado ou um loop na Evolution API poderia sobrecarregar a Edge Function e esgotar a cota Gemini.

**Correcao**: Adicionar um rate limiter simples por `remoteJid` (ex: max 3 msgs/segundo) usando cache em memoria.

---

## 5. OCR sem timeout global

Se o Gemini demorar muito (>50s), a Edge Function pode atingir o timeout do Supabase (60s) e morrer sem responder ao usuario.

**Correcao**: Adicionar um timeout wrapper de 45s no bloco OCR que retorna uma mensagem amigavel ("Tente enviar novamente") em vez de morrer silenciosamente.

---

## 6. Instancias WhatsApp zeradas

A tabela `whatsapp_instances` esta **vazia** (query retornou `[]`). Isso significa que nenhum consultor tem instancia ativa. Apos o reset anterior, ninguem reconectou.

**Correcao**: Isso nao e um bug de codigo, mas vale alertar que **nenhuma automacao funciona ate que os consultores reconectem seus QR codes**.

---

## Plano de Implementacao

| # | Acao | Arquivo | Risco |
|---|------|---------|-------|
| 1 | Fixar executablePath do Chromium com fallback | `worker-portal/playwright-automation.mjs` | Nenhum |
| 2 | Criar retry automatico para leads presos | `supabase/functions/evolution-webhook/index.ts` (ou nova function) | Nenhum |
| 3 | Sanitizar UUIDs vazios antes de insert | `supabase/functions/evolution-webhook/index.ts` | Nenhum |
| 4 | Rate limiter por remoteJid no webhook | `supabase/functions/evolution-webhook/index.ts` | Nenhum |
| 5 | Timeout wrapper no bloco OCR | `supabase/functions/_shared/ocr.ts` | Nenhum |

Nenhuma destas mudancas altera o fluxo existente - todas sao camadas de protecao adicionais.

