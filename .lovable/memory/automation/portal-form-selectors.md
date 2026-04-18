---
name: Portal iGreen Form Selectors Map (validado live 2026-04-18 v6 - CEP auto-completa)
description: Mapeamento DEFINITIVO end-to-end do portal digital.igreenenergy.com.br validado live em 2026-04-18 com Playwright. CEP **AUTO-PREENCHE** Endereço+Bairro+Cidade+Estado (descoberta v6). NÃO há combobox de Distribuidora — é inferida pelo CEP. Tipo documento tem 3 opções fixas (RG Antigo, RG Novo, CNH). CNH pede APENAS Frente. Portal valida unicidade de Email E de Número da Instalação. CPF auto-preenche Nome+DataNasc via Receita.
type: feature
---

## Portal URL
`https://digital.igreenenergy.com.br/?id={CONSULTOR_ID}&sendcontract=true`

## ⚠️ REGRAS DEFINITIVAS (validadas live 2026-04-18 v6)

1. **3 ETAPAS sequenciais**: (1) Simulador → (2) Formulário Progressivo → (3) Upload Documentos → (4) Finalizar/OTP
2. **CPF auto-preenche Nome+DataNasc** via Receita — validar campos não-vazios após blur (CPF inválido bloqueia silenciosamente)
3. **Email tem validação ÚNICA no portal** — recusa se já cadastrado
4. **CEP AUTO-PREENCHE Endereço+Bairro+Cidade+Estado** ✅ (DESCOBERTA v6 — antes pensávamos que era manual)
5. **Apenas Número e Complemento são manuais no bloco endereço**
6. **NÃO existe combobox "Distribuidora"** ✅ (DESCOBERTA v6 — distribuidora é inferida pelo CEP no backend)
7. **Número da instalação tem validação de unicidade** — "Número de instalação já cadastrado" se reusado
8. **Tipo documento é combobox MUI com 3 opções FIXAS**: `RG (Antigo)`, `RG (Novo)`, `CNH`
9. **CNH pede APENAS upload Frente** (1 file). RG (Antigo/Novo) pede Frente + Verso (2 files)
10. **Conta de energia parece NÃO ser bloco separado** — é incorporada na fluxo após documento (validar live até finalizar)
11. **Confirmação de celular E email são obrigatórias** (mesmo valor)
12. **Selectors estáveis: `input[placeholder="EXATO"]`** — React 18 IDs com `:` quebram CSS `#id`

## Sequência Validada Live End-to-End (CEP 13309-410, Itu/SP)

### ETAPA 1: Simulação
1. `input[placeholder="CEP"]` → "13309410"
2. `input[placeholder="Valor da conta"]` → "205,04" (BR)
3. `button:has-text("Calcular")` → revela `button:has-text("Garantir meu desconto")`
4. Clicar "Garantir meu desconto" → vai ao formulário

### ETAPA 2: Formulário Progressivo (ordem REAL validada)

**Bloco identificação:**
1. `input[placeholder="CPF ou CNPJ"]` → digitar CPF VÁLIDO + blur → auto-preenche
2. `input[placeholder="Nome completo"]` ← AUTO (validar não-vazio)
3. `input[placeholder="Data de Nascimento"]` ← AUTO

**Bloco contato:**
4. `input[placeholder="Número do seu WhatsApp"]` (máscara aplica "(11) 98900-0650")
5. `input[placeholder="Confirme seu celular"]` (mesmo valor)

**Bloco email:**
6. `input[placeholder="E-mail"]` (validar unicidade)
7. `input[placeholder="Confirme seu E-mail"]` (mesmo valor)

