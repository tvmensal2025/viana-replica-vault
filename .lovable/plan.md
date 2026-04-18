# PLANO DEFINITIVO — Worker Portal iGreen v11 (Zero-Erro)

> **Objetivo**: Eliminar 100% dos erros recorrentes do worker (`#:r3:` CSS errors, distribuidora inexistente, email duplicado, instalação duplicada, CNH com 2 uploads, address auto-fill ignorado).
> **Validado live em 2026-04-18** com Playwright + dados reais (HUMBERTO VIEIRA E SILVA, CEP 13309-410, CPF/CNH/Conta).
> **Baseline**: Worker v10.4 falha consistentemente em phase 3c (`Unexpected token "#"`).

---

## 🔥 As 7 leis imutáveis (NUNCA quebrar)

| # | Lei | Por quê | Como aplicar |
|---|-----|---------|--------------|
| 1 | **NUNCA usar CSS `#id` em React 18** | IDs MUI viram `:r3:` `:r5:` que quebram CSS parser | Sempre `input[placeholder="EXATO"]` ou `[role="combobox"]` |
| 2 | **CPF auto-preenche → SEMPRE validar Nome != ""** | CPF inválido bloqueia silenciosamente | `await page.waitForFunction(() => nomeInput.value !== "", { timeout: 5000 })` |
| 3 | **Email tem unicidade no portal** | Duplicado bloqueia form | Detectar texto "já cadastrado" → fallback `{cpf}@temp.igreen.com.br` |
| 4 | **CEP auto-preenche endereço** | Mas pode falhar em CEPs raros | Esperar 3s; se vazio → preencher manual com `customer.address_*` |
| 5 | **NÃO existe combobox "Distribuidora"** | Inferida do CEP no backend | NUNCA tentar abrir esse combobox |
| 6 | **Instalação tem unicidade** | Reuso aborta tudo | Detectar "Número de instalação já cadastrado" → status `installation_duplicate` |
| 7 | **CNH = 1 upload, RG = 2 uploads** | Verso obrigatório só para RG | `if (docType === 'CNH') skip(verso)` |

---

## 📋 As 4 fases do worker v11 (sequência atômica)

### FASE 1 — Simulador
```js
await page.fill('input[placeholder="CEP"]', cep);
await page.fill('input[placeholder="Valor da conta"]', billValue);
await page.click('button:has-text("Calcular")');
await page.waitForSelector('button:has-text("Garantir meu desconto")', { timeout: 10000 });
await page.click('button:has-text("Garantir meu desconto")');
```

### FASE 2 — Formulário progressivo (15 inputs sequenciais)
Cada input é atômico: **preencher → blur → aguardar próximo bloco aparecer → log fase**.

```js
const fields = [
  { ph: 'CPF ou CNPJ', val: cpf, after: async () => {
      // LEI 2: validar nome auto-preenchido
      await page.waitForFunction(
        () => document.querySelector('input[placeholder="Nome completo"]')?.value !== '',
        { timeout: 5000 }
      ).catch(() => { throw new Error('CPF_INVALID'); });
  }},
  { ph: 'Número do seu WhatsApp', val: phone },
  { ph: 'Confirme seu celular', val: phone },
  { ph: 'E-mail', val: email, after: async () => {
      // LEI 3: detectar email duplicado
      const dup = await page.locator('text=/já cadastrado/i').count();
      if (dup > 0) {
        await page.fill('input[placeholder="E-mail"]', `${cpf}@temp.igreen.com.br`);
      }
  }},
  { ph: 'Confirme seu E-mail', val: emailFinal },
  // CEP já vem auto da fase 1, mas valida
  { ph: 'Número', val: addressNumber, nth: 1 }, // segundo input "Número"
  { ph: 'Complemento', val: complement, optional: true },
  { ph: 'Número da instalação', val: installation, after: async () => {
      // LEI 6: detectar instalação duplicada
      const dup = await page.locator('text=/instalação já cadastrad/i').count();
      if (dup > 0) throw new Error('INSTALLATION_DUPLICATE');
  }},
];
```

