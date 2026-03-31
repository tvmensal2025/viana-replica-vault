

## Problema Identificado

No `useAnalytics.ts`, linha 115, os KPIs e o gráfico de "Status dos Clientes" usam apenas clientes que têm deals no CRM:

```
const customers = allCustomers.filter((c) => customerIds.includes(c.id));
```

Isso filtra a maioria dos clientes. O gráfico de "Licenciados" já usa `allCustomers` corretamente, por isso mostra dados. Os KPIs (Total de Clientes, Total kW, Status) mostram 0 porque dependem da variável `customers` filtrada.

## Plano

### 1. Usar `allCustomers` para TODOS os KPIs e gráficos

**Arquivo:** `src/hooks/useAnalytics.ts`

- Remover a linha 115 (`const customers = allCustomers.filter(...)`) 
- Substituir todas as referências a `customers` por `allCustomers` nas métricas de:
  - `totalCustomers` (linha 186)
  - `customersByStatus` (linhas 190-206)
  - `totalKw` / `avgKw` (linhas 209-211)
  - `weeklyNewCustomers` (linha 234)
- Manter a variável `deals` disponível para uso futuro, mas não filtrar clientes por ela

### 2. Adicionar mais status ao mapeamento de labels

Atualmente só mapeia 4 status (`approved`, `pending`, `rejected`, `lead`). A tabela `customers` tem mais status possíveis: `data_complete`, `registered_igreen`, `contract_sent`. Adicionar labels em português para todos.

### 3. Adicionar filtro por licenciado no dashboard

**Arquivo:** `src/pages/Admin.tsx`

- Adicionar um dropdown/select acima da seção "Clientes iGreen" que lista os licenciados (extraídos de `registered_by_name`)
- Opções: "Todos" (padrão) + cada licenciado
- Quando filtrado, os KPIs, status chart e weekly chart refletem apenas clientes daquele licenciado
- O gráfico de "Top Licenciados" sempre mostra todos (para manter o ranking visível)

### Detalhes Técnicos

- O filtro será client-side (os dados já estão carregados via `allCustomers`)
- Novo state `selectedLicenciado` no Admin.tsx com valor `"all"` como padrão
- Derivar `filteredCustomers` a partir dos dados do analytics, aplicando o filtro de licenciado
- Recalcular KPIs localmente no componente quando filtro muda (sem nova query ao Supabase)

