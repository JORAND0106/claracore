"""Numeración libre y permisos al eliminar borradores SicoeObra."""
from sicoe_borradores import menor_numero_reporte_libre, puede_eliminar_borrador


def test_menor_libre_rellena_hueco_desde_uno():
    assert menor_numero_reporte_libre([1, 2, 5], desde_uno=True) == 3


def test_menor_libre_piso_legacy():
    assert menor_numero_reporte_libre([35000, 35001, 35003], desde_uno=False) == 35002


def test_menor_libre_sin_usados_desde_uno():
    assert menor_numero_reporte_libre([], desde_uno=True) == 1


def test_menor_libre_sin_usados_piso():
    assert menor_numero_reporte_libre([], desde_uno=False) == 35000


def test_no_reutiliza_enviados_solo_huecos():
    # 4 eliminado (borrador); 1–3 y 5 siguen → próximo 4
    assert menor_numero_reporte_libre([1, 2, 3, 5], desde_uno=True) == 4


def test_solo_borrador_eliminable():
    assert (
        puede_eliminar_borrador(
            estado="No Revisados", user_id=1, creado_por=1, permiso_eliminar=True
        )
        is False
    )


def test_creador_puede_eliminar_su_borrador():
    assert (
        puede_eliminar_borrador(
            estado="Borrador", user_id=9, creado_por=9, permiso_eliminar=False
        )
        is True
    )


def test_otro_usuario_sin_permiso_no_elimina():
    assert (
        puede_eliminar_borrador(
            estado="Borrador", user_id=2, creado_por=9, permiso_eliminar=False
        )
        is False
    )


def test_permiso_eliminar_permite_cualquier_borrador():
    assert (
        puede_eliminar_borrador(
            estado="Borrador", user_id=2, creado_por=9, permiso_eliminar=True
        )
        is True
    )
