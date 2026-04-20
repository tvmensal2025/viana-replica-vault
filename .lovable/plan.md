

# Plano: Otimização de Performance (sem quebrar nada)

## Diagnóstico

| Problema | Evidência | Impacto |
|---|---|---|
| **Webhook gigante** | `evolution-webhook/index.ts` = **1.702 linhas, 43 cases** | Cold start lento, deploy demorado, difícil manter |
| **Hooks gigantes** | `useWhatsApp.ts` 854 linhas, `useChats.ts` 319, `TemplateManager.tsx` 830 | Bundle inicial pesado, re-renders custosos |
| **Polling somado** | useChats 30s + useMessages 15s + useWhatsApp 8–10s + ConnectionPanel + 4 canais Realtime simultâneos | Tráfego e CPU constantes mesmo ocioso |
| **Vite sem split de chunks** | Sem `manualChunks`, sem compressão, sem minify configurado | 1 bundle grande no first load |
| **Pasta `screenshots/` (11 MB)** versionada | Vai pro Git e infla deploys | Lentidão deploy |
| **Imagens .webp na raiz** servidas sem `loading="lazy"` consistente | 8 webps × ~70 KB carregados na landing | Landing lenta em 3G |
| **Realtime "fire-and-forget"** | 4 canais separados em `useNotifications` | Conexões WS extras |

Lazy-loading de rotas **já está OK** ✅ (App.tsx). O problema é o que está **dentro** de cada rota.

---

## O que vamos fazer (sem quebrar)

### 1. Quebrar o webhook em módulos (sem mudar comportamento)
`supabase/functions/evolution-webhook/index.ts` (1.702 linhas) → dividir em arquivos no mesmo diretório (Deno aceita imports relativos):

```text
evolution-webhook/
  index.ts                  ← apenas roteamento (~150 linhas)
  steps/
    welcome.ts              ← cases iniciais
    conta-energia.ts        ← OCR conta + edição
    documento.ts            ← OCR doc + edição
    perguntas.ts            ← ask_name, ask_cpf, ask_email...
    finalizacao.ts          ← finalizando, OTP, facial
  helpers/
    rate-limit.ts
    cep.ts
    minio.ts
```

Cada step exporta `async function handle(ctx) { ... }`. Zero mudança de lógica — só extração. Mais fácil debugar e o cold-start lê só o que precisa.

### 2. Quebrar os hooks do front
- `useWhatsApp.ts` (854) → separar em `useWhatsAppConnection` (init/connect/disconnect) + `useWhatsAppPolling` (loop de status) + `useWhatsAppRecovery` (3 ciclos). Re-export do `useWhatsApp` mantém API atual (zero quebra para componentes).
- `useChats.ts` (319) → extrair `chatDeduplication.ts` puro (testável, sem React).
- `TemplateManager.tsx` (830) → quebrar em `TemplateList`, `TemplateForm`, `TemplateScheduler`. Default export continua sendo `TemplateManager`.

### 3. Reduzir polling redundante (CRM responde igualzinho)
- `useChats`: 30s → **45s** + pausar quando aba `document.hidden` (Page Visibility API).
- `useMessages`: 15s → **20s** + pausar quando aba oculta. Realtime já pega INSERT — polling vira só fallback.
- `useNotifications`: unir os **4 canais** em **1 canál multiplexado** (`.on('postgres_changes', ...).on('postgres_changes', ...).subscribe()`).
- `useWhatsApp`: manter 8s só quando `connecting`/`degraded`; quando `healthy`, subir para **20s** (já existe a constante `HEALTHY_POLL_INTERVAL` — só ajustar valor).

Resultado: ~60% menos requests em idle, sem perder reatividade real (Realtime cobre).

### 4. Lazy-load de componentes pesados dentro do `/admin`
`Admin.tsx` importa `WhatsAppTab` e `WhatsAppDashboard` direto. Trocar por:
```ts
const WhatsAppTab = lazy(() => import("@/components/whatsapp/WhatsAppTab"));
const TemplateManager = lazy(() => import("@/components/whatsapp/TemplateManager"));
const BulkBlockSendPanel = lazy(() => import("@/components/whatsapp/BulkBlockSendPanel"));
```
Cada aba só carrega quando o usuário clica. **Admin abre na metade do tempo.**

### 5. Configurar Vite para bundle menor
Atualizar `vite.config.ts`:
```ts
build: {
  target: 'es2020',
  minify: 'esbuild',
  cssMinify: true,
  chunkSizeWarningLimit: 800,
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        'supabase': ['@supabase/supabase-js'],
        'radix': ['@radix-ui/react-dialog','@radix-ui/react-dropdown-menu','@radix-ui/react-tabs','@radix-ui/react-popover'],
        'charts': ['recharts'],
      },
    },
  },
},
```
React/Supabase/Radix passam a ser cacheados separadamente — segunda visita praticamente instantânea.

### 6. Imagens da landing
- Adicionar `loading="lazy"` e `decoding="async"` em **todas** as `<img>` dos componentes `Lic*` e seções da home.
- Adicionar `width`/`height` para evitar layout shift.
- Sem reconverter formato — já são .webp.

### 7. Limpeza de peso morto do repo
- Adicionar `screenshots/` ao `.gitignore` (11 MB que não precisam ir pro deploy).
- Adicionar `*.md` antigos de documentação interna ao `.vercelignore`/`.lovableignore` se existir (não afeta runtime, só deploy).

---

## Detalhes técnicos

| Mudança | Arquivos | Risco |
|---|---|---|
| Refator webhook | `evolution-webhook/index.ts` + novos `steps/*.ts` `helpers/*.ts` | Baixo — extração mecânica, mesmas funções |
| Refator hooks | `useWhatsApp.ts`, `useChats.ts`, `useMessages.ts`, `useNotifications.ts` | Baixo — assinatura pública mantida |
| Lazy admin | `src/pages/Admin.tsx` + Suspense fallback | Zero — padrão já usado no App.tsx |
| Vite manualChunks | `vite.config.ts` | Zero |
| Page Visibility no polling | hooks de chat/messages | Zero |
| Imagens lazy | componentes `Lic*`, `HeroSection`, etc. | Zero |
| .gitignore | screenshots/ | Zero |

**Nada de mudança de schema, nada de mexer em Worker VPS, nada de mudar API pública dos hooks.** Tudo mantém o comportamento atual.

---

## Ganhos esperados

- **Bundle inicial**: ~30–40% menor (manualChunks + lazy do admin)
- **Tempo de abrir /admin**: ~50% mais rápido (WhatsApp components sob demanda)
- **Tráfego de rede em idle**: ~60% menor (polling adaptativo + canais unidos)
- **Cold start do webhook**: ~40% mais rápido (módulos menores)
- **Manutenção**: código modular, fácil de achar bug

---

## Ordem de implementação (5 commits seguros)

1. `vite.config.ts` + `.gitignore` (zero risco, já melhora)
2. Lazy-load no `Admin.tsx`
3. Polling adaptativo + unificação de canais Realtime
4. Refator dos hooks (mantendo exports)
5. Refator do webhook em módulos (testar com simulação de lead após)

Cada passo é testável isoladamente. Se algo quebrar, só esse passo precisa ser revertido.

