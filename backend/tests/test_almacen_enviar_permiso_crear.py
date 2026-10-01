"""Enviar / actualizar solicitud: Crear basta (no exige Editar)."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_require_crear_o_editar_definido_en_permissions():
    src = (ROOT / "almacen_permissions.py").read_text(encoding="utf-8")
    assert "def require_crear_o_editar_almacen" in src
    assert '"editar"' in src
    assert '"crear"' in src
    assert "crear o editar" in src.lower()


def test_routes_enviar_y_update_usan_crear_o_editar():
    src = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "require_crear_o_editar_almacen" in src
    enviar_block = src.split("def route_enviar_solicitud", 1)[1].split("\ndef ", 1)[0]
    assert "require_crear_o_editar_almacen" in enviar_block
    assert 'require_permiso_almacen(current_user, "editar")' not in enviar_block
    update_block = src.split("def route_update_solicitud", 1)[1].split("\ndef ", 1)[0]
    assert "require_crear_o_editar_almacen" in update_block


def test_helper_logica_crear_o_editar_inline():
    """Réplica de la condición de require_crear_o_editar_almacen."""

    def ok(crear: bool, editar: bool) -> bool:
        return bool(editar or crear)

    assert ok(crear=True, editar=False) is True
    assert ok(crear=False, editar=True) is True
    assert ok(crear=False, editar=False) is False
