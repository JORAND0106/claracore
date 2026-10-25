"""Identidad de la línea: OC parcial, rechazo y trazabilidad por id."""
from pathlib import Path

from almacen_linea_partida import (
    armar_reporte_autoria,
    destino_oc,
    debe_separar_para_oc,
    estado_si_toda_la_solicitud_rechazada,
    evento_es_de_esta_linea,
    ficha_linea,
    filas_para_devolver,
    filas_para_mover,
    proteger_autor_linea,
    quien_pidio_de_items,
    resumen_solicitantes_linea,
    sellar_solicitado_por,
)


def _linea(i, **extra):
    row = {
        "id": i,
        "solicitud_id": 10,
        "numero_linea": i,
        "estado_validacion": "aprobado",
        "solicitado_por": 1,
    }
    row.update(extra)
    return row


def test_separar_solo_un_subconjunto():
    items = [_linea(i) for i in range(1, 11)]
    assert debe_separar_para_oc(items, [1, 2, 3, 4, 5]) is True
    assert destino_oc(items, [1, 2, 3, 4, 5], False) == "derivada"
    assert destino_oc(items, list(range(1, 11)), False) == "misma"
    assert destino_oc(items, None, False) == "misma"


def test_no_mueve_lineas_ya_en_oc_cuando_se_eligen_todas_las_pendientes():
    items = [_linea(1, en_orden_compra=True), _linea(2), _linea(3)]
    assert destino_oc(items, [2, 3], True) == "misma"
    assert destino_oc(items, [2], True) == "derivada"


def test_movimiento_conserva_id_y_renumera():
    items = [_linea(8, numero_linea=4, solicitado_por=1), _linea(3, numero_linea=1, solicitado_por=1)]
    filas = filas_para_mover(items, [8, 3], 99)
    assert [f["item_id"] for f in filas] == [3, 8]
    assert [f["numero_linea"] for f in filas] == [1, 2]
    assert filas[0]["antes"]["solicitud_id"] == 10
    vuelta = filas_para_devolver(filas)
    assert vuelta[0]["solicitud_id"] == 10
    assert vuelta[0]["numero_linea"] == 1
    assert vuelta[1]["item_id"] == 8


def test_solicitado_por_no_se_reescribe():
    alta = sellar_solicitado_por({"solicitado_por": 99, "cantidad": 1}, 7)
    assert alta["solicitado_por"] == 7
    edit = proteger_autor_linea({"solicitado_por": 7, "cantidad": 2})
    assert "solicitado_por" not in edit


def test_rechazo_parcial_no_cierra_la_solicitud():
    items = [
        {"id": 1, "estado_validacion": "rechazado"},
        {"id": 2, "estado_validacion": "pendiente"},
    ]
    assert estado_si_toda_la_solicitud_rechazada(items) is None
    items[1]["estado_validacion"] = "rechazado"
    assert estado_si_toda_la_solicitud_rechazada(items) == "rechazada"


def test_trazabilidad_no_cruza_por_numero_de_linea():
    evento_b = {
        "entidad_tipo": "solicitud",
        "entidad_id": "20",
        "detalle": {"item_id": 2, "numero_linea": 1},
    }
    evento_a = {
        "entidad_tipo": "solicitud_item",
        "entidad_id": "1",
        "detalle": {"numero_linea": 1},
    }
    assert evento_es_de_esta_linea(evento_a, 1) is True
    assert evento_es_de_esta_linea(evento_b, 1) is False
    assert evento_es_de_esta_linea(evento_b, 2) is True


def test_reporte_no_inventa_solicitante():
    items = [
        {
            "id": 5,
            "solicitud_id": 30,
            "numero_linea": 1,
            "material_descripcion": "Arena",
            "solicitado_por": None,
        }
    ]
    sols = [
        {"id": 10, "consecutivo": 10, "created_by": 1},
        {"id": 30, "consecutivo": 30, "created_by": 2},
    ]
    logs = [{
        "accion": "AGRUPAR",
        "entidad_tipo": "solicitud_item",
        "entidad_id": "5",
        "created_at": "2026-10-01T00:00:00Z",
        "valor_anterior": {"solicitud_id": 10, "numero_linea": 4},
        "valor_nuevo": {"solicitud_id": 30, "numero_linea": 1},
    }]
    reporte = armar_reporte_autoria(items, sols, logs, {1: "Ana", 2: "Beto"})
    fila = reporte["lineas"][0]
    assert fila["accion"] == "restauraria"
    assert fila["restauraria_solicitado_por"] == 1
    assert fila["candidato_nombre"] == "Ana"
    assert reporte["aplica"] is False

    incierto = armar_reporte_autoria(
        items,
        sols,
        [{
            "accion": "AGRUPAR",
            "entidad_tipo": "solicitud_item",
            "entidad_id": "5",
            "created_at": "2026-10-01T00:00:00Z",
            "valor_anterior": {"numero_linea": 4},
            "valor_nuevo": {"solicitud_id": 30},
        }],
        {2: "Beto"},
    )
    assert incierto["lineas"][0]["accion"] == "marcado_incierto"
    assert incierto["lineas"][0]["restauraria_solicitado_por"] is None


