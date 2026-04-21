

# Plano: QR de redirecionamento eterno (à prova de falha)

## O problema atual

Hoje o QR aponta direto pra `https://api.whatsapp.com/send?phone=5511990092401&...`. Se você trocar de número, perde os 1000 panfletos.

## A solução

O QR vai apontar pra um **link curto da nossa plataforma** que **redireciona dinamicamente** pro WhatsApp atual da sua instância. Assim:

```
QR impresso (FIXO pra sempre):
https://igreen.institutodossonhos.com.br/r/SUALICENCA
                                              │
                                              ▼ (redirect 302 em tempo real)
                                    consulta whatsapp_instances
                                    (busca connected_phone atual)
                                              │
                                              ▼
                       https://api.whatsapp.com/send?phone={NÚMERO_ATUAL}&text=...
```

**Resultado:**
- Trocou de celular → continua valendo ✅
- Trocou de número → atualiza no admin → continua valendo ✅
- Instância caiu → reconectou → continua valendo ✅
- Apagou e criou nova instância → continua valendo ✅
- **Os 1000 panfletos NUNCA quebram**

## Camadas de proteção (defesa em profundidade)

1. **Fallback automático**: se a instância não tiver `connected_phone`, usa o telefone do perfil do consultor (`consultants.phone`)
2. **Fallback final**: se nem isso existir, usa o WhatsApp oficial da iGreen `+55 11 98900-0650`
3. **Cache curto**: o redirect tem cache de 60s pra não sobrecarregar o banco
4. **Tracking**: cada scan registra um evento em `page_events` (panfleto rastreável)

## Implementação

### 1. Edge Function nova: `qr-redirect`
- Path: `supabase/functions/qr-redirect/index.ts`
- Pública (sem JWT), recebe `?l={licenca}` ou `/r/{licenca}` via path
- Lógica:
  1. Busca `consultants` por `license = ?`
  2. Busca `whatsapp_instances.connected_phone` por `consultant_id`
  3. Fallback para `consultants.phone` se não houver instância
  4. Fallback final pro WhatsApp da iGreen
  5. Retorna `302 Redirect` para `https://api.whatsapp.com/send?phone={phone}&text=...`
  6. Registra evento em `page_events` (tipo `qr_scan`, target `panfleto`)

### 2. URL pública amigável
A URL final do QR ficará:
```
https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/qr-redirect?l=SUALICENCA
```

Curta o suficiente pro QR caber bem. Se quiser ainda mais limpo, podemos usar Supabase Edge com domínio custom depois.

### 3. Atualizar `CadastroPage.tsx` (modo print)
Trocar a linha que monta `whatsappBotUrl` pra usar o link de redirect:

```tsx
// Hoje:
const whatsappBotUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${botMessage}`;

// Vai virar (só no print view):
const printQrUrl = `${SUPABASE_URL}/functions/v1/qr-redirect?l=${consultant.license}`;
<QRCodeSVG value={printQrUrl} ... />
```

A tela web do `/cadastro/{licenca}` continua usando o link direto (mais rápido, sem redirect intermediário). **Só o QR impresso usa o redirect**, que é onde precisa ser à prova de falha.

## Validação antes de imprimir

Após implementar, faço um checklist com você:
1. ✅ Escaneia o QR e abre o WhatsApp certo
2. ✅ Simula troca de número (atualiza `connected_phone` no banco) → escaneia de novo → cai no novo número
3. ✅ Apaga a instância → escaneia → cai no fallback do `consultants.phone`
4. ✅ Tudo confirmado → libera pra imprimir os 1000

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/qr-redirect/index.ts` | **Novo** edge function público |
| `supabase/config.toml` | Adicionar `[functions.qr-redirect] verify_jwt = false` |
| `src/pages/CadastroPage.tsx` | Trocar `whatsappBotUrl` por `printQrUrl` no bloco `showPrintView` (1 linha) |

## Risco

**Zero pros panfletos.** A função é simples, isolada, e tem 3 níveis de fallback. Mesmo que o banco caia, o WhatsApp da iGreen oficial sempre responde.

