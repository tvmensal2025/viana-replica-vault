

# Plan: Otimizar conexão WhatsApp e envio em massa

## Problemas identificados

1. **Init demora muito**: Na montagem, o hook faz `confirmConnectedState` com ate 3 tentativas de 1200ms cada, somando 3.6s+ antes de mostrar qualquer coisa. Se a API estiver lenta, fica travado em "Verificando conexao..."

2. **Polling agressivo em estado instavel**: Quando o estado e "unknown" ou "connecting", o polling roda a cada 5s com grace periods, gerando muitas requisicoes que sobrecarregam a API

3. **Envio em massa sem randomizacao**: O intervalo fixo de 20s entre mensagens e previsivel, o que pode causar bloqueio pelo WhatsApp por deteccao de automacao

4. **Sem timeout no init**: Se a API Evolution estiver fora, o init pode ficar pendurado indefinidamente

## Mudancas propostas

### 1. Otimizar init do useWhatsApp (`src/hooks/useWhatsApp.ts`)
- Reduzir `confirmConnectedState` no init para 1 tentativa (sem re-check)
- Se o primeiro `checkState` retornar "open", conectar imediatamente sem confirmar
- Adicionar timeout global de 8s no init - se exceder, mostrar estado desconectado ao inves de ficar carregando
- Se estado for "close" ou "unknown", ir direto para desconectado sem tentar QR

### 2. Reduzir agressividade do polling
- Aumentar intervalo de grace period de 5s para 10s
- Aumentar polling quando em estado "close" de 3s para 8s
- Limitar tentativas de QR automatico antes de parar e mostrar botao manual

### 3. Randomizar intervalo no envio em massa (`src/components/whatsapp/BulkSendPanel.tsx`)
- Mudar `SEND_INTERVAL_MS` de 20s fixo para intervalo randomizado entre 18s-35s
- Adicionar variacao progressiva: apos cada 10 mensagens, adicionar 5s extra ao intervalo base
- Isso simula comportamento humano e reduz risco de bloqueio

### 4. Adicionar delay entre mensagens multiplas do mesmo contato
- No loop de envio (audio -> imagem -> texto), ja existe delay entre tipos de midia
- Adicionar delay randomizado de 2-4s entre cada tipo (atualmente fixo em 0s no bulk send)

## Arquivos a editar
- `src/hooks/useWhatsApp.ts` - Init e polling
- `src/components/whatsapp/BulkSendPanel.tsx` - Intervalos de envio

