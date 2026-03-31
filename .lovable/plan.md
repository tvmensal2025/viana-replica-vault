
Objetivo

- Deixar o envio de imagem, áudio e documento confiável no chat, templates, envio em massa e automações.

Achados principais

1. O upload não é o problema principal.
   - Na sessão, o arquivo foi anexado com sucesso e o toast confirmou o upload.

2. O bloqueio principal está no envio para o servidor WhatsApp.
   - O request real foi:
     `message/sendMedia/...`
     com URL pública do MinIO.
   - A resposta foi:
     `{"error":"Timeout ao enviar mensagem. Tente novamente.","timeout":true,"sent":false}`
   - Ou seja: o arquivo sobe, mas o Evolution/servidor WhatsApp demora ou falha ao buscar/processar a mídia remota.

3. Hoje o app mascara esse problema.
   - O proxy retorna payload “graceful” em timeout de `message/*`.
   - O frontend não valida `sent:false`, então parte da UI pode aparentar sucesso sem garantia real.

4. Existem bugs reais no código que pioram a confiabilidade:
   - `ChatView.tsx`: áudio gravado é enviado como `data:audio/ogg;base64,...`, mas o recorder gera `audio/webm`.
   - `ChatView.tsx`: mídia/áudio/documento não usam a mesma resolução de destinatário do texto (`resolveSendTargetJid`), então chats `@lid` podem falhar.
   - `evolutionApi.ts`: existe `sendDocument`, mas ele nunca é usado no fluxo do chat; o documento perde `fileName`.
   - `WhatsAppTab.tsx`: o `image_url` do template é descartado ao salvar.
   - `BulkSendPanel.tsx`: o botão bloqueia template de mídia sem texto.
   - `MessageComposer.tsx` e `minioUpload.ts`: tipos aceitos no frontend não batem com o backend (`audio/webm`, `xlsx` etc).

Plano de implementação

1. Unificar o pipeline de envio
   - Criar uma camada única de envio com retorno tipado:
     `sent | queued | timeout | failed`
   - Roteamento:
     - texto → `sendTextMessage`
     - imagem/vídeo → `sendMedia`
     - documento → `sendDocument`
     - áudio → `sendWhatsAppAudio`
   - Reusar essa camada em:
     - `ChatView`
     - `BulkSendPanel`
     - `KanbanBoard`
     - `crm-auto-progress`

2. Corrigir bugs de payload e destinatário
   - Fazer mídia/áudio/documento usarem a mesma lógica de resolução de JID do texto.
   - Corrigir o formato do áudio gravado: parar de enviar WebM rotulado como OGG; padronizar um formato realmente aceito.
   - Passar `fileName` no envio de documento.
   - Persistir `image_url` ao criar template.
   - Liberar envio em massa de template com mídia sem texto.
   - Alinhar `accept` do frontend com `upload-media`.

3. Parar falsos positivos de sucesso
   - Quando `message/*` voltar com timeout, a UI deve tratar como envio pendente/falho, não como sucesso silencioso.
   - Adicionar estado visual de:
     - processando
     - reenviar
     - falhou

4. Tornar mídia confiável de verdade
   - Implementar fila para `image/audio/document`:
     - cliente cria job
     - edge function responde rápido com `jobId`
     - worker processa com retry/backoff
     - frontend acompanha status
   - Usar essa fila em chat, bulk e automações.
   - Esse é o passo chave para ficar “100%”, porque remove a dependência do timeout do request interativo.

5. Endurecer o armazenamento das mídias
   - Validar se o gargalo é a URL do MinIO consumida pelo servidor WhatsApp.
   - Se continuar instável, migrar anexos de WhatsApp para bucket público no Supabase Storage para reduzir DNS/latência externa.

6. QA de ponta a ponta
   - Testar:
     - chat normal
     - chat `@lid`
     - imagem
     - áudio gravado
     - áudio de template
     - documento PDF/DOCX/XLSX
     - envio em massa com mídia sem texto
     - auto-mensagem do Kanban
   - Confirmar:
     - upload conclui
     - status do envio aparece corretamente
     - mensagem chega no WhatsApp
     - documento mantém nome
     - timeout não vira falso sucesso
     - reenvio funciona

Detalhes técnicos

- Arquivos mais críticos:
  - `src/components/whatsapp/ChatView.tsx`
  - `src/components/whatsapp/MessageComposer.tsx`
  - `src/components/whatsapp/BulkSendPanel.tsx`
  - `src/components/whatsapp/WhatsAppTab.tsx`
  - `src/hooks/useMessages.ts`
  - `src/services/evolutionApi.ts`
  - `supabase/functions/evolution-proxy/index.ts`
  - `supabase/functions/upload-media/index.ts`

- Evidência principal encontrada:
  - upload funcionou;
  - o envio da imagem falhou depois, no `message/sendMedia`, usando URL `https://igreen-minio...`, com `timeout:true`.

Conclusão

- Sim: hoje há coisas bloqueando a confiabilidade de imagem/áudio/documento.
- Não é um único bug; é uma combinação de:
  - timeout no envio remoto de mídia,
  - tratamento incorreto de timeout,
  - inconsistência de payload de áudio,
  - fluxo errado para documento,
  - bugs de templates e bulk send.
- Para ficar realmente “100%”, eu seguiria este caminho:
  1. corrigir os bugs locais,
  2. unificar o envio,
  3. mover mídia/áudio/documento para fila assíncrona com status.
