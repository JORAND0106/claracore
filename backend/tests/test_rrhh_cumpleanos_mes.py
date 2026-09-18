"""Tests — cumpleaños del mes (RRHH)."""
from __future__ import annotations

from rrhh_service import (
    abreviar_empresa,
    filtrar_cumpleanos_mes,
    plantilla_cumpleanos_index,
    primer_nombre_colaborador,
    _parse_fecha_nacimiento,
)
from rrhh_cumpleanos_pdf import construir_html_cumpleanos, plantilla_por_id


def test_primer_nombre():
    assert primer_nombre_colaborador("María Fernanda López") == "María"
    assert primer_nombre_colaborador("  Ana  ") == "Ana"
    assert primer_nombre_colaborador("") == "—"
    assert primer_nombre_colaborador(None) == "—"


def test_parse_fecha_nacimiento():
    assert _parse_fecha_nacimiento("1990-03-15").month == 3
    assert _parse_fecha_nacimiento("1990-03-15T00:00:00Z").day == 15
    assert _parse_fecha_nacimiento(None) is None
    assert _parse_fecha_nacimiento("abc") is None


def test_abreviar_empresa():
    short = abreviar_empresa("OC INGENIERIA Y CONSULTORIA SAS")
    assert len(short) <= 18
    assert "OC" in short.upper()
    assert abreviar_empresa("") == "—"
    assert abreviar_empresa(None) == "—"
    assert abreviar_empresa("Consorcio Pajarito Pérez SAS", max_len=18)
    assert "…" in abreviar_empresa("Nombre Extremadamente Largo De Empresa Contratante")


def test_mensaje_con_titular():
    from rrhh_service import mensaje_motivacional_cumpleanos

    msg = mensaje_motivacional_cumpleanos("Consorcio Pajarito Pérez")
    assert msg.startswith("Consorcio Pajarito Pérez les desea")
    assert "feliz cumpleaños" in msg.lower()
    assert "En este mes celebramos" in mensaje_motivacional_cumpleanos("")


def test_plantilla_rota_cada_4_meses():
    # Misma ventana de 4 meses → mismo índice
    a = plantilla_cumpleanos_index(mes=1, anio=2026)
    b = plantilla_cumpleanos_index(mes=4, anio=2026)
    c = plantilla_cumpleanos_index(mes=5, anio=2026)
    assert a == b
    assert a != c
    assert plantilla_cumpleanos_index(mes=9, anio=2026) in (0, 1, 2, 3)


def test_filtrar_cumpleanos_mes_solo_activos_del_mes():
    rows = [
        {
            "id": 1,
            "nombres": "Carlos Andrés",
            "apellidos": "Pérez Gómez",
            "empresa_nombre": "Consorcio X",
            "estado": "activo",
            "fecha_nacimiento": "1990-09-05",
        },
        {
            "id": 2,
            "nombres": "Laura",
            "apellidos": "Díaz",
            "empresa_nombre": "Sub Y",
            "estado": "activo",
            "fecha_nacimiento": "1988-09-01",
        },
        {
            "id": 3,
            "nombres": "Pedro",
            "apellidos": "Ruiz",
            "empresa_nombre": "Consorcio X",
            "estado": "retirado",
            "fecha_nacimiento": "1992-09-10",
        },
        {
            "id": 4,
            "nombres": "Sofía",
            "apellidos": "López",
            "empresa_nombre": "Consorcio X",
            "estado": "activo",
            "fecha_nacimiento": "1995-03-20",
        },
        {
            "id": 5,
            "nombres": "Bruno",
            "apellidos": "Nada",
            "empresa_nombre": "Consorcio X",
            "estado": "activo",
            "fecha_nacimiento": None,
        },
    ]
    items = filtrar_cumpleanos_mes(rows, mes=9)
    assert [i["id"] for i in items] == [2, 1]  # día 1, luego 5
    assert items[0]["nombre_completo"] == "Laura Díaz"
    assert items[0]["dia"] == 1
    assert items[1]["primer_nombre"] == "Carlos"
    assert items[1]["nombre_completo"] == "Carlos Andrés Pérez Gómez"
    assert "empresa_abrev" in items[1]


def test_html_pdf_incluye_collage_y_plantilla():
    html = construir_html_cumpleanos(
        mes=9,
        anio=2026,
        plantilla_id=2,
        items=[
            {
                "dia": 10,
                "nombre_completo": "Ana Pérez",
                "empresa_abrev": "Consorcio X",
            }
        ],
        mensaje="¡Feliz cumpleaños!",
        titular="Consorcio Demo",
    )
    assert "Cumpleaños de septiembre" in html
    assert "Ana Pérez" in html
    assert "Consorcio X" in html
    assert "¡Feliz cumpleaños!" in html
    assert plantilla_por_id(2)["accent"] in html
    assert plantilla_por_id(2)["accent"] == "#0284C7"  # ClaraCore cielo
    assert "decor2" in html or "🎀" in html or "🥳" in html
    assert "Consorcio Demo" in html
    # Tarjetas blancas como el popup
    assert "#FFFFFF" in html or plantilla_por_id(2)["card"] == "#FFFFFF"


def test_plantillas_paleta_claracore():
    for i in range(4):
        pal = plantilla_por_id(i)
        assert pal["accent"].startswith("#")
        assert pal["card"] == "#FFFFFF"
        assert "decor" in pal and "decor2" in pal
