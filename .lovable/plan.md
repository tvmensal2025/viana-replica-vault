

## Padronizar mensagem pré-salva do QR Code

### O que muda

Trocar a mensagem pré-salva nos dois pontos onde ela é gerada para:

```
Oi! 👋 Vi sobre a iGreen Energy e quero saber como economizar na minha conta de luz.
```

Tom mais leve, alinhado com a nova mensagem de boas-vindas do bot — sem mencionar "cadastro" ou "documentos" logo de cara.

### Onde altero

| # | Arquivo | O que muda |
|---|---------|-----------|
| 1 | `src/pages/CadastroPage.tsx` | Mensagem usada no link `wa.me` quando o cliente clica no botão da landing page após escanear o QR |
| 2 | `supabase/functions/qr-redirect/index.ts` (constante `DEFAULT_MESSAGE`, linha 6) | Mensagem usada quando o QR impresso (panfleto) redireciona direto pro WhatsApp do consultor |

Texto antigo:
> "Olá! Gostaria de fazer meu cadastro na iGreen Energy e enviar meus documentos."

Texto novo:
> "Oi! 👋 Vi sobre a iGreen Energy e quero saber como economizar na minha conta de luz."

### O que NÃO muda

- IDs de tracking, parâmetros `?l=licenca`, fluxo de redirect — intactos.
- Bot continua respondendo normalmente quando o cliente envia essa mensagem (o trigger é qualquer mensagem de novo lead, não depende do texto).
- Fallback iGreen oficial (`5511989000650`) — mantido.

### Após o deploy

- Item 1 entra em produção no próximo build do frontend (automático).
- Item 2 entra assim que a edge function `qr-redirect` for redeployada (automático ao salvar).

