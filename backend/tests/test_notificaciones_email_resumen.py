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


def test_informe_no_copiado_incluye_matriz_html():
    from notificaciones_email_mail import email_informe_no_copiado

    _, text, html = email_informe_no_copiado(
        "Ana Test",
        "CTO-001",
        "08:15",
        _matriz_sample(),
    )
    assert "informe de validación del día" in text
    assert "Validación por rol" in text
    assert "Obra ejecutada directo sin AIU" in html
    assert "Acta RPO #42" in html
    assert "APROBADO" in html


def test_comparacion_jornada_aprobado_y_capitulos():
    from notificaciones_email_resumen import compute_comparacion_jornada

    manana = _matriz_sample()
    tarde = _matriz_sample()
    tarde["obra_ejecutada_directo_sin_aiu"]["aprobado"]["nivel2"] = 300000.0
    cap_m = {
        "capitulos_aiu": [
            {"capitulo": "01. Cap", "claracore": 100, "cobrado": 80, "delta": 20},
        ],
        "totales_aiu": {"claracore": 100, "cobrado": 80, "delta": 20},
        "capitulos_iva": [],
        "totales_iva": {"claracore": 0, "cobrado": 0, "delta": 0},
    }
    cap_t = {
        "capitulos_aiu": [
            {"capitulo": "01. Cap", "claracore": 150, "cobrado": 90, "delta": 60},
        ],
        "totales_aiu": {"claracore": 150, "cobrado": 90, "delta": 60},
        "capitulos_iva": [],
        "totales_iva": {"claracore": 0, "cobrado": 0, "delta": 0},
    }
    cmp = compute_comparacion_jornada(manana, tarde, cap_m, cap_t)
    assert cmp["aprobado_delta"][2] == 300000.0
    assert cmp["capitulos_aiu"]["filas"][0]["delta_claracore"] == 50.0
    assert 1 in cmp["niveles_sin_avance"]


def test_comparacion_jornada_html_y_narrativa_sin_avance():
    from notificaciones_email_mail import email_admin_resumen
    from notificaciones_email_resumen import (
        build_comparacion_jornada_html,
        build_narrativa_sin_avance,
        compute_comparacion_jornada,
    )

    manana = _matriz_sample(pendiente_n2=500000)
    tarde = _matriz_sample(pendiente_n2=500000)
    cap = {
        "capitulos_aiu": [],
        "totales_aiu": {"claracore": 0, "cobrado": 0, "delta": 0},
        "capitulos_iva": [],
        "totales_iva": {"claracore": 0, "cobrado": 0, "delta": 0},
    }
    cmp = compute_comparacion_jornada(manana, tarde, cap, cap)
    html, _ = build_comparacion_jornada_html(cmp)
    assert "Aprobado adicional" in html
    assert "+$0" in html or "$0" in html
    sin = build_narrativa_sin_avance(cmp)
    assert "Sin actividad de revisión" in sin
    assert "N2" in sin or "Nivel 2" in sin

    _, _, html_fin = email_admin_resumen(
        "Ana",
        "CTO-1",
        "tarde",
        tarde,
        cap,
        snapshot_manana={"matriz": manana, "capitulos": cap},
    )
    assert "Avance durante la jornada" in html_fin
    assert "Sin actividad de revisión" in html_fin


def test_comparacion_no_disponible_sin_snapshot():
    from notificaciones_email_mail import email_admin_resumen

    cap = {
        "capitulos_aiu": [],
        "totales_aiu": {"claracore": 0, "cobrado": 0, "delta": 0},
        "capitulos_iva": [],
        "totales_iva": {"claracore": 0, "cobrado": 0, "delta": 0},
    }
    _, _, html_fin = email_admin_resumen(
        "Ana",
        "CTO-1",
        "tarde",
        _matriz_sample(),
        cap,
        snapshot_manana=None,
    )
    assert "No hay registro de inicio de jornada" in html_fin
    assert "Avance durante la jornada" in html_fin


def test_inicio_jornada_sin_seccion_comparacion():
    from notificaciones_email_mail import email_admin_resumen

    cap = {
        "capitulos_aiu": [],
        "totales_aiu": {"claracore": 0, "cobrado": 0, "delta": 0},
        "capitulos_iva": [],
        "totales_iva": {"claracore": 0, "cobrado": 0, "delta": 0},
    }
    _, _, html_man = email_admin_resumen(
        "Ana",
        "CTO-1",
        "manana",
        _matriz_sample(),
        cap,
    )
    assert "Avance durante la jornada" not in html_man
