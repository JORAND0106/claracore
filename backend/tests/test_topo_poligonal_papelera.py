"""Tests de lógica de papelera poligonal (sin Supabase)."""
from datetime import datetime, timedelta, timezone

from topografia_poligonal_papelera import (
    DIAS_PURGA_PAPELERA,
    edad_en_papelera_dias,
    es_activo,
    filtrar_activos,
    filtrar_papelera,
    payload_marcar_baja,
    payload_restaurar,
    umbral_purga,
)


def test_umbral_y_retencion_30_dias():
    u = umbral_purga(30)
    assert (datetime.now(timezone.utc) - u).days >= 29
    assert DIAS_PURGA_PAPELERA == 30


def test_payload_baja_y_restaurar():
    b = payload_marcar_baja()
    assert b["dado_de_baja"] is True
    assert b["dado_de_baja_at"]
    r = payload_restaurar()
    assert r["dado_de_baja"] is False
    assert r["dado_de_baja_at"] is None


def test_filtrar_activos_y_papelera():
    rows = [
        {"id": "1", "dado_de_baja": False},
        {"id": "2", "dado_de_baja": True},
        {"id": "3"},
        None,
    ]
    activos = filtrar_activos(rows)
    assert [r["id"] for r in activos] == ["1", "3"]
    papelera = filtrar_papelera(rows)
    assert [r["id"] for r in papelera] == ["2"]
    assert es_activo({"dado_de_baja": False})
    assert not es_activo({"dado_de_baja": True})


def test_edad_en_papelera():
    ahora = datetime(2026, 8, 26, tzinfo=timezone.utc)
    row = {
        "dado_de_baja_at": (ahora - timedelta(days=10)).isoformat(),
    }
    edad = edad_en_papelera_dias(row, ahora=ahora)
    assert edad is not None
    assert 9.9 <= edad <= 10.1
