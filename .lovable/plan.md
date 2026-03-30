

## Plano: Ranking de Licenciados que mais cadastram clientes (direto)

### Resumo
Substituir o gráfico "Consumo por Cliente" por um **ranking dos licenciados diretos que mais cadastraram contas**. Será necessário adicionar um campo `referred_by` na tabela `consultants` para identificar quem indicou cada licenciado (apenas 1 nível, sem árvore).

### Mudanças

**1. Migração SQL**
- Adicionar coluna `referred_by UUID REFERENCES consultants(id)` na tabela `consultants`
- Apenas vínculo direto (1 nível), sem recursão ou árvore

**2. Hook `useAnalytics.ts`**
- Remover `customerConsumption` (ranking de consumo kW)
- Adicionar query: buscar consultores onde `referred_by = consultantId`, e para cada um contar seus `crm_deals`
- Retornar array `topLicenciados: { name: string, deals: number }[]` ordenado por deals (desc), top 15

**3. Dashboard `Admin.tsx`**
- Substituir o bloco "Consumo por Cliente" pelo novo gráfico "Top Licenciados por Cadastros"
- Mesmo estilo visual (barras horizontais, cores verdes, fundo escuro)
- Ícone e título atualizados: "🏆 Licenciados — Cadastros"
- Tooltip mostrando quantidade de contas cadastradas

### Observação
Após a migração, o campo `referred_by` estará vazio para consultores existentes. O gráfico ficará vazio até que os vínculos sejam preenchidos (via SQL direto ou futuro painel de gestão).

