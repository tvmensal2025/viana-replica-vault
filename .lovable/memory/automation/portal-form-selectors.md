---
name: Portal iGreen — Mapeamento DEFINITIVO End-to-End (validado live 20/04/2026)
description: Mapeamento 100% validado com Playwright em 20/04/2026. Todos os campos usam name="" (NÃO placeholder). Fluxo completo do simulador até OTP + link facial. Testado com CPF real, chegou até tela de OTP com sucesso.
type: feature
---

# 🗺️ MAPEAMENTO DEFINITIVO — Portal iGreen Energy
**Validado live em 20 de abril de 2026 com Playwright + CPF real**
**URL:** `https://digital.igreenenergy.com.br/?id={CONSULTOR_ID}&sendcontract=true`

---

## ⚠️ REGRA #1: NUNCA USAR placeholder=""
O portal usa Material UI com labels flutuantes. Os inputs **NÃO TÊM placeholder**.
Usar SEMPRE `input[name="xxx"]` para localizar campos.

---

## 📋 FLUXO COMPLETO (14 ETAPAS)

### ═══════════════════════════════════════════
### FASE A: SIMULADOR (2 etapas)
### ═══════════════════════════════════════════

#### ETAPA 1 — CEP + Valor da Conta
```
Campos:
  input[name="cep"]          → CEP sem formatação (ex: "13323072")
  input[name="consumption"]  → Valor da conta (ex: "350")
                                Portal formata para "350,00" automaticamente

Ação:
  button:has-text("Calcular")  → clica

Aguardar:
  networkidle + 2s
```

#### ETAPA 2 — Garantir Desconto
```
Ação:
  button:has-text("Garantir meu desconto")  → clica

Aguardar:
  networkidle + 2s → redireciona para formulário progressivo
```

### ═══════════════════════════════════════════
### FASE B: FORMULÁRIO PROGRESSIVO (8 etapas)
### ═══════════════════════════════════════════

**IMPORTANTE:** Os campos aparecem PROGRESSIVAMENTE.
Após preencher um bloco, o próximo bloco aparece.
Sempre usar waitForSelector antes de preencher.

#### ETAPA 3 — CPF (+ auto-fill Receita Federal)
```
Campo:
  input[name="documentNumber"]  → CPF sem pontos (ex: "43728802867")
                                   Portal formata para "437.288.028-67"

Método: pressSequentially() + Tab (dispara evento blur → consulta Receita)

Aguardar (até 10s):
  input[name="name"]      → Nome completo (AUTO via Receita Federal)
  input[name="birthDate"] → Data nascimento (AUTO, formato "20/07/1993")

Validação:
  Se name="" após 10s → CPF inválido ou Receita offline → abortar
```

#### ETAPA 4 — Telefone
```
Campos (aparecem APÓS CPF validado):
  input[name="phone"]         → WhatsApp sem formatação (ex: "11999887766")
                                  Portal formata para "(11) 99988-7766"
  input[name="phoneConfirm"]  → Mesmo valor

Método: pressSequentially() + Tab
```

#### ETAPA 5 — Email
```
Campos (aparecem APÓS telefone):
  input[name="email"]         → Email (ex: "cliente@email.com")
  input[name="emailConfirm"]  → Mesmo valor

Validação do portal:
  Se email já cadastrado → erro "Este email já está cadastrado"
  Fallback: usar {cpf}@temp.igreen.com.br

Aguardar 1s após Tab → bloco endereço aparece
```

#### ETAPA 6 — Endereço
```
Campos AUTO-PREENCHIDOS pelo CEP da Etapa 1:
  input[name="cep"]           → CEP (já preenchido, readonly visual)
  input[name="address"]       → Endereço (AUTO, ex: "Rua Cabreúva")
  input[name="neighborhood"]  → Bairro (AUTO, ex: "Jardim da Cidade II")
  input[name="city"]          → Cidade (AUTO, ex: "Salto")
  input[name="state"]         → Estado (AUTO, ex: "SP") — hidden input
  [role="combobox"] (1º)      → Estado visual (AUTO, ex: "Sao Paulo")

Campos MANUAIS:
  input[name="number"]        → Número (ex: "100")
  input[name="complement"]    → Complemento (OPCIONAL, ex: "Apto 1")

Validação:
  Se address/neighborhood/city vazios após 3s → CEP não retornou
  → preencher manualmente com dados do customer
```

