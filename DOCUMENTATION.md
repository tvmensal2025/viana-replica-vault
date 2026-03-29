# 📖 Documentação Completa do Projeto iGreen Energy

> Documentação exaustiva de **todas** as funções, hooks, serviços, edge functions, componentes, páginas, tipos e tabelas do banco de dados.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Utilitários](#2-utilitários)
3. [Serviço Evolution API](#3-serviço-evolution-api)
4. [Serviço MinIO Upload](#4-serviço-minio-upload)
5. [Hooks](#5-hooks)
6. [Edge Functions](#6-edge-functions-supabase)
7. [Componentes WhatsApp](#7-componentes-whatsapp)
8. [Componentes Gerais](#8-componentes-gerais)
9. [Páginas](#9-páginas)
10. [Tipos TypeScript](#10-tipos-typescript)
11. [Interfaces da Evolution API](#11-interfaces-da-evolution-api)
12. [Banco de Dados](#12-banco-de-dados)
13. [Variáveis de Ambiente](#13-variáveis-de-ambiente)
14. [Integração Supabase Client](#14-integração-supabase-client)

---

## 1. Visão Geral

### Arquitetura

```
React 18 + Vite + TypeScript + Tailwind CSS
       │
       ├── Supabase (Auth, Database, Storage, Edge Functions)
       ├── Evolution API (WhatsApp Web via Baileys)
       └── MinIO (S3-compatible storage para mídias)
```

### Stack

| Camada       | Tecnologia                          |
| ------------ | ----------------------------------- |
| Frontend     | React 18, Vite, TypeScript          |
| Estilização  | Tailwind CSS, shadcn/ui             |
| Estado       | React Query, useState/useEffect     |
| Roteamento   | React Router DOM v6                 |
| Backend      | Supabase (PostgreSQL + Auth + Edge) |
| WhatsApp     | Evolution API (Baileys)             |
| Storage      | MinIO (S3-compatible)               |
| Gráficos     | Recharts                            |

### Rotas da Aplicação

| Rota                       | Página            | Descrição                          |
| -------------------------- | ----------------- | ---------------------------------- |
| `/`                        | Index             | Redireciona para `/auth`           |
| `/auth`                    | Auth              | Login / Cadastro                   |
| `/admin`                   | Admin             | Painel do consultor                |
| `/:licenca`                | ConsultantPage    | Landing page do cliente            |
| `/licenciada/:licenca`     | LicenciadaPage    | Landing page do licenciado         |
| `/licenciada/preview`      | LicenciadaPreview | Preview sem dados reais            |
| `*`                        | NotFound          | Página 404                         |

---

## 2. Utilitários

### `src/lib/utils.ts`

#### `cn(...inputs: ClassValue[]): string`

Combina classes CSS usando `clsx` + `tailwind-merge` para resolver conflitos de classes Tailwind.

- **Parâmetros:** `...inputs` — Qualquer valor válido para `clsx` (strings, objetos, arrays)
- **Retorno:** `string` — Classes CSS mescladas sem conflitos
- **Exemplo:**
  ```ts
  cn("px-4 py-2", isActive && "bg-primary", "px-6")
  // → "py-2 px-6 bg-primary" (px-6 substitui px-4)
  ```

---

## 3. Serviço Evolution API

**Arquivo:** `src/services/evolutionApi.ts`

Serviço completo de integração com a [Evolution API](https://doc.evolution-api.com/) para gerenciamento do WhatsApp Web.

---

### 3.1 Funções Internas de Configuração

#### `getBaseUrl(): string`

Retorna a URL base da Evolution API a partir de `VITE_EVOLUTION_API_URL`.

- **Retorno:** `string` — URL base (ex: `https://igreen-evolution-api.0sw627.easypanel.host`)

#### `getApiKey(): string`

Retorna a API key da Evolution API a partir de `VITE_EVOLUTION_API_KEY`.

- **Retorno:** `string` — Chave de API

#### `getHeaders(): Record<string, string>`

Gera os headers padrão para todas as requisições.

- **Retorno:** Objeto com `Content-Type: application/json` e `apikey`

---

### 3.2 Funções Internas de Requisição

#### `handleResponse<T>(response: Response): Promise<T>`

Trata a resposta HTTP da API.

- **Parâmetros:** `response` — Objeto `Response` do fetch
- **Retorno:** `Promise<T>` — Dados parseados do JSON
- **Erros:**
  - Status 401 → `"Erro de autenticação com a API do WhatsApp"`
  - Outros erros → `response.statusText` ou `"Erro desconhecido na API"`

#### `request<T>(url: string, options?: RequestInit): Promise<T>`

Wrapper genérico para todas as chamadas fetch à Evolution API.

- **Parâmetros:**
  - `url` — URL completa do endpoint
  - `options` — Opções do fetch (method, body, headers extras)
- **Retorno:** `Promise<T>` — Dados tipados da resposta
- **Erros:**
  - `TypeError` → `"Erro de conexão. Verifique sua internet."`
  - Outros → Re-lança o erro original

---

### 3.3 Gerenciamento de Instância

#### `createInstance(instanceName: string)`

Cria uma nova instância WhatsApp na Evolution API.

- **Parâmetros:** `instanceName` — Nome único da instância (ex: `igreen-uuid`)
- **Retorno:** `Promise<{ instance: { instanceName: string; status: string }; qrcode: { base64: string } }>`
- **Método HTTP:** `POST /instance/create`
- **Body:** `{ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }`

#### `connectInstance(instanceName: string)`

Gera um novo QR Code para uma instância existente.

- **Parâmetros:** `instanceName` — Nome da instância
- **Retorno:** `Promise<{ base64: string }>` — QR Code em base64
- **Método HTTP:** `GET /instance/connect/{instanceName}`

#### `getConnectionState(instanceName: string)`

Consulta o estado atual da conexão de uma instância.

- **Parâmetros:** `instanceName` — Nome da instância
- **Retorno:** `Promise<{ state: "open" | "close" | "connecting" }>`
- **Método HTTP:** `GET /instance/connectionState/{instanceName}`
- **Observação:** Normaliza diferentes formatos de resposta (`response.instance.state` ou `response.state`)

#### `deleteInstance(instanceName: string)`

Remove uma instância WhatsApp da Evolution API.

- **Parâmetros:** `instanceName` — Nome da instância
- **Retorno:** `Promise<void>`
- **Método HTTP:** `DELETE /instance/delete/{instanceName}`

---

### 3.4 Chat / Conversas

#### `findChats(instanceName: string): Promise<EvolutionChat[]>`

Lista todas as conversas (chats) de uma instância.

- **Parâmetros:** `instanceName` — Nome da instância
- **Retorno:** `Promise<EvolutionChat[]>` — Array de conversas
- **Método HTTP:** `POST /chat/findChats/{instanceName}`
- **Body:** `{}`

#### `findMessages(instanceName: string, remoteJid: string, limit?: number): Promise<EvolutionMessage[]>`

Busca mensagens de um chat específico.

- **Parâmetros:**
  - `instanceName` — Nome da instância
  - `remoteJid` — JID do contato (ex: `5511999999999@s.whatsapp.net`)
  - `limit` — Número máximo de mensagens (padrão: 50)
- **Retorno:** `Promise<EvolutionMessage[]>` — Array de mensagens ordenadas
- **Método HTTP:** `POST /chat/findMessages/{instanceName}`
- **Body:** `{ where: { key: { remoteJid } }, limit }`
- **Observação:** Trata dois formatos de resposta: array direto ou `{ messages: { records: [] } }`

#### `findContacts(instanceName: string): Promise<EvolutionContact[]>`

Lista todos os contatos salvos na instância.

- **Parâmetros:** `instanceName` — Nome da instância
- **Retorno:** `Promise<EvolutionContact[]>` — Array de contatos
- **Método HTTP:** `POST /chat/findContacts/{instanceName}`
- **Body:** `{}`

#### `getBase64FromMediaMessage(instanceName: string, messageId: string, remoteJid: string, fromMe: boolean)`

Baixa o conteúdo de mídia de uma mensagem em formato base64.

- **Parâmetros:**
  - `instanceName` — Nome da instância
  - `messageId` — ID da mensagem
  - `remoteJid` — JID do chat
  - `fromMe` — Se a mensagem foi enviada pelo usuário
- **Retorno:** `Promise<{ base64?: string; mimetype?: string } | null>`
- **Método HTTP:** `POST /chat/getBase64FromMediaMessage/{instanceName}`
- **Observação:** Retorna `null` em caso de erro (não lança exceção)

---

### 3.5 Envio de Mensagens

#### `sendTextMessage(instanceName: string, phone: string, text: string)`

Envia uma mensagem de texto.

- **Parâmetros:**
  - `instanceName` — Nome da instância
  - `phone` — Número do destinatário (ex: `5511999999999`)
  - `text` — Conteúdo da mensagem
- **Retorno:** `Promise<{ key: { id: string } }>` — ID da mensagem enviada
- **Método HTTP:** `POST /message/sendText/{instanceName}`

#### `sendMedia(instanceName: string, phone: string, mediaUrl: string, caption: string, mediatype: "image" | "video" | "document")`

Envia uma mídia (imagem, vídeo ou documento) com legenda.

- **Parâmetros:**
  - `instanceName` — Nome da instância
  - `phone` — Número do destinatário
  - `mediaUrl` — URL pública do arquivo de mídia
  - `caption` — Legenda/texto da mensagem
  - `mediatype` — Tipo de mídia: `"image"`, `"video"` ou `"document"`
- **Retorno:** `Promise<{ key: { id: string } }>`
- **Método HTTP:** `POST /message/sendMedia/{instanceName}`

#### `sendAudio(instanceName: string, phone: string, audioUrl: string)`

Envia um áudio como mensagem de voz (PTT).

- **Parâmetros:**
  - `instanceName` — Nome da instância
  - `phone` — Número do destinatário
  - `audioUrl` — URL pública do arquivo de áudio
- **Retorno:** `Promise<{ key: { id: string } }>`
- **Método HTTP:** `POST /message/sendWhatsAppAudio/{instanceName}`

#### `sendDocument(instanceName: string, phone: string, docUrl: string, fileName: string)`

Envia um documento com nome de arquivo.

- **Parâmetros:**
  - `instanceName` — Nome da instância
  - `phone` — Número do destinatário
  - `docUrl` — URL pública do documento
  - `fileName` — Nome exibido do arquivo
- **Retorno:** `Promise<{ key: { id: string } }>`
- **Método HTTP:** `POST /message/sendMedia/{instanceName}` (com `mediatype: "document"`)

---

### 3.6 Presença / Leitura

#### `markAsRead(instanceName: string, remoteJid: string)`

Marca todas as mensagens de um chat como lidas.

- **Parâmetros:**
  - `instanceName` — Nome da instância
  - `remoteJid` — JID do chat
- **Retorno:** `Promise<void>`
- **Método HTTP:** `PUT /chat/markMessageAsRead/{instanceName}`

#### `getProfilePicture(instanceName: string, remoteJid: string)`

Obtém a URL da foto de perfil de um contato.

- **Parâmetros:**
  - `instanceName` — Nome da instância
  - `remoteJid` — JID do contato
- **Retorno:** `Promise<string | null>` — URL da foto ou `null`
- **Método HTTP:** `POST /chat/fetchProfilePictureUrl/{instanceName}`
- **Observação:** Retorna `null` em caso de erro (não lança exceção)

---

## 4. Serviço MinIO Upload

**Arquivo:** `src/services/minioUpload.ts`

Serviço frontend para upload de arquivos de mídia via edge function do Supabase para o MinIO.

---

#### `uploadMedia(file: File, onProgress?: (pct: number) => void): Promise<UploadResult>`

Faz upload de um arquivo para o MinIO via edge function `upload-media`.

- **Parâmetros:**
  - `file` — Arquivo a ser enviado
  - `onProgress` — Callback opcional de progresso (0-100)
- **Retorno:**
  ```ts
  Promise<{
    url: string;   // URL pública do arquivo no MinIO
    key: string;   // Chave do objeto no bucket
    type: string;  // MIME type do arquivo
    size: number;  // Tamanho em bytes
  }>
  ```
- **Erros:** Lança `Error` com mensagem do servidor ou `"Upload failed"`
- **Observação:** Usa token de autenticação do Supabase ou a anon key como fallback

#### `getAcceptString(mediaType: string): string`

Retorna a string de tipos aceitos para um `<input type="file">`.

- **Parâmetros:** `mediaType` — `"image"`, `"audio"`, `"video"`, `"document"` ou outro
- **Retorno:** `string` — MIME types separados por vírgula
- **Mapeamento:**
  - `"image"` → `"image/jpeg,image/png,image/webp,image/gif"`
  - `"audio"` → `"audio/mpeg,audio/ogg,audio/mp4,audio/wav,audio/webm"`
  - `"video"` → `"video/mp4,video/webm"`
  - `"document"` → `"application/pdf,application/msword,..."`
  - outro → `"*/*"`

#### `formatFileSize(bytes: number): string`

Formata um tamanho em bytes para exibição legível.

- **Parâmetros:** `bytes` — Tamanho em bytes
- **Retorno:** `string` — Ex: `"1.5 MB"`, `"256 KB"`, `"100 B"`

---

## 5. Hooks

### 5.1 `useWhatsApp(consultantId: string): UseWhatsAppReturn`

**Arquivo:** `src/hooks/useWhatsApp.ts`

Hook principal de gerenciamento da conexão WhatsApp via Evolution API.

#### Interface de Retorno

```ts
interface UseWhatsAppReturn {
  connectionStatus: ConnectionStatus;  // "disconnected" | "connecting" | "connected"
  instanceName: string | null;
  qrCode: string | null;              // QR Code em base64
  phoneNumber: string | null;
  isLoading: boolean;
  error: string | null;
  createAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
}
```

#### Funções Internas

##### `clearPolling(): void`
Limpa o intervalo de polling ativo.

##### `pollConnectionState(name: string): Promise<void>`
Consulta o estado da conexão e atualiza o status. Polling a cada 5s quando `connecting`, 30s quando `connected`.

- Quando `state === "open"` → Atualiza para `"connected"`, limpa QR Code e erro
- Quando `state === "close"` e estava conectado → Toast de `"Conexão perdida"`, atualiza para `"disconnected"`

##### `startPolling(name: string): void`
Inicia o polling periódico. Intervalo varia conforme status: 5s (connecting) ou 30s (connected).

##### `createAndConnect(): Promise<void>`
1. Cria instância na Evolution API com nome `igreen-{consultantId}`
2. Salva no Supabase (`whatsapp_instances`)
3. Obtém QR Code da resposta ou tenta `connectInstance`
4. Define status como `"connecting"`

##### `disconnect(): Promise<void>`
1. Deleta instância na Evolution API
2. Remove registro do Supabase
3. Limpa polling e todos os estados

##### `reconnect(): Promise<void>`
Tenta reconectar uma instância existente gerando novo QR Code via `connectInstance`.

##### `checkExistingInstance(): Promise<void>` (useEffect on mount)
Verifica no Supabase se existe instância salva para o consultor. Se existir, consulta o estado na Evolution API. Se a instância não existir mais na API, limpa o registro local.

---

### 5.2 `useTemplates(consultantId: string)`

**Arquivo:** `src/hooks/useTemplates.ts`

Hook para gerenciamento de templates de mensagens (CRUD).

#### Retorno

```ts
{
  templates: MessageTemplate[];
  isLoading: boolean;
  createTemplate: (name, content, mediaType?, mediaUrl?) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  applyTemplate: typeof applyTemplate;  // Referência à função pura
}
```

#### Funções Internas

##### `fetchTemplates(): Promise<void>`
Busca todos os templates do consultor no Supabase (`message_templates`).

##### `createTemplate(name: string, content: string, mediaType?: string, mediaUrl?: string | null): Promise<void>`
Cria um novo template no Supabase e re-busca a lista.

##### `deleteTemplate(id: string): Promise<void>`
Remove um template pelo ID e re-busca a lista.

#### Função Exportada (Pura)

##### `applyTemplate(template: MessageTemplate, customer: { name: string; electricity_bill_value?: number }): string`

Substitui placeholders no conteúdo do template:

| Placeholder         | Substituição                          |
| ------------------- | ------------------------------------- |
| `{{nome}}`          | `customer.name`                       |
| `{{valor_conta}}`   | `customer.electricity_bill_value` ou `""` |

---

### 5.3 `useChats(instanceName: string | null)`

**Arquivo:** `src/hooks/useChats.ts`

Hook para listagem de conversas com polling automático a cada 15 segundos.

#### Retorno

```ts
{
  chats: ChatItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

#### Interface `ChatItem`

```ts
interface ChatItem {
  remoteJid: string;
  sendTargetJid?: string;    // JID resolvido para envio (trata @lid)
  name: string;
  lastMessage: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  profilePicUrl?: string;
  isGroup: boolean;
}
```

#### Funções Internas

##### `extractLastMessage(chat: EvolutionChat): string`
Extrai texto legível da última mensagem, tratando tipos: `conversation`, `extendedTextMessage`, `imageMessage` (📷), `documentMessage`, `audioMessage` (🎵).

##### `mapChat(chat: EvolutionChat, contactsMap: Map<string, EvolutionContact>): ChatItem`
Transforma `EvolutionChat` em `ChatItem`:
- Resolve nome: `chat.pushName` > `lastMessage.pushName` > `contact.pushName` > `chat.name` > `realPhone`
- Resolve `sendTargetJid` tratando JIDs `@lid`
- Determina se é grupo (`@g.us`)

##### `fetchContacts(): Promise<void>`
Busca contatos da instância e preenche o mapa de referência.

##### `fetchChats(): Promise<void>`
Busca chats, mapeia para `ChatItem`, filtra grupos, ordena por timestamp decrescente.

---

### 5.4 `useMessages(instanceName, remoteJid, preferredSendTargetJid?)`

**Arquivo:** `src/hooks/useMessages.ts`

Hook para gerenciamento de mensagens de um chat específico com polling a cada 5 segundos.

#### Retorno

```ts
{
  messages: ChatMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  loadMedia: (messageId: string) => Promise<string | null>;
  refetch: () => Promise<void>;
}
```

#### Interface `ChatMessage`

```ts
interface ChatMessage {
  id: string;
  remoteJid: string;
  remoteJidAlt?: string;
  fromMe: boolean;
  text: string;
  timestamp: number;
  status?: number;  // 0=ERROR, 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED
  mediaType?: "image" | "audio" | "video" | "document" | "sticker";
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  mediaCaption?: string;
  fileName?: string;
}
```

#### Funções Internas

##### `mapMessage(msg: EvolutionMessage): ChatMessage`
Transforma `EvolutionMessage` em `ChatMessage`, detectando tipo de mídia:
- `conversation` / `extendedTextMessage` → texto
- `imageMessage` → `mediaType: "image"`
- `videoMessage` → `mediaType: "video"`
- `audioMessage` → `mediaType: "audio"`
- `documentMessage` → `mediaType: "document"`
- `stickerMessage` → `mediaType: "sticker"`

##### `fetchMessages(): Promise<void>`
Busca até 100 mensagens, mapeia, ordena por timestamp crescente. Tenta resolver `remoteJidAlt` para envio. Marca como lido via `markAsRead`.

##### `resolveSendTargetJid(): Promise<string | null>`
Resolve o JID correto para envio:
1. Se `resolvedSendTargetJid` não termina em `@lid` → retorna direto
2. Procura `remoteJidAlt` nas mensagens carregadas
3. Fallback: busca últimas 20 mensagens para encontrar `remoteJidAlt`

##### `sendMessage(text: string): Promise<void>`
1. Resolve JID via `resolveSendTargetJid()`
2. Extrai número do JID `@s.whatsapp.net` ou usa o JID bruto
3. Envia via `sendTextMessage`
4. Adiciona mensagem temporária no estado local

##### `loadMedia(messageId: string): Promise<string | null>`
1. Encontra mensagem no estado
2. Chama `getBase64FromMediaMessage`
3. Cria data URL: `data:{mimetype};base64,{base64}`
4. Atualiza mensagem no estado com a mídia carregada

---

### 5.5 `useConsultant(license: string)`

**Arquivo:** `src/hooks/useConsultant.ts`

Hook que busca dados de um consultor pela slug de licença usando React Query.

- **Parâmetros:** `license` — Slug da licença (ex: `"joao-silva"`)
- **Retorno:** `UseQueryResult<Consultant | null>`
- **Query Key:** `["consultant", license]`
- **Habilitado:** Apenas quando `license` é truthy
- **Fonte:** Tabela `consultants` no Supabase

---

### 5.6 `useAnalytics(consultantId: string | null)`

**Arquivo:** `src/hooks/useAnalytics.ts`

Hook que busca e processa analytics dos últimos 30 dias via React Query.

#### Interfaces de Dados

```ts
interface DailyViews { date: string; client: number; licenciada: number; }
interface HourlyData { hour: number; views: number; }
interface DeviceData { device: string; count: number; }
interface UtmData    { source: string; count: number; }
```

#### Retorno (campo `data`)

```ts
{
  totalClient: number;
  totalLicenciada: number;
  total: number;
  totalClicks: number;
  clicksByTarget: Record<string, number>;
  daily: DailyViews[];
  hourly: HourlyData[];
  devices: DeviceData[];
  utmSources: UtmData[];
}
```

- **Query Key:** `["analytics", consultantId]`
- **Fonte:** Tabelas `page_views` e `page_events` (buscadas em paralelo)
- **Processamento:**
  - Conta views por `page_type` (client/licenciada)
  - Agrega cliques por `event_target`
  - Distribui views por dia (30 dias), hora (0-23), dispositivo e UTM source

---

### 5.7 `useTrackView(consultantId, pageType)`

**Arquivo:** `src/hooks/useTrackView.ts`

Hook que registra uma page view no Supabase ao montar.

- **Parâmetros:**
  - `consultantId` — ID do consultor (string | undefined)
  - `pageType` — `"client"` ou `"licenciada"`
- **Ação:** Insere registro em `page_views` com metadata de tracking (`device_type`, UTMs)
- **Observação:** Executa apenas uma vez por montagem (useEffect com deps)

---

### 5.8 `useTrackEvent` (Funções Exportadas)

**Arquivo:** `src/hooks/useTrackEvent.ts`

Funções utilitárias para rastreamento de eventos.

#### `getDeviceType(): string` (interna)
Detecta o tipo de dispositivo baseado na largura da janela.
- `< 768` → `"mobile"`
- `< 1024` → `"tablet"`
- `≥ 1024` → `"desktop"`

#### `getUtmParams(): { utm_source, utm_medium, utm_campaign }` (interna)
Extrai parâmetros UTM da URL atual.

#### `trackClickEvent(consultantId: string, eventTarget: string, pageType: "client" | "licenciada"): void`
Registra um evento de clique na tabela `page_events`.

- **Parâmetros:**
  - `consultantId` — ID do consultor
  - `eventTarget` — Identificador do elemento clicado (ex: `"cta_cadastro"`)
  - `pageType` — Tipo da página
- **Ação:** Insere em `page_events` com `event_type: "click"`, device type e UTMs

#### `getTrackingMeta(): { device_type, utm_source, utm_medium, utm_campaign }`
Retorna metadata de tracking para uso em inserções.

---

### 5.9 `useIsMobile(): boolean`

**Arquivo:** `src/hooks/use-mobile.tsx`

Hook que detecta se o viewport é mobile (largura < 768px).

- **Retorno:** `boolean` — `true` se viewport < 768px
- **Observação:** Usa `window.matchMedia` com listener para mudanças em tempo real

---

### 5.10 `useToast()`

**Arquivo:** `src/hooks/use-toast.ts`

Sistema de notificações toast com gerenciamento de estado global.

#### Retorno

```ts
{
  toasts: ToasterToast[];
  toast: (props: Toast) => { id, dismiss, update };
  dismiss: (toastId?: string) => void;
}
```

#### Funções Internas

##### `reducer(state, action)`
Reducer que gerencia ações: `ADD_TOAST`, `UPDATE_TOAST`, `DISMISS_TOAST`, `REMOVE_TOAST`.

##### `dispatch(action)`
Atualiza estado global e notifica todos os listeners.

##### `toast(props: Toast)`
Cria um novo toast com ID único. Retorna controles para `dismiss` e `update`.

- **Limite:** Máximo 1 toast visível por vez (`TOAST_LIMIT = 1`)

---

## 6. Edge Functions (Supabase)

### 6.1 `upload-media`

**Arquivo:** `supabase/functions/upload-media/index.ts`

Edge function que recebe arquivos via multipart/form-data e faz upload para o MinIO.

#### Funções Internas

##### `getAllowedTypes(): string[]`
Retorna array flat de todos os MIME types permitidos (imagens, áudios, vídeos, documentos).

##### `getExtension(mime: string): string`
Mapeia MIME type para extensão de arquivo:
- `image/jpeg` → `.jpg`
- `audio/mpeg` → `.mp3`
- `application/pdf` → `.pdf`
- etc.

#### Handler Principal

1. Valida CORS (OPTIONS → 200)
2. Lê credenciais MinIO das env vars
3. Extrai arquivo do form-data
4. Valida:
   - Arquivo presente
   - Tamanho ≤ 25MB (`MAX_SIZE`)
   - MIME type permitido
5. Gera chave: `{uuid}-{timestamp}.{ext}`
6. Upload para bucket `media-templates` via cliente S3
7. Retorna:
   ```json
   {
     "url": "https://minio-server/media-templates/{key}",
     "key": "{key}",
     "type": "image/jpeg",
     "size": 12345
   }
   ```

#### Variáveis de Ambiente Necessárias

| Variável              | Descrição                         |
| --------------------- | --------------------------------- |
| `MINIO_SERVER_URL`    | URL do servidor MinIO             |
| `MINIO_ROOT_USER`     | Usuário de acesso ao MinIO        |
| `MINIO_ROOT_PASSWORD` | Senha de acesso ao MinIO          |

---

### 6.2 `crm-auto-progress`

**Arquivo:** `supabase/functions/crm-auto-progress/index.ts`

Edge function que progressa automaticamente deals no CRM baseado no tempo desde aprovação.

#### Mapa de Progressão

| Dias desde aprovação | Estágio destino |
| -------------------- | --------------- |
| ≥ 30                 | `30_dias`       |
| ≥ 60                 | `60_dias`       |
| ≥ 90                 | `90_dias`       |
| ≥ 120                | `120_dias`      |

#### Funções

##### `sendEvolutionMessage(instanceName, phone, text, apiUrl, apiKey): Promise<void>`
Envia mensagem de texto via Evolution API.

- **Parâmetros:** instância, telefone, texto, URL da API, chave da API
- **Método HTTP:** `POST /message/sendText/{instanceName}`

##### Handler Principal

1. Busca deals com `stage = "aprovado"` e `approved_at` definido
2. Busca deals em `30_dias`, `60_dias`, `90_dias` com `approved_at` definido
3. Para cada deal, calcula dias desde aprovação
4. Encontra o estágio mais alto qualificado
5. Verifica se o estágio destino existe para o consultor (`kanban_stages`)
6. Move o deal para o estágio destino
7. Se auto-message habilitado: envia mensagem automática via Evolution API
8. Substitui placeholders `{{nome}}` e `{{telefone}}` pelo número do telefone
9. Retorna: `{ moved: number, checked: number }`

#### Variáveis de Ambiente Necessárias

| Variável                 | Descrição                    |
| ------------------------ | ---------------------------- |
| `SUPABASE_URL`           | URL do projeto Supabase      |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key          |
| `EVOLUTION_API_URL`      | URL da Evolution API         |
| `EVOLUTION_API_KEY`      | Chave da Evolution API       |

---

## 7. Componentes WhatsApp

### 7.1 `WhatsAppTab`

**Arquivo:** `src/components/whatsapp/WhatsAppTab.tsx`

Componente orquestrador principal do módulo WhatsApp. Gerencia sub-abas e conexão.

#### Props

```ts
interface WhatsAppTabProps {
  userId: string;
}
```

#### Sub-abas

| Key           | Label         | Componente        |
| ------------- | ------------- | ----------------- |
| `conversas`   | Conversas     | ChatSidebar + ChatView |
| `crm`         | CRM           | KanbanBoard       |
| `envio_massa` | Envio em massa| BulkSendPanel     |
| `templates`   | Templates     | TemplateManager   |
| `agendamentos`| Agendamentos  | SchedulePanel     |
| `clientes`    | Clientes      | CustomerManager   |

#### Funções Internas

##### `fetchCustomers(): Promise<void>`
Busca todos os clientes do Supabase (`customers`) ordenados por data de criação decrescente.

---

### 7.2 `ConnectionPanel`

**Arquivo:** `src/components/whatsapp/ConnectionPanel.tsx`

Componente de UI para gerenciar a conexão WhatsApp. Exibe diferentes estados:

- **Desconectado (sem instância):** Botão "Conectar WhatsApp"
- **Desconectado (com instância):** Botão "Reconectar"
- **Conectando:** Exibe QR Code para escaneamento
- **Conectado:** Badge verde + botão "Desconectar"
- **Erro:** Mensagem de erro + botão "Tentar novamente"
- **Carregando:** Spinner de verificação

#### Props

```ts
interface ConnectionPanelProps {
  connectionStatus: ConnectionStatus;
  qrCode: string | null;
  instanceName: string | null;
  phoneNumber: string | null;
  isLoading: boolean;
  error: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onReconnect: () => Promise<void>;
}
```

---

### 7.3 `ChatSidebar`

**Arquivo:** `src/components/whatsapp/ChatSidebar.tsx`

Lista lateral de conversas com busca e seleção.

#### Props

```ts
interface ChatSidebarProps {
  chats: ChatItem[];
  isLoading: boolean;
  selectedJid: string | null;
  onSelectChat: (chat: ChatItem) => void;
}
```

#### Funções Internas

##### `formatTime(ts: number): string`
Formata timestamp Unix para exibição:
- Hoje → `"10:30"`
- Ontem → `"Ontem"`
- Mais antigo → `"25/12"`

---

### 7.4 `ChatView`

**Arquivo:** `src/components/whatsapp/ChatView.tsx`

Visualização completa de um chat: mensagens, composição e envio.

#### Props

```ts
interface ChatViewProps {
  instanceName: string;
  chat: ChatItem | null;
  templates: MessageTemplate[];
  consultantId: string;
}
```

#### Funções Internas

##### `handleCustomerAdded(): void`
Callback chamado quando um cliente é adicionado via `AddCustomerDialog`. Atualiza o estado.

##### `handleSendAudio(audioBase64: string): Promise<void>`
1. Faz upload do áudio base64 como Blob para o MinIO
2. Envia via `sendAudio` da Evolution API

##### `handleSendMedia(mediaUrl: string, caption: string, mediaType: "image" | "document"): Promise<void>`
Envia mídia via `sendMedia` da Evolution API com o JID resolvido.

---

### 7.5 `MessageBubble`

**Arquivo:** `src/components/whatsapp/MessageBubble.tsx`

Bolha de mensagem com suporte a múltiplos tipos de mídia.

#### Props

```ts
interface MessageBubbleProps {
  message: ChatMessage;
  onLoadMedia?: (messageId: string) => Promise<string | null>;
}
```

#### Funções Internas

##### `formatTime(ts: number): string`
Formata timestamp para `HH:MM` (horário brasileiro).

#### Sub-componentes

##### `StatusIcon({ status?: number })`
Ícone de status da mensagem:
- `≤ 1` → ⏰ Clock (pendente)
- `2` → ✓ Check (servidor recebeu)
- `3` → ✓✓ CheckCheck cinza (entregue)
- `≥ 4` → ✓✓ CheckCheck azul (lida)

##### `AudioPlayer({ message, onLoadMedia })`
Player de áudio com carregamento lazy da mídia.

##### `ImageViewer({ message, onLoadMedia })`
Visualizador de imagem com:
- Auto-load no mount
- Expandir em fullscreen ao clicar
- Fallback com botão de carregar

##### `VideoPlayer({ message, onLoadMedia })`
Player de vídeo com carregamento lazy.

##### `DocumentViewer({ message, onLoadMedia })`
Visualizador de documento:
- PDF → iframe inline + link de download
- Outros → Link de download direto

##### `StickerViewer({ message, onLoadMedia })`
Exibe sticker (imagem max 150x150px).

---

### 7.6 `MessageComposer`

**Arquivo:** `src/components/whatsapp/MessageComposer.tsx`

Compositor de mensagens com suporte a texto, arquivos e gravação de áudio.

#### Props

```ts
interface MessageComposerProps {
  onSend: (text: string) => Promise<void>;
  onSendAudio?: (audioBase64: string) => Promise<void>;
  onSendMedia?: (mediaUrl: string, caption: string, mediaType: "image" | "document") => Promise<void>;
  templates: MessageTemplate[];
  disabled?: boolean;
}
```

#### Funções Internas

##### `handleChange(e): void`
Atualiza texto. Se começa com `/`, abre menu de respostas rápidas.

##### `handleSend(): Promise<void>`
- Se arquivo anexado → envia via `onSendMedia`
- Se texto → envia via `onSend`
- Limpa estado após envio

##### `handleKeyDown(e): void`
Enter (sem Shift) → Envia. Escape → Fecha quick reply.

##### `handleTemplateSelect(t: MessageTemplate): void`
Preenche campo de texto com conteúdo do template.

##### `handleFileSelect(e): Promise<void>`
1. Valida tamanho (max 25MB)
2. Upload via `uploadMedia` do MinIO
3. Anexa arquivo (URL + nome + tipo)

##### `startRecording(): Promise<void>`
Inicia gravação de áudio via `MediaRecorder` (WebRTC).
- Formato: `audio/webm;codecs=opus`
- Timer de duração

##### `stopRecording(): void`
Para gravação e converte para base64. Chama `onSendAudio`.

##### `cancelRecording(): void`
Cancela gravação sem enviar. Limpa chunks e stream.

##### `formatRecordingTime(s: number): string`
Formata segundos para `M:SS` (ex: `1:30`).

---

### 7.7 `MessagePanel`

**Arquivo:** `src/components/whatsapp/MessagePanel.tsx`

Painel de envio individual de mensagens para clientes.

#### Função Exportada

##### `filterCustomers<T>(customers: T[], search: string): T[]`
Filtra clientes por nome ou telefone.

#### Funções Internas

##### `handleSend(): Promise<void>`
Envia texto para o cliente selecionado via `sendTextMessage`.

##### `handleTemplateChange(templateId: string): void`
Aplica template selecionado ao campo de mensagem.

---

### 7.8 `BulkSendPanel`

**Arquivo:** `src/components/whatsapp/BulkSendPanel.tsx`

Painel de envio de mensagens em massa para múltiplos clientes.

#### Props

```ts
interface BulkSendPanelProps {
  instanceName: string;
  customers: Customer[];
  templates: MessageTemplate[];
  applyTemplate: (template: MessageTemplate, customer: Customer) => string;
}
```

#### Funções Internas

##### `toggleCustomer(id: string): void`
Adiciona/remove cliente da seleção.

##### `toggleAll(): void`
Seleciona ou deseleciona todos os clientes.

##### `handleTemplateChange(templateId: string): void`
Preenche campo de mensagem com conteúdo do template selecionado.

##### `handleBulkSend(): Promise<void>`
1. Itera pelos clientes selecionados
2. Para cada um: aplica template (se aplicável) e envia via `sendTextMessage`
3. Atualiza progresso em tempo real
4. Registra sucessos e falhas

---

### 7.9 `TemplateManager`

**Arquivo:** `src/components/whatsapp/TemplateManager.tsx`

Gerenciador completo de templates de mensagens com suporte a upload de mídia.

#### Props

```ts
interface TemplateManagerProps {
  templates: MessageTemplate[];
  isLoading: boolean;
  onCreateTemplate: (name, content, mediaType?, mediaUrl?) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}
```

#### Funções Internas

##### `handleFileUpload(e): Promise<void>`
Upload de arquivo de mídia via `uploadMedia` para o MinIO. Valida tamanho (max 25MB).

##### `handleCreate(): Promise<void>`
Valida campos obrigatórios e chama `onCreateTemplate`:
- Texto: nome + conteúdo obrigatórios
- Mídia: nome + URL obrigatórios

#### Funções Helper

##### `mediaIcon(type: TemplateMediaType): JSX.Element`
Retorna ícone Lucide correspondente ao tipo de mídia.

##### `mediaBadge(type: TemplateMediaType): JSX.Element`
Retorna badge colorido com label do tipo de mídia.

#### Tipos de Mídia Suportados

| Tipo       | Label     | Formatos aceitos                 |
| ---------- | --------- | -------------------------------- |
| `text`     | Texto     | —                                |
| `image`    | Imagem    | JPG, PNG, WEBP                   |
| `audio`    | Áudio     | MP3, OGG                         |
| `document` | Documento | PDF, DOCX, XLSX                  |

---

### 7.10 `KanbanBoard`

**Arquivo:** `src/components/whatsapp/KanbanBoard.tsx`

Quadro Kanban para CRM com drag-and-drop e mensagens automáticas.

#### Props

```ts
interface KanbanBoardProps {
  consultantId: string;
  instanceName?: string | null;
}
```

#### Estágios Padrão (criados automaticamente)

| Stage Key    | Label     | Posição | Auto-mensagem padrão     |
| ------------ | --------- | ------- | ------------------------ |
| `novo_lead`  | Novo Lead | 0       | —                        |
| `aprovado`   | Aprovado  | 1       | ✅ Mensagem de aprovação |
| `reprovado`  | Reprovado | 2       | —                        |
| `30_dias`    | 30 DIAS   | 3       | ✅ Follow-up 30 dias     |
| `60_dias`    | 60 DIAS   | 4       | ✅ Follow-up 60 dias     |
| `90_dias`    | 90 DIAS   | 5       | ✅ Follow-up 90 dias     |
| `120_dias`   | 120 DIAS  | 6       | ✅ Follow-up 120 dias    |

#### Funções Internas

##### `fetchStages(): Promise<void>`
Busca estágios do Supabase. Se vazio, cria os estágios padrão.

##### `fetchDeals(): Promise<void>`
Busca todos os deals do consultor no Supabase.

##### `handleDragStart(id: string): void`
Salva o ID do deal sendo arrastado.

##### `handleDrop(stageKey: string): Promise<void>`
1. Move deal para o novo estágio no Supabase
2. Se destino = `"aprovado"` e sem `approved_at` → define `approved_at = now()`
3. Dispara auto-mensagem do estágio destino

##### `sendAutoMessage(stage: KanbanStage, deal: Deal): Promise<void>`
Envia mensagem automática quando deal muda de estágio:
- Verifica `auto_message_enabled` e `auto_message_text`
- Substitui `{{nome}}` e `{{telefone}}`
- Envia texto, imagem, vídeo ou áudio conforme `auto_message_type`

##### `handleAddStage(): Promise<void>`
Cria nova coluna no Kanban. Gera `stage_key` a partir do label.

##### `handleUpdateStage(stage: KanbanStage): Promise<void>`
Atualiza label e cor de uma coluna.

##### `handleDeleteStage(stageId, stageKey): Promise<void>`
Remove coluna se não houver deals nela.

##### `handleSaveAutoMessage(stageId, text, type, mediaUrl): Promise<void>`
Salva configuração de auto-mensagem para um estágio.

##### `handleToggleAutoMessage(stageId, enabled): Promise<void>`
Ativa/desativa auto-mensagem de um estágio.

---

### 7.11 `CustomerManager`

**Arquivo:** `src/components/whatsapp/CustomerManager.tsx`

Gerenciador de clientes com CRUD, busca, edição e fotos de perfil.

#### Props

```ts
interface CustomerManagerProps {
  customers: Customer[];
  consultantId: string;
  onCustomersChange: () => void;
  instanceName?: string | null;
}
```

#### Funções Helper

##### `formatPhoneDisplay(phone: string): string`
Formata telefone: `5511999999999` → `+55 (11) 9 9999-9999`

##### `formatCpfDisplay(cpf: string): string`
Formata CPF: `12345678901` → `123.456.789-01`

##### `getInitials(name: string | null): string`
Extrai iniciais: `"João Silva"` → `"JS"`, `null` → `"?"`

##### `getStatusBadge(status): { label, className }`
Retorna label e classe CSS para badge de status:
- `"approved"` → Verde
- `"rejected"` → Vermelho
- `"pending"` → Amarelo
- `"lead"` → Azul

#### Funções Internas

##### `handleDelete(id: string): Promise<void>`
Remove cliente do Supabase e notifica mudança.

##### `openEdit(c: Customer): void`
Abre formulário de edição preenchendo o estado do form.

##### `handleSaveEdit(): Promise<void>`
Salva alterações do cliente no Supabase.

##### `fetchCep(): Promise<void>`
Busca endereço pelo CEP via API ViaCEP (`https://viacep.com.br/ws/{cep}/json/`).

---

### 7.12 `AddCustomerDialog`

**Arquivo:** `src/components/whatsapp/AddCustomerDialog.tsx`

Dialog modal para adicionar novos clientes com formulário completo.

#### Props

```ts
interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPhone?: string;
  initialName?: string;
  onCustomerAdded?: () => void;
}
```

#### Funções Helper

##### `formatPhone(raw: string): string`
Formata telefone durante digitação: `55119` → `+55 (11) 9`

##### `formatCpf(raw: string): string`
Formata CPF durante digitação: `123456` → `123.456`

##### `formatCep(raw: string): string`
Formata CEP durante digitação: `01001` → `01001-`

#### Funções Internas

##### `fetchCep(): Promise<void>`
Busca endereço pelo CEP via API ViaCEP.

##### `handleSave(): Promise<void>`
Insere novo cliente no Supabase (`customers`). Campos: nome, CPF, data de nascimento, email, telefones, endereço completo, dados de energia.

---

### 7.13 `QuickReplyMenu`

**Arquivo:** `src/components/whatsapp/QuickReplyMenu.tsx`

Menu dropdown de respostas rápidas ativado pelo `/` no compositor.

#### Props

```ts
interface QuickReplyMenuProps {
  templates: MessageTemplate[];
  search: string;
  onSelect: (template: MessageTemplate) => void;
  onClose: () => void;
}
```

- Filtra templates por nome ou conteúdo
- Fecha ao clicar fora (mousedown listener)
- Retorna `null` se nenhum resultado

---

### 7.14 `SchedulePanel`

**Arquivo:** `src/components/whatsapp/SchedulePanel.tsx`

Painel de agendamento de mensagens para envio futuro.

#### Props

```ts
interface SchedulePanelProps {
  consultantId: string;
  instanceName: string;
}
```

#### Funções Internas

##### `fetchMessages(): Promise<void>`
Busca mensagens agendadas do Supabase (`scheduled_messages`) ordenadas por `scheduled_at`.

##### `handleCreate(): Promise<void>`
Cria nova mensagem agendada com: `remote_jid`, `message_text`, `scheduled_at`, `instance_name`.

##### `handleDelete(id: string): Promise<void>`
Remove mensagem agendada do Supabase.

---

### 7.15 `StageAutoMessageConfig`

**Arquivo:** `src/components/whatsapp/StageAutoMessageConfig.tsx`

Dialog de configuração de mensagem automática por estágio do Kanban.

#### Props

```ts
interface StageAutoMessageConfigProps {
  stageLabel: string;
  autoMessageText: string | null;
  autoMessageType: string;
  autoMessageMediaUrl: string | null;
  onSave: (text: string | null, type: string, mediaUrl: string | null) => void;
}
```

#### Tipos de Mensagem

| Tipo    | Label   | Ícone   |
| ------- | ------- | ------- |
| `text`  | Texto   | Type    |
| `image` | Imagem  | Image   |
| `video` | Vídeo   | Video   |
| `audio` | Áudio   | Mic     |

#### Funções Internas

##### `handleSave(): void`
Chama `onSave` com texto, tipo e URL de mídia. Fecha dialog.

##### `handleClear(): void`
Limpa todos os campos e chama `onSave(null, "text", null)`.

##### `insertBold(): void`
Insere `**texto**` no campo de texto.

##### `insertItalic(): void`
Insere `_texto_` no campo de texto.

---

## 8. Componentes Gerais

### 8.1 `ScrollReveal`

**Arquivo:** `src/components/ScrollReveal.tsx`

Wrapper que anima filhos ao entrarem no viewport usando `IntersectionObserver`.

- **Props:** `children`, `className`
- **Comportamento:** Adiciona classes de transição (opacity, transform) quando o elemento se torna visível

### 8.2 `SEOHead`

**Arquivo:** `src/components/SEOHead.tsx`

Injeta `<title>` e `<meta description>` no documento via `document.title` e manipulação direta do DOM.

- **Props:** `title: string`, `description: string`

### 8.3 `WhatsAppFloat`

**Arquivo:** `src/components/WhatsAppFloat.tsx`

Botão flutuante do WhatsApp (canto inferior direito) que abre link direto para conversa.

- **Props:** `phone: string`, `message?: string`
- **Ação:** Abre `https://wa.me/{phone}?text={message}` em nova aba

### 8.4 `LoadingScreen`

**Arquivo:** `src/components/LoadingScreen.tsx`

Tela de carregamento com logo animada exibida enquanto dados são carregados.

### 8.5 `NavLink`

**Arquivo:** `src/components/NavLink.tsx`

Componente de navegação interna com smooth scroll para âncoras.

### 8.6 `PixelInjector`

**Arquivo:** `src/components/PixelInjector.tsx`

Injeta scripts de tracking (Facebook Pixel e Google Analytics) dinamicamente no `<head>`.

- **Props:** `facebookPixelId?: string`, `googleAnalyticsId?: string`
- **Observação:** Só injeta se o ID estiver definido

---

## 9. Páginas

### 9.1 `Admin`

**Arquivo:** `src/pages/Admin.tsx`

Painel principal do consultor com 5 abas: Dashboard, Dados, Links, Preview, WhatsApp.

#### Funções Internas

##### `loadConsultant(uid: string): Promise<void>`
Carrega dados do consultor do Supabase e preenche o formulário. Gera URLs de cadastro automaticamente se `igreen_id` estiver definido.

##### `handlePhotoChange(e): void`
Seleciona arquivo de foto e gera preview local via `URL.createObjectURL`.

##### `handleSave(e): Promise<void>`
1. Se há foto nova: upload para Supabase Storage (`consultant-photos/{uid}/photo.{ext}`)
2. Upsert dos dados do consultor no Supabase
3. Gera slug de licença a partir do nome

##### `handleLogout(): Promise<void>`
Sign out do Supabase e redireciona para `/auth`.

##### `copyLink(url: string): void`
Copia URL para clipboard e mostra toast de confirmação.

#### Sub-componentes Internos

##### `StatCard({ icon, label, value, color })`
Card de estatística do dashboard.

##### `LinkCard({ url, label, onCopy, onQr })`
Card de link com botões de copiar e gerar QR Code.

---

### 9.2 `Auth`

**Arquivo:** `src/pages/Auth.tsx`

Página de autenticação (login e cadastro) via Supabase Auth.

#### Funções Internas

##### `handleSubmit(e): Promise<void>`
- **Login:** `supabase.auth.signInWithPassword({ email, password })`
- **Cadastro:** `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`
- Redireciona para `/admin` após autenticação

---

### 9.3 `ConsultantPage`

**Arquivo:** `src/pages/ConsultantPage.tsx`

Landing page do cliente. Usa parâmetro `:licenca` da URL para buscar dados do consultor.

- **Hooks:** `useConsultant`, `useTrackView`
- **Seções:** Hero, About, HowItWorks, Advantages, SolarPlants, States, Club, Testimonials, Referral, Consultant

### 9.4 `LicenciadaPage`

**Arquivo:** `src/pages/LicenciadaPage.tsx`

Landing page do licenciado. Similar à `ConsultantPage` mas com conteúdo focado em expansão.

- **Hooks:** `useConsultant`, `useTrackView`

### 9.5 `LicenciadaPreview`

**Arquivo:** `src/pages/LicenciadaPreview.tsx`

Preview da landing page do licenciado sem dados reais (usa dados mockados).

### 9.6 `NotFound`

**Arquivo:** `src/pages/NotFound.tsx`

Página 404 com link de retorno.

### 9.7 `Index` (em App.tsx)

Rota `/` redireciona para `/auth` via `<Navigate to="/auth" replace />`.

---

## 10. Tipos TypeScript

### 10.1 `src/types/whatsapp.ts`

```ts
interface WhatsAppInstance {
  id: string;
  consultant_id: string;
  instance_name: string;
  created_at: string;
}

type TemplateMediaType = "text" | "image" | "audio" | "document";

interface MessageTemplate {
  id: string;
  consultant_id: string;
  name: string;
  content: string;
  media_type: TemplateMediaType;
  media_url: string | null;
  created_at: string;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface BulkSendProgress {
  total: number;
  sent: number;
  failed: number;
  inProgress: boolean;
}
```

### 10.2 `src/types/consultant.ts`

```ts
interface Consultant {
  id: string;
  name: string;
  license: string;
  phone: string;
  cadastro_url: string;
  photo_url: string | null;
  igreen_id: string | null;
  licenciada_cadastro_url: string | null;
  facebook_pixel_id: string | null;
  google_analytics_id: string | null;
  created_at: string;
}
```

---

## 11. Interfaces da Evolution API

Definidas em `src/services/evolutionApi.ts`:

### `EvolutionChat`

```ts
interface EvolutionChat {
  id: string;
  remoteJid: string;
  name?: string;
  pushName?: string;
  profilePicUrl?: string;
  lastMsgTimestamp?: number;
  unreadMessages?: number;
  unreadCount?: number;
  lastMessage?: {
    key: {
      fromMe: boolean;
      remoteJid?: string;
      remoteJidAlt?: string;
      participantAlt?: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      imageMessage?: { caption?: string };
      documentMessage?: { fileName?: string };
      audioMessage?: Record<string, unknown>;
    };
    messageTimestamp?: number;
  };
}
```

### `EvolutionMessage`

```ts
interface EvolutionMessage {
  key: {
    remoteJid: string;
    remoteJidAlt?: string;
    fromMe: boolean;
    id: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { url?: string; caption?: string; mimetype?: string; base64?: string };
    documentMessage?: { url?: string; fileName?: string; mimetype?: string; base64?: string };
    audioMessage?: { url?: string; mimetype?: string; ptt?: boolean; base64?: string };
    videoMessage?: { url?: string; caption?: string; mimetype?: string; base64?: string };
    stickerMessage?: { url?: string; mimetype?: string; base64?: string };
  };
  messageTimestamp?: number;
  status?: number;  // 0=ERROR, 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED
}
```

### `EvolutionContact`

```ts
interface EvolutionContact {
  id: string;
  remoteJid: string;
  pushName?: string;
  profilePicUrl?: string;
}
```

---

## 12. Banco de Dados

### 12.1 Tabela `consultants`

Perfis dos consultores iGreen.

| Coluna                   | Tipo        | Nullable | Default  |
| ------------------------ | ----------- | -------- | -------- |
| `id`                     | uuid        | Não      | —        |
| `name`                   | text        | Não      | —        |
| `license`                | text        | Não      | —        |
| `phone`                  | text        | Não      | —        |
| `cadastro_url`           | text        | Não      | —        |
| `photo_url`              | text        | Sim      | —        |
| `igreen_id`              | text        | Sim      | —        |
| `licenciada_cadastro_url`| text        | Sim      | —        |
| `facebook_pixel_id`      | text        | Sim      | —        |
| `google_analytics_id`    | text        | Sim      | —        |
| `created_at`             | timestamptz | Sim      | `now()`  |

**RLS:**
- `Public read` — SELECT para todos (público)
- `Owner insert` — INSERT apenas `id = auth.uid()`
- `Owner update` — UPDATE apenas `id = auth.uid()`
- DELETE não permitido

---

### 12.2 Tabela `customers`

Clientes cadastrados com dados pessoais, endereço e energia.

| Coluna                       | Tipo         | Nullable | Default        |
| ---------------------------- | ------------ | -------- | -------------- |
| `id`                         | uuid         | Não      | `gen_random_uuid()` |
| `phone_whatsapp`             | text         | Não      | —              |
| `name`                       | text         | Sim      | —              |
| `cpf`                        | text         | Sim      | —              |
| `rg`                         | text         | Sim      | —              |
| `email`                      | varchar      | Sim      | —              |
| `data_nascimento`            | varchar      | Sim      | —              |
| `nome_pai`                   | text         | Sim      | —              |
| `nome_mae`                   | text         | Sim      | —              |
| `phone_landline`             | varchar      | Sim      | —              |
| `cep`                        | text         | Sim      | —              |
| `address_street`             | text         | Sim      | —              |
| `address_number`             | text         | Sim      | —              |
| `address_complement`         | text         | Sim      | —              |
| `address_neighborhood`       | text         | Sim      | —              |
| `address_city`               | text         | Sim      | —              |
| `address_state`              | text         | Sim      | —              |
| `distribuidora`              | varchar      | Sim      | —              |
| `numero_instalacao`          | varchar      | Sim      | —              |
| `electricity_bill_value`     | numeric      | Sim      | —              |
| `electricity_bill_photo_url` | text         | Sim      | —              |
| `media_consumo`              | numeric      | Sim      | —              |
| `desconto_cliente`           | numeric      | Sim      | —              |
| `senha_pdf`                  | varchar      | Sim      | —              |
| `conta_pdf_protegida`        | boolean      | Sim      | `false`        |
| `debitos_aberto`             | boolean      | Sim      | `false`        |
| `possui_procurador`          | boolean      | Sim      | `false`        |
| `document_type`              | text         | Sim      | —              |
| `document_front_url`         | text         | Sim      | —              |
| `document_back_url`          | text         | Sim      | —              |
| `igreen_link`                | text         | Sim      | —              |
| `otp_code`                   | text         | Sim      | —              |
| `otp_received_at`            | timestamptz  | Sim      | —              |
| `portal_submitted_at`        | timestamptz  | Sim      | —              |
| `ocr_confianca`              | integer      | Sim      | —              |
| `error_message`              | text         | Sim      | —              |
| `conversation_step`          | text         | Sim      | —              |
| `status`                     | text         | Não      | `'pending'`    |
| `created_at`                 | timestamptz  | Não      | `now()`        |
| `updated_at`                 | timestamptz  | Não      | `now()`        |

**RLS:**
- `Allow all for anon` — ALL para todos (público)

---

### 12.3 Tabela `conversations`

Registro de conversas do chatbot com clientes.

| Coluna              | Tipo        | Nullable | Default              |
| ------------------- | ----------- | -------- | -------------------- |
| `id`                | uuid        | Não      | `gen_random_uuid()`  |
| `customer_id`       | uuid        | Não      | — (FK → customers)   |
| `message_direction` | text        | Não      | —                    |
| `message_text`      | text        | Sim      | —                    |
| `message_type`      | text        | Sim      | —                    |
| `conversation_step` | text        | Sim      | —                    |
| `created_at`        | timestamptz | Não      | `now()`              |

**RLS:**
- `Allow all for anon` — ALL para todos (público)

---

### 12.4 Tabela `crm_deals`

Deals do CRM Kanban.

| Coluna          | Tipo        | Nullable | Default              |
| --------------- | ----------- | -------- | -------------------- |
| `id`            | uuid        | Não      | `gen_random_uuid()`  |
| `consultant_id` | uuid        | Não      | —                    |
| `customer_id`   | uuid        | Sim      | — (FK → customers)   |
| `remote_jid`    | text        | Sim      | —                    |
| `stage`         | text        | Não      | `'novo_lead'`        |
| `notes`         | text        | Sim      | —                    |
| `approved_at`   | timestamptz | Sim      | —                    |
| `created_at`    | timestamptz | Não      | `now()`              |
| `updated_at`    | timestamptz | Não      | `now()`              |

**RLS:**
- `Users manage own deals` — ALL onde `consultant_id = auth.uid()`

---

### 12.5 Tabela `customer_tags`

Tags de clientes para categorização.

| Coluna          | Tipo        | Nullable | Default              |
| --------------- | ----------- | -------- | -------------------- |
| `id`            | uuid        | Não      | `gen_random_uuid()`  |
| `consultant_id` | uuid        | Não      | —                    |
| `remote_jid`    | text        | Não      | —                    |
| `tag_name`      | text        | Não      | —                    |
| `tag_color`     | text        | Não      | `'#22c55e'`          |
| `created_at`    | timestamptz | Não      | `now()`              |

**RLS:**
- `Users manage own tags` — ALL onde `consultant_id = auth.uid()`

---

### 12.6 Tabela `kanban_stages`

Configuração das colunas do Kanban CRM.

| Coluna                  | Tipo        | Nullable | Default                           |
| ----------------------- | ----------- | -------- | --------------------------------- |
| `id`                    | uuid        | Não      | `gen_random_uuid()`               |
| `consultant_id`         | text        | Não      | —                                 |
| `stage_key`             | text        | Não      | —                                 |
| `label`                 | text        | Não      | —                                 |
| `color`                 | text        | Não      | `'bg-blue-500/20 text-blue-400'`  |
| `position`              | integer     | Não      | `0`                               |
| `auto_message_enabled`  | boolean     | Não      | `true`                            |
| `auto_message_text`     | text        | Sim      | —                                 |
| `auto_message_type`     | text        | Sim      | `'text'`                          |
| `auto_message_media_url`| text        | Sim      | —                                 |
| `created_at`            | timestamptz | Não      | `now()`                           |

**RLS:**
- `Users can manage their own stages` — ALL onde `consultant_id = auth.uid()::text`

---

### 12.7 Tabela `message_templates`

Templates de mensagens dos consultores.

| Coluna          | Tipo        | Nullable | Default              |
| --------------- | ----------- | -------- | -------------------- |
| `id`            | uuid        | Não      | `gen_random_uuid()`  |
| `consultant_id` | uuid        | Não      | —                    |
| `name`          | text        | Não      | —                    |
| `content`       | text        | Não      | —                    |
| `media_type`    | text        | Sim      | `'text'`             |
| `media_url`     | text        | Sim      | —                    |
| `created_at`    | timestamptz | Sim      | `now()`              |

**RLS:**
- `Users can manage own templates` — ALL onde `auth.uid() = consultant_id`

---

### 12.8 Tabela `page_views`

Registro de visualizações das landing pages.

| Coluna          | Tipo        | Nullable | Default              |
| --------------- | ----------- | -------- | -------------------- |
| `id`            | uuid        | Não      | `gen_random_uuid()`  |
| `consultant_id` | uuid        | Não      | — (FK → consultants) |
| `page_type`     | text        | Não      | `'client'`           |
| `device_type`   | text        | Sim      | —                    |
| `utm_source`    | text        | Sim      | —                    |
| `utm_medium`    | text        | Sim      | —                    |
| `utm_campaign`  | text        | Sim      | —                    |
| `created_at`    | timestamptz | Não      | `now()`              |

**RLS:**
- `Public insert` — INSERT para todos
- `Consultant reads own views` — SELECT onde `consultant_id = auth.uid()`
- UPDATE e DELETE não permitidos

---

### 12.9 Tabela `page_events`

Registro de eventos (cliques) nas landing pages.

| Coluna          | Tipo        | Nullable | Default              |
| --------------- | ----------- | -------- | -------------------- |
| `id`            | uuid        | Não      | `gen_random_uuid()`  |
| `consultant_id` | uuid        | Não      | — (FK → consultants) |
| `event_type`    | text        | Não      | `'click'`            |
| `event_target`  | text        | Sim      | —                    |
| `page_type`     | text        | Não      | `'client'`           |
| `device_type`   | text        | Sim      | —                    |
| `utm_source`    | text        | Sim      | —                    |
| `utm_medium`    | text        | Sim      | —                    |
| `utm_campaign`  | text        | Sim      | —                    |
| `created_at`    | timestamptz | Não      | `now()`              |

**RLS:**
- `Public insert` — INSERT para todos
- `Consultant reads own events` — SELECT onde `consultant_id = auth.uid()`
- UPDATE e DELETE não permitidos

---

### 12.10 Tabela `scheduled_messages`

Mensagens agendadas para envio futuro.

| Coluna          | Tipo        | Nullable | Default              |
| --------------- | ----------- | -------- | -------------------- |
| `id`            | uuid        | Não      | `gen_random_uuid()`  |
| `consultant_id` | uuid        | Não      | —                    |
| `instance_name` | text        | Não      | —                    |
| `remote_jid`    | text        | Não      | —                    |
| `message_text`  | text        | Não      | —                    |
| `scheduled_at`  | timestamptz | Não      | —                    |
| `status`        | text        | Não      | `'pending'`          |
| `sent_at`       | timestamptz | Sim      | —                    |
| `created_at`    | timestamptz | Não      | `now()`              |

**RLS:**
- `Users manage own scheduled messages` — ALL onde `consultant_id = auth.uid()`

---

### 12.11 Tabela `settings`

Configurações globais em chave-valor.

| Coluna  | Tipo | Nullable | Default |
| ------- | ---- | -------- | ------- |
| `key`   | text | Não      | —       |
| `value` | text | Não      | `''`    |

**RLS:**
- `Allow all for anon` — ALL para todos (público)

---

### 12.12 Tabela `whatsapp_instances`

Instâncias WhatsApp dos consultores.

| Coluna          | Tipo        | Nullable | Default              |
| --------------- | ----------- | -------- | -------------------- |
| `id`            | uuid        | Não      | `gen_random_uuid()`  |
| `consultant_id` | uuid        | Não      | —                    |
| `instance_name` | text        | Não      | —                    |
| `created_at`    | timestamptz | Sim      | `now()`              |

**RLS:**
- `Users can manage own instances` — ALL onde `auth.uid() = consultant_id`

---

## 13. Variáveis de Ambiente

### Frontend (`.env`)

| Variável                         | Descrição                              |
| -------------------------------- | -------------------------------------- |
| `VITE_SUPABASE_PROJECT_ID`       | ID do projeto Supabase                 |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | Anon key do Supabase                   |
| `VITE_SUPABASE_URL`              | URL do projeto Supabase                |
| `VITE_EVOLUTION_API_URL`         | URL da Evolution API                   |
| `VITE_EVOLUTION_API_KEY`         | Chave da Evolution API                 |

### Edge Functions (Secrets do Supabase)

| Variável                  | Descrição                              |
| ------------------------- | -------------------------------------- |
| `SUPABASE_URL`            | URL do projeto (automático)            |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (automático)        |
| `MINIO_SERVER_URL`        | URL do servidor MinIO                  |
| `MINIO_ROOT_USER`         | Usuário de acesso ao MinIO             |
| `MINIO_ROOT_PASSWORD`     | Senha de acesso ao MinIO               |
| `EVOLUTION_API_URL`       | URL da Evolution API                   |
| `EVOLUTION_API_KEY`       | Chave da Evolution API                 |

---

## 14. Integração Supabase Client

**Arquivo:** `src/integrations/supabase/client.ts`

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

- **Tipagem:** Usa tipos gerados automaticamente (`Database`)
- **Persistência:** Sessão salva no `localStorage`
- **Auto-refresh:** Token é renovado automaticamente antes de expirar

### Storage Buckets

| Bucket              | Uso                                   |
| ------------------- | ------------------------------------- |
| `consultant-photos` | Fotos de perfil dos consultores       |
| `media-templates`   | Arquivos de mídia (MinIO, via edge)   |

---

> **Última atualização:** 29/03/2026
