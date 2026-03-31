

## Problema Critico

O sistema atual tem **3 pontos perigosos** que podem deletar a instância WhatsApp no servidor Evolution:

1. **`disconnect()`** (linha 536) chama `deleteInstance()` que faz `DELETE instance/delete/{name}` — isso **apaga a instância permanentemente** no Evolution API, desconectando o WhatsApp do número
2. **Auto-recovery** (linha 230-264) pode recriar a instância via `createInstance()` quando detecta estado "close", potencialmente sobrescrevendo a sessão existente
3. **`createInstance`** é chamado automaticamente no mount (linha 619-623) quando o estado não é "open" nem "connecting"

## Plano de Correção

### 1. Criar função `logoutInstance` no service layer (não deleta, só desconecta)

**Arquivo:** `src/services/evolutionApi.ts`

- Adicionar função `logoutInstance(instanceName)` que chama `instance/logout/{instanceName}` (endpoint do Evolution API que desconecta sem deletar)
- Manter `deleteInstance` mas nunca chamá-lo automaticamente

### 2. Substituir `deleteInstance` por `logoutInstance` no disconnect

**Arquivo:** `src/hooks/useWhatsApp.ts`

- Na função `disconnect()` (linha 536): trocar `deleteInstance(name)` por `logoutInstance(name)`
- Isso apenas desconecta a sessão sem apagar a instância no servidor
- O registro no banco local (`whatsapp_instances`) continua sendo removido para permitir reconexão limpa

### 3. Proteger contra criação duplicada de instância

**Arquivo:** `src/hooks/useWhatsApp.ts`

- Antes de chamar `createInstance()`, sempre verificar se a instância já existe no servidor via `fetchInstances()` ou `getConnectionState()`
- Se a instância já existir (mesmo com estado "close"), usar apenas `connectInstance()` para gerar novo QR — **nunca recriar**
- Só chamar `createInstance()` quando receber erro 404 confirmando que a instância realmente não existe

### 4. Remover auto-connect agressivo no mount

**Arquivo:** `src/hooks/useWhatsApp.ts`

- Remover o `setTimeout(() => createAndConnect(), 500)` no mount (linha 619-623)
- Quando estado é "close" no init, apenas mostrar botão "Conectar" sem auto-criar instância
- Isso evita que o sistema crie instâncias automaticamente a cada reload da página

### 5. Adicionar confirmação no disconnect

**Arquivo:** `src/components/whatsapp/ConnectionPanel.tsx`

- Adicionar dialog de confirmação antes de desconectar: "Tem certeza que deseja desconectar o WhatsApp?"
- Deixar claro que é apenas logout, não exclusão

### Resumo das Mudanças

| Arquivo | Mudança |
|---|---|
| `src/services/evolutionApi.ts` | Adicionar `logoutInstance()` |
| `src/hooks/useWhatsApp.ts` | Usar logout em vez de delete; remover auto-connect no mount; proteger `createInstance` com verificação prévia |
| `src/components/whatsapp/ConnectionPanel.tsx` | Adicionar confirmação de disconnect |

