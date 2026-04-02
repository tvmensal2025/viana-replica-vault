

## Analysis: Logo flashes and disappears

### Root Cause

The Admin page uses `onAuthStateChange` from Supabase to detect the user session. Every time Supabase refreshes the auth token (which happens periodically in the background), the callback fires again.

The current guard (`loadingUidRef.current === uid`) only blocks **concurrent** loads — after the first load completes, `loadingUidRef.current` is reset to `null` (line 267). So the next auth event for the same user triggers the full cycle again:

1. `setLoading(true)` → shows logo loading screen
2. `loadConsultant()` runs (fast, since data already exists)
3. `setLoading(false)` → logo disappears, dashboard returns

This causes the brief flash every time the token refreshes.

### Fix

**File: `src/pages/Admin.tsx`**

In `handleSession`, skip re-loading if the user is already the active user and data has already been loaded once:

```
// Change the guard from:
if (loadingUidRef.current === uid) return;

// To:
if (loadingUidRef.current === uid || activeUidRef.current === uid) return;
```

This single-line change ensures that once a user's data is loaded, subsequent auth events (token refreshes) won't trigger the loading screen again. The guard already handles different-user scenarios correctly since `activeUidRef` gets cleared on logout.

