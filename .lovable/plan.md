

## Bug: link errado enviado após OTP

### O que está acontecendo

Após o cliente digitar o OTP, o worker procura o link de validação facial na página com a estratégia 1:

```js
'a[href*="certisign"]', 'a[href*="assinatura"]', 'a[href*="sign"]',  // ← BUG
'a[href*="facial"]', 'a[href*="biometria"]', 'a[href*="validacao"]',
```

O seletor `a[href*="sign"]` faz match parcial com qualquer URL que contenha `sign` — incluindo `B2C_1A_SIGNUP_SIGNIN_MFA_FRONT` da CPFL. Quando a página pós-OTP renderiza o link da CPFL (banner de autenticação da distribuidora) **antes** do link real da iGreen, o worker captura o link errado e envia ao cliente.

O link correto da iGreen segue o padrão:
```
https://digital.igreenenergy.com.br/validacao-codigo/{codigoCliente}?id={consultorId}&sendcontract=true
```

E hoje está sendo **descartado pela blacklist** em `server.mjs:195` (que ignora qualquer URL com `digital.igreenenergy.com.br` por achar que é a URL genérica do portal).

### Correção

**Arquivo: `worker-portal/playwright-automation.mjs`** (estratégia de captura do link facial, ~linhas 1657-1707)

1. **Estratégia 1 (NOVA — prioridade máxima):** procurar especificamente o padrão iGreen `digital.igreenenergy.com.br/validacao-codigo/...` no DOM, na URL atual e em iframes. Se achar, usa esse link e ignora todo o resto.

2. **Estratégia 2 (refinada):** trocar `a[href*="sign"]` por seletores mais específicos:
   - `a[href*="certisign.com"]`
   - `a[href*="/assinatura"]`, `a[href*="/sign/"]`, `a[href*="/signature"]`
   - `a[href*="/facial"]`, `a[href*="/biometria"]`, `a[href*="/validacao-codigo"]`, `a[href*="/reconhecimento"]`, `a[href*="/selfie"]`
   - Remove o `*="sign"` solto que matchava `signin` da CPFL.

3. **Blacklist anti-CPFL:** em qualquer estratégia, descartar URLs que contenham `cpflb2cprd`, `b2clogin.com`, `microsoftonline`, `oauth2/v2.0/authorize` — são telas de login de distribuidora, nunca o link facial.

4. **Validação final:** antes de salvar e enviar, validar o link capturado contra um regex positivo: deve conter um destes domínios/paths: `digital.igreenenergy.com.br/validacao-codigo`, `certisign`, `/facial`, `/biometria`, `/selfie`, `/assinatura`. Se não passar, lança erro claro `"Link facial inválido capturado: <url>"` em vez de enviar lixo ao cliente.

5. **Fallback construtivo:** se nenhum link foi achado mas o portal mostra texto de sucesso (`código validado`, `cadastro concluído`), tentar **construir** o link a partir do `igreen_code` do cliente no banco + `igreen_id` do consultor: `https://digital.igreenenergy.com.br/validacao-codigo/{igreen_code}?id={igreen_id}&sendcontract=true`. Se nem isso for possível, falhar explicitamente sem enviar nada.

**Arquivo: `worker-portal/server.mjs`** (~linha 195)

6. **Remover a blacklist** que descarta `digital.igreenenergy.com.br` — agora que a captura prioriza o padrão correto, a URL do portal iGreen passa a ser **desejada**, não evitada. O `sendLinkToCustomer` genérico continua sendo bypass redundante (o `sendFacialLinkToCustomer` interno já envia), então o `if` vira simplesmente: só envia se ainda não houver `link_facial` salvo no banco para esse cliente.

**Migração SQL pontual**

7. Resetar a Zilda (`8e859d0b-38b1-46ab-972e-99f8086a12c0`): limpar `link_facial`, `link_assinatura`, voltar `status='data_complete'`, `conversation_step=null` para o auto-recovery reprocessar com a correção. Manter `otp_code` resetado.

### Detalhes técnicos

| # | Arquivo | Linha | Mudança |
|---|---------|-------|---------|
| 1 | `worker-portal/playwright-automation.mjs` | ~1657 (estratégia 1) | Buscar primeiro `a[href*="digital.igreenenergy.com.br/validacao-codigo"]` + checar `page.url()` |
| 2 | mesma | linha 1659 | Remover `'a[href*="sign"]'`, trocar por `'a[href*="certisign"]', 'a[href*="/sign/"]', 'a[href*="/signature"]'` |
| 3 | mesma | dentro do loop de captura | `if (/cpflb2cprd\|b2clogin\|microsoftonline\|oauth2\/v2/i.test(href)) continue;` |
| 4 | mesma | antes do `if (facialLink)` linha 1712 | `const VALID_FACIAL = /(digital\.igreenenergy\.com\.br\/validacao-codigo\|certisign\|\/facial\|\/biometria\|\/selfie\|\/assinatura)/i; if (facialLink && !VALID_FACIAL.test(facialLink)) { facialLink = null; }` |
| 5 | mesma | novo bloco fallback | Buscar `igreen_code` do customer + `igreen_id` do consultor → construir URL canônica |
| 6 | `worker-portal/server.mjs` | 195 | Remover bloco inteiro do `if (result?.pageUrl && !...)`. Não precisa mais — captura interna já cuida. |
| 7 | Migração SQL | — | `UPDATE customers SET link_facial=NULL, link_assinatura=NULL, status='data_complete', conversation_step=NULL, otp_code=NULL, error_message=NULL, portal_submitted_at=NULL, updated_at=now() WHERE id='8e859d0b-38b1-46ab-972e-99f8086a12c0'` |

### O que NÃO vou alterar

- Não mexo no fluxo de OTP (funciona)
- Não mexo no upload de documentos
- Não mexo na detecção de erros do portal (validações duplicadas continuam sendo logadas)

### Após o deploy

Itens 1-6 entram em vigor no próximo deploy do worker (auto-deploy EasyPanel). Item 7 reativa a Zilda — em ~5min o auto-recovery pega ela e tenta de novo. Desta vez, ao receber o OTP, capturará o link `digital.igreenenergy.com.br/validacao-codigo/...` correto e enviará via WhatsApp.

