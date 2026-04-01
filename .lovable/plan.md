

## Proteger templates compartilhados e garantir isolamento multi-tenant

### Problema identificado

As políticas RLS já estão corretas:
- **SELECT**: todos os autenticados leem todos os templates (`USING (true)`)
- **INSERT/UPDATE/DELETE**: apenas o dono (`consultant_id = auth.uid()`)

Porém a **UI não distingue** templates próprios dos compartilhados. Os botões de editar/excluir aparecem em TODOS os templates, e ao clicar em um que não é seu, o RLS bloqueia silenciosamente (update) ou falha (delete), causando erro.

### Dados já isolados corretamente (sem mudanças necessárias)
- **customers**: RLS owner-only (SELECT/INSERT/UPDATE/DELETE)
- **crm_deals, customer_tags, scheduled_messages**: RLS owner-only
- **whatsapp_instances**: RLS owner-only + UNIQUE(consultant_id)
- **kanban_stages**: RLS owner-only
- **Conversas**: via Evolution API com instância individual por consultor

### Alterações necessárias

**1. `src/components/whatsapp/TemplateManager.tsx`**
- Adicionar prop `consultantId: string`
- Comparar `template.consultant_id === consultantId` para cada template
- **Templates alheios**: esconder botões de editar e excluir, mostrar apenas visualizar (preview)
- **Templates próprios**: manter comportamento atual completo

**2. `src/components/whatsapp/WhatsAppTab.tsx`**
- Passar `consultantId` para o `TemplateManager`

**3. `src/hooks/useTemplates.ts`**
- Melhorar `deleteTemplate` para verificar resultado (como já faz o `updateTemplate`), evitando falha silenciosa por RLS

### Resultado
- Templates padrão (áudios, imagens) ficam visíveis para todos, mas só o criador pode editar/excluir
- Cada conta nova vê os templates compartilhados e pode criar os seus
- Nenhum erro de RLS ao interagir com templates alheios

