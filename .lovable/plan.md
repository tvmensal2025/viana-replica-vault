

# Correção: bot deve PERGUNTAR e CONFIRMAR telefone, nunca puxar automático

## Diagnóstico do que aconteceu com o Gabriel Augusto

O telefone que aparece no cadastro dele **não veio de resposta dele no chat**. Veio automático do `remoteJid` da Evolution (o número de onde ele mandou a primeira mensagem) e foi salvo direto em `phone_whatsapp` sem o bot perguntar “esse é o seu número de contato?” nem aceitar resposta.

Ou seja:
- o sistema usa o número do WhatsApp como identificador (correto — é a chave da conversa)
- mas também usa esse mesmo número como **telefone oficial do cadastro**, sem confirmação
- se o cliente está usando o WhatsApp de outra pessoa, ou se quer cadastrar um telefone diferente, o cadastro vai com número errado pro portal iGreen

Mesma coisa pode estar acontecendo com o email em outros casos: aceita qualquer texto sem validar se é placeholder/lixo (já vimos `Tvmensal08@gmail.com` da Juscelina passar).

## Regra que vamos aplicar

> **Nenhum dado vai pro portal iGreen sem o cliente ter respondido explicitamente.**
>
> - Telefone: bot pergunta, cliente responde, bot confirma com botão → só então grava como dado oficial
> - Email: bot pergunta, cliente responde, bot valida (formato + bloqueia placeholder/consultor) → só então grava
> - Nenhum dado é “puxado automático” do `remoteJid`, do consultor, do importador iGreen ou de fallback técnico

## O que vai mudar

### 1) Telefone — separar “número do WhatsApp” de “telefone do cadastro”
- `phone_whatsapp` continua sendo o número que enviou a mensagem (chave da conversa, **não vai pro portal**)
- criar uso real do passo `ask_phone_confirm`:
  - bot mostra: “Esse é o seu telefone de contato? `(11) 9XXXX-XXXX`”
  - botões: **Sim, é meu** / **Usar outro número**
  - se Sim → grava em `phone_landline` (ou campo próprio “telefone confirmado”) marcando origem `confirmado_pelo_cliente`
  - se Outro → vai pra `ask_phone`, cliente digita, bot valida (DDD válido, 10–11 dígitos, não pode ser igual ao número do consultor da instância, não pode ser placeholder)
- **portal só recebe telefone marcado como `confirmado_pelo_cliente`**
- se não houver telefone confirmado, o submit ao portal é bloqueado e o lead volta pra `ask_phone_confirm`

### 2) Email — validação dura no `ask_email`
- bloquear domínios placeholder: `tvmensal*`, `*@lead.igreen`, `*@teste*`, `noreply@*`, `sem_email_*`
- bloquear se for igual ao `igreen_portal_email` do consultor dono do lead
- bloquear formato inválido
- aceitar `PULAR` só explicitamente → marca lead como `email_pendente_revisao` e não envia ao portal
- se inválido, mantém no passo `ask_email` até receber email real

### 3) Validação antes de chamar o worker
No `bot-flow.ts`, ao acionar finalização, rodar `validateCustomerForPortal()` reforçado:
- exige telefone com origem `confirmado_pelo_cliente`
- exige email real (não placeholder, não do consultor)
- se reprovar → não chama worker, volta o `conversation_step` pro dado faltante e manda mensagem clara pro cliente
- se aprovar → chama worker

### 4) `ask_finalizar` aceita texto, não só botão
- aceitar como gatilho: `1`, `ok`, `sim`, `finalizar`, `concluir`, `vamos`, `pode`
- ao detectar, antes de qualquer coisa, rodar a validação do item 3
- só então marcar `portal_submitting` e disparar worker
- regenerar a URL do portal a partir de `consultants.cadastro_url` do `consultant_id` do lead (fim do bug do Gabriel cair no link do Cleber)

