"""Informe semanal: matriz día a día y curvas de desviación."""
from datetime import date

from notificaciones_email_semanal import (
    build_curva_desviacion_svg,
    build_informe_semanal_contenido,
    build_matriz_semanal_html,
    build_semana_snapshots,
    semana_anterior_lunes_domingo,
    titulo_semana,
)


def _matriz(aprobado_n1=0.0, pendiente_n1=0.0, aprobado_n2=0.0, pendiente_n2=0.0):
    na = [1, 2, 3]
    empty = {f"nivel{n}": 0.0 for n in na}

    def bloque(a1=0.0, p1=0.0, a2=0.0, p2=0.0):
        return {
            "aprobado": {**empty, "nivel1": a1, "nivel2": a2},
            "pendiente": {**empty, "nivel1": p1, "nivel2": p2},
            "pendiente_item": dict(empty),
            "no_revisado": dict(empty),
            "rechazado": dict(empty),
            "habilitado": dict(empty),
            "otras_actas": dict(empty),
        }

    return {
        "acta_rpo": 7,
        "niveles_activos": na,
        "nivel_maximo": 3,
        "niveles": [{"nivel": n, "encabezado": f"Nivel {n}"} for n in na],
        "obra_ejecutada_directo_sin_aiu": bloque(aprobado_n1, pendiente_n1, aprobado_n2, pendiente_n2),
        "ensayos_sondeos_directo_sin_iva": bloque(),
    }


def test_semana_anterior_desde_lunes():
    # Lunes 2026-08-03 → semana 27/07 – 02/08
    lun, dom = semana_anterior_lunes_domingo(date(2026, 8, 3))
    assert lun == date(2026, 7, 27)
    assert dom == date(2026, 8, 2)
    assert titulo_semana(lun, dom) == "Semana 27/07/2026 - 02/08/2026"


def test_matriz_semanal_columnas_y_acumulado():
    lun = date(2026, 7, 27)
    snaps = {
        (lun.isoformat(), "apertura"): {
            "matriz": _matriz(aprobado_n1=100, pendiente_n1=50),
            "capitulos": {},
        },
        (lun.isoformat(), "cierre"): {
            "matriz": _matriz(aprobado_n1=140, pendiente_n1=20),
            "capitulos": {},
        },
        ("2026-07-28", "apertura"): {
            "matriz": _matriz(aprobado_n1=140, pendiente_n1=20),
            "capitulos": {},
        },
        ("2026-07-28", "cierre"): {
            "matriz": _matriz(aprobado_n1=180, pendiente_n1=10),
            "capitulos": {},
        },
    }
    semana = build_semana_snapshots(snaps, lun)
    html = build_matriz_semanal_html(semana)
    assert "Acumulado anterior" in html
    assert "Lunes" in html
    assert "Domingo" in html
    assert "Apertura → Cierre" in html


def test_curva_svg_incluye_polyline():
    svg = build_curva_desviacion_svg([10.0, -5.0, 0.0, None, 20.0, -2.0, 1.0], "N1 · Nivel 1")
    assert "<svg" in svg
    assert "polyline" in svg
    assert "N1 · Nivel 1" in svg


def test_informe_contenido_asunto_semana():
    lun, dom = date(2026, 7, 27), date(2026, 8, 2)
    semana = build_semana_snapshots({}, lun)
    subject, text, title, body = build_informe_semanal_contenido(
        "Ana", "C-100", lun, dom, semana
    )
    assert "Informe semanal" in subject
    assert "Semana 27/07/2026 - 02/08/2026" in subject
    assert "C-100" in text
    assert "Curvas de desviación" in body
