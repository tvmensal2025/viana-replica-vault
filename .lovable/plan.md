

## Plano: Adicionar policies de admin para templates

O usuario `rafael.ids@icloud.com` ja possui a role `admin`. Porem, as policies de UPDATE, DELETE e INSERT na tabela `message_templates` so permitem ao dono (`consultant_id = auth.uid()`). O admin precisa de policies adicionais.

### Migracao SQL

Adicionar 3 policies na tabela `message_templates`:

1. **Admins update all templates** — permite admin editar qualquer template
2. **Admins delete all templates** — permite admin deletar qualquer template  
3. **Admins insert templates** — permite admin criar templates

Todas usam `public.has_role(auth.uid(), 'admin')`.

Nenhuma alteracao de codigo necessaria.

