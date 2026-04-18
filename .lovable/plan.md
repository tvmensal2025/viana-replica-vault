

## Análise profunda do bug "WhatsApp não digita"

### Sintoma nos logs
```
⏳ MutationObserver não detectou — usando polling clássico
⏳ Aguardando campo WhatsApp aparecer (tentativa 1/12)...
... (12 tentativas = 30s perdidos)
✅ [reactFill MASK] (locator): "(11) 98900-0650"
⏳ Aguardando "Confirme seu celular" (tentativa 1/8)
... (8 tentativas = 40s perdidos)
❌ Hard fail
```

O campo **APARECE e é preenchido** (linha "✅ reactFill MASK"), mas:
1. Demora 30s pra detectar (polling de 2.5s × 12)
2. Depois espera campo "Confirme celular" que **não existe mais** no portal
3. A v9 prometeu soft-warn mas o código no VPS ainda é v8

### Causas raiz (análise por campo)

**Campo CPF** — OK, funciona (auto-fill da Receita responde)

**Campo Nome** — quebrado silenciosamente. Log: `Nome="(vazio)"`. O portal preencheu DataNasc mas Nome veio vazio. Worker não valida e segue.

**Campo WhatsApp** — funciona mas com latência absurda:
- MutationObserver falha porque o portal usa React Portal/Suspense (campo não nasce no DOM principal)
- Polling com `page.locator('input[placeholder*="WhatsApp"]')` é lento
- Solução: detectar via `waitForFunction` com query mais flexível (placeholder OU label OU name) + reduzir intervalo para 500ms

**Campo "Confirme celular"** — não existe mais no portal v2026:
- Worker no VPS ainda tem código v8 (8 tentativas hard-fail)
- O patch v9 está no repositório mas o **container não foi rebuildado**
- Confirmar: `docker exec worker grep -n "Confirme seu celular" playwright-automation.mjs`

**Campo Email** — log mostra "[5/16] Email" mas sem confirmação de preenchimento — provavelmente também travou

**Campo Endereço/Número** — `⚠️ Campo Número endereço não encontrado` — selector quebrado

**Campo Instalação** — `⚠️ Campo instalação não encontrado` — selector quebrado

**Tipo Documento** — `⚠️ Tipo documento não selecionado` — MUI Select muda DOM, selector velho

**Upload arquivos** — `0 input(s) file encontrado(s)` — portal usa input file dentro de Shadow DOM ou via dropzone custom

### O verdadeiro problema raiz

**O worker no Easypanel está rodando código v8 antigo.** Todos os patches v9 (poppler, soft-warn confirme celular, hierarquia base64, etc) estão no Git mas o container nunca foi rebuildado/redeployed.

Prova: log mostra "tentativa 8/8" + "fixtures/documento.jpg" + "Conversão PDF→JPG falhou" — exatamente os bugs que a v9 corrigiu.

---

## Plano de ação

### Etapa 1 — Forçar rebuild do worker (CRÍTICO)
Adicionar `/debug/version` endpoint no worker que retorna:
```json
{ "git_sha": "...", "playwright_version": "...", "has_poppler": true/false, "patch_v9": true/false }
```
Usuário acessa essa URL → confirma se v9 está ativa → se não, força redeploy no Easypanel.

### Etapa 2 — Re-mapear TODOS os selectors do portal
O portal mudou (versão atual diferente da memória). Precisa ir lá com Playwright recorder e capturar:
- Selector real do campo WhatsApp
- Selector real do campo Email/Confirme Email
- Selector real do Número endereço
- Selector real do Número instalação
- Selector real do MUI Select de Tipo Documento (3 opções)
- Selector real dos input file (provavelmente atrás de dropzone)
- Como clicar no Finalizar

### Etapa 3 — Reescrever fase WhatsApp com detecção rápida
- Trocar polling de 2.5s por `waitForFunction` com 500ms
- Buscar por **múltiplos critérios em OR**: placeholder, label, name, type=tel
- Se Confirme celular não aparece em 8s → seguir (soft-warn já existe na v9)

### Etapa 4 — Validar Nome obrigatório
- Se Nome ficar vazio após CPF → tentar preencher manualmente do banco
- Se ainda vazio → abortar com `awaiting_cpf_review` (não seguir com nome em branco)

### Etapa 5 — Diagnóstico em tempo real
Tabela `worker_phase_logs(customer_id, phase, status, timestamp, screenshot_url)` + painel no /super-admin mostrando exatamente onde cada lead travou, com link pro screenshot da fase.

### Etapa 6 — Endpoint de re-scan do portal
`POST /worker/portal-introspect` — abre o portal headed (via noVNC), navega até cada fase, dump do DOM, retorna lista de selectors candidatos. Roda 1x por dia para detectar mudanças do portal automaticamente.

---

## Arquivos a alterar

- `worker-portal/server.mjs` — endpoints `/debug/version` e `/worker/portal-introspect`
- `worker-portal/playwright-automation.mjs` — selectors v10, validação de nome, detecção rápida WhatsApp
- `worker-portal/Dockerfile` — adicionar `LABEL version=v10` para forçar rebuild
- Migration: tabela `worker_phase_logs`
- `src/components/superadmin/WorkerPhaseTimeline.tsx` (novo) — timeline visual
- `src/pages/SuperAdmin.tsx` — adicionar aba "Worker Phases"

---

## Resultado esperado

- ✅ Confirmação imediata se worker está rodando v9 ou v8
- ✅ Selectors atualizados para o portal atual (não memória de 2 semanas atrás)
- ✅ Campo WhatsApp detectado em <2s, não 30s
- ✅ "Confirme celular" não trava mais o fluxo
- ✅ Nome vazio vira erro explícito, não silencioso
- ✅ Super Admin vê em tempo real qual fase quebrou e screenshot

