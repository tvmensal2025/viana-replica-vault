---
name: Portal Flow Logic (worker + OTP + Facial) — Atualizado 20/04/2026
description: Fluxo end-to-end validado live em 20/04/2026. Worker Playwright preenche portal → OTP via WhatsApp do cliente → link facial → cliente confirma PRONTO → cadastro_concluido. Todos os campos mapeados por name="".
type: feature
---

## Fluxo unificado (atualizado v3 - 2026-04-19)

1. **Coleta no WhatsApp** (`evolution-webhook`): bot conduz cliente até preencher todos os campos validados por `validateCustomerForPortal`. Lead vira `status='aguardando_automacao'` ou `conversation_step='finalizando'`.

2. **Worker (Playwright VPS)**: faz polling em `customers`, abre `digital.igreenenergy.com.br`, preenche em 5 etapas (CEP/valor → CPF/contato → endereço → docs → perguntas). Ao clicar **Finalizar** seta `conversation_step='aguardando_otp'`.

3. **OTP**: portal envia código de 4-8 dígitos para o **WhatsApp do PRÓPRIO cliente** (não na instância do consultor). Cliente digita o código na conversa com o bot. Webhook detecta regex `/^\d{4,8}$/` no step `aguardando_otp` → salva `customers.otp_code` + `otp_received_at`. Worker faz polling, injeta no portal.

4. **Facial (link gerado pelo portal)**: após validar OTP, o portal libera URL da validação biométrica. Worker captura essa URL → atualiza `customers.link_facial` e `conversation_step='aguardando_facial'` → dispara mensagem WhatsApp com o link.

5. **Confirmação manual do cliente**: cliente abre o link, faz selfie/liveness, e responde "PRONTO" / "CONCLUÍDO" / "TERMINEI" / "OK" no WhatsApp. Webhook detecta via regex `/\b(pronto|prontinho|conclu[ií]do|finalizei|terminei|fiz|feito|ok|certo|sim)\b/i` no step `aguardando_facial` → seta `facial_confirmed_at`, `status='cadastro_concluido'`, `conversation_step='complete'`.

6. **Resiliência**: leads `automation_failed` ou `worker_offline` reenfileirados após 10min. `worker_phase_logs` registra cada fase com screenshot/duração.

## Steps de conversation_step do final do fluxo
- `finalizando` → worker pega o lead
- `portal_submitting` → worker está preenchendo
- `aguardando_otp` → cliente deve digitar OTP recebido no próprio WhatsApp
- `validando_otp` → worker injetou OTP no portal, aguarda resposta
- `aguardando_facial` (ou legado `aguardando_assinatura`) → cliente deve abrir `link_facial` e responder confirmação
- `complete` + `status='cadastro_concluido'` → fim

## Colunas relevantes em `customers`
- `otp_code`, `otp_received_at` — preenchidas pelo webhook quando cliente digita
- `link_facial` — preenchida pelo worker ao capturar URL no portal (NOVA, prefere essa sobre `link_assinatura`)
- `link_assinatura` — legada, ainda usada como fallback de leitura
- `facial_confirmed_at` — preenchida pelo webhook quando cliente confirma manualmente

## TODO worker (VPS — fora deste repo)
Após validar OTP no portal, o worker deve:
1. Aguardar redirect/aparição do link de facial na DOM do portal iGreen
2. Capturar a URL completa
3. UPDATE `customers SET link_facial=..., conversation_step='aguardando_facial' WHERE id=...`
4. Disparar mensagem via Evolution API: `"📸 Última etapa! Abra: {link}\nQuando terminar, responda PRONTO"`
