

# Plano: Redesign Completo do Fluxo do Bot WhatsApp

## Problema Atual
A primeira mensagem do bot é genérica e já pede a conta de energia direto, sem dar opções ao cliente. Falta persuasão, falta menu inicial, e não envia o vídeo explicativo.

## Novo Fluxo Completo (Mapeado)

```text
Cliente envia qualquer mensagem
         │
         ▼
┌─────────────────────────────────┐
│  WELCOME (Menu Inicial)         │
│                                 │
│  "Olá! Sou assistente da       │
│  *[Nome Representante]*..."     │
│                                 │
│  1️⃣ Entender como funciona     │
│  2️⃣ Cadastrar                  │
│  3️⃣ Falar com humano           │
└─────────────────────────────────┘
         │
    ┌────┼────────────────┐
    ▼    ▼                ▼
 Opção 1  Opção 2       Opção 3
    │       │              │
    ▼       │              ▼
┌──────┐    │    ┌──────────────────┐
│VÍDEO │    │    │ "Um consultor    │
│Conexão│   │    │  entrará em      │
│Green  │   │    │  contato!"       │
│enviado│   │    │  [FIM temporário]│
└──────┘    │    └──────────────────┘
    │       │
    ▼       │
┌──────────┐│
│Pós-vídeo ││
│           ││
│ 2️⃣ Cad.  │◄┘
│ 3️⃣ Humano│
└──────────┘
    │
    ▼
┌──────────────────────┐
│ BOT CADASTRO         │
│ (fluxo atual:        │
│  aguardando_conta    │
│  → OCR → docs → etc)│
└──────────────────────┘
```

## Mudanças Técnicas

### 1. Edge Function `evolution-webhook/index.ts`

**Case `welcome`** — Substituir a mensagem atual por menu com 3 opções:
- Mensagem persuasiva com emojis, mencionando 20% de desconto
- Enviar via `sendButtons` com 3 botões: `entender_desconto`, `cadastrar_agora`, `falar_humano`
- Manter `conversation_step = "welcome"` (o próximo step depende da resposta)

**Novo case `menu_inicial`** — Processa a resposta do menu:
- **Opção 1 (`entender_desconto`)**: Envia o vídeo Conexão Green via `sendMedia` (nova função), depois envia menu reduzido (Cadastrar / Falar com Humano). Step → `pos_video`
- **Opção 2 (`cadastrar_agora`)**: Step → `aguardando_conta` (inicia bot atual)
- **Opção 3 (`falar_humano`)**: Envia mensagem "Um consultor entrará em contato em breve!". Step → `aguardando_humano`

**Novo case `pos_video`** — Menu pós-vídeo:
- Opção 2: Cadastrar → `aguardando_conta`
- Opção 3: Falar com humano → `aguardando_humano`

**Novo case `aguardando_humano`** — Qualquer msg recebida responde que o consultor foi notificado.

### 2. Nova função `sendMedia` em `_shared/evolution-api.ts`

Adicionar função para enviar vídeo/imagem via Evolution API endpoint `message/sendMedia`:
```typescript
async function sendMedia(remoteJid, mediaUrl, caption, mediatype)
```
Será usada para enviar o vídeo do Supabase Storage (URL já existente no projeto).

### 3. Atualizar `_shared/whatsapp-api.ts`

Adicionar `sendMedia` ao sender existente (consistência).

### 4. Variável do vídeo

Usar a URL já existente no projeto:
`https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/video%20igreen/WhatsApp%20Video%202025-05-29%20at%2021.37.39.mp4`

### 5. Deploy

Redeployar a Edge Function `evolution-webhook`.

## Arquivos Modificados

1. **`supabase/functions/_shared/evolution-api.ts`** — Adicionar `sendMedia`
2. **`supabase/functions/evolution-webhook/index.ts`** — Novo fluxo welcome → menu_inicial → pos_video → aguardando_humano
3. **`supabase/functions/_shared/whatsapp-api.ts`** — Adicionar `sendMedia` (consistência)

## Resultado Final

- Cliente recebe mensagem persuasiva com 3 opções claras
- Opção 1 envia o vídeo automaticamente, depois oferece Cadastrar ou Falar com Humano
- Opção 2 inicia o cadastro direto (fluxo existente preservado 100%)
- Opção 3 encaminha para atendimento humano
- Zero chance de erro: todas as respostas inesperadas reenviam o menu

