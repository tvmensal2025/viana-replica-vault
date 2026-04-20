

# Plano: Modularizar `useWhatsApp.ts` e `TemplateManager.tsx`

Continuação dos commits 4 e 6 do plano aprovado.

## Commit 4 — Modularizar `useWhatsApp.ts` (854 → ~150 linhas)

O arquivo já tem 2 helpers extraídos (`whatsappHelpers.ts`, `useWhatsAppInstanceDb.ts`). Vou criar mais 4 hooks especializados em `src/hooks/whatsapp/` e transformar o arquivo principal num orquestrador fino.

### Novos arquivos

**`useWhatsAppHealth.ts`** (~80 linhas)
Toda a lógica de health/timeout/recovery counters:
- `health` state + setters
- `consecutiveTimeouts` + `incrementTimeoutCounter` / `resetTimeoutCounter`
- `recoveryCyclesRef` + `resetRecoveryCounter`
- `haltRecovery` (pausa polling após N ciclos sem sinal)

**`useWhatsAppStateChecks.ts`** (~120 linhas)
Verificações de estado da Evolution API:
- `checkState(name)` — parse de diagnostic, timeout, missing
- `confirmConnectedState(name, attempts)` — confirma "open" com retries
- `tryGetQr(name)` — recovery nível 1 (pega QR ou detecta já conectado)
- `multiSignalCheck(name)` — recovery nível 2 (cross-check com connectInstance)
- `markConnected(name, message)` — finaliza conexão + salva instância

**`useWhatsAppPolling.ts`** (~150 linhas)
Loop de polling com circuit breaker:
- `startPolling(name)` / `stopPolling()`
- Lógica de grace period, escalation para QR, schedulePendingRecovery
- Recebe os checks/health/markConnected como dependências

**`useWhatsAppActions.ts`** (~250 linhas)
Ações públicas que o componente chama:
- `createAndConnect()` — fluxo completo de criar+conectar
- `refreshQr()` — renova QR
- `disconnect()` — encerra sessão e limpa
- `safeReset()` — reset nível 3 (logout → delete → recreate)
- `reconnect()` — alias

### Arquivo final `useWhatsApp.ts` (~150 linhas)

Vira um composer:
1. Declara state público (`connectionStatus`, `instanceName`, `qrCode`, `phoneNumber`, `isLoading`, `error`, `connectionLog`)
2. Compõe os 4 hooks acima passando refs/setters compartilhados
3. `useEffect` de mount (init: checa instance no DB e dispara polling se houver)
4. Retorna o **mesmo `UseWhatsAppReturn`** — zero mudança na API pública

**Compatibilidade**: nenhum componente que usa `useWhatsApp(consultantId)` precisa mudar. `export type { OperationalHealth }` preservado.

## Commit 6 — Modularizar `TemplateManager.tsx` (830 → ~200 linhas)

Componente único com state interno (criar, editar, gravar, upload). Vou separar em sub-componentes coesos no diretório `src/components/whatsapp/templates/`.

### Novos arquivos

**`templates/templateUtils.tsx`** (~50 linhas)
Helpers visuais puros:
- `MEDIA_TYPES` constante
- `mediaIcon(type)` / `mediaBadge(type)`
- `formatRecordingTime(seconds)`

**`templates/useAudioRecorder.ts`** (~80 linhas)
Hook de gravação de áudio (já existe `useAudioRecorder.ts` no projeto — vou reutilizar se compatível, senão crio versão específica):
- `isRecording`, `recordingTime`
- `startRecording()`, `stopRecording()`, `cancelRecording()`
- Callback `onAudioReady(file)` para upload externo

**`templates/TemplateCreateForm.tsx`** (~200 linhas)
Formulário de criação:
- State local: name, content, mediaType, mediaUrl, imageUrl, isSaving
- Upload de arquivo + upload de imagem combo (áudio+capa)
- Gravação de áudio integrada
- Recebe `onCreate` como prop

**`templates/TemplateListItem.tsx`** (~150 linhas)
Item da lista com 2 modos (view e edit):
- View: thumbnails, áudio player, link doc, botão preview/editar/deletar
- Edit: form inline com upload + selector de tipo + save/cancel
- Recebe `template`, `consultantId`, `onUpdate`, `onDelete`, `onPreview`
- Sub-componente `AddImageToTemplate` movido pra dentro

**`templates/TemplatePreviewDialog.tsx`** (~80 linhas)
Modal de preview com player de áudio/imagem/doc.

**`TemplateManager.tsx` final** (~200 linhas)
Orquestrador:
1. Recebe props (`templates`, `isLoading`, `consultantId`, callbacks)
2. State de `previewTemplate`
3. Renderiza header + `TemplateCreateForm` + lista de `TemplateListItem` + `TemplatePreviewDialog`

**Props públicas inalteradas** — quem importa `<TemplateManager />` continua funcionando.

## Ordem de execução

1. Commit 4 primeiro (hooks WhatsApp) — risco baixo, exports preservados
2. Testar: abrir painel, ver se conecta/QR/polling funcionam
3. Commit 6 (TemplateManager) — risco baixo, props preservadas
4. Testar: criar template texto, áudio com imagem, editar, deletar

## Tabela de risco

| Commit | Arquivos novos | Arquivos editados | Risco | API externa muda? |
|---|---|---|---|---|
| 4 — useWhatsApp | 4 | 1 | Baixo (refs compartilhados via props) | Não |
| 6 — TemplateManager | 5 | 1 | Baixo (props preservadas) | Não |

## Resultado esperado

| Arquivo | Antes | Depois |
|---|---|---|
| `useWhatsApp.ts` | 854 | ~150 |
| `TemplateManager.tsx` | 830 | ~200 |

Maior arquivo do `src/` cai de 854 pra ~250 linhas. Cada hook/componente com responsabilidade única, fácil de testar isoladamente.

