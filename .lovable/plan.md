

## Diagnóstico real dos logs

Os logs mostram **3 problemas críticos** que fazem o cadastro nunca chegar ao final:

### 1. MinIO está OFFLINE (rede inacessível)
```
📦❌ MinIO upload falhou [doc_frente]: Connection timed out
   ⚠️  RG frente: fetch failed
   ⚠️  Conta de luz: fetch failed
```
- O host `igreen-minio.b099mi.easypanel.host` está com timeout TCP de fora do Easypanel
- Resultado: webhook salva `document_front_url = "evolution-media:pending"` (placeholder, não URL real)
- Worker tenta baixar `"evolution-media:pending"` → `fetch failed` → usa `fixtures/documento.jpg` (genérico!)
- **O cadastro fica usando documento fake** mesmo com OCR perfeito

### 2. Worker NÃO recebe Base64 do banco
- Webhook descontinuou `document_front_base64` (mudança da v8)
- Mas worker ainda tenta `fetch(document_front_url)` que é `"evolution-media:pending"`
- Não há fallback para reconstruir via Evolution API

### 3. Campo "Confirme seu celular" travando o fluxo
```
⏳ Aguardando "Confirme seu celular" (tentativa 8/8)...
❌ Campo "Confirme seu celular" não apareceu no portal
```
- Portal mudou comportamento — **não pede mais confirmação de celular**
- Worker dá hard-fail e re-enfileira para sempre (loop infinito)

### 4. Bonus: PDF→JPG falhando
```
⚠️ Conversão PDF→JPG falhou: pdftoppm
```
- Container do worker não tem `poppler-utils` instalado

---

## Plano de correção

### Fase 1 — Arrumar storage (URGENTE)
- **Webhook**: quando MinIO falhar, salvar Base64 direto no banco temporariamente (`document_front_base64`, `bill_base64`) com flag `media_storage = 'inline'`
- **Worker**: prioridade de leitura: 
  1. URL pública do MinIO (se válida)
  2. `document_front_base64` do banco (fallback)
  3. Re-baixar via Evolution API usando `media_message_id` salvo
  4. NUNCA usar `fixtures/` como fallback silencioso — falhar explicitamente
- Adicionar coluna `media_message_id` em customers para reprocessar via Evolution

### Fase 2 — Tornar "Confirme celular" opcional
- Reduzir tentativas de 8 para 4 (12s total)
- Se não aparecer, **logar warning e seguir** (não hard-fail)
- Validar via OTP/SMS depois — o portal hoje confirma via SMS, não via campo duplicado

### Fase 3 — Worker fail-fast em documento fake
- Se `documento.jpg` for o `fixtures/` genérico, abortar ANTES de abrir browser
- Marcar status `awaiting_document_resend` e pedir cliente reenviar via WhatsApp

### Fase 4 — Adicionar poppler-utils ao Dockerfile
- `apt-get install -y poppler-utils` no `worker-portal/Dockerfile`
- Permite converter PDF→JPG quando portal não aceita PDF

### Fase 5 — Reset do lead travado
- Limpar `recentlyProcessed` para o customer atual (4586e30b)
- Permitir reprocessamento imediato após correções

---

## Arquivos a alterar

- `supabase/functions/evolution-webhook/index.ts` — fallback Base64 quando MinIO falha + salvar `media_message_id`
- `worker-portal/playwright-automation.mjs`:
  - Hierarquia de busca de mídia (URL → Base64 → Evolution API)
  - "Confirme celular" vira soft-warn em vez de hard-fail
  - Detectar fixtures e abortar
- `worker-portal/Dockerfile` — adicionar `poppler-utils`
- Migration: adicionar `media_message_id`, `bill_message_id`, `media_storage` em customers

---

## Resultado esperado

- ✅ Documento real chega no portal mesmo com MinIO offline
- ✅ Cadastro avança sem travar em "Confirme celular"
- ✅ PDF é convertido corretamente
- ✅ Sistema falha explicitamente (não silenciosamente) quando dado é inválido
- ✅ Cliente atual (CELIO) pode ser reprocessado imediatamente

