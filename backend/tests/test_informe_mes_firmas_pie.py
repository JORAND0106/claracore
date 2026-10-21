"""Firmas del informe mensual en la franja inferior de cada página."""
from __future__ import annotations

import base64
import io
import sys
from types import ModuleType, SimpleNamespace

import pymupdf
from PIL import Image, ImageDraw

from acta_mes_conciliacion import build_resumen_contrato_4cols
from corte_sub_conciliacion import valor_por_cantidad_vu
from informe_mes_items import CAPITULO_NO_PREVISTOS, agrupar_items_np_en_capitulo

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
    img = Image.new("RGB", (360, 100), "white")
    draw = ImageDraw.Draw(img)
    draw.line([(8, 70), (70, 20), (140, 80), (220, 18), (340, 60)], fill="black", width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _items(n: int) -> list[dict]:
    out = []
    for i in range(n):
        cap_n = (i % 6) + 1
        cap = f"{cap_n}. CAPITULO {cap_n}"
        num = f"NP-{i:03d}" if i % 4 == 0 else f"{cap_n}.{i}"
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


def _html(inf, items, *, uri=None):
    r4 = build_resumen_contrato_4cols(items=items)
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
        elaboro_firma_data_uri=uri,
        reviso_firma_data_uri=uri,
        aprobo_firma_data_uri=uri,
        resumen_4cols=r4,
        c3_value="1",
        c4_value="1",
    )


def _banda(inf, page_h: float) -> tuple[float, float]:
    top = page_h - (inf._CC_MES_FIRMAS_BOTTOM_MM + inf._CC_MES_FIRMAS_ALTO_MM) * _MM
    bottom = page_h - inf._CC_MES_FIRMAS_BOTTOM_MM * _MM
    return top, bottom


_ETIQUETAS_FIRMA = ("Elaboró:", "Revisó:", "Aprobó:")


def _pdf_mes(inf, items, *, uri=None) -> bytes:
    return inf._acercar_firmas_pie_mes(inf._to_pdf(_html(inf, items, uri=uri)))


def _revisar_pdf(inf, pdf: bytes, *, items: list[dict], con_imagen: bool) -> dict:
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    assert doc.page_count >= 1
    marcas = [f"FILA-{i:03d}" for i in range(len(items))]
    vistos: dict[str, int] = {}
    paginas = []
    alto_franja = inf._CC_MES_FIRMAS_ALTO_MM * _MM
    for n, page in enumerate(doc, start=1):
        top, bottom = _banda(inf, page.rect.height)
        words = page.get_text("words")
        etiquetas = [w for w in words if w[4] in _ETIQUETAS_FIRMA]
        assert {w[4] for w in etiquetas} == set(_ETIQUETAS_FIRMA), f"p{n} sin las tres firmas"
        firma_top = min(w[1] for w in etiquetas)
        contenido = []
        pie = []
        for w in words:
            y0, y1, text = w[1], w[3], w[4]
            if y0 < firma_top - 0.8:
                contenido.append((y0, y1, text))
                assert y1 <= firma_top + 1.0, f"p{n} {text!r} entra en las firmas"
            else:
                pie.append((y0, y1, text))
                assert y1 <= page.rect.height - 2, f"p{n} {text!r} se sale de la hoja"
        texto_pie = " ".join(t for _, _, t in pie)
        texto_cuerpo = " ".join(t for _, _, t in contenido)
        for etiqueta in _ETIQUETAS_FIRMA:
            assert etiqueta in texto_pie, f"p{n} sin {etiqueta} junto al cierre"
        assert texto_cuerpo.strip(), f"p{n} solo tiene el bloque de firmas"
        cierre = max(y1 for _, y1, _ in contenido)
        hueco = firma_top - cierre
        assert 1.0 * _MM <= hueco <= inf._CC_MES_FIRMAS_HUECO_MAX_MM * _MM, (
            f"p{n} deja {hueco / _MM:.1f} mm entre el cierre y las firmas"
        )
        # Hoja llena: las firmas siguen en la franja inferior, no suben.
        if cierre >= top - inf._CC_MES_FIRMAS_HUECO_MAX_MM * _MM:
            assert firma_top >= top - 2.0, f"p{n} subió las firmas de una hoja llena"
            for _, y1, text in pie:
                assert y1 <= bottom + 1.5, f"p{n} {text!r} se sale del pie"
        if "Período" in texto_cuerpo or "Periodo" in texto_cuerpo:
            assert any(
                token in texto_cuerpo
                for token in ("ÍTEM", "RESUMEN", "Gran", "Costo", "Subtotal", "CONTRATO", "FILA-")
            ), f"p{n} solo trae la línea de período y las firmas"
        assert any(
            token in texto_cuerpo
            for token in ("ÍTEM", "RESUMEN", "CONTRATO", "Subtotal", "Costo", "FILA-", "Gran")
        ), f"p{n} sin contenido de informe: {texto_cuerpo[:180]!r}"
        if n > 1 and "FILA-" in texto_cuerpo:
            assert "ÍTEM" in texto_cuerpo and "DESCRIPCIÓN" in texto_cuerpo
        for marca in marcas:
            if marca in texto_cuerpo:
                vistos[marca] = vistos.get(marca, 0) + 1
        imgs = []
        for b in page.get_text("dict")["blocks"]:
            if b.get("type") != 1:
                continue
            x0, y0, x1, y1 = b["bbox"]
            if y1 - y0 < 18:
                continue
            imgs.append((x0, y0, x1, y1))
        if con_imagen:
            assert len(imgs) == 3, f"p{n} imágenes de firma={len(imgs)}"
            for x0, y0, x1, y1 in imgs:
                alto = y1 - y0
                assert 22 <= alto <= 28, f"p{n} imagen de firma encogida o estirada ({alto:.1f}pt)"
                assert y0 >= firma_top - 2, f"p{n} imagen fuera del bloque de firmas"
                assert y1 <= firma_top + alto_franja + 6, f"p{n} imagen por debajo de la franja"
                if firma_top < top - 8:
                    assert y0 < top - 8, f"p{n} la imagen de firma se quedó en el pie vacío"
        paginas.append(
            {"n": n, "cuerpo": texto_cuerpo[:80], "hueco_mm": round(hueco / _MM, 1), "firma_y": firma_top}
        )
    for marca in marcas:
        assert vistos.get(marca) == 1, f"{marca} aparece {vistos.get(marca)} veces"
    return {"pages": doc.page_count, "detalle": paginas}


