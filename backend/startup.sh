#!/bin/bash
# Arranque recomendado en Azure App Service (Linux): varios workers evitan 503/502
# cuando hay muchas peticiones concurrentes (dashboard, notificaciones, etc.).
#
# === NO PONGAS "pip install" EN EL STARTUP ===
# Si el comando es: pip install ... && uvicorn ...
# en CADA reinicio Azure descarga e instala dependencias (minutos de CPU/red),
# provoca 502/5xx y picos de "Data In". Instala dependencias en el DEPLOY, no al arrancar.
#
# Azure Portal → Configuration → General settings:
#   Startup Command:  bash startup.sh   (o bash backend/startup.sh según publicación)
#   Health check path: /healthz
#   Always On: On
#
# Application settings (opcional): WEB_CONCURRENCY=3 en B2/B3.
set -e
PORT="${PORT:-8000}"
WORKERS="${WEB_CONCURRENCY:-1}"
exec gunicorn main:app \
  --workers "${WORKERS}" \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:${PORT}" \
  --timeout 300 \
  --graceful-timeout 60 \
  --access-logfile - \
  --error-logfile -
