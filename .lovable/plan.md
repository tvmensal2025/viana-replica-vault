

## Plano: Gerar Imagem de Marketing para o CRM

### O que será feito
Um script Python que captura screenshots do seu CRM (Kanban, WhatsApp, Clientes, Dashboard) e compõe uma imagem profissional de marketing para divulgação/venda do sistema.

### Etapas

1. **Capturar screenshots** das telas principais do CRM usando a ferramenta de browser (Kanban, Chat WhatsApp, Lista de Clientes, Dashboard)

2. **Criar script Python** que:
   - Monta um canvas grande com fundo gradiente verde (cores da iGreen)
   - Posiciona as screenshots em molduras com sombra estilo macOS
   - Adiciona o logo da iGreen (`/public/images/logo-colorida-igreen.png`)
   - Inclui texto de marketing: título, features principais (CRM, WhatsApp integrado, Kanban, Gestão de Clientes)
   - Exporta como PNG de alta qualidade

3. **Composição visual**:
   - Fundo com gradiente mesh nas cores da marca (verde #22C55E → escuro)
   - 3-4 screenshots dispostos em perspectiva/sobreposição
   - Título grande: "CRM iGreen" ou similar
   - Bullets com ícones: WhatsApp, Kanban, Clientes, Dashboard
   - Rodapé com logo

4. **Saída**: PNG em `/mnt/documents/crm-marketing.png`

### Detalhes técnicos
- Pillow (PIL) para composição de imagens
- Screenshots capturados via browser tool
- Modo privacidade será ativado antes das capturas para proteger dados reais
- Resolução final ~1920x1080 ou 1080x1080 (formato para redes sociais)