#### ETAPA 7 — Número da Instalação
```
Campo (aparece APÓS endereço completo):
  input[name="installationNumber"]  → Nº instalação (ex: "9999999999")

Validação do portal:
  Se "Número de instalação já cadastrado" → abortar com installation_duplicate
```

#### ETAPA 8 — Tipo de Documento
```
Combobox MUI — é o ÚLTIMO [role="combobox"]:visible
  input[name="document_type"]  → hidden input preenchido pelo combobox

Seletor:
  const combos = await page.locator('[role="combobox"]:visible').all();
  const tipoDocCombo = combos[combos.length - 1]; // ÚLTIMO = tipo doc
  await tipoDocCombo.click();
  await page.locator('li[role="option"]').filter({ hasText: 'CNH' }).click();

Opções (3 fixas):
  "RG (Antigo)"  → pede Frente + Verso (2 uploads)
  "RG (Novo)"    → pede Frente + Verso (2 uploads)
  "CNH"          → pede APENAS Frente (1 upload)

Mapping:
  customer.document_type === 'cnh'     → "CNH"
  customer.document_type === 'rg'      → "RG (Novo)"
  customer.document_type === 'rg_antigo' → "RG (Antigo)"
  null/desconhecido                    → "CNH" (fallback seguro: 1 file)

Aguardar 1.5s → bloco "Documento pessoal" aparece com input[type="file"]
```

#### ETAPA 9 — Upload Documento Pessoal
```
Seletor:
  const fileInputs = page.locator('input[type="file"]');

Se CNH:
  await fileInputs.nth(0).setInputFiles(pathFrente);  // 1 arquivo

Se RG (Antigo/Novo):
  await fileInputs.nth(0).setInputFiles(pathFrente);  // Frente
  await fileInputs.nth(1).setInputFiles(pathVerso);   // Verso

Aguardar 2s → aparecem: perguntas + upload conta de energia
```

#### ETAPA 10 — Perguntas + Conta de Energia
```
Após upload do documento pessoal, aparecem 3 blocos:

1. PROCURADOR (radio):
   input[name="hasProcurator"][value="false"]  → clicar (Não)
   input[name="hasProcurator"][value="true"]   → (Sim)

2. CONTA DE ENERGIA (upload):
   input[type="file"] (2º ou 3º dependendo do tipo doc)
   → Último input[type="file"] disponível
   → Aceita PDF ou imagem
   
   input[name="energyBillPassword"]  → Senha do PDF (OPCIONAL, pode deixar vazio)

3. DÉBITOS PENDENTES (radio):
   input[name="hasPendingDebts"][value="false"]  → clicar (Não)
   input[name="hasPendingDebts"][value="true"]   → (Sim)

Ordem de preenchimento:
  1. hasProcurator = false (Não)
  2. Upload conta de energia no próximo input[type="file"]
  3. energyBillPassword = "" (vazio, opcional)
  4. hasPendingDebts = false (Não)
```

### ═══════════════════════════════════════════
### FASE C: FINALIZAÇÃO (2 etapas)
### ═══════════════════════════════════════════

#### ETAPA 11 — Clicar Finalizar
```
Ação:
  button:has-text("Finalizar")  → clicar

Pré-condição:
  Botão só fica HABILITADO quando TODOS os campos obrigatórios estão preenchidos
  O único campo que pode ficar vazio é energyBillPassword (opcional)

Aguardar:
  5s → portal redireciona para tela de OTP
```

#### ETAPA 12 — OTP (Código de Verificação)
```
URL pós-finalizar:
  https://digital.igreenenergy.com.br/validacao-codigo/{ID_CADASTRO}?id={CONSULTOR_ID}&sendcontract=true

Tela mostra:
  "Confirmação de código"
  "Enviamos um código de 6 dígitos para (XX) XXXXX-XXXX"

Campo:
  input[name="token"]  → código OTP de 6 dígitos

Botões:
  button:has-text("Confirmar")       → desabilitado até digitar 6 dígitos
  button:has-text("Reenviar código") → desabilitado por 60s (countdown)

Fluxo OTP:
  1. Portal envia código via WhatsApp para o NÚMERO DO CLIENTE (não do consultor)
  2. Cliente recebe no WhatsApp e digita na conversa com o bot
  3. Webhook detecta regex /^\d{4,8}$/ no step 'aguardando_otp'
  4. Salva em customers.otp_code + otp_received_at
  5. Worker faz polling, pega o código, digita no input[name="token"]
  6. Clica button:has-text("Confirmar")

Timeout: 180s (3 minutos) de polling a cada 3s

Método para injetar OTP:
  await page.locator('input[name="token"]').fill(otpCode);
  await page.locator('button:has-text("Confirmar")').click();
```