### 5) Anti-spam do "Ainda está aí?"
- máximo 1 reenvio a cada 30 min
- após 3 sem resposta em `ask_finalizar` → status `stuck_finalizar` (vai pro widget de Leads Travados)
- após 3 sem resposta em `ask_phone_confirm` ou `ask_email` → status `stuck_contact` (também vai pro widget)

### 6) Importador iGreen para de gerar dado fake utilizável
- registros com `sem_celular_*` ou sem email continuam sendo importados, mas marcados como `contato_incompleto`
- o bot, ao receber a primeira mensagem desses leads, é obrigado a passar por `ask_phone_confirm` e `ask_email` antes de qualquer outra etapa
- worker nunca roda em cima de `contato_incompleto`

### 7) Recuperação imediata
- **Gabriel Augusto**: limpar `error_message`, voltar `conversation_step` para `ask_phone_confirm` (pra ele confirmar o telefone certo), regenerar `igreen_link` com URL correta do consultor dono dele, status `pending`
- **Juscelina**: limpar email placeholder `Tvmensal08@gmail.com`, voltar para `ask_email`, status `pending`

## Garantias depois disso

- Bot **nunca** registra telefone sem o cliente ter clicado **Sim, é meu** ou ter digitado outro
- Bot **nunca** aceita email placeholder, email do consultor, ou formato inválido
- Worker **nunca** abre o portal com dado não-confirmado
- Cliente **nunca** fica preso em `ask_finalizar` por não clicar — texto também aciona
- Lead **nunca** entra no portal com link de outro consultor

## Arquivos que serão alterados

- `supabase/functions/evolution-webhook/handlers/bot-flow.ts` — fluxo `ask_phone_confirm` real, validação dura email, aceitar texto em `ask_finalizar`, anti-spam, regenerar URL correta
- `supabase/functions/_shared/validators.ts` — `isPlaceholderEmail`, `isConsultantContact`, `isPlaceholderPhone`, `validateCustomerForPortal` exigir flag de telefone confirmado
- `supabase/functions/sync-igreen-customers/index.ts` — marcar leads importados sem contato como `contato_incompleto`
- `supabase/functions/bot-stuck-recovery/index.ts` — mover para `stuck_finalizar` / `stuck_contact` em vez de só repetir lembrete
- `src/components/superadmin/StuckLeadsWidget.tsx` — categorias visuais novas: `stuck_finalizar`, `stuck_contact`, `email_pendente_revisao`, `contato_incompleto`
- migração SQL:
  - adicionar valores na constraint `customers_status_check`: `stuck_finalizar`, `stuck_contact`, `email_pendente_revisao`, `contato_incompleto`
  - adicionar coluna em `customers`: `phone_contact_confirmed boolean default false` (marca se o telefone do cadastro foi confirmado pelo cliente no chat)
- correção pontual via SQL para Gabriel + Juscelina (reset controlado)

## Detalhes técnicos importantes

- O telefone do `remoteJid` é só para responder no WhatsApp; o telefone que vai pro portal iGreen passa a vir **só** do passo `ask_phone_confirm` confirmado
- A nova coluna `phone_contact_confirmed` evita ambiguidade: enquanto for `false`, o submit ao portal é bloqueado
- O `igreen_link` deixa de ser cacheado por lead — sempre é regenerado no momento do submit a partir do `consultants.cadastro_url` correto
- Os novos status (`stuck_finalizar`, `stuck_contact`, `email_pendente_revisao`, `contato_incompleto`) precisam entrar na constraint `customers_status_check` antes do código rodar, senão o update falha
- Validação de telefone considera inválido: vazio, placeholder `sem_celular_*`, igual ao `connected_phone` da `whatsapp_instances` do consultor (auto-cadastro acidental), DDD < 11 ou > 99, tamanho fora de 10–11 dígitos
- Validação de email considera inválido: vazio, regex falha, domínio em blocklist, igual ao `consultants.igreen_portal_email` do consultor dono

