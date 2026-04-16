

# Plano: Autoplay nos Vídeos das Landing Pages

## O que será feito
Adicionar `autoPlay` e `muted` nos vídeos principais das landing pages do **cliente** e do **licenciado** para que comecem automaticamente quando o visitante abre a página.

> **Nota técnica:** Navegadores modernos exigem que vídeos com autoplay sejam `muted` — sem isso o autoplay é bloqueado. O usuário pode ativar o som manualmente clicando no controle de volume.

## Arquivos a modificar

### 1. `src/components/HeroSection.tsx` (Landing page do cliente)
- Linha 120: adicionar `autoPlay muted` no `<video>`

### 2. `src/components/licenciada/LicHeroSection.tsx` (Landing page do licenciado)
- Linha 114: adicionar `autoPlay muted` e mudar `preload="none"` para `preload="auto"` no `<video>`

## Resultado
Ao abrir qualquer landing page, o vídeo principal inicia automaticamente (sem som), com controles visíveis para o visitante ativar o áudio.

