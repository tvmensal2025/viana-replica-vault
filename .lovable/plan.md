

## Problema Identificado

O `useUserRole` hook tem um bug de race condition:

1. Inicialmente `userId` é `null` → `loading` é setado para `false`
2. Quando `userId` chega, o effect re-executa, mas `loading` continua `false` enquanto a query RPC ainda está em andamento
3. O `SuperAdmin.tsx` vê `roleLoading=false` + `isAdmin=false` e redireciona imediatamente com "Acesso negado"

A função `has_role` no banco funciona corretamente — retorna `true` para rafael.ids@icloud.com. O problema é puramente de timing no frontend.

## Plano

### 1. Corrigir o hook `useUserRole`

Resetar `loading` para `true` quando `userId` muda, antes de iniciar a query:

```typescript
useEffect(() => {
  if (!userId) {
    setIsAdmin(false);
    setLoading(false);
    return;
  }
  
  setLoading(true); // ← fix: reset loading quando userId muda
  
  const checkRole = async () => { ... };
  checkRole();
}, [userId]);
```

### 2. Adicionar as 3 policies de admin no `message_templates`

Migração SQL para permitir que admins gerenciem todos os templates:
- **Admins update all templates**
- **Admins delete all templates** 
- **Admins insert templates**

### 3. Sobre a página de controle de novos cadastros

A página `/super-admin` já existe com funcionalidade para:
- Ver todos os consultores cadastrados
- Aprovar/revogar acesso de cada consultor
- Ver estatísticas (total, aprovados, pendentes)

Com o fix do hook, o Rafael terá acesso a essa página normalmente.

