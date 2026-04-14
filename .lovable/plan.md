

# Análise Profunda: Bugs Críticos no Fluxo Finalização → OTP → Assinatura

## Resumo dos Problemas Encontrados

Existem **5 bugs críticos** que impedem o fluxo de funcionar após o clique em "Finalizar". O fluxo atual quebra no momento em que o portal pede o código OTP.

---

## Bug 1: CRÍTICO — `portal_submitting` não está no switch (causa reset total)

Quando o Worker começa a automação, o `conversation_step` do cliente fica como `portal_submitting`. Quando o Worker detecta o campo OTP no portal e muda o `status` para `awaiting_otp`, ele **não muda o `conversation_step`**. Resultado: quando o cliente digita o código OTP no WhatsApp, o webhook vê `conversation_step = "portal_submitting"`, que **não existe no switch-case**. Cai no `default` e **reseta tudo para `welcome`**, perdendo todos os dados.

**Correção**: O Worker precisa atualizar `conversation_step` para `aguardando_otp` junto com o `status`.

## Bug 2: CRÍTICO — Edge Function `submit-otp` não existe

O webhook no passo `aguardando_otp` (linha 1043) tenta chamar `submit-otp`, mas essa edge function **nunca foi criada**. O erro é silenciosamente engolido pelo `catch`. O OTP é salvo no banco, mas o Worker já está fazendo polling — então a intenção original era que o Worker pegasse o OTP via polling, não via edge function. A chamada `submit-otp` é desnecessária e confusa.

**Correção**: Remover a chamada `submit-otp` (o Worker já faz polling e pega o `otp_code` do banco).

## Bug 3: CRÍTICO — Worker não envia o link de assinatura ao cliente

Após preencher o OTP e clicar em "Finalizar" no portal, o Worker salva `link_assinatura` e `status: registered_igreen` no banco, mas **não envia nenhuma mensagem no WhatsApp**. O cliente fica esperando sem receber o link do CertoSign.

**Correção**: O Worker precisa chamar a Evolution API para enviar o link de assinatura via WhatsApp.

## Bug 4: CRÍTICO — Worker não atualiza `conversation_step` para `aguardando_assinatura`

Mesmo se corrigirmos o envio da mensagem, o `conversation_step` nunca é atualizado para `aguardando_assinatura`. Se o cliente responder qualquer coisa depois, o passo continua como `portal_submitting` ou `aguardando_otp` e o bot não sabe o que fazer.

**Correção**: Worker deve atualizar `conversation_step` para `aguardando_assinatura` após sucesso.

## Bug 5: Validação `document_back_url` para CNH

O `validateCustomerForPortal` exige `document_back_url` (verso do documento), mas a CNH não tem verso. O `getNextMissingStep` corretamente pula este campo para CNH, mas o validador final na etapa `finalizando` vai bloquear o envio com erro "Documento (verso) é obrigatório".

**Correção**: Validar `document_back_url` apenas quando `document_type !== "CNH"`.

---

## Plano de Implementação

### Passo 1: Corrigir o Worker (`playwright-automation.mjs`)
- Na função `aguardarOTP`: após atualizar `status: 'awaiting_otp'`, também atualizar `conversation_step: 'aguardando_otp'`
- Após clicar Finalizar e capturar a URL: atualizar `conversation_step: 'aguardando_assinatura'`
- Enviar mensagem WhatsApp com o link de assinatura via Evolution API

### Passo 2: Corrigir o Worker (`server.mjs`)
- Adicionar função `enviarMensagemWhatsApp` que busca a instância do consultor e envia via Evolution API
- Chamar essa função após automação concluída com sucesso

### Passo 3: Corrigir o Webhook (`evolution-webhook/index.ts`)
- Adicionar case `portal_submitting` no switch que responde "Estamos processando seu cadastro..."
- Remover chamada ao `submit-otp` inexistente do case `aguardando_otp`

### Passo 4: Corrigir o Validador (`_shared/validators.ts`)
- Tornar `document_back_url` condicional: só exigir se `document_type !== "CNH"`

---

## Fluxo Correto Após Correções

```text
ask_finalizar (botão "Finalizar")
  → finalizando (validação final)
    → portal_submitting (Worker abre portal, preenche dados)
      → aguardando_otp (Worker detecta campo OTP, atualiza conversation_step)
        → Cliente recebe SMS, digita código no WhatsApp
          → Webhook salva otp_code no banco
            → Worker pega via polling, preenche no portal
              → Worker clica "Enviar/Finalizar"
                → Captura URL final (link CertoSign)
                  → Envia link via WhatsApp ao cliente
                    → conversation_step = "aguardando_assinatura"
                      → complete (após assinatura)
```

### Arquivos Modificados
1. `worker-portal/playwright-automation.mjs` — OTP step + envio link WhatsApp
2. `worker-portal/server.mjs` — Função envio WhatsApp via Evolution API
3. `supabase/functions/evolution-webhook/index.ts` — Case `portal_submitting` + remover `submit-otp`
4. `supabase/functions/_shared/validators.ts` — CNH sem verso