**Combobox documento (LEI 7)**:
```js
await page.locator('[role="combobox"]').filter({ hasText: 'Tipo documento' }).click();
const docLabel = customer.document_type === 'cnh' ? 'CNH' : 'RG (Novo)';
await page.locator(`li[role="option"]:has-text("${docLabel}")`).click();
```

### FASE 3 — Uploads condicionais (LEI 7)
```js
const inputs = page.locator('input[type="file"]');
await inputs.nth(0).setInputFiles(frontePath);

if (docType !== 'CNH') {
  await inputs.nth(1).setInputFiles(versoPath);
}

// Conta de luz no próximo índice livre
const billIndex = (docType === 'CNH') ? 1 : 2;
await inputs.nth(billIndex).setInputFiles(billPath);
```

### FASE 4 — Finalizar + OTP polling
```js
await page.click('button:has-text("Finalizar")');
await page.waitForSelector('text=/código enviado/i', { timeout: 30000 });
// OTP chega via webhook Evolution → polling em customers.otp_code
```

---

## 🛡️ Telemetria obrigatória (worker_phase_logs)

Cada fase grava **ANTES** e **DEPOIS**:
```js
async function logPhase(phase, status, extra = {}) {
  await supabase.from('worker_phase_logs').insert({
    customer_id: customerId,
    phase,
    status, // 'started' | 'success' | 'failed' | 'skipped'
    selector_used: extra.selector,
    message: extra.message,
    duration_ms: extra.duration,
    screenshot_url: extra.screenshot,
    worker_version: 'v11.0-2026.04.18',
    attempt: extra.attempt || 1,
  });
}
```

Em qualquer `catch`: tirar screenshot + upload no MinIO + gravar `failed`.

---

## 🚦 Status finais possíveis (customer.status)

| Status | Causa | Próxima ação |
|--------|-------|--------------|
| `portal_submitted` | OTP recebido + finalizado | ✅ sucesso |
| `awaiting_cpf_review` | CPF não auto-preencheu | Bot pede novo CPF |
| `email_duplicate` | Email + fallback também duplicado | Admin manual |
| `installation_duplicate` | Lead já existe | Marcar duplicata, avisar lead |
| `portal_timeout` | Algum waitFor estourou | Auto-requeue em 10min |
| `automation_failed` | Erro não previsto | Auto-requeue em 10min, max 3x |

---

## 🚀 Plano de redeploy (Easypanel)

1. **Bumpar Dockerfile**:
   ```dockerfile
   LABEL version="v11.0-2026.04.18"
   ENV WORKER_VERSION=v11.0-2026.04.18
   ```
2. **Reescrever `worker-portal/playwright-automation.mjs`** aplicando os 4 blocos acima
3. **Easypanel → portal-worker → Deploy → "Force rebuild without cache"**
4. **Validar**: `curl https://portal-worker.d9v83a.easypanel.host/health` retorna `worker_version: v11.0`
5. **Smoke test**: enviar lead-test.json via `POST /submit-lead` → ver timeline em `/super-admin > Worker Phases`

---

## ✅ Critérios de aceite (zero-erro)

- [ ] Nenhum log com `Unexpected token "#"` em 24h
- [ ] CPF inválido → status `awaiting_cpf_review` (não `automation_failed`)
- [ ] Email duplicado → fallback automático (sem intervenção)
- [ ] CNH faz só 1 upload (não tenta Verso)
- [ ] Endereço auto-preenchido em 95%+ dos CEPs SP/RJ/MG
- [ ] Instalação duplicada → status `installation_duplicate` em <30s
- [ ] Worker_phase_logs tem 1 linha por fase, sem buracos

---

## 📦 Arquivos a alterar

1. `worker-portal/playwright-automation.mjs` — reescrita completa v11
2. `worker-portal/Dockerfile` — bump version label + env
3. `worker-portal/phase-logger.mjs` — adicionar helper `logPhase()` se não tiver
4. `supabase/functions/evolution-webhook/index.ts` — handler para status `installation_duplicate` e `email_duplicate` (mensagem WhatsApp pro lead)
5. `src/components/superadmin/WorkerPhaseTimeline.tsx` — botão "Reprocessar" + filtro status
