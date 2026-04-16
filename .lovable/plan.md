

# Plano: Corrigir Worker Portal - Fluxo Completo Testado ao Vivo

## Diagnóstico Confirmado (inspeção ao vivo do portal)

Testei o portal `digital.igreenenergy.com.br` passo a passo e confirmei a estrutura real:

```text
CAMPO                    SELETOR REAL (LABEL, NÃO PLACEHOLDER)
────────────────────────────────────────────────────────────────
CPF ou CNPJ              input dentro de div com label "CPF ou CNPJ*"
Nome completo            AUTO-FILL pela Receita (após CPF)
Data de Nascimento       AUTO-FILL pela Receita (após CPF)
WhatsApp                 label "Número do seu WhatsApp*"
Confirme celular         label "Confirme seu celular*"
E-mail                   label "E-mail*"
Confirme E-mail          label "Confirme seu E-mail*"
CEP                      label "CEP*" (auto-fill no form)
Endereço                 label "Endereço*" (auto-fill pelo CEP)
Número                   label "Número*" (precisa preencher)
Bairro/Cidade/Estado     AUTO-FILL pelo CEP
Complemento              label "Complemento" (opcional)
Nº da instalação         label "Número da instalação*"
Tipo documento           MUI Select (dropdown) - trigger: div, opções em ul>li
Documento pessoal        Cards clicáveis "Frente" (e "Verso" se RG)
```

### Descobertas críticas:
1. **CNH = só 1 card ("Frente")**, sem Verso. RG = 2 cards
2. **MUI Select para "Tipo documento"**: opções em `div[2] > div[3] > ul > li` (li[1]=RG Antigo, li[2]=RG Novo, li[3]=CNH)
3. **Cards de upload usam fileChooser** - não input[type="file"]
4. **Campos usam LABELS MUI** (floating labels), não placeholders puros

## Mudanças em `worker-portal/playwright-automation.mjs`

### 1. Corrigir seletor de campos — usar labels MUI como fallback
O script atual usa `byPH('Número')` que busca por `placeholder="Número"`. O portal usa labels flutuantes MUI. Adicionar fallback via `page.getByLabel('Número')` e `page.locator('label:has-text("Número") + div input, label:has-text("Número") ~ div input')`.

### 2. Corrigir campo "Número" endereço
- Usar `page.getByLabel('Número', { exact: true })` como estratégia principal
- Manter fallback por placeholder
- Aguardar 3s após CEP + email serem preenchidos (auto-fill precisa de tempo)

### 3. Corrigir campo "Número da instalação"
- Usar `page.getByLabel('Número da instalação')` como estratégia principal  
- Fallback por placeholder parcial

### 4. Corrigir dropdown "Tipo documento" — MUI Select
A estrutura confirmada:
- **Trigger**: `div` dentro de `form > div > div[8]` — clicar na div que mostra o valor atual
- **Opções**: aparecem em `body > div[2] > div[3] > ul > li` como popover MUI
- Implementação:
```javascript
// Clicar no trigger MUI Select
const muiSelect = page.locator('.MuiSelect-select, [role="combobox"]').first();
await muiSelect.click();
await delay(800);
// Selecionar opção no popover
const option = page.locator(`li:has-text("${opcaoTexto}"), [role="option"]:has-text("${opcaoTexto}")`).first();
await option.click();
```

### 5. Upload documentos — fileChooser com lógica CNH vs RG
- **CNH**: só 1 card "Frente" (não tentar "Verso")
- **RG**: 2 cards "Frente" + "Verso"
- Usar `page.waitForEvent('filechooser')` ao clicar no card
- **Não usar docVersoPath se tipo = CNH** (evita erro)
- Seletor do card: `page.getByText('Frente')` e `page.getByText('Verso')`

### 6. Perguntas e conta de energia
- Perguntas só aparecem após upload ter sucesso
- Adicionar `await delay(3000)` pós-upload + scroll
- Conta de energia: mesma lógica de fileChooser

### 7. Tratar "nao_aplicavel" — já implementado, verificar que funciona

### 8. "Cadastro existente" — botão "Continuar com um novo cadastro"
- Já existe lógica, manter. Verificar que clica corretamente

### 9. Botão Finalizar
- Aparece após todos campos + uploads preenchidos
- Seletores: `button:has-text("Finalizar")`, `button[type="submit"]`

## Dados de teste (dos documentos enviados)

```
Nome: HUMBERTO VIEIRA E SILVA (auto-fill pela Receita)
CPF: 332.773.541-72
Data Nasc: 22/07/1964 (auto-fill)
CEP: 13309-410
Endereço: auto-fill pelo CEP
Número: 182
Código instalação: 2095855190
Documento: CNH (1 página frente)
Valor conta: R$ 205,04
Email: TVMENSAL011@GMAIL.COM
Telefone: 11998731258 (→ formato portal: 1199873-1258)
```

## Arquivos Modificados

1. **`worker-portal/playwright-automation.mjs`** — Reescrever seções 6-14 com seletores corretos baseados na inspeção ao vivo
2. **`worker-portal/server.mjs`** — Verificar e corrigir JSDoc (SyntaxError na linha 462)

## Resultado Esperado

Fluxo completo sem erros:
CEP+Valor → Calcular → Garantir → CPF (auto-fill nome/nasc) → WhatsApp+Confirmar → Email+Confirmar → Número endereço → Nº instalação → Tipo doc (CNH) → Upload Frente (fileChooser) → Perguntas (Não) → Upload Conta → Finalizar → OTP → Assinatura facial

