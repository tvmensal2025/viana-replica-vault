

# Plano: Exportação Excel Completa — Nunca Faltar Nenhum Campo

## Problema Identificado

O sistema possui **2 exportações diferentes** com dados incompletos:

1. **Exportar Excel** (painel de clientes do consultor) — exporta apenas 20 colunas, faltam **15 campos** que existem no banco de dados.
2. **Exportar CSV** (página WhatsApp Clients) — exporta 16 colunas, faltam ainda mais campos.

### Campos que estão faltando na exportação Excel:

| Campo | Coluna no Banco |
|-------|----------------|
| RG | `rg` |
| Data Nascimento | `data_nascimento` |
| Rua | `address_street` |
| Número | `address_number` |
| Complemento | `address_complement` |
| Bairro | `address_neighborhood` |
| CEP | `cep` |
| Nº Instalação | `numero_instalacao` |
| Valor Conta | `electricity_bill_value` |
| Desconto Cliente | `desconto_cliente` |
| Código Licenciado | `registered_by_igreen_id` |
| Data Ativo | `data_ativo` |
| Data Validado | `data_validado` |
| Status Financeiro | `status_financeiro` |
| Nível Licenciado | `nivel_licenciado` |
| Assinatura Cliente | `assinatura_cliente` |
| Assinatura iGreen | `assinatura_igreen` |
| Link Assinatura | `link_assinatura` |
| Tipo Produto | `tipo_produto` |

## Plano de Implementação

### 1. Atualizar exportação Excel principal (`CustomerImportExport.tsx`)

Adicionar **todos os 35+ campos** na função `handleExport`, organizados por categoria:

- **Dados Pessoais**: Nome, CPF, RG, Email, Telefone, Data Nascimento
- **Endereço**: Rua, Número, Complemento, Bairro, Cidade, Estado, CEP
- **Energia**: Distribuidora, Nº Instalação, Consumo Médio, Valor Conta, Desconto Cliente
- **iGreen**: Código iGreen, Andamento, Devolutiva, Status Financeiro, Cashback, Nível Licenciado
- **Licenciado**: Licenciado, Código Licenciado
- **Indicação**: Indicado Por, Telefone Indicador
- **Assinaturas**: Assinatura Cliente, Assinatura iGreen, Link Assinatura
- **Datas**: Data Cadastro, Data Ativo, Data Validado
- **Produto**: Tipo Produto
- **Status**: Status, Observação

### 2. Atualizar exportação CSV (`WhatsAppClientsPage.tsx`)

Alinhar os mesmos campos da exportação Excel para consistência.

### 3. Garantir que a query busca todos os campos

Verificar que as queries de `SELECT` incluem todos os campos necessários (não excluem nenhum campo relevante).

## Resultado

O arquivo Excel exportado terá **todas as informações** do banco de dados, sem faltar nenhum campo. Será um mapa completo e idêntico ao que existe no sistema.

