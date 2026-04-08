

# Sistema de Envio em Massa por Blocos

## O Que Sera Construido

Um novo componente **BulkBlockSendPanel** que substitui o BulkSendPanel atual, com:

### 1. Importacao de Contatos (3 modos)
- **Base existente**: usar os clientes ja cadastrados (como hoje, com filtros)
- **Colar numeros**: textarea onde o usuario cola linhas no formato `nome;telefone` (ou `telefone;nome`)
- **Importar CSV/Excel**: upload de planilha com colunas `nome` e `telefone`, com modelo para download

### 2. Selecao/Criacao de Template
- Dropdown para selecionar template existente (como hoje)
- Botao "Criar template rapido" inline — abre mini-form com nome, tipo de midia, upload e conteudo
- Preview da mensagem estilo WhatsApp com variaveis resolvidas

### 3. Configuracao de Blocos
- Selector de tamanho do bloco: **10, 20, 30, 40, 50** contatos por bloco
- Intervalo entre blocos: **5min, 10min, 15min, 30min, 1h** (selecionavel)
- Visualizacao: "X blocos de Y contatos — tempo total estimado: ~Z"
- Dentro de cada bloco, mantem o intervalo anti-spam existente (18-35s entre mensagens)

### 4. Execucao e Acompanhamento
- Progresso visual por bloco (Bloco 1/5, Bloco 2/5...)
- Countdown entre blocos com timer grande
- Pausa/Cancelamento a qualquer momento
- Resumo final com enviados/falhos por bloco

---

## Arquitetura Tecnica

### Arquivos a criar
- `src/components/whatsapp/BulkBlockSendPanel.tsx` — componente principal
- `src/components/whatsapp/ContactImporter.tsx` — sub-componente para os 3 modos de importacao
- `src/components/whatsapp/BlockConfigurator.tsx` — configuracao de blocos e intervalos
- `src/components/whatsapp/QuickTemplateForm.tsx` — criacao rapida de template inline

### Arquivos a modificar
- `src/components/whatsapp/WhatsAppTab.tsx` — trocar BulkSendPanel por BulkBlockSendPanel
- `src/types/whatsapp.ts` — adicionar tipos para BulkContact e BlockConfig

### Fluxo
```text
[Importar Contatos] → [Selecionar/Criar Template] → [Configurar Blocos] → [Enviar]
     ↓                        ↓                           ↓
  Colar / CSV /          Template existente         10/20/30/40/50
  Base clientes          ou criar rapido            + intervalo 5-60min
```

### Logica de envio por blocos
- Divide a lista selecionada em chunks do tamanho configurado
- Dentro de cada bloco: usa o `getRandomInterval` existente (18-35s + progressivo)
- Entre blocos: pausa longa configuravel (5-60min)
- Estado cancelavel via `useRef<boolean>` para abort

### Modelo de importacao (download)
Gera um XLSX com headers: `nome | telefone` e 2 linhas de exemplo

