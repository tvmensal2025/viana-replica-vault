

## Plano: Informações completas do cliente + filtros + mensagem rápida

### Resumo
Adicionar campos do Excel que faltam (Devolutiva, Observação, Andamento iGreen), exibir todas as informações relevantes na lista de clientes, criar filtros por status clicáveis e permitir envio de mensagem padrão direto do card do cliente.

### 1. Migração SQL — Novos campos na tabela customers
- `andamento_igreen text` — status original do portal (ex: "Falta assinatura cliente", "Validado", "Devolutiva")
- `devolutiva text` — motivo da devolutiva/observação do portal
- `observacao text` — campo de observação livre

### 2. Importação Excel (CustomerManager.tsx)
Mapear colunas que faltam no `buildCustomerData`:
- "Andamento" → `andamento_igreen`
- "Devolutiva" → `devolutiva`
- "Observação" → `observacao`
- "Assinatura Cliente" e "Assinatura iGreen" já existem como info visual

### 3. Exibir informações completas no card expandido
Ao expandir um cliente, mostrar:
- **Distribuidora** (já salva no DB)
- **Licenciado** (registered_by_name)
- **Andamento iGreen** (status original do portal)
- **Devolutiva** (motivo, em destaque vermelho quando presente)
- **Observação**
- **Consumo médio** (media_consumo em kWh)
- **Desconto** (desconto_cliente)

### 4. Filtros por status clicáveis
Transformar os badges de stats (Total, Aprovados, Pendentes, Leads) em botões clicáveis que filtram a lista. Adicionar filtros:
- Todos | Aprovados | Pendentes | Devolutiva | Leads
- "Devolutiva" filtra clientes com `devolutiva` preenchida OU `andamento_igreen` contendo "Devolutiva"

### 5. Botão "Enviar WhatsApp" no card do cliente
No card expandido, adicionar botão para abrir conversa WhatsApp direta com o cliente (usando o phone_whatsapp). Permite copiar mensagem padrão baseada no status:
- Status "Devolutiva": mensagem pré-formatada informando o que precisa resolver
- Status "Falta assinatura": mensagem pedindo assinatura
- Usa variáveis: {nome}, {devolutiva}, {distribuidora}

### 6. Atualizar types do Supabase
Adicionar `andamento_igreen`, `devolutiva`, `observacao` ao tipo da tabela customers.

### Arquivos modificados
- `supabase/migrations/` — nova migração (3 colunas)
- `src/integrations/supabase/types.ts` — novos campos
- `src/components/whatsapp/CustomerManager.tsx` — importação, filtros, card expandido, botão WhatsApp

