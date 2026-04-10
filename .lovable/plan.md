

## Landing Page de Vendas do CRM iGreen

### Objetivo
Criar uma landing page profissional na rota `/crm` para vender o CRM iGreen, com vídeo no hero e seções explicando cada funcionalidade.

### Estrutura da Página

**1. Hero Section** - Vídeo no topo + headline de vendas
- Badge "CRM iGreen Energy"
- Título: "Gerencie seus clientes, automatize vendas e feche mais negócios"
- Vídeo de apresentação do CRM (placeholder MinIO ou URL a definir)
- CTA "Quero conhecer o CRM" (link WhatsApp)
- Contadores animados (reutilizando o padrão existente)

**2. Seção "Funcionalidades"** - Cards com ícones explicando cada módulo:
- **WhatsApp Integrado**: Envie e receba mensagens direto do CRM, com templates prontos e respostas rápidas
- **Kanban de Vendas**: Pipeline visual com drag-and-drop para acompanhar cada negociação
- **Gestão de Clientes**: Cadastro, importação, histórico completo e segmentação
- **Mensagens Agendadas**: Automatize follow-ups e sequências de mensagens
- **Mensagens em Massa**: Envio em lote com templates personalizados
- **Dashboard de Métricas**: Gráficos de performance, taxa de resposta e conversão

**3. Seção "Como Funciona"** - 3 passos simples (cadastro, conexão WhatsApp, comece a vender)

**4. Seção "Diferenciais"** - Por que escolher o CRM iGreen (integração nativa, sem custo extra, suporte dedicado)

**5. CTA Final** - Repetição do botão de conversão + WhatsApp

### Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/CRMLandingPage.tsx` | Criar - página completa com todas as seções |
| `src/App.tsx` | Adicionar rota `/crm` com lazy loading |

### Estilo
- Reutiliza o design system existente (dark mode, glassmorphism, verde primário, Montserrat/Open Sans)
- Mesmas classes CSS (`section-container`, `badge-green`, `btn-cta-lg`, `animate-pulse-green`)
- Cards translúcidos com borda `border-border` e `bg-card`
- Ícones do Lucide React

### Vídeo
- Usará o mesmo player responsivo do HeroSection existente
- URL do vídeo pode ser atualizada depois (placeholder inicial)

