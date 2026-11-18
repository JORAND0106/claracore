"""Excel de calidad y PDF de recibos (ICONTEC, continuo) de una caja menor."""
from __future__ import annotations

import io
from typing import Iterable, List

from caja_menor_calc import (
    FORMATO_CALIDAD,
    etiqueta_estado,
    fmt_fecha_co,
    fmt_pct,
    indicadores,
)

_CM = 72 / 2.54
# NTC 1486: margen izquierdo más amplio, derecho menor. El contenido va seguido,
# sin dejar una página a medias antes del siguiente recibo.
_MARGEN_IZQ = 3 * _CM
_MARGEN_DER = 2 * _CM
_MARGEN_SUP = 3 * _CM
_MARGEN_INF = 2.5 * _CM


def fmt_cop(valor: int) -> str:
    n = int(valor or 0)
    signo = "-" if n < 0 else ""
    return signo + "$ " + f"{abs(n):,}".replace(",", ".")


def logo_png_bytes() -> bytes:
    """Logo a color de Caja Menor para el Excel. No es el de Contabilidad."""
    from PIL import Image, ImageDraw

    im = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((12, 48, 148, 146), radius=18, fill=(14, 116, 144, 255))
    d.rounded_rectangle((28, 68, 132, 128), radius=10, fill=(240, 249, 255, 255))
    d.ellipse((58, 78, 102, 122), fill=(245, 158, 11, 255))
    d.rounded_rectangle((46, 22, 114, 58), radius=8, fill=(5, 150, 105, 255))
    d.rectangle((70, 22, 90, 40), fill=(16, 185, 129, 255))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _encabezado_calidad(ws, n_cols: int) -> None:
    from openpyxl.drawing.image import Image as XLImage
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    thin = Border(
        left=Side(style="thin", color="0F2942"),
        right=Side(style="thin", color="0F2942"),
        top=Side(style="thin", color="0F2942"),
        bottom=Side(style="thin", color="0F2942"),
    )
    fill = PatternFill("solid", fgColor="0E7490")
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    titulo_font = Font(name="Calibri", bold=True, size=14, color="FFFFFF")
    lado_font = Font(name="Calibri", bold=True, size=9, color="FFFFFF")

    for col in range(1, n_cols + 1):
        cell = ws.cell(1, col, "")
        cell.fill = fill
        cell.border = thin
        cell.alignment = center

    titulo_hasta = max(2, n_cols - 2)
    ws.merge_cells(start_row=1, start_column=2, end_row=1, end_column=titulo_hasta)
    if titulo_hasta < n_cols:
        ws.merge_cells(start_row=1, start_column=titulo_hasta + 1, end_row=1, end_column=n_cols)

    titulo = ws.cell(1, 2, FORMATO_CALIDAD["nombre_mayus"])
    titulo.font = titulo_font
    titulo.alignment = center

    calidad = ws.cell(
        1,
        titulo_hasta + 1,
        f"Formato {FORMATO_CALIDAD['codigo']}\nVersión {FORMATO_CALIDAD['version']}",
    )
    calidad.font = lado_font
    calidad.alignment = center

    try:
        logo_buf = io.BytesIO(logo_png_bytes())
        ws._caja_menor_logo = logo_buf
        img = XLImage(logo_buf)
        img.width = 46
        img.height = 46
        ws.add_image(img, "A1")
    except Exception:
        ws.cell(1, 1, "CM").font = lado_font
    ws.row_dimensions[1].height = 48
    ws.column_dimensions["A"].width = 14
    for col in range(2, n_cols + 1):
        ws.column_dimensions[get_column_letter(col)].width = 16


