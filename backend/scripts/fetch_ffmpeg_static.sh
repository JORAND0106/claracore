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

# Build estático oficial de johnvansickle (amd64). Alternativa: BtbN/FFmpeg-Builds.
URL="${FFMPEG_STATIC_URL:-https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz}"
echo "Descargando ffmpeg estático desde $URL ..."
curl -fsSL --retry 3 --retry-delay 2 -o "$TMP/ffmpeg.tar.xz" "$URL"
tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP"
SRC_DIR="$(find "$TMP" -maxdepth 1 -type d -name 'ffmpeg-*-amd64-static' | head -1)"
if [[ -z "$SRC_DIR" ]]; then
  echo "No se encontró el directorio del tarball de ffmpeg" >&2
  ls -la "$TMP" >&2
  exit 1
fi

cp "$SRC_DIR/ffmpeg" "$DEST/ffmpeg"
cp "$SRC_DIR/ffprobe" "$DEST/ffprobe"
chmod +x "$DEST/ffmpeg" "$DEST/ffprobe"
# Evita que Oryx/git traten de versionar binarios enormes si alguien corre esto local.
touch "$DEST/.gitignore"
if ! grep -qx 'ffmpeg' "$DEST/.gitignore" 2>/dev/null; then
  printf '%s\n' 'ffmpeg' 'ffprobe' 'ffplay' '*.tar.xz' >> "$DEST/.gitignore"
fi

echo "OK: $DEST/ffmpeg"
"$DEST/ffmpeg" -version | head -1
"$DEST/ffprobe" -version | head -1
