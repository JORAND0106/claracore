"""Mover registros entre actas RPO (herramienta Desarrollador)."""
from unittest.mock import MagicMock

import main as m
import pytest
from fastapi import HTTPException


def test_validar_par_actas_distintas(monkeypatch):
    monkeypatch.setattr(
        m,
        "_sicoe_acta_rpo_meta",
        lambda cid, aid: {"id": aid, "numero_rpo": aid, "tipo_grupo": "RPO"},
    )
    with pytest.raises(HTTPException) as ex:
        m._sicoe_validar_par_actas_mover(2, 10, 10)
    assert ex.value.status_code == 422


def test_preview_item_marca_sellado(monkeypatch):
    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: True)
    item = m._sicoe_preview_item_mover(
        {
            "id": 1,
            "numero_registro": 99,
            "bloqueado": False,
            "item_numero": "1.1",
            "item_descripcion": "x",
            "cantidad_total": 1,
            "costo_directo": 0,
        },
        2,
    )
    assert item["sellado"] is True
    assert item["seleccionable_por_defecto"] is False


def test_preview_item_no_sellado(monkeypatch):
    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: False)
    item = m._sicoe_preview_item_mover(
        {
            "id": 2,
            "numero_registro": 100,
            "bloqueado": False,
            "item_numero": "2.1",
            "cantidad_total": 2,
            "costo_directo": 10,
        },
        2,
    )
    assert item["sellado"] is False
    assert item["seleccionable_por_defecto"] is True


def test_mover_exige_confirmacion_sellados(monkeypatch):
    monkeypatch.setattr(
        m,
        "_sicoe_validar_par_actas_mover",
        lambda *_a, **_k: (
            {"id": 1, "numero_rpo": 2, "tipo_grupo": "RPO"},
            {"id": 2, "numero_rpo": 1, "tipo_grupo": "RPO"},
        ),
    )
    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: True)
    monkeypatch.setattr(m, "_sicoe_chunks_int", lambda ids, _s: [list(ids)])

    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.in_.return_value = q
    q.execute.return_value = MagicMock(
        data=[
            {
                "id": 55,
                "reporte_id": 9,
                "bloqueado": True,
                "acta_rpo_id": 1,
                "acta_rpo_id_backup_swap": None,
                "numero_registro": 7,
                "contrato_id": 2,
                "nivel4_estado": "Aprobado",
            }
        ]
    )
    monkeypatch.setattr(m, "supabase", MagicMock(table=MagicMock(return_value=q)))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    with pytest.raises(HTTPException) as ex:
        m._sicoe_mover_registros_entre_actas_ejecutar(
            2,
            1,
            2,
            [55],
            {"sub": 1, "id": 1},
            incluir_sellados=False,
            motivo=None,
        )
    assert ex.value.status_code == 422
    assert "sellado" in str(ex.value.detail).lower()


def test_endpoint_gate_no_desarrollador():
    """require_solo_desarrollador rechaza no-devs (smoke del Depends usado en las rutas)."""
    with pytest.raises(HTTPException) as ex:
        m.require_solo_desarrollador({"sub": 9, "cargo_nombre": "Interventoría", "rol_nombre": "Interventoría"})
    assert ex.value.status_code == 403
