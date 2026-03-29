
Objetivo: entregar uma correção estrutural para o QR Code conectar de forma estável (máximo possível), eliminando falhas de fluxo, persistência e diagnóstico.

1) Diagnóstico profundo (causas-raiz confirmadas)

- Causa-raiz #1 (crítica): persistência quebrada da instância
  - Evidência: requisição `POST /rest/v1/whatsapp_instances?on_conflict=consultant_id` retornando `400` com:
    `there is no unique or exclusion constraint matching the ON CONFLICT specification`.
  - No banco existe `UNIQUE(instance_name)`, mas não existe `UNIQUE(consultant_id)`.
  - Impacto:
    - `preCreateWhatsAppInstance` não fixa a instância no banco.
    - `useWhatsApp` também falha silenciosamente no `upsert`.
    - reconexão entre sessões fica inconsistente.

- Causa-raiz #2 (crítica): erros do Supabase ignorados no frontend
  - Em `useWhatsApp.ts` e `preCreateInstance.ts`, os retornos de `.upsert()`/`.delete()` não validam `error`.
  - O app “acha” que salvou, mas o banco recusou.

- Causa-raiz #3 (alta): loop infinito em “connecting” sem estratégia de quebra
  - `connectionState` tem timeout de 10s no proxy.
  - Em timeout, o proxy devolve `200 { state: "connecting", timeout: true }`.
  - Resultado: UI pode ficar eternamente “conectando”, sem detectar estado inválido/QR expirado.

- Causa-raiz #4 (alta): ausência de renovação automática de QR
  - Após gerar QR, o fluxo só faz polling de `connectionState`.
  - Se QR expira/não valida, não há rotina robusta de reemitir QR automaticamente em janela controlada.

- Causa-raiz #5 (média): observabilidade insuficiente
  - Muitos `catch {}` silenciosos.
  - Falta trilha explícita de “falhou DB”, “falhou connect”, “QR expirou”, “tentativa N”.

2) Plano de correção robusta (ordem de execução)

Fase A — Corrigir base de dados (bloqueador)
- Criar migração SQL para:
  1. deduplicar `whatsapp_instances` por `consultant_id` (manter mais recente),
  2. criar `UNIQUE (consultant_id)`.
- Resultado esperado: `upsert(..., { onConflict: "consultant_id" })` passa a funcionar.

Fase B — Tornar erros explícitos (sem silêncio)
- `src/hooks/useWhatsApp.ts`:
  - validar `error` em todo `upsert/delete/select`.
  - se falhar persistência, logar no painel de diagnóstico e exibir erro claro.
- `src/services/preCreateInstance.ts`:
  - mesmo tratamento; manter fire-and-forget, mas com log técnico interno.

Fase C — Máquina de estados de conexão mais resiliente
- Reestruturar fluxo com estados claros:
  - `preparing` → `qr_ready` → `waiting_scan` → `connected` → `reconnecting` → `failed`.
- Regras:
  - impedir chamadas paralelas de `createAndConnect` (lock/guard).
  - não limpar QR sem motivo forte.
  - se `connectionState` ficar em timeout contínuo por janela (ex: 60–90s), forçar `connectInstance` para regenerar QR.

Fase D — Ajustar proxy para ambiente lento
- `supabase/functions/evolution-proxy/index.ts`:
  - aumentar timeout de `connectionState` (ex: 20s).
  - habilitar 2 tentativas para `connectionState/connect` com backoff curto.
  - manter fallback amigável, mas incluir metadado de timeout para o frontend decidir refresh do QR.
- Objetivo: reduzir falso “connecting eterno”.

Fase E — UX para operação real
- Em `ConnectionPanel`:
  - timer visual de expiração do QR,
  - botão “Gerar novo QR” sempre disponível em `connecting`,
  - status textual de etapa atual (ex: “Aguardando leitura”, “Renovando QR”, “Reconectando”).
- Isso reduz travamento operacional para o consultor.

Fase F — Pré-criação consistente no login
- `Auth.tsx`:
  - disparar precreate também no caminho de sessão já existente (`getSession`) para não depender só do `onAuthStateChange`.
- Garante que ao entrar no WhatsApp a instância já esteja preparada.

3) Critérios de aceite (definição de “100% operacional” no app)

- Nenhum `POST whatsapp_instances ... on_conflict=consultant_id` retornando 400.
- Novo consultor:
  - login → abre aba WhatsApp → QR visível em até 10–20s.
- Se QR expirar:
  - sistema renova automaticamente sem travar.
- Se backend estiver lento:
  - usuário vê estados progressivos (não fica “preso” sem ação).
- Após escanear:
  - transição para `connected` confirmada em polling.
- Retorno ao sistema em nova sessão:
  - reanexa à mesma instância deterministicamente.

4) Riscos externos (transparência)

- “100% absoluto” depende também da disponibilidade do servidor WhatsApp/Evolution e da infraestrutura de rede.
- O plano acima entrega “100% de robustez do seu lado”:
  - persistência correta,
  - estados determinísticos,
  - autorrecuperação,
  - observabilidade clara.

5) Detalhes técnicos (implementação)

Arquivos impactados:
- `supabase/migrations/*` (nova migração para unique consultant_id e deduplicação)
- `src/hooks/useWhatsApp.ts`
- `src/services/preCreateInstance.ts`
- `src/pages/Auth.tsx`
- `supabase/functions/evolution-proxy/index.ts`
- `src/components/whatsapp/ConnectionPanel.tsx`

Fluxo alvo:
```text
Login
  -> precreate (persistência ok)
  -> WhatsApp tab
      -> check existing instance
      -> connectInstance (gera QR)
      -> polling connectionState
           -> open => connected
           -> timeout repetido => refresh QR controlado
           -> erro persistente => failed + ação clara
```