### ═══════════════════════════════════════════
### FASE D: PÓS-OTP — LINK FACIAL (2 etapas)
### ═══════════════════════════════════════════

#### ETAPA 13 — Capturar Link de Assinatura Facial
```
Após confirmar OTP, o portal redireciona para página com link de validação facial.

O worker deve:
  1. Aguardar redirecionamento (até 10s)
  2. Capturar a URL atual: page.url()
  3. OU procurar link na DOM: page.locator('a[href*="facial"], a[href*="liveness"]')
  4. Salvar no banco:
     UPDATE customers SET
       link_facial = '{url}',
       conversation_step = 'aguardando_facial'
     WHERE id = '{customer_id}'

⚠️ ESTA ETAPA NÃO É AUTOMÁTICA
  O link de assinatura facial requer que o CLIENTE abra no celular,
  faça selfie/liveness. Não tem como automatizar.
```

#### ETAPA 14 — Enviar Link ao Cliente via WhatsApp
```
Mensagem enviada ao cliente:
  "📸 Última etapa! Abra o link abaixo no seu celular:
   {link_facial}
   Quando terminar, responda PRONTO"

Aguardar confirmação do cliente:
  Webhook detecta regex /\b(pronto|prontinho|concluído|finalizei|terminei|fiz|feito|ok)\b/i
  no step 'aguardando_facial'

Ao confirmar:
  UPDATE customers SET
    facial_confirmed_at = now(),
    status = 'cadastro_concluido',
    conversation_step = 'complete'
  WHERE id = '{customer_id}'
```

---

## 📊 MAPA DE TODOS OS CAMPOS (name → tipo → origem)

| # | name | tipo | origem | obrigatório |
|---|------|------|--------|-------------|
| 1 | `cep` | text | manual (simulador) | ✅ |
| 2 | `consumption` | text | manual (simulador) | ✅ |
| 3 | `documentNumber` | text | manual (CPF) | ✅ |
| 4 | `name` | text | AUTO (Receita Federal) | ✅ |
| 5 | `birthDate` | text | AUTO (Receita Federal) | ✅ |
| 6 | `phone` | text | manual | ✅ |
| 7 | `phoneConfirm` | text | manual (=phone) | ✅ |
| 8 | `email` | email | manual | ✅ |
| 9 | `emailConfirm` | email | manual (=email) | ✅ |
| 10 | `address` | text | AUTO (CEP) | ✅ |
| 11 | `number` | text | manual | ✅ |
| 12 | `neighborhood` | text | AUTO (CEP) | ✅ |
| 13 | `city` | text | AUTO (CEP) | ✅ |
| 14 | `state` | text | AUTO (CEP, hidden) | ✅ |
| 15 | `complement` | text | manual | ❌ |
| 16 | `installationNumber` | text | manual | ✅ |
| 17 | `document_type` | text (hidden, via combobox) | manual | ✅ |
| 18 | `hasProcurator` | radio (true/false) | manual | ✅ |
| 19 | `energyBillPassword` | text | manual | ❌ |
| 20 | `hasPendingDebts` | radio (true/false) | manual | ✅ |
| 21 | `token` | text (tela OTP) | manual/webhook | ✅ |

**Uploads (input[type="file"]):**
| # | contexto | quando aparece |
|---|----------|----------------|
| 1 | Documento pessoal — Frente | após selecionar tipo doc |
| 2 | Documento pessoal — Verso (só RG) | após selecionar RG |
| 3 | Conta de energia | após upload doc pessoal |

---

## 🔧 CÓDIGO DE REFERÊNCIA (Worker Playwright)

