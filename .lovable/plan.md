

## Remover filtro "Com Devolutiva"

### Análise
O filtro "Com Devolutiva" mostra clientes não-aprovados que têm devolutiva — esses já aparecem no filtro "Reprovados" (pois clientes com devolutiva são tipicamente reprovados). O filtro "Aprovado + Devolutiva" permanece, pois é o caso especial.

### Alterações em `src/components/whatsapp/BulkSendPanel.tsx`

1. **Remover `"devolutiva"` do tipo `StatusFilter`** (linha 28)
2. **Remover a condição `statusFilter === "devolutiva"`** da lógica de filtro (linha 78)
3. **Ajustar sub-filtro de categorias** para aparecer apenas quando `statusFilter === "approved_devolutiva"` (linhas 81, 247)
4. **Remover o botão "Com Devolutiva"** da barra de filtros na UI
5. **Ajustar `handleStatusFilter`** se necessário para não referenciar "devolutiva"

Resultado: barra de filtros fica `Todos | Aprovados | Reprovados | Pendentes | Aprovado + Devolutiva`

