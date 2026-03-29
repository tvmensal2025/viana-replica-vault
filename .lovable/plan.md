

# Plano: Resolver timeout e exibir QR Code

## Problema Raiz

Existem dois problemas distintos:

1. **Edge function desatualizada**: A resposta ainda mostra `"15000ms"` no erro, indicando que a versao antiga do `evolution-proxy` ainda esta ativa. Precisa ser reimplantada.

2. **A Evolution API esta demorando mais de 55 segundos para responder** ao `POST /instance/create`. Isso pode ser porque:
   - A URL configurada no secret `EVOLUTION_API_URL` pode estar usando `http://` em vez de `https://` (o servidor Evolution esta configurado para HTTPS)
   - A URL pode conter `/manager` no final, causando path incorreto
   - O servidor pode estar sobrecarregado com instancias antigas nao removidas

## Plano

### 1. Reimplantar edge function `evolution-proxy`
O codigo ja esta correto (55s timeout, mensagem sanitizada). So precisa ser redeployado para a versao atualizada entrar em vigor.

### 2. Verificar e corrigir o secret `EVOLUTION_API_URL`
Com base na configuracao do servidor que voce forneceu, a URL correta deve ser `https://igreen-evolution-api.0sw627.easypanel.host` (HTTPS, sem `/manager`, sem barra final). Preciso verificar o valor atual do secret e atualizar se necessario.

### 3. Verificar o secret `EVOLUTION_API_KEY`
O valor deve ser `429683C4C977415CAAFCCE10F7D57E11` (conforme `AUTHENTICATION_API_KEY` na configuracao que voce compartilhou).

### 4. Adicionar log da URL completa no proxy
Adicionar `console.log` da `EVOLUTION_API_URL` raw (valor real, nao so boolean) para diagnosticar se o valor do secret esta correto. Isso fica apenas nos logs do servidor, invisivel ao cliente.

### 5. Limpar instancias fantasma
Antes de criar uma nova instancia, o hook ja tenta deletar as anteriores. O problema e que se a Evolution API nao responde, essas delecoes tambem falham. Adicionar um fetch direto ao endpoint `instance/fetchInstances` para listar e limpar TODAS as instancias existentes no servidor.

## Detalhes Tecnicos

**Arquivo**: `supabase/functions/evolution-proxy/index.ts`
- Adicionar log do valor real (primeiros 30 chars) da `EVOLUTION_API_URL` para debug
- Reimplantar via Supabase CLI

**Arquivo**: `src/hooks/useWhatsApp.ts`
- Antes de `createInstance`, chamar `fetchInstances` para listar todas existentes e deletar cada uma
- Adicionar tratamento para timeout (504) com mensagem amigavel e sugestao de retry

