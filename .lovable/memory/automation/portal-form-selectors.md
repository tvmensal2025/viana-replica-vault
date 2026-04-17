---
name: portal-form-selectors
description: Mapeamento real do portal digital.igreenenergy.com.br - formulário PROGRESSIVO com campos mascarados que exigem digitação real
type: feature
---

Mapeamento confirmado ao vivo (v4 — 17/04/2026) do portal `https://digital.igreenenergy.com.br/?id={consultor_id}&sendcontract=true`:

**Landing**: CEP (`placeholder="CEP"`) + Valor da conta (`placeholder` começa com `R$`) → botão "Calcular" → revela botão verde **"Garantir meu desconto"** que avança para o formulário.

**Fluxo PROGRESSIVO** (campos só aparecem após o anterior validar):
1. **CPF ou CNPJ** (`placeholder="CPF ou CNPJ"`) — auto-preenche **Nome completo** (`placeholder="Nome completo"`) e **Data de Nascimento** (`placeholder="Data de Nascimento"`) via consulta externa após ~3-5s.
2. **Número do seu WhatsApp** (`placeholder="Número do seu WhatsApp"`) — máscara `(00) 00000-0000`. Aceita **11 dígitos sem +55** (formata automaticamente).
3. **Confirme seu celular** (`placeholder="Confirme seu celular"`) — OBRIGATÓRIO, deve ser idêntico em dígitos. Erro mostrado: `"Celular diferente do fornecido."`
4. **E-mail** + **Confirme seu E-mail** — mesma regra de duplicação.
5. **CEP** auto-preenche endereço (rua, bairro, cidade, estado).
6. Distribuidora detectada automaticamente — **NÃO PEDE login/senha**.
7. Pergunta sobre placas solares (radio `Sim`/`Não` — default `Não`).
8. Uploads: documento frente/verso + conta de energia (apenas IMG/JPG/PNG para docs pessoais; PDF aceito para conta).

**BUG CRÍTICO IDENTIFICADO** (corrigido em v4): Campos com máscara MUI/react-imask (telefone, CPF, CNPJ, CEP, data) **não aceitam** `_valueTracker.setValue()` direto — a máscara não é acionada e o valor é silenciosamente rejeitado pela validação interna. O `reactFill` agora detecta esses campos via placeholder/name/type e usa **digitação caractere-por-caractere com `delay: 90ms`** + dispatch de `blur` para acionar validação.

**Validação de valor**: `matchesExpected(actual, expected, 'digits')` compara apenas dígitos, então `(11) 98765-4321` casa com `11987654321`.
