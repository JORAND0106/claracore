"""Tests del procesador de videos de capacitación (sin Azure)."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from mapa_capacitacion_video import (
    ACCEPT_EXTENSIONS,
    clamp_volumen,
    extension_permitida,
    listar_pistas_aprobadas,
    procesar_video_con_musica,
    resolver_pista,
)


def _hacer_video_sin_audio(path: Path, segundos: float = 2.0) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"color=c=blue:s=640x360:d={segundos}",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        str(path),
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)


def test_listar_pistas_aprobadas_disponibles():
    pistas = listar_pistas_aprobadas()
    assert len(pistas) >= 4
    assert all(p["disponible"] for p in pistas)
    ids = {p["id"] for p in pistas}
    assert "aurora" in ids
    assert "brisa" in ids


def test_resolver_pista_y_volumen():
    meta, path = resolver_pista("calma")
    assert meta["id"] == "calma"
    assert path.is_file()
    assert clamp_volumen(0.9) == 0.35
    assert clamp_volumen(-1) == 0.05
    assert 0.17 <= clamp_volumen("0.18") <= 0.19


def test_extension_ipad_y_mov():
    assert extension_permitida("clip.MOV", "video/quicktime") == ".mov"
    assert extension_permitida("x.mp4", "video/mp4") == ".mp4"
    assert extension_permitida("cap.m4v", "") == ".m4v"
    assert ".mov" in ACCEPT_EXTENSIONS


def test_procesar_video_mezcla_audio():
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.mp4"
        _hacer_video_sin_audio(src, 2.0)
        out = procesar_video_con_musica(
            src.read_bytes(),
            filename="in.mp4",
            content_type="video/mp4",
            pista_id="aurora",
            volumen=0.2,
        )
        assert len(out) > 2000
        dest = Path(tmp) / "out.mp4"
        dest.write_bytes(out)
        probe = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "a",
                "-show_entries", "stream=codec_type",
                "-of", "csv=p=0",
                str(dest),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        assert b"audio" in probe.stdout
