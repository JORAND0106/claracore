"""Auditoría de permisos Almacén: anular/exportar/crear alineados con la matriz."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_pdf_movimientos_exigen_exportar_o_crear():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "require_exportar_o_crear_entradas_salidas(current_user)" in routes
    entsal = (ROOT / "entradas_salidas_permissions.py").read_text(encoding="utf-8")
    assert "def require_exportar_o_crear_entradas_salidas" in entsal
    assert '_cargo_permiso_entsal(current_user, "exportar")' in entsal
    assert '_cargo_permiso_entsal(current_user, "crear")' in entsal


def test_helpers_ui_registrar_solo_crear():
    helpers = (ROOT.parent / "frontend/src/almacen/almacenPermisos.js").read_text(encoding="utf-8")
    # Nueva entrada/salida: solo crear (sin || editar).
    assert "export function puedeRegistrarEntradaAlmacen(permisos) {\n  return Boolean(permisos?.crear)\n}" in helpers.replace(
        "\r\n", "\n"
    )
    assert "export function puedeRegistrarSalidaAlmacen(permisos) {\n  return Boolean(permisos?.crear)\n}" in helpers.replace(
        "\r\n", "\n"
    )
