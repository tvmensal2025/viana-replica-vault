---
name: portal-form-selectors
description: Mapeamento real do portal digital.igreenenergy.com.br - formulário PROGRESSIVO; Distribuidora e Tipo Documento são MUI Selects MANUAIS
type: feature
---

Mapeamento confirmado ao vivo (v5 — 17/04/2026, validado end-to-end com CPF de teste 111.444.777-35) do portal `https://digital.igreenenergy.com.br/?id={consultor_id}&sendcontract=true`:

**Landing**: CEP (`placeholder="CEP"`) + Valor da conta (`placeholder` começa com `R$`) → "Calcular" → revela botão verde **"Garantir meu desconto"** que avança para o formulário.

**Fluxo PROGRESSIVO** (campos só aparecem após o anterior validar):
1. **CPF ou CNPJ** (`placeholder="CPF ou CNPJ"`) — auto-preenche **Nome completo** e **Data de Nascimento** via consulta externa em ~3-5s.
2. **Número do seu WhatsApp** — máscara `(00) 00000-0000`, aceita 11 dígitos sem +55.
3. **Confirme seu celular** — OBRIGATÓRIO, idêntico em dígitos. Erro: `"Celular diferente do fornecido."`.
4. **E-mail** + **Confirme seu E-mail** — mesma regra.
5. **CEP** já vem pré-preenchido da landing → auto-preenche **Endereço**, **Bairro**, **Cidade**, **Estado**.
6. **Número** (do endereço) — manual.
7. **Distribuidora de energia** — ⚠️ **MUI Select MANUAL**, NÃO é auto-detectada pelo CEP. Lista de opções (CPFL, etc.). Worker deve abrir o combobox e selecionar via `customer.distribuidora` ou usar a 1ª opção como fallback.
8. **Número da instalação** — campo texto obrigatório (7-12 dígitos, "Seu Código" da conta de luz).
9. **Tipo documento** — ⚠️ **MUI Select MANUAL** com apenas duas opções: `RG (Antigo)` e `RG (Novo)`. CNH não existe → mapear CNH → "RG (Novo)".
10. **Documento pessoal**: upload Frente + Verso (apenas IMG/JPG/PNG).
11. (depois) Pergunta sobre placas solares (radio `Sim`/`Não` — default `Não`) e upload da conta de energia (PDF aceito).

**BUG CRÍTICO** (corrigido em v4): Campos com máscara MUI/react-imask (telefone, CPF, CNPJ, CEP, data) não aceitam `_valueTracker.setValue()` direto — usar **digitação caractere-por-caractere com `delay: 90ms`** + dispatch de `blur`.

**Validação de valor**: `matchesExpected(actual, expected, 'digits')` compara apenas dígitos.

**CORREÇÃO v5 vs v4**: A versão anterior afirmava erroneamente que distribuidora era auto-detectada e que login/senha podiam aparecer. **Confirmado em 17/04/2026**: para SP/CPFL não há login/senha, mas a distribuidora **DEVE** ser selecionada manualmente.
