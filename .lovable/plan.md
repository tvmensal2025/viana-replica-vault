

## Analysis: WhatsApp Connection Failing After Publish

### Root Cause

The Edge Function logs reveal the Evolution API server (`igreen-evolution-api.b099mi.easypanel.host`) consistently times out on `instance/connect/` (30s x 3 attempts = 90s) and `instance/connectionState/` (25s). Combined with Supabase Edge Function's ~150s wall-clock limit, the function hits "shutdown" before completing.

There are **4 distinct bugs** causing the failure:

1. **Race condition**: `preCreateInstance` (Auth.tsx login) and `useWhatsApp.init()` both fire simultaneously, doubling API load on the already-slow server
2. **Lock never released**: `lockRef.current = true` is set at line 171, but success paths (`return` at lines 201, 239) exit without resetting it. After first connection attempt, `createAndConnect` / `reconnect` are permanently blocked
3. **Excessive proxy timeouts**: `instance/connect/` uses 30s x 3 attempts = 90s in the Edge Function, risking the 150s platform limit and causing "shutdown" events
4. **No graceful connect fallback**: `connectionState/` has a timeout fallback (returns `{state: "connecting"}`), but `instance/connect/` returns 504 on timeout, crashing the flow

### Plan

#### 1. Fix lock release bug in `useWhatsApp.ts`
- Add `finally` block to `createAndConnect` to always release `lockRef.current = false` and `setIsLoading(false)`
- Ensure `disconnect` also resets `lockRef`

#### 2. Eliminate race condition
- Remove `preCreateWhatsAppInstance` call from `Auth.tsx` entirely — `useWhatsApp` already handles creation on mount
- Delete unused `preCreateInstance.ts` service

#### 3. Reduce proxy timeouts in `evolution-proxy/index.ts`
- `instance/connect/`: reduce to 20s timeout, 2 attempts max (40s total vs 90s)
- `instance/connectionState/`: reduce to 15s, 2 attempts (vs 25s x 3)
- `instance/create`: keep at 60s x 1 attempt (no retry — idempotent via 403 handling)
- Add graceful fallback for `instance/connect/` timeout: return `{base64: null, timeout: true}` with status 200 instead of 504

#### 4. Make frontend resilient to slow server
- In `useWhatsApp.createAndConnect`: if `fetchQr` returns null due to timeout, show a user-friendly message with retry button instead of error state
- Reduce `withTimeout` on connect calls to 25s (matching new proxy limits)
- Auto-retry QR fetch after 5s delay on timeout (up to 2 retries before showing manual button)

#### 5. Redeploy Edge Function
- Deploy updated `evolution-proxy` with reduced timeouts and graceful fallbacks

### Files Changed
- `src/hooks/useWhatsApp.ts` — fix lock, remove preCreate dependency, add resilience
- `src/pages/Auth.tsx` — remove `preCreateWhatsAppInstance` import and calls
- `src/services/preCreateInstance.ts` — delete file
- `supabase/functions/evolution-proxy/index.ts` — reduce timeouts, add connect fallback

