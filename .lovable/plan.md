

## Fix: `markAsRead` Missing Required Fields

### Problem
The Evolution API endpoint `chat/markMessageAsRead` requires each item in `readMessages` to have `id`, `remoteJid`, and `fromMe` properties. The current `markAsRead` function only sends `{ remoteJid }`, causing a 400 Bad Request.

### Solution

**File: `src/services/evolutionApi.ts`**
- Update `markAsRead` signature to accept `id` and `fromMe` parameters
- Send the complete object: `{ readMessages: [{ id, remoteJid, fromMe }] }`

**File: `src/hooks/useMessages.ts`**
- After fetching messages, find the last received message (not fromMe) and pass its `id` and `fromMe: false` to `markAsRead`
- If no received messages exist, skip the `markAsRead` call entirely (nothing to mark as read)

### Changes

1. **`src/services/evolutionApi.ts`** -- Change `markAsRead(instanceName, remoteJid)` to `markAsRead(instanceName, remoteJid, messageId, fromMe)` and include all fields in the request body.

2. **`src/hooks/useMessages.ts`** -- In `fetchMessages`, after mapping messages, find the last incoming message and pass its ID to `markAsRead`. If there are no incoming messages, skip the call.

