

## Diagnóstico real (logs + CNH)

**Problemas observados nos logs:**
1. ⏳ Campo "WhatsApp" demorou 6 tentativas (limite) para aparecer → frágil
2. ⚠️ "Confirme seu celular" não foi encontrado → fallback ativado, validação pode falhar silenciosamente
3. 🎂 OCR da CNH **extraiu data de nascimento errada** → bot salvou no `customers.data_nascimento` → worker pode tentar sobrescrever a data correta que o portal auto-preenche via CPF

**Causa raiz da data errada:**
- CNH tem data em layout não-padrão; Gemini às vezes confunde "Data de Emissão" com "Data de Nascimento"
- Bot salva o que veio do OCR sem validar contra o CPF
- Worker confia no banco em vez de confiar no auto-fill do portal (que vem da Receita Federal)

## Plano: "Sempre dá certo" — fluxo blindado

### 1. Confiar no portal, não no OCR (data de nascimento)
**Regra de ouro:** após digitar CPF, o portal consulta a Receita e auto-preenche **Nome + Data de Nascimento corretos**. O worker NUNCA deve sobrescrever esses campos. Hoje o código já não sobrescreve, mas vamos:
- Adicionar `waitForAutoFill(['nome', 'nascimento'], timeout: 15s)` com polling do `value` real
- Se auto-fill falhar (CPF inexistente na Receita), aí sim usar dados do banco como fallback
- Logar no console: `📥 Portal auto-preencheu: Nome="..." DataNasc="..."` para auditoria

### 2. OCR de CNH com prompt reforçado anti-confusão
Atualizar `buildPromptDocumento` para CNH com regras explícitas:
- "Data de Nascimento" fica perto do nome, NÃO confundir com:
  - "Data de Emissão" / "Data de Expedição"
  - "Validade" / "Vencimento"  
  - "1ª Habilitação"
- Adicionar campo de validação: se data > hoje OU < 1920 → descartar
- Pedir ao Gemini para devolver `dataNascimentoConfianca: "alta|media|baixa"` baseado em proximidade ao label "Nascimento"

### 3. Bot WhatsApp: nunca confiar cegamente no OCR
Quando OCR retorna data, **comparar com data esperada do CPF** (se houver consulta CPF→nascimento) ou pedir confirmação explícita ANTES de salvar:
> "🎂 Detectei nascimento *15/03/1985*. Está correto? (1-Sim / 2-Não, digite a data correta)"

Se cliente disser não, marcar `data_nascimento_verified=false` e o worker IGNORA esse campo (deixa o portal preencher via CPF).

### 4. Worker robusto — eliminar timeouts apertados
Refatorar a fase WhatsApp/Confirmação:
- Aumentar tentativas: 6 → 12 e delay 2s → 1.5s (total 18s)
- Antes de procurar campo, aguardar `domcontentloaded` + observar mutações do DOM (esperar input aparecer via MutationObserver)
- Se "Confirme seu celular" não aparecer após digitar WhatsApp, **disparar blur+wait** e re-procurar (pode renderizar só após blur)
- Trocar fallback silencioso por **erro hard** se confirmação não preencher → garante que não avança quebrado

### 5. Validação pós-fill universal
Após cada campo crítico (CPF, WhatsApp, Email, CEP), ler `value` real e comparar:
- Se diverge → retentar até 3x
- Se ainda diverge → screenshot + log + NÃO avançar

### 6. Telemetria mínima (sem nova tabela ainda)
Padronizar logs do worker em formato estruturado: `[FASE_X] [STATUS] mensagem` para facilitar debug nos logs do Easypanel sem precisar criar `worker_run_logs` agora.

## Arquivos a alterar

- `supabase/functions/_shared/ocr.ts` — prompt CNH reforçado + validação de data plausível
- `supabase/functions/evolution-webhook/index.ts` — confirmação explícita da data antes de salvar
- `worker-portal/playwright-automation.mjs`:
  - `waitForAutoFill()` helper novo (polling de Nome+DataNasc após CPF)
  - Fase WhatsApp: 12 tentativas + MutationObserver
  - Confirme celular: hard-fail em vez de warn silencioso
  - Validação pós-fill universal
- `.lovable/memory/automation/portal-form-selectors.md` → v7 com regra "data nasc vem do portal via CPF, nunca sobrescrever"

## Garantias
- ✅ Data de nascimento sempre correta (vem do portal via CPF, não do OCR)
- ✅ Cliente confirma data quando OCR é usado isoladamente
- ✅ WhatsApp/Confirmação não falha silenciosamente
- ✅ Logs estruturados mostram fase exata se algo falhar

