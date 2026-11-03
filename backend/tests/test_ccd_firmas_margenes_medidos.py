"""Evidencia medida en PDF: márgenes ≤5 mm, altura firmas fija, sin huérfanos."""
from __future__ import annotations

import base64
import io
import sys
from types import ModuleType, SimpleNamespace

import pymupdf
from PIL import Image, ImageDraw

from acta_mes_conciliacion import build_resumen_contrato_4cols
from corte_sub_conciliacion import valor_por_cantidad_vu

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


def _firma_uri() -> str:
    img = Image.new("RGBA", (360, 100), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.line([(8, 70), (70, 20), (140, 80), (220, 18), (340, 60)], fill=(0, 0, 0, 255), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _items_mes(n: int) -> list[dict]:
    out = []
    for i in range(n):
        vu = 1500 + i * 3
        cant = 2
        out.append(
            {
                "capitulo": f"{(i % 6) + 1}. CAPITULO {(i % 6) + 1}",
                "item_numero": f"{(i % 6) + 1}.{i}",
                "item_descripcion": f"FILA-{i:03d} descripcion de obra para el informe mensual",
                "unidad": "ML",
                "vlr_unitario": vu,
                "vlr_unitario_sub": vu,
                "cantidad": cant,
                "costo_directo": valor_por_cantidad_vu(cant, vu),
                "cant_actualizadas": 10,
                "valor_actualizadas": valor_por_cantidad_vu(10, vu),
                "cant_presente": cant,
                "valor_presente": valor_por_cantidad_vu(cant, vu),
                "cant_acumulado": cant,
                "valor_acumulado": valor_por_cantidad_vu(cant, vu),
                "cant_saldo": 8,
                "valor_saldo": valor_por_cantidad_vu(8, vu),
            }
        )
    return out


def _regs_mes002(*, n_tramos: int = 7, per: int = 4) -> list[dict]:
    out = []
    num = 1
    for t in range(1, n_tramos + 1):
        for k in range(per):
            out.append(
                {
                    "numero_registro": num,
                    "tramo": f"TRAMO {t}",
                    "abscisa_inicial": t * 100 + k,
                    "abscisa_final": t * 100 + k + 1,
                    "cantidad": 1.5,
                    "cantidad_total": 1.5,
                    "longitud": 1,
                    "ancho": 1,
                    "espesor": 0.1,
                    "observacion": "Obs corta" if k % 2 == 0 else ("X" * 90),
                    "infraestructura": "Cuneta",
                    "item_numero": "1.1",
                    "unidad": "M3",
                    "capitulo": "1. PRELIMINARES",
                }
            )
            num += 1
    return out


def _medir(pdf: bytes) -> list[dict]:
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    out = []
    for i, page in enumerate(doc, start=1):
        ph = page.rect.height
        words = page.get_text("words")
        assert words, f"p{i} vacía"
        top_mm = min(w[1] for w in words) / _MM
        etiq = [w for w in words if w[4] in ("Elaboró:", "Revisó:", "Aprobó:")]
        assert etiq, f"p{i} sin firmas"
        fy0 = min(w[1] for w in etiq)
        pie = [w for w in words if w[1] >= fy0 - 0.5]
        fy1 = max(w[3] for w in pie)
        above = [w for w in words if w[3] < fy0 - 1]
        txt_above = " ".join(w[4] for w in above)
        out.append(
            {
                "n": i,
                "top_mm": round(top_mm, 2),
                "under_firma_mm": round((ph - fy1) / _MM, 2),
                "firma_h_mm": round((fy1 - fy0) / _MM, 2),
                "solo_firmas": not bool(txt_above.strip()),
                "tiene_total": "CANTIDAD" in txt_above and "TOTAL" in txt_above,
                "tiene_tramo": "tramo" in txt_above.lower() or "TRAMO" in txt_above,
                "tiene_footer": "institucional" in txt_above.lower(),
                "tiene_detalle": "DETALLE" in txt_above or "FILA-" in txt_above or "N°" in txt_above,
            }
        )
    return out


def _pdf_mes001(inf, items, *, el=None, re=None, ap=None) -> bytes:
    cfg = {
        "elaboro_nombre": "Juan Elaboró",
        "elaboro_cargo": "Residente",
        "reviso_nombre": "María Revisó",
        "reviso_cargo": "Director",
        "aprobo_nombre": "Pedro Aprobó",
        "aprobo_cargo": "Rep legal",
    }
    html = inf._html_cc_mes_001_v1(
        {"numero": "X", "contratista": "C", "nit": "1", "interventoria": "I"},
        {"numero_rpo": "1", "consecutivo": 1, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31"},
        items,
        total_costo=sum(it["valor_presente"] for it in items),
        usuario_nombre="U",
        usuario_cargo="C",
        firma_cfg=cfg,
        elaboro_firma_data_uri=el,
        reviso_firma_data_uri=re,
        aprobo_firma_data_uri=ap,
        resumen_4cols=build_resumen_contrato_4cols(items=items),
        c3_value="1",
        c4_value="1",
    )
    return inf._acercar_firmas_pie_mes(inf._to_pdf(html))


def _pdf_mes002(inf, regs, *, el=None, re=None, ap=None) -> bytes:
    cfg = {
        "elaboro_nombre": "Juan Elaboró",
        "elaboro_cargo": "Residente",
        "reviso_nombre": "María Revisó",
        "reviso_cargo": "Director",
        "aprobo_nombre": "Pedro Aprobó",
        "aprobo_cargo": "Rep legal",
    }
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
        {"numero_rpo": 1, "consecutivo": 1, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31"},
    )
    sub, corte = inf._sub_corte_dummy_memoria()
    firmas = inf._html_mem002_bloque_firmas(
        sub,
        cfg,
        el,
        re,
        aprobo_firma_data_uri=ap,
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
        elaboro_firma_data_uri=el,
        reviso_firma_data_uri=re,
        conc_meta=conc,
        aprobo_firma_data_uri=ap,
        aprobo_interventoria_desde_config=True,
        pie_fotos_contexto="Acta RPO 1",
        firmas_pie=True,
        emitir_firmas=False,
    )
    html = inf._wrap_memoria_item_html(inner + firmas, "", firmas_pie=True)
    return inf._acercar_firmas_pie_mes(inf._to_pdf(html))


def test_mes001_margenes_y_altura_fija_tres_estados():
    inf = _import_informes_with_stubs()
    uri = _firma_uri()
    items = _items_mes(40)
    m0 = _medir(_pdf_mes001(inf, items))
    m1 = _medir(_pdf_mes001(inf, items, el=uri))
    m3 = _medir(_pdf_mes001(inf, items, el=uri, re=uri, ap=uri))
    assert len(m0) == len(m1) == len(m3)
    for a, b, c in zip(m0, m1, m3):
        assert a["top_mm"] <= 5.05, a
        assert b["top_mm"] <= 5.05, b
        assert c["top_mm"] <= 5.05, c
        assert a["under_firma_mm"] <= 5.05, a
        assert b["under_firma_mm"] <= 5.05, b
        assert c["under_firma_mm"] <= 5.05, c
        assert abs(a["firma_h_mm"] - b["firma_h_mm"]) <= 0.35
        assert abs(a["firma_h_mm"] - c["firma_h_mm"]) <= 0.35
        assert not a["solo_firmas"] and not b["solo_firmas"] and not c["solo_firmas"]


def test_mes002_item_1_1_sin_huerfanos_y_altura_fija():
    inf = _import_informes_with_stubs()
    uri = _firma_uri()
    regs = _regs_mes002()
    m0 = _medir(_pdf_mes002(inf, regs))
    m1 = _medir(_pdf_mes002(inf, regs, el=uri))
    m3 = _medir(_pdf_mes002(inf, regs, el=uri, re=uri, ap=uri))
    assert len(m0) == len(m1) == len(m3)
    for pages in (m0, m1, m3):
        for p in pages:
            assert p["top_mm"] <= 5.05, p
            assert p["under_firma_mm"] <= 5.05, p
            assert not p["solo_firmas"], p
            # Total/leyenda nunca solos: si hay total, debe haber tramo o detalle.
            if p["tiene_total"] or p["tiene_footer"]:
                assert p["tiene_tramo"] or p["tiene_detalle"], p
        assert abs(pages[0]["firma_h_mm"] - pages[-1]["firma_h_mm"]) <= 0.35
    assert abs(m0[0]["firma_h_mm"] - m1[0]["firma_h_mm"]) <= 0.35
    assert abs(m0[0]["firma_h_mm"] - m3[0]["firma_h_mm"]) <= 0.35


def test_constantes_margen_inferior_frame():
    inf = _import_informes_with_stubs()
    assert inf._CC_MES_FIRMAS_BOTTOM_MM <= 5.0
    assert inf._CC_MES_FIRMAS_ALTO_MM <= 16.0
    assert inf._CC_MES_FIRMAS_ALTO_MM >= 12.0
    assert inf._acercar_firmas_pie_mes(b"%PDF-1.4") == b"%PDF-1.4"
