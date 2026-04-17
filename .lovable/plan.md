
Objetivo: fazer uma auditoria corretiva do fluxo inteiro para que o cadastro chegue ao fim com comportamento previsível, mesmo quando o cliente erra documento, envia mídia ruim ou o portal muda timing.

1. Diagnóstico principal encontrado no código atual
- Há divergência grave entre os módulos:
  - `worker-portal/playwright-automation.mjs` ainda assume que o portal não tem CNH, mapeia CNH para `RG (Novo)` e tenta enviar verso.
  - `evolution-webhook/index.ts` já trata CNH como opção real e pula verso.
  - A memória do portal também está inconsistente.
- O fluxo de storage está duplicado:
  - o webhook já tenta subir arquivos direto ao MinIO;
  - no final ele chama `upload-documents-minio` de novo em paralelo;
  - os logs mostram timeout de conexão com o host do MinIO, então o sistema pode “achar” que salvou sem ter salvo tudo.
- Ainda existe risco de persistir dado pesado/desnecessário no banco (`document_front_base64`).
- O worker e o bot não compartilham uma regra única de `document_type`, então CNH/RG varia por texto e casing.
- O worker está mais frágil no trecho final do portal do que no início: tipo de documento, uploads, radios “Não”, upload da conta, submit e checagem final.

2. Plano de auditoria e correção
Fase A — Unificar a verdade do fluxo
- Criar uma única convenção de tipo de documento:
  - `cnh`
  - `rg_novo`
  - `rg_antigo`
- Normalizar isso no webhook, validação e worker.
- Atualizar a memória do portal para refletir o comportamento real atual.
- Eliminar qualquer comentário/lógica antiga dizendo que CNH vira RG.

Fase B — Corrigir o gargalo mais crítico: documento
- No `worker-portal/playwright-automation.mjs`:
  - selecionar `CNH` quando for CNH;
  - enviar só frente para CNH;
  - enviar frente + verso apenas para RG;
  - validar visualmente que o portal ocultou/mostrou o campo correto antes de continuar.
- No `evolution-webhook/index.ts`:
  - se o cliente escolher RG e mandar CNH, detectar incoerência e corrigir o `document_type` antes do worker;
  - se OCR não tiver confiança suficiente, pedir correção sem travar o funil.

Fase C — Blindar data de nascimento
- Manter a regra: portal via CPF é a fonte da verdade.
- O worker nunca sobrescreve nome/data quando o portal auto-preenche.
- O webhook só salva data da CNH quando a confiança for alta.
- Se a data vier ambígua, marcar como pendente e deixar o portal preencher.

Fase D — Resolver storage/MinIO de verdade
- Escolher um único caminho oficial:
  - preferencialmente upload imediato no webhook;
  - `upload-documents-minio` vira reprocessamento/manual recovery, não caminho principal.
- Remover a dependência operacional do segundo upload “fire-and-forget” no final do fluxo.
- Parar de salvar base64 bruto no banco quando não for estritamente necessário.
- Adicionar logs claros por arquivo:
  - conta
  - doc_frente
  - doc_verso
  - status final do upload
- Se MinIO falhar, registrar status explícito no cliente em vez de silêncio.

Fase E — Tornar o worker determinístico no portal
- Refatorar o worker em etapas pequenas com validação obrigatória após cada uma:
  - landing
  - CPF
  - auto-fill
  - WhatsApp
  - confirmação WhatsApp
  - email
  - confirmação email
  - número
  - complemento
  - distribuidora
  - instalação
  - placas solares = não
  - tipo documento
  - upload documento
  - procurador = não
  - débito = não
  - upload conta
  - finalizar
  - OTP/link final
- Cada etapa deve:
  - localizar
  - preencher/clicar
  - reler valor/estado
  - retentar
  - falhar com erro explícito e screenshot se não confirmar

Fase F — Corrigir regras de validação cruzada
- `validateCustomerForPortal` e `getNextMissingStep` devem usar a mesma normalização de documento.
- CNH nunca exige verso.
- RG sempre exige verso.
- O sistema não pode mandar o cliente para passo errado por diferença de texto (`CNH`, `cnh`, `RG (Novo)` etc.).

Fase G — Observabilidade real
- Padronizar logs estruturados por fase no webhook e no worker.
- Registrar:
  - fase
  - entrada esperada
  - valor lido do portal
  - número de tentativas
  - motivo da falha
  - URL/arquivo envolvido
- Se necessário na implementação, criar uma tabela de logs operacionais do worker para auditoria histórica.

3. Arquivos que precisam entrar na auditoria
- `worker-portal/playwright-automation.mjs`
- `worker-portal/server.mjs`
- `supabase/functions/evolution-webhook/index.ts`
- `supabase/functions/_shared/ocr.ts`
- `supabase/functions/_shared/validators.ts`
- `supabase/functions/upload-documents-minio/index.ts`
- `supabase/functions/_shared/minio-upload.ts`
- memória do portal em `mem://automation/portal-form-selectors`

4. Resultado esperado após a correção
- O cliente pode errar RG/CNH e o sistema corrige sem travar.
- CNH nunca pede verso.
- Data de nascimento não vem errada do OCR.
- Uploads ficam salvos de forma consistente.
- O worker para exatamente na fase que falhou, com motivo claro.
- O cadastro consegue ir até OTP/assinatura/finalização com muito menos retrabalho.

5. Ordem de implementação recomendada
1. Unificar `document_type` em todo o sistema.
2. Corrigir worker para CNH real no portal.
3. Consolidar estratégia única de MinIO.
4. Remover base64 persistido desnecessário.
5. Refatorar validações por etapa no worker.
6. Padronizar logs e auditoria.
7. Rodar teste completo ponta a ponta com:
   - RG correto
   - CNH correta
   - cliente escolhendo RG e enviando CNH
   - falha simulada de MinIO
   - CPF com auto-fill normal

6. Detalhes técnicos importantes
- Há evidência concreta de timeout de rede para o MinIO; isso precisa ser tratado como falha de infraestrutura e também de código, porque hoje o fluxo não torna isso visível o suficiente.
- O worker atual ainda contém lógica antiga de CNH; isso provavelmente é uma das causas centrais de “nunca chega ao final”.
- O uso de fallback de credencial no `worker-portal/server.mjs` merece revisão, porque mistura chave publishable com cenário que precisa ser confiável.
- A memória do portal está desatualizada em pelo menos um ponto crítico, então a implementação deve começar alinhando código + memória + comportamento real.

Resumo executivo
Hoje o maior problema não é um bug isolado: é inconsistência entre webhook, worker, OCR, validação e storage. O plano correto é auditar e alinhar essas camadas primeiro, depois endurecer o worker com validação por etapa e uma única estratégia de upload. Isso é o que vai transformar o cadastro em um fluxo realmente estável.
