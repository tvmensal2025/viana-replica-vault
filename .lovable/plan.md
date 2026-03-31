

## Correção: WhatsApp trava em "Conexão perdida"

### Problema
Quando o polling detecta que o estado mudou para "close" (linha 187-198 do `useWhatsApp.ts`), ele **para de fazer polling completamente** e mostra "Conexão perdida". O consultor precisa clicar manualmente em "Reconectar". Isso acontece por quedas momentâneas de rede ou instabilidade do servidor Evolution.

### Solução: Auto-reconexão com retry

**Arquivo: `src/hooks/useWhatsApp.ts`**

1. Quando o polling detectar estado "close" e o status anterior era "connected", em vez de parar, tentar reconexão automática:
   - Aguardar 5 segundos e verificar novamente (pode ser queda momentânea)
   - Se após 3 verificações consecutivas continuar "close", tentar `connectInstance` automaticamente para obter novo QR ou restaurar sessão
   - Só mostrar "Conexão perdida" após 3 tentativas falharem (~15 segundos)

2. Adicionar um contador de falhas consecutivas via `useRef` para controlar o retry:
   - 1-3 falhas: continua polling a cada 5s silenciosamente
   - Após 3 falhas: mostra toast + "Conexão perdida" + botão reconectar
   - Se voltar a "open" durante o retry, restaura normalmente

3. Manter o polling ativo mesmo no estado "disconnected" (a cada 30s) para detectar reconexão automática do celular ao servidor.

### Mudanças específicas

```typescript
// Adicionar ref para contar falhas consecutivas
const consecutiveFailsRef = useRef(0);

// No poll(), quando state === "close":
// Em vez de parar imediatamente:
if (state !== "open" && state !== "connecting") {
  consecutiveFailsRef.current += 1;
  
  if (consecutiveFailsRef.current <= 3) {
    // Retry silencioso - pode ser queda momentânea
    pollRef.current = setTimeout(poll, 5000);
  } else {
    // Realmente perdeu conexão
    setConnectionStatus("disconnected");
    addLog("⚠️ Conexão perdida");
    toast({ title: "Conexão WhatsApp perdida", variant: "destructive" });
    // Continua polling lento para detectar reconexão automática
    pollRef.current = setTimeout(poll, 30000);
  }
}

// Quando state === "open", resetar contador:
consecutiveFailsRef.current = 0;
```

### Resultado esperado
- Quedas momentâneas (< 15s) são recuperadas silenciosamente
- Polling nunca para completamente, permitindo reconexão automática
- Só mostra "Conexão perdida" após confirmar que realmente caiu

