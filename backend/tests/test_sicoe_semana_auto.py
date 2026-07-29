"""Generación en cadena de semanas SICOE Obra (7 días, sin huecos).

Espejo de `_siguiente_bloque_semana_sicoe` / cadena de `_asegurar_semana_vigente_sicoe`
sin importar `main` (deps Azure del entorno local).
"""

from datetime import date, timedelta


def _siguiente_bloque_semana_sicoe(fecha_fin_anterior: date):
    f_ini = fecha_fin_anterior + timedelta(days=1)
    f_fin = fecha_fin_anterior + timedelta(days=7)
    return f_ini, f_fin


def test_siguiente_bloque_semana_sin_hueco():
    # Última semana del contrato 3 terminó el 13-jul; la siguiente debe ser 14→20.
    f_ini, f_fin = _siguiente_bloque_semana_sicoe(date(2026, 7, 13))
    assert f_ini == date(2026, 7, 14)
    assert f_fin == date(2026, 7, 20)
    assert (f_fin - f_ini).days == 6  # 7 días inclusivos


def test_cadena_cubre_fecha_actual():
    ff = date(2026, 7, 13)
    hoy = date(2026, 7, 29)
    cubiertas = []
    for _ in range(10):
        f_ini, f_fin = _siguiente_bloque_semana_sicoe(ff)
        cubiertas.append((f_ini, f_fin))
        if f_ini <= hoy <= f_fin:
            break
        ff = f_fin
    assert cubiertas[-1][0] <= hoy <= cubiertas[-1][1]
    assert cubiertas[-1] == (date(2026, 7, 28), date(2026, 8, 3))
    for i in range(1, len(cubiertas)):
        assert cubiertas[i][0] == cubiertas[i - 1][1] + timedelta(days=1)


def test_coincide_con_formula_extender_semanas():
    """Misma aritmética que POST …/semanas/extender."""
    fecha_base = date(2026, 7, 13)
    for i in range(1, 4):
        f_ini_ext = fecha_base + timedelta(days=(i - 1) * 7 + 1)
        f_fin_ext = fecha_base + timedelta(days=i * 7)
        ff = fecha_base if i == 1 else (fecha_base + timedelta(days=(i - 1) * 7))
        f_ini, f_fin = _siguiente_bloque_semana_sicoe(ff)
        assert (f_ini, f_fin) == (f_ini_ext, f_fin_ext)