def build_excel(
    *,
    caja: dict,
    contrato: dict,
    ingresos: Iterable[dict],
    gastos: Iterable[dict],
    enlace_por_gasto: dict,
) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    gastos = sorted(list(gastos or []), key=lambda g: int(g.get("consecutivo") or 0))
    ingresos = list(ingresos or [])
    ind = indicadores(caja.get("saldo_trasladado"), ingresos, gastos)
    headers = [
        "#",
        "Fecha",
        "Razón Social",
        "NIT",
        "Descripción del gasto",
        "Observaciones",
        "Documento No.",
        "Centro de costos",
        "Valor bruto",
        "IVA",
        "Retenciones",
        "Impuesto al consumo",
        "Otros deducibles",
        "Valor neto",
        "Soporte",
        "Estado",
    ]
    n_cols = len(headers)
    wb = Workbook()
    ws = wb.active
    ws.title = f"Caja {int(caja.get('numero') or 0)}"[:31]
    _encabezado_calidad(ws, n_cols)

    thin = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )
    label_font = Font(name="Calibri", bold=True, size=9, color="0F2942")
    body_font = Font(name="Calibri", size=9, color="0F2942")
    head_fill = PatternFill("solid", fgColor="E0F2FE")
    total_fill = PatternFill("solid", fgColor="CCFBF1")
    left = Alignment(horizontal="left", vertical="center", wrap_text=True)
    right = Alignment(horizontal="right", vertical="center")

    def par(fila, col_l, texto_l, col_v, valor):
        a = ws.cell(fila, col_l, texto_l)
        a.font = label_font
        a.border = thin
        b = ws.cell(fila, col_v, valor if valor not in (None, "") else "—")
        b.font = body_font
        b.border = thin
        b.alignment = left

    par(3, 1, "Empresa", 2, contrato.get("contratista"))
    par(3, 4, "NIT", 5, contrato.get("nit"))
    par(3, 7, "Responsable", 8, caja.get("responsable_nombre"))
    par(3, 10, "Caja No.", 11, caja.get("numero"))
    par(4, 1, "Periodo desde", 2, fmt_fecha_co(caja.get("periodo_desde")) or "—")
    par(4, 4, "Periodo hasta", 5, fmt_fecha_co(caja.get("periodo_hasta")) or "—")
    par(4, 7, "Estado", 8, etiqueta_estado(caja.get("estado")))
    par(5, 1, "Saldo trasladado", 2, fmt_cop(ind["saldo_trasladado"]))
    par(5, 4, "Consignaciones", 5, fmt_cop(ind["consignaciones"]))
    par(5, 7, "Fondo establecido", 8, fmt_cop(ind["fondo_establecido"]))
    par(6, 1, "Gastos del periodo", 2, fmt_cop(ind["gastos_periodo"]))
    par(6, 4, "Gasto actual", 5, fmt_pct(ind["gasto_actual"]))
    par(6, 7, "Disponible en caja", 8, fmt_cop(ind["disponible"]))
    par(7, 1, "Observaciones", 2, caja.get("observaciones") or "—")
    ws.merge_cells(start_row=7, start_column=2, end_row=7, end_column=6)
    par(7, 7, "Control", 8, caja.get("control") or "—")
    ws.merge_cells(start_row=7, start_column=8, end_row=7, end_column=11)
    for col in range(1, n_cols + 1):
        ws.cell(7, col).border = thin
        ws.cell(7, col).alignment = left

    header_row = 9
    for i, nombre in enumerate(headers, start=1):
        cell = ws.cell(header_row, i, nombre)
        cell.font = label_font
        cell.fill = head_fill
        cell.border = thin
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[header_row].height = 30
    ws.auto_filter.ref = f"A{header_row}:{get_column_letter(n_cols)}{header_row}"
    ws.freeze_panes = "A10"
    ws.auto_filter.ref = f"A{header_row}:{get_column_letter(n_cols)}{max(header_row, header_row + len(gastos))}"

    money_names = (
        "Valor bruto", "IVA", "Retenciones", "Impuesto al consumo",
        "Otros deducibles", "Valor neto",
    )
    money_cols = {headers.index(nombre) + 1 for nombre in money_names}
    col_neto = headers.index("Valor neto") + 1
    col_soporte = headers.index("Soporte") + 1
    fila = header_row + 1
    for g in gastos:
        valores = [
            g.get("consecutivo"),
            fmt_fecha_co(g.get("fecha")),
            g.get("tercero_razon_social"),
            g.get("tercero_documento"),
            g.get("descripcion"),
            g.get("observaciones") or "",
            g.get("documento_no"),
            g.get("centro_costos"),
            int(g.get("valor_bruto") or 0),
            int(g.get("iva") or 0),
            int(g.get("retenciones") or 0),
            int(g.get("impuesto_consumo") or 0),
            int(g.get("otros_deducibles") or 0),
            int(g.get("valor_neto") or 0) if g.get("estado_validacion") != "rechazado" else 0,
            "Ver recibo" if enlace_por_gasto.get(g.get("id")) or enlace_por_gasto.get(str(g.get("id"))) else "—",
            etiqueta_estado(g.get("estado_validacion")),
        ]
        for col, valor in enumerate(valores, start=1):
            cell = ws.cell(fila, col, valor)
            cell.font = body_font
            cell.border = thin
            cell.alignment = right if col in money_cols or col == 1 else left
            if col in money_cols:
                cell.number_format = '#,##0'
        url = enlace_por_gasto.get(g.get("id")) or enlace_por_gasto.get(str(g.get("id")))
        if url:
            link = ws.cell(fila, col_soporte)
            link.hyperlink = url
            link.font = Font(name="Calibri", size=9, color="0E7490", underline="single")
        if g.get("estado_validacion") == "rechazado":
            for col in range(1, n_cols + 1):
                ws.cell(fila, col).font = Font(name="Calibri", size=9, color="94A3B8", italic=True)
        fila += 1

    if not gastos:
        ws.cell(fila, 1, "Sin gastos").font = body_font
        fila += 1

    tot = ws.cell(fila, col_neto - 1, "Total")
    tot.font = label_font
    tot.fill = total_fill
    tot.border = thin
    total_cell = ws.cell(fila, col_neto, ind["gastos_periodo"])
    total_cell.font = label_font
    total_cell.fill = total_fill
    total_cell.border = thin
    total_cell.number_format = '#,##0'
    for col in range(1, n_cols + 1):
        ws.cell(fila, col).fill = total_fill
        ws.cell(fila, col).border = thin

    firma = fila + 2
    for col, titulo in ((1, "Elaboró"), (6, "Revisó"), (11, "Aprobó")):
        c = ws.cell(firma, col, titulo)
        c.font = label_font
        c.alignment = Alignment(horizontal="center")
    nombres = (
        (1, caja.get("firma_elaboro")),
        (6, caja.get("firma_reviso")),
        (11, caja.get("firma_aprobo")),
    )
    for col, nombre in nombres:
        ws.merge_cells(start_row=firma + 1, start_column=col, end_row=firma + 1, end_column=col + 3)
        cell = ws.cell(firma + 1, col, nombre or "")
        cell.font = body_font
        cell.alignment = Alignment(horizontal="center")
        ws.merge_cells(start_row=firma + 2, start_column=col, end_row=firma + 2, end_column=col + 3)
        linea = ws.cell(firma + 2, col, "________________________")
        linea.alignment = Alignment(horizontal="center")
        linea.font = body_font

    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.leftMargin = 0.5
    ws.page_setup.rightMargin = 0.4
    ws.page_setup.topMargin = 0.5
    ws.page_setup.bottomMargin = 0.4
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.horizontalCentered = True
    ws.oddHeader.center.text = FORMATO_CALIDAD["nombre_mayus"]
    ws.oddFooter.right.text = f"{FORMATO_CALIDAD['codigo']}  Versión {FORMATO_CALIDAD['version']}"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_pdf(*, caja: dict, recibos: List[dict]) -> bytes:
    """
    Recibos en el orden del consecutivo, tamaño carta, márgenes ICONTEC.
    Si un recibo no cabe, sigue en la página siguiente sin dejar el resto en blanco.
    """
    import fitz
    from PIL import Image

    ancho, alto = fitz.paper_size("letter")
    izquierda = _MARGEN_IZQ
    derecha = ancho - _MARGEN_DER
    arriba = _MARGEN_SUP
    abajo = alto - _MARGEN_INF
    content_w = derecha - izquierda
    numero = int(caja.get("numero") or 0)
    responsable = (caja.get("responsable_nombre") or "").strip()
    marca = f"Caja menor No. {numero}  ·  {responsable}"[:110]

    doc = fitz.open()
    estado = {"page": None, "y": arriba}

    def nueva():
        pagina = doc.new_page(width=ancho, height=alto)
        pagina.insert_text(
            (izquierda, arriba - 16),
            marca,
            fontsize=8,
            fontname="helv",
            color=(0.12, 0.22, 0.32),
        )
        estado["page"] = pagina
        estado["y"] = arriba
        return pagina

    def espacio():
        return abajo - estado["y"]

    if not recibos:
        pagina = nueva()
        pagina.insert_text((izquierda, estado["y"] + 14), "Sin recibos cargados.", fontsize=11, fontname="helv")
        return doc.tobytes()

    for rec in recibos:
        if estado["page"] is None or espacio() < 36:
            nueva()
        razon = rec.get("razon_social") or rec.get("tercero") or ""
        caption = (
            f"{int(rec.get('consecutivo') or 0)}.  "
            f"{fmt_fecha_co(rec.get('fecha'))}  "
            f"Razón Social: {razon}  "
            f"{etiqueta_estado(rec.get('estado'))}"
        )
        estado["page"].insert_text(
            (izquierda, estado["y"] + 11),
            caption[:160],
            fontsize=9,
            fontname="helv",
            color=(0.1, 0.16, 0.24),
        )
        estado["y"] += 16
        nota = str(rec.get("observaciones") or "").strip()
        if nota:
            if espacio() < 16:
                nueva()
            estado["page"].insert_text(
                (izquierda, estado["y"] + 10),
                f"Observaciones: {nota}"[:180],
                fontsize=8,
                fontname="helv",
                color=(0.2, 0.28, 0.36),
            )
            estado["y"] += 14
        imagen = rec.get("imagen")
        if not imagen:
            if espacio() < 20:
                nueva()
            estado["page"].insert_text(
                (izquierda, estado["y"] + 11),
                "Soporte no disponible.",
                fontsize=9,
                fontname="helv",
            )
            estado["y"] += 20
            continue
        im = Image.open(io.BytesIO(imagen)).convert("RGB")
        dpi = 130
        target_w = max(1, int(content_w / 72 * dpi))
        ratio = target_w / float(im.width)
        target_h = max(1, int(im.height * ratio))
        im = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
        px_per_pt = dpi / 72.0
        src_y = 0
        while src_y < im.height:
            libre = espacio()
            if libre < 28:
                nueva()
                libre = espacio()
            alto_px = min(im.height - src_y, max(1, int(libre * px_per_pt)))
            crop = im.crop((0, src_y, im.width, src_y + alto_px))
            buf = io.BytesIO()
            crop.save(buf, format="JPEG", quality=82)
            alto_pt = alto_px / px_per_pt
            rect = fitz.Rect(izquierda, estado["y"], derecha, estado["y"] + alto_pt)
            estado["page"].insert_image(rect, stream=buf.getvalue())
            estado["y"] += alto_pt
            src_y += alto_px
        estado["y"] += 6
    return doc.tobytes()


def enlace_gasto(contrato_id: int, caja_id: int, gasto_id: int) -> str:
    from caja_menor_email import enlace_caja

    return f"{enlace_caja(contrato_id, caja_id)}&gasto={int(gasto_id)}"
