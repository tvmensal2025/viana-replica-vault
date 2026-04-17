---
name: portal-form-selectors
description: Mapeamento real do portal digital.igreenenergy.com.br - formulário PROGRESSIVO; CPF auto-preenche Nome+DataNasc da Receita (NUNCA sobrescrever); Tipo documento tem 3 opções (RG Antigo, RG Novo, CNH); CNH OCR só salva data nasc se confiança alta
type: feature
---

Mapeamento confirmado ao vivo (v7 — 17/04/2026, validado end-to-end com CPF de teste 111.444.777-35) do portal `https://digital.igreenenergy.com.br/?id={consultor_id}&sendcontract=true`:

**Landing**: CEP (`placeholder="CEP"`) + Valor da conta (`placeholder` começa com `R$`) → "Calcular" → revela botão verde **"Garantir meu desconto"** que avança para o formulário.

**Fluxo PROGRESSIVO** (campos só aparecem após o anterior validar):
1. **CPF ou CNPJ** (`placeholder="CPF ou CNPJ"`) — auto-preenche **Nome completo** e **Data de Nascimento** via consulta à Receita Federal em ~3-5s (até 18s com `waitForAutoFill()`).
2. **Número do seu WhatsApp** — máscara `(00) 00000-0000`, aceita 11 dígitos sem +55. Worker faz até 12 tentativas (1.5s) + MutationObserver para detectar render.
3. **Confirme seu celular** — OBRIGATÓRIO, idêntico em dígitos. Pode demorar para renderizar — worker dispara blur no campo WhatsApp e tenta 8x. Se não aparecer, lança erro hard (não avança quebrado). Erro do portal: `"Celular diferente do fornecido."`.
4. **E-mail** + **Confirme seu E-mail** — mesma regra.
5. **CEP** já vem pré-preenchido da landing → auto-preenche **Endereço**, **Bairro**, **Cidade**, **Estado**.
6. **Número** (do endereço) — manual. **Complemento** — opcional.
7. **Distribuidora de energia** — ⚠️ **MUI Select MANUAL**, NÃO é auto-detectada pelo CEP. Lista de opções (CPFL, etc.). Worker deve abrir o combobox e selecionar via `customer.distribuidora` ou usar a 1ª opção como fallback.
8. **Número da instalação** — campo texto obrigatório (7-12 dígitos, "Seu Código" da conta de luz).
9. **Tipo documento** — ⚠️ **MUI Select MANUAL com 3 OPÇÕES**: `RG (Antigo)` (li[1]), `RG (Novo)` (li[2]), `CNH` (li[3]). Mapeamento: `customer.document_type === 'cnh'` → li[3]; `'rg_novo'` → li[2]; `'rg_antigo'|'rg'` → li[1].
10. **Documento pessoal**:
    - **Se Tipo = CNH** → aparece **APENAS upload "Frente"** (sem Verso).
    - **Se Tipo = RG (Antigo|Novo)** → aparecem **Frente + Verso**.
    - Apenas IMG/JPG/PNG (PDFs precisam ser convertidos antes).
11. (depois) Pergunta sobre placas solares (radio `Sim`/`Não` — default `Não`), upload da conta de energia (PDF aceito), procurador (`Não`), débito em aberto (`Não`), Finalizar.

**REGRA DE OURO — Data de Nascimento (v7)**:
- Após digitar CPF, o portal consulta a Receita Federal e auto-preenche **Nome + Data de Nascimento corretos**.
- Esses valores são a **fonte da verdade** — o worker NUNCA deve sobrescrevê-los com dados do banco/OCR.
- O worker usa `waitForAutoFill(page, 18000)` para aguardar e logar o que o portal preencheu.
- OCR de CNH é frequentemente confundido (Data de Emissão vs Nascimento vs Validade vs 1ª Habilitação) — por isso o webhook só salva `data_nascimento` da CNH se `dataNascimentoConfianca === "alta"`. Caso contrário, deixa em branco e o portal preenche via CPF.

**BUG CRÍTICO** (corrigido em v4): Campos com máscara MUI/react-imask (telefone, CPF, CNPJ, CEP, data) não aceitam `_valueTracker.setValue()` direto — usar **digitação caractere-por-caractere com `delay: 90ms`** + dispatch de `blur`.

**Validação de valor**: `matchesExpected(actual, expected, 'digits')` compara apenas dígitos.

**MUDANÇAS v7 vs v6**:
- ✅ Adicionado helper `waitForAutoFill()` que faz polling do `value` real dos inputs Nome/Nascimento por até 18s e loga o resultado para auditoria.
- ✅ Adicionado helper `waitForFieldByPlaceholder()` com MutationObserver para detectar campos que renderizam tarde (WhatsApp).
- ✅ WhatsApp: 6→12 tentativas a cada 1.5s (18s total) + MutationObserver inicial.
- ✅ "Confirme seu celular": 4→8 tentativas com blur explícito entre cada — agora **hard-fail** em vez de warn silencioso (não avança broken).
- ✅ OCR de CNH em `_shared/ocr.ts`: prompt reforçado com lista explícita de datas a NÃO confundir (Emissão, Validade, 1ª Habilitação) + validação de plausibilidade (ano entre 1920 e ano atual − 17) + campo `dataNascimentoConfianca`.
- ✅ Webhook: para CNH, só salva `data_nascimento` se `dataNascimentoConfianca === "alta"`. Senão, mensagem ao cliente diz "_(será preenchido pelo portal via CPF)_".
