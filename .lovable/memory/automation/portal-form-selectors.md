---
name: Portal iGreen Form Selectors Map (validado live 2026-04-18 v5 - end-to-end)
description: Mapeamento completo end-to-end do portal digital.igreenenergy.com.br validado live em 2026-04-18 com Playwright. Formulário PROGRESSIVO 100% mapeado em 3 etapas (simulador, dados, documentos). CPF auto-preenche Nome+DataNasc. CEP NÃO auto-preenche endereço. Distribuidora é filtrada pelo ESTADO (não CEP). Email tem validação de unicidade no portal. Tipo documento tem labels "RG (Antigo)", "RG (Novo)" etc. Uploads são <label> clickable que disparam <input type=file> escondidos. Todos os inputs usam placeholder exato (sem id/name estável - React 18 useId).
type: feature
---

## Portal URL
`https://digital.igreenenergy.com.br/?id={CONSULTOR_ID}&sendcontract=true`

## ⚠️ REGRAS CRÍTICAS (validadas live 2026-04-18 v5)

1. **3 ETAPAS sequenciais**: (1) Simulador → (2) Formulário Progressivo → (3) Upload de Documentos → (4) Finalizar/OTP
2. **CPF auto-preenche Nome+DataNasc** via Receita — NÃO sobrescrever, mas VALIDAR (CPF inválido bloqueia tudo silenciosamente)
3. **Email tem validação ÚNICA no portal** — "Este email já está cadastrado para outro cliente" se reusado
4. **CEP NÃO auto-preenche endereço** — Endereço/Número/Bairro/Cidade são MANUAIS
5. **Distribuidora é filtrada pelo ESTADO selecionado** (não pelo CEP) — opções variam por UF (ex: SP=CPFL/Elektro/Energisa SS, PB=Energisa Paraiba)
6. **Estado é combobox MUI sem acentos** ("Sao Paulo", "Maranhão" único com til, "Pará", "Paraná", "Piauí")
7. **Tipo documento é combobox MUI** com opções: "RG (Antigo)", "RG (Novo)", possivelmente "CNH"
8. **Uploads são `<label>` clickables** com `<input type=file>` hidden por dentro — clicar no label abre o file picker, ou usar `setInputFiles` no input file
9. **"Confirme seu celular" e "Confirme seu E-mail" SEMPRE existem** — ambos obrigatórios com mesmo valor
10. **Todos inputs usam placeholder EXATO** — React 18 gera IDs com `:` (ex: `:r5:`) que quebram CSS `#id`. Usar `[id="..."]` se precisar

## Sequência Validada Live End-to-End (CEP 13350000)

### ETAPA 1: Simulação (página inicial)
- `input[placeholder="CEP"]` → "13350000"
- `input[placeholder="Valor da conta"]` → "301,01" (formato BR)
- `button:has-text("Calcular")` → revela `button:has-text("Garantir meu desconto")`
- Clicar "Garantir meu desconto" → vai ao formulário

### ETAPA 2: Formulário Progressivo (ordem real validada)

**Bloco identificação (aparece um a um):**
1. `input[placeholder="CPF ou CNPJ"]` — digitar CPF VÁLIDO → auto-preenche Nome+DataNasc após blur
2. `input[placeholder="Nome completo"]` — AUTO (validar não-vazio antes de seguir)
3. `input[placeholder="Data de Nascimento"]` — AUTO (validar não-vazio)

**Bloco contato (aparece após Nome+DataNasc preenchidos):**
4. `input[placeholder="Número do seu WhatsApp"]` — máscara aplica "(11) 98900-0650"
5. `input[placeholder="Confirme seu celular"]` — mesmo valor

**Bloco email (aparece após WhatsApp confirmado):**
6. `input[placeholder="E-mail"]` — validar unicidade (portal recusa repetidos)
7. `input[placeholder="Confirme seu E-mail"]` — mesmo valor

