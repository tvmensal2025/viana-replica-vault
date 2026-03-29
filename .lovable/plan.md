

# Plano: Corrigir Conexao WhatsApp + Diagnostico

## Analise dos Problemas Encontrados

1. **Instancia fantasma**: A Evolution API tem a instancia `igreen-0c2711ad-...` registrada, mas a tabela `whatsapp_instances` no Supabase esta VAZIA. O fluxo tenta criar, recebe 403, e o recovery nao consegue resolver porque nao deleta/recria.

2. **CORS incompletos**: A edge function `evolution-proxy` esta com headers CORS desatualizados (faltam `x-supabase-client-platform`, etc.), o que pode causar falhas silenciosas no preflight.

3. **Corpo do erro perdido**: `handleResponse` descarta o JSON de erro e so usa `statusText` ("Forbidden"), dificultando diagnostico.

4. **Sem reset automatico**: Quando ha conflito 403, o usuario quer que o sistema delete a instancia existente e recrie automaticamente, mas o fluxo atual so tenta reconectar.

5. **Sem visibilidade**: Nenhum feedback sobre qual etapa esta falhando (auth, proxy, create, state, connect).

## Plano de Implementacao

### 1. Atualizar CORS da Edge Function
**Arquivo**: `supabase/functions/evolution-proxy/index.ts`
- Adicionar headers CORS completos do Supabase
- Adicionar logging de debug (url montada, status retornado, path recebido) via `console.log`

### 2. Melhorar tratamento de erros no servico
**Arquivo**: `src/services/evolutionApi.ts`
- `handleResponse`: ler o body JSON antes de lançar o erro, incluindo a mensagem real da Evolution API
- Incluir status code na mensagem de erro para facilitar diagnostico

### 3. Implementar estrategia de reset automatico
**Arquivo**: `src/hooks/useWhatsApp.ts`
- Quando receber 403 ("already in use"), executar `deleteInstance(name)` primeiro
- Depois recriar com `createInstance(name)` 
- Manter o `ensureLocalAndConnect` como fallback caso o delete+create falhe
- Adicionar estado de `connectionLog` (array de strings) para rastrear cada etapa

### 4. Criar painel de diagnostico na UI
**Arquivo**: `src/components/whatsapp/ConnectionPanel.tsx`
- Adicionar prop `connectionLog: string[]` 
- Exibir lista de etapas executadas com timestamps durante o processo de conexao
- Mostrar icones de check/erro para cada etapa
- Visivel apenas durante loading ou erro

### 5. Conectar diagnostico ao WhatsAppTab
**Arquivo**: `src/components/whatsapp/WhatsAppTab.tsx`
- Passar `connectionLog` do hook para o `ConnectionPanel`

## Fluxo Corrigido

```text
Usuario clica "Conectar"
  |
  v
[1] createInstance(name)
  |-- Sucesso? -> upsert DB + exibir QR + polling
  |-- 403 "already in use"?
        |
        v
      [2] deleteInstance(name) -- reset automatico
        |
        v
      [3] createInstance(name) -- retry
        |-- Sucesso? -> upsert DB + exibir QR + polling
        |-- Falha? -> exibir erro detalhado
```

## Detalhes Tecnicos

- Edge function: atualizar `Access-Control-Allow-Headers` para incluir `x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version`
- `handleResponse`: fazer `await response.json()` antes de throw, usar `error.message` ou `error.response.message` do body
- `connectionLog` sera um `string[]` no state do hook, populado com entries tipo `"[10:28:45] Criando instancia..."`, `"[10:28:46] ✓ QR Code recebido"`
- O painel mostra max 10 linhas com scroll, fonte mono, fundo escuro

