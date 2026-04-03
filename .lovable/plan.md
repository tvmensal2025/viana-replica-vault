

# Redesign do Dashboard WhatsApp — Versão Profissional

## Problema

O dashboard atual repete informações que já existem no dashboard principal (total clientes, aprovados, valor contas, novos por semana) e mostra métricas pouco úteis (total templates). Precisa ter foco exclusivo em **operações WhatsApp**.

## Novo Layout Proposto

### Linha 1 — KPIs de Operação WhatsApp (4 cards)
- **Conversas Ativas** — total de chats com mensagens nos últimos 7 dias
- **Tempo Médio de Resposta** — tempo médio entre mensagem recebida e resposta do consultor
- **Mensagens Enviadas (período)** — total de mensagens enviadas nos últimos 7/30 dias
- **Taxa de Resposta** — % de conversas respondidas vs recebidas

### Linha 2 — Dois painéis lado a lado
- **Funil do CRM** (esquerda) — gráfico de funil vertical mostrando deals por estágio com gradiente de cores, incluindo % de conversão entre etapas
- **Mensagens por Dia** (direita) — gráfico de área mostrando volume de mensagens enviadas/recebidas por dia nos últimos 14 dias (dados da tabela `conversations`)

### Linha 3 — Dois painéis lado a lado
- **Agendamentos** (esquerda) — mini timeline mostrando próximas 5 mensagens agendadas com horário e destinatário
- **Top Contatos** (direita) — lista dos 5 contatos com mais interações recentes

## Fontes de Dados

- **Conversas/Mensagens**: tabela `conversations` (já tem `message_direction`, `created_at`, `customer_id`)
- **CRM Deals**: tabela `crm_deals` + `kanban_stages` (já usado)
- **Agendamentos**: tabela `scheduled_messages` (já usado)
- **Clientes**: tabela `customers` para nomes dos contatos

## Detalhes Técnicos

- Arquivo: `src/components/whatsapp/WhatsAppDashboard.tsx` — reescrita completa
- Consultas paralelas com `useQuery` para cada seção
- Skeletons durante carregamento
- Recharts para gráficos (já instalado)
- Cálculo de tempo de resposta: diferença entre mensagem `inbound` e próxima `outbound` na mesma conversa
- Responsivo: 1 coluna mobile, 2 colunas desktop

