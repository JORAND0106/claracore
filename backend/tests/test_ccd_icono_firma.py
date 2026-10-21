"""Ícono de firma: el rol lo decide la Biblioteca CCD, no el permiso Validar."""
from __future__ import annotations

import base64
import io
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pymupdf
import pytest
from fastapi import HTTPException
from PIL import Image, ImageDraw

ARTEFACTOS = Path("/opt/cursor/artifacts")

CODIGOS_ICONO = (
    "CC-SUB-001",
    "CC-SUB-002",
    "CC-SEM-001",
    "CC-SEM-002",
    "CC-MES-001",
    "CC-MES-002",
    "CC-GER-001",
)


def _import_informes_with_stubs():
    if "informes" in sys.modules:
        return sys.modules["informes"]
    stubs = {
        "main": SimpleNamespace(
            get_current_user=lambda: None,
            get_current_user_optional=lambda: None,
        ),
        "mail_smtp": SimpleNamespace(try_send_text_email=lambda *a, **k: None),
    }
    saved = {}
    for name, mod in stubs.items():
        saved[name] = sys.modules.get(name)
        fake = ModuleType(name)
        for k, v in vars(mod).items():
            if not k.startswith("_"):
                setattr(fake, k, v)
        sys.modules[name] = fake
    for extra in ("passlib", "passlib.context", "jose", "python_jose"):
        if extra not in sys.modules:
            sys.modules[extra] = ModuleType(extra)
    try:
        import informes as inf  # noqa: WPS433
    finally:
        for name, prev in saved.items():
            if prev is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = prev
    return inf


def _cfg():
    return {
        "elaboro_usuario_id": 11,
        "elaboro_nombre": "Ana Elaboró",
        "elaboro_cargo": "Residente",
        "reviso_usuario_id": 22,
        "reviso_nombre": "Luis Revisó",
        "reviso_cargo": "Director",
        "aprobo_usuario_id": 33,
        "aprobo_nombre": "Pedro Aprobó",
        "aprobo_cargo": "Interventor",
    }


def _user(uid: int, nombre: str, apellidos: str) -> dict:
    return {"sub": str(uid), "nombre": nombre, "apellidos": apellidos}


def _firma_uri(color: str) -> str:
    img = Image.new("RGB", (360, 90), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(8, 70), (80, 16), (160, 74), (250, 18), (348, 62)], fill=color, width=4)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_inventario_cubre_todos_los_formatos_salvo_entidades_externas():
    inf = _import_informes_with_stubs()
    externos = {
        cod
        for cod, meta in inf.FORMATOS_CCD.items()
        if meta.get("grupo_ccd") == "entidades_externas"
    }
    assert externos == {"FO-IDU-EO-04-V2"}
    internos = [cod for cod in inf.FORMATOS_CCD if cod not in externos]
    assert list(CODIGOS_ICONO) == internos
    assert inf._firma_sigue_asignacion_biblioteca("FO-IDU-EO-04-V2") is False
    for cod in CODIGOS_ICONO:
        assert inf._firma_sigue_asignacion_biblioteca(cod) is True
        slots = inf._slots_firma_configurables(cod)
        assert "elaboro" in slots and "reviso" in slots
        if cod.startswith("CC-SUB-"):
            assert "aprobo" not in slots
        else:
            assert "aprobo" in slots


def test_cada_formato_muestra_solo_el_rol_asignado():
    inf = _import_informes_with_stubs()
    ana = _user(11, "Ana", "Elaboró")
    luis = _user(22, "Luis", "Revisó")
    pedro = _user(33, "Pedro", "Aprobó")
    nadie = _user(44, "Nadie", "Asignado")
    cfg = _cfg()
    for cod in CODIGOS_ICONO:
        assert inf._slot_firma_pendiente(cfg, 11, ana, cod, set()) == "elaboro"
        assert inf._slot_firma_pendiente(cfg, 22, luis, cod, set()) == "reviso"
        if cod.startswith("CC-SUB-"):
            assert inf._slot_firma_pendiente(cfg, 33, pedro, cod, set()) is None
        else:
            assert inf._slot_firma_pendiente(cfg, 33, pedro, cod, set()) == "aprobo"
        assert inf._slot_firma_pendiente(cfg, 44, nadie, cod, set()) is None


def test_rol_firmado_oculta_el_icono_y_el_cambio_de_biblioteca_no_pisa_la_firma():
    inf = _import_informes_with_stubs()
    cod = "CC-MES-001"
    ana = _user(11, "Ana", "Elaboró")
    nueva = _user(55, "Nueva", "Elaboró")
    luis = _user(22, "Luis", "Revisó")
    cfg = _cfg()
    assert inf._slot_firma_pendiente(cfg, 11, ana, cod, {"elaboro"}) is None
    with pytest.raises(HTTPException) as ya:
        inf._resolver_slot_registrar_firma(cod, cfg, 11, ana, {"elaboro"})
    assert ya.value.status_code == 409
    ambos = {**cfg, "reviso_usuario_id": 11}
    assert inf._slot_firma_pendiente(ambos, 11, ana, cod, {"elaboro"}) == "reviso"
    movido = {**cfg, "elaboro_usuario_id": 55}
    assert inf._slot_firma_pendiente(movido, 11, ana, cod, set()) is None
    assert inf._slot_firma_pendiente(movido, 55, nueva, cod, set()) == "elaboro"
    assert inf._slot_firma_pendiente(movido, 55, nueva, cod, {"elaboro"}) is None
    with pytest.raises(HTTPException) as pisa:
        inf._resolver_slot_registrar_firma(cod, movido, 55, nueva, {"elaboro"})
    assert pisa.value.status_code == 409
    assert inf._resolver_slot_registrar_firma(cod, movido, 22, luis, {"elaboro"}) == "reviso"
    with pytest.raises(HTTPException) as ajeno:
        inf._resolver_slot_registrar_firma(cod, cfg, 44, _user(44, "Nadie", "Asignado"), set())
    assert ajeno.value.status_code == 400


