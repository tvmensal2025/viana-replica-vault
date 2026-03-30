

# Plano: Dashboard Premium com Métricas de Clientes

## O que será feito

O hook `useAnalytics` já calcula todos os dados necessários (totalCustomers, totalKw, totalBillValue, customersByStatus, customerConsumption, weeklyNewCustomers, conversionRate). Falta apenas renderizar no `Admin.tsx`.

### 1. Corrigir rótulos amigáveis nos cliques
A função `friendlyClickLabel` já existe mas não é usada na renderização. Aplicar na linha 221.

### 2. Novos KPI Cards (segunda fileira)
Adicionar abaixo dos stats existentes:
- **Total de Clientes** (ícone Users, cor verde)
- **Total kW** (ícone Zap, cor amarela)
- **Valor Total Contas** (ícone DollarSign, formatado R$)
- **Taxa de Conversão** (ícone TrendingUp, com %)

### 3. Gráfico de Consumo por Cliente (BarChart horizontal)
Card com barras horizontais mostrando `customerConsumption` (nome × kW), top 15, cores gradiente verde.

### 4. Donut de Status de Clientes (PieChart)
Card com gráfico pizza/donut mostrando distribuição por status (Aprovado, Pendente, Lead, Rejeitado) com cores distintas.

### 5. Novos Clientes por Semana (AreaChart)
Card com gráfico de área mostrando `weeklyNewCustomers` nos últimos 30 dias.

### Layout
```text
┌─────────────┬──────────────┬──────────────┬──────────────┐
│ Views       │ Pg Cliente   │ Pg Licenciado│ Cliques      │
├─────────────┼──────────────┼──────────────┼──────────────┤
│ Clientes    │ Total kW     │ Valor Contas │ Conversão    │
├─────────────┴──────────────┴──────────────┴──────────────┤
│ Cliques por Botão (rótulos amigáveis)                    │
├──────────────────────────────┬───────────────────────────┤
│ Consumo por Cliente (BarH)   │ Status Clientes (Donut)  │
├──────────────────────────────┴───────────────────────────┤
│ Visualizações 30 dias + Novos Clientes/Semana            │
├─────────────┬──────────────┬────────────────────────────┤
│ Horários    │ Dispositivos │ Origem Tráfego             │
└─────────────┴──────────────┴────────────────────────────┘
```

## Detalhes técnicos

**Arquivo único**: `src/pages/Admin.tsx`

Alterações:
1. **Linha 221**: Trocar `{target}` por `{friendlyClickLabel(target)}`
2. **Após linha 208**: Inserir segunda grade de KPI cards com dados de clientes
3. **Após seção cliques (linha 226)**: Inserir grid 2 colunas com BarChart horizontal + PieChart donut
4. **Antes do gráfico de comparativo diário**: Inserir AreaChart de novos clientes por semana
5. Formatar valores financeiros com `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`
6. Cores do donut: verde (approved), amarelo (pending), vermelho (rejected), azul (lead)

