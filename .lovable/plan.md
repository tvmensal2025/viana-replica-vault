

# Plano: Corrigir Worker Portal Playwright - 8 Falhas Críticas

## Diagnóstico

Inspecionei o portal `digital.igreenenergy.com.br` ao vivo e identifiquei que **o portal foi redesenhado**. A automação atual falha em 8 pontos:

```text
FALHA                              CAUSA RAIZ
─────────────────────────────────────────────────────────────────
1. "nao_aplicavel" URL crash       Não trata valor especial
2. Campo "Número" não encontrado   Timing: campos de endereço aparecem após CEP auto-fill, automação não espera
3. Campo "instalação" não encontrado   Mesmo problema de timing
4. Tipo documento não selecionado  Seletor MUI incompleto - dropdown "Tipo documento" usa MUI Select
5. 0 inputs file encontrados      PORTAL REDESENHADO: uploads usam cards clicáveis "Frente"/"Verso", NÃO inputs file
6. Perguntas 0 respostas          Perguntas só aparecem DEPOIS do upload de docs
7. Conta de energia NÃO enviada   Mesmo que #5 - sem input file
8. Botão submit não encontrado    Formulário incompleto, botão não aparece
```

## Mudanças no `worker-portal/playwright-automation.mjs`

### 1. Tratar "nao_aplicavel" no download de documentos (linhas ~292-341)
- Na função `prepararDocumento()`: verificar se URL é "nao_aplicavel" ANTES de tentar fazer fetch
- Se for "nao_aplicavel", retornar `null` em vez de placeholder
- Ajustar `salvarDocumentosCliente()` para mesma verificação

### 2. Corrigir timing do campo "Número" endereço (linhas ~847-870)
- Adicionar `await delay(3000)` antes de buscar campos de endereço (esperar auto-fill do CEP)
- Usar `byPH('Número')` como primeira tentativa em vez do loop manual
- Adicionar `waitFor({ state: 'visible', timeout: 10000 })` para o campo

### 3. Corrigir timing do campo "Número da instalação" (linhas ~885-904)
- Verificar que o placeholder exato é "Número da instalação" (com acento em "ç" e "ã")
- Adicionar `byPH('Número da instalação')` como tentativa exata antes do parcial
- Aumentar timeout de espera

### 4. Corrigir dropdown "Tipo documento" (linhas ~918-979)
- O dropdown MUI renderiza como `<div>` com `role="combobox"` ou similar
- Ao clicar, abre um `<ul>` com `<li>` de opções no portal
- Adicionar seletor: `div:has-text("Tipo documento")` com dropdown arrow
- Clicar no trigger, esperar menu abrir, selecionar "CNH" ou "RG (Novo)" etc.
- Fallback: usar `page.selectOption()` caso seja um `<select>` nativo escondido

### 5. REESCREVER uploads de documentos (linhas ~982-1036) - MUDANÇA MAIOR
O portal agora usa **cards clicáveis** "Frente" e "Verso" em vez de `input[type="file"]`:
- Clicar no card "Frente" → isso dispara um file dialog via JavaScript
- Usar `page.waitForEvent('filechooser')` para capturar o dialog
- Chamar `fileChooser.setFiles(docFrentePath)` para enviar o arquivo
- Repetir para card "Verso" (se documento_back_url não for "nao_aplicavel")
- Implementação:
```javascript
// Clicar em "Frente" e interceptar o file chooser
const [frenteChooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.locator('text=Frente').first().click()
]);
await frenteChooser.setFiles(docFrentePath);

// Clicar em "Verso" (se aplicável)
if (docVersoPath && docVersoPath !== null) {
  const [versoChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('text=Verso').first().click()
  ]);
  await versoChooser.setFiles(docVersoPath);
}
```

### 6. Corrigir perguntas (Procurador, PDF, Débitos) (linhas ~1038-1091)
- As perguntas só aparecem DEPOIS do upload de docs ter sucesso
- Adicionar `await delay(3000)` após uploads
- Scroll para revelar perguntas
- Adicionar seletores adicionais: `button:has-text("Não")`, `div[role="radio"]:has-text("Não")`

### 7. Upload conta de energia (linhas ~1093-1131)
- Mesmo mecanismo de cards clicáveis
- Usar `page.waitForEvent('filechooser')` ao clicar no card de upload da conta
- O card pode ter texto "Conta de energia" ou similar

### 8. Botão submit (linhas ~1177-1212)
- O botão só aparece quando todos os campos obrigatórios estão preenchidos
- Se uploads forem corrigidos, o botão deve aparecer
- Manter seletores atuais como fallback

### 9. Corrigir SyntaxError no startup
- O erro `SyntaxError: Unexpected token '*'` na linha 462 é um JSDoc comment
- Pode ocorrer em versões específicas de Node.js com ESM
- Converter JSDoc multiline `/** ... */` para comentários simples `// ...`

## Arquivos Modificados

1. **`worker-portal/playwright-automation.mjs`** — Todos os 8 fixes acima
2. **`worker-portal/server.mjs`** — Converter JSDoc para comentários simples (fix SyntaxError)

## Resultado Esperado

Após os fixes:
- Documentos enviados via cards "Frente"/"Verso" com fileChooser
- Todos os campos preenchidos (Número, instalação, tipo documento)
- Perguntas respondidas automaticamente
- Conta de energia enviada
- Botão "Finalizar" clicado
- Lead processado 100% sem intervenção manual

