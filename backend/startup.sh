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

# ffmpeg/ffprobe: necesarios para comprimir y mezclar videos del mapa de capacitaciones.
# Azure App Service (Oryx Python) no los incluye. Preferir binarios empaquetados en
# el deploy (wwwroot/bin); si faltan, instalar una vez en /home/site/tools (persistente).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WWWROOT_BIN="${SCRIPT_DIR}/bin"
TOOLS_FFMPEG="${FFMPEG_HOME:-/home/site/tools/ffmpeg}"
if [[ -x "${WWWROOT_BIN}/ffmpeg" && -x "${WWWROOT_BIN}/ffprobe" ]]; then
  export PATH="${WWWROOT_BIN}:$PATH"
elif [[ -x "${TOOLS_FFMPEG}/ffmpeg" && -x "${TOOLS_FFMPEG}/ffprobe" ]]; then
  export PATH="${TOOLS_FFMPEG}:$PATH"
elif [[ -x /usr/bin/ffmpeg && -x /usr/bin/ffprobe ]]; then
  :
else
  echo "startup: ffmpeg no encontrado; intentando descarga estática en ${TOOLS_FFMPEG}"
  mkdir -p "${TOOLS_FFMPEG}"
  if FFMPEG_DEST_DIR="${TOOLS_FFMPEG}" bash "${SCRIPT_DIR}/scripts/fetch_ffmpeg_static.sh"; then
    export PATH="${TOOLS_FFMPEG}:$PATH"
  else
    echo "startup: ADVERTENCIA — no se pudo instalar ffmpeg; la carga de videos del mapa fallará" >&2
  fi
fi

exec gunicorn main:app \
  --workers "${WORKERS}" \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:${PORT}" \
  --timeout 300 \
  --graceful-timeout 60 \
  --access-logfile - \
  --error-logfile -
