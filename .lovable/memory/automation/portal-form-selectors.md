---
name: portal-form-selectors
description: Mapeamento real do portal digital.igreenenergy.com.br - formulário PROGRESSIVO; Distribuidora e Tipo Documento são MUI Selects MANUAIS; Tipo documento tem 3 opções (RG Antigo, RG Novo, CNH)
type: feature
---

Mapeamento confirmado ao vivo (v6 — 17/04/2026, validado end-to-end com CPF de teste 111.444.777-35) do portal `https://digital.igreenenergy.com.br/?id={consultor_id}&sendcontract=true`:

**Landing**: CEP (`placeholder="CEP"`) + Valor da conta (`placeholder` começa com `R$`) → "Calcular" → revela botão verde **"Garantir meu desconto"** que avança para o formulário.

**Fluxo PROGRESSIVO** (campos só aparecem após o anterior validar):
1. **CPF ou CNPJ** (`placeholder="CPF ou CNPJ"`) — auto-preenche **Nome completo** e **Data de Nascimento** via consulta externa em ~3-5s.
2. **Número do seu WhatsApp** — máscara `(00) 00000-0000`, aceita 11 dígitos sem +55.
3. **Confirme seu celular** — OBRIGATÓRIO, idêntico em dígitos. Erro: `"Celular diferente do fornecido."`.
4. **E-mail** + **Confirme seu E-mail** — mesma regra.
5. **CEP** já vem pré-preenchido da landing → auto-preenche **Endereço**, **Bairro**, **Cidade**, **Estado**.
6. **Número** (do endereço) — manual. **Complemento** — opcional.
7. **Distribuidora de energia** — ⚠️ **MUI Select MANUAL**, NÃO é auto-detectada pelo CEP. Lista de opções (CPFL, etc.). Worker deve abrir o combobox e selecionar via `customer.distribuidora` ou usar a 1ª opção como fallback.
8. **Número da instalação** — campo texto obrigatório (7-12 dígitos, "Seu Código" da conta de luz).
9. **Tipo documento** — ⚠️ **MUI Select MANUAL com 3 OPÇÕES (CONFIRMADO v6)**: `RG (Antigo)`, `RG (Novo)` E **`CNH`**. **CNH EXISTE como opção própria** (v5 estava errada). Mapeamento direto: `customer.document_type === 'cnh'` → opção `CNH` (li[3]); `'rg_novo'` → li[2]; `'rg_antigo'|'rg'` → li[1].
10. **Documento pessoal**: 
    - **Se Tipo = CNH** → aparece **APENAS upload "Frente"** (sem Verso). CONFIRMADO v6.
    - **Se Tipo = RG (Antigo|Novo)** → aparecem **Frente + Verso**.
    - Apenas IMG/JPG/PNG (PDFs precisam ser convertidos antes).
11. (depois) Pergunta sobre placas solares (radio `Sim`/`Não` — default `Não`), upload da conta de energia (PDF aceito), procurador (`Não`), débito em aberto (`Não`), Finalizar.

**BUG CRÍTICO** (corrigido em v4): Campos com máscara MUI/react-imask (telefone, CPF, CNPJ, CEP, data) não aceitam `_valueTracker.setValue()` direto — usar **digitação caractere-por-caractere com `delay: 90ms`** + dispatch de `blur`.

**Validação de valor**: `matchesExpected(actual, expected, 'digits')` compara apenas dígitos.

**MUDANÇAS v6 vs v5**:
- ✅ Confirmado que CNH **É opção nativa** no select Tipo documento (3 opções, não 2). NÃO precisa mapear CNH→RG Novo.
- ✅ Confirmado que ao escolher CNH, o portal mostra **apenas upload Frente**, sem Verso.
- ✅ Confirmado que CPF auto-preenche Nome+DataNasc via consulta externa (testado com 11144477735 → "Jean Carlos Monteiro / 02/08/1984").
- ✅ Confirmado: para SP/CPFL não há login/senha de distribuidora.
