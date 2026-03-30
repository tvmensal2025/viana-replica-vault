

# Plano: Importação de Excel (.xlsx) do Mapa de Clientes iGreen

## O que será feito

Adicionar um botão **"Importar Excel"** na tela de Clientes que aceita o arquivo `.xlsx` exportado do portal iGreen (`escritorio.igreenenergy.com.br/mapa-clientes`) e importa/atualiza os clientes no banco de dados.

## Colunas do Excel iGreen (confirmadas pelo arquivo enviado)

| Coluna Excel | Campo no banco (`customers`) |
|---|---|
| Nome do Cliente | `name` |
| Consumo Médio | `media_consumo` |
| Celular | `phone_whatsapp` |
| Documento | `cpf` |
| Instalação | `numero_instalacao` |
| Cidade | `address_city` |
| UF | `address_state` |
| Distribuidora | `distribuidora` |
| E-mail | `email` |
| Desconto Cliente | `desconto_cliente` |
| Data Nascimento | `data_nascimento` |
| Andamento | `status` (mapeado) |
| Código | usado como referência |

## Fluxo do usuário

1. Clica em **"Importar Excel"** (botão ao lado de "Adicionar Cliente")
2. Seleciona o arquivo `.xlsx`
3. Sistema lê no browser com a lib `xlsx` (SheetJS)
4. Para cada linha: upsert em `customers` por `phone_whatsapp` (evita duplicatas)
5. Clientes novos ganham um `crm_deals` vinculado ao consultor com stage `novo_lead`
6. Exibe resumo: X novos, Y atualizados, Z erros

## Detalhes técnicos

### Dependência
- Instalar `xlsx` (SheetJS) para parse de Excel no browser

### Arquivos modificados
1. **`src/components/whatsapp/CustomerManager.tsx`**
   - Adicionar botão "Importar Excel" com ícone Upload
   - Criar dialog com input de arquivo `.xlsx`
   - Lógica de parse: ler sheet, mapear colunas, normalizar telefone
   - Upsert em `customers` por `phone_whatsapp`
   - Criar `crm_deals` para clientes novos
   - Progress bar + toast com resumo

### Mapeamento de status (Andamento → status)
- "Validado" → `approved`
- "Devolutiva" → `rejected`
- Qualquer outro → `pending`

### Normalização do telefone
- Remover formatação: `(19) 98609-3713` → `5519986093713`
- Prefixar `55` se não tiver código do país

