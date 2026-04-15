

# Redesign Premium 2026 — Tema Claro/Escuro + UI Completa

## Problemas Identificados

1. **Posições erradas na Rede**: O `buildTree` coloca nós sem `sponsor_id` correspondente como raízes separadas (Mario/Wanderley aparecem soltos ao invés de sob seus patrocinadores)
2. **Apenas tema escuro**: CSS hardcoded com HSL escuros, sem variantes light
3. **Páginas simples demais**: Cards básicos, sem glassmorphism, sem animações premium, sem hierarquia visual sofisticada
4. **Sem toggle de tema**: Usuário não pode escolher claro/escuro

## Plano de Implementação

### Fase 1 — Sistema de Temas (Claro/Escuro)

**Arquivo: `src/index.css`**
- Adicionar bloco `.light` (ou `:root` sem classe `dark`) com paleta clara completa:
  - Background branco/cinza claro, cards brancos, bordas sutis, texto escuro
  - Manter as mesmas variáveis CSS (`--background`, `--card`, `--border`, etc.)
- Mover o tema escuro atual para dentro de `.dark`
- Adicionar variáveis novas: `--glass`, `--glass-border`, `--glow-primary`, `--surface-elevated`

**Arquivo: `src/contexts/ThemeContext.tsx`** (novo)
- Context com `theme: 'light' | 'dark' | 'system'`
- Persiste no `localStorage`
- Aplica classe `dark` no `<html>`

**Arquivo: `src/App.tsx`**
- Envolver com `ThemeProvider`

**Arquivo: `src/pages/Admin.tsx`**
- Adicionar toggle de tema no header (sol/lua)

### Fase 2 — Correção do Mapa de Rede

**Arquivo: `src/components/admin/NetworkPanel.tsx`**
- Corrigir `buildTree`: nós sem `sponsor_id` no mapa mas com nível > 0 devem ser agrupados sob o root ou posicionados corretamente
- Garantir que membros como Mario e Wanderley apareçam sob seu patrocinador real (verificar se `sponsor_id` bate com `igreen_id` do pai)

### Fase 3 — Design Premium 2026 para Todas as Páginas

Cada componente receberá:
- Glassmorphism com `backdrop-blur` + bordas translúcidas
- Gradientes sutis e glows
- Animações de entrada (`animate-fade-in-up`)
- Sombras em camadas
- Tipografia com hierarquia clara
- Responsivo mobile-first

**Componentes a redesenhar:**

1. **`StatCard.tsx`** — Cards com glow sutil, ícone com gradiente, micro-animação no hover
2. **`DashboardTab.tsx`** — Layout com grid premium, header com métricas destacadas, charts com estilo atualizado
3. **`AnalyticsCharts.tsx`** — Tooltip/grid adaptáveis ao tema, cores que funcionam claro/escuro
4. **`CustomerCharts.tsx`** — Mesma adaptação de tema
5. **`DadosTab.tsx`** — Formulário premium com sections glassmorphism, inputs estilizados
6. **`LinksTab.tsx` + `LinkCard.tsx`** — Cards interativos com hover effects premium
7. **`PreviewTab.tsx`** — Browser mockup mais realista
8. **`NotificationCenter.tsx`** — Dropdown glassmorphism com animação
9. **`AIChatPanel.tsx`** — Chat com visual premium, bolhas com gradiente
10. **`Auth.tsx`** — Tela de login premium com fundo animado, card glassmorphism centralizado
11. **`SuperAdmin.tsx`** — Tabela premium com hover states, cards de métricas
12. **`WhatsAppDashboard.tsx`** — KPI cards premium
13. **`KanbanBoard.tsx`** — Colunas com glassmorphism, cards com sombra
14. **`CustomerManager.tsx`** — Lista premium com avatares, filtros estilizados
15. **Header do Admin** — Glassmorphism premium com blur forte, toggle de tema

### Fase 4 — Componentes Compartilhados

**`src/components/ui/GlassCard.tsx`** (novo) — Componente reutilizável glassmorphism
**`src/components/ui/GradientIcon.tsx`** (novo) — Wrapper de ícone com gradiente

### Detalhes Técnicos

- O sistema de temas usa `darkMode: ["class"]` que ja existe no `tailwind.config.ts`
- Todas as cores via variáveis CSS HSL — trocar valores no bloco `.dark` vs default
- Charts (Recharts) precisam ler cores do tema via CSS custom properties
- Gradientes hardcoded (`hsl(120, 8%, 8%)`) em components CSS serão substituídos por `var(--card)` etc.
- Privacy mode continua funcionando com blur
- Nenhuma lógica de negócio será alterada — apenas visual

### Ordem de Execução

1. ThemeContext + variáveis CSS light/dark
2. Header com toggle de tema
3. Auth page premium
4. StatCard + DashboardTab
5. NetworkPanel (fix posições + tema)
6. Demais tabs do Admin
7. SuperAdmin
8. WhatsApp components

Total estimado: ~15 arquivos modificados, 3 novos.

