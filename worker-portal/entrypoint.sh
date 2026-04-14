#!/bin/bash
set -e

echo "[entrypoint] Verificando instalação do Playwright..."
npx playwright install --with-deps chromium || echo "[entrypoint] Playwright já instalado."

echo "[entrypoint] Criando diretórios necessários..."
mkdir -p /app/scripts/tmp /app/scripts/fixtures

echo "[entrypoint] Iniciando portal-worker na porta ${PORT:-3100}..."
exec node server.mjs
