
Objetivo: estabilizar o módulo WhatsApp sem depender de reiniciar container toda hora.

Diagnóstico atual
- O servidor não parece “morto” o tempo todo. Nos logs mais recentes ele voltou a responder:
  - `instance/connectionState` retornando `200 state=open`
  - `chat/findChats` e `chat/findMessages` retornando `200`
  - `chat/markMessageAsRead` retornando `201`
- O problema agora é carga desnecessária no frontend, que continua pressionando o Evolution mesmo quando ele acabou de se recuperar.
- Os pontos mais pesados que encontrei:
  1. `useMessages.ts` busca 100 mensagens a cada 5s.
  2. O mesmo `markAsRead` é disparado repetidamente para a mesma mensagem.
  3. `MessageBubble.tsx` auto-baixa mídia ao renderizar imagem (`getBase64FromMediaMessage`), e esse endpoint está levando 9–11s nos logs.
  4. `useMessages.ts` não deduplica mensagens; a resposta da API já veio com mensagens duplicadas, então a UI pode renderizar mídia duplicada e disparar downloads duplicados.
  5. `useWhatsApp.ts` trata erro transitório como `close`, o que pode iniciar reconexão/QR sem necessidade.
  6. `Admin.tsx` mantém `WhatsAppTab` montada mesmo quando a aba está escondida, então polling pode continuar em segundo plano.

Plano de implementação
1. Endurecer `useMessages.ts`
- Reduzir polling do chat aberto de 5s para algo mais seguro, como 15s.
- Adicionar trava de requisição em andamento para evitar overlap.
- Reduzir `limit` inicial de 100 para algo menor.
- Deduplicar mensagens por `key.id` antes de salvar no estado.
- Marcar como lida só quando aparecer uma nova mensagem recebida, não em todo ciclo.

2. Parar auto-download agressivo de mídia em `MessageBubble.tsx`
- Remover o auto-load de imagem ao montar o componente.
- Manter carregamento sob demanda por clique.
- Reutilizar mídia já carregada no estado para não buscar de novo.

3. Aliviar `useChats.ts`
- Manter polling da lista de conversas mais lento.
- Colocar proteção de “uma busca por vez”.
- Deixar foto de perfil como opcional/degradável: se o servidor estiver oscilando, retornar só avatar fallback sem insistir.
- Evitar nova rodada de fotos enquanto ainda houver fetch anterior em andamento.

4. Corrigir lógica de estado em `useWhatsApp.ts`
- Em erro transitório, não retornar `close` automaticamente.
- Introduzir comportamento mais conservador: erro de rede/timeout vira “aguardando/connecting”, não “desconectado”.
- Só entrar em fluxo de QR/recovery quando houver evidência real de sessão fechada, não apenas falha momentânea.

5. Pausar carga quando a aba não estiver ativa
- Passar um sinal de aba ativa de `Admin.tsx` para `WhatsAppTab.tsx`.
- Quando a aba WhatsApp estiver escondida:
  - pausar polling de mensagens
  - pausar refetch de chats
  - manter apenas o mínimo necessário para estado de conexão

Resultado esperado
- Queda grande nos requests repetidos.
- Fim do `markAsRead` em loop.
- Fim de downloads automáticos pesados ao abrir conversa.
- Menos chance de o Evolution cair logo após se recuperar.
- A UI deixa de ficar “presa” em estado de espera por causa de falsas desconexões.

Arquivos que eu mexeria
- `src/hooks/useMessages.ts`
- `src/components/whatsapp/MessageBubble.tsx`
- `src/hooks/useChats.ts`
- `src/hooks/useWhatsApp.ts`
- `src/components/whatsapp/WhatsAppTab.tsx`
- `src/pages/Admin.tsx`

Detalhes técnicos
```text
Hoje:
chat aberto
  -> findMessages a cada 5s
  -> markAsRead a cada 5s
  -> imagem renderiza
      -> getBase64FromMediaMessage automático
  -> erro transitório
      -> estado vira "close"
      -> recovery/QR desnecessário

Depois:
chat aberto
  -> findMessages com intervalo maior + sem overlap
  -> dedupe de mensagens
  -> markAsRead só quando houver nova inbound
  -> mídia só carrega sob demanda
  -> erro transitório mantém estado degradado, sem reset agressivo
```

Validação após implementar
- Na aba de network, confirmar que `findMessages` caiu para ~1 chamada por 15s.
- Confirmar que `markMessageAsRead` não repete para o mesmo `id`.
- Confirmar que abrir uma conversa com imagem não dispara `getBase64FromMediaMessage` sozinho.
- Confirmar em EasyPanel que 502/499 caíram bastante.
- Confirmar fluxo completo: conectar, abrir conversa, carregar imagem manualmente, enviar áudio/imagem/texto, trocar de aba e voltar.
