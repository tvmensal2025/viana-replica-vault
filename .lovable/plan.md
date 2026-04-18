# Mapeamento Completo do Portal iGreen — Validado Live 2026-04-18

## ✅ O que foi validado ao vivo (browser Playwright)

Percorri o portal `digital.igreenenergy.com.br/?id=124170&sendcontract=true` end-to-end, das 4 etapas:

### Etapa 1 — Simulador (página inicial)
- 2 inputs (`CEP`, `Valor da conta`) + botão `Calcular`
- Após Calcular: aparece banner "Baseado no seu gasto, você poderá economizar..." + botão verde **"Garantir meu desconto"**

### Etapa 2 — Formulário Progressivo (revelado em blocos)
**Ordem real validada:**
1. CPF → auto-preenche Nome + Data de Nascimento (via Receita)
2. WhatsApp + Confirme celular (mesmo valor obrigatório)
3. E-mail + Confirme E-mail (mesmo valor — portal valida unicidade!)
4. CEP (vem auto da etapa 1) + Endereço + Número + Bairro + Cidade + Estado (combobox MUI sem acentos) + Complemento
5. Distribuidora (combobox MUI **filtrado pelo Estado**, não pelo CEP)
6. Número da instalação (aparece após Distribuidora)
7. Tipo documento (combobox MUI: "RG (Antigo)", "RG (Novo)")

### Etapa 3 — Upload de Documentos
- Bloco "Documento pessoal" com 2 cards: **Frente** + **Verso** (labels clickables com input file dentro)
- Bloco "Conta de energia" (aparece depois)

### Etapa 4 — Finalizar/OTP
- Botão "Finalizar" só aparece após uploads
- Dispara OTP via WhatsApp/SMS

---

## 🔥 Descobertas críticas (que estavam quebrando o worker)

### 1. Email tem validação de unicidade no portal
> ⚠️ Mensagem: "Este email já está cadastrado para outro cliente"

**Solução**: se o email do cliente já estiver no portal, gerar fallback `{cpf}@temp.igreen.com.br` ou abortar com status `email_duplicate`.

### 2. Distribuidora é filtrada pelo ESTADO (não pelo CEP)
Memória anterior dizia "filtrada pelo CEP" — **errado**. Ao escolher "Paraiba", a única opção foi "Energisa Paraiba". Ao escolher SP, aparecem 5 opções (CPFL, Elektro, etc).

**Solução**: garantir que Estado seja escolhido **antes** de tentar abrir Distribuidora.

### 3. CPF inválido NÃO trava o form com erro — silenciosamente bloqueia campos seguintes
Tentei `09334548809` (CPF do CELIO) e o portal apenas marcou "CPF inválido" em vermelho mas continuou aceitando outros valores. Os campos seguintes só aparecem após CPF ser **aceito pela Receita**.

**Solução**: após blur do CPF, esperar até 5s e verificar se Nome aparece preenchido. Se não → abortar.

### 4. Estado tem nomes SEM acento (exceto poucos)
Lista exata observada:
- Alagoas, Bahia, Ceara, Espirito Santo, Goias, **Maranhão**, Minas Gerais, Mato Grosso do Sul, Mato Grosso, **Pará**, Paraiba, Pernambuco, **Piauí**, **Paraná**, Rio de Janeiro, Rio Grande do Norte, Rio Grande do Sul, Santa Catarina, Sergipe, **Sao Paulo** (sem acento!), Tocantins

**Solução**: mapear UF → texto exato no `playwright-automation.mjs`.

### 5. Tipo documento é combobox MUI (não radio)
Opções: `RG (Antigo)`, `RG (Novo)` (e provavelmente `CNH`).

**Solução**: usar `combobox` MUI + `li[role="option"]`.

### 6. Uploads são `<label>` clickables (não inputs file diretos)
Cada card "Frente"/"Verso" é um `<label>` com `<input type="file">` hidden dentro.

**Solução**: 
```js
// Estratégia A — usar setInputFiles direto no input hidden
const fileInputs = await page.locator('input[type="file"]').all()
await fileInputs[0].setInputFiles(pathFrente)
await fileInputs[1].setInputFiles(pathVerso)
await fileInputs[2].setInputFiles(pathConta)
```

---

## 📋 Próximas ações (atualização do worker)

### A. Reescrever `playwright-automation.mjs` para v11
1. Aplicar selectors validados (placeholders exatos)
2. Adicionar mapeamento UF → estado-portal (sem acento)
3. Validar Nome após CPF (5s timeout)
4. Validar email duplicado (fallback automático)
5. Esperar Distribuidora aparecer ANTES de tentar abrir
6. Combobox MUI: `[role="combobox"]` + `li[role="option"]`
7. Uploads: usar `setInputFiles` em todos os `input[type="file"]` por índice

### B. Atualizar `Dockerfile`
```dockerfile
LABEL version=v11-2026.04.18
ENV WORKER_VERSION=v11-2026.04.18
```

### C. Adicionar telemetria por fase
Cada bloco preenchido grava em `worker_phase_logs` com `phase=fase_X_blockname`, `selector_used=placeholder`, `screenshot_url` em caso de falha. Já há tabela criada — só plugar.

### D. Painel `/super-admin` → "Worker Phases"
- Timeline visual por lead
- Botão "Reprocessar" que chama POST /submit-lead
- Filtro por status (success/failed/timeout)

---

## 🎯 Resultado esperado pós v11

- ✅ CPF válido → Nome aparece em <3s, worker detecta
- ✅ Email duplicado → fallback automático, sem travar
- ✅ Estado SP → "Sao Paulo" selecionado corretamente
- ✅ Distribuidora aberta SÓ depois do Estado
- ✅ Uploads via `setInputFiles` em 3 inputs file por índice
- ✅ Lead chega em "Finalizar" → OTP disparado → polling do banco
- ✅ Sem `:r5:` errors (selectors usam placeholder, não id)
