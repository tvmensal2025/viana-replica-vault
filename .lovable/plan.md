

## Diagnóstico

Os logs do edge function mostram claramente o problema:

1. **`fetchInstances` sempre dá timeout** (15s) — a Evolution API é lenta demais para listar instâncias
2. **`instance/create` attempt 1** inicia com timeout de 120s, mas o **Supabase Edge Function tem limite hard de ~60s** e mata a função ("shutdown" nos logs) antes do timeout do código ser atingido
3. **Attempt 2** inicia com 45s mas também é cortado pelo shutdown do Supabase

O problema fundamental: **não adianta colocar timeout de 120s se o Supabase mata a edge function em ~60s**.

## Plano de Correção

### 1. Eliminar chamada `fetchInstances` no fluxo de conexão

A chamada `fetchInstances` **sempre** dá timeout (15s+ desperdiçados). Em vez disso, verificar apenas a instância salva no banco local (`whatsapp_instances`). Isso economiza 15s+ do budget de tempo.

**Arquivo:** `src/hooks/useWhatsApp.ts`
- Remover o bloco `fetchInstances()` + loop de reuse do `createAndConnect`
- Usar apenas a instância salva no Supabase (já verificada no `useEffect` de mount)
- Se já existe `instanceName` no state, tentar `tryGetQrFromExisting` direto

### 2. Reduzir todos os timeouts do proxy para caber no limite do Supabase

**Arquivo:** `supabase/functions/evolution-proxy/index.ts`
- `instance/create`: **50s** (máximo seguro dentro do limite de ~60s)
- `instance/connect/`: **15s**
- `connectionState`: **10s**
- `fetchInstances`: **12s**
- Default: **25s**
- Remover retry automático de `instance/create` (não há tempo para 2 tentativas)

### 3. Adicionar client-side timeout + retry no hook

**Arquivo:** `src/hooks/useWhatsApp.ts`
- `createInstance` com `withTimeout` de 55s no client
- Se timeout/504, esperar 3s e tentar `tryGetQrFromExisting` (a instância pode ter sido criada mesmo com timeout)
- Se recovery falhar, esperar mais 3s e tentar de novo (total 2 tentativas de recovery)

### 4. Redeploy da edge function

Após editar o proxy, redeploy com as novas configurações de timeout.

---

### Resumo das mudanças

```text
evolution-proxy/index.ts
├── Timeouts: create=50s, connect=15s, state=10s, fetch=12s, default=25s
├── Remover retry de instance/create (1 tentativa só)
└── Redeploy

useWhatsApp.ts
├── Remover fetchInstances() do createAndConnect
├── Usar instância local (whatsapp_instances) para reuse
├── Client timeout 55s + recovery com tryGetQrFromExisting
└── Fluxo mais enxuto e rápido
```

