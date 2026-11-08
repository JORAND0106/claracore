"""Modo Retroactivo — reglas de fechas, marca y permisos."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_sql_y_rutas_presentes():
    sql = (ROOT / "sql" / "almacen_modo_retroactivo.sql").read_text(encoding="utf-8")
    assert "almacen_habilitacion_retroactivo" in sql
    assert "es_retroactivo" in sql
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "retroactivo/estado" in routes
    assert "VALIDAR_RETROACTIVO" in routes or "validar_registros_retroactivos" in routes
    mig = (ROOT / "migrations" / "20261108120000_almacen_modo_retroactivo.sql").read_text(encoding="utf-8")
    assert "almacen_habilitacion_retroactivo" in mig


def test_marca_visible_y_leyenda():
    from almacen_retroactivo import leyenda_pdf_retroactivo, marca_retroactivo_visible

    assert marca_retroactivo_visible({"es_retroactivo": True}) is True
    assert marca_retroactivo_visible({
        "es_retroactivo": True,
        "retroactivo_validado_at": "2026-01-01T00:00:00Z",
    }) is False
    assert marca_retroactivo_visible({"es_retroactivo": False}) is False
    ley = leyenda_pdf_retroactivo({
        "es_retroactivo": True,
        "created_at": "2026-11-08T12:00:00+00:00",
        "fecha_aproximada": True,
    })
    assert ley and "Registro retroactivo" in ley
    assert "aproximada" in ley.lower() or "Aproximada" in ley


def test_fecha_hecho_entrada_rechaza_futuro():
    from almacen_retroactivo import assert_fecha_hecho_entrada, parse_fecha_hecho_entrada

    class _Sb:
        def table(self, *_a, **_k):
            raise AssertionError("no DB")

    fut = date.today() + timedelta(days=2)
    with pytest.raises(ValueError, match="futur"):
        assert_fecha_hecho_entrada(_Sb(), 1, fut)
    assert parse_fecha_hecho_entrada("2024-05-01") == date(2024, 5, 1)


def test_salida_antes_de_entrada_rechaza():
    from almacen_retroactivo import assert_salida_coherente_con_entrada

    class _Q:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def lte(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": []})()

    class _Sb:
        def table(self, *_a, **_k):
            return _Q()

    ent = {"fecha_entrada": "2026-06-10"}
    dt = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="anterior a la entrada"):
        assert_salida_coherente_con_entrada(
            _Sb(),
            ent,
            fecha_hora_salida=dt,
            cantidad=1,
            entrada_item_id=1,
            cantidad_recibida=10,
        )


def test_fmt_fecha_hora_entrada_retro():
    from almacen_datetime import fmt_fecha_hora_entrada

    txt = fmt_fecha_hora_entrada(
        "2026-11-08T15:00:00+00:00",
        "2026-05-01",
        es_retroactivo=True,
    )
    assert "01/05/2026" in txt


def test_puede_habilitar_gerencial(monkeypatch):
    import almacen_retroactivo as mod

    monkeypatch.setattr(mod, "rol_excluido_almacen", lambda _u: False)
    monkeypatch.setattr(mod, "es_desarrollador_almacen", lambda _u: False)
    monkeypatch.setattr(mod, "es_contratista_gerencial", lambda _u: True)
    monkeypatch.setattr(mod, "tiene_permiso_almacen", lambda _u, a: a == "validar")
    assert mod.puede_habilitar_modo_retroactivo({}) is True
    monkeypatch.setattr(mod, "es_contratista_gerencial", lambda _u: False)
    assert mod.puede_habilitar_modo_retroactivo({}) is False
