
Diagnóstico fechado:

- Não encontrei um erro único de sintaxe quebrando o `evolution-proxy`. Os logs mostram vários `booted` bem-sucedidos e `instance/connectionState/... -> open`, então a conexão principal com o Evolution está funcionando.
- O erro recorrente vem principalmente de carga excessiva em chamadas opcionais de avatar:
  1. `src/hooks/useChats.ts` faz polling a cada 15s e, após cada `findChats`, dispara até 20 `chat/fetchProfilePictureUrl` em paralelo.
  2. Esse hook perde os avatares já buscados a cada novo `setChats(mapped)`, então refaz as mesmas buscas indefinidamente.
  3. `src/components/whatsapp/CustomerManager.tsx` tenta buscar até 50 fotos só porque `instanceName` existe, mesmo quando o WhatsApp não está realmente conectado.
- Quando uma dessas chamadas lentas estoura, o `evolution-proxy` devolve `504` para `chat/fetchProfilePictureUrl`, e o Lovable exibe isso como runtime error.
- O `503 BOOT_ERROR` parece intermitente, compatível com cold start/worker churn sob carga, agravado pelo import remoto `esm.sh` no edge function.

Plano de correção:

1. Reduzir a tempestade de requests no frontend
- `src/components/whatsapp/WhatsAppTab.tsx`
- Só ativar `useChats` quando a sub-aba ativa for `conversas` e a conexão estiver `connected`
- Passar `instanceName` para `CustomerManager` apenas quando estiver conectado, ou passar `isConnected` explicitamente

2. Corrigir cache de fotos nas conversas
- `src/hooks/useChats.ts`
- Criar cache por JID (`profilePicCacheRef`)
- Reaplicar esse cache ao reconstruir `mapped`
- Não refazer busca para JIDs já resolvidos ou que falharam recentemente
- Trocar `Promise.all` de 20 itens por fila com baixa concorrência (2-3 por vez)

3. Remover prefetch agressivo na lista de clientes
- `src/components/whatsapp/CustomerManager.tsx`
- Parar de pré-carregar 50 fotos automaticamente
- Carregar foto só sob demanda (item expandido / visível) com cache local
- Se desconectado, não chamar Evolution para avatar

4. Tornar timeout de avatar não fatal no proxy
- `supabase/functions/evolution-proxy/index.ts`
- Adicionar `chat/fetchProfilePictureUrl/*` em `createGracefulTimeoutResponse`
- Retornar `200` com algo como `{ profilePictureUrl: null, timeout: true }` em vez de `504`
- Manter `504` apenas para rotas críticas

5. Endurecer o boot do edge function
- `supabase/functions/evolution-proxy/index.ts`
- Trocar `https://esm.sh/@supabase/supabase-js...` por `npm:@supabase/supabase-js...`
- Isso reduz fragilidade de boot e dependência externa no startup

6. Validação após implementação
- Confirmar que abrir `/admin` e navegar por WhatsApp/Clientes não gera mais cards de runtime error
- Confirmar queda forte nas chamadas `chat/fetchProfilePictureUrl`
- Confirmar que `instance/connectionState` continua retornando `open`
- Confirmar que conectar, reconectar e desconectar continuam seguros sem deletar instância

Arquivos principais:
- `src/components/whatsapp/WhatsAppTab.tsx`
- `src/hooks/useChats.ts`
- `src/components/whatsapp/CustomerManager.tsx`
- `supabase/functions/evolution-proxy/index.ts`

Detalhes técnicos:
- Não há sinal de problema de segredo/configuração: `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` estão configurados.
- Não vejo necessidade de mudança em banco/RLS.
- A evidência mais forte é que os erros se concentram em `chat/fetchProfilePictureUrl/...`, enquanto o estado da instância segue `open`.
