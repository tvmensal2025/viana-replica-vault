
Objetivo: tornar a conexão WhatsApp realmente confiável e definir a política correta para instância com problema, sem deixar o cliente na mão.

Diagnóstico do que está acontecendo agora
- O sistema já tem uma instância salva no banco: `igreen-0063ce992be3`.
- O frontend usa nome fixo por consultor (`getFixedInstanceName`), então ele sempre tenta reaproveitar essa instância.
- Os logs do `evolution-proxy` mostram timeout repetido em `GET /instance/connectionState/igreen-0063ce992be3`.
- Então o problema principal hoje não é “sumiu a instância no banco”; é que o provedor não está respondendo bem ao check de estado.
- Excluir a instância imediatamente não é a prática mais segura. Profissionais primeiro tentam recuperação controlada; só recriam quando há forte evidência de corrupção da sessão/instância presa.

Recomendação profissional
- Padrão usado por operações maduras:
  1. Reaproveitar a instância existente
  2. Tentar regenerar QR / recuperar sessão
  3. Validar por múltiplos sinais, não só `connectionState`
  4. Só então executar “reset controlado” da instância
  5. Criar nova instância apenas como última etapa
- Motivo:
  - apagar cedo demais pode piorar o incidente;
  - pode invalidar sessão que ainda recuperaria sozinha;
  - pode gerar reconexões desnecessárias e aumentar indisponibilidade.

O que eu construiria
1. Fluxo de recuperação em 3 níveis
- Nível 1: Recuperação leve
  - manter instância atual;
  - tentar `connectInstance`;
  - aceitar “already connected”, QR disponível ou estado `open/connecting`.
- Nível 2: Recuperação guiada
  - se `connectionState` falhar por timeout repetido, testar também `fetchInstances` e/ou `connectInstance` antes de concluir erro;
  - mostrar “servidor lento, tentando recuperar” em vez de “conexão perdida”.
- Nível 3: Reset controlado
  - botão/admin flow “Resetar conexão com segurança”;
  - primeiro `logoutInstance`;
  - depois `deleteInstance`;
  - limpar registro local em `whatsapp_instances`;
  - então recriar e gerar novo QR.

2. Critério seguro para excluir a instância
- Excluir somente quando ocorrer um destes cenários:
  - timeout contínuo por várias tentativas e nenhuma rota auxiliar responde;
  - `connectInstance` também falha repetidamente;
  - QR nunca é gerado após janela limite;
  - erro explícito de instância quebrada/inexistente/incompatível;
  - usuário escolhe reset manual após diagnóstico claro.
- Não excluir automaticamente no primeiro timeout.

3. Blindagem inspirada em operações profissionais
- Máquina de estados explícita:
  - `healthy`
  - `degraded`
  - `recovering`
  - `needs_qr`
  - `reset_recommended`
  - `resetting`
- Circuit breaker para conexão:
  - após N timeouts consecutivos, parar polling agressivo;
  - entrar em modo degradado com backoff progressivo.
- Multi-sinal de saúde:
  - não depender só de `connectionState`;
  - combinar `connectionState`, `connectInstance`, e resposta do proxy.
- UX orientada a ação:
  - “Recuperar sessão”
  - “Gerar novo QR”
  - “Resetar conexão”
  - cada ação com explicação do impacto.

4. Melhorias específicas no código atual
- `src/hooks/useWhatsApp.ts`
  - separar “instância ruim” de “servidor lento”;
  - contar timeouts consecutivos;
  - adicionar fallback de diagnóstico antes de marcar como desconectado;
  - criar função de reset controlado reaproveitando `logoutInstance` + `deleteInstance`.
- `src/services/evolutionApi.ts`
  - adicionar chamadas auxiliares tolerantes a timeout para diagnóstico;
  - permitir respostas estruturadas do proxy com motivo (`timeout`, `fallback`, `connectionClosed`, `notReady`).
- `supabase/functions/evolution-proxy/index.ts`
  - aumentar resiliência para `connectionState`;
  - devolver JSON estruturado com motivo e recomendação, não só timeout genérico;
  - tentar fallback por endpoint alternativo quando aplicável;
  - distinguir:
    - serviço lento,
    - instância inexistente,
    - sessão fechada,
    - erro upstream.
- `src/components/whatsapp/ConnectionPanel.tsx`
  - adicionar painel operacional:
    - status do servidor,
    - status da instância,
    - última tentativa,
    - ação recomendada.
  - adicionar botão de reset seguro com confirmação forte.

5. Política recomendada para “nunca deixar o cliente na mão”
- Regra operacional:
  - nunca depender de um único check;
  - nunca derrubar a instância automaticamente por erro transitório;
  - sempre oferecer recuperação manual segura;
  - sempre mostrar o próximo passo exato ao usuário.
- Fallback de atendimento:
  - se a conexão estiver degradada, bloquear apenas ações que dependem dela;
  - manter templates, contatos, agendamentos e histórico acessíveis;
  - exibir status operacional claro no topo do módulo.

Fluxo recomendado para este projeto
```text
Tentativa de conexão
   ↓
checkState respondeu?
   ├─ sim, open → conectado
   ├─ sim, connecting/close → tentar QR / recuperar
   └─ não
       ↓
   testar connectInstance
       ├─ retornou QR → needs_qr
       ├─ already connected → conectado
       ├─ notReady/timeout → degraded + retry com backoff
       └─ falha repetida
           ↓
       recomendar reset controlado
           ↓
       logout + delete + limpar DB + recriar
```

Resposta objetiva à sua pergunta
- Sim, pode existir caso em que excluir a instância e abrir nova resolve.
- Mas o recomendado profissionalmente não é apagar de primeira.
- O recomendado é:
  1. tentar recuperar a instância atual;
  2. validar por mais de um sinal;
  3. só então executar reset seguro;
  4. recriar automaticamente se o reset confirmar que ela ficou inutilizável.

Plano enxuto de implementação
1. Reforçar o proxy para retornar diagnóstico estruturado e diferenciar timeout de instância inválida.
2. Melhorar o `useWhatsApp` para usar recuperação em camadas, com contadores e backoff.
3. Criar ação de “Reset seguro da instância” no painel de conexão.
4. Ajustar a UI para orientar o usuário com status operacional e ação recomendada.
5. Manter a instância atual como padrão e só recriar quando o diagnóstico realmente justificar.

Detalhes técnicos
- Evidência atual lida no projeto:
  - nome fixo da instância: `igreen-0063ce992be3`
  - registro existe em `whatsapp_instances`
  - falha atual: timeout repetido no `evolution-proxy` em `/instance/connectionState/...`
- Isso indica que a melhor próxima implementação é robustez de recuperação e reset seguro, não apenas “trocar instância”.

Se aprovado, eu seguiria exatamente nessa ordem:
1. Diagnóstico estruturado no proxy
2. Recuperação em camadas no hook
3. Botão de reset seguro
4. Estados visuais operacionais no painel
5. Regras para nunca apagar automaticamente cedo demais
