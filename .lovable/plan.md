

## WhatsApp CRM Completo - Estilo WAWF

Transformar a aba WhatsApp atual em um CRM completo de conversas, inspirado no WA WorkFlow (wawf.app), usando a Evolution API como backend.

### O que existe hoje
- Conexão via QR Code (funcional)
- Envio individual de mensagem (apenas texto, sem histórico)
- Envio em massa (bulk)
- Templates com placeholders
- Gerenciamento de clientes manual

### O que será construído

**Fase 1 - Chat em Tempo Real (core)**
- Interface de chat estilo WhatsApp: lista de conversas à esquerda, mensagens à direita
- Buscar conversas reais via `POST /chat/findChats/{instance}`
- Buscar mensagens de cada conversa via `POST /chat/findMessages/{instance}` com `remoteJid`
- Buscar contatos via `POST /chat/findContacts/{instance}`
- Enviar texto, imagens, áudio, documentos via endpoints de mensagem
- Polling periódico para novas mensagens (a cada 5s na conversa ativa)
- Indicadores de lido/entregue, timestamps, bolhas de mensagem estilizadas

**Fase 2 - Quick Replies (Respostas Rápidas)**
- Atalho "/" no campo de mensagem para abrir menu de templates
- Seleção rápida de template com preview
- Aplicação automática de variáveis do contato selecionado

**Fase 3 - CRM Kanban**
- Board com colunas arrastáveis: Novo Lead, Em Contato, Negociação, Fechado, Perdido
- Cada card = um contato com última mensagem, valor da conta, tags
- Arrastar entre colunas para mudar status
- Nova tabela Supabase `crm_deals` (consultant_id, customer_id, stage, notes, created_at)

**Fase 4 - Etiquetas e Filtros**
- Tags coloridas nos contatos (Ex: "Interessado", "Retornar", "VIP")
- Filtrar conversas por tag, por não-lidos, por data
- Nova tabela Supabase `customer_tags`

**Fase 5 - Mensagens Agendadas**
- Agendar envio de mensagem para data/hora específica
- Lista de mensagens agendadas com opção de cancelar
- Nova tabela Supabase `scheduled_messages`
- Edge function com cron para processar envios

**Fase 6 - Envio de Mídia**
- Enviar imagens via `POST /message/sendMedia/{instance}`
- Enviar áudio via `POST /message/sendWhatsAppAudio/{instance}`
- Enviar documentos (PDF, etc.)
- Upload de arquivos no campo de mensagem
- Preview de mídia recebida no chat

### Arquitetura Técnica

```text
┌─────────────────────────────────────────────┐
│              WhatsAppTab (orquestrador)      │
├─────────┬───────────────────────────────────┤
│ Sidebar │  ChatView / KanbanBoard           │
│ ─────── │  ─────────────────────            │
│ Search  │  MessageBubble[]                  │
│ Filters │  MediaPreview                     │
│ ChatList│  QuickReplyMenu                   │
│ Tags    │  MessageComposer (text+media)     │
│         │  ScheduleModal                    │
├─────────┴───────────────────────────────────┤
│ ConnectionPanel (existente, compactado)     │
└─────────────────────────────────────────────┘
```

**Novos arquivos:**
- `src/components/whatsapp/ChatSidebar.tsx` - Lista de conversas com busca e filtros
- `src/components/whatsapp/ChatView.tsx` - Área de mensagens com bolhas
- `src/components/whatsapp/MessageBubble.tsx` - Bolha individual (texto/mídia)
- `src/components/whatsapp/MessageComposer.tsx` - Campo de envio com mídia e quick reply
- `src/components/whatsapp/QuickReplyMenu.tsx` - Menu de atalhos "/" 
- `src/components/whatsapp/KanbanBoard.tsx` - CRM visual drag-and-drop
- `src/components/whatsapp/KanbanCard.tsx` - Card de contato no kanban
- `src/components/whatsapp/TagManager.tsx` - Gerenciar etiquetas
- `src/components/whatsapp/ScheduleModal.tsx` - Modal de agendamento
- `src/hooks/useChats.ts` - Hook para buscar/atualizar conversas
- `src/hooks/useMessages.ts` - Hook para mensagens de uma conversa

**Novos endpoints no `evolutionApi.ts`:**
- `findChats(instanceName)` 
- `findMessages(instanceName, remoteJid)`
- `findContacts(instanceName)`
- `sendMedia(instanceName, phone, mediaUrl, caption, mediaType)`
- `sendAudio(instanceName, phone, audioUrl)`
- `sendDocument(instanceName, phone, docUrl, fileName)`

**Novas tabelas Supabase (migrations):**
- `crm_deals` - Kanban stages por cliente
- `customer_tags` - Etiquetas coloridas
- `scheduled_messages` - Mensagens agendadas

**Novas edge functions:**
- `process-scheduled-messages` - Cron para enviar mensagens agendadas

### Fluxo de Navegação

A aba WhatsApp terá sub-abas internas:
1. **Conversas** - Chat em tempo real (tela principal)
2. **CRM** - Kanban board
3. **Envio em Massa** - Painel existente melhorado
4. **Templates** - Gerenciador existente
5. **Agendamentos** - Lista de mensagens programadas

### Ordem de Implementação

1. Expandir `evolutionApi.ts` com novos endpoints
2. Criar hooks `useChats` e `useMessages`
3. Construir `ChatSidebar` + `ChatView` + `MessageBubble` + `MessageComposer`
4. Integrar Quick Reply no compositor
5. Criar migrations Supabase para novas tabelas
6. Construir `KanbanBoard` + `KanbanCard`
7. Adicionar `TagManager` e filtros
8. Implementar `ScheduleModal` + edge function
9. Adicionar envio de mídia ao compositor
10. Refatorar `WhatsAppTab` com sub-navegação

