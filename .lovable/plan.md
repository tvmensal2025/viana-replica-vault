

## Problema

Mensagens de áudio e imagem enviadas pelo CRM (mensagens automáticas do kanban) aparecem como botões "Áudio" e "Carregar imagem" em vez de carregar automaticamente. Isso ocorre porque:

1. **`MessageBubble`** só considera mídia pré-carregada se `mediaUrl` começa com `data:` — URLs normais (Supabase Storage / MinIO) são ignoradas
2. **`AudioPlayer` e `ImageViewer`** exigem clique manual para carregar via `getBase64FromMediaMessage`
3. Mensagens `fromMe` enviadas pelo CRM têm URLs de mídia válidas mas não são renderizadas diretamente

## Plano

### 1. Aceitar URLs HTTP diretas no MessageBubble (ImageViewer, AudioPlayer, VideoPlayer)

**Arquivo: `src/components/whatsapp/MessageBubble.tsx`**

Modificar os componentes `AudioPlayer`, `ImageViewer`, `VideoPlayer` e `DocumentViewer` para aceitar URLs HTTP como fontes válidas (não apenas `data:` URLs):

- Inicializar `audioSrc`/`imgSrc`/`videoSrc` com `mediaUrl` se ele começa com `http` OU `data:`
- Isso faz com que mídias com URLs diretas (enviadas pelo CRM via Supabase Storage) renderizem automaticamente sem necessidade de clique
- Mídias sem URL continuam mostrando o botão de carregar sob demanda via `getBase64FromMediaMessage`

### 2. Auto-carregar mídia para mensagens `fromMe` no ImageViewer

Para mensagens enviadas pelo próprio usuário (`fromMe`), auto-carregar a imagem/áudio ao montar o componente se nenhuma URL direta estiver disponível mas `onLoadMedia` existir.

### Detalhes Técnicos

Na condição de inicialização do state de cada media viewer, mudar:
```typescript
// Antes:
const [src, setSrc] = useState<string | null>(
  message.mediaUrl?.startsWith("data:") ? message.mediaUrl : null
);

// Depois:
const [src, setSrc] = useState<string | null>(
  message.mediaUrl?.startsWith("data:") || message.mediaUrl?.startsWith("http")
    ? message.mediaUrl
    : null
);
```

Adicionar `useEffect` para auto-carregar mídias de mensagens enviadas (`fromMe`) que não tenham URL direta:
```typescript
useEffect(() => {
  if (!src && message.fromMe && onLoadMedia) {
    handleLoad();
  }
}, []);
```

Arquivos modificados: `src/components/whatsapp/MessageBubble.tsx` (apenas)

Nenhum componente externo ou hook precisa mudar — a interface `ChatMessage` já possui `mediaUrl` com URLs HTTP.

