

# Plano: Corrigir Todos os Erros de Build (8 erros em 5 arquivos)

## Resumo

Existem 8 erros de compilação que impedem o build. São todos erros de tipo — nenhum afeta lógica de negócio. Correções cirúrgicas, zero risco de quebra.

---

## Correção 1: `TIMEOUT_EVOLUTION` não exportado
**Arquivo**: `supabase/functions/_shared/utils.ts`
Adicionar `export const TIMEOUT_EVOLUTION = 20_000;` junto aos outros timeouts.

## Correção 2-3: `null` → `undefined` nas chamadas OCR
**Arquivo**: `supabase/functions/evolution-webhook/index.ts`
- Linha 207: `ocrContaEnergia(fileUrl, GEMINI_API_KEY, null, null)` → `ocrContaEnergia(fileUrl, GEMINI_API_KEY, undefined, undefined)`
- Linha 355: `null,` → `undefined,`

## Correção 4-5: Filtro `"whatsapp"` inexistente em CustomerManager
**Arquivo**: `src/components/whatsapp/CustomerManager.tsx`
Linhas 150-151: O tipo `Customer` não tem valor `"whatsapp"` em `tipo_produto` nem propriedade `whatsapp_instance_id`. Remover o case `"whatsapp"` do filtro ternário, mantendo apenas `"all"` e o filtro por `tipo_produto`.

## Correção 6: `"cadastro"` não aceito em useTrackView
**Arquivo**: `src/hooks/useTrackView.ts`
Alterar o tipo do parâmetro `pageType` para `"client" | "licenciada" | "cadastro"`.

## Correção 7-8: WhatsAppClientsPage usa AuthContext inexistente e query inválida
**Arquivo**: `src/pages/WhatsAppClientsPage.tsx`
- Remover import de `@/contexts/AuthContext` (não existe)
- Usar `supabase.auth.getUser()` para obter o usuário logado
- Buscar consultant por `id = auth.uid()` (não por `email`)
- Remover join `whatsapp_instances!inner` (não há FK entre customers e whatsapp_instances)
- Simplificar para `select("*")` com `.eq("consultant_id", user.id)`

---

## Detalhes Técnicos

```text
Arquivo                                          | Erros | Risco
-------------------------------------------------|-------|------
supabase/functions/_shared/utils.ts              |   1   | Zero
supabase/functions/evolution-webhook/index.ts     |   2   | Zero
src/components/whatsapp/CustomerManager.tsx       |   2   | Zero
src/hooks/useTrackView.ts                        |   1   | Zero
src/pages/WhatsAppClientsPage.tsx                |   3   | Zero
```

Nenhuma funcionalidade será alterada. Apenas tipos e imports serão corrigidos para o build compilar sem erros.

