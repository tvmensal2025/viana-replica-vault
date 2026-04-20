

# Plano: Estabilizar contagem de Clientes e Licenciados (não somem mais)

## Diagnóstico

Confirmei no banco que os dados **NÃO somem** — eles continuam lá:

| Consultor | Clientes | Licenciados | Última sync |
|---|---|---|---|
| Rafael Ferreira Dias (`0c2711ad…`) | **613** | **48** | 20/04 16:53 |
| Bruna Roberta (`0063ce99…`) | **638** | **49** | 15/04 04:15 |

A sensação de "sumiu" vem de **3 bugs no front-end**, não de delete no banco:

### Bug 1 — `fetchCustomers` em `Admin.tsx` engole erros e zera a tela
```tsx
} catch { /* silently handle */ }   // ← se 1 página da paginação falhar, customers fica []
```
Se a primeira chamada `range(0, 999)` retornar erro de rede transitório, a tela mostra **0 clientes** sem aviso, sem retry. O usuário pensa que sumiram.

### Bug 2 — Race condition entre fetch e troca de aba
```tsx
React.useEffect(() => {
  if (activeTab === "clientes" || activeTab === "dashboard") {
    fetchCustomers();   // dispara cada vez que troca aba
  }
}, [activeTab, fetchCustomers]);
```
Se o usuário troca de aba rápido, duas requests acontecem em paralelo. A segunda pode terminar antes e ser sobrescrita pela primeira (que retorna parcial). Sem `AbortController`.

### Bug 3 — `useAnalytics` (Dashboard) tem o mesmo padrão sem `staleTime` longo
`staleTime: 30_000` força refetch a cada 30s. Se o refetch falha no `throw`, a `data` cai pra `undefined` e os números do Dashboard viram 0/zerados temporariamente.

### Bug 4 — `NetworkPanel.fetchMembers` também engole erro
```tsx
} catch { /* silently handle */ } finally { setLoading(false); }
```
Mesmo problema: erro silencioso → tela vazia → usuário acha que sumiu.

### Bug 5 — Conta iGreen compartilhada entre 2 consultores (você confirmou)
`rafael.ids@icloud.com` está vinculado em `0c2711ad…` (Rafael) E `0063ce99…` (Bruna). O código usa `customer.consultant_id = consultantId` no upsert — então cada um tem seu próprio conjunto separado, mas **a sync faz `delete stale` filtrando por consultant_id**, então não apaga o do outro consultor. Hoje convive bem, mas se algum dia rodar a sync de um e a contagem cair, o usuário pensa que sumiu (eram dados do outro consultor que ele estava olhando logado errado). Como você pediu "compartilhada", apenas adiciono um aviso visual.

## O que vamos fazer

### 1. Tornar `fetchCustomers` robusto e visível (Admin.tsx)
- Adicionar `AbortController` para cancelar request anterior quando troca de aba
- Trocar o `catch silent` por `console.error` + manter `customers` antigo (não zerar em erro)
- Adicionar **retry automático** (3 tentativas com backoff 1s/2s/4s) em caso de erro de rede
- Adicionar `loading` state visível na UI quando busca está rodando (skeleton no card de Clientes)

### 2. Cache local persistente (não some no F5)
- Salvar última lista de `customers` em `sessionStorage` (chave `customers_${userId}`)
- Ao abrir a página, hidratar imediatamente do cache E disparar refetch em background
- Resultado: usuário **nunca vê 0** ao abrir o painel — vê dados antigos enquanto atualiza

### 3. Reforçar `useAnalytics` (Dashboard)
- `staleTime` de 30s → **5 minutos** (dados de cliente não mudam tanto)
- Adicionar `keepPreviousData: true` (React Query mantém dados anteriores enquanto refaz)
- `retry: 3` com `retryDelay: exponential`
- Em caso de erro final, manter `previousData` em vez de virar `undefined`

### 4. Reforçar `NetworkPanel.fetchMembers`
- Mesmo padrão: AbortController, retry, cache em `sessionStorage`, mantém última lista em erro
- Toast vermelho se falhar de verdade ("Erro ao carregar rede — mostrando dados em cache")

### 5. Indicador visual "última sincronização"
- Mostrar ao lado do botão Sincronizar: "Atualizado há 2 minutos" (já existe `lastSync` em settings, só preciso exibir consistente)
- Nunca esconder a contagem antiga durante a sincronização

### 6. Aviso de conta compartilhada (Bug 5)
- No card de credenciais (Dados), se a query detectar que outro consultor usa a mesma `igreen_portal_email`, mostrar badge amarelo: *"Esta conta iGreen é compartilhada com X outro(s) consultor(es). Cada um vê seus próprios clientes."*

## Detalhes técnicos

| Arquivo | Mudança | Risco |
|---|---|---|
| `src/pages/Admin.tsx` | AbortController + retry + cache sessionStorage + não zerar em erro | Baixo |
| `src/hooks/useAnalytics.ts` | staleTime 5min + keepPreviousData + retry 3x | Zero |
| `src/components/admin/NetworkPanel.tsx` | Mesmo padrão de robustez no fetchMembers | Baixo |
| `src/components/whatsapp/CustomerManager.tsx` | Toast quando lista vier vazia mas o cache tem dados | Zero |
| `src/components/admin/DashboardTab.tsx` | Badge "conta compartilhada" se detectar duplicidade | Zero |

**Nada de mudança no banco. Nada de mexer na edge function `sync-igreen-customers`.** O sync já está correto — ele só faz upsert e nunca deleta clientes (só deleta `network_members` stale, e isso é correto). O problema é puramente de leitura/exibição no front.

## Ganhos esperados

- **F5 nunca mostra 0**: cache local hidrata em <50ms, refetch em background
- **Erro de rede transitório não esconde nada**: mantém última lista visível
- **Race condition resolvida**: AbortController garante que só a request mais recente vence
- **Usuário sabe quando algo está atualizando**: spinner pequeno + "Atualizando…" sem esconder os números
- **Contagem nunca cai sem aviso**: se a sync trouxer menos clientes, toast explica o porquê

## Ordem de implementação (4 commits seguros)

1. `useAnalytics` — staleTime + keepPreviousData + retry (zero risco, melhora Dashboard)
2. `Admin.tsx` `fetchCustomers` — AbortController + cache + retry (resolve "F5 some")
3. `NetworkPanel` `fetchMembers` — mesmo padrão (resolve "Rede some")
4. Badge de conta compartilhada (cosmético, alerta o usuário)

Cada passo é testável isoladamente. Se algo quebrar, só esse commit precisa ser revertido.

