---
name: portal-form-selectors
description: Mapeamento real do portal igreen + hierarquia de mídia (URL→Base64→Evolution→fail) + "Confirme celular" agora é OPCIONAL (soft-warn). document_type canônico cnh|rg_novo|rg_antigo. CNH só frente.
type: feature
---

# Portal iGreen — Selectors e Comportamento Real (v9 — 18/04/2026)

## Landing
CEP (`placeholder="CEP"`) + Valor (placeholder começa com `R$`) → "Calcular" → "Garantir meu desconto".

## Fluxo PROGRESSIVO (campos só aparecem após o anterior validar)
1. **CPF/CNPJ** — auto-preenche **Nome + Data Nasc** via Receita (3-18s). Worker **NUNCA sobrescreve**.
2. **Número do WhatsApp** — máscara `(00) 00000-0000`. Worker tenta 12x (1.5s) + MutationObserver.
3. **Confirme seu celular** — ⚠️ **OPCIONAL desde v9**. Worker tenta 4x (~8s); se não aparecer, **soft-warn e segue** (portal valida via SMS depois). Não é mais hard-fail.
4. **E-mail** + Confirme E-mail.
5. **CEP** — auto-preenche endereço.
6. **Número** + Complemento.
7. **Distribuidora** — MUI Select manual.
8. **Número da instalação** — 7-12 dígitos.
9. **Tipo documento** — MUI Select com 3 opções literais:
   - `RG (Antigo)` / `RG (Novo)` / `CNH`
10. **Documento pessoal**:
    - **CNH** → SÓ frente (portal esconde verso).
    - **RG** → Frente + Verso obrigatórios.
    - Apenas IMG/JPG/PNG (PDFs convertidos via `pdftoppm`).
11. Placas (Não), conta (PDF aceito), procurador (Não), débito (Não), Finalizar.

## REGRA — document_type CANÔNICO
Banco e código usam APENAS: `cnh` | `rg_novo` | `rg_antigo`.
Helpers em `_shared/document-type.ts` (webhook) e `normalizeDocType()` (worker).
**Nunca** comparar string crua (`=== "CNH"`).

## REGRA — Data Nascimento
- Portal via CPF é fonte da verdade.
- Webhook só salva data da CNH se `dataNascimentoConfianca === "alta"`.

## REGRA — Hierarquia de Mídia (v9)
Worker `prepararDocumento`/`prepararContaEnergia` busca em ordem:
1. URL HTTP do MinIO (timeout 15s)
2. data: URL Base64 já no campo `*_url`
3. `customers.document_front_base64` / `customers.bill_base64` (fallback inline)
4. Re-baixar via Evolution API (`customers.media_message_id` / `bill_message_id`) com `chat/getBase64FromMediaMessage`
5. **doc-frente**: ABORT → status `awaiting_document_resend` → cliente reenvia. **doc-verso/conta**: placeholder mínimo aceito.

**Nunca** usar `fixtures/documento.jpg` como fallback silencioso para frente.

## REGRA — Storage no Webhook
- Caminho oficial: upload imediato MinIO em `evolution-webhook`.
- Se MinIO falhar:
  - Salva Base64 inline em `document_front_base64`/`bill_base64`
  - Salva `media_message_id`/`bill_message_id` (id da msg WhatsApp)
  - Marca `media_storage = 'inline'`
- `upload-documents-minio` é apenas recovery manual.

## Conversão PDF → JPG
Container do worker tem `poppler-utils`. Para `doc-frente`/`doc-verso` PDF → JPG via `pdftoppm -jpeg -r 150 -f 1 -l 1`.

## BUG CRÍTICO (resolvido)
Campos com máscara MUI/react-imask (tel, CPF, CEP, data): digitação caractere-por-caractere com `delay: 90ms` + `blur`. `_valueTracker.setValue()` não funciona.

## MUDANÇAS v9 vs v8
- ✅ "Confirme celular" virou OPCIONAL (soft-warn em vez de hard-fail).
- ✅ Hierarquia de mídia URL→Base64→Evolution→fail-fast implementada.
- ✅ Webhook salva Base64 inline + messageId quando MinIO offline.
- ✅ Worker NUNCA usa fixture genérica para doc-frente — aborta com `awaiting_document_resend`.
- ✅ Dockerfile do worker passou a instalar `poppler-utils`.
- ✅ Novas colunas: `media_message_id`, `bill_message_id`, `bill_base64`, `media_storage`.
