

## Painel Super Admin com controle de acesso

### Resumo
Criar uma página `/super-admin` separada da `/admin` atual. O acesso é controlado por uma tabela `user_roles` no banco. Todos os consultores precisam ser autorizados pelo super admin para acessar o painel `/admin`.

### 1. Migração SQL

**Tabela `user_roles` + função `has_role` + campo `approved` nos consultants:**

```sql
-- Enum de roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Tabela de roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função segura para checar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- RLS: só admins leem/escrevem user_roles
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Campo approved na tabela consultants
ALTER TABLE public.consultants ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false;

-- Inserir o super admin (rafael.ids@icloud.com)
-- Será feito via SQL após identificar o user_id
```

### 2. Inserir admin inicial

Após a migração, executar via SQL para associar o usuário `rafael.ids@icloud.com` como admin:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'rafael.ids@icloud.com';
```

### 3. Hook `src/hooks/useUserRole.ts`
- Chama `supabase.rpc('has_role', { _user_id, _role: 'admin' })`
- Retorna `{ isAdmin, loading }`

### 4. Página `src/pages/SuperAdmin.tsx`
- Verifica role via hook; redireciona se não for admin
- Funcionalidades:
  - **Lista de consultores**: nome, email, licença, data de cadastro, status (aprovado/pendente)
  - **Botão aprovar/reprovar**: alterna campo `approved` do consultor
  - **Métricas globais**: total de consultores, total de clientes, consultores pendentes
  - **Gerenciar roles**: promover/remover admins

### 5. Proteção da página `/admin`
- No `Admin.tsx`, após carregar o consultor, verificar se `approved === true`
- Se não aprovado, mostrar tela de "Aguardando aprovação" e bloquear acesso

### 6. `src/App.tsx`
- Adicionar rota `/super-admin` → `SuperAdmin`

### Detalhes técnicos
- Role verificada no servidor via SECURITY DEFINER (impossível burlar no client)
- Campo `approved` controlado apenas pelo super admin via RLS
- A página `/admin` atual NÃO será alterada em funcionalidade, apenas adicionada a verificação de aprovação
- Login do super admin usa a mesma tela `/auth`, mas ao detectar role admin, pode navegar para `/super-admin`

