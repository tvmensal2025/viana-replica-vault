

# Analise: Contato duplicado na sidebar (ericachristofoletti)

## Causa raiz

O WhatsApp (via Evolution API / Baileys) usa dois tipos de identificadores para o mesmo contato:
- `@s.whatsapp.net` — baseado no numero de telefone
- `@lid` — identificador interno do WhatsApp (LID)

Quando a API retorna os chats, ela pode criar **duas entradas separadas** para a mesma pessoa: uma com JID de telefone e outra com JID LID. O codigo atual (`useChats.ts`) nao faz deduplicacao — cada `remoteJid` unico vira um item separado na lista.

O campo `remoteJidAlt` (que ja existe no codigo) faz exatamente essa ponte: ele vincula um JID LID ao numero de telefone real. Porem, ele so e usado para `sendTargetJid`, nao para deduplicar.

## Solucao

Adicionar logica de deduplicacao no `useChats.ts` apos o mapeamento dos chats:

1. **Agrupar chats pelo mesmo telefone real** — usar `sendTargetJid` ou `remoteJidAlt` para identificar que dois JIDs diferentes pertencem ao mesmo contato
2. **Mesclar os registros duplicados** — manter o que tem a mensagem mais recente, preservando o `sendTargetJid` correto para envio
3. **Preservar mensagens nao lidas** — somar `unreadCount` dos duplicados

### Logica de deduplicacao

```text
Para cada chat mapeado:
  1. Extrair o "telefone real" (de sendTargetJid ou remoteJid @s.whatsapp.net)
  2. Se ja existe um chat com esse telefone:
     - Manter o com lastMessageTimestamp mais recente
     - Somar unreadCount
     - Preservar profilePicUrl se um tiver e outro nao
  3. Se nao existe, adicionar normalmente
```

### Arquivo alterado

| Arquivo | Mudanca |
|---------|---------|
| `src/hooks/useChats.ts` | Adicionar funcao `deduplicateChats()` apos o `map/filter` e antes do `sort` |

A mudanca e de ~20 linhas, sem impacto em outros arquivos.

