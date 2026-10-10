"""Asignar insumo exige Editar; aprobar exige Validar, sin rol gerencial."""
import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _helpers():
    """Carga los helpers de costo sin importar el servicio (dependencias de Azure)."""
    src = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    want = {"_to_float", "_mismo_insumo_linea", "_costo_al_mapear", "_cobro_al_mapear"}
    parts = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in want:
            parts.append(ast.get_source_segment(src, node))
    ns: dict = {}
    exec("\n\n".join(parts), ns)  # noqa: S102 — helpers puros del propio módulo
    return ns


def _fn(src: str, name: str) -> str:
    start = src.find(f"def {name}(")
    assert start >= 0, name
    nxt = src.find("\ndef ", start + 1)
    return src[start:nxt if nxt > 0 else None]


def test_ruta_mapear_exige_editar_y_aprobar_sigue_gerencial():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    mapear = _fn(routes, "route_mapear_item_gerencial")
    assert 'require_permiso_almacen(current_user, "editar")' in mapear
    assert "require_contratista_gerencial_almacen" not in mapear

    validar = _fn(routes, "route_validar_item_solicitud")
    aprobar = _fn(routes, "route_aprobar_solicitud")
    assert 'require_permiso_almacen(current_user, "validar")' in validar
    assert 'require_permiso_almacen(current_user, "validar")' in aprobar
    assert "require_contratista_gerencial_almacen" not in validar
    assert "require_contratista_gerencial_almacen" not in aprobar

    corregir = _fn(routes, "route_corregir_insumo_post_oc")
    assert 'require_permiso_almacen(current_user, "editar")' in corregir
    assert "es_contratista_gerencial" in corregir


def test_costo_omitido_conserva_el_de_la_linea_si_el_insumo_no_cambia():
    h = _helpers()
    existing = {"insumo_id": 4, "valor_compra_unitario": 1800, "vlr_unitario_cobro": 2500}
    resolved = {"valor_compra_unitario": 900, "vlr_unitario_cobro": 1000}
    assert h["_costo_al_mapear"]({}, existing, resolved, 4) == 1800
    assert h["_cobro_al_mapear"](None, existing, resolved, 4) == 2500


def test_costo_enviado_o_insumo_nuevo_usa_el_valor_explicito_o_el_catalogo():
    h = _helpers()
    existing = {"insumo_id": 4, "valor_compra_unitario": 1800, "vlr_unitario_cobro": 2500}
    resolved = {"valor_compra_unitario": 900, "vlr_unitario_cobro": 1000}
    assert h["_costo_al_mapear"]({"valor_compra_unitario": 700}, existing, resolved, 4) == 700
    assert h["_costo_al_mapear"]({}, existing, resolved, 9) == 900
    assert h["_cobro_al_mapear"](3200, existing, resolved, 9) == 3200
    assert h["_cobro_al_mapear"](None, existing, resolved, 9) == 1000


def test_reguardar_el_precio_viejo_toma_la_cotizacion_vigente():
    h = _helpers()
    existing = {"insumo_id": 4, "valor_compra_unitario": 1800, "vlr_unitario_cobro": 2500}
    resolved = {"valor_compra_unitario": 900, "vlr_unitario_cobro": 1000}
    assert h["_costo_al_mapear"](
        {"valor_compra_unitario": 1800}, existing, resolved, 4, oferta_valor=80,
    ) == 80
    assert h["_costo_al_mapear"]({}, existing, resolved, 4, oferta_valor=80) == 80
    assert h["_costo_al_mapear"](
        {"valor_compra_unitario": 700}, existing, resolved, 4, oferta_valor=80,
    ) == 700
    assert h["_costo_al_mapear"](
        {"valor_compra_unitario": 1800}, existing, resolved, 4, oferta_valor=None,
    ) == 1800


def test_mapear_usa_la_cotizacion_vigente_y_la_correccion_post_oc_no():
    src = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    mapear = _fn(src, "mapear_item_solicitud_gerencial")
    assert "oferta_valor=" in mapear
    corregir = _fn(src, "corregir_insumo_item_post_oc")
    assert "oferta_valor" not in corregir
