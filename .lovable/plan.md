

## Problema
Atualmente, a política de SELECT na tabela `message_templates` permite que todos os usuários autenticados vejam **todos** os templates (incluindo áudios e imagens). O usuário quer que templates criados por admins sejam globais (visíveis para todos), mas templates criados por usuários individuais sejam privados.

## Solução

### Migração SQL
Alterar a política de SELECT `Authenticated read all templates` para:

```sql
DROP POLICY "Authenticated read all templates" ON public.message_templates;

CREATE POLICY "Users see own and admin templates"
ON public.message_templates
FOR SELECT
TO authenticated
USING (
  consultant_id = auth.uid()
  OR has_role(consultant_id, 'admin')
);
```

Isso faz com que:
- Templates criados por um **admin** → visíveis para **todos** os usuários autenticados (padrão/global)
- Templates criados por um **usuário comum** → visíveis **apenas** para o próprio criador

### Nenhuma alteração de código necessária
A lógica do `useTemplates` já faz `SELECT *` sem filtro — o RLS cuidará automaticamente da visibilidade correta.

