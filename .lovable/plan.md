

## Problema
O contador atual conta até 23:59:59 (fim do dia). Quando o visitante acessa à noite, mostra algo como "00:02:15" — passa a impressão de que já acabou, perdendo o efeito de urgência.

## Solução proposta: Contador fixo de 24h por sessão

Em vez de contar até meia-noite, o contador sempre mostra **24 horas** a partir do momento que o visitante abre a página. Isso garante que:
- Sempre aparece um tempo significativo (nunca perto de zero)
- Cada visitante vê urgência real independente do horário
- O valor é salvo no `localStorage` para que, se o visitante voltar no mesmo dia, continue de onde parou

## Alterações

**Arquivo**: `src/components/licenciada/LicUrgencyBanner.tsx`

1. Ao montar, verificar `localStorage` por um timestamp salvo (`urgency_timer_start`)
2. Se não existir ou tiver mais de 24h, salvar `Date.now()` como novo início
3. Calcular `timeLeft = startTime + 24h - now`
4. Se o tempo acabar, reiniciar automaticamente (novo ciclo de 24h)
5. Manter o visual atual do banner, apenas mudar a lógica do timer

