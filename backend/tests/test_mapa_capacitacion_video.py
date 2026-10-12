"""Tests de utilidades de carga directa de videos del mapa (sin Azure)."""

from __future__ import annotations

from mapa_capacitacion_video import (
    ACCEPT_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_MB,
    content_type_video,
    extension_permitida,
    mensaje_limite_tamano,
)


def test_limite_150_mb():
    assert MAX_UPLOAD_MB == 150
    assert MAX_UPLOAD_BYTES == 150 * 1024 * 1024
    msg = mensaje_limite_tamano()
    assert "150 MB" in msg
    assert "máximo" in msg.lower() or "maximo" in msg.lower() or "permitido" in msg.lower()


def test_extension_ipad_y_mov():
    assert extension_permitida("clip.MOV", "video/quicktime") == ".mov"
    assert extension_permitida("x.mp4", "video/mp4") == ".mp4"
    assert extension_permitida("cap.m4v", "") == ".m4v"
    assert extension_permitida("screen.webm", "video/webm") == ".webm"
    assert ".mov" in ACCEPT_EXTENSIONS


def test_content_type_video():
    assert content_type_video("a.mp4", "video/mp4") == "video/mp4"
    assert content_type_video("a.MOV", "video/quicktime") == "video/quicktime"
    assert content_type_video("a.webm", "") == "video/webm"
    assert content_type_video("a.m4v", "application/octet-stream") == "video/x-m4v"
