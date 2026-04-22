

## Suavizar mensagem inicial do bot + corrigir "iGreen/CPFL"

### O que muda

**1. Mensagem de boas-vindas (`supabase/functions/evolution-webhook/handlers/bot-flow.ts`, case `welcome`, linhas 94-108)**

Tom mais leve, conversacional, focado em economia (8 a 20%) — sem mencionar documentos/cadastro/instalação logo de cara. O pedido de documento continua aparecendo só depois que o cliente clica em "Cadastrar" (já é assim hoje, no `menu_inicial`).

Texto novo:
```
Oi! 👋 Aqui é a assistente digital da {nomeRepresentante}.

Já pensou em pagar menos na sua conta de luz todo mês? 💚
Com a iGreen Energy dá pra economizar de 8% a 20%, de forma simples e sem complicação. ☀️

Posso te explicar rapidinho como funciona?
```

Botões mantidos (mesmos IDs, sem quebrar a máquina de estados):
- 💡 Quero saber mais
- 📋 Já quero participar
- 🧑 Falar com humano

**2. Mensagem de retry no `menu_inicial` (linha 138)**

Suavizar de "🤔 Não entendi sua resposta..." para:
```
Sem problemas 😊 Me conta: como prefere seguir?
```

**3. Worker — corrigir "iGreen/CPFL" (`worker-portal/playwright-automation.mjs`, linha 525)**

Trocar:
```js
"...código numérico no WhatsApp enviado pela iGreen/CPFL..."
```
Por:
```js
"...código numérico no WhatsApp enviado pela iGreen Energy..."
```

### O que NÃO muda

- IDs dos botões (`entender_desconto`, `cadastrar_agora`, `falar_humano`) — manter intactos pra não quebrar `menu_inicial`/`pos_video`.
- Fluxo após clicar em "Cadastrar" — continua pedindo a foto da conta de energia.
- Vídeo explicativo no fluxo "Como funciona?" — mantido.
- Mensagem de "falar com humano" e "pos_video" — não foram apontadas como problema.

### Detalhes técnicos

| # | Arquivo | Linhas | Mudança |
|---|---------|--------|---------|
| 1 | `supabase/functions/evolution-webhook/handlers/bot-flow.ts` | 95-99 | Texto novo do `welcomeMsg` (mais leve, faixa 8-20%, sem "sem precisar instalar nada", sem pedir documento) |
| 2 | mesma | 101 | Título do botão: `"💡 Como funciona?"` → `"💡 Quero saber mais"` (id mantido) |
| 3 | mesma | 102 | Título do botão: `"📋 Cadastrar"` → `"📋 Já quero participar"` (id mantido) |
| 4 | mesma | 138-143 | Retry mais amigável + mesmos botões/ids atualizados |
| 5 | `worker-portal/playwright-automation.mjs` | 525 | `iGreen/CPFL` → `iGreen Energy` |

### Após o deploy

Itens 1-4 entram em produção assim que a edge function `evolution-webhook` for redeployada (automático após o salvar). Item 5 entra no próximo deploy do worker no EasyPanel.