def test_el_nombre_no_roba_un_rol_asignado_a_otro_id():
    inf = _import_informes_with_stubs()
    cfg = {
        "elaboro_usuario_id": None,
        "elaboro_nombre": "Ana María Pérez",
        "reviso_usuario_id": 22,
        "reviso_nombre": "Ana María Pérez",
    }
    ana = _user(11, "Ana María", "Pérez")
    assert inf._slots_firma_del_usuario(cfg, 11, ana, "CC-GER-001") == ["elaboro"]
    parecido = _user(11, "Pedro", "González")
    assert (
        inf._slot_firma_pendiente(
            {"elaboro_usuario_id": None, "elaboro_nombre": "Pedro Gómez"},
            11,
            parecido,
            "CC-SEM-002",
            set(),
        )
        is None
    )


def _celda(html: str, etiqueta: str) -> str:
    """Columna del bloque, incluida la tabla interna de la imagen."""
    i = html.find(etiqueta)
    if i < 0:
        raise AssertionError(f"sin celda {etiqueta}")
    resto = html[i:]
    cortes = []
    for otra in ("Elaboró:", "Revisó:", "Aprobó:"):
        if otra == etiqueta:
            continue
        j = resto.find(otra)
        if j > 0:
            cortes.append(j)
    fin = min(cortes) if cortes else len(resto)
    return resto[:fin]


def _bloque(inf, *, elaboro=None, reviso=None, aprobo=None, subcontratista=False) -> str:
    return inf._html_mem002_bloque_firmas(
        {"razon_social": "Subcontratista SAS", "nombre_contacto": "Representante Sub"},
        _cfg(),
        elaboro,
        reviso,
        aprobo_firma_data_uri=aprobo,
        aprobo_interventoria_desde_config=not subcontratista,
    )


def test_la_imagen_queda_solo_en_el_rol_firmado_del_bloque():
    inf = _import_informes_with_stubs()
    uri_e = _firma_uri("#111111")
    uri_r = _firma_uri("#b91c1c")
    uri_a = _firma_uri("#1d4ed8")
    solo_e = _bloque(inf, elaboro=uri_e, subcontratista=True)
    assert uri_e in _celda(solo_e, "Elaboró:")
    assert "<img " not in _celda(solo_e, "Revisó:")
    aprobo_sub = _celda(solo_e, "Aprobó:")
    assert "<img " not in aprobo_sub
    assert "Representante Sub" in aprobo_sub
    solo_r = _bloque(inf, reviso=uri_r)
    assert "<img " not in _celda(solo_r, "Elaboró:")
    assert uri_r in _celda(solo_r, "Revisó:")
    assert "<img " not in _celda(solo_r, "Aprobó:")
    solo_a = _bloque(inf, aprobo=uri_a)
    assert "<img " not in _celda(solo_a, "Elaboró:")
    assert "<img " not in _celda(solo_a, "Revisó:")
    assert uri_a in _celda(solo_a, "Aprobó:")
    assert "Pedro Aprobó" in _celda(solo_a, "Aprobó:")


def _pdf_bloque(inf, html_bloque: str) -> bytes:
    html = (
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>"
        "<style>@page { size: letter landscape; margin: 12mm; } table { width: 100%; }</style>"
        f"</head><body>{html_bloque}</body></html>"
    )
    return inf._to_pdf(html)


def _rol_de_la_unica_firma(page) -> str:
    etiquetas = []
    for w in page.get_text("words"):
        texto = w[4]
        for rol in ("Elaboró", "Revisó", "Aprobó"):
            if texto.startswith(rol):
                etiquetas.append((rol, (w[0] + w[2]) / 2))
    assert {rol for rol, _ in etiquetas} == {"Elaboró", "Revisó", "Aprobó"}
    centros = []
    for bloque in page.get_text("dict")["blocks"]:
        if bloque.get("type") != 1:
            continue
        x0, y0, x1, y1 = bloque["bbox"]
        if y1 - y0 < 8:
            continue
        centros.append((x0 + x1) / 2)
    assert len(centros) == 1, centros
    return min(etiquetas, key=lambda it: abs(it[1] - centros[0]))[0]


def test_el_pdf_coloca_la_firma_en_el_rol_correspondiente():
    inf = _import_informes_with_stubs()
    ARTEFACTOS.mkdir(parents=True, exist_ok=True)
    casos = {
        "elaboro": _bloque(inf, elaboro=_firma_uri("#111111")),
        "reviso": _bloque(inf, reviso=_firma_uri("#b91c1c")),
        "aprobo": _bloque(inf, aprobo=_firma_uri("#1d4ed8")),
    }
    esperado = {"elaboro": "Elaboró", "reviso": "Revisó", "aprobo": "Aprobó"}
    for slot, bloque in casos.items():
        pdf = _pdf_bloque(inf, bloque)
        doc = pymupdf.open(stream=pdf, filetype="pdf")
        assert doc.page_count == 1
        page = doc[0]
        assert _rol_de_la_unica_firma(page) == esperado[slot]
        png = ARTEFACTOS / f"firma-ccd-{slot}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(2, 2)).save(str(png))
        assert png.stat().st_size > 1000
