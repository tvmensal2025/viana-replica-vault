

## Plano: Isolamento de Clientes por Consultor + Templates Compartilhados

### Problema atual
- A tabela `customers` não tem `consultant_id` — todos os consultores veem todos os clientes
- Templates são filtrados por `consultant_id` mas deveriam ser visíveis para todos
- Clientes de outros consultores aparecem sem ter sincronizado

### O que será feito

#### 1. Migração SQL
- Adicionar coluna `consultant_id` (uuid, nullable) na tabela `customers`
- Substituir a política RLS "Allow all for anon" por políticas que filtrem por `consultant_id = auth.uid()` (SELECT, INSERT, UPDATE, DELETE)
- Clientes sem `consultant_id` (legados) ficam invisíveis até serem re-sincronizados — isso garante que nenhum dado aparece antes da sincronização real
- Alterar RLS de `message_templates`: SELECT aberto para todos autenticados, INSERT/UPDATE/DELETE apenas pelo dono

#### 2. Edge Function `sync-igreen-customers`
- Incluir `consultant_id` em cada registro no `buildRecord` / upsert, usando o valor recebido no body da request
- Isso vincula cada cliente ao consultor que sincronizou

#### 3. Frontend — Queries filtradas (4 arquivos)
- **`src/components/whatsapp/WhatsAppTab.tsx`**: adicionar `.eq("consultant_id", userId)` no `fetchCustomers`
- **`src/hooks/useAnalytics.ts`**: adicionar `.eq("consultant_id", consultantId)` na query de customers
- **`src/components/whatsapp/AddCustomerDialog.tsx`**: incluir `consultant_id` no insert de novo cliente
- **`src/components/whatsapp/CustomerManager.tsx`**: incluir `consultant_id` nos imports de Excel e edições

#### 4. Templates compartilhados
- **`src/hooks/useTemplates.ts`**: remover `.eq("consultant_id", consultantId)` do fetch para que todos vejam todos os templates
- Manter `consultant_id` no insert (saber quem criou)
- Delete continua restrito ao dono via RLS

### Detalhes técnicos

```text
customers:
  + consultant_id uuid (nullable, sem FK para auth.users)
  
RLS customers (substituir "Allow all for anon"):
  SELECT → consultant_id = auth.uid()
  INSERT → consultant_id = auth.uid()
  UPDATE → consultant_id = auth.uid()
  DELETE → consultant_id = auth.uid()

RLS message_templates (substituir política atual):
  SELECT → true (todos autenticados)
  INSERT → consultant_id = auth.uid()
  UPDATE → consultant_id = auth.uid()
  DELETE → consultant_id = auth.uid()
```

- Clientes legados (sem `consultant_id`) não aparecem para ninguém — forçando sincronização real
- O upsert usa `phone_whatsapp` como conflict key (já existente), mas agora cada registro terá o `consultant_id` preenchido
- Sem breaking changes na estrutura existente

