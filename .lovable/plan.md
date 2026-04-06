

# Plano Completo: Resolver Todos os 10 Itens

## Visão Geral

Implementar as 4 correções criticas e 6 melhorias em uma sequência organizada, priorizando segurança e automação.

---

## Parte 1 — Criticos

### 1. Edge Function para disparar `scheduled_messages` automaticamente

**Problema**: Mensagens agendadas ficam com status "pending" para sempre.

- Criar edge function `send-scheduled-messages/index.ts` que:
  - Busca mensagens com `status = 'pending'` e `scheduled_at <= now()`
  - Envia via Evolution API (texto simples, como já feito em `crm-auto-progress`)
  - Atualiza status para "sent" ou "failed", grava `sent_at`
  - Intervalo de 2s entre envios
- Registrar cron job via SQL INSERT (pg_cron + pg_net) para rodar a cada 5 minutos

### 2. Vincular `customer_id` nos deals do CRM automaticamente

- Na edge function `crm-auto-progress`, adicionar etapa inicial que:
  - Busca deals com `customer_id IS NULL` e `remote_jid IS NOT NULL`
  - Para cada deal, busca customer pelo telefone (normalizado)
  - Faz UPDATE do `customer_id` no deal
- Isso elimina a dependencia de matching por telefone no frontend

### 3. Proteção da rota `/admin`

**Problema**: Qualquer usuario logado acessa `/admin`.

- No `Admin.tsx`, após verificar `approved`, adicionar checagem: se o usuario nao tem registro em `consultants` com `approved = true`, mostrar tela de bloqueio
- **Ja existe**: linha 279 `if (!approved)` mostra "Aguardando Aprovacao" — isso ja funciona corretamente. O `approved` vem do banco. Vou reforçar adicionando redirect para `/auth` se nao houver sessao, e garantir que o state `approved` inicia como `null` (nao `false`) para distinguir "carregando" de "nao aprovado"

### 4. Refatoração do `CustomerManager.tsx` (1280 linhas)

Extrair em componentes menores:
- `CustomerListItem.tsx` — renderização de cada cliente (avatar, dots CRM, badges)
- `CustomerEditDialog.tsx` — modal de edição completo
- `CustomerImportExport.tsx` — logica de importar/exportar Excel
- `useCustomerDeals.ts` — hook para buscar deals e mapear por customer
- `CustomerManager.tsx` fica como orquestrador (~300 linhas)

---

## Parte 2 — Melhorias

### 5. Notificações em tempo real (Supabase Realtime)

- No `useChats.ts`, adicionar subscription Realtime na tabela `conversations`
- Quando nova mensagem `inbound` chega, tocar som e mostrar toast
- Atualizar lista de chats automaticamente

### 6. Exportar relatório PDF com métricas

- Adicionar botão "Exportar PDF" no `DashboardTab`
- Usar biblioteca `jspdf` + `html2canvas` para gerar PDF com as metricas visíveis
- Download direto no navegador

### 7. Filtro por período no dashboard (7d/30d/90d)

- **Ja existe parcialmente**: `periodDays` state no `Admin.tsx` com `onPeriodChange`
- Verificar se o `DashboardTab` usa `periodDays` nas queries e adicionar seletor visivel (7, 30, 90 dias)
- Verificar se `WhatsAppDashboard` tambem respeita o filtro

### 8. Busca global no CRM Kanban

- Adicionar campo de busca no topo do `KanbanBoard`
- Filtrar deals pelo nome do cliente ou telefone (`remote_jid`)
- Destacar cards que correspondem à busca

### 9. Histórico/log de mensagens automáticas

- Criar tabela `crm_auto_message_log` com: `id, deal_id, consultant_id, stage_key, remote_jid, customer_name, sent_at, status, message_preview`
- RLS: consultant vê apenas seus logs
- Na `crm-auto-progress`, gravar log após cada envio
- No frontend, adicionar aba "Histórico" no WhatsApp ou seção no dashboard

### 10. Webhook Evolution → Supabase

- Criar edge function `evolution-webhook/index.ts` que:
  - Recebe POST da Evolution API com mensagens recebidas
  - Valida payload, identifica consultant pela instance
  - Grava na tabela `conversations` como mensagem inbound
- O consultor precisa configurar a URL do webhook no painel da Evolution API (instruir no chat)

---

## Ordem de Implementação

1. Proteção de rota `/admin` (rapido, segurança)
2. Edge function `send-scheduled-messages` + cron
3. Vinculação `customer_id` na `crm-auto-progress`
4. Tabela `crm_auto_message_log` + logging na edge function
5. Webhook Evolution
6. Realtime notifications
7. Filtro de período no dashboard
8. Busca no Kanban
9. Export PDF
10. Refatoração CustomerManager

## Detalhes Técnicos

### Migrações SQL necessárias:
```sql
-- Tabela de log de mensagens automáticas
CREATE TABLE crm_auto_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  consultant_id uuid NOT NULL,
  stage_key text NOT NULL,
  remote_jid text,
  customer_name text,
  message_preview text,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_auto_message_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own logs" ON crm_auto_message_log
  FOR SELECT TO authenticated USING (consultant_id = auth.uid());
CREATE POLICY "Service insert logs" ON crm_auto_message_log
  FOR INSERT TO authenticated WITH CHECK (consultant_id = auth.uid());
```

### Novas Edge Functions:
- `send-scheduled-messages/index.ts`
- `evolution-webhook/index.ts`

### Novas dependências frontend:
- `jspdf` + `html2canvas` (para export PDF)

### Arquivos modificados:
- `src/pages/Admin.tsx` — proteção de rota refinada
- `src/components/whatsapp/CustomerManager.tsx` — refatorado em 4+ arquivos
- `src/components/admin/DashboardTab.tsx` — filtro período + export PDF
- `src/components/whatsapp/KanbanBoard.tsx` — busca global
- `src/hooks/useChats.ts` — Realtime subscription
- `supabase/functions/crm-auto-progress/index.ts` — vincular customer_id + logging

