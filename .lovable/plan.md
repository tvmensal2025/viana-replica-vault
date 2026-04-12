

# Corrigir: CNH Pula Verso do Documento

## Situação
- **Procurador**: Já está automático (`possui_procurador = false`, linha 895 do webhook). Correto.
- **Débitos**: Já está automático (`debitos_aberto = false`, linha 897 do webhook). Correto.
- **CNH verso**: Bug real. O `getNextMissingStep` sempre exige `document_back_url`, mesmo quando o cliente enviou CNH (que só tem frente).

## Correção (1 arquivo)

### `supabase/functions/_shared/conversation-helpers.ts`
Linha 72 — adicionar condição para pular verso quando `document_type === "CNH"`:

```typescript
// Antes:
if (!c.document_back_url) return "ask_doc_verso_manual";

// Depois:
if (!c.document_back_url && c.document_type !== "CNH") return "ask_doc_verso_manual";
```

### `supabase/functions/evolution-webhook/index.ts`
No handler do step `aguardando_doc_frente`, após salvar a frente: se for CNH, marcar `document_back_url = "nao_aplicavel"` para que o fluxo avance automaticamente sem pedir o verso.

## Impacto
- Zero risco — apenas pula um step desnecessário para CNH
- RG (novo e antigo) continua pedindo frente + verso normalmente
- Procurador e débitos já estão corretos, nenhuma mudança necessária

