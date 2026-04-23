

# Seleção em massa no widget de Leads Travados

## O que vai mudar no widget

Adicionar **checkboxes** em cada lead + **barra de ações em massa** que aparece quando 1+ leads estiverem selecionados.

## Layout novo

```text
┌─ Leads Travados ─────────────────────── [22] [↻] ─┐
│ ☑ Selecionar todos              [22 selecionados] │
│ ┌─ AÇÕES (aparece com seleção) ─────────────────┐ │
│ │ [▶ Continuar resgate]  [✓ Marcar convertido]  │ │
│ │ [🗑 Marcar abandonado]                         │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ☐ CELIO TAVARES · confirmando_dados · 127h        │
│ ☐ EDNA · menu_inicial · 100h                      │
│ ☐ VALDEIR · aguardando_facial · 46h               │
│ ...                                                │
└────────────────────────────────────────────────────┘
```

## 3 ações em massa

| Ação | O que faz | Quando usar |
|---|---|---|
| **▶ Continuar resgate** | Chama `bot-stuck-recovery` apenas para os IDs selecionados (envia mensagem de resgate) | Leads recentes que vale tentar reativar |
| **✓ Marcar convertido** | Atualiza `status='complete'` + `conversation_step=null` (some do widget, não recebe mais resgate) | Cliente já finalizou por fora ou virou venda |
| **🗑 Marcar abandonado** | Atualiza `status='abandoned'` (some do widget, não recebe mais resgate, sem mensagem) | Lead morto / 100h+ sem resposta |

## Comportamento

- Checkbox individual em cada lead + checkbox "Selecionar todos" no topo
- Barra de ações só aparece quando há seleção (≥1)
- Botão antigo **"Resgatar agora"** (que disparava para todos) é **substituído** pela ação seletiva — evita disparo acidental em massa
- Após confirmar uma ação: dialog de confirmação com contagem ("Marcar 15 leads como convertidos?")
- Após executar: recarrega lista, limpa seleção, toast com resultado

## Arquivos a alterar

**Frontend (apenas 1 arquivo):**
- `src/components/superadmin/StuckLeadsWidget.tsx`
  - Adicionar estado `selectedIds: Set<string>`
  - Checkbox em cada item + "selecionar todos"
  - Barra de ações (3 botões) condicional à seleção
  - Função `markStatus(status)` → update direto em `customers` via supabase client (RLS já permite admin)
  - Função `rescueSelected()` → invoca `bot-stuck-recovery` passando `customer_ids` no body
  - AlertDialog do shadcn para confirmar

**Backend (1 arquivo):**
- `supabase/functions/bot-stuck-recovery/index.ts`
  - Aceitar `customer_ids?: string[]` no body
  - Se vier, filtrar query por `.in("id", customer_ids)` em vez de processar todos

## Garantias

- ✅ Nenhuma mensagem é enviada sem você selecionar e confirmar
- ✅ "Marcar convertido/abandonado" não envia WhatsApp — só atualiza status no banco
- ✅ Lead marcado como `complete` ou `abandoned` sai do widget e não entra mais no cron de resgate (já filtrado pelo `.not("status", "in", ...)`)
- ✅ RLS de admin já cobre os updates (você é admin no `user_roles`)

