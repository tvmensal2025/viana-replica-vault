

## Plano: WhatsApp Tab acessivel sem conexao

### Problema
Quando o WhatsApp nao esta conectado, o componente `WhatsAppTab` mostra apenas o painel de conexao (linhas 205-223), bloqueando acesso a clientes, CRM, templates, agendamentos.

### Solucao
Remover o bloqueio condicional e sempre mostrar as sub-abas. O painel de conexao vira uma sub-aba propria ou fica embutido na aba "Conversas" quando desconectado.

### Alteracoes em `src/components/whatsapp/WhatsAppTab.tsx`

1. **Remover o early return** (linhas 205-223) que bloqueia tudo quando desconectado
2. **Alterar a barra de status** no topo: se conectado mostra o indicador verde atual; se desconectado mostra um indicador vermelho com botao "Conectar" inline
3. **Na sub-aba "Conversas"**: se desconectado, mostrar o `ConnectionPanel` em vez do chat; se conectado, mostrar o chat normalmente
4. **Sub-abas "CRM", "Clientes", "Templates", "Agendamentos"**: sempre acessiveis independente do status
5. **Sub-aba "Envio em Massa"**: mostrar aviso de que precisa conectar o WhatsApp se desconectado (pois depende de `instanceName` para enviar)
6. **Sub-aba "Agendamentos"**: idem, mostrar aviso se desconectado

Funcionalidades que dependem de `instanceName` (envio de mensagens, conversas) mostram o painel de conexao ou um aviso. Funcionalidades independentes (clientes, templates, CRM) funcionam normalmente.

