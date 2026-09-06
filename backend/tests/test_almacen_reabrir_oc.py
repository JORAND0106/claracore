"""Reabrir OC: helpers y firmas de agregar líneas / append."""
import ast
import inspect
from pathlib import Path

import almacen_service as svc


def test_helpers_reabrir_oc_existen():
    assert callable(svc._solicitud_item_ids_en_oc)
    assert callable(svc._fetch_oc_de_solicitud)
    assert callable(svc._insertar_items_en_oc)
    assert callable(svc.agregar_lineas_post_oc)
    assert callable(svc.append_aprobados_a_oc)


def test_agregar_lineas_post_oc_firma():
    sig = inspect.signature(svc.agregar_lineas_post_oc)
    assert list(sig.parameters) == ["contrato_id", "solicitud_id", "user_id", "body"]


def test_append_aprobados_a_oc_firma():
    sig = inspect.signature(svc.append_aprobados_a_oc)
    params = list(sig.parameters)
    assert params[:3] == ["contrato_id", "solicitud_id", "user_id"]
    assert "aprobar_pendientes" in sig.parameters


def test_aprobar_solicitud_delega_a_append_si_hay_oc():
    src = Path(svc.__file__).read_text(encoding="utf-8")
    assert "append_aprobados_a_oc" in src
    assert "existing_oc" in src or "_fetch_oc_de_solicitud" in src
    # Bloque de reapertura antes de crear OC nueva.
    idx_append = src.find("return append_aprobados_a_oc")
    idx_create = src.find('numero_oc = _next_consecutivo(contrato_id, "almacen_orden_compra"')
    assert idx_append > 0
    assert idx_create > idx_append


def test_ruta_agregar_lineas_registrada():
    routes = Path(__file__).resolve().parents[1] / "almacen_routes.py"
    src = routes.read_text(encoding="utf-8")
    assert "agregar-lineas-post-oc" in src
    assert "agregar_lineas_post_oc" in src
    tree = ast.parse(src)
    names = {
        n.name
        for n in tree.body
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    assert "route_agregar_lineas_post_oc" in names


def test_mapear_y_validar_permiten_post_oc_fuera_de_oc():
    src = Path(svc.__file__).read_text(encoding="utf-8")
    assert "ya forma parte de la Orden de Compra" in src
    assert "reabiertas" in src or 'estado") not in ("enviada", "aprobada")' in src
