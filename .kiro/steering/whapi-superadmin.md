---
inclusion: auto
---

# Whapi — Super Admin (rafael.ids@icloud.com)

## Arquitetura de APIs WhatsApp

| Quem | API | Botões | Número |
|------|-----|--------|--------|
| **Consultores** | Evolution API | ❌ Texto com opções numeradas (`sendOptions`) | Cada consultor tem sua instância |
| **Super Admin** | Whapi Cloud | ✅ Botões reais do WhatsApp (`quick_reply`) | +55 11 99009-2401 (suporte-igreen) |

## Regras

1. O Whapi é EXCLUSIVO do super admin `rafael.ids@icloud.com` — canal `SHAZAM-A79TY`
2. O Whapi NÃO interfere nas instâncias Evolution dos consultores
3. O super admin usa botões REAIS do WhatsApp (quick_reply) via Whapi
4. Os consultores continuam usando texto com opções numeradas via Evolution API

## Whapi API — Enviar botões

**Endpoint:** `POST https://gate.whapi.cloud/messages/interactive`
**Auth:** `Authorization: Bearer {WHAPI_TOKEN}`

### Botões quick_reply (até 3, máx 25 chars cada):
```json
{
  "body": { "text": "Mensagem principal" },
  "footer": { "text": "Rodapé opcional" },
  "action": {
    "buttons": [
      { "type": "quick_reply", "title": "✅ SIM", "id": "sim" },
      { "type": "quick_reply", "title": "❌ NÃO", "id": "nao" }
    ]
  },
  "type": "button",
  "to": "5511999992401"
}
```

### Resposta do webhook quando cliente clica botão:
```json
{
  "reply": {
    "type": "buttons_reply",
    "buttons_reply": {
      "id": "ButtonsV3:sim",
      "title": "✅ SIM"
    }
  }
}
```

### Lista de opções (mais de 3 itens):
```json
{
  "body": { "text": "Escolha uma opção:" },
  "action": {
    "list": {
      "sections": [{
        "title": "Opções",
        "rows": [
          { "title": "Opção 1", "id": "op1", "description": "Descrição" },
          { "title": "Opção 2", "id": "op2", "description": "Descrição" }
        ]
      }],
      "label": "Ver opções"
    }
  },
  "type": "list",
  "to": "5511999992401"
}
```

### Enviar texto simples:
`POST https://gate.whapi.cloud/messages/text`
```json
{ "to": "5511999992401", "body": "Mensagem de texto" }
```

## Dados do canal Whapi
- Canal: `SHAZAM-A79TY`
- Nome: `suporte-igreen`
- Número: `+55 11 99009 2401`
- Base URL: `https://gate.whapi.cloud`
- Token: armazenado na tabela `settings` como `whapi_token`