**Bloco endereço (após confirmar email):**
8. `input[placeholder="CEP"]` ← VEM AUTO da Etapa 1
9. `input[placeholder="Endereço"]` ← **AUTO via CEP** ✅
10. `input[placeholder="Número"]` (segundo input com este placeholder, contexto endereço) ← MANUAL
11. `input[placeholder="Bairro"]` ← **AUTO via CEP** ✅
12. `input[placeholder="Cidade"]` ← **AUTO via CEP** ✅
13. **Combobox MUI "Estado"** ← **AUTO via CEP** ✅ (mostra "Sao Paulo" sem acento)
14. `input[placeholder="Complemento"]` ← OPCIONAL/MANUAL

**Bloco instalação (após endereço completo):**
15. `input[placeholder="Número da instalação"]` ← MANUAL (validar unicidade no portal)
    - Se erro "Número de instalação já cadastrado", o lead já existe → abortar com `installation_duplicate`

**Bloco documento (após instalação aceita):**
16. **Combobox MUI "Tipo documento"** com 3 opções: `RG (Antigo)`, `RG (Novo)`, `CNH`
    - Mapping: `customer.document_type === 'cnh' || rg === null` → `CNH`
    - Senão → `RG (Novo)` (default seguro)

### ETAPA 3: Upload de Documentos

**Se CNH:**
17. `label` "Frente" → 1 input file dentro do bloco "Documento pessoal"
    ```js
    const inputs = page.locator('input[type="file"]')
    await inputs.nth(0).setInputFiles(pathFrente)
    ```

**Se RG (Antigo) ou RG (Novo):**
17. `label` "Frente" → input[0]
18. `label` "Verso" → input[1] (obrigatório, mostra erro "Documento obrigatório.")

**Conta de energia (a confirmar live — pode aparecer DEPOIS):**
- Bloco "Conta de energia" com botão upload → próximo input file livre

### ETAPA 4: Finalizar
- `button:has-text("Finalizar")` → dispara OTP via WhatsApp/SMS

## Estratégia de Seletores (Worker)

### Inputs texto:
```js
page.locator('input[placeholder="EXATO"]').first()
// Para "Número" (existe 2x — um do CEP simulador e um do endereço):
page.locator('input[placeholder="Número"]').nth(1) // segundo
```

### Comboboxes MUI:
```js
await page.locator('[role="combobox"]').filter({ hasText: 'Tipo documento' }).click()
await page.locator('li[role="option"]').filter({ hasText: 'CNH' }).click()
```

### Uploads (estratégia validada):
```js
// O setInputFiles funciona no input file escondido dentro do label
const fileInputs = page.locator('input[type="file"]')
await fileInputs.nth(0).setInputFiles(pathFrente)  // Frente (CNH ou RG)
// Apenas se RG:
await fileInputs.nth(1).setInputFiles(pathVerso)   // Verso RG
// Conta de luz vai no próximo índice livre quando aparecer
```

### Mapping documento → tipo no portal:
| customer.document_type | Tipo documento (portal) | Uploads |
|---|---|---|
| `cnh` | `CNH` | 1 (Frente apenas) |
| `rg`, `rg_novo` | `RG (Novo)` | 2 (Frente + Verso) |
| `rg_antigo` | `RG (Antigo)` | 2 (Frente + Verso) |
| `null`/desconhecido | `CNH` (fallback seguro: 1 file) | 1 |

## Validações Críticas Anti-Travamento

1. **Pós-CPF**: aguardar 5s, verificar `Nome != ""` — senão CPF inválido → abortar `awaiting_cpf_review`
2. **Pós-Email**: verificar mensagem "Este email já está cadastrado" — fallback `{cpf}@temp.igreen.com.br` ou abortar `email_duplicate`
3. **Pós-Número da instalação**: verificar "Número de instalação já cadastrado" — abortar `installation_duplicate`
4. **Pós-CEP**: aguardar 3s — se Endereço/Bairro/Cidade ainda vazios, fallback para preenchimento manual a partir de `customer.address_*`
5. **Pós-Tipo documento**: aguardar bloco "Documento pessoal" + N inputs file (1 para CNH, 2 para RG)
6. **Conta de energia**: verificar se aparece bloco extra após docs pessoais — se sim, anexar PDF da conta no próximo input file
