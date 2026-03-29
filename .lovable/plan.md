

# Plano: Documentacao Completa de Todas as Funcoes

Criar o arquivo `DOCUMENTATION.md` na raiz do projeto com documentacao exaustiva de todas as funcoes, hooks, servicos, edge functions, componentes, paginas, tipos e tabelas do banco de dados.

## Estrutura do Documento

### 1. Visao Geral
- Arquitetura: React + Vite + TypeScript + Tailwind + Supabase + Evolution API + MinIO
- Rotas da aplicacao (6 rotas)

### 2. Utilitarios (`src/lib/`)
- `cn(...inputs)` - Merge de classes Tailwind

### 3. Servico Evolution API (`src/services/evolutionApi.ts`) - 16 funcoes
- `getBaseUrl()`, `getApiKey()`, `getHeaders()` - Configuracao
- `handleResponse<T>()` - Tratamento de resposta HTTP
- `request<T>()` - Wrapper generico de fetch
- `createInstance()` - Criar instancia WhatsApp
- `connectInstance()` - Conectar instancia (gerar QR)
- `getConnectionState()` - Estado da conexao
- `deleteInstance()` - Deletar instancia
- `findChats()` - Listar conversas
- `findMessages()` - Buscar mensagens de um chat
- `findContacts()` - Listar contatos
- `getBase64FromMediaMessage()` - Baixar midia em base64
- `sendTextMessage()` - Enviar texto
- `sendMedia()` - Enviar imagem/video/documento
- `sendAudio()` - Enviar audio
- `sendDocument()` - Enviar documento
- `markAsRead()` - Marcar como lido
- `getProfilePicture()` - Foto de perfil

### 4. Servico MinIO Upload (`src/services/minioUpload.ts`) - 3 funcoes
- `uploadMedia()` - Upload via edge function
- `getAcceptString()` - String accept por tipo
- `formatFileSize()` - Formatar bytes

### 5. Hooks (`src/hooks/`) - 10 hooks

- **useWhatsApp** - 5 funcoes internas: `clearPolling`, `pollConnectionState`, `startPolling`, `createAndConnect`, `disconnect`, `reconnect`, `checkExistingInstance`
- **useTemplates** - 4 funcoes: `fetchTemplates`, `createTemplate`, `deleteTemplate`, `applyTemplate` (pura, exportada separadamente)
- **useChats** - 4 funcoes internas: `extractLastMessage`, `mapChat`, `fetchContacts`, `fetchChats`
- **useMessages** - 5 funcoes: `mapMessage`, `fetchMessages`, `resolveSendTargetJid`, `loadMedia`, `sendMessage`
- **useConsultant** - Query por license
- **useAnalytics** - Query de analytics 30 dias
- **useTrackView** - Registra page view
- **useTrackEvent** - 2 funcoes: `trackClickEvent`, `getTrackingMeta` + helper `getDeviceType`, `getUtmParams`
- **useIsMobile** - Detecta viewport < 768px
- **useToast** - Sistema de toast (reducer + dispatch + `toast()`)

### 6. Edge Functions (Supabase) - 2 funcoes

- **upload-media** - 3 funcoes internas: `getAllowedTypes`, `getExtension`, handler principal. Upload para MinIO com validacao de tipo/tamanho.
- **crm-auto-progress** - 2 funcoes: `sendEvolutionMessage`, handler principal. Progressao automatica de deals (30/60/90/120 dias).

