

## Plano: Botão de Sincronização iGreen no Dashboard

### O que será feito

Adicionar um botão compacto "Sincronizar iGreen" no dashboard principal (aba Dashboard do Admin). Ao clicar:
1. Se o consultor **não tem** email/senha do portal iGreen salvos → abre um popup (Dialog) pedindo email e senha, salva na tabela `consultants`, e já inicia a sincronização.
2. Se **já tem** credenciais salvas → executa a sincronização direto, sem popup.

### Arquivos alterados

**`src/pages/Admin.tsx`**
- Importar `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` e `RefreshCw` icon
- Adicionar estados: `syncingDashboard`, `showCredentialsDialog`, `credForm` (email/senha)
- Adicionar função `handleDashboardSync`:
  - Busca credenciais do consultor no state (`form.igreen_portal_email`, `form.igreen_portal_password`)
  - Se vazias → abre o dialog de credenciais
  - Se preenchidas → chama `supabase.functions.invoke("sync-igreen-customers")` com as credenciais
- Adicionar função `handleSaveCredentialsAndSync`:
  - Salva email/senha na tabela `consultants` via update
  - Atualiza o state `form` local com as credenciais
  - Fecha o dialog
  - Inicia a sincronização automaticamente
- Renderizar um botão pequeno com ícone `RefreshCw` + "Sincronizar iGreen" ao lado dos KPIs de clientes (seção "Customer KPI Cards")
- Renderizar o `Dialog` de credenciais com dois inputs (email e senha) e botão "Conectar e Sincronizar"
- Após sincronização bem-sucedida, invalidar queries de analytics para atualizar os dados do dashboard

### Detalhes técnicos

- Reutiliza a mesma Edge Function `sync-igreen-customers` que já existe
- Credenciais são salvas nos campos `igreen_portal_email` e `igreen_portal_password` da tabela `consultants` (já existentes)
- Sem alterações no banco de dados — usa campos e funções já existentes
- O botão mostra spinner durante a sincronização
- Toast de feedback com resultado (sucesso/erro)

