

# Mensagens separadas por origem (Aprovado vs Reprovado) na coluna 60 Dias

## Problema atual

A coluna "60 DIAS" recebe leads de dois caminhos diferentes:
- Aprovados que completaram 60 dias
- Reprovados que completaram 60 dias (via `reprovado_60_dias`)

O usuario quer que na coluna de 60 dias existam **duas mensagens distintas**: uma para quem veio de aprovado e outra para quem veio de reprovado.

## Solucao

Adicionar um campo `deal_origin` na tabela `stage_auto_messages` (valores: `aprovado`, `reprovado`, ou NULL para todos). Unificar as colunas `60_dias` e `reprovado_60_dias` em uma so, e usar o `deal_origin` para filtrar qual mensagem enviar.

Tambem adicionar `deal_origin` em `crm_deals` para rastrear se o lead veio do fluxo aprovado ou reprovado.

### 1. Migration SQL
- `ALTER TABLE crm_deals ADD COLUMN deal_origin TEXT NULL` (preenchido com "aprovado" ou "reprovado" quando o deal entra nessas colunas)
- `ALTER TABLE stage_auto_messages ADD COLUMN deal_origin TEXT NULL`

### 2. KanbanBoard.tsx
- Ao mover deal para "aprovado", setar `deal_origin = 'aprovado'`
- Ao mover deal para "reprovado", setar `deal_origin = 'reprovado'`
- Remover o estagio padrao `reprovado_60_dias` (unificar no `60_dias`)

### 3. StageAutoMessageConfig.tsx
- Para colunas de tempo (30, 60, 90, 120 dias), mostrar um seletor de **origem**: "Todos", "Aprovados", "Reprovados"
- Cada mensagem pode ser configurada para disparar apenas para uma origem especifica

### 4. Edge Function (crm-auto-progress)
- Reprovados com 60 dias tambem vao para `60_dias` (em vez de `reprovado_60_dias`)
- Ao enviar mensagens, filtrar por `deal_origin` do deal alem do `rejection_reason`

### 5. DropConfirmDialog.tsx
- Preview de mensagens tambem considera o `deal_origin` ao filtrar

## Fluxo visual no StageAutoMessageConfig

```text
Mensagens Automáticas [60 DIAS]

  ┌────────────────────────────┐
  │ Msg 1  Origem: [Aprovados] │
  │ 🔊 audio_aprovado.ogg     │
  │ 📷 imagem_aprovado.jpg     │
  │ "Parabéns, 60 dias..."    │
  └────────────────────────────┘

  ┌────────────────────────────┐
  │ Msg 2  Origem: [Reprovados]│
  │ 🔊 audio_reprovado.ogg    │
  │ 📷 imagem_reprovado.jpg    │
  │ "Gostaríamos de tentar..." │
  └────────────────────────────┘
```

## Arquivos alterados

| Arquivo | Mudanca |
|---------|---------|
| Migration SQL | `deal_origin` em `crm_deals` e `stage_auto_messages` |
| `KanbanBoard.tsx` | Setar `deal_origin` ao aprovar/reprovar, remover `reprovado_60_dias` |
| `StageAutoMessageConfig.tsx` | Seletor de origem (aprovado/reprovado) por mensagem |
| `DropConfirmDialog.tsx` | Filtrar preview por `deal_origin` |
| `crm-auto-progress/index.ts` | Unificar progressao para `60_dias`, filtrar por `deal_origin` |

