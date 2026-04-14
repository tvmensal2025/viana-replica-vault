

# Fix: Bot "Travado" — Resend Buttons on Invalid Input

## Root Cause

The customer JOSEFA sent "1" at `confirmando_dados_conta` which correctly transitioned to `ask_tipo_documento`. The bot sent document type buttons. Then she sent "Sim" and "Oi" — neither matches a document type option ("1"/"2"/"3"/"rg novo"/"rg antigo"/"cnh"). The else branch at line 486 only sends plain text `"Escolha o tipo de documento (toque em um botão):"` — **without actually resending the buttons**. The customer has no way to proceed.

The DB confirms she's at `ask_tipo_documento` and waiting.

## Fix

**File: `supabase/functions/evolution-webhook/index.ts`**

1. **`ask_tipo_documento` else branch (line 485-487)**: Replace plain text reply with `sendButtons` call that resends the 3 document type options (RG Novo, RG Antigo, CNH), with text fallback if buttons fail.

2. **`ask_finalizar` else branch (line 1023-1025)**: Similarly ensure `getReplyForStep` includes the finalizar button, or add explicit `sendButtons` call.

3. **Global safety net — `default` case**: Currently, if `conversation_step` has an unrecognized value, the bot should respond with a helpful message instead of silently doing nothing. Add a default case that tells the user their status and offers help.

## Changes

### Step 1: `ask_tipo_documento` — resend buttons on invalid input
```typescript
// Line 485-487: replace plain text with buttons
} else {
  const sent = await sendButtons(remoteJid, "📋 Qual documento de identidade você vai enviar?\n\nToque em uma opção:", [
    { id: "tipo_rg_novo", title: "📄 RG Novo" },
    { id: "tipo_rg_antigo", title: "📄 RG Antigo" },
    { id: "tipo_cnh", title: "🪪 CNH" },
  ]);
  if (!sent) reply = "Escolha: *1* = RG Novo, *2* = RG Antigo, *3* = CNH";
}
```

### Step 2: `ask_finalizar` — resend buttons on invalid input
```typescript
// Line 1023-1025: replace getReplyForStep with explicit buttons
} else {
  const sent = await sendButtons(remoteJid, "📋 Deseja finalizar o cadastro?", [
    { id: "btn_finalizar", title: "✅ Finalizar" },
    { id: "btn_cancelar", title: "❌ Cancelar" },
  ]);
  if (!sent) reply = "Digite *FINALIZAR* ou *1* para confirmar:";
}
```

### Step 3: Add robust `default` case in switch
Ensure unrecognized steps get a helpful response instead of silence:
```typescript
default: {
  console.warn(`⚠️ Step desconhecido: ${currentStep}`);
  reply = "🤖 Desculpe, algo deu errado. Vou retomar de onde paramos...\n\nDigite *oi* para recomeçar ou aguarde um momento.";
}
```

### Step 4: Deploy edge function
Deploy `evolution-webhook` after changes.

## Impact
- Zero risk to existing flow
- Customers will always see actionable buttons/text at every step
- No more "stuck" conversations

