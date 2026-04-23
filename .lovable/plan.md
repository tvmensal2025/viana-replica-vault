

## Trocar todas as chaves Google Cloud da nova conta

Você vai gerar novas API keys no novo projeto Google Cloud (que aparece na sua tela com R$ 1.785 de crédito) e a gente substitui as chaves antigas em todos os pontos do sistema sem deixar nada de fora.

### 1. O que o sistema usa hoje do Google Cloud

Mapeei o código inteiro. Hoje o projeto usa **uma única API do Google Cloud**: a **Generative Language API (Gemini)**. Não há uso de Vision API, Maps, Firebase ou Google Auth.

| Onde é usado | API/Modelo | Para quê |
|---|---|---|
| `supabase/functions/_shared/ocr.ts` | `gemini-2.5-flash` (generateContent) | OCR de conta de luz, RG (frente/verso), CNH, comprovante de endereço |
| `supabase/functions/evolution-webhook/index.ts` | passa `GEMINI_API_KEY` para handlers | Dispara o OCR quando chega imagem/PDF no WhatsApp |
| `supabase/functions/igreen-chat/index.ts` | `gemini-2.0-flash` (streamGenerateContent) | Assistente IA da landing page (fallback quando Lovable AI cai) |
| `supabase/functions/extract-pdf-text/index.ts` | `google/gemini-2.5-flash` via Lovable AI Gateway | Extração de texto de PDF — **NÃO usa sua chave Google, usa LOVABLE_API_KEY**, fica de fora da troca |

**Secrets atuais no Supabase que serão substituídos:**
- `GEMINI_API_KEY` (principal — usado pelo OCR)
- `GOOGLE_AI_API_KEY` (fallback do `igreen-chat`)
- `GOOGLE_VISION_API_KEY` (existe no Supabase mas **não é referenciado em nenhum lugar do código** — vou deixar você decidir se mantém ou apaga)

### 2. APIs que você precisa habilitar no novo projeto Google Cloud

Antes de gerar as keys, no novo projeto (do print) ative:

1. **Generative Language API** — obrigatória (OCR + chat IA)  
   → `https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com`

Só essa. Como não usamos Vision/Maps, não precisa habilitar mais nada.

### 3. Como você vai gerar as chaves

No novo projeto Google Cloud:

1. Vá em **APIs e Serviços → Credenciais → Criar credenciais → Chave de API**
2. Crie **uma chave** (pode chamar de "iGreen Gemini Produção")
3. Em "Restrições de API", restrinja a chave para **somente Generative Language API** (segurança)
4. Copie o valor (`AIzaSy...`)

Você pode usar **a mesma chave** para `GEMINI_API_KEY` e `GOOGLE_AI_API_KEY` (são o mesmo provedor, apenas nomes diferentes que o código aceita), ou gerar duas chaves separadas se quiser isolar OCR vs Chat.

### 4. Onde a troca acontece (eu faço quando aprovar)

Quando você aprovar este plano, vou:

**a) Atualizar os secrets no Supabase Edge Functions** com a(s) nova(s) chave(s):
- `GEMINI_API_KEY` → nova chave
- `GOOGLE_AI_API_KEY` → nova chave (mesma ou outra)
- `GOOGLE_VISION_API_KEY` → opcional (apagar ou atualizar — me diga sua preferência)

Os secrets são propagados automaticamente para todas as edge functions na hora — **não precisa redeploy**.

**b) Validar funcionamento** rodando dois testes diretos:
- Teste 1: chamada simples ao endpoint Gemini com a nova chave (confirma que a chave é válida e a API está habilitada)
- Teste 2: chamar a edge function `evolution-webhook` em modo simulado para garantir que o OCR responde 200

**c) Verificar logs** das edge functions `evolution-webhook`, `igreen-chat` e `whatsapp-bot` por 2 minutos para garantir que não aparece "GEMINI_API_KEY não configurada" nem 401/403 do Google.

### 5. O que NÃO muda

- `LOVABLE_API_KEY` (Lovable AI Gateway) — continua o mesmo, é gerenciado pela Lovable
- `extract-pdf-text` — usa Lovable AI, não depende da sua chave Google
- Modelos usados (`gemini-2.5-flash` e `gemini-2.0-flash`) — continuam iguais
- Nenhum código TypeScript precisa ser editado — a troca é só de secret

### 6. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Chave nova sem cota / API não habilitada | Teste 1 acima detecta antes de afetar produção |
| Chave antiga fica ativa em paralelo | Você pode revogar a chave antiga no console Google só **depois** dos testes passarem |
| `GOOGLE_VISION_API_KEY` órfão | Vou apontar e você decide se apaga |

### 7. O que preciso de você para executar

Quando aprovar e mudar para modo padrão, vou pedir a chave nova via tool segura de secret (não cola aqui no chat). Você cola lá e eu já aplico + testo.

### Arquivos afetados

Nenhum arquivo de código será editado. A mudança é 100% em **secrets do Supabase**:

| # | Recurso | Ação |
|---|---|---|
| 1 | Supabase secret `GEMINI_API_KEY` | Atualizar com nova chave |
| 2 | Supabase secret `GOOGLE_AI_API_KEY` | Atualizar com nova chave |
| 3 | Supabase secret `GOOGLE_VISION_API_KEY` | Decisão sua: manter, atualizar ou apagar |
| 4 | Edge functions `evolution-webhook`, `igreen-chat`, `whatsapp-bot` | Apenas validação por log (sem código novo) |

