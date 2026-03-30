

# Plano: Sincronização Automática Diária com o Portal iGreen

## Resumo

Criar uma Edge Function que faz login no portal `escritorio.igreenenergy.com.br`, extrai os dados de clientes da página "Mapa Clientes", e faz upsert na tabela `customers` do Supabase. Um cron job (pg_cron) dispara essa função todos os dias às 7h da manhã.

## Problema

Hoje o consultor precisa entrar no portal iGreen manualmente, exportar dados e importar via Excel. Queremos automatizar isso.

## Abordagem Técnica

### 1. Armazenar credenciais do portal iGreen

Salvar as credenciais como secrets no Supabase:
- `IGREEN_PORTAL_EMAIL` — email de login do portal
- `IGREEN_PORTAL_PASSWORD` — senha de login do portal

Você fornecerá esses valores quando solicitado.

### 2. Criar Edge Function `sync-igreen-customers`

A função fará:

1. **Login**: POST para o endpoint de autenticação do portal iGreen, capturando o cookie/token de sessão
2. **Scraping**: GET na página `/mapa-clientes` (ou API interna se existir) usando a sessão autenticada
3. **Parse**: Extrair dados de cada cliente (nome, telefone, CPF, cidade, distribuidora, andamento, devolutiva, etc.)
4. **Upsert**: Para cada cliente, fazer upsert na tabela `customers` usando `igreen_code` ou `cpf` como chave de deduplicação, vinculando ao `consultant_id`

A função reutilizará o mesmo mapeamento de campos que já existe na importação Excel.

### 3. Configurar pg_cron para execução diária às 7h

Usar `pg_cron` + `pg_net` para chamar a Edge Function automaticamente:
- Schedule: `0 10 * * *` (7h Brasília = 10h UTC)
- Chamará a função via HTTP POST

### 4. UI: Botão de sincronização manual + log

Adicionar na aba Clientes:
- Botão "Sincronizar com iGreen" para disparo manual
- Indicador da última sincronização (timestamp salvo em `consultants` ou tabela auxiliar)

## Risco e Alternativa

O portal iGreen pode não ter uma API pública — nesse caso usaremos scraping HTML. Se o portal bloquear requisições de servidores, uma alternativa seria usar Firecrawl (já disponível como conector) para extrair os dados via scraping gerenciado.

**Próximo passo**: Precisarei acessar o portal para entender a estrutura de login e da página de dados. Você pode me fornecer a URL exata de login e eu faço a análise?

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/sync-igreen-customers/index.ts` | Criar — lógica de login, scraping e upsert |
| `src/components/whatsapp/CustomerManager.tsx` | Modificar — botão de sync manual |
| Supabase secrets | Adicionar `IGREEN_PORTAL_EMAIL`, `IGREEN_PORTAL_PASSWORD` |
| SQL (pg_cron) | Agendar execução diária às 7h |

