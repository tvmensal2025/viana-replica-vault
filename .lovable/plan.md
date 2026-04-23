

# Análise Completa: Por que JOSE ALVES travou e como blindar para SEMPRE

## O que aconteceu com JOSE ALVES (cronologia real)

```
16:47:12  Cliente disse "Oi, quero saber sobre iGreen"
16:47:14→16:51:39  Fluxo perfeito: conta → OCR → confirmou → RG frente/verso → confirmou
16:51:43  Bot: "Permanecer com (11) 94980-0789?"
16:52:01  Cliente: "2" (editar)
16:52:05  Bot: "Informe o telefone com DDD:"
16:53:06  Cliente: "11997338798" ← número diferente do WhatsApp
16:53:09  Bot: "Informe seu *e-mail*:"   ← ÚLTIMA mensagem
                     ↓
                  [silêncio total]
                     ↓
16:54:13  NOVO LEAD criado (78ba50f3) com phone 5511949800789  ← número da PRÓPRIA INSTÂNCIA
```

**Conclusão técnica**: O bot funcionou 100% até pedir o e-mail. O cliente simplesmente **não respondeu o e-mail** (talvez foi pego pelo cron de `crm-auto-progress` que mexeu, ou o cliente abandonou). O lead `78ba50f3` foi criado quando alguém usou o **próprio celular do suporte iGreen** para testar — o webhook não tem proteção contra "consultor manda mensagem do próprio número conectado".

## Os 5 buracos identificados que PODEM travar futuros cadastros

| # | Buraco | Risco | Onde |
|---|--------|-------|------|
| 1 | Cliente abandona após pergunta (não responde) | Lead fica eterno em `ask_email`/`ask_cpf`/etc | Sistema atual |
| 2 | Mensagem do próprio número conectado vira novo lead | Polui base, confunde dedup | `evolution-webhook/index.ts` |
| 3 | Validação de email/CPF/CEP rejeita silenciosamente sem orientação clara | Cliente confuso, abandona | `bot-flow.ts` |
| 4 | OCR retorna sucesso=true mas com dados vazios | Dados em branco passam pro portal | `bot-flow.ts` linhas 250-269 |
| 5 | Bot stuck recovery roda só a cada 30 min | JOSE ficaria parado 30min antes do resgate | `pg_cron` schedule |

## Plano de blindagem definitiva

### Correção 1: Filtro anti-self-message
Em `parseEvolutionMessage` (`_shared/evolution-api.ts`), adicionar parâmetro `instanceConnectedPhone` e ignorar quando `remoteJid` corresponde ao próprio número conectado. Atualizar `evolution-webhook/index.ts` para buscar `connected_phone` da `whatsapp_instances` e passar.

### Correção 2: Resgate ativo mais agressivo (3 níveis)
Mudar `bot-stuck-recovery` para 3 estágios:
- **5 min**: re-pergunta gentil ("Oi! Ainda está aí? [pergunta]")
- **2h**: re-pergunta com urgência + opção de pular ("Para finalizar, preciso do email — ou digite *PULAR*")
- **24h**: marca status `abandoned` + alerta no painel admin

Mudar cron de **30 min para 5 min** (combina com o threshold).

### Correção 3: Permitir "pular" campos opcionais via comando
Em `ask_email`, `ask_complement` aceitar `pular`/`skip`/`não tenho` para usar fallback automático (`{phone}@lead.igreen` para email, vazio para complemento). Isso garante que o fluxo nunca trave em campo "opcional".

### Correção 4: Validação OCR mais rigorosa
No `bot-flow.ts` aguardando_conta/doc_verso, depois de `ocrData.sucesso`, validar se ao menos 3 campos críticos vieram preenchidos. Se não, tratar como falha e contar tentativa.

### Correção 5: Mensagem de erro com exemplo concreto
Trocar mensagens genéricas tipo `"❌ E-mail inválido. Digite um e-mail válido"` por:
```
❌ Não consegui ler esse e-mail.
✅ Exemplo correto: joao.silva@gmail.com
Ou digite *PULAR* se preferir não informar.
```

### Correção 6: Heartbeat no painel Super Admin
Adicionar widget "Leads Travados Agora" no Super Admin que mostra em tempo real leads com `last_bot_reply_at > 10 min` no step `ask_*` — para você ter visibilidade imediata.

### Correção 7: Fix imediato do JOSE ALVES
Atualizar o lead `fbd0e3d1` (JOSE) — colocar email auto `5511997338798@lead.igreen` e re-enviar próxima pergunta para retomar.
Excluir o lead lixo `78ba50f3` (auto-mensagem).

## Detalhes técnicos

**Arquivos a modificar:**
- `supabase/functions/_shared/evolution-api.ts` — adicionar `instanceConnectedPhone` em `parseEvolutionMessage`
- `supabase/functions/evolution-webhook/index.ts` — buscar `connected_phone`, passar pro parser
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts` — comando "pular" em ask_email/ask_complement, validação OCR rigorosa, mensagens com exemplo
- `supabase/functions/bot-stuck-recovery/index.ts` — 3 estágios (5min/2h/24h)
- Migration: alterar cron `bot-stuck-recovery-30min` → `bot-stuck-recovery-5min`
- `src/components/superadmin/` — novo componente `StuckLeadsWidget.tsx`
- SQL ad-hoc: corrigir JOSE ALVES + remover lead lixo

**Garantias:**
- ✅ Self-message do consultor nunca cria lead novo
- ✅ Bot **nunca** fica em silêncio > 5 min
- ✅ Cliente **nunca** trava em campo opcional (sempre pode pular)
- ✅ OCR vazio é tratado como falha (não passa lixo adiante)
- ✅ Sentry captura toda anomalia
- ✅ Painel mostra leads travados em tempo real

**O que fica intocado:**
- Lógica do portal-worker (já estável)
- Anti-blocking de WhatsApp
- Estrutura do banco (apenas dados de exemplo serão corrigidos)

