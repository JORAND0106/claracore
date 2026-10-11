"""
Procesamiento de videos de capacitación del mapa (compresión + música de fondo).

Las pistas en assets/mapa_musica/ son síntesis procedurales propias de ClaraCore
(licencia comercial interna). No se acepta música subida por el usuario.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger("claracore.mapa_video")

_ASSETS_DIR = Path(__file__).resolve().parent / "assets" / "mapa_musica"

# Volumen de fondo por defecto (moderado, no distrae).
VOLUMEN_FONDO_DEFAULT = 0.18
VOLUMEN_FONDO_MIN = 0.05
VOLUMEN_FONDO_MAX = 0.35

# Límite de subida cruda (iPad screen recordings pueden ser grandes).
MAX_UPLOAD_BYTES = 220 * 1024 * 1024

ACCEPT_CONTENT_TYPES = frozenset({
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-m4v",
    "application/octet-stream",  # Safari a veces manda esto con .mov
})

ACCEPT_EXTENSIONS = frozenset({".mp4", ".mov", ".m4v", ".webm"})

# Catálogo fijo de pistas aprobadas (ids estables).
MAPA_PISTAS_APROBADAS: List[Dict[str, Any]] = [
    {
        "id": "aurora",
        "nombre": "Aurora suave",
        "archivo": "aurora.mp3",
        "duracion_s": 90,
        "licencia": "Síntesis procedural ClaraCore — uso comercial interno permitido",
    },
    {
        "id": "brisa",
        "nombre": "Brisa clara",
        "archivo": "brisa.mp3",
        "duracion_s": 90,
        "licencia": "Síntesis procedural ClaraCore — uso comercial interno permitido",
    },
    {
        "id": "calma",
        "nombre": "Calma de obra",
        "archivo": "calma.mp3",
        "duracion_s": 90,
        "licencia": "Síntesis procedural ClaraCore — uso comercial interno permitido",
    },
    {
        "id": "horizonte",
        "nombre": "Horizonte",
        "archivo": "horizonte.mp3",
        "duracion_s": 90,
        "licencia": "Síntesis procedural ClaraCore — uso comercial interno permitido",
    },
]


def listar_pistas_aprobadas() -> List[Dict[str, Any]]:
    out = []
    for p in MAPA_PISTAS_APROBADAS:
        path = _ASSETS_DIR / p["archivo"]
        out.append({
            "id": p["id"],
            "nombre": p["nombre"],
            "duracion_s": p["duracion_s"],
            "licencia": p["licencia"],
            "disponible": path.is_file(),
        })
    return out


def resolver_pista(pista_id: str) -> Tuple[Dict[str, Any], Path]:
    pid = (pista_id or "").strip().lower()
    for p in MAPA_PISTAS_APROBADAS:
        if p["id"] == pid:
            path = _ASSETS_DIR / p["archivo"]
            if not path.is_file():
                raise FileNotFoundError(f"Pista '{pid}' no encontrada en assets.")
            return p, path
    raise ValueError(f"Pista '{pista_id}' no está en el catálogo aprobado.")


def clamp_volumen(v: Any) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        x = VOLUMEN_FONDO_DEFAULT
    return max(VOLUMEN_FONDO_MIN, min(VOLUMEN_FONDO_MAX, x))


def _run(cmd: List[str], timeout: int = 600) -> None:
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace")[-2000:]
        raise RuntimeError(f"ffmpeg falló ({proc.returncode}): {err}")


def _ffprobe_json(path: str) -> Dict[str, Any]:
    cmd = [
        "ffprobe", "-v", "error",
        "-print_format", "json",
        "-show_format", "-show_streams",
        path,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        raise RuntimeError("No se pudo leer el video con ffprobe.")
    return json.loads(proc.stdout.decode("utf-8") or "{}")


def video_tiene_audio(path: str) -> bool:
    meta = _ffprobe_json(path)
    for s in meta.get("streams") or []:
        if s.get("codec_type") == "audio":
            return True
    return False


def duracion_segundos(path: str) -> float:
    meta = _ffprobe_json(path)
    try:
        return float((meta.get("format") or {}).get("duration") or 0)
    except (TypeError, ValueError):
        return 0.0


def extension_permitida(filename: str, content_type: Optional[str]) -> str:
    name = (filename or "").lower()
    ext = Path(name).suffix
    if ext in ACCEPT_EXTENSIONS:
        return ext
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct == "video/quicktime":
        return ".mov"
    if ct == "video/webm":
        return ".webm"
    if ct in ("video/mp4", "video/x-m4v"):
        return ".mp4"
    # Safari iPad a menudo envía .mov sin content-type útil
    return ".mp4"


def procesar_video_con_musica(
    video_bytes: bytes,
    *,
    filename: str,
    content_type: Optional[str],
    pista_id: str,
    volumen: Any = VOLUMEN_FONDO_DEFAULT,
) -> bytes:
    """
    Comprime el video (legible para UI/texto) y mezcla la pista aprobada.
    Si el video es más largo que la pista, la música se cicla hasta la duración del video.
    """
    if not video_bytes:
        raise ValueError("Archivo de video vacío.")
    if len(video_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(f"El video supera el máximo de {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")

    _, pista_path = resolver_pista(pista_id)
    vol = clamp_volumen(volumen)
    ext = extension_permitida(filename, content_type)

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("ffmpeg/ffprobe no están disponibles en el servidor.")

    with tempfile.TemporaryDirectory(prefix="mapa_cap_") as tmp:
        tmp_dir = Path(tmp)
        src = tmp_dir / f"in{ext}"
        out = tmp_dir / "out.mp4"
        src.write_bytes(video_bytes)

        has_audio = False
        try:
            has_audio = video_tiene_audio(str(src))
        except Exception as exc:
            _log.warning("ffprobe audio check: %s", exc)

        # Compresión orientada a grabaciones de pantalla: límite de ancho + CRF
        # que preserva texto; fps acotado; yuv420p + AAC para Safari.
        video_filters = (
            "scale='min(1280,iw)':-2:flags=lanczos,"
            "fps=20"
        )

        # -stream_loop -1 cicla la pista si el video es más largo.
        if has_audio:
            filter_complex = (
                f"[0:a]volume=0.05,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[va];"
                f"[1:a]volume={vol:.3f},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[bg];"
                f"[va][bg]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]"
            )
        else:
            filter_complex = (
                f"[1:a]volume={vol:.3f},"
                f"aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,"
                f"afade=t=in:st=0:d=1.2[aout]"
            )

        cmd = [
            "ffmpeg", "-y",
            "-i", str(src),
            "-stream_loop", "-1",
            "-i", str(pista_path),
            "-filter_complex", filter_complex,
            "-map", "0:v:0",
            "-map", "[aout]",
            "-vf", video_filters,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            "-shortest",
            str(out),
        ]
        _run(cmd, timeout=900)

        if not out.is_file() or out.stat().st_size < 1000:
            raise RuntimeError("El procesamiento no generó un video válido.")
        return out.read_bytes()


def blob_path_desde_url_publica(url: str) -> Optional[str]:
    """Extrae el path relativo del blob desde una URL pública de Azure / CDN."""
    u = (url or "").strip()
    if not u:
        return None
    marker = "/ayuda/mapa-videos/"
    idx = u.find(marker)
    if idx >= 0:
        return u[idx + 1:].split("?")[0]
    # fallback: última parte tras el contenedor
    if "mapa-videos/" in u:
        return "ayuda/" + u.split("ayuda/", 1)[-1].split("?")[0]
    return None
