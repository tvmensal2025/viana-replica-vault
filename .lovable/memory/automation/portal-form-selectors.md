---
name: Portal iGreen Form Selectors Map (validado live 2026-04-18 v4)
description: Mapeamento completo do portal digital.igreenenergy.com.br validado live em 2026-04-18. Formulário PROGRESSIVO. CPF auto-preenche Nome+DataNasc. CEP NÃO auto-preenche endereço (manual). Distribuidora é dropdown filtrado pelo CEP (5 opções típicas). Estado é combobox MUI. Após Distribuidora aparece "Número da instalação". Todos os inputs usam placeholder exato (sem name/id estável).
type: feature
---

## Portal URL
`https://digital.igreenenergy.com.br/?id={CONSULTOR_ID}&sendcontract=true`

## ⚠️ REGRAS CRÍTICAS (validadas live 2026-04-18 v4)

1. **ETAPA 0 OBRIGATÓRIA**: Simulador (CEP+Valor+Calcular+Garantir desconto) ANTES do formulário real
2. Formulário PROGRESSIVO: blocos só aparecem após validação anterior
3. **CPF auto-preenche Nome+DataNasc** via Receita — NÃO sobrescrever
4. **CEP NÃO auto-preenche endereço** — Endereço/Número/Bairro/Cidade são MANUAIS
5. **Estado é combobox MUI** (não input texto) — opções "Sao Paulo", etc.
6. **Distribuidora é dropdown FILTRADO pelo CEP** — geralmente 5 opções (ex: CPFL, CPFL Piratininga, CPFL Santa Cruz, Elektro, Energisa Sul Sudeste para SP interior)
7. **"Número da instalação" só aparece APÓS escolher Distribuidora**
8. **Tipo documento = combobox MUI** (aparece após Número da instalação)
9. **Todos inputs usam placeholder EXATO** — sem id/name estáveis (React 18 useId gera ":r5:" etc.)
10. **WhatsApp + Confirme celular** e **E-mail + Confirme E-mail**: AMBOS obrigatórios, mesmo valor

## Sequência Validada Live (CELIO TAVARES, CEP 13350000)

### Página 1: Simulação
- `input[placeholder="CEP"]` → "13350000"
- `input[placeholder="Valor da conta"]` → "301,01" (BR format)
- `button:has-text("Calcular")` → revela `button:has-text("Garantir meu desconto")`
- Clicar "Garantir meu desconto" → vai ao formulário

### Página 2: Formulário Progressivo (ordem real validada)
1. `input[placeholder="CPF ou CNPJ"]` — digitar CPF → auto-preenche Nome+DataNasc
2. `input[placeholder="Nome completo"]` — AUTO (NÃO tocar)
3. `input[placeholder="Data de Nascimento"]` — AUTO (NÃO tocar)
4. `input[placeholder="Número do seu WhatsApp"]` — digitar (máscara aplica "(11) 98900-0650")
5. `input[placeholder="Confirme seu celular"]` — digitar mesmo valor
6. `input[placeholder="E-mail"]` — digitar
7. `input[placeholder="Confirme seu E-mail"]` — digitar mesmo valor
8. `input[placeholder="CEP"]` — vem auto da etapa 1
9. `input[placeholder="Endereço"]` — MANUAL
10. `input[placeholder="Número"]` — MANUAL (do endereço)
11. `input[placeholder="Bairro"]` — MANUAL
12. `input[placeholder="Cidade"]` — MANUAL
13. **Combobox MUI Estado** — `[role="combobox"]` com label "Estado", opções com nomes sem acento ("Sao Paulo")
14. `input[placeholder="Complemento"]` — opcional
15. **Combobox MUI Distribuidora de energia** — abrir, escolher 1ª opção compatível (ex: "CPFL")
16. `input[placeholder="Número da instalação"]` — aparece DEPOIS de escolher distribuidora
17. **Combobox MUI Tipo documento** — aparece DEPOIS da instalação ("RG (Antigo)" / "RG (Novo)")
18. Uploads (`#file_input_frente_documento_pessoal`, `#file_input_verso_documento_pessoal`)
19. Conta de energia (PDF)
20. Botão "Finalizar" → dispara OTP

## Estratégia de Seletores (Worker)
- **PRIMÁRIO**: `page.locator('input[placeholder="EXATO"]').first()` com escape de aspas
- **NUNCA usar `#id`** — React 18 gera IDs com `:` (ex: `:r5:`) que quebram CSS selectors. Usar `[id="..."]` se precisar
- **Comboboxes**: clicar no `[role="combobox"]` cujo contexto contenha o label, depois clicar no `li[role="option"]` correspondente
- **Estado**: enviar nome SEM acento ("Sao Paulo", não "São Paulo")
- **Distribuidora**: a lista é pré-filtrada pelo CEP — fallback seguro = primeira opção
