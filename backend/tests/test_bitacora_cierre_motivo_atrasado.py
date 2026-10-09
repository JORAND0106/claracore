"""CHECK cierre_motivo debe admitir automatico_atrasado; autocierre no tumba el Libro."""
from __future__ import annotations

from unittest.mock import MagicMock

import bitacora_service as svc


def test_cierre_motivos_incluye_automatico_atrasado():
    assert "automatico_atrasado" in svc.CIERRE_MOTIVOS_VALIDOS
    assert "automatico_dia" in svc.CIERRE_MOTIVOS_VALIDOS
    assert "manual" in svc.CIERRE_MOTIVOS_VALIDOS
    assert "creacion_evento" in svc.CIERRE_MOTIVOS_VALIDOS


def test_is_cierre_motivo_check_violation():
    exc = Exception(
        'new row for relation "seguimiento_bitacora_entrada" violates check '
        'constraint "seguimiento_bitacora_entrada_cierre_motivo_check" (code 23514)'
    )
    assert svc._is_cierre_motivo_check_violation(exc) is True
    assert svc._is_cierre_motivo_check_violation(Exception("otra cosa")) is False


def test_asegurar_autocierre_atrasado_reintenta_tras_check(monkeypatch):
    entrada = {
        "id": 42,
        "tipo": "diario",
        "estado": "abierto",
        "fecha": "2026-10-05",
        "created_at": "2026-10-08T15:00:00+00:00",
    }
    monkeypatch.setattr(svc, "_debe_autocerrar", lambda *_a, **_k: True)
    monkeypatch.setattr(svc, "es_reporte_atrasado", lambda *_a, **_k: True)

    calls = []

    def fake_aplicar(_sb, eid, uid, motivo):
        calls.append(motivo)
        if motivo == "automatico_atrasado" and len([m for m in calls if m == "automatico_atrasado"]) == 1:
            raise Exception(
                'violates check constraint "seguimiento_bitacora_entrada_cierre_motivo_check" (23514)'
            )
        return {"estado": "cerrado", "cierre_motivo": motivo}

    monkeypatch.setattr(svc, "_aplicar_cierre", fake_aplicar)
    monkeypatch.setattr(svc, "_ensure_cierre_motivo_constraint", lambda _sb: True)

    out = svc.asegurar_autocierre_entrada(MagicMock(), entrada)
    assert out["estado"] == "cerrado"
    assert out["cierre_motivo"] == "automatico_atrasado"
    assert calls == ["automatico_atrasado", "automatico_atrasado"]


def test_asegurar_autocierre_atrasado_degrada_a_dia_si_check_persiste(monkeypatch):
    entrada = {
        "id": 42,
        "tipo": "diario",
        "estado": "abierto",
        "fecha": "2026-10-05",
    }
    monkeypatch.setattr(svc, "_debe_autocerrar", lambda *_a, **_k: True)
    monkeypatch.setattr(svc, "es_reporte_atrasado", lambda *_a, **_k: True)

    calls = []

    def fake_aplicar(_sb, eid, uid, motivo):
        calls.append(motivo)
        if motivo == "automatico_atrasado":
            raise Exception(
                'violates check constraint "seguimiento_bitacora_entrada_cierre_motivo_check" (23514)'
            )
        return {"estado": "cerrado", "cierre_motivo": motivo}

    monkeypatch.setattr(svc, "_aplicar_cierre", fake_aplicar)
    monkeypatch.setattr(svc, "_ensure_cierre_motivo_constraint", lambda _sb: False)

    out = svc.asegurar_autocierre_entrada(MagicMock(), entrada)
    assert out["estado"] == "cerrado"
    assert out["cierre_motivo"] == "automatico_dia"
    assert calls == ["automatico_atrasado", "automatico_atrasado", "automatico_dia"]


def test_migration_file_lists_automatico_atrasado():
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "migrations" / (
        "20261009010000_bitacora_cierre_motivo_automatico_atrasado.sql"
    )
    text = path.read_text(encoding="utf-8")
    assert "automatico_atrasado" in text
    assert "seguimiento_bitacora_entrada_cierre_motivo_check" in text
