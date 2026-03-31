

# Excluir 3 Templates e Manter os Demais

## O que será feito

Deletar os 3 templates do banco de dados:

| Template | ID | Tipo |
|---|---|---|
| Boa Noite | `ae113190-...` | Texto |
| Pai Boa Noite | `b2eeaa9e-...` | Imagem |
| Bom Dia | `9104ad25-...` | Imagem |

**Templates que permanecem** (4 áudios):
- Fatura com Debito em aberto
- Fatura Ilegivel
- Cadastro aprovado
- Cadastrado reprovado

## Execução

Criar uma migration SQL que deleta os 3 registros pelo ID:

```sql
DELETE FROM message_templates 
WHERE id IN (
  'ae113190-c0cb-49f9-b909-766d96ee7ac8',
  'b2eeaa9e-3ba8-45a4-a9fd-7da4f431ddb1',
  '9104ad25-833f-4576-9058-22fff8e4298b'
);
```

Nenhuma alteração de código é necessária — apenas a exclusão dos dados.

