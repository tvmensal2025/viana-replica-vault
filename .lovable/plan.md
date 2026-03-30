

## Plano: Botão "Enviar WhatsApp" abre conversa interna com templates

### Problema atual
O botão "Enviar WhatsApp" abre `wa.me` no navegador externo. O usuário quer que ele abra a conversa **dentro do painel** (aba Conversas) com opções de mensagem personalizada e templates prontos.

### Solução

#### 1. Adicionar callback `onOpenChat` no CustomerManager
- Nova prop `onOpenChat?: (phone: string, suggestedMessage?: string) => void` no `CustomerManagerProps`
- O botão "Enviar WhatsApp" chama `onOpenChat` passando o telefone do cliente e a mensagem pré-formatada (baseada no status/devolutiva)

#### 2. WhatsAppTab orquestra a navegação
- Quando `onOpenChat` é chamado:
  1. Muda `activeSubTab` para `"conversas"`
  2. Busca o chat correspondente ao telefone nos `chats` (comparando o remoteJid com o phone)
  3. Seta `selectedChatJid` para abrir a conversa
  4. Passa a mensagem sugerida para o `ChatView` como prop `initialMessage`

#### 3. ChatView recebe `initialMessage` e pré-preenche o compositor
- Nova prop `initialMessage?: string | null` no `ChatViewProps`
- Passa para `MessageComposer` como prop que pré-preenche o textarea
- O compositor mostra os templates disponíveis para o usuário trocar se quiser

#### 4. MessageComposer aceita `initialMessage`
- Nova prop `initialMessage?: string | null`
- Quando `initialMessage` muda (e não é null), preenche o campo de texto automaticamente
- Usuário pode editar antes de enviar ou escolher um template diferente

### Arquivos modificados
- `src/components/whatsapp/CustomerManager.tsx` — nova prop `onOpenChat`, substituir `handleOpenWhatsApp`
- `src/components/whatsapp/WhatsAppTab.tsx` — handler `handleOpenChatFromCustomer`, passar props
- `src/components/whatsapp/ChatView.tsx` — nova prop `initialMessage`, repassar ao composer
- `src/components/whatsapp/MessageComposer.tsx` — nova prop `initialMessage`, preencher textarea

