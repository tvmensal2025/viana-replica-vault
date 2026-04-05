

# Mover Clientes e CRM para o topo do painel

## O que será feito

Promover as abas **CRM** e **Clientes** do sub-menu do WhatsApp para o menu principal do Admin (ao lado de Dashboard, Preview, WhatsApp, Links, Dados). Elas continuarão dependendo do `userId` e `instanceName` do WhatsApp para funcionar.

## Mudanças

### 1. `src/pages/Admin.tsx`

- Adicionar `"crm"` e `"clientes"` ao tipo do `activeTab` e ao array `tabs` (com ícones `LayoutGrid` e `Users`)
- Importar `KanbanBoard` e `CustomerManager` diretamente
- Adicionar estado para `customers` e `fetchCustomers` (mover lógica de fetch do WhatsAppTab)
- Precisará de `instanceName` do WhatsApp — importar `useWhatsApp` no Admin ou criar um hook leve que apenas lê a instância do DB
- Renderizar `<KanbanBoard>` e `<CustomerManager>` como abas de primeiro nível na `<main>`

### 2. `src/components/whatsapp/WhatsAppTab.tsx`

- Remover `"crm"` e `"clientes"` do array `SUB_TABS`
- Remover o estado/fetch de `customers` (será gerenciado no Admin)
- Remover os blocos de renderização de `KanbanBoard` e `CustomerManager`
- Remover imports não utilizados (`KanbanBoard`, `CustomerManager`, `LayoutGrid`, `Users`)

### 3. Ordem das abas no topo

```text
Dashboard | Preview | CRM | Clientes | WhatsApp | Links | Dados
```

CRM e Clientes ficam antes do WhatsApp por serem as ferramentas mais usadas no dia a dia.

### Detalhes técnicos

- O `KanbanBoard` precisa de `consultantId` e `instanceName`. O `instanceName` será obtido via `useWhatsApp(userId)` no Admin, ou de forma mais leve, lendo direto do banco (`whatsapp_instances`).
- O `CustomerManager` precisa de `customers`, `consultantId`, `onCustomersChange`, `instanceName` e `onOpenChat`. O `onOpenChat` precisará alternar para a aba WhatsApp e abrir o chat — será adaptado para `setActiveTab("whatsapp")` + passar o JID.
- A lógica de `fetchCustomers` será elevada para o Admin.tsx para ser compartilhada.

