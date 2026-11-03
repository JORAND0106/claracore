"""Registro fotográfico/gráfico: cada hoja completa (encabezado+grilla 3×2+firmas)."""
from __future__ import annotations

import base64
import io
import sys
from types import ModuleType, SimpleNamespace

import pymupdf
from PIL import Image, ImageDraw

_MM = 72.0 / 25.4


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


def _jpeg_uri(seed: int = 0) -> str:
    img = Image.new("RGB", (320, 240), (40 + seed * 12, 90, 140))
    draw = ImageDraw.Draw(img)
    draw.rectangle([12, 12, 308, 228], outline=(0, 0, 0), width=3)
    draw.line([(20, 200), (160, 40), (300, 180)], fill=(255, 255, 255), width=4)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=75)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _regs_mes002_item_1_1(*, n_fotos: int = 7, n_graf: int = 3) -> list[dict]:
    out = []
    for i in range(1, max(n_fotos, n_graf) + 1):
        out.append(
            {
                "numero_registro": i,
                "tramo": f"TRAMO {(i - 1) // 3 + 1}",
                "abscisa_inicial": 100 + i,
                "abscisa_final": 101 + i,
                "cantidad": 1.5,
                "cantidad_total": 1.5,
                "longitud": 1,
                "ancho": 1,
                "espesor": 0.1,
                "observacion": f"Obs media {i}",
                "infraestructura": "Cuneta",
                "item_numero": "1.1",
                "unidad": "M3",
                "capitulo": "1. PRELIMINARES",
                "foto_url": _jpeg_uri(i) if i <= n_fotos else None,
                "foto_numero": i if i <= n_fotos else None,
                "grafico_url": _jpeg_uri(100 + i) if i <= n_graf else None,
                "grafico_numero": i if i <= n_graf else None,
            }
        )
    return out


def _pdf_mes002(inf, regs) -> bytes:
    contrato = {
        "numero": "ICCU-CTO-1614-2025",
        "objeto": "Objeto de prueba Acta RPO 1 item 1.1",
        "contratista": "Ctor",
        "nit": "900",
        "interventoria": "Int",
    }
    item_info = {
        "item_numero": "1.1",
        "item_descripcion": "Excavacion item 1.1",
        "unidad": "M3",
        "capitulo": "1. PRELIMINARES",
    }
    conc = inf._conc_meta_cc_mes_002(
        contrato,
        {
            "numero_rpo": 1,
            "consecutivo": 1,
            "fecha_inicio": "2026-01-01",
            "fecha_fin": "2026-01-31",
        },
    )
    sub, corte = inf._sub_corte_dummy_memoria()
    cfg = {
        "elaboro_nombre": "Juan Elaboró",
        "elaboro_cargo": "Residente",
        "reviso_nombre": "María Revisó",
        "reviso_cargo": "Director",
        "aprobo_nombre": "Pedro Aprobó",
        "aprobo_cargo": "Rep legal",
    }
    firmas = inf._html_mem002_bloque_firmas(
        sub,
        cfg,
        None,
        None,
        aprobo_interventoria_desde_config=True,
        footer_frame=True,
    )
    inner = inf._html_memoria_item_body(
        contrato,
        sub,
        corte,
        item_info,
        regs,
        "U",
        "C",
        firma_cfg=cfg,
        conc_meta=conc,
        aprobo_interventoria_desde_config=True,
        pie_fotos_contexto="Acta RPO 1",
        firmas_pie=True,
        emitir_firmas=False,
    )
    html = inf._wrap_memoria_item_html(inner + firmas, "", firmas_pie=True)
    assert f"height:{inf._MEMORIA_MEDIA_BOX_H_CM:.2f}cm" in html
    assert inf._MEMORIA_MEDIA_FOTOS_PER_PAGE == 6
    assert inf._MEMORIA_MEDIA_FOTOS_COLS == 3
    return inf._acercar_firmas_pie_mes(inf._to_pdf(html))


def _clasificar_paginas(pdf: bytes) -> list[dict]:
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    out = []
    for i, page in enumerate(doc, start=1):
        words = page.get_text("words")
        txt = page.get_text()
        etiq = [w for w in words if w[4] in ("Elaboró:", "Revisó:", "Aprobó:")]
        n_imgs = len(page.get_images(full=True))
        is_foto = "REGISTRO FOTOGRÁFICO" in txt or "REGISTRO FOTOGRAFICO" in txt
        is_graf = "REGISTRO GRÁFICO" in txt or "REGISTRO GRAFICO" in txt
        is_detalle = "DETALLE DE CANTIDADES" in txt or "CANTIDAD TOTAL DEL ÍTEM" in txt
        has_head = "CC-MES-002" in txt or "RESUMEN ACTIVIDADES" in txt
        out.append(
            {
                "n": i,
                "firmas": len(etiq) >= 3,
                "n_imgs": n_imgs,
                "foto": is_foto,
                "graf": is_graf,
                "detalle": is_detalle,
                "head": has_head,
                "huerfana_media": bool(
                    has_head
                    and not is_detalle
                    and n_imgs == 0
                    and not is_foto
                    and not is_graf
                ),
            }
        )
    return out


def test_constantes_caja_media_cabe_con_firmas():
    inf = _import_informes_with_stubs()
    # Debe ser menor que el 6.85 cm que dejaba hojas huérfanas tras la franja de firmas.
    assert 4.5 <= inf._MEMORIA_MEDIA_BOX_H_CM <= 5.8
    assert inf._MEMORIA_MEDIA_BOX_H_PT < 170
    assert inf._MEMORIA_MEDIA_FOTOS_PER_PAGE == 6
    assert inf._MEMORIA_MEDIA_FOTOS_COLS == 3


def test_mes002_item_1_1_registro_foto_grafico_sin_huerfanas():
    """Evidencia: N páginas media = ceil(N/6); ninguna hoja solo encabezado+firmas."""
    inf = _import_informes_with_stubs()
    n_fotos, n_graf = 7, 3
    regs = _regs_mes002_item_1_1(n_fotos=n_fotos, n_graf=n_graf)
    pages = _clasificar_paginas(_pdf_mes002(inf, regs))
    assert not any(p["huerfana_media"] for p in pages), pages

    foto_pages = [p for p in pages if p["foto"] and p["n_imgs"]]
    graf_pages = [p for p in pages if p["graf"] and p["n_imgs"] and not p["foto"]]
    expect_foto = (n_fotos + 5) // 6
    expect_graf = (n_graf + 5) // 6
    assert len(foto_pages) == expect_foto, (foto_pages, pages)
    assert len(graf_pages) == expect_graf, (graf_pages, pages)
    for p in foto_pages + graf_pages:
        assert p["firmas"], p
        assert p["head"], p  # encabezado completo en la misma hoja
        assert p["n_imgs"] >= 1


def test_mes002_doce_fotos_dos_paginas_completas():
    inf = _import_informes_with_stubs()
    regs = _regs_mes002_item_1_1(n_fotos=12, n_graf=0)
    pages = _clasificar_paginas(_pdf_mes002(inf, regs))
    assert not any(p["huerfana_media"] for p in pages), pages
    foto_pages = [p for p in pages if p["foto"] and p["n_imgs"]]
    assert len(foto_pages) == 2
    for p in foto_pages:
        assert p["firmas"] and p["head"]
        assert p["n_imgs"] == 6
