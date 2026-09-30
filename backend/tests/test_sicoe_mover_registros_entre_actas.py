"""Mover registros entre actas / cortes / reasignar subcontratistas (Desarrollador)."""
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


def test_validar_par_cortes_distintos(monkeypatch):
    monkeypatch.setattr(
        m,
        "_sicoe_subcontratista_meta",
        lambda cid, sid: {"id": sid, "razon_social": "Sub A"},
    )
    monkeypatch.setattr(
        m,
        "_sicoe_corte_meta",
        lambda cid, sid, corte: {"id": corte, "consecutivo": corte, "fecha_inicio": "2024-01-01", "fecha_fin": "2024-01-15"},
    )
    with pytest.raises(HTTPException) as ex:
        m._sicoe_validar_par_cortes_mover(2, 5, 10, 10)
    assert ex.value.status_code == 422


def test_preview_item_corte_sin_costo(monkeypatch):
    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: False)
    item = m._sicoe_preview_item_mover_corte(
        {
            "id": 3,
            "numero_registro": 11,
            "bloqueado": False,
            "item_numero": "3.1",
            "item_descripcion": "obra",
            "cantidad_total": 4,
            "costo_directo": 9999,
            "subcontratista_id": 5,
            "corte_id": 8,
        },
        2,
    )
    assert "costo_directo" not in item
    assert item["seleccionable_por_defecto"] is True


def test_preview_item_reasignar_sin_campos_economicos(monkeypatch):
    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: False)
    item = m._sicoe_preview_item_reasignar(
        {
            "id": 4,
            "numero_registro": 12,
            "bloqueado": False,
            "item_numero": "4.1",
            "cantidad_total": 1,
            "costo_directo": 50000,
            "valor_unitario": 100,
            "subcontratista_id": 1,
            "corte_id": 2,
        },
        2,
    )
    assert "costo_directo" not in item
    assert "valor_unitario" not in item
    assert item["subcontratista_id"] == 1


def test_mover_cortes_exige_confirmacion_sellados(monkeypatch):
    monkeypatch.setattr(
        m,
        "_sicoe_validar_par_cortes_mover",
        lambda *_a, **_k: (
            {"id": 5, "razon_social": "Sub"},
            {"id": 1, "consecutivo": 1, "fecha_inicio": "a", "fecha_fin": "b"},
            {"id": 2, "consecutivo": 2, "fecha_inicio": "c", "fecha_fin": "d"},
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
                "id": 77,
                "reporte_id": 9,
                "bloqueado": True,
                "subcontratista_id": 5,
                "corte_id": 1,
                "numero_registro": 3,
                "contrato_id": 2,
            }
        ]
    )
    monkeypatch.setattr(m, "supabase", MagicMock(table=MagicMock(return_value=q)))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    with pytest.raises(HTTPException) as ex:
        m._sicoe_mover_registros_entre_cortes_ejecutar(
            2, 5, 1, 2, [77], {"sub": 1}, incluir_sellados=False, motivo=None
        )
    assert ex.value.status_code == 422
    assert "sellado" in str(ex.value.detail).lower()


def test_reasignar_exige_confirmacion_sellados(monkeypatch):
    monkeypatch.setattr(
        m,
        "_sicoe_subcontratista_meta",
        lambda cid, sid: {"id": sid, "razon_social": "Destino"},
    )
    monkeypatch.setattr(
        m,
        "_asegurar_corte_vigente_subcontratista",
        lambda sid: {"id": 99, "consecutivo": 3, "fecha_inicio": "2024-01-01", "fecha_fin": "2024-01-15"},
    )
    monkeypatch.setattr(
        m,
        "_sicoe_corte_meta",
        lambda cid, sid, corte: {
            "id": corte,
            "consecutivo": 3,
            "fecha_inicio": "2024-01-01",
            "fecha_fin": "2024-01-15",
        },
    )
    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: True)
    monkeypatch.setattr(m, "_sicoe_chunks_int", lambda ids, _s: [list(ids)])
    monkeypatch.setattr(m, "_sicoe_uid_from_user", lambda _u: 1)

    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.in_.return_value = q
    q.execute.return_value = MagicMock(
        data=[
            {
                "id": 88,
                "reporte_id": 1,
                "bloqueado": True,
                "subcontratista_id": 1,
                "corte_id": 2,
                "numero_registro": 8,
                "contrato_id": 2,
                "nivel2_objeto_pago_sub": False,
            }
        ]
    )
    monkeypatch.setattr(m, "supabase", MagicMock(table=MagicMock(return_value=q)))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    with pytest.raises(HTTPException) as ex:
        m._sicoe_reasignar_subcontratista_ejecutar(
            2, 9, [88], {"sub": 1}, incluir_sellados=False, motivo=None
        )
    assert ex.value.status_code == 422
    assert "sellado" in str(ex.value.detail).lower()
