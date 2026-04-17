---
name: portal-form-selectors
description: Mapeamento real do portal digital.igreenenergy.com.br — formulário PROGRESSIVO. CPF auto-preenche Nome+DataNasc (NUNCA sobrescrever). Tipo documento = 3 opções reais (RG Antigo, RG Novo, CNH). CNH = só FRENTE; RG = FRENTE+VERSO. document_type canônico no banco: cnh | rg_novo | rg_antigo.
type: feature
---

Mapeamento confirmado ao vivo (v8 — 17/04/2026, validado end-to-end com CPF de teste 111.444.777-35) do portal `https://digital.igreenenergy.com.br/?id={consultor_id}&sendcontract=true`:

**Landing**: CEP (`placeholder="CEP"`) + Valor da conta (`placeholder` começa com `R$`) → "Calcular" → revela botão verde **"Garantir meu desconto"** que avança para o formulário.

**Fluxo PROGRESSIVO** (campos só aparecem após o anterior validar):
1. **CPF ou CNPJ** (`placeholder="CPF ou CNPJ"`) — auto-preenche **Nome** e **Data de Nascimento** via consulta à Receita Federal em ~3-5s (até 18s com `waitForAutoFill()`). **Fonte da verdade** — worker NUNCA sobrescreve.
2. **Número do seu WhatsApp** — máscara `(00) 00000-0000`. Worker faz até 12 tentativas (1.5s) + MutationObserver.
3. **Confirme seu celular** — OBRIGATÓRIO. Worker dispara blur no campo WhatsApp e tenta 8x. Se não aparecer, **hard-fail**.
4. **E-mail** + **Confirme seu E-mail**.
5. **CEP** já vem da landing → auto-preenche **Endereço/Bairro/Cidade/Estado**.
6. **Número** + **Complemento** (opcional).
7. **Distribuidora** — MUI Select MANUAL (CPFL, Enel, etc.).
8. **Número da instalação** — 7-12 dígitos.
9. **Tipo documento** — ⚠️ MUI Select com **3 OPÇÕES REAIS**:
   - `RG (Antigo)` (li[1])
   - `RG (Novo)` (li[2])
   - `CNH` (li[3])
10. **Documento pessoal**:
    - **CNH** → APENAS upload "Frente" (sem Verso). Portal esconde o campo verso.
    - **RG (Antigo|Novo)** → Frente + Verso obrigatórios.
    - Apenas IMG/JPG/PNG (PDFs convertidos antes).
11. Placas solares (default Não), upload conta (PDF aceito), procurador (Não), débito (Não), Finalizar.

**REGRA DE OURO — document_type CANÔNICO (v8)**:
Em todo o sistema usamos APENAS 3 valores no banco e no worker:
- `cnh`
- `rg_novo`
- `rg_antigo`

Helpers: `_shared/document-type.ts` no Supabase e `normalizeDocType()` no worker. **Nunca comparar string crua** (`=== "CNH"`) — sempre normalizar.

**REGRA DE OURO — Data de Nascimento**:
- Portal preenche via CPF → fonte da verdade, worker não sobrescreve.
- Webhook só salva `data_nascimento` da CNH se `dataNascimentoConfianca === "alta"`.
- Senão, deixa em branco e o portal preenche automaticamente.

**REGRA DE OURO — Storage MinIO (v8)**:
- Caminho ÚNICO oficial: upload imediato no `evolution-webhook` ao receber a mídia (bill, doc_frente, doc_verso) via `_shared/minio-upload.ts`.
- A função `upload-documents-minio` virou ferramenta de RECOVERY manual — não é mais chamada no hot-path do webhook (era um upload duplicado e travava em timeouts de rede).
- `customers.document_front_base64` foi descontinuado: NÃO salvar mais base64 gigante no banco. O OCR conjunto frente+verso usa apenas o base64 do verso (suficiente para preencher campos faltantes).
- Se MinIO falhar, salva `evolution-media:pending` no campo e segue (recovery posterior).

**BUG CRÍTICO** (corrigido em v4): Campos com máscara MUI/react-imask (telefone, CPF, CNPJ, CEP, data) precisam de digitação caractere-por-caractere com `delay: 90ms` + `blur` — `_valueTracker.setValue()` não funciona.

**MUDANÇAS v8 vs v7**:
- ✅ Worker para de mapear CNH→RG(Novo); seleciona "CNH" real no MUI Select e pula upload do verso.
- ✅ Validação visual após selecionar tipo: confere se campo verso aparece (RG) ou some (CNH).
- ✅ `document_type` canonicalizado (`cnh|rg_novo|rg_antigo`) em webhook, validators, conversation-helpers e worker via `normalizeDocType()`.
- ✅ Removido segundo upload "fire-and-forget" para `upload-documents-minio` no fim do fluxo do webhook.
- ✅ `document_front_base64` parou de ser persistido no banco.
- ✅ Logs estruturados `[FASE_*] [STATUS]` no worker para debug rápido nos logs do Easypanel.