**Bloco endereço (aparece após Email confirmado):**
8. `input[placeholder="CEP"]` — vem auto da Etapa 1
9. `input[placeholder="Endereço"]` — MANUAL
10. `input[placeholder="Número"]` (segundo input com este placeholder, contexto endereço) — MANUAL
11. `input[placeholder="Bairro"]` — MANUAL
12. `input[placeholder="Cidade"]` — MANUAL
13. **Combobox MUI "Estado"** — `[role="combobox"]` próximo ao label "Estado"; opções `li[role="option"]` com nomes sem acento ("Sao Paulo")
14. `input[placeholder="Complemento"]` — opcional

**Bloco distribuidora (aparece após Estado selecionado):**
15. **Combobox MUI "Distribuidora de energia"** — opções FILTRADAS pelo Estado (ex: PB → "Energisa Paraiba" única; SP → 5 opções)
16. `input[placeholder="Número da instalação"]` — aparece DEPOIS de Distribuidora

**Bloco documento (aparece após Número da instalação):**
17. **Combobox MUI "Tipo documento"** — opções "RG (Antigo)", "RG (Novo)" (CNH possivelmente)

### ETAPA 3: Upload de Documentos (aparece após Tipo documento)

**Documento pessoal (frente + verso para RG):**
18. `label` com texto "Frente" — clicar abre file picker; o input file está dentro do label.  
    Selector input: `input[type="file"]` dentro do bloco "Documento pessoal" (primeiro)
19. `label` com texto "Verso" — segundo input file dentro de "Documento pessoal"
    
**Conta de energia (aparece após documento pessoal):**
20. Bloco "Conta de energia" com botão de upload — terceiro `input[type="file"]`

### ETAPA 4: Finalizar (aparece após todos uploads concluídos)
21. `button:has-text("Finalizar")` — dispara OTP via WhatsApp/SMS

## Estratégia de Seletores (Worker)

### Para inputs texto:
```js
page.locator('input[placeholder="EXATO"]').first()
```

### Para comboboxes MUI:
```js
// Abrir
await page.locator('[role="combobox"]').filter({ has: page.locator('text=LABEL') }).click()
// OU pelo label dentro do parent
await page.getByLabel('Estado').click()
// Selecionar opção
await page.locator('li[role="option"]').filter({ hasText: 'Sao Paulo' }).click()
```

### Para uploads:
```js
// Estratégia A: setInputFiles direto no input file escondido
const fileInputs = await page.locator('input[type="file"]').all()
await fileInputs[0].setInputFiles(pathFrente)  // Frente RG
await fileInputs[1].setInputFiles(pathVerso)   // Verso RG
await fileInputs[2].setInputFiles(pathConta)   // Conta de luz

// Estratégia B (se A não funcionar): clicar no label e usar filechooser
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.locator('label:has-text("Frente")').click()
])
await chooser.setFiles(pathFrente)
```

### Para Estado (cuidado com nomes sem acento):
| UF input do banco | Texto exato no portal |
|---|---|
| SP / São Paulo | `Sao Paulo` |
| RJ / Rio de Janeiro | `Rio de Janeiro` |
| MG / Minas Gerais | `Minas Gerais` |
| BA / Bahia | `Bahia` |
| PR / Paraná | `Paraná` (com acento) |
| PI / Piauí | `Piauí` (com acento) |
| MA / Maranhão | `Maranhão` (com acento) |
| PA / Pará | `Pará` (com acento) |
| Outros | Sem acento (ex: "Goias", "Ceara", "Espirito Santo") |

### Para Distribuidora:
- Lista é dinâmica filtrada pelo Estado escolhido
- Fallback seguro: pegar a 1ª opção, OU fazer match por substring com o campo `customer.distribuidora`

## Validações Críticas Anti-Travamento

1. **Após preencher CPF**, esperar até 5s e verificar se Nome NÃO está vazio. Se vazio → CPF inválido, abortar com `awaiting_cpf_review`
2. **Após preencher Email**, esperar e verificar se NÃO apareceu mensagem "Este email já está cadastrado". Se apareceu → trocar para email alternativo (`{cpf}@temp.igreen.com.br`) ou abortar com `email_duplicate`
3. **Após escolher Estado**, esperar combobox Distribuidora ficar habilitado (não vazio) antes de clicar
4. **Após escolher Distribuidora**, esperar campo "Número da instalação" aparecer
5. **Após escolher Tipo documento**, esperar bloco "Documento pessoal" aparecer com inputs file