### 7. Componentes WhatsApp (`src/components/whatsapp/`) - 12 componentes
Cada um com suas funcoes internas documentadas:
- **WhatsAppTab** - Orquestrador principal (fetchCustomers)
- **ConnectionPanel** - UI de conexao/QR code
- **ChatSidebar** - Lista de conversas (formatTime)
- **ChatView** - Visualizacao de chat (handleCustomerAdded, handleSendAudio, handleSendMedia)
- **MessageBubble** - Bolha de mensagem + sub-componentes: AudioPlayer, ImageViewer, VideoPlayer, DocumentViewer, StickerViewer, StatusIcon, formatTime
- **MessageComposer** - Compositor (handleSend, handleFileSelect, startRecording, stopRecording, cancelRecording, formatRecordingTime)
- **MessagePanel** - Envio individual (filterCustomers exportada, handleSend, handleTemplateChange)
- **BulkSendPanel** - Envio em massa (toggleCustomer, toggleAll, handleBulkSend, handleTemplateChange)
- **TemplateManager** - Gerenciador de templates (handleFileUpload, handleCreate, mediaIcon, mediaBadge)
- **KanbanBoard** - CRM Kanban (fetchStages, fetchDeals, handleDragStart, handleDrop, sendAutoMessage, handleAddStage, handleUpdateStage, handleDeleteStage, handleSaveAutoMessage, handleToggleAutoMessage)
- **CustomerManager** - Gerenciador de clientes (formatPhoneDisplay, formatCpfDisplay, getInitials, getStatusBadge, handleDelete, openEdit, handleSaveEdit, fetchCep)
- **AddCustomerDialog** - Dialog de adicionar cliente (formatPhone, formatCpf, formatCep, fetchCep, handleSave)
- **QuickReplyMenu** - Menu de respostas rapidas
- **SchedulePanel** - Agendamento de mensagens (fetchMessages, handleCreate, handleDelete)
- **StageAutoMessageConfig** - Config de auto-mensagem por estagio (handleSave, handleClear, insertBold, insertItalic)

### 8. Componentes Gerais - 4 componentes
- **ScrollReveal** - Animacao de scroll com IntersectionObserver
- **SEOHead** - Injeta titulo e meta tags
- **WhatsAppFloat** - Botao flutuante WhatsApp
- **LoadingScreen** - Tela de carregamento
- **NavLink** - Wrapper de NavLink com classes ativas
- **PixelInjector** - Injeta Facebook Pixel e Google Analytics

### 9. Paginas (`src/pages/`) - 6 paginas
- **Admin** - Painel do consultor (loadConsultant, handlePhotoChange, handleSave, handleLogout, copyLink) + sub-componentes StatCard, LinkCard
- **Auth** - Login/Cadastro (handleSubmit)
- **ConsultantPage** - Landing page cliente
- **LicenciadaPage** - Landing page licenciado
- **LicenciadaPreview** - Preview sem dados reais
- **NotFound** - Pagina 404
- **Index** - Pagina raiz (redireciona)

### 10. Tipos TypeScript (`src/types/`)
- `whatsapp.ts` - WhatsAppInstance, MessageTemplate, TemplateMediaType, ConnectionStatus, BulkSendProgress
- `consultant.ts` - Consultant

### 11. Interfaces da Evolution API (em evolutionApi.ts)
- EvolutionChat, EvolutionMessage, EvolutionContact

### 12. Banco de Dados - 11 tabelas
Cada tabela com colunas, tipos, defaults e politicas RLS:
consultants, conversations, crm_deals, customer_tags, customers, kanban_stages, message_templates, page_events, page_views, scheduled_messages, settings, whatsapp_instances

### 13. Variaveis de Ambiente
- Frontend: VITE_EVOLUTION_API_URL, VITE_EVOLUTION_API_KEY, VITE_SUPABASE_*
- Edge Functions: MINIO_*, EVOLUTION_*, SUPABASE_*

### 14. Integracao Supabase Client
- `supabase` - Cliente configurado com persistSession e autoRefreshToken

## Detalhes Tecnicos
- Arquivo: `DOCUMENTATION.md` na raiz
- Cada funcao com: descricao, parametros (tipo), retorno, observacoes
- Tabelas em formato markdown com coluna | tipo | nullable | default
- Estimativa: ~1200 linhas de markdown
- Idioma: Portugues

