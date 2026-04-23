

## Visão geral

Vou criar um diagrama Mermaid completo mostrando todo o fluxo do sistema iGreen, do primeiro contato do cliente até o cadastro concluído no portal, incluindo todos os componentes envolvidos (WhatsApp, Webhook, OCR, Worker, Portal, OTP, Facial).

## O que será entregue

Um arquivo `.mmd` (Mermaid) salvo em `/mnt/documents/` que renderiza visualmente:

### 1. Camadas do diagrama
- **Cliente final** (WhatsApp)
- **Evolution API** (gateway de mensagens)
- **Edge Functions Supabase** (webhook, OCR, upload)
- **Banco de dados** (customers, conversations, whatsapp_instances)
- **Worker VPS** (Playwright/portal automation)
- **Portal iGreen** (digital.igreenenergy.com.br)
- **Serviços externos** (Gemini AI, MinIO, ViaCEP)

### 2. Etapas do fluxo (do início ao fim)
1. Cliente escaneia QR / clica no link da landing page
2. Envia primeira mensagem no WhatsApp do consultor
3. Evolution API → `evolution-webhook` (Supabase)
4. Bot envia boas-vindas e pede foto da conta de energia
5. OCR Gemini extrai dados da conta (nome, CEP, distribuidora, instalação, valor)
6. Confirmação dos dados (botões SIM / NÃO / EDITAR)
7. Solicita tipo de documento (RG Novo / RG Antigo / CNH)
8. Recebe frente + verso → OCR Gemini extrai CPF, RG, nascimento
9. Perguntas manuais (telefone, email, número, complemento)
10. Botão "Finalizar" → valida dados → status `aguardando_automacao`
11. Worker VPS faz polling, abre portal, preenche em 5 etapas
12. Portal envia OTP no WhatsApp do **próprio cliente**
13. Cliente digita código → webhook injeta no portal via worker
14. Portal libera link de validação **facial/biométrica**
15. Worker captura link → envia ao cliente
16. Cliente faz selfie e responde "PRONTO"
17. Status final: `cadastro_concluido`

### 3. Fluxos paralelos mostrados
- Upload de documentos para **MinIO** (fire-and-forget)
- Logs em `worker_phase_logs` e `conversations`
- Resiliência: leads `automation_failed` reenfileirados após 10min
- Throttling do webhook (4 msgs/5s por telefone)
- Recovery de conexão WhatsApp (3 ciclos)

### 4. Estilo visual
- Subgrafos coloridos por camada (cliente, gateway, backend, automação, portal)
- Setas indicando direção do dado
- Notas em pontos críticos (OCR, OTP, Facial)
- Sem emojis (causa erro de lexer)

## Resultado

Um arquivo `fluxo-completo-igreen.mmd` entregue como artifact que você poderá visualizar diretamente no chat, mostrando o ciclo completo end-to-end do sistema.

