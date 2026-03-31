

## Correção: Erro de gravação dos clientes sincronizados

### Situação atual
A sincronização com a API iGreen **já funciona**. O login, busca do ID do consultor (124170) e download dos 259 clientes estão OK. O problema é na gravação no banco: a coluna `data_nascimento` é `varchar(10)`, mas os dados do portal podem vir em formato mais longo (ex: "1993-07-20T00:00:00"), causando o erro `value too long for type character varying(10)` e falhando **todos** os 126 registros.

### Correção (2 passos)

**1. Migração SQL** — Alterar `data_nascimento` para `text` (sem limite), igual às outras colunas de data da tabela:
```sql
ALTER TABLE customers ALTER COLUMN data_nascimento TYPE text;
```

**2. Edge Function** — Adicionar truncamento de segurança no `buildRecord` para garantir que mesmo que venha com horário, só os primeiros 10 caracteres (YYYY-MM-DD) sejam salvos:
```typescript
if (nasc) record.data_nascimento = nasc.substring(0, 10);
```

### Resultado esperado
Os 126 clientes serão gravados com sucesso na próxima sincronização. Nenhuma outra mudança necessária — a API do iGreen está respondendo corretamente.

