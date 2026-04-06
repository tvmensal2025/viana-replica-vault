

# Refatoração do CustomerManager.tsx (1281 linhas → ~300 linhas)

Dividir o arquivo monolítico em 6 módulos especializados, sem alterar nenhum comportamento visual ou funcional.

---

## Estrutura Final

```text
src/components/whatsapp/
├── CustomerManager.tsx          (~300 linhas - orquestrador)
├── CustomerListItem.tsx         (~200 linhas - card expandível de cada cliente)
├── CustomerEditDialog.tsx       (~180 linhas - modal de edição)
├── CustomerImportExport.tsx     (~220 linhas - preview + importação Excel)
├── customerUtils.ts             (~120 linhas - funções utilitárias puras)
└── hooks/
    └── useCustomerDeals.ts      (~60 linhas - hook para buscar deals e stage dots)
```

---

## Divisão por Arquivo

### 1. `customerUtils.ts` (linhas 88-210 atuais)
Todas as funções puras sem dependência de React:
- `formatPhoneDisplay`, `formatCpfDisplay`, `getInitials`, `getStatusBadge`
- `normalizePhone`, `normalizeCustomerPhone`, `mapStatus`
- `safeString`, `safeNumber`, `findColumnValue`
- `buildWhatsAppMessage`, `isDevolutiva`, `buildCustomerData`
- `getStageDotsForCustomer`, `APPROVED_STAGES`, `REJECTED_STAGES`
- Interfaces `Customer`, `ParsedCustomer`, `StatusFilter`

### 2. `useCustomerDeals.ts` (linhas 239-273 atuais)
Hook que busca `crm_deals` e monta `dealsByCustomer` map.

### 3. `CustomerListItem.tsx` (linhas 859-1056 atuais)
Componente para um card de cliente com:
- Avatar + stage dots + badges
- Área expandida com `DetailItem` grid
- Botões de ação (WhatsApp, Copiar, Editar, Remover)
- Componentes auxiliares `SectionLabel` e `DetailItem` ficam aqui

### 4. `CustomerEditDialog.tsx` (linhas 1067-1182 atuais)
Dialog completo de edição com:
- Formulário com campos pessoais, endereço, indicação, energia
- CEP auto-complete via ViaCEP
- Lógica `handleSaveEdit`

### 5. `CustomerImportExport.tsx` (linhas 1184-1254 + 520-651 atuais)
- Preview dialog com seleção de clientes
- Lógica de parse do Excel (`handleFileSelected`)
- Lógica de confirmação e upsert em batch (`handleConfirmImport`)
- Barra de progresso de importação
- Botões Exportar e Importar Excel (extraídos do header)

### 6. `CustomerManager.tsx` (orquestrador)
Mantém apenas:
- State de busca, filtro, sync iGreen
- Header com botões (delegando ações aos sub-componentes)
- Filtro de status (clickable buttons)
- Lista renderizando `<CustomerListItem>` para cada cliente
- Composição dos dialogs

---

## O que NÃO muda
- Zero alterações visuais — a UI permanece idêntica
- Nenhuma tabela ou migração SQL necessária
- Nenhuma dependência nova

