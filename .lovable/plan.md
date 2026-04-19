

## Diagnóstico de performance

O usuário quer o sistema rápido em PCs/internet lentos sem quebrar funcionalidades. Vou explorar o que pesa hoje.

Suspeitos principais (baseado na estrutura do projeto):
1. **Bundle gigante** — muitos componentes admin/whatsapp carregados de uma vez (sem lazy loading)
2. **Imagens .webp grandes** servidas sem otimização (club-pj, conexao-*, lojas-igreen-club)
3. **Polling excessivo** — useChats, useMessages, useWhatsApp fazendo refetch curto
4. **Realtime + queries duplicadas** no painel /admin
5. **Sem code-splitting** por rota (Admin, SuperAdmin, WhatsApp tudo no bundle inicial)

