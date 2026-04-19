# Dockerfile para Worker VPS - Portal iGreen
# VERSÃO 11.2 - 2026-04-18 (BULLETPROOF: telefone NUNCA falha — re-lookup + page.keyboard + 5 retries)

FROM node:20-bookworm-slim

LABEL version="v11.3-2026.04.18"
LABEL changelog="fallback-email-tvmensal11,fallback-phone-11971254913,waitForSelector-email-phone,confirmacao-aguarda-campo"

# Instalar dependências do sistema para Playwright + VNC + noVNC
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 curl \
    xvfb x11vnc novnc websockify \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Criar estrutura de diretórios
WORKDIR /app
RUN mkdir -p /tmp screenshots fixtures

# Copiar package.json e instalar dependências
COPY package.json ./
RUN npm install

# Instalar Playwright e Chromium
RUN npx playwright install chromium

# Copiar código
COPY server.mjs ./
COPY playwright-automation.mjs ./
COPY phase-logger.mjs ./
COPY start.sh ./
RUN chmod +x start.sh

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3100
ENV HEADLESS=1
ENV DISPLAY=:99
ENV WORKER_VERSION=v11.0-2026.04.18
ENV FALLBACK_EMAIL=tvmensal11@gmail.com
ENV FALLBACK_PHONE=11971254913

# Expor portas: 3100 (API) + 6080 (noVNC web)
EXPOSE 3100 6080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

# Iniciar via script (Xvfb + x11vnc + noVNC + Node)
CMD ["./start.sh"]
