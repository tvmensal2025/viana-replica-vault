

## Diagnóstico: Sincronização iGreen falhando

### Causa raiz

Os logs mostram claramente o problema. A API iGreen retorna o ID do consultor no campo **`idconsultor`**, mas o código só procura por `id`, `data.id`, `consultant.id`, `user.id`, etc. — nunca `idconsultor`.

Log da API:
```
Consultant API response keys: ["idconsultor","nome","cpf",...]
Consultant ID: undefined
```

O campo correto é `consultantData.idconsultor` (valor: `124170`).

### Correção

**Arquivo: `supabase/functions/sync-igreen-customers/index.ts`** (linha ~259)

Adicionar `consultantData.idconsultor` como primeira opção na cadeia de extração do ID:

```typescript
const consultorId = consultantData.idconsultor
  || consultantData.id 
  || consultantData.data?.id 
  || consultantData.consultant?.id 
  || consultantData.user?.id
  || consultantData.consultor?.id
  || consultantData._id
  || consultantData.data?._id
  || consultantData.uid
  || consultantData.userId
  || consultantData.user_id;
```

Depois, re-deploy da edge function.

Uma linha. Isso resolve o problema.

