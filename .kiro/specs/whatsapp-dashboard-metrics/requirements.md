# Documento de Requisitos — Dashboard de Métricas WhatsApp

## Introdução

O painel administrativo do consultor possui uma aba "WhatsApp" que atualmente exibe apenas o status de conexão e sub-abas operacionais (Conversas, CRM, Envio em Massa, Templates, Agendamentos, Clientes), sem nenhuma visão consolidada de métricas. Este documento especifica os requisitos para uma nova sub-aba "Dashboard" que será a primeira visível ao abrir a aba WhatsApp, apresentando indicadores-chave (KPIs), gráficos e resumos financeiros para que o consultor tenha uma visão completa e imediata do seu desempenho.

Adicionalmente, os rótulos de cliques no dashboard principal (ex: "Whatsapp_intermediate") devem ser substituídos por nomes amigáveis ao usuário.

## Glossário

- **Dashboard_WhatsApp**: Nova sub-aba "Dashboard" dentro da aba WhatsApp do painel administrativo, exibindo métricas consolidadas.
- **Consultor**: Usuário autenticado que gerencia clientes, mensagens e deals via painel administrativo.
- **KPI_Card**: Componente visual que exibe um indicador numérico com ícone, rótulo e valor formatado.
- **Sistema**: O painel administrativo do consultor (frontend React + Supabase).
- **Tabela_Customers**: Tabela `customers` no Supabase contendo dados de clientes (name, phone_whatsapp, status, electricity_bill_value, created_at).
- **Tabela_CRM_Deals**: Tabela `crm_deals` no Supabase contendo deals do Kanban (stage, consultant_id, approved_at, created_at).
- **Tabela_Scheduled_Messages**: Tabela `scheduled_messages` no Supabase contendo mensagens agendadas (status, scheduled_at, sent_at).
- **Tabela_Message_Templates**: Tabela `message_templates` no Supabase contendo templates de mensagem (name, content, created_at).
- **Tabela_Kanban_Stages**: Tabela `kanban_stages` no Supabase contendo estágios do Kanban (stage_key, label, auto_message_enabled).
- **Recharts**: Biblioteca de gráficos já instalada no projeto, utilizada no dashboard principal para visualizações de page_views.

## Requisitos

### Requisito 1: Sub-aba Dashboard como padrão

**User Story:** Como consultor, quero que a aba WhatsApp abra diretamente no Dashboard de métricas, para que eu tenha uma visão geral imediata ao acessar a seção.

#### Critérios de Aceitação

1. WHEN o Consultor abre a aba WhatsApp e a conexão está ativa, THE Dashboard_WhatsApp SHALL ser exibido como a primeira sub-aba selecionada.
2. THE Dashboard_WhatsApp SHALL aparecer como o primeiro item na lista de sub-abas, antes de "Conversas".
3. THE Dashboard_WhatsApp SHALL exibir um ícone de gráfico de barras e o rótulo "Dashboard".

### Requisito 2: KPIs de Clientes

**User Story:** Como consultor, quero ver a quantidade total de clientes e a distribuição por status, para acompanhar minha carteira de clientes rapidamente.

#### Critérios de Aceitação

1. THE Dashboard_WhatsApp SHALL exibir um KPI_Card com o total de clientes cadastrados na Tabela_Customers do Consultor.
2. THE Dashboard_WhatsApp SHALL exibir KPI_Cards separados para cada status de cliente: aprovados (status = "approved"), pendentes (status = "pending"), reprovados (status = "rejected") e leads (status = "lead").
3. WHEN a Tabela_Customers não contém registros, THE Dashboard_WhatsApp SHALL exibir o valor "0" em cada KPI_Card de clientes.
4. THE Dashboard_WhatsApp SHALL exibir um gráfico de pizza (PieChart) mostrando a distribuição percentual de clientes por status, utilizando Recharts.

### Requisito 3: Métricas Financeiras

**User Story:** Como consultor, quero ver o valor total e a média das contas de energia dos meus clientes, para entender o potencial financeiro da minha carteira.

#### Critérios de Aceitação

1. THE Dashboard_WhatsApp SHALL exibir um KPI_Card com o valor total somado do campo electricity_bill_value de todos os clientes na Tabela_Customers do Consultor.
2. THE Dashboard_WhatsApp SHALL exibir um KPI_Card com o valor médio do campo electricity_bill_value, calculado apenas entre clientes que possuem valor preenchido (electricity_bill_value > 0).
3. THE Dashboard_WhatsApp SHALL formatar valores financeiros no padrão brasileiro (R$ X.XXX,XX).
4. WHEN nenhum cliente possui electricity_bill_value preenchido, THE Dashboard_WhatsApp SHALL exibir "R$ 0,00" nos KPI_Cards financeiros.

### Requisito 4: Métricas do CRM (Deals por Estágio)

**User Story:** Como consultor, quero ver quantos deals tenho em cada estágio do Kanban, para acompanhar o funil de vendas.

