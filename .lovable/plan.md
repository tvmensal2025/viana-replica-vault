

## Análise do problema

O usuário relatou que quando o lead escolhe "RG" mas envia uma CNH (ou vice-versa), o worker:
1. Não detecta a inconsistência
2. Não tem mecanismo de "voltar" e corrigir o tipo de documento
3. Trava sem conseguir avançar

Vou inspecionar o código atual antes de propor o plano para garantir precisão.

### Fluxo correto definido pelo usuário (do 0 ao fim)
1. Landing: CEP + Valor → "Calcular" → "Garantir meu desconto"
2. CPF → auto-preenche Nome + Data Nascimento
3. WhatsApp + Confirmação WhatsApp
4. E-mail + Confirmação E-mail
5. CEP auto-preenche Endereço/Bairro/Cidade/Estado
6. Número + Complemento
7. Distribuidora (MUI Select manual)
8. Número da instalação
9. Tipo documento (RG Antigo / RG Novo) — **CNH precisa ser tratada**
10. Upload Frente + Verso (RG) **OU apenas Frente (CNH)**
11. Procurador → "Não"
12. Débito em aberto → "Não"
13. Finalizar (pode disparar OTP)

### Pontos críticos a resolver
- **Detecção automática do tipo real do documento** via OCR antes do upload (já temos OCR no sistema — `_shared/ocr.ts`)
- **Auto-correção do MUI Select** quando o documento enviado não bate com o tipo selecionado pelo cliente no WhatsApp
- **Mapeamento determinístico**: CNH → "RG (Novo)" no portal (já está na memória v5), mas precisa de **upload de apenas 1 lado** quando for CNH
- **Mecanismo de retry inteligente** por etapa (não só global): se uma etapa falhar, tentar estratégia alternativa antes de marcar como erro
- **Validação pós-preenchimento** de cada campo antes de avançar (ler o `value` real do input após digitar)
- **Fallbacks defensivos** para cada MUI Select e cada radio (Procurador/Débito) usando múltiplos seletores

## Plano de correção — "Fluxo à prova de erro"

### Fase 1 — Detecção e normalização do documento (worker + bot)
1. **OCR pré-upload no worker**: antes de fazer upload no portal, baixar `document_front_url` e rodar uma classificação rápida (já temos `_shared/ocr.ts` com Gemini). Detectar se é RG ou CNH lendo o cabeçalho do documento.
2. **Auto-correção do tipo**: se o cliente disse "RG" mas a IA detectar "CNH" (ou vice-versa), o worker:
   - Atualiza `customers.document_type` para o tipo correto
   - Loga no `worker_run_logs` (ou status_history) a correção
   - Continua o fluxo com o tipo corrigido — **nunca trava**
3. **CNH = upload só da frente**: o worker pula o passo "verso" quando `document_type === 'cnh'` (já há lógica em `mem://validation/document-requirements`, garantir que o worker respeite isso).

### Fase 2 — Fluxo Playwright robusto (`worker-portal/playwright-automation.mjs`)
Reescrever o fluxo em **etapas atômicas com retry individual** (3 tentativas cada, com estratégias diferentes):

```text
[Etapa] → tenta seletor primário
       ↓ falha
       → tenta seletor alternativo (label / role / nth)
       ↓ falha
       → tenta digitação caractere-por-caractere + blur
       ↓ falha
       → screenshot + log estruturado + segue para próxima etapa não-bloqueante
                                        OU aborta com motivo claro se for bloqueante
```

Etapas a refatorar com esse padrão:
- `fillCEPLanding`, `fillValor`, `clickCalcular`, `clickGarantirDesconto`
- `fillCPF` + `waitAutoFillNomeDataNasc` (poll por até 10s)
- `fillWhatsApp` + `fillConfirmaWhatsApp` (validar dígitos iguais antes de avançar)
- `fillEmail` + `fillConfirmaEmail`
- `waitAutoFillEndereco` + `fillNumero` + `fillComplemento`
- `selectDistribuidora` (MUI: abrir, buscar opção por regex case-insensitive, fallback 1ª opção)
- `fillInstalacao`
- `selectTipoDocumento` (mapa: `rg_antigo→"RG (Antigo)"`, `rg_novo|rg→"RG (Novo)"`, `cnh→"RG (Novo)"`)
- `uploadFrente` + (`uploadVerso` apenas se RG)
- `selectRadio('procurador', 'Não')`
- `selectRadio('debito', 'Não')`
- `clickFinalizar`
- `waitOTP` (polling no Supabase com timeout 5min)

### Fase 3 — Validação final por etapa
Após cada `fill`, ler `inputElement.evaluate(el => el.value)` e comparar com o esperado (apenas dígitos para campos com máscara). Se não bater, retentar a digitação. Isso elimina os casos em que a máscara React-IMask "comeu" caracteres.

### Fase 4 — Telemetria e observabilidade
Criar tabela `worker_run_logs` (id, customer_id, run_id, stage, status, message, screenshot_url, created_at) e gravar 1 linha por etapa. Permite saber **exatamente** onde travou se acontecer.

### Fase 5 — Atualização do bot WhatsApp
- Quando o cliente mandar a foto, rodar OCR imediato e **avisar** ("Recebi sua CNH, vou usá-la, ok?") em vez de aceitar passivamente.
- Pergunta de débito/procurador é assumida como "Não" por padrão (cliente não precisa responder no WhatsApp — worker já clica "Não").

### Arquivos a alterar
- `worker-portal/playwright-automation.mjs` — refatoração para etapas atômicas + retries individuais
- `worker-portal/server.mjs` — gravação em `worker_run_logs`
- `supabase/functions/_shared/ocr.ts` — novo helper `classifyDocumentType(url)` (RG/CNH)
- `supabase/functions/whatsapp-bot/index.ts` — chamar classificação ao receber foto e auto-corrigir `document_type`
- `supabase/migrations/<nova>.sql` — criar tabela `worker_run_logs` com RLS admin-only
- `.lovable/memory/automation/portal-form-selectors.md` — atualizar para v6 com a regra "CNH = só frente, mapeia para RG (Novo)"

### Garantias do plano
- **Nunca trava por escolha errada do cliente**: OCR auto-detecta e corrige
- **Nunca trava por máscara**: validação pós-fill com retry de digitação
- **Nunca trava por MUI Select**: 3 estratégias de seleção + fallback
- **Sempre observável**: `worker_run_logs` mostra etapa exata se falhar
- **CNH tratada nativamente**: 1 upload só, mapeada para "RG (Novo)"

