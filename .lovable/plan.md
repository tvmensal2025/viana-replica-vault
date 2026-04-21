

# Plano: trocar vídeo do bot para `Green_Energy.mp4`

## Mudança

Atualizar `supabase/functions/evolution-webhook/handlers/bot-flow.ts` para usar o vídeo correto que existe no bucket:

```ts
// ANTES (arquivo inexistente → erro 500)
const videoUrl = "https://...supabase.co/storage/v1/object/public/video%20igreen/WhatsApp%20Video%202025-05-29%20at%2021.37.39.mp4";

// DEPOIS
const videoUrl = "https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/video%20igreen/Green_Energy.mp4";
```

## Camada extra de proteção

Adicionar um HEAD check rápido (timeout 3s) antes de chamar `sendMedia`. Se o arquivo não responder 200, o bot pula o envio do vídeo e vai direto pra mensagem com botões — sem mostrar a falsa mensagem `"⚠️ Tive um problema momentâneo ao enviar o vídeo"`.

```ts
async function urlExists(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return r.ok;
  } catch { return false; }
}

if (await urlExists(videoUrl)) {
  await sendMedia(ctx, { url: videoUrl, mediatype: "video", caption: "..." });
} else {
  console.warn("[bot-flow] vídeo indisponível, pulando para mensagem com botões");
}
```

## Como o WhatsApp vai exibir

Quando o `sendMedia` da Evolution recebe URL válida + `mediatype: "video"`, o WhatsApp renderiza **automaticamente como player nativo** (thumbnail + botão play), não como link. Isso já está correto no código — o problema era só o arquivo não existir.

## Validação após deploy

1. Cliente manda mensagem no bot
2. Clica no botão "1" (Como funciona o desconto)
3. Vídeo `Green_Energy.mp4` chega com player nativo do WhatsApp
4. Em seguida chegam os botões de próxima ação
5. Não aparece nenhuma mensagem de erro

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/evolution-webhook/handlers/bot-flow.ts` | Trocar `videoUrl` + adicionar `urlExists()` antes de `sendMedia` |

## Risco

Mínimo. URL já validada como pública e acessível. O HEAD check garante que mesmo se o arquivo for removido no futuro, o cliente não recebe mensagem de erro confusa.

