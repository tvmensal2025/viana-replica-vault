

## Diagnóstico

Consultei os dados reais no banco. Os status atuais dos 295 clientes sincronizados:

```text
andamento_igreen          → status no CRM    | qtd
─────────────────────────────────────────────────
Validado                  → approved          | 106
Devolutiva                → rejected          | 74
Falta assinatura cliente  → pending           | 106
Aguardando validação      → pending           |   7
(null)                    → pending           |   2
```

**Nenhum cliente com andamento "Reprovado" está sendo marcado como "Pendente"** — o mapeamento `reprovado → rejected` funciona. O que acontece é:

1. **"Falta assinatura cliente"** (106 clientes) está mapeado como `pending`, mas na prática é uma devolutiva/pendência ativa que precisa de ação do cliente
2. O filtro "Pendentes" mistura clientes aguardando validação com clientes que faltam assinar — são situações diferentes

## Fluxo atual de sincronização com iGreen

```text
1. Edge Function "sync-igreen-customers" é chamada (manual ou agendada)
2. Faz login na API iGreen (email/senha do portal)
3. Busca dados via GET /customer-map/{consultorId}
4. Mapeia campos (nome, celular, andamento, devolutiva, etc.)
5. Upsert na tabela "customers" usando phone_whatsapp como chave
6. Status é derivado do campo "andamento" via mapStatus()
```

## Plano de Melhoria

### 1. Refinar mapeamento de status — mais granular

Criar status intermediário `awaiting_signature` para "Falta assinatura cliente" em vez de agrupar tudo como `pending`:

| andamento iGreen | status no CRM | label na UI |
|---|---|---|
| Validado / Aprovado / Ativo | approved | Aprovado |
| Devolutiva | rejected | Devolutiva |
| Reprovado / Cancelado | rejected | Reprovado |
| Falta assinatura cliente | awaiting_signature | Falta Assinatura |
| Aguardando validação | pending | Pendente |
| (outros/null) | pending | Pendente |

### 2. Atualizar filtros do CustomerManager

Adicionar aba "Falta Assinatura" nos filtros de status, separando dos pendentes genéricos.

### 3. Separar "Devolutiva" de "Reprovado" no mapeamento

Atualmente ambos mapeiam para `rejected`. Criar status `devolutiva` para diferenciar (devolutiva = precisa corrigir algo, reprovado = definitivo).

| andamento | status |
|---|---|
| Devolutiva | devolutiva |
| Reprovado / Cancelado | rejected |

### 4. Adicionar campo `andamento_igreen` visível na listagem

O campo já é salvo no banco mas pode ser exibido de forma mais proeminente para o consultor ver o status real do iGreen.

### Arquivos a modificar

1. **`supabase/functions/sync-igreen-customers/index.ts`** — atualizar `mapStatus()` com novos status (`awaiting_signature`, `devolutiva`)
2. **`src/components/whatsapp/CustomerManager.tsx`** — adicionar novos filtros, badges e labels para os status granulares
3. **Migração SQL** — re-sincronizar status dos clientes existentes com o novo mapeamento

### Detalhes Técnicos

Nova função `mapStatus`:
```typescript
function mapStatus(andamento: string | undefined): string {
  if (!andamento) return "pending";
  const lower = andamento.toLowerCase().trim();
  if (lower === "validado" || lower === "aprovado" || lower === "ativo") return "approved";
  if (lower === "devolutiva") return "devolutiva";
  if (lower === "reprovado" || lower === "cancelado") return "rejected";
  if (lower.includes("falta assinatura")) return "awaiting_signature";
  if (lower.includes("aguardando")) return "pending";
  if (lower === "pendente" || lower === "em análise") return "pending";
  if (lower === "lead" || lower === "novo") return "lead";
  if (lower === "dados completos") return "data_complete";
  if (lower === "registrado") return "registered_igreen";
  if (lower === "contrato enviado") return "contract_sent";
  return "pending";
}
```

Migração SQL para atualizar registros existentes:
```sql
UPDATE customers SET status = 'awaiting_signature' 
  WHERE andamento_igreen ILIKE '%falta assinatura%';
UPDATE customers SET status = 'devolutiva' 
  WHERE andamento_igreen ILIKE 'devolutiva';
```

Novos badges no CustomerManager:
- `awaiting_signature` → "Falta Assinatura" (laranja)
- `devolutiva` → "Devolutiva" (vermelho)
- `rejected` → "Reprovado" (vermelho escuro)

