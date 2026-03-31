

# Proteger senha do portal iGreen contra exposicao publica

## Problema

A tabela `consultants` tem uma policy RLS "Public read" que permite SELECT de **todas as colunas** para qualquer usuario anonimo. Isso expoe `igreen_portal_password` e `igreen_portal_email` publicamente. Os dados ja estao visiveis — a senha `201097De.` de pelo menos 2 consultores aparece em queries publicas.

## Solucao

Criar uma **view publica** com apenas os campos seguros e restringir o acesso direto a tabela.

### Etapa 1 — Migration SQL

1. **Remover** a policy "Public read" da tabela `consultants`
2. **Criar** uma policy "Owner read" para `authenticated` com `id = auth.uid()`
3. **Criar** uma view `public.consultants_public` com apenas os campos necessarios para as landing pages:
   - `id`, `name`, `license`, `phone`, `photo_url`, `cadastro_url`, `licenciada_cadastro_url`, `igreen_id`, `facebook_pixel_id`, `google_analytics_id`
   - **Exclui**: `igreen_portal_email`, `igreen_portal_password`
4. **Habilitar** acesso publico na view via `GRANT SELECT ON public.consultants_public TO anon, authenticated`

### Etapa 2 — Atualizar codigo frontend

Atualizar o hook `useConsultant.ts` e qualquer query que busque dados do consultor para as landing pages para usar `consultants_public` em vez de `consultants`.

Os locais que continuam usando `consultants` diretamente (Admin.tsx, CustomerManager.tsx) funcionarao normalmente porque o usuario esta autenticado e a nova policy "Owner read" permite acesso ao proprio registro completo (incluindo senha).

### Arquivos alterados

- **1 migration SQL** (nova)
- `src/hooks/useConsultant.ts` — trocar para `consultants_public`
- `src/pages/Index.tsx` / `src/pages/ConsultantPage.tsx` — verificar se usam useConsultant (provavelmente sim, sem mudanca adicional)

### Resultado

- Landing pages continuam funcionando (via view publica sem campos sensiveis)
- Painel admin continua funcionando (via policy owner read)
- Senhas **nunca mais** expostas publicamente

