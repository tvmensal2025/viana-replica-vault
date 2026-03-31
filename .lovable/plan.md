

# Plano: Documentacao Completa do Sistema iGreen Energy

## Objetivo
Substituir o arquivo `DOCUMENTATION.md` existente por uma documentacao exaustiva que cubra todas as paginas, botoes, funcoes, fluxos, hooks, servicos, edge functions e tabelas do banco de dados -- escrita de forma que qualquer IA consiga entender e operar no sistema.

## Estrutura da Documentacao

O arquivo `DOCUMENTATION.md` sera reescrito com as seguintes secoes:

### 1. Visao Geral do Projeto
- Stack: React 18 + Vite + TypeScript + Tailwind + Supabase + Evolution API + MinIO
- Rotas: `/auth`, `/admin`, `/:licenca`, `/licenciada/:licenca`, `/licenciada/preview`
- Arquitetura: SPA client-side com Edge Functions no Supabase

### 2. Pagina de Autenticacao (`/auth`)
- Formulario login/cadastro com toggle
- Campos: email, senha
- Redireciona para `/admin` apos login
- Botoes: "Entrar", "Criar conta", link toggle "Nao tem conta?"/"Ja tem conta?"

### 3. Painel Admin (`/admin`) -- 5 abas principais
Documentar cada aba com TODOS os botoes e funcionalidades:

**Aba Dashboard:**
- 4 cards KPI (Visualizacoes, Pagina Cliente, Pagina Licenciado, Cliques)
- 3 cards Clientes (Total, kW Consumo, Taxa Conversao)
- Filtro por licenciado (Select)
- Botao "Sincronizar iGreen" (abre dialog de credenciais se nao configurado)
- Grafico: Cliques por Botao (separado por pagina cliente/licenciada)
- Grafico: Top Licenciados por Cadastros (bar horizontal)
- Grafico: Status dos Clientes (donut + badges)
- Grafico: Novos Clientes por Semana (area chart)
- Grafico: Visualizacoes 30 dias (area chart com 2 linhas)
- Grafico: Horarios de Pico (bar)
- Grafico: Dispositivos (barras de progresso)
- Grafico: Origem do Trafego (pie donut)
- Grafico: Comparativo diario (bar agrupado)

**Aba Preview:**
- 2 botoes: abrir Pagina Cliente / Pagina Licenciado em nova aba
- iframe com preview da landing page

**Aba WhatsApp** (sub-abas documentadas abaixo na secao 4)

**Aba Links:**
- 2 LinkCards principais (Landing Cliente, Landing Licenciado) com botao Copiar
- Links de Rastreamento UTM para cada rede social (WhatsApp, Instagram, Facebook, YouTube, TikTok, Google) x 2 paginas
- Cada link tem botao QR Code e botao Copiar
- Modal QR Code com botoes "Copiar link" e "Baixar PNG"

**Aba Dados:**
- Upload de foto do consultor
- Campos: Nome (gera slug automaticamente), Licenca (readonly), WhatsApp, ID iGreen
- Links de cadastro (readonly, gerados do ID iGreen)
- Pixels: Facebook Pixel ID, Google Analytics ID
- Credenciais Portal iGreen (email/senha com toggle visibilidade)
- Botao "Salvar dados"

### 4. Modulo WhatsApp -- 6 sub-abas
Documentar TODOS os componentes e botoes:

**Sub-aba Conversas:**
- Barra de status (conectado/desconectado) com botao Conectar/Desconectar
- Se desconectado: ConnectionPanel com QR Code, timer, logs diagnosticos, botoes Conectar/Reconectar/Desconectar
- Se conectado: ChatSidebar (300px) + ChatView
  - ChatSidebar: busca, lista de chats com avatar, nome, ultima msg
  - ChatView header: avatar, nome, telefone, botao "Adicionar Cliente" / badge "Cliente", seletor CRM (select de stages)
  - ChatView mensagens: bolhas com suporte a texto, imagem, audio, video, documento, sticker
  - MessageComposer: textarea ("/" para respostas rapidas), botao Quick Reply, botao Anexar (📎), botao Gravar audio (🎙), botao Enviar, preview de arquivo anexado, preview de imagem pendente, barra de progresso upload

