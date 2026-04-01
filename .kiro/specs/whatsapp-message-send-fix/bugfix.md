# Bugfix Requirements Document

## Introduction

O arquivo `src/services/evolutionApi.ts` faz chamadas HTTP diretas à Evolution API na VPS (`VITE_EVOLUTION_API_URL`) usando a apikey exposta no frontend (`VITE_EVOLUTION_API_KEY`), em vez de rotear todas as requisições pelo proxy Supabase Edge Function (`supabase/functions/evolution-proxy/index.ts`). Isso causa falhas de CORS, expõe credenciais sensíveis no cliente, e impede o tratamento de timeout/retry/autenticação que o proxy já implementa. Todas as funções de envio de mensagens (texto, áudio, imagem, documento), gerenciamento de instâncias e consulta de chats são afetadas.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN qualquer função do `evolutionApi.ts` é chamada (ex: `sendTextMessage`, `sendMedia`, `sendAudio`, `createInstance`, `findChats`, etc.) THEN o sistema faz `fetch()` diretamente para `VITE_EVOLUTION_API_URL` (a VPS da Evolution API), expondo a apikey `VITE_EVOLUTION_API_KEY` no frontend e ignorando o proxy Supabase

1.2 WHEN a função `request()` interna é chamada THEN o sistema envia o header `apikey` com o valor de `VITE_EVOLUTION_API_KEY` diretamente ao servidor Evolution, sem autenticação Supabase (sem `Authorization: Bearer` token, sem `apikey` do Supabase)

1.3 WHEN a função `request()` faz a chamada direta e o servidor Evolution retorna erro THEN o sistema não se beneficia do tratamento graceful de timeout, retry e respostas fallback que o proxy Supabase já implementa

1.4 WHEN o `KanbanBoard.tsx` envia mensagens automáticas ao mover deals entre estágios THEN o sistema chama `sendTextMessage`, `sendMedia` e `sendAudio` diretamente do `evolutionApi.ts`, que faz chamadas diretas à VPS sem passar pelo proxy

1.5 WHEN o `MessagePanel.tsx` envia mensagem individual para um cliente THEN o sistema chama `sendTextMessage` diretamente do `evolutionApi.ts`, que faz chamada direta à VPS sem passar pelo proxy

### Expected Behavior (Correct)

2.1 WHEN qualquer função do `evolutionApi.ts` é chamada THEN o sistema SHALL rotear a requisição através do proxy Supabase (`{SUPABASE_URL}/functions/v1/evolution-proxy`), enviando o path, method e body da Evolution API como payload JSON ao proxy

2.2 WHEN a função `request()` interna é chamada THEN o sistema SHALL enviar os headers `Authorization: Bearer {supabase_access_token}` e `apikey: {supabase_anon_key}` para autenticação com o Supabase, e o body SHALL seguir o formato `{ path: string, method: string, body?: object }`

2.3 WHEN a chamada ao proxy retorna status 401 THEN o sistema SHALL lançar um erro de autenticação com mensagem "Erro de autenticação com a API do WhatsApp"

2.4 WHEN a chamada ao proxy falha com `TypeError` (erro de rede/fetch) THEN o sistema SHALL lançar um erro com mensagem "Erro de conexão. Verifique sua internet."

2.5 WHEN a chamada ao proxy retorna outro erro HTTP (ex: 500) THEN o sistema SHALL lançar um erro com o statusText da resposta

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `createInstance` é chamada com um `instanceName` THEN o sistema SHALL CONTINUE TO enviar o body `{ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }` para o path `instance/create` com method `POST`

3.2 WHEN `connectInstance` é chamada THEN o sistema SHALL CONTINUE TO retornar `{ base64, pairingCode }` normalizados a partir da resposta da API

3.3 WHEN `sendTextMessage` é chamada com `instanceName`, `phone` e `text` THEN o sistema SHALL CONTINUE TO enviar `{ number: phone, text }` para o path `message/sendText/{instanceName}` com method `POST`

3.4 WHEN `sendMedia` é chamada THEN o sistema SHALL CONTINUE TO enviar `{ number, mediatype, media, caption }` para o path `message/sendMedia/{instanceName}` com method `POST`

3.5 WHEN `sendAudio` é chamada THEN o sistema SHALL CONTINUE TO enviar `{ number, audio }` para o path `message/sendWhatsAppAudio/{instanceName}` com method `POST`

3.6 WHEN `findChats`, `findMessages`, `findContacts` são chamadas THEN o sistema SHALL CONTINUE TO retornar os mesmos tipos de dados (arrays de chats, mensagens, contatos) com as mesmas interfaces TypeScript

3.7 WHEN `normalizeQrBase64` processa o campo base64 do QR code THEN o sistema SHALL CONTINUE TO retornar `null` para strings vazias e a string original para valores válidos

3.8 WHEN o `messageSender.ts` chama funções do `evolutionApi.ts` THEN o sistema SHALL CONTINUE TO funcionar sem alterações no `messageSender.ts`, pois a interface pública das funções exportadas não muda

3.9 WHEN o `KanbanBoard.tsx` e `MessagePanel.tsx` chamam funções do `evolutionApi.ts` THEN o sistema SHALL CONTINUE TO funcionar sem alterações nesses componentes, pois as assinaturas das funções exportadas permanecem idênticas
