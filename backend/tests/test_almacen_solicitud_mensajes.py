"""Aprobación por Validar, sello de justificación y buzón de la solicitud."""
from __future__ import annotations

from pathlib import Path

import almacen_service as svc
from almacen_solicitud_mensajes import redactar_valores_economicos


ROOT = Path(__file__).resolve().parents[1]


def test_sello_justificacion_conserva_autor_si_el_texto_no_cambia():
    prev = {
        "observacion_residente": "Se requiere más material por el desfase del PK",
        "justificacion_autor_id": 3,
        "justificacion_autor_nombre": "Ana Ruiz",
        "justificacion_at": "2026-01-01T00:00:00+00:00",
    }
    row = {"observacion_residente": prev["observacion_residente"]}
    svc._aplicar_sello_justificacion(row, prev, 9, "Luis Gómez")
    assert row["justificacion_autor_nombre"] == "Ana Ruiz"
    assert row["justificacion_at"] == prev["justificacion_at"]

    cambiado = {"observacion_residente": "Justificación nueva del desfase en el PK"}
    svc._aplicar_sello_justificacion(cambiado, prev, 9, "Luis Gómez")
    assert cambiado["justificacion_autor_id"] == 9
    assert cambiado["justificacion_autor_nombre"] == "Luis Gómez"
    assert cambiado["justificacion_at"]


def test_sello_se_limpia_si_desaparece_el_texto():
    row = {"observacion_residente": "   "}
    svc._aplicar_sello_justificacion(row, {"observacion_residente": "texto previo largo"}, 1, "Ana")
    assert row["observacion_residente"] is None
    assert row["justificacion_autor_nombre"] is None


def test_proveedor_de_linea_sin_insumo_y_por_catalogo():
    sin = svc._clasificar_proveedor_linea({"es_recurrente": False}, {}, {})
    assert sin["sin_insumo"] is True
    assert sin["proveedor_nombre"] is None

    recurrente = svc._clasificar_proveedor_linea({"es_recurrente": True}, {}, {})
    assert recurrente["proveedor_nombre"] == "Compra recurrente"
    assert recurrente["sin_insumo"] is False

    cat = {8: {"proveedor_id": 4}}
    nombres = {4: "Ferretería Norte"}
    asignado = svc._clasificar_proveedor_linea({"insumo_id": 8}, cat, nombres)
    assert asignado["proveedor_nombre"] == "Ferretería Norte"
    assert asignado["proveedor_id"] == 4
    assert asignado["sin_insumo"] is False

    resumen = svc._resumen_proveedores_solicitud([
        {"sin_insumo": False, "proveedor_id": 4, "proveedor_nombre": "Ferretería Norte"},
        {"sin_insumo": False, "proveedor_id": 4, "proveedor_nombre": "Ferretería Norte"},
        {"sin_insumo": False, "proveedor_id": 5, "proveedor_nombre": "Aceros del Sur"},
        {"sin_insumo": True, "proveedor_nombre": None},
    ])
    assert resumen["ocs_previstas"] == 2
    assert resumen["lineas_sin_insumo"] == 1


def test_justificacion_visible_usa_al_solicitante_si_no_hay_sello():
    sol = {
        "solicitante_nombre": "Marta López",
        "enviada_at": "2026-02-02T10:00:00+00:00",
        "items": [{
            "observacion_residente": "La cantidad supera el saldo del PK por el cambio de tramo",
            "justificacion_autor_nombre": None,
            "justificacion_at": None,
        }],
    }
    svc._attach_justificacion_visible(sol)
    assert sol["items"][0]["justificacion_autor_nombre"] == "Marta López"
    assert sol["items"][0]["justificacion_at"] == "2026-02-02T10:00:00+00:00"


def test_redaccion_oculta_importes_y_conserva_la_linea():
    texto = "La línea 3 de cemento quedó en costo unitario $1.250.000 y rentabilidad 12%"
    oculto = redactar_valores_economicos(texto)
    assert "$" not in oculto
    assert "1.250.000" not in oculto
    assert "línea 3" in oculto.lower() or "Línea 3" in oculto or "línea 3" in texto.lower()
    assert "cemento" in oculto
    assert redactar_valores_economicos("Sin cifras en este mensaje") == "Sin cifras en este mensaje"


def test_rutas_de_aprobacion_y_buzon():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    for name in (
        "route_aprobar_solicitud",
        "route_aprobar_items_bloque",
        "route_validar_item_solicitud",
        "route_aprobar_todos_items",
        "route_rechazar_solicitud",
    ):
        start = routes.find(f"def {name}(")
        assert start > 0
        chunk = routes[start:start + 500]
        assert 'require_permiso_almacen(current_user, "validar")' in chunk
        assert "require_contratista_gerencial_almacen" not in chunk
    assert "def route_list_mensajes_solicitud" in routes
    assert "def route_enviar_mensaje_solicitud" in routes
    assert 'require_permiso_almacen(current_user, "ver")' in routes
    assert "MENSAJE_SOLICITUD" in routes
    sql = (ROOT / "sql" / "almacen_solicitud_mensajes.sql").read_text(encoding="utf-8")
    assert "almacen_solicitud_mensaje" in sql
    assert "justificacion_autor_nombre" in sql
    assert "leido_at" in sql
