"""Guardar dibujo de reporte no debe consultar so_reportes.bloqueado (columna inexistente)."""
from unittest.mock import MagicMock

import main as m
import pytest
from fastapi import HTTPException


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


def test_guardar_dibujo_no_selecciona_bloqueado(monkeypatch):
    selects = []
    mode = {"op": "select"}

    class _Q:
        def select(self, cols):
            selects.append(cols)
            mode["op"] = "select"
            return self

        def update(self, *_a, **_k):
            mode["op"] = "update"
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            cols = selects[-1] if selects else ""
            if "bloqueado" in str(cols):
                raise Exception(
                    "APIError: {'message': 'column so_reportes.bloqueado does not exist', "
                    "'code': '42703'}"
                )
            if mode["op"] == "select":
                return MagicMock(data=[{"id": 66, "estado": "Abierto"}])
            return MagicMock(data=[{"id": 66, "dibujo_geojson": _fc_punto()}])

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
    assert "id" in selects[0]
    assert out["ok"] is True
    assert out["reporte"]["tiene_dibujo"] is True
    assert out["registros_actualizados"] == 3


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
