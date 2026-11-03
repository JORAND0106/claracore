"""Bloque de firmas CCD: altura fija, meta Nombre–Cargo|Fecha–Hora, margen ≤5 mm."""
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


def _items(n: int) -> list[dict]:
    out = []
    for i in range(n):
        cap_n = (i % 6) + 1
        cap = f"{cap_n}. CAPITULO {cap_n}"
        num = f"{cap_n}.{i}"
        vu = 1500 + i * 3
        cant = 2
        out.append(
            {
                "capitulo": cap,
                "item_numero": num,
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


def _html(inf, items, *, el=None, re=None, ap=None, marcas=None):
    r4 = build_resumen_contrato_4cols(items=items)
    kw = {}
    if marcas:
        kw["elaboro_marca"] = marcas.get("elaboro")
        kw["reviso_marca"] = marcas.get("reviso")
        kw["aprobo_marca"] = marcas.get("aprobo")
    return inf._html_cc_mes_001_v1(
        {"numero": "ICCU-CTO-1614-2025", "contratista": "Ctor", "nit": "900", "interventoria": "Int"},
        {"numero_rpo": "1", "consecutivo": 1, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31"},
        items,
        total_costo=sum(it["valor_presente"] for it in items),
        usuario_nombre="Ana María Pérez",
        usuario_cargo="Residente",
        firma_cfg={
            "elaboro_nombre": "Juan Carlos Elaboró Nombre Largo",
            "elaboro_cargo": "Ingeniero residente de obra",
            "reviso_nombre": "María Revisó Apellido",
            "reviso_cargo": "Director de interventoría",
            "aprobo_nombre": "Pedro Aprobó",
            "aprobo_cargo": "Representante legal",
        },
        elaboro_firma_data_uri=el,
        reviso_firma_data_uri=re,
        aprobo_firma_data_uri=ap,
        resumen_4cols=r4,
        c3_value="1",
        c4_value="1",
        **kw,
    )


def _pdf(inf, html: str) -> bytes:
    return inf._acercar_firmas_pie_mes(inf._to_pdf(html))


def _firma_y_pages(inf, pdf: bytes) -> tuple[int, list[float]]:
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    ys = []
    for page in doc:
        words = page.get_text("words")
        etiquetas = [w for w in words if w[4] in ("Elaboró:", "Revisó:", "Aprobó:")]
        assert {w[4] for w in etiquetas} == {"Elaboró:", "Revisó:", "Aprobó:"}
        ys.append(min(w[1] for w in etiquetas))
        # Margen inferior visual ≤ 5 mm (pie de franja).
        bottom_edge = page.rect.height - inf._CC_MES_FIRMAS_BOTTOM_MM * _MM
        for w in etiquetas:
            assert w[3] <= bottom_edge + alto_tol(inf), w
    return doc.page_count, ys


def alto_tol(inf) -> float:
    return inf._CC_MES_FIRMAS_ALTO_MM * _MM + 2.0


def test_columna_misma_estructura_firmada_o_no():
    inf = _import_informes_with_stubs()
    bd = "border:1px solid #9ca3af"
    uri = _firma_uri()
    sin = inf._html_cc_sub_td_firma_columna(bd, "Elaboró:", "Ana", "Cargo", None)
    con = inf._html_cc_sub_td_firma_columna(
        bd,
        "Elaboró:",
        "Ana",
        "Cargo",
        uri,
        marca_nombre="Ana Firmó",
        marca_cargo="Residente",
        marca_fecha="03/11/2026",
        marca_hora="14:30",
    )
    assert 'class="ccd-firma-slot-stack"' in sin
    assert 'class="ccd-firma-slot-stack"' in con
    assert 'class="ccd-firma-img-cage"' in sin
    assert 'class="ccd-firma-img-cage"' in con
    assert 'class="ccd-firma-meta"' in sin
    assert 'class="ccd-firma-meta"' in con
    assert "<img " not in sin
    assert "<img " in con
    assert "Ana Firmó – Residente | 03/11/2026 – 14:30" in con
    assert "Ana – Cargo" in sin
    # Misma jaula de altura (BOX_PT) en ambos.
    assert f"height:{inf._CCD_FIRMA_BOX_PT}" in sin
    assert f"height:{inf._CCD_FIRMA_BOX_PT}" in con


def test_meta_texto_helper():
    inf = _import_informes_with_stubs()
    t = inf._html_ccd_firma_meta_texto(
        firmado=True,
        nombre_cfg="Cfg",
        cargo_cfg="CfgCargo",
        marca_nombre="Luis Pérez",
        marca_cargo="Director",
        marca_fecha="01/02/2026",
        marca_hora="09:15",
    )
    assert t == "Luis Pérez – Director | 01/02/2026 – 09:15"
    t2 = inf._html_ccd_firma_meta_texto(
        firmado=False, nombre_cfg="Cfg", cargo_cfg="CfgCargo"
    )
    assert t2 == "Cfg – CfgCargo"


def test_pdf_mismo_conteo_y_posicion_sin_una_todas():
    inf = _import_informes_with_stubs()
    items = _items(36)
    uri = _firma_uri()
    marcas = {
        "elaboro": ("Luis Elaboró", "Residente", "03/11/2026", "10:00"),
        "reviso": ("María Revisó", "Director", "03/11/2026", "11:00"),
        "aprobo": ("Pedro Aprobó", "Rep. legal", "03/11/2026", "12:00"),
    }
    html0 = _html(inf, items)
    html1 = _html(inf, items, el=uri, marcas={"elaboro": marcas["elaboro"]})
    html3 = _html(
        inf,
        items,
        el=uri,
        re=uri,
        ap=uri,
        marcas=marcas,
    )
    # Estructura fija en el bloque de firmas (misma jaula/meta por columna).
    # Contar fuera de data-URI: el base64 puede contener la misma cadena por azar.
    import re

    def _pie_sin_data_uri(html: str) -> str:
        pie = html.split('id="firmasFooter"', 1)[1]
        return re.sub(r'src="data:image/[^"]+"', 'src=""', pie)

    pie0 = _pie_sin_data_uri(html0)
    pie3 = _pie_sin_data_uri(html3)
    assert pie0.count('class="ccd-firma-img-cage"') == pie3.count('class="ccd-firma-img-cage"') == 3
    assert pie0.count('class="ccd-firma-meta"') == pie3.count('class="ccd-firma-meta"') == 3
    assert "Luis Elaboró – Residente | 03/11/2026 – 10:00" in html1
    assert "Luis Elaboró – Residente | 03/11/2026 – 10:00" in html3
    assert "María Revisó – Director | 03/11/2026 – 11:00" in html3
    assert "Pedro Aprobó – Rep. legal | 03/11/2026 – 12:00" in html3

    pdf0 = _pdf(inf, html0)
    pdf1 = _pdf(inf, html1)
    pdf3 = _pdf(inf, html3)
    n0, y0 = _firma_y_pages(inf, pdf0)
    n1, y1 = _firma_y_pages(inf, pdf1)
    n3, y3 = _firma_y_pages(inf, pdf3)
    assert n0 == n1 == n3
    assert len(y0) == len(y1) == len(y3) == n0
    for a, b, c in zip(y0, y1, y3):
        assert abs(a - b) <= 1.5, (a, b)
        assert abs(a - c) <= 1.5, (a, c)

    # Datos visibles en el PDF firmado.
    doc = pymupdf.open(stream=pdf3, filetype="pdf")
    texto = "\n".join(page.get_text() for page in doc)
    assert "Luis Elaboró" in texto
    assert "03/11/2026" in texto
    assert "10:00" in texto or "10:00" in texto.replace(" ", "")


def test_margen_inferior_frame_max_5mm():
    inf = _import_informes_with_stubs()
    assert inf._CC_MES_FIRMAS_BOTTOM_MM <= 5.0
    html = _html(inf, _items(8))
    assert f"bottom: {inf._CC_MES_FIRMAS_BOTTOM_MM:.1f}mm" in html
    assert "margin: 4.0mm 7mm" in html
