

# Análise: Pessoa responsável pelo cashback (indicador) vs Licenciado

## Situação atual

O sistema já captura do portal iGreen dois campos relevantes:
- **`registered_by_name`** — nome do licenciado que cadastrou o cliente
- **`registered_by_igreen_id`** — código do licenciado no iGreen

Porém, no modelo de cashback da iGreen, quem **indicou** o cliente (e recebe o cashback) nem sempre é o mesmo licenciado que fez o cadastro. Essa informação hoje não é rastreada separadamente.

## O que a API iGreen fornece

Olhando o sync (`sync-igreen-customers`), os campos extraídos são:
- `licenciado` / `codigoLicenciado` → salvos como `registered_by_name` / `registered_by_igreen_id`
- `cashback` → salvo como texto

A API iGreen pode ou não fornecer um campo separado para o **indicador**. Precisamos verificar.

## Opções de implementação

### Opção A: Campo manual "Indicado por"

Adicionar dois campos na tabela `customers`:
- `referred_by_name TEXT` — nome de quem indicou
- `referred_by_phone TEXT` — telefone de quem indicou (para vincular)

**Prós:** Simples, funciona mesmo sem dados da API
**Contras:** Preenchimento manual

### Opção B: Vincular a outro consultor do sistema

Se o indicador também é um licenciado cadastrado no sistema, podemos usar:
- `referred_by_consultant_id UUID` → referência a `consultants.id`

Isso permitiria um **dashboard de indicações** mostrando quantos clientes cada pessoa trouxe e o cashback gerado.

**Prós:** Relatórios automáticos, rastreabilidade
**Contras:** Só funciona se o indicador estiver cadastrado no sistema

### Opção C: Híbrido (recomendado)

Combinar ambos:
- `referred_by_name TEXT` — sempre preenchido (manual ou via sync)
- `referred_by_phone TEXT` — telefone do indicador
- `referred_by_consultant_id UUID NULL` — preenchido automaticamente se o telefone/nome bater com um consultor cadastrado

Na tabela de clientes (CustomerManager), adicionar:
1. Coluna "Indicado por" na tabela
2. No modal de detalhes, campo editável para informar quem indicou
3. No sync iGreen, tentar extrair o campo de indicação se a API fornecer

### Visualização proposta

Na tela de clientes (screenshot que você enviou), adicionar uma coluna **"Indicado por"** ao lado de "Licenciado". No Kanban e nos relatórios, permitir filtrar por indicador.

Também seria possível criar uma **aba de Indicações/Cashback** no admin mostrando:
- Ranking de indicadores
- Total de clientes por indicador
- Valor estimado de cashback por indicador

## Próximos passos sugeridos

1. Verificar se a API iGreen retorna algum campo de "indicador" ou "quem trouxe" separado do licenciado
2. Escolher entre as opções A, B ou C
3. Implementar os campos e a UI

## Pergunta-chave

A informação de "quem trouxe o cliente" vem do portal iGreen (algum campo que ainda não estamos capturando) ou é algo que o licenciado preenche manualmente no seu sistema?

