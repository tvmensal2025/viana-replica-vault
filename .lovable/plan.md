

# Plano: Métricas de Clientes e kW no Dashboard

## O que será feito

### 1. Rótulos amigáveis nos cliques por botão
Substituir identificadores técnicos (`whatsapp_intermediate`, `whatsapp`, `cadastro`) por nomes legíveis com ícones.

### 2. Novos KPI Cards de Clientes
Adicionar ao topo do dashboard:
- **Total de Clientes** — contagem da tabela `customers` do consultor
- **Clientes por Status** — aprovados, pendentes, leads (badges coloridos)
- **Total kW (média consumo)** — soma de `media_consumo` de todos os clientes
- **Valor Total Contas** — soma de `electricity_bill_value` (formatado R$)

### 3. Gráfico de Consumo por Cliente
Um **BarChart horizontal** mostrando cada cliente (nome) e seu `media_consumo` em kW, ordenado do maior para o menor. Visualização rápida de quem consome mais energia.

### 4. Sugestões adicionais incluídas no plano
- **Taxa de conversão**: cliques / visualizações como percentual no stat card
- **Gráfico de novos clientes por semana**: AreaChart com clientes criados nos últimos 30 dias agrupados por semana
- **Distribuição de status**: PieChart (donut) com a proporção de clientes por status (aprovado/pendente/lead/rejeitado)

## Detalhes técnicos

### Hook `useAnalytics.ts`
- Adicionar query paralela à tabela `customers` filtrando por... Na verdade, `customers` não tem `consultant_id`. Preciso verificar como clientes são vinculados ao consultor.

Verificação necessária: a tabela `customers` não possui `consultant_id` diretamente. Os clientes são vinculados via `crm_deals.consultant_id` → `crm_deals.customer_id`.

### Arquivos impactados
1. **`src/hooks/useAnalytics.ts`** — adicionar fetch de `customers` (via join com `crm_deals`) e computar métricas
2. **`src/pages/Admin.tsx`** — adicionar KPI cards, gráfico de consumo por cliente, rótulos amigáveis, donut de status, taxa de conversão

### Estrutura dos novos dados no retorno do hook
```typescript
{
  // Existentes...
  // Novos:
  totalCustomers: number;
  customersByStatus: { status: string; count: number }[];
  totalKw: number;
  totalBillValue: number;
  customerConsumption: { name: string; consumo: number }[];
  weeklyNewCustomers: { week: string; count: number }[];
  conversionRate: number; // (totalClicks / total) * 100
}
```

### Lógica de vinculação cliente-consultor
Buscar `crm_deals` do consultor → extrair `customer_id`s → buscar `customers` com esses IDs. Ou, se RLS de `customers` for pública, buscar todos e filtrar pelo join.

Alternativa mais simples: como `customers` tem RLS pública e `crm_deals` filtra por `consultant_id`, fazer duas queries:
1. `crm_deals` WHERE `consultant_id = userId` → lista de `customer_id`
2. `customers` WHERE `id IN (...)` → dados dos clientes

### Layout visual
```text
┌─────────────┬──────────────┬──────────────┬──────────────┐
│ Total Views │ Total Cliques│ Tot Clientes │ Total kW     │
├─────────────┴──────────────┴──────────────┴──────────────┤
│ Cliques por Botão (rótulos amigáveis)                    │
├──────────────────────────────┬───────────────────────────┤
│ Consumo por Cliente (BarH)   │ Status Clientes (Donut)  │
├──────────────────────────────┴───────────────────────────┤
│ Visualizações — 30 dias (AreaChart existente)            │
├──────────────────────────────────────────────────────────┤
│ Novos Clientes por Semana (AreaChart)                    │
├─────────────┬──────────────┬────────────────────────────┤
│ Horários    │ Dispositivos │ Origem Tráfego             │
└─────────────┴──────────────┴────────────────────────────┘
```

