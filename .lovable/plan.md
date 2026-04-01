

## Analise Completa do Sistema + Plano de Correções

### Estado Atual (baseado nos logs)

**O que FUNCIONA:**
- Autenticação Supabase: OK (200 em todas as requests)
- Evolution Proxy: OK (auth, routing, graceful responses)
- findChats: OK (retorna conversas)
- findMessages: OK
- connectionState: OK (retorna "open")
- Polling otimizado: Implementado (15s mensagens, 30s chats)
- Deduplicação de mensagens: Implementada
- Mídia sob demanda: Implementada

**Problemas encontrados:**

1. **Timeout no envio de mídia (MinIO instável)** — Os logs do proxy mostram `Timeout after 15000ms for POST .../message/sendMedia/...` quando o KanbanBoard tenta enviar auto-messages com áudio/imagem hospedados no MinIO (`igreen-minio.b099mi.easypanel.host`). O MinIO está intermitente (100% dos `/ws/objectManager` retornam 502 ou status 0 nos logs anteriores).

2. **Connection state flickering** — Em 35 segundos a conexão foi de `"open"` para `"connecting"` e de volta. O polling de 3s no estado "connecting" gera QR codes desnecessários. Quando o estado oscila, o frontend perde a lista de chats e mostra tela vazia.

3. **Profile pictures sempre null** — Todas as 3 requisições `fetchProfilePictureUrl` retornaram `profilePictureUrl: null`. O sistema gasta 3 requests por ciclo para nada. Deveria parar após confirmar que nenhum contato tem foto.

4. **fetchCustomers sem `userId` nas deps** — `WhatsAppTab.tsx` linha 198: `useCallback(async () => {...}, [])` — falta `userId` como dependência, então se o userId mudar, os customers não atualizam.

5. **useWhatsApp upsert a cada poll** — Toda vez que connectionState retorna "open", `saveInstance` faz um upsert na tabela `whatsapp_instances`. Com polling de 30s, são ~2880 upserts/dia desnecessários.

6. **KanbanBoard importa diretamente** `sendTextMessage`, `sendMedia`, `sendAudio` do `evolutionApi.ts` em vez de usar o `messageSender.ts` unificado. Isso ignora o tratamento de timeout e a resolução de recipient.

### Plano de Implementação

**1. Corrigir connection state flickering**
- Em `useWhatsApp.ts`: quando estado é "open" e próximo check retorna "connecting" ou "unknown", manter "connected" por pelo menos 2 ciclos antes de mudar. Adicionar um "grace counter".
- Não gerar QR quando vindo de "connected" e obtendo "connecting" temporário.
- Reduzir polling connected de 30s para 60s.

**2. Parar upsert repetitivo**
- `useWhatsApp.ts`: salvar instância no DB apenas uma vez (no init ou createAndConnect), não a cada poll "open".

**3. Corrigir profile picture waste**
- `useChats.ts`: quando todos os contatos de um ciclo retornam null, pausar fetch de fotos por 5 minutos (não apenas 1h por contato individual).

**4. Corrigir fetchCustomers deps**
- `WhatsAppTab.tsx`: adicionar `userId` ao array de dependências do `useCallback`.

**5. KanbanBoard usar messageSender**
- Substituir chamadas diretas a `sendTextMessage`/`sendMedia`/`sendAudio` por `sendWhatsAppMessage` do `messageSender.ts`, que já tem tratamento de timeout.

**6. Tratar graceful timeout responses no frontend**
- Em `evolutionApi.ts` `request()`: verificar se a resposta tem `{ timeout: true }` ou `{ error: "..." }` dentro de um status 200, e tratar como erro ao invés de sucesso silencioso.

### Detalhes Técnicos

```text
Arquivo: src/hooks/useWhatsApp.ts
- Adicionar graceCountRef para ignorar 1-2 checks "connecting" quando vindo de "open"
- saveInstance apenas no init/createAndConnect, não no poll loop
- Poll connected: 30s -> 60s

Arquivo: src/hooks/useChats.ts  
- Adicionar "global pause" para fotos quando nenhum contato retornou foto

Arquivo: src/components/whatsapp/WhatsAppTab.tsx
- fetchCustomers deps: [] -> [userId]

Arquivo: src/components/whatsapp/KanbanBoard.tsx
- Import sendWhatsAppMessage de messageSender.ts
- Refatorar sendAutoMessage para usar o serviço unificado

Arquivo: src/services/evolutionApi.ts
- Na função request(): detectar respostas graceful com timeout/error e lançar erro
```

### Resultado Esperado
- Conexão estável sem flickering entre "open" e "connecting"
- Zero upserts repetitivos no DB
- Zero requests de foto desnecessários
- Auto-messages do CRM com tratamento de timeout adequado
- Frontend detecta timeouts graceful do proxy corretamente

