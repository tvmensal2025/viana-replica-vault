

# Motivos de Reprovação + Preview de Mensagem ao Arrastar

## Sobre a dúvida "como sabe se é para reprovado ou aprovado"

Cada coluna do Kanban tem seu proprio `stage_id`. As mensagens automaticas na tabela `stage_auto_messages` sao vinculadas por `stage_id`, entao a coluna "Reprovado" tem suas proprias mensagens e "Aprovado" tem as dela. Nao ha confusao -- ja funciona assim.

O problema real e mais interessante: **reprovados tem motivos diferentes e precisam de mensagens diferentes por motivo**.

## Proposta

### 1. Motivos de reprovacao pre-definidos

Criar uma lista fixa de motivos:
- **Baixa renda**
- **ICMS baixo**
- **Emprestimo na conta de energia**
- **Outro** (campo livre)

### 2. Dialog de confirmacao ao arrastar para "Reprovado"

Quando o usuario arrastar um deal para a coluna "Reprovado", em vez de mover direto, abrir um **dialog intermediario** com:
- Seletor do motivo de reprovacao (obrigatorio)
- Preview da mensagem automatica que sera enviada (texto, midia, imagem)
- Botao "Confirmar e Enviar" / "Confirmar sem Enviar"

### 3. Mensagens automaticas por motivo

Em vez de uma unica configuracao de auto-mensagem para "Reprovado", permitir configurar **uma mensagem diferente por motivo de reprovacao**.

**Mudanca na tabela `stage_auto_messages`:** adicionar coluna `rejection_reason TEXT NULL` -- quando preenchida, a mensagem so dispara se o motivo do deal bater. Quando NULL, dispara para qualquer motivo (comportamento atual).

**Mudanca na tabela `crm_deals`:** adicionar coluna `rejection_reason TEXT NULL`.

### 4. Preview ao arrastar para QUALQUER coluna

Para todas as colunas (nao so reprovado), ao soltar o deal, mostrar um **mini-preview** das mensagens automaticas configuradas antes de confirmar o envio. Isso resolve a pergunta do usuario de "saber qual mensagem sera enviada".

## Implementacao

### Migration SQL
- `ALTER TABLE crm_deals ADD COLUMN rejection_reason TEXT NULL`
- `ALTER TABLE stage_auto_messages ADD COLUMN rejection_reason TEXT NULL`

### KanbanBoard.tsx
- Modificar `handleDrop`: em vez de mover direto, setar um estado `pendingDrop` com `{ dealId, targetStage }`
- Abrir um **Dialog de confirmacao** que:
  - Se a coluna for "reprovado": mostra seletor de motivo + preview das mensagens filtradas por motivo
  - Para qualquer coluna: mostra preview das mensagens automaticas configuradas
  - Botoes: "Confirmar e Enviar", "Mover sem Enviar", "Cancelar"
- Ao confirmar, salvar `rejection_reason` no deal e enviar mensagens filtradas

### StageAutoMessageConfig.tsx
- Para colunas com `stage_key === "reprovado"`: adicionar campo de seletor de motivo em cada mensagem
- Permitir criar mensagens especificas por motivo (ex: mensagem X so para "baixa_renda", mensagem Y so para "icms_baixo")

## Fluxo do Usuario

```text
Arrasta deal → Coluna "Reprovado"
    ↓
Dialog aparece:
  ┌──────────────────────────────┐
  │ Mover para Reprovado         │
  │                              │
  │ Motivo: [Baixa renda     ▾]  │
  │                              │
  │ Mensagens que serao enviadas:│
  │ ┌──────────────────────────┐ │
  │ │ 🖼 imagem.jpg            │ │
  │ │ 🔊 audio.ogg             │ │
  │ │ Infelizmente seu cadastro│ │
  │ │ nao foi aprovado...      │ │
  │ └──────────────────────────┘ │
  │                              │
  │ [Cancelar] [Sem msg] [Enviar]│
  └──────────────────────────────┘
```

## Arquivos alterados

| Arquivo | Mudanca |
|---------|---------|
| Migration SQL | `rejection_reason` em `crm_deals` e `stage_auto_messages` |
| `KanbanBoard.tsx` | Dialog de confirmacao com preview + motivo |
| `StageAutoMessageConfig.tsx` | Filtro por motivo nas mensagens do estagio "reprovado" |
| `crm-auto-progress/index.ts` | Filtrar mensagens por `rejection_reason` ao enviar automaticamente |