**Sub-aba CRM (Kanban):**
- Header com badge "Auto-progressao ativa"
- Botao "Configurar Colunas" (abre dialog)
  - Dialog: lista de stages com editar label/cor, toggle auto-mensagem, config auto-mensagem (StageAutoMessageConfig), excluir, adicionar nova coluna
  - StageAutoMessageConfig: tipo (texto/imagem/video/audio), upload de midia, upload de imagem opcional, textarea com formatacao (negrito/italico), preview, botoes Remover/Cancelar/Salvar
- Colunas Kanban com cards arrastáveis (drag & drop)
- Cards mostram: telefone, data aprovacao, notas
- Default stages: Novo Lead, Aprovado, Reprovado, 30/60/90/120 DIAS

**Sub-aba Envio em Massa:**
- Checkbox "Selecionar Todos" + contador
- Lista de clientes com checkboxes
- Select de template
- Textarea para mensagem (suporta variaveis {{nome}}, {{valor_conta}})
- Intervalo de 20s entre envios (protecao anti-bloqueio com countdown visual)
- Suporta templates com audio + imagem + texto
- Botao "Enviar para X clientes"
- Barra de progresso + resultado final

**Sub-aba Templates:**
- Lista de templates existentes com preview e botao excluir
- Formulario de criacao: nome, tipo (texto/imagem/audio/documento), upload de midia, gravacao de audio, upload de imagem opcional, textarea de conteudo
- Preview dialog

**Sub-aba Agendamentos:**
- Stats: pendentes, enviados, falhas
- Formulario: telefone, mensagem, data/hora
- Lista de agendamentos com status, botao excluir (apenas pendentes)

**Sub-aba Clientes (CustomerManager):**
- Busca por nome/telefone
- Filtros por status (badges com contagem)
- Botao "Sincronizar iGreen"
- Botao importar Excel
- Botao adicionar cliente manual
- Lista expansivel de clientes com: avatar, nome, telefone, CPF, status badge
- Acoes por cliente: abrir WhatsApp (com mensagem sugerida), copiar telefone, editar, excluir
- Dialog editar/adicionar cliente com campos completos + busca CEP
- Dialog preview importacao Excel

### 5. Landing Pages
- ConsultantPage (`/:licenca`): pagina de captacao de clientes
- LicenciadaPage (`/licenciada/:licenca`): pagina de captacao de licenciados
- Componentes compartilhados: HeroSection, AboutSection, TestimonialsSection, etc.
- Tracking: page_views e page_events via hooks useTrackView/useTrackEvent
- PixelInjector para Facebook/Google pixels
- WhatsAppFloat: botao flutuante de WhatsApp

### 6. Hooks Customizados
Documentar cada hook com parametros, retorno e comportamento:
- useWhatsApp, useTemplates (com applyTemplate), useChats, useMessages
- useConsultant, useAnalytics, useTrackView, useTrackEvent
- useIsMobile, useToast

### 7. Servicos
- evolutionApi.ts: todas as 15+ funcoes (request, createInstance, connectInstance, getConnectionState, deleteInstance, logoutInstance, fetchInstances, findChats, findMessages, findContacts, getBase64FromMediaMessage, sendTextMessage, sendMedia, sendAudio, sendDocument, markAsRead, getProfilePicture)
- minioUpload.ts: uploadMedia, formatFileSize

### 8. Edge Functions
- evolution-proxy: proxy autenticado para Evolution API com retry e timeout
- sync-igreen-customers: sincronizacao com portal iGreen
- upload-media: upload para MinIO
- crm-auto-progress: progressao automatica de deals 30→60→90→120 dias

### 9. Banco de Dados (12 tabelas)
Cada tabela com: colunas, tipos, RLS policies, relacionamentos
- consultants, customers, conversations, crm_deals, customer_tags
- kanban_stages, message_templates, page_views, page_events
- scheduled_messages, settings, whatsapp_instances

### 10. Variaveis de Ambiente

### 11. Fluxos Criticos
- Fluxo de conexao WhatsApp
- Fluxo de envio de mensagem (texto, audio, midia, template com audio+imagem+texto)
- Fluxo de envio em massa
- Fluxo CRM auto-progressao
- Fluxo de sincronizacao iGreen

## Implementacao

Um unico arquivo `DOCUMENTATION.md` sera reescrito na raiz do projeto com toda a documentacao acima, organizada com headings Markdown claros e formatacao consistente.

