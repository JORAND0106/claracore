#!/bin/bash
# Arranque recomendado en Azure App Service (Linux): varios workers evitan 503/502
# cuando hay muchas peticiones concurrentes (dashboard, notificaciones, etc.).
#
# En Azure Portal → App Service del API → Configuration → General settings:
#   - Startup Command:  bash startup.sh   (o la ruta real si el código no está en la raíz del sitio)
#   - Health check path: /healthz
#   - Always On: On
#
# Opcional (Application settings): WEB_CONCURRENCY=3 o 4 en planes con más CPU.
set -e
PORT="${PORT:-8000}"
WORKERS="${WEB_CONCURRENCY:-2}"
exec gunicorn main:app \
  --workers "${WORKERS}" \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:${PORT}" \
  --timeout 120 \
  --graceful-timeout 60 \
  --access-logfile - \
  --error-logfile -
