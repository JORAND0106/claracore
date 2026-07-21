"""Plantilla HTML del correo resumen jornada."""
from notificaciones_email_resumen import (
    build_capitulos_html,
    build_matriz_html,
    build_narrativa_riesgo,
)


def _matriz_sample(niveles=None, pendiente_n2=0.0, pendiente_n3=0.0):
    na = niveles or [1, 2, 3]
    empty = {f"nivel{n}": 0.0 for n in na}

    def bloque(**overrides):
        base = {
            "aprobado": dict(empty),
            "pendiente": dict(empty),
            "pendiente_item": dict(empty),
            "no_revisado": dict(empty),
            "rechazado": dict(empty),
            "habilitado": dict(empty),
            "otras_actas": dict(empty),
        }
        for k, v in overrides.items():
            base[k] = {**empty, **v}
        return base

    b_obra = bloque()
    if pendiente_n2:
        b_obra["pendiente"]["nivel2"] = pendiente_n2
    if pendiente_n3:
        b_obra["pendiente"]["nivel3"] = pendiente_n3
    return {
        "acta_rpo": 42,
        "niveles_activos": na,
        "nivel_maximo": max(na),
        "niveles": [{"nivel": n, "encabezado": f"Nivel {n}"} for n in na],
        "obra_ejecutada_directo_sin_aiu": b_obra,
        "ensayos_sondeos_directo_sin_iva": bloque(),
    }


def test_matriz_html_incluye_filas_panel():
    html = build_matriz_html(_matriz_sample())
    assert "Obra ejecutada directo sin AIU" in html
    assert "APROBADO" in html
    assert "PENDIENTE N1" in html
    assert "HABILITADO VALIDACIÓN" in html


def test_narrativa_sin_riesgo():
    html = build_narrativa_riesgo(_matriz_sample())
    assert "No se identifican riesgos" in html


def test_narrativa_riesgo_nivel_intermedio():
    html = build_narrativa_riesgo(_matriz_sample(pendiente_n2=500000))
    assert "niveles intermedios" in html
    assert "$500.000" in html


def test_narrativa_riesgo_nivel_maximo():
    html = build_narrativa_riesgo(_matriz_sample(pendiente_n3=1200000))
    assert "nivel máximo" in html
    assert "$1.200.000" in html


def test_capitulos_html_tablas_aiu_iva():
    cap = {
        "capitulos_aiu": [
            {"capitulo": "01. Mov. de tierras", "claracore": 100, "cobrado": 80, "delta": 20},
        ],
        "totales_aiu": {"claracore": 100, "cobrado": 80, "delta": 20},
        "capitulos_iva": [],
        "totales_iva": {"claracore": 0, "cobrado": 0, "delta": 0},
    }
    html, text = build_capitulos_html(cap)
    assert "Total ClaraCore" in html
    assert "TOTAL OBRA (AIU)" in html
    assert "TOTAL IVA" in html
    assert "Ppto vs Cobro" in text
