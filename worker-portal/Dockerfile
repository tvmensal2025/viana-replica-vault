FROM node:20-slim

# Instalar Chromium do sistema + xvfb + dependências
RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    fonts-liberation \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package.json
COPY package.json ./

# Pular download do Chromium pelo Playwright (usaremos o do sistema)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Instalar dependências
RUN npm install --omit=dev --no-package-lock

# Copiar código
COPY . .

# Expor porta
EXPOSE 3100

# Variáveis de ambiente
ENV HEADLESS=1
ENV PORT=3100
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3100/health || exit 1

# Comando de inicialização com xvfb
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1280x900x24", "node", "server.mjs"]