#### Critérios de Aceitação

1. THE Dashboard_WhatsApp SHALL exibir um gráfico de barras horizontais mostrando a quantidade de deals por estágio, consultando a Tabela_CRM_Deals e a Tabela_Kanban_Stages do Consultor.
2. THE Dashboard_WhatsApp SHALL utilizar os labels definidos na Tabela_Kanban_Stages para nomear cada barra do gráfico.
3. THE Dashboard_WhatsApp SHALL utilizar as cores definidas na Tabela_Kanban_Stages para colorir cada barra correspondente.
4. WHEN a Tabela_CRM_Deals não contém registros, THE Dashboard_WhatsApp SHALL exibir o gráfico vazio com uma mensagem "Nenhum deal cadastrado".

### Requisito 5: Métricas de Templates

**User Story:** Como consultor, quero ver quantos templates de mensagem tenho cadastrados, para saber se preciso criar mais.

#### Critérios de Aceitação

1. THE Dashboard_WhatsApp SHALL exibir um KPI_Card com o total de templates cadastrados na Tabela_Message_Templates do Consultor.

### Requisito 6: Métricas de Mensagens Agendadas

**User Story:** Como consultor, quero ver o status das minhas mensagens agendadas, para saber quantas foram enviadas e quantas estão pendentes.

#### Critérios de Aceitação

1. THE Dashboard_WhatsApp SHALL exibir um KPI_Card com o total de mensagens agendadas na Tabela_Scheduled_Messages do Consultor.
2. THE Dashboard_WhatsApp SHALL exibir um KPI_Card com a quantidade de mensagens agendadas com status "pending".
3. THE Dashboard_WhatsApp SHALL exibir um KPI_Card com a quantidade de mensagens agendadas com status "sent".

### Requisito 7: Gráfico de Novos Clientes ao Longo do Tempo

**User Story:** Como consultor, quero ver a tendência de novos clientes cadastrados por semana, para entender o crescimento da minha carteira.

#### Critérios de Aceitação

1. THE Dashboard_WhatsApp SHALL exibir um gráfico de área (AreaChart) mostrando a quantidade de novos clientes cadastrados por semana nos últimos 30 dias, utilizando o campo created_at da Tabela_Customers.
2. THE Dashboard_WhatsApp SHALL utilizar o mesmo estilo visual (cores, tooltips, grid) do dashboard principal de page_views já existente no Sistema.
3. WHEN não existem clientes cadastrados nos últimos 30 dias, THE Dashboard_WhatsApp SHALL exibir o gráfico com valores zerados.

### Requisito 8: Estilo Visual Consistente

**User Story:** Como consultor, quero que o dashboard WhatsApp siga o mesmo padrão visual do dashboard principal, para ter uma experiência coesa.

#### Critérios de Aceitação

1. THE Dashboard_WhatsApp SHALL utilizar os mesmos componentes de card (rounded-2xl, border, bg-card) do dashboard principal do Sistema.
2. THE Dashboard_WhatsApp SHALL utilizar a mesma paleta de cores para gráficos Recharts (gradientes, tooltips, eixos) do dashboard principal do Sistema.
3. THE Dashboard_WhatsApp SHALL ser responsivo, adaptando o layout de KPI_Cards para 2 colunas em telas pequenas e 4 colunas em telas maiores.

### Requisito 9: Rótulos Amigáveis nos Cliques do Dashboard Principal

**User Story:** Como consultor, quero que os rótulos de cliques no dashboard principal (ex: "Whatsapp_intermediate") sejam substituídos por nomes legíveis, para entender facilmente o que cada botão representa.

#### Critérios de Aceitação

1. WHEN o dashboard principal exibe cliques por botão (clicksByTarget), THE Sistema SHALL substituir identificadores técnicos (ex: "Whatsapp_intermediate", "cadastro_cta") por rótulos amigáveis em português (ex: "WhatsApp", "Botão de Cadastro").
2. THE Sistema SHALL manter um mapeamento de rótulos amigáveis para cada event_target conhecido.
3. IF um event_target não possui mapeamento definido, THEN THE Sistema SHALL exibir o event_target original com formatação capitalize.

### Requisito 10: Carregamento de Dados do Dashboard

**User Story:** Como consultor, quero que os dados do dashboard carreguem de forma eficiente, para não esperar muito ao abrir a aba.

#### Critérios de Aceitação

1. THE Dashboard_WhatsApp SHALL carregar todos os dados necessários (clientes, deals, templates, mensagens agendadas, estágios) em consultas paralelas ao Supabase.
2. WHILE os dados estão sendo carregados, THE Dashboard_WhatsApp SHALL exibir skeletons de carregamento nos KPI_Cards e gráficos.
3. IF uma consulta ao Supabase falhar, THEN THE Dashboard_WhatsApp SHALL exibir os dados disponíveis das consultas bem-sucedidas e indicar erro apenas na seção afetada.
