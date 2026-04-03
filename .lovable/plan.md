

# Correção: Sincronização iGreen com proteção contra rate limit

## Problema
O portal iGreen retorna erro 429 com texto simples "Muitas tentativas de login, tente novamente mais tarde." — mas o código tenta fazer `JSON.parse` desse texto, falha silenciosamente, e mostra uma mensagem genérica. Além disso, não há proteção no frontend para evitar cliques repetidos.

## Correções

### 1. Edge Function — Detectar 429 antes do JSON parse
**Arquivo:** `supabase/functions/sync-igreen-customers/index.ts` (linhas 221-237)

Adicionar check para status 429 e texto "Muitas tentativas" ANTES do try/catch JSON:

```typescript
if (loginRes.status === 429 || errText.toLowerCase().includes("muitas tentativas")) {
  friendlyError = "Muitas tentativas de login no portal iGreen. Aguarde 10 minutos e tente novamente.";
} else {
  try { ... JSON parse ... } catch { }
}
```

### 2. Edge Function — Retry automático com delay
Se receber 429 na primeira tentativa, aguardar 30 segundos e tentar uma vez mais antes de retornar erro.

### 3. Frontend — Cooldown de 60s no botão
**Arquivos:** `DashboardTab.tsx` e `CustomerManager.tsx`

Após clicar em sincronizar, desabilitar o botão por 60 segundos com countdown visual ("Aguarde 45s...") usando `localStorage` para persistir entre reloads.

## Resultado
- Mensagem de erro clara quando o portal bloqueia
- Retry automático evita erros por timing
- Cooldown impede o usuário de disparar múltiplas tentativas

