#!/usr/bin/env bash
# Descarga binarios estáticos de ffmpeg/ffprobe para Azure App Service (Linux amd64).
# Uso: bash scripts/fetch_ffmpeg_static.sh
# Destino por defecto: backend/bin/ (relativo a este script).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${FFMPEG_DEST_DIR:-$ROOT/bin}"
mkdir -p "$DEST"

if [[ -x "$DEST/ffmpeg" && -x "$DEST/ffprobe" ]]; then
  echo "ffmpeg ya presente en $DEST"
  "$DEST/ffmpeg" -version | head -1
  exit 0
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# johnvansickle.com agota el tiempo desde GitHub Actions y aborta todo el deploy
# (el API queda en la versión anterior). Primero el release de BtbN en GitHub.
if [[ -n "${FFMPEG_STATIC_URL:-}" ]]; then
  URLS=("$FFMPEG_STATIC_URL")
else
  URLS=(
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
    "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
  )
fi

downloaded=0
for URL in "${URLS[@]}"; do
  echo "Descargando ffmpeg estático desde $URL ..."
  if curl -fL --connect-timeout 20 --max-time 180 --retry 2 --retry-delay 3 -o "$TMP/ffmpeg.tar.xz" "$URL"; then
    downloaded=1
    break
  fi
  echo "No se pudo descargar $URL" >&2
  rm -f "$TMP/ffmpeg.tar.xz"
done
if [[ "$downloaded" -ne 1 ]]; then
  echo "No se pudo descargar ffmpeg desde ninguna fuente" >&2
  exit 1
fi

tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP"
FFMPEG_BIN="$(find "$TMP" -type f -name ffmpeg | head -1)"
FFPROBE_BIN="$(find "$TMP" -type f -name ffprobe | head -1)"
if [[ -z "$FFMPEG_BIN" || -z "$FFPROBE_BIN" ]]; then
  echo "El tarball no trae ffmpeg y ffprobe" >&2
  find "$TMP" -maxdepth 3 -type f | head -40 >&2
  exit 1
fi

cp "$FFMPEG_BIN" "$DEST/ffmpeg"
cp "$FFPROBE_BIN" "$DEST/ffprobe"
chmod +x "$DEST/ffmpeg" "$DEST/ffprobe"
# Evita que Oryx/git traten de versionar binarios enormes si alguien corre esto local.
touch "$DEST/.gitignore"
if ! grep -qx 'ffmpeg' "$DEST/.gitignore" 2>/dev/null; then
  printf '%s\n' 'ffmpeg' 'ffprobe' 'ffplay' '*.tar.xz' >> "$DEST/.gitignore"
fi

echo "OK: $DEST/ffmpeg"
"$DEST/ffmpeg" -version | head -1
"$DEST/ffprobe" -version | head -1