def test_subcontratista_conserva_firmas_en_el_flujo():
    inf = _import_informes_with_stubs()
    html = inf._html_cc_sub_v1_plain(
        {"numero": "C-1", "contratista": "Ctor", "nit": "1", "interventoria": "Int"},
        {"razon_social": "Sub", "nombre_contacto": "Ana"},
        {"consecutivo": 1, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-31"},
        _items(2),
        100.0,
        "Tester",
        "Cargo",
    )
    assert 'id="firmasFooter"' not in html
    assert "@frame" not in html
    assert "-pdf-frame-content" not in html
    assert "@page { size: letter landscape; margin: 6mm 7mm; }" in html
    assert "page-break-inside: avoid" in html
    assert "<pdf:nextpage" not in html.lower()


def test_mensual_reserva_franja_y_no_parte_filas():
    inf = _import_informes_with_stubs()
    uri = _firma_uri()
    items = _items(48)
    html = _html(inf, items, uri=uri)
    assert html.count('id="firmasFooter"') == 1
    assert "-pdf-frame-content: firmasFooter" in html
    assert f"height: {inf._CC_MES_FIRMAS_ALTO_MM:.1f}mm" in html
    assert "<pdf:nextpage" not in html.lower()
    assert html.count('class="cc001-tabla-items"') == 1
    assert "display: table-header-group" in html
    assert 'class="ccd-firma-slot-hdr">Aprobó:' in html
    assert html.count("<img ") == 3
    # El reemplazo de Aprobó conserva el nombre configurado, dentro del pie.
    pie = html.split('id="firmasFooter"', 1)[1]
    assert "Pedro Aprobó" in pie
    assert "Representante legal" in pie
    info = _revisar_pdf(inf, _pdf_mes(inf, items, uri=uri), items=items, con_imagen=True)
    assert info["pages"] >= 2
    assert any(p["hueco_mm"] <= inf._CC_MES_FIRMAS_HUECO_OBJETIVO_MM + 0.5 for p in info["detalle"])


def test_mensual_con_y_sin_agrupar_np():
    inf = _import_informes_with_stubs()
    items = _items(36)
    agrupados = agrupar_items_np_en_capitulo(items)
    html_no = _html(inf, items)
    html_si = _html(inf, agrupados)
    assert f"Subtotal {CAPITULO_NO_PREVISTOS}" not in html_no
    assert f"Subtotal {CAPITULO_NO_PREVISTOS}" in html_si
    marca = "RESUMEN DE CONCILIACIÓN"
    assert html_no.split(marca, 1)[1] == html_si.split(marca, 1)[1]
    for cuadro in (items, agrupados):
        info = _revisar_pdf(inf, _pdf_mes(inf, cuadro), items=cuadro, con_imagen=False)
        assert info["pages"] >= 2
        assert max(p["hueco_mm"] for p in info["detalle"]) <= inf._CC_MES_FIRMAS_HUECO_MAX_MM


def test_ninguna_longitud_deja_una_hoja_solo_con_firmas():
    inf = _import_informes_with_stubs()
    for n in (1, 8, 17, 29):
        items = _items(n)
        info = _revisar_pdf(inf, _pdf_mes(inf, items), items=items, con_imagen=False)
        assert info["pages"] >= 1
        assert max(p["hueco_mm"] for p in info["detalle"]) <= inf._CC_MES_FIRMAS_HUECO_MAX_MM
