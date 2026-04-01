

# Corrigir nomes dos contatos na sidebar do WhatsApp

## Problemas identificados

1. **"Voce" aparece em varios contatos**: Quando `lastMessage.key.fromMe === true`, o `pushName` da ultima mensagem e o nome do proprio usuario. O codigo usa `chat.lastMessage?.pushName` como fonte de nome, entao quando a ultima mensagem foi enviada por voce, o nome do contato vira "Voce" (seu pushName).

2. **Numeros sem formatacao**: Contatos sem nome salvo mostram numeros longos sem formatacao (ex: `271313319006255`). Esses parecem ser numeros internacionais sem o padrao BR esperado pela funcao `formatPhoneNumber`.

## Solucao

### Arquivo: `src/hooks/useChats.ts` — funcao `mapChat`

**Correcao 1: Ignorar pushName de mensagens enviadas por voce**
- O `chat.lastMessage?.pushName` so deve ser usado quando `fromMe === false`, pois quando `fromMe === true` o pushName e do proprio usuario, nao do contato.

**Correcao 2: Melhorar formatacao de numeros internacionais**
- Expandir `formatPhoneNumber` para formatar numeros com DDI (55) e tambem exibir numeros internacionais de forma mais legivel com espacos.

### Mudancas especificas

```typescript
// Linha 62 — nao usar pushName da lastMessage se fromMe === true
const lastMsgPushName = chat.lastMessage?.key?.fromMe 
  ? undefined 
  : chat.lastMessage?.pushName;

const nameSource = chat.pushName || lastMsgPushName || contact?.pushName || chat.name;
```

```typescript
// formatPhoneNumber — suportar numeros internacionais
function formatPhoneNumber(raw: string): string {
  // Numeros BR
  if (/^55\d{10,11}$/.test(raw)) {
    const ddd = raw.slice(2, 4);
    const number = raw.slice(4);
    if (number.length === 9) return `(${ddd}) ${number.slice(0,5)}-${number.slice(5)}`;
    if (number.length === 8) return `(${ddd}) ${number.slice(0,4)}-${number.slice(4)}`;
  }
  // Outros numeros longos — inserir espacos para legibilidade
  if (raw.length > 8) {
    return `+${raw.slice(0, 2)} ${raw.slice(2)}`;
  }
  return raw;
}
```

## Resultado esperado
- Contatos com nome salvo mostrarao o nome correto (nao "Voce")
- Contatos sem nome mostrarao o numero formatado de forma legivel

