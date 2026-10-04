"""Guardar dibujo de reporte: sin so_reportes.bloqueado y resiliente a perimetro_geojson ausente."""
from unittest.mock import MagicMock

import main as m
import pytest
from fastapi import HTTPException
from sicoe_registros_schema import so_reportes_clear_omit_cache


def _fc_punto():
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-74.05, 4.72]},
                "properties": {"dibujo_tipo": "nodo", "node_num": 1},
            }
        ],
    }


@pytest.fixture(autouse=True)
def _clear_reportes_omit():
    so_reportes_clear_omit_cache()
    yield
    so_reportes_clear_omit_cache()


def test_guardar_dibujo_no_selecciona_bloqueado(monkeypatch):
    selects = []
    updates = []

    class _Q:
        def select(self, cols):
            selects.append(cols)
            return self

        def update(self, data):
            updates.append(dict(data))
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            if selects and len(updates) == 0:
                return MagicMock(data=[{"id": 66, "estado": "Abierto"}])
            return MagicMock(data=[{"id": 66, **(updates[-1] if updates else {})}])

    monkeypatch.setattr(m, "_sicoe_puede_editar_full_registro", lambda *_a, **_k: True)
    monkeypatch.setattr(m, "_sicoe_uid_from_user", lambda _u: 1)
    monkeypatch.setattr(m, "_sicoe_propagar_dibujo_a_registros", lambda *_a, **_k: 3)
    monkeypatch.setattr(m, "registrar_log", lambda *_a, **_k: None)
    monkeypatch.setattr(m, "_audit_user_contrato", lambda u, _c: u)
    monkeypatch.setattr(m, "supabase", MagicMock(table=lambda _n: _Q()))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    body = m.ReporteDibujoBody(dibujo_geojson=_fc_punto(), dibujo_escena={"objects": []})
    out = m.sicoe_guardar_dibujo_reporte(2, 66, body, {"sub": 1, "id": 1})

    assert selects, "debe consultar so_reportes"
    assert "bloqueado" not in selects[0]
    assert out["ok"] is True
    assert out["reporte"]["tiene_dibujo"] is True
    assert out["registros_actualizados"] == 3
    assert updates and "dibujo_geojson" in updates[-1]


def test_guardar_dibujo_omite_perimetro_si_no_existe(monkeypatch):
    updates = []

    class _Q:
        def select(self, *_a, **_k):
            return self

        def update(self, data):
            updates.append(dict(data))
            if "perimetro_geojson" in data:
                raise Exception(
                    "{'message': \"Could not find the 'perimetro_geojson' column of "
                    "'so_reportes' in the schema cache\", 'code': 'PGRST204'}"
                )
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            if not updates:
                return MagicMock(data=[{"id": 66, "estado": "Abierto"}])
            return MagicMock(data=[{"id": 66, **updates[-1]}])

    monkeypatch.setattr(m, "_sicoe_puede_editar_full_registro", lambda *_a, **_k: True)
    monkeypatch.setattr(m, "_sicoe_uid_from_user", lambda _u: 1)
    monkeypatch.setattr(m, "_sicoe_propagar_dibujo_a_registros", lambda *_a, **_k: 1)
    monkeypatch.setattr(m, "registrar_log", lambda *_a, **_k: None)
    monkeypatch.setattr(m, "_audit_user_contrato", lambda u, _c: u)
    monkeypatch.setattr(m, "supabase", MagicMock(table=lambda _n: _Q()))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    body = m.ReporteDibujoBody(dibujo_geojson=_fc_punto())
    out = m.sicoe_guardar_dibujo_reporte(2, 66, body, {"sub": 1, "id": 1})

    assert out["ok"] is True
    assert any("perimetro_geojson" in u for u in updates)
    assert "perimetro_geojson" not in updates[-1]
    assert "dibujo_geojson" in updates[-1]


def test_guardar_dibujo_404_si_no_existe(monkeypatch):
    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.limit.return_value = q
    q.execute.return_value = MagicMock(data=[])
    monkeypatch.setattr(m, "_sicoe_puede_editar_full_registro", lambda *_a, **_k: True)
    monkeypatch.setattr(m, "supabase", MagicMock(table=MagicMock(return_value=q)))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    body = m.ReporteDibujoBody(dibujo_geojson=_fc_punto())
    with pytest.raises(HTTPException) as ex:
        m.sicoe_guardar_dibujo_reporte(2, 99, body, {"sub": 1})
    assert ex.value.status_code == 404
    assert "bloqueado" not in str(q.select.call_args)