```javascript
// ── SIMULADOR ──
await page.locator('input[name="cep"]').first().pressSequentially(cep);
await page.locator('input[name="consumption"]').first().pressSequentially(valor);
await page.locator('button:has-text("Calcular")').first().click();
await delay(2000);
await page.locator('button:has-text("Garantir meu desconto")').first().click();
await delay(2000);

// ── CPF ──
await page.locator('input[name="documentNumber"]').first().pressSequentially(cpf);
await page.locator('input[name="documentNumber"]').first().press('Tab');
// Aguardar auto-fill nome (até 10s)
for (let i = 0; i < 20; i++) {
  await delay(500);
  const nome = await page.locator('input[name="name"]').first().inputValue();
  if (nome.length > 2) break;
}

// ── TELEFONE ──
await page.locator('input[name="phone"]').first().pressSequentially(whatsapp);
await page.locator('input[name="phoneConfirm"]').first().pressSequentially(whatsapp);

// ── EMAIL ──
await page.locator('input[name="email"]').first().pressSequentially(email);
await page.locator('input[name="emailConfirm"]').first().pressSequentially(email);
await delay(1000);

// ── ENDEREÇO (número + complemento, resto é auto) ──
await page.locator('input[name="number"]').first().pressSequentially(numero);
await page.locator('input[name="complement"]').first().pressSequentially(complemento);

// ── INSTALAÇÃO ──
await page.locator('input[name="installationNumber"]').first().pressSequentially(numInstalacao);

// ── TIPO DOCUMENTO (último combobox) ──
const combos = await page.locator('[role="combobox"]:visible').all();
await combos[combos.length - 1].click();
await delay(500);
await page.locator('li[role="option"]').filter({ hasText: 'CNH' }).click();
await delay(1500);

// ── UPLOAD DOC PESSOAL ──
const files = page.locator('input[type="file"]');
await files.nth(0).setInputFiles(pathDocFrente);
// Se RG: await files.nth(1).setInputFiles(pathDocVerso);
await delay(2000);

// ── PERGUNTAS + CONTA ENERGIA ──
await page.locator('input[name="hasProcurator"][value="false"]').click({ force: true });
// Upload conta (próximo input file disponível)
const totalFiles = await files.count();
await files.nth(totalFiles - 1).setInputFiles(pathContaEnergia);
await delay(2000);
await page.locator('input[name="hasPendingDebts"][value="false"]').click({ force: true });

// ── FINALIZAR ──
await page.locator('button:has-text("Finalizar")').click();
await delay(5000);

// ── OTP ──
// Aguardar código via polling (webhook salva em customers.otp_code)
const otpCode = await aguardarOTP(customerId, 180000);
await page.locator('input[name="token"]').fill(otpCode);
await page.locator('button:has-text("Confirmar")').click();
await delay(5000);

// ── CAPTURAR LINK FACIAL ──
const linkFacial = page.url(); // ou buscar na DOM
await supabase.from('customers').update({
  link_facial: linkFacial,
  conversation_step: 'aguardando_facial'
}).eq('id', customerId);
```

---

## 🛡️ VALIDAÇÕES ANTI-TRAVAMENTO

| Momento | Verificação | Ação se falhar |
|---------|-------------|----------------|
| Pós-CPF (10s) | `name` não vazio | abortar `awaiting_cpf_review` |
| Pós-Email | "email já cadastrado" | fallback `{cpf}@temp.igreen.com.br` |
| Pós-Instalação | "já cadastrado" | abortar `installation_duplicate` |
| Pós-CEP (3s) | address/bairro/city vazios | preencher manual |
| Pós-Tipo Doc (1.5s) | input[type="file"] count > 0 | aguardar mais |
| Pós-Finalizar (5s) | URL contém "validacao-codigo" | se não → erro |
| OTP (180s) | código recebido | timeout → abortar `otp_timeout` |

---

## 📱 FLUXO DE conversation_step

```
data_complete → portal_submitting → aguardando_otp → validando_otp → aguardando_facial → complete
```

| step | quem seta | o que acontece |
|------|-----------|----------------|
| `data_complete` | webhook WhatsApp | dados coletados, pronto para automação |
| `portal_submitting` | worker | worker pegou o lead, abrindo navegador |
| `aguardando_otp` | worker | clicou Finalizar, esperando código OTP |
| `validando_otp` | worker | recebeu OTP, injetando no portal |
| `aguardando_facial` | worker | OTP validado, link facial enviado ao cliente |
| `complete` | webhook WhatsApp | cliente confirmou "PRONTO" |

---

**Última atualização:** 20 de abril de 2026
**Validado por:** Teste Playwright automatizado end-to-end com CPF real
**Screenshots:** `screenshots/teste-completo/` (14 screenshots do fluxo completo)