def test_ficha_trae_observacion_y_justificacion_con_autor():
    ficha = ficha_linea(
        {
            "id": 8,
            "numero_linea": 2,
            "descripcion_solicitada": "Cemento",
            "observacion_residente": "Falta en el tramo",
            "justificacion_autor_nombre": "Ana",
            "justificacion_at": "2026-10-25T15:00:00Z",
            "cantidad": 3,
            "unidad": "BTO",
            "solicitado_por": 4,
        },
        {"id": 1, "consecutivo": 10, "created_by": 9},
        {"codigo": "CEM", "descripcion": "Cemento gris"},
        nombres={4: "Ana", 9: "Beto"},
        ver_economicos=False,
    )
    assert ficha["observacion"] == "Falta en el tramo"
    assert ficha["justificacion"] == "Falta en el tramo"
    assert ficha["justificacion_autor_nombre"] == "Ana"
    assert ficha["justificacion_at"] == "2026-10-25T15:00:00Z"
    assert ficha["solicitado_por_nombre"] == "Ana"
    vacia = ficha_linea(
        {"id": 9, "descripcion_solicitada": "Arena"},
        {"id": 1, "created_by": 9},
        None,
        nombres={9: "Beto"},
        ver_economicos=False,
    )
    assert vacia["observacion"] is None
    assert vacia["justificacion"] is None
    assert vacia["justificacion_autor_nombre"] is None


def test_quien_pidio_sale_de_la_linea():
    items = [
        {"id": 1, "solicitado_por_nombre": "Ana"},
        {"id": 2, "solicitado_por_nombre": "Ana"},
    ]
    assert quien_pidio_de_items(items, {"solicitante_nombre": "Beto"}) == "Ana (solicitud de Beto)"
    assert quien_pidio_de_items(items, {"solicitante_nombre": "Ana"}) == "Ana"
    assert resumen_solicitantes_linea(["Ana"], "Ana") == "Ana"
    assert resumen_solicitantes_linea(["Ana", "Beto"], "Ana") == "Varios"


def test_ruta_autoria_se_registra_antes_del_id_de_solicitud():
    """Si la ruta fija queda después, FastAPI lee «autoria-lineas» como solicitud_id."""
    src = Path(__file__).resolve().parents[1].joinpath("almacen_routes.py").read_text(encoding="utf-8")
    autoria = src.index('@router.get("/{contrato_id}/solicitudes/autoria-lineas")')
    por_id = src.index('@router.get("/{contrato_id}/solicitudes/{solicitud_id}")')
    assert autoria < por_id


def test_autoria_lineas_no_se_parsea_como_entero():
    from fastapi import APIRouter, FastAPI
    from fastapi.testclient import TestClient

    router = APIRouter()

    @router.get("/{contrato_id}/solicitudes/autoria-lineas")
    def fijo(contrato_id: int):
        return {"ok": True, "contrato_id": contrato_id}

    @router.get("/{contrato_id}/solicitudes/{solicitud_id}")
    def por_id(contrato_id: int, solicitud_id: int):
        return {"solicitud_id": solicitud_id}

    app = FastAPI()
    app.include_router(router)
    res = TestClient(app).get("/7/solicitudes/autoria-lineas")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_mover_lineas_no_toca_solicitado_por():
    src = Path(__file__).resolve().parents[1].joinpath("almacen_agrupar.py").read_text(encoding="utf-8")
    bloque = src.split("def _mover_lineas_update", 1)[1].split("def _mover_lineas_bloque", 1)[0]
    assert "solicitado_por" not in bloque
    assert '"solicitud_id": sid' in bloque
    assert '"numero_linea": numero' in bloque
