

## Filtro multi-licenciado no Envio em Massa

### Problema atual
1. O filtro de licenciado só permite selecionar **um** de cada vez (usa `Select` single-value)
2. Bug existente: `licenciadoFilter` está **ausente** do array de dependências do `useMemo` (linha 88), o que pode causar filtragem desatualizada
3. Ao trocar status, o filtro de licenciado é resetado — isso deve continuar funcionando com multi-seleção

### Plano de implementação

**Arquivo**: `src/components/whatsapp/BulkSendPanel.tsx`

1. **Trocar estado de `string` para `Set<string>`**
   - `licenciadoFilter` passa de `useState<string>("all")` para `useState<Set<string>>(new Set())`
   - Set vazio = "todos os licenciados" (sem filtro)

2. **Substituir `Select` por lista de checkboxes com dropdown**
   - Usar um `Popover` + lista de `Checkbox` para cada licenciado
   - Mostrar no trigger quantos estão selecionados (ex: "3 licenciados" ou "Todos os licenciados")
   - Botões "Selecionar Todos" e "Limpar" no topo do popover

3. **Atualizar lógica de filtro**
   - `if (licenciadoFilter.size > 0)` → filtra clientes cujo `registered_by_name` está no Set
   - Adicionar `licenciadoFilter` no array de dependências do `useMemo`

4. **Corrigir reset ao trocar status**
   - `handleStatusFilter` reseta para `new Set()` em vez de `"all"`

### Detalhes técnicos
- Componentes já disponíveis: `Popover`, `PopoverTrigger`, `PopoverContent` de `@/components/ui/popover`, `Checkbox` de `@/components/ui/checkbox`
- Nenhuma dependência nova necessária
- Corrige o bug de dependência do `useMemo` que existe hoje

