"""
Procesamiento de videos de capacitación del mapa (compresión + música de fondo).

Las pistas en assets/mapa_musica/ son síntesis procedurales propias de ClaraCore
(licencia comercial interna). No se acepta música subida por el usuario.

En Azure App Service (Oryx Python) ffmpeg/ffprobe NO vienen instalados: el deploy
los empaqueta en backend/bin/ y startup.sh puede instalarlos en /home/site/tools.
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
_LOCAL_BIN_DIR = Path(__file__).resolve().parent / "bin"

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


def _candidate_bin_dirs() -> List[Path]:
    env_home = (os.environ.get("FFMPEG_HOME") or "").strip()
    dirs: List[Path] = []
    if env_home:
        dirs.append(Path(env_home))
    dirs.extend([
        _LOCAL_BIN_DIR,
        Path("/home/site/wwwroot/bin"),
        Path("/home/site/tools/ffmpeg"),
    ])
    # Deduplicar conservando orden
    seen = set()
    out: List[Path] = []
    for d in dirs:
        key = str(d)
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out


def resolver_binario(nombre: str) -> Optional[str]:
    """Resuelve ffmpeg/ffprobe desde binarios empaquetados o el PATH del sistema."""
    for d in _candidate_bin_dirs():
        cand = d / nombre
        if cand.is_file() and os.access(cand, os.X_OK):
            return str(cand)
    found = shutil.which(nombre)
    return found


def ffmpeg_disponible() -> bool:
    return bool(resolver_binario("ffmpeg") and resolver_binario("ffprobe"))


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


def mensaje_error_procesamiento(exc: BaseException) -> str:
    """Traduce excepciones técnicas a un motivo concreto para el Desarrollador."""
    raw = str(exc or "").strip()
    low = raw.lower()
    if isinstance(exc, subprocess.TimeoutExpired) or "timed out" in low or "timeout" in low:
        return (
            "El procesamiento tardó demasiado en el servidor. "
            "Pruebe con un video más corto o vuelva a intentar en unos minutos."
        )
    if "no space left" in low or "enospc" in low:
        return (
            "El servidor se quedó sin espacio temporal al procesar el video. "
            "Intente de nuevo en unos minutos o con un archivo más corto."
        )
    if "ffmpeg/ffprobe no están disponibles" in raw or (
        ("ffmpeg" in low or "ffprobe" in low) and ("no encontr" in low or "not found" in low or "no están" in low)
    ):
        return (
            "El servidor no tiene la herramienta de compresión de video (ffmpeg). "
            "Un administrador debe redesplegar el backend con ffmpeg empaquetado."
        )
    if "pista" in low and ("no está" in low or "no encontrada" in low):
        return raw
    if "supera el máximo" in low or "archivo de video vacío" in low:
        return raw
    if "ffmpeg falló" in low or "ffmpeg" in low:
        # Extraer pista útil del stderr sin volcar todo el log.
        hint = raw
        for marker in (
            "Invalid data found",
            "does not contain any stream",
            "No such file",
            "Permission denied",
            "Conversion failed",
            "Error opening input",
            "Unknown encoder",
            "Cannot find a matching stream",
        ):
            if marker.lower() in low:
                return (
                    f"No se pudo procesar este archivo de video ({marker}). "
                    "Exporte de nuevo a MP4 (H.264) desde Canva o el iPad e intente otra vez."
                )
        # Truncar detalle técnico
        short = hint.replace("\n", " ").strip()
        if len(short) > 280:
            short = short[:277] + "…"
        return f"Falló la compresión o la mezcla de música: {short}"
    if "no generó un video válido" in low:
        return "El procesamiento terminó pero no generó un video válido. Intente con otro archivo MP4."
    if raw:
        short = raw.replace("\n", " ").strip()
        if len(short) > 240:
            short = short[:237] + "…"
        return f"No se pudo procesar el video: {short}"
    return "No se pudo comprimir ni mezclar el video. Intente de nuevo."


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
    ffprobe = resolver_binario("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffmpeg/ffprobe no están disponibles en el servidor.")
    cmd = [
        ffprobe, "-v", "error",
        "-print_format", "json",
        "-show_format", "-show_streams",
        path,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace")[-500:]
        raise RuntimeError(f"No se pudo leer el video con ffprobe: {err or 'archivo ilegible'}")
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

    ffmpeg = resolver_binario("ffmpeg")
    ffprobe = resolver_binario("ffprobe")
    if not ffmpeg or not ffprobe:
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

        # Duración del video para acotar la música (evita buffers infinitos con -stream_loop).
        dur = 0.0
        try:
            dur = duracion_segundos(str(src))
        except Exception as exc:
            _log.warning("ffprobe duración: %s", exc)
        if dur <= 0:
            dur = 1.0
        # Margen mínimo para fade-out / contenedor.
        dur_out = max(dur, 0.5)

        # Compresión orientada a grabaciones de pantalla: límite de ancho + CRF
        # que preserva texto; fps acotado; yuv420p + AAC para Safari.
        video_filters = (
            "scale=w='min(1280,iw)':h=-2:flags=lanczos,"
            "fps=20"
        )

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

        # -stream_loop -1 cicla la pista; -t limita la salida a la duración del video
        # (más fiable que solo -shortest con filter_complex + loop infinito).
        cmd = [
            ffmpeg, "-y",
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
            "-t", f"{dur_out:.3f}",
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
