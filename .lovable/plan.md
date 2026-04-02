
Objetivo: eliminar o erro intermitente 401 do WhatsApp sem derrubar o preview.

Diagnóstico
- O problema principal está no fluxo de autenticação entre `src/services/evolutionApi.ts` e `supabase/functions/evolution-proxy/index.ts`.
- Hoje o frontend busca o token com `supabase.auth.getSession()` a cada chamada. Em cenários intermitentes de refresh de sessão, esse token pode ficar ausente ou inconsistente por um momento.
- Quando isso acontece, a chamada segue mesmo assim para a edge function, que responde `401 Token de autenticação inválido ou ausente`.
- Parte dessas chamadas acontece em handlers assíncronos e polling; nem todas estão protegidas contra rejeição não tratada, então o preview às vezes mostra o erro global.
- Além disso, a edge function ainda está forçando `http -> https` em `normalizeEvolutionBaseUrl`, contrariando a configuração salva e podendo gerar instabilidade extra.

Plano de implementação

1. Endurecer o cliente da Evolution API
- Arquivo: `src/services/evolutionApi.ts`
- Substituir o fetch manual para a edge function por um fluxo mais seguro:
  - não enviar requisição se não houver token válido;
  - tratar 401 como erro controlado, não como falha genérica;
  - preferir a integração do próprio client Supabase para invocar a function, ou no mínimo centralizar uma rotina de token com retry curto antes de desistir.
- Criar um erro/tipo interno de auth (`unauthorized` / `session_missing`) para os hooks conseguirem reagir sem quebrar a UI.

2. Impedir que polling e refresh derrubem a tela
- Arquivo: `src/hooks/useWhatsApp.ts`
- Envolver `refreshQr`, polling interno e caminhos de reconexão com `try/catch` completo.
- Quando receber erro de autenticação:
  - parar o polling atual;
  - mudar o estado para desconectado;
  - mostrar mensagem amigável;
  - nunca relançar a exceção para o runtime global.
- Arquivo: `src/components/whatsapp/ConnectionPanel.tsx`
- Consumir com segurança o `onRefreshQr()` automático no vencimento do QR para evitar promise rejeitada sem tratamento.

3. Tornar hooks de chat tolerantes a falhas temporárias de auth
- Arquivos: `src/hooks/useChats.ts`, `src/hooks/useMessages.ts`, `src/components/whatsapp/CustomerManager.tsx`
- Para chamadas não críticas (`findChats`, `findMessages`, `getProfilePicture`, `markAsRead`):
  - em caso de auth temporária, retornar vazio/null e aguardar próxima tentativa;
  - não deixar esse erro escapar para a aplicação inteira.

4. Ajustar a edge function para comportamento previsível
- Arquivo: `supabase/functions/evolution-proxy/index.ts`
- Corrigir `normalizeEvolutionBaseUrl` para respeitar exatamente o protocolo configurado no secret `EVOLUTION_API_URL`.
- Melhorar a leitura do header `Authorization`:
  - trim do valor;
  - parsing mais robusto do prefixo `Bearer`;
  - resposta 401 estruturada com código identificável.
- Manter logs úteis sem expor token.

5. Validação final
- Testar o carregamento da aba WhatsApp ao abrir `/admin`.
- Testar clique em `Reconectar` e renovação de QR.
- Deixar a aba aberta por alguns minutos para validar refresh/polling.
- Confirmar que, mesmo quando houver 401 momentâneo, a interface permanece funcional e apenas mostra estado desconectado em vez do erro global.

Detalhes técnicos
- Arquivos envolvidos:
  - `src/services/evolutionApi.ts`
  - `src/hooks/useWhatsApp.ts`
  - `src/hooks/useChats.ts`
  - `src/hooks/useMessages.ts`
  - `src/components/whatsapp/ConnectionPanel.tsx`
  - `src/components/whatsapp/CustomerManager.tsx`
  - `supabase/functions/evolution-proxy/index.ts`
- Não deve exigir mudança de banco/RLS.
- Resultado esperado:
  - some o “The app encountered an error”;
  - falhas intermitentes de sessão viram estado tratado;
  - conexão WhatsApp fica resiliente mesmo com refresh de auth.