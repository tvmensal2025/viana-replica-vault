

# Análise Completa do Sistema iGreen + Sugestões de Melhorias

## Estado Atual

O sistema é um painel administrativo para consultores de energia solar com: landing pages (cliente/licenciada), dashboard de analytics, integração WhatsApp via Evolution API, CRM Kanban, envio em massa, templates, agendamentos, gestão de clientes e sincronização com portal iGreen. Stack: React 18 + Supabase + Evolution API.

---

## Melhorias Seguras (sem risco de quebrar o sistema)

### 1. Refatorar Admin.tsx (1450 linhas → componentes menores)

O arquivo `Admin.tsx` concentra TODA a lógica do painel em um único arquivo de 1450 linhas. Isso dificulta manutenção e aumenta risco de bugs.

**Proposta:** Extrair cada aba em componente próprio:
- `DashboardTab.tsx` — KPIs, gráficos, filtros
- `LinksTab.tsx` — links UTM, QR codes
- `DadosTab.tsx` — formulário de dados do consultor
- `PreviewTab.tsx` — iframe de preview

O `Admin.tsx` ficaria apenas com auth + navegação entre abas (~200 linhas).

### 2. Dashboard WhatsApp (nova sub-aba)

Conforme os requisitos já documentados em `.kiro/specs/whatsapp-dashboard-metrics/requirements.md`, adicionar uma sub-aba "Dashboard" como primeira opção na aba WhatsApp, mostrando:
- KPIs: total clientes, aprovados/pendentes/reprovados
- Métricas financeiras (soma/média electricity_bill_value)
- Gráfico de deals por estágio do Kanban
- Contagem de templates e mensagens agendadas (pendentes/enviadas)
- Gráfico de novos clientes por semana

### 3. Notificações de Novas Mensagens

Atualmente não há indicação visual de mensagens novas quando o consultor está em outra aba.

**Proposta:** Badge com contador no tab "WhatsApp" mostrando total de mensagens não lidas, usando os dados já disponíveis no `useChats` (campo `unreadCount`).

### 4. Exportar Clientes para Excel

A funcionalidade de importar Excel já existe, mas não há exportação. Adicionar botão "Exportar Excel" na sub-aba Clientes que gera planilha com todos os campos do cliente usando a lib `xlsx` já instalada.

### 5. Filtro de Período no Dashboard

O dashboard principal mostra apenas dados dos últimos 30 dias fixos. Adicionar seletor de período (7 dias / 15 dias / 30 dias / 90 dias) para todas as métricas e gráficos.

### 6. Busca Global de Clientes no Chat

Quando o consultor quer enviar mensagem para um cliente que ainda não tem conversa, precisa ir até a sub-aba "Clientes". Adicionar campo de busca no topo do `ChatSidebar` que também pesquise na tabela `customers` e permita iniciar conversa direto.

### 7. Indicador de Status da Conexão WhatsApp no Header

Adicionar um pequeno dot (verde/vermelho) ao lado do ícone WhatsApp na navegação principal para o consultor saber se está conectado sem precisar entrar na aba.

### 8. Melhorar Responsividade Mobile do Dashboard

Os gráficos atuais usam alturas fixas e margens que não se adaptam bem em telas pequenas. Ajustar para que KPI cards fiquem em 1 coluna no mobile e gráficos tenham altura proporcional.

---

## Detalhes Técnicos

| Melhoria | Arquivos | Risco | Complexidade |
|----------|----------|-------|-------------|
| 1. Refatorar Admin | Admin.tsx → 4 novos componentes | Baixo | Médio |
| 2. Dashboard WhatsApp | WhatsAppTab.tsx + novo componente | Baixo | Médio |
| 3. Badge mensagens | Admin.tsx + useChats | Muito baixo | Baixo |
| 4. Exportar Excel | CustomerManager.tsx | Muito baixo | Baixo |
| 5. Filtro período | Admin.tsx + useAnalytics | Baixo | Baixo |
| 6. Busca clientes no chat | ChatSidebar.tsx | Baixo | Baixo |
| 7. Status dot WhatsApp | Admin.tsx | Muito baixo | Muito baixo |
| 8. Responsividade | Admin.tsx (CSS only) | Muito baixo | Baixo |

Todas as melhorias são aditivas — nenhuma remove funcionalidade existente ou altera fluxos críticos (auth, envio de mensagens, sincronização iGreen).

