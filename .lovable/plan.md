

## Analysis: 401 "Token de autenticação inválido ou ausente"

### Root Cause

The `request()` function in `evolutionApi.ts` (line 38) has:
```typescript
Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`
```

When `supabase.auth.getSession()` returns no session (race condition during login/redirect), `token` is `undefined`, so the **anon key** is sent as a Bearer token. The edge function then calls `getUser(anonKey)` which fails → 401.

This happens in two scenarios:
1. **`preCreateWhatsAppInstance`** fires on Auth page before session is fully propagated
2. **Admin page loads** and WhatsApp hook makes API calls before the auth state change fires

The logs confirm the proxy works fine once authenticated (many 200s). The 401 is a timing issue.

### Plan

#### 1. Guard `request()` against missing session (evolutionApi.ts)
- Instead of falling back to `SUPABASE_ANON_KEY`, throw an early error if no session exists
- This prevents sending invalid tokens and surfaces a clear message

#### 2. Add session-ready check in `preCreateWhatsAppInstance` (preCreateInstance.ts)
- Verify session exists before calling `createInstance`
- If no session, skip silently (the hook will handle it later)

#### 3. Guard WhatsAppTab rendering (WhatsAppTab.tsx)
- Only render WhatsApp components when `consultantId` is truthy (already partially done)
- Ensure no API calls fire before authentication is confirmed

### Technical Details

**File: `src/services/evolutionApi.ts`** (lines 30-42)
- Change fallback: if no token from `getSession()`, throw a descriptive error instead of sending anon key
- This prevents the 401 entirely and lets callers handle it gracefully

**File: `src/services/preCreateInstance.ts`** (lines 19-42)  
- Add `supabase.auth.getSession()` check at the top
- Return early if no valid session

**File: `src/pages/Auth.tsx`** (lines 22, 28)
- Wrap `preCreateWhatsAppInstance` calls with a small delay or session verification to avoid race condition

