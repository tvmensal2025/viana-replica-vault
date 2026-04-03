

# Melhorias no Kanban: Adicionar Leads + Múltiplas Mensagens Automáticas + Progressão de Reprovados

## 1. Botão "Adicionar Lead" no Kanban

**Arquivo:** `KanbanBoard.tsx`

Dialog com duas opções:
- **Clientes existentes**: Lista dos clientes já salvos na tabela `customers` (filtrados pelo `consultant_id`), com busca por nome/telefone e seleção múltipla. Ao confirmar, cria um `crm_deal` para cada cliente selecionado com `remote_jid` formatado e `customer_id` vinculado.
- **Novo contato**: Campo para digitar número WhatsApp + nome manualmente (para leads que ainda não são clientes).
- Seletor de estágio inicial (default: "novo_lead").
- Campo de notas opcional.
- Se estágio = "aprovado", seta `approved_at = now()` automaticamente.

## 2. Múltiplas Mensagens Automáticas por Estágio

**Problema atual:** Cada estágio do Kanban suporta apenas 1 mensagem automática (1 texto + 1 mídia + 1 imagem). Limitado para réguas de comunicação mais completas.

**Solução:** Criar tabela `stage_auto_messages` para suportar N mensagens por estágio.

### Nova tabela: `stage_auto_messages`
```
id (uuid PK)
stage_id (uuid FK → kanban_stages.id)
consultant_id (uuid)
position (integer) — ordem de envio
message_type (text) — text/image/video/audio
message_text (text nullable)
media_url (text nullable)
image_url (text nullable)
delay_seconds (integer default 0) — delay entre mensagens
created_at (timestamptz)
```

**RLS:** `consultant_id = auth.uid()`

### Mudanças nos arquivos:
- **`StageAutoMessageConfig.tsx`**: Refatorar para gerenciar uma lista de mensagens (adicionar/remover/reordenar). Cada item tem tipo, texto, mídia e delay.
- **`KanbanBoard.tsx`**: Adaptar `handleSaveAutoMessage` para salvar na nova tabela em vez das colunas diretas do `kanban_stages`.
- **`crm-auto-progress/index.ts`**: Buscar mensagens da tabela `stage_auto_messages` ordenadas por `position` e enviar sequencialmente com delays.

## 3. Auto-progressão para Reprovados

**Problema atual:** A Edge Function `crm-auto-progress` só progride deals com estágio "aprovado" e derivados (30/60/90/120 dias). Reprovados ficam parados para sempre.

**Solução:** Adicionar progressão separada para reprovados.

### Nova coluna em `crm_deals`:
- `rejected_at (timestamptz nullable)` — setada quando deal move para "reprovado"

### Novos estágios default:
- `reprovado_60_dias` — "Reprovado 60 Dias" (posição após 120_dias)

### Mudanças na Edge Function `crm-auto-progress`:
- Buscar deals com `stage = 'reprovado'` e `rejected_at` preenchido
- Se `daysSinceRejection >= 60`, mover para `reprovado_60_dias`
- Enviar mensagem automática configurada nesse estágio (ex: "Olá, gostaríamos de tentar novamente...")
- Extensível para mais estágios de reprovado no futuro

### Mudanças no `KanbanBoard.tsx`:
- Quando um deal é movido para "reprovado", setar `rejected_at = now()` automaticamente (similar ao `approved_at`)

## Resumo de Arquivos

| Arquivo | Mudança |
|---------|---------|
| `KanbanBoard.tsx` | Botão adicionar lead + setar `rejected_at` + usar `stage_auto_messages` |
| `StageAutoMessageConfig.tsx` | Gerenciar lista de N mensagens por estágio |
| `crm-auto-progress/index.ts` | Progressão de reprovados + buscar `stage_auto_messages` |
| Migration SQL | Tabela `stage_auto_messages` + coluna `rejected_at` em `crm_deals` |

## Ordem de Implementação
1. Migration (tabela + coluna)
2. Botão adicionar lead no Kanban
3. Múltiplas mensagens automáticas (UI + Edge Function)
4. Progressão de reprovados (Edge Function + lógica de `rejected_at`)

