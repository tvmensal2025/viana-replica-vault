

# Plan: Bloquear novos usuarios e corrigir WhatsApp "Recuperando"

## Problemas encontrados

### 1. Novos usuarios passam direto pela aprovacao
O `loadConsultant` tenta inserir um registro na tabela `consultants` com `approved: false` para novos usuarios. Porem:
- Se o insert falhar (ex: conflito de `license` UNIQUE), o catch so faz `setApproved(false)` mas nao cria o registro — o usuario fica sem registro e na proxima vez pode cair num estado inconsistente
- **Ha uma race condition**: tanto `onAuthStateChange` quanto `getSession` chamam `loadConsultant` simultaneamente, causando dois inserts paralelos que podem conflitar
- Se o insert falhar silenciosamente, o usuario pode ver brevemente o dashboard antes do estado se estabilizar

### 2. WhatsApp mostra "Recuperando" para novos usuarios  
No `init()`, quando `checkState` retorna "connecting" (que pode acontecer se a Evolution API retornar algo inesperado para uma instancia inexistente), o codigo entra no fluxo de recuperacao ao inves de mostrar "desconectado".

## Mudancas propostas

### Arquivo: `src/pages/Admin.tsx`
1. **Eliminar race condition**: Adicionar um `ref` ou flag para garantir que `loadConsultant` so executa uma vez, ignorando chamadas duplicadas de `onAuthStateChange` + `getSession`
2. **Tornar o insert mais robusto**: Usar `upsert` com `onConflict: 'id'` ao inves de `insert`, garantindo que o registro sempre e criado com `approved: false` mesmo se ja existir parcialmente
3. **Garantir bloqueio antes do render**: Manter `approved = false` como default e so mudar para `true` quando o DB retornar `approved: true` explicitamente

### Arquivo: `src/hooks/useWhatsApp.ts`
4. **No `init()`, tratar "connecting" como "disconnected" para instancias sem registro salvo**: Se nao existe registro em `whatsapp_instances` para o usuario, ir direto para desconectado ao inves de tentar recuperar — o estado "connecting" so deve ser tratado se o usuario JA tinha uma conexao antes
5. **Verificar registro no DB antes de tentar recuperar**: Consultar `whatsapp_instances` no init e, se nao existir, pular direto para `disconnected` sem chamar a Evolution API

## Resultado esperado
- Novo usuario cria conta → registro `approved: false` criado no DB → tela "Aguardando Aprovacao" → so acessa apos Super Admin aprovar
- WhatsApp nao tenta "recuperar" para usuarios que nunca conectaram

