
## Análise Profunda: Configuração e Segurança

### Problemas Encontrados

**1. CRÍTICO — SuperAdmin não consegue listar todos os consultores**

A página `SuperAdmin.tsx` faz `supabase.from("consultants").select(...)` sem filtro de `id`, mas a RLS da tabela `consultants` só permite `Owner read` (`id = auth.uid()`). Isso significa que o admin só vê a si mesmo, nunca os outros consultores. O painel de aprovação está quebrado.

**Correção:** Criar uma policy RLS que permite admins lerem todos os consultores:
```sql
CREATE POLICY "Admins read all consultants" ON public.consultants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```
E uma policy para admins atualizarem o campo `approved`:
```sql
CREATE POLICY "Admins update consultants" ON public.consultants
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

---

**2. SEGURANÇA — Credenciais Evolution API expostas no `.env` (baixo risco)**

O `.env` contém `VITE_EVOLUTION_API_URL` e `VITE_EVOLUTION_API_KEY`. Variáveis `VITE_` são embutidas no bundle do frontend. Porém, o `evolutionApi.ts` já NÃO usa essas variáveis — ele roteia tudo pelo proxy Supabase corretamente. Nenhum arquivo `.ts`/`.tsx` referencia `VITE_EVOLUTION_API`.

**Correção:** Remover as linhas `VITE_EVOLUTION_API_URL` e `VITE_EVOLUTION_API_KEY` do `.env` para limpeza. Não afetam funcionalidade, mas são lixo que pode confundir.

---

**3. OK — Evolution API proxy (`evolution-proxy`)**

- Usa `Deno.env.get("EVOLUTION_API_URL")` e `Deno.env.get("EVOLUTION_API_KEY")` — secrets do Supabase ✅
- Autenticação via `supabase.auth.getUser(token)` ✅
- Timeout/retry/graceful responses implementados ✅
- Logs mostram que está funcionando (auth OK, timeouts da VPS são tratados)

---

**4. OK — Upload Media (`upload-media`)**

- Usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do Deno env ✅
- Upload para Supabase Storage bucket `whatsapp-media` ✅
- Não depende de MinIO ✅

---

**5. OK — Sync iGreen (`sync-igreen-customers`)**

- Usa `IGREEN_PORTAL_EMAIL` e `IGREEN_PORTAL_PASSWORD` do Deno env ✅
- Permite override por body da request (per-consultant) ✅
- Secrets existem no Supabase ✅

---

**6. OK — CRM Auto Progress (`crm-auto-progress`)**

- Usa `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` do Deno env ✅
- Chama Evolution API diretamente (server-side, sem CORS) ✅

---

**7. OK — Secrets do Supabase**

Todos os secrets necessários existem: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `MINIO_SERVER_URL`, `MINIO_BUCKET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `IGREEN_PORTAL_EMAIL`, `IGREEN_PORTAL_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`.

---

**8. ATENÇÃO — MinIO secrets existem mas nenhuma Edge Function as usa**

Os secrets `MINIO_SERVER_URL`, `MINIO_BUCKET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` estão configurados mas nenhuma das Edge Functions atuais referencia MinIO. O upload foi migrado para Supabase Storage. Esses secrets são inativos — podem ser mantidos para uso futuro.

---

### Resumo de Ações

| # | Problema | Severidade | Ação |
|---|----------|-----------|------|
| 1 | SuperAdmin não vê outros consultores (RLS) | CRÍTICO | Criar policies RLS para admins |
| 2 | `VITE_EVOLUTION_*` no `.env` (não usadas) | Baixa | Remover linhas do `.env` |
| 3-7 | Proxy, Upload, Sync, CRM, Secrets | OK | Nenhuma |
| 8 | Secrets MinIO sem uso | Info | Manter para referência |

### Implementação

1. **Migração SQL** — Adicionar 2 policies RLS na tabela `consultants` para admins
2. **`.env`** — Remover `VITE_EVOLUTION_API_URL` e `VITE_EVOLUTION_API_KEY`

Total: 2 alterações. O problema crítico é a RLS que impede o SuperAdmin de funcionar.
