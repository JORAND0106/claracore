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
# Carta vertical. El margen izquierdo sigue siendo el mayor, como en NTC 1486,
# y el ancho restante alcanza para las 16 columnas sin bajar de 7.5 pt.
_MARGEN_IZQ = 2.2 * _CM
_MARGEN_DER = 1.5 * _CM
_MARGEN_SUP = 1.35 * _CM
_MARGEN_INF = 1.35 * _CM


def fmt_cop(valor: int) -> str:
    n = int(valor or 0)
    signo = "-" if n < 0 else ""
    return signo + "$ " + f"{abs(n):,}".replace(",", ".")


def bytes_imagen_url(url: str) -> bytes | None:
    """Logo del contratista: data-URI o URL. Si no se puede leer, la exportación sigue."""
    u = str(url or "").strip()
    if not u:
        return None
    if u.startswith("data:") and ";base64," in u:
        try:
            import base64

            raw = base64.b64decode(u.split(",", 1)[1])
            if raw and len(raw) > 40:
                return raw
        except Exception:
            return None
        return None
    try:
        import requests

        resp = requests.get(u, timeout=25, headers={"User-Agent": "ClaraCore-Export/1.0"})
        resp.raise_for_status()
        data = resp.content
        tipo = (resp.headers.get("content-type") or "").lower()
        if data and len(data) > 40 and ("image/" in tipo or not tipo):
            return data
    except Exception:
        return None
    return None


def _encabezado_calidad(ws, n_cols: int, logo: bytes | None, contratista: str) -> None:
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

    puesto = False
    if logo:
        try:
            logo_buf = io.BytesIO(logo)
            ws._caja_menor_logo = logo_buf
            img = XLImage(logo_buf)
            img.width = 46
            img.height = 46
            ws.add_image(img, "A1")
            puesto = True
        except Exception:
            puesto = False
    if not puesto:
        nombre = ws.cell(1, 1, (contratista or "Contratista")[:40])
        nombre.font = lado_font
        nombre.alignment = center
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
    logo: bytes | None = None,
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
    ws.sheet_view.showGridLines = False
    ws.print_options.gridLines = False
    _encabezado_calidad(ws, n_cols, logo, str(contrato.get("contratista") or ""))

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
    for fila_info in range(3, 8):
        for col in range(1, n_cols + 1):
            celda = ws.cell(fila_info, col)
            celda.border = thin
            if celda.alignment is None or not celda.alignment.wrap_text:
                celda.alignment = left

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
    centro_firma = Alignment(horizontal="center", vertical="center")
    for col, titulo in ((1, "Elaboró"), (6, "Revisó"), (11, "Aprobó")):
        c = ws.cell(firma, col, titulo)
        c.font = label_font
        c.alignment = centro_firma
    nombres = (
        (1, caja.get("firma_elaboro")),
        (6, caja.get("firma_reviso")),
        (11, caja.get("firma_aprobo")),
    )
    for col, nombre in nombres:
        ws.merge_cells(start_row=firma, start_column=col, end_row=firma, end_column=col + 3)
        ws.merge_cells(start_row=firma + 1, start_column=col, end_row=firma + 1, end_column=col + 3)
        cell = ws.cell(firma + 1, col, nombre or "")
        cell.font = body_font
        cell.alignment = centro_firma
        ws.merge_cells(start_row=firma + 2, start_column=col, end_row=firma + 2, end_column=col + 3)
        linea = ws.cell(firma + 2, col, "________________________")
        linea.alignment = centro_firma
        linea.font = body_font
        for fr in range(firma, firma + 3):
            for fc in range(col, col + 4):
                ws.cell(fr, fc).border = thin
                ws.cell(fr, fc).alignment = centro_firma

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


def build_pdf(
    *,
    caja: dict,
    contrato: dict,
    ingresos: Iterable[dict],
    gastos: Iterable[dict],
    logo: bytes | None = None,
) -> bytes:
    """
    Carta vertical: encabezado en cada página, cuadro de la caja, tabla de gastos
    y soportes a cuatro imágenes por página, cada una en un cuadro fijo.
    """
    import fitz
    from PIL import Image

    ancho, alto_pag = fitz.paper_size("letter")
    izquierda = _MARGEN_IZQ
    derecha = ancho - _MARGEN_DER
    arriba = _MARGEN_SUP
    abajo = alto_pag - _MARGEN_INF
    content_w = derecha - izquierda
    header_h = 48
    pie_h = 14
    y_contenido = arriba + header_h + 8
    y_limite = abajo - pie_h
    teal = (0.055, 0.455, 0.565)
    tinta = (0.06, 0.16, 0.26)
    muted = (0.28, 0.36, 0.44)
    borde = (0.58, 0.68, 0.76)
    relleno_tabla = (0.88, 0.95, 0.99)
    relleno_total = (0.80, 0.95, 0.93)
    blanco = (1, 1, 1)

    gastos = sorted(list(gastos or []), key=lambda g: int(g.get("consecutivo") or 0))
    ind = indicadores(caja.get("saldo_trasladado"), ingresos, gastos)
    numero = int(caja.get("numero") or 0)
    contratista = str(contrato.get("contratista") or "").strip() or "Contratista"

    doc = fitz.open()
    estado = {"page": None, "y": y_contenido}

    def nueva():
        pagina = doc.new_page(width=ancho, height=alto_pag)
        estado["page"] = pagina
        estado["y"] = y_contenido
        dibujar_encabezado(pagina)
        return pagina

    def dibujar_encabezado(pagina):
        barra = fitz.Rect(izquierda, arriba, derecha, arriba + header_h)
        pagina.draw_rect(barra, color=teal, fill=teal, width=0)
        logo_box = fitz.Rect(izquierda + 4, arriba + 5, izquierda + 46, arriba + header_h - 5)
        if logo:
            try:
                pagina.insert_image(logo_box, stream=logo, keep_proportion=True)
            except Exception:
                pagina.insert_textbox(
                    logo_box, contratista[:42], fontsize=7, fontname="hebo",
                    color=blanco, align=1,
                )
        else:
            pagina.insert_textbox(
                logo_box, contratista[:42], fontsize=7, fontname="hebo",
                color=blanco, align=1,
            )
        titulo = fitz.Rect(izquierda + 52, arriba + 8, derecha - 78, arriba + header_h - 6)
        pagina.insert_textbox(
            titulo, FORMATO_CALIDAD["nombre_mayus"], fontsize=11, fontname="hebo",
            color=blanco, align=1,
        )
        calidad = fitz.Rect(derecha - 74, arriba + 6, derecha - 4, arriba + header_h - 6)
        pagina.insert_textbox(
            calidad,
            f"Formato {FORMATO_CALIDAD['codigo']}\nVersión {FORMATO_CALIDAD['version']}",
            fontsize=8, fontname="hebo", color=blanco, align=1,
        )

    def asegurar(alto_necesario):
        if estado["page"] is None or estado["y"] + alto_necesario > y_limite:
            nueva()

    def lineas_de(texto, ancho_txt, tam, fuente="helv", tope=4):
        if texto in (None, ""):
            return [""]
        palabras = str(texto).split()
        if not palabras:
            return [""]
        salida = []
        actual = ""
        for palabra in palabras:
            prueba = (actual + " " + palabra).strip()
            if fitz.get_text_length(prueba, fontname=fuente, fontsize=tam) <= ancho_txt:
                actual = prueba
                continue
            if actual:
                salida.append(actual)
            if fitz.get_text_length(palabra, fontname=fuente, fontsize=tam) <= ancho_txt:
                actual = palabra
                continue
            trozo = ""
            for ch in palabra:
                if fitz.get_text_length(trozo + ch, fontname=fuente, fontsize=tam) <= ancho_txt:
                    trozo += ch
                else:
                    if trozo:
                        salida.append(trozo)
                    trozo = ch
            actual = trozo
        if actual:
            salida.append(actual)
        if len(salida) > tope:
            salida = salida[:tope]
            ultima = salida[-1]
            while ultima and fitz.get_text_length(ultima + "…", fontname=fuente, fontsize=tam) > ancho_txt:
                ultima = ultima[:-1]
            salida[-1] = (ultima or "…") + "…"
        return salida or ["—"]

    def cuadro_info():
        pares = [
            ("Legalización de Caja Menor No.", str(numero)),
            ("Estado", etiqueta_estado(caja.get("estado"))),
            ("Contratista", contratista),
            ("NIT", contrato.get("nit") or "—"),
            ("Responsable", caja.get("responsable_nombre") or "—"),
            ("Centro de costos", contrato.get("numero") or "—"),
            ("Periodo desde", fmt_fecha_co(caja.get("periodo_desde")) or "—"),
            ("Periodo hasta", fmt_fecha_co(caja.get("periodo_hasta")) or "—"),
            ("Fondo establecido", fmt_cop(ind["fondo_establecido"])),
            ("Saldo trasladado", fmt_cop(ind["saldo_trasladado"])),
            ("Consignaciones", fmt_cop(ind["consignaciones"])),
            ("Gastos del periodo", fmt_cop(ind["gastos_periodo"])),
            ("Gasto actual (%)", fmt_pct(ind["gasto_actual"])),
            ("Disponible en caja", fmt_cop(ind["disponible"])),
        ]
        col_w = content_w / 2
        etiqueta_w = 132
        alto_fila = 15
        filas = (len(pares) + 1) // 2
        extras = [
            ("Observaciones", caja.get("observaciones") or "—"),
            ("Control", caja.get("control") or "—"),
        ]
        alto_bloque = filas * alto_fila + len(extras) * alto_fila + 4
        asegurar(alto_bloque + 6)
        y = estado["y"]
        pagina = estado["page"]
        for i, (eti, valor) in enumerate(pares):
            col = i % 2
            fila = i // 2
            x = izquierda + col * col_w
            yy = y + fila * alto_fila
            rect = fitz.Rect(x, yy, x + col_w, yy + alto_fila)
            pagina.draw_rect(rect, color=borde, width=0.4)
            pagina.insert_text(
                (x + 3, yy + 11), eti, fontsize=7, fontname="hebo", color=tinta,
            )
            valor_lineas = lineas_de(valor, col_w - etiqueta_w - 8, 7.5, tope=1)
            pagina.insert_text(
                (x + etiqueta_w, yy + 11), valor_lineas[0], fontsize=7.5, fontname="helv", color=tinta,
            )
        y2 = y + filas * alto_fila
        for eti, valor in extras:
            rect = fitz.Rect(izquierda, y2, derecha, y2 + alto_fila)
            pagina.draw_rect(rect, color=borde, width=0.4)
            pagina.insert_text((izquierda + 3, y2 + 11), eti, fontsize=7, fontname="hebo", color=tinta)
            texto = lineas_de(valor, content_w - etiqueta_w - 8, 7.5, tope=1)[0]
            pagina.insert_text((izquierda + etiqueta_w, y2 + 11), texto, fontsize=7.5, fontname="helv", color=tinta)
            y2 += alto_fila
        estado["y"] = y2 + 10

    # Anchos en puntos para carta vertical. Fecha, NIT y valores quedan en una
    # línea. La descripción y las observaciones usan el ancho que sobra y se
    # parten dentro de la fila; la fila no salta de página.
    columnas = [
        ("#", 12, "c", 7),
        ("Fecha", 40, "l", 7),
        ("Razón Social", 34, "l", 7),
        ("NIT", 48, "l", 7),
        ("Descripción del gasto", 31, "l", 7),
        ("Observaciones", 32, "l", 7),
        ("Documento No.", 22, "l", 7),
        ("Centro de costos", 34, "l", 7),
        ("Valor bruto", 31, "r", 6),
        ("IVA", 31, "r", 6),
        ("Retenciones", 31, "r", 6),
        ("Impuesto al consumo", 31, "r", 6),
        ("Otros deducibles", 31, "r", 6),
        ("Valor neto", 31, "r", 6),
        ("Soporte", 28, "l", 7),
        ("Estado", 40, "l", 7),
    ]
    sobra = content_w - sum(item[1] for item in columnas)
    flexible = [i for i, item in enumerate(columnas) if item[0] in ("Descripción del gasto", "Observaciones")]
    extra = sobra / len(flexible) if flexible else 0
    anchos = [
        max(16, item[1] + (extra if i in flexible else 0))
        for i, item in enumerate(columnas)
    ]
    ajuste = content_w - sum(anchos)
    if anchos and abs(ajuste) > 0.05:
        anchos[-2] += ajuste
    tam_cabeza = 6.5

    def alto_de(textos, tam_fijo=None):
        n = 1
        paso = 0
        for ancho_col, texto, col in zip(anchos, textos, columnas):
            tam = tam_fijo if tam_fijo is not None else col[3]
            n = max(n, len(lineas_de(texto, max(8, ancho_col - 4), tam, tope=6)))
            paso = max(paso, tam + 1.6)
        return 4 + n * paso

    def pintar_fila(textos, relleno, color_texto, negrita=False, tam_fijo=None):
        fuente = "hebo" if negrita else "helv"
        alto_fila = alto_de(textos, tam_fijo)
        y = estado["y"]
        x = izquierda
        pagina = estado["page"]
        for ancho_col, texto, col in zip(anchos, textos, columnas):
            tam = tam_fijo if tam_fijo is not None else col[3]
            alinea = col[2]
            rect = fitz.Rect(x, y, x + ancho_col, y + alto_fila)
            pagina.draw_rect(rect, color=borde, fill=relleno, width=0.35)
            trozos = lineas_de(texto, max(8, ancho_col - 4), tam, fuente, tope=6)
            for i, trozo in enumerate(trozos):
                base = y + 2 + tam + i * (tam + 1.6)
                largo = fitz.get_text_length(trozo, fontname=fuente, fontsize=tam)
                if alinea == "r":
                    xx = x + ancho_col - largo - 2
                elif alinea == "c":
                    xx = x + max(1, (ancho_col - largo) / 2)
                else:
                    xx = x + 2
                pagina.insert_text((xx, base), trozo, fontsize=tam, fontname=fuente, color=color_texto)
            x += ancho_col
        estado["y"] = y + alto_fila

    def texto_cabeza(nombre, ancho_col):
        usable = max(8, ancho_col - 4)
        tam = tam_cabeza
        palabras = nombre.split()
        while tam > 5 and not all(
            fitz.get_text_length(p, fontname="hebo", fontsize=tam) <= usable for p in palabras
        ):
            tam = max(5, tam - 0.3)
        def cortar(palabra):
            if fitz.get_text_length(palabra, fontname="hebo", fontsize=tam) <= usable:
                return [palabra]
            salida = []
            resto = palabra
            while resto:
                if fitz.get_text_length(resto, fontname="hebo", fontsize=tam) <= usable:
                    salida.append(resto)
                    break
                corte = len(resto)
                while corte > 1 and fitz.get_text_length(resto[:corte] + "-", fontname="hebo", fontsize=tam) > usable:
                    corte -= 1
                salida.append(resto[:max(1, corte)] + "-")
                resto = resto[max(1, corte):]
            return salida

        lineas = []
        actual = ""
        for palabra in palabras:
            prueba = (actual + " " + palabra).strip()
            if actual and fitz.get_text_length(prueba, fontname="hebo", fontsize=tam) <= usable:
                actual = prueba
                continue
            if actual:
                lineas.append(actual)
            partes = cortar(palabra)
            lineas.extend(partes[:-1])
            actual = partes[-1]
        if actual:
            lineas.append(actual)
        return tam, lineas

    def fila_cabeza():
        tamanos = []
        lineas_por_col = []
        for nombre, ancho_col in zip([c[0] for c in columnas], anchos):
            tam, lineas = texto_cabeza(nombre, ancho_col)
            tamanos.append(tam)
            lineas_por_col.append(lineas)
        alto_fila = 4 + max(len(lineas) for lineas in lineas_por_col) * (max(tamanos) + 1.4)
        y = estado["y"]
        x = izquierda
        pagina = estado["page"]
        for ancho_col, lineas, tam in zip(anchos, lineas_por_col, tamanos):
            rect = fitz.Rect(x, y, x + ancho_col, y + alto_fila)
            pagina.draw_rect(rect, color=borde, fill=relleno_tabla, width=0.35)
            for i, trozo in enumerate(lineas):
                base = y + 2 + tam + i * (tam + 1.4)
                largo = fitz.get_text_length(trozo, fontname="hebo", fontsize=tam)
                xx = x + max(1, (ancho_col - largo) / 2)
                pagina.insert_text((xx, base), trozo, fontsize=tam, fontname="hebo", color=tinta)
            x += ancho_col
        estado["y"] = y + alto_fila

    def neto_de(g):
        if g.get("estado_validacion") == "rechazado":
            return 0
        return int(g.get("valor_neto") or 0)

    def dibujar_tabla():
        asegurar(48)
        fila_cabeza()
        if not gastos:
            pintar_fila(["Sin gastos"] + [""] * (len(columnas) - 1), blanco, muted)
        for g in gastos:
            valores = [
                str(g.get("consecutivo") or ""),
                fmt_fecha_co(g.get("fecha")) or "—",
                g.get("tercero_razon_social") or "—",
                g.get("tercero_documento") or "—",
                g.get("descripcion") or "—",
                g.get("observaciones") or "—",
                g.get("documento_no") or "—",
                g.get("centro_costos") or "—",
                fmt_cop(g.get("valor_bruto")),
                fmt_cop(g.get("iva")),
                fmt_cop(g.get("retenciones")),
                fmt_cop(g.get("impuesto_consumo")),
                fmt_cop(g.get("otros_deducibles")),
                fmt_cop(neto_de(g)),
                "Ver recibo" if g.get("imagen") else "—",
                etiqueta_estado(g.get("estado_validacion")),
            ]
            color = muted if g.get("estado_validacion") == "rechazado" else tinta
            necesario = alto_de(valores)
            if estado["y"] + necesario > y_limite:
                nueva()
                fila_cabeza()
            pintar_fila(valores, blanco, color)
        total = ["", "", "", "", "", "", "", "", "", "", "", "", "Total", fmt_cop(ind["gastos_periodo"]), "", ""]
        necesario = alto_de(total)
        if estado["y"] + necesario > y_limite:
            nueva()
            fila_cabeza()
        pintar_fila(total, relleno_total, tinta, negrita=True)

    def firmas():
        alto_firma = 52
        asegurar(alto_firma + 8)
        estado["y"] += 8
        y = estado["y"]
        pagina = estado["page"]
        ancho_f = content_w / 3
        pares = (
            ("Elaboró", caja.get("firma_elaboro") or ""),
            ("Revisó", caja.get("firma_reviso") or ""),
            ("Aprobó", caja.get("firma_aprobo") or ""),
        )
        for i, (titulo, nombre) in enumerate(pares):
            x = izquierda + i * ancho_f
            rect = fitz.Rect(x + 4, y, x + ancho_f - 4, y + alto_firma)
            pagina.draw_rect(rect, color=borde, width=0.6)
            for dy, texto, fuente in ((14, titulo, "hebo"), (28, str(nombre), "helv")):
                largo = fitz.get_text_length(texto, fontname=fuente, fontsize=8)
                pagina.insert_text(
                    (rect.x0 + max(2, (rect.width - largo) / 2), rect.y0 + dy),
                    texto, fontsize=8, fontname=fuente, color=tinta,
                )
            pagina.draw_line(
                fitz.Point(rect.x0 + 16, rect.y1 - 12),
                fitz.Point(rect.x1 - 16, rect.y1 - 12),
                color=tinta, width=0.6,
            )
        estado["y"] = y + alto_firma

    def preparar_imagen(raw, max_w, max_h):
        im = Image.open(io.BytesIO(raw))
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        elif im.mode == "L":
            im = im.convert("RGB")
        im.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=85)
        return buf.getvalue(), im.width, im.height

    def soportes():
        if not gastos:
            return
        gap = 8
        rotulo_h = 26
        zona_h = y_limite - y_contenido
        zona_w = content_w
        celda_w = (zona_w - gap) / 2
        celda_h = (zona_h - gap) / 2
        caja_img_h = celda_h - rotulo_h
        # Cada soporte abre en una página de la cuadrícula, con el mismo cuadro.
        nueva()
        puestos = 0
        px_w = max(1, int(celda_w * 2))
        px_h = max(1, int(caja_img_h * 2))
        for g in gastos:
            if puestos == 4:
                nueva()
                puestos = 0
            col = puestos % 2
            fila = puestos // 2
            x = izquierda + col * (celda_w + gap)
            y = y_contenido + fila * (celda_h + gap)
            caja_img = fitz.Rect(x, y, x + celda_w, y + caja_img_h)
            estado["page"].draw_rect(caja_img, color=borde, width=0.7)
            raw = g.get("imagen")
            if raw:
                try:
                    jpeg, iw, ih = preparar_imagen(raw, px_w, px_h)
                    escala = min(caja_img.width / iw, caja_img.height / ih)
                    dw = iw * escala
                    dh = ih * escala
                    destino = fitz.Rect(
                        caja_img.x0 + (caja_img.width - dw) / 2,
                        caja_img.y0 + (caja_img.height - dh) / 2,
                        caja_img.x0 + (caja_img.width - dw) / 2 + dw,
                        caja_img.y0 + (caja_img.height - dh) / 2 + dh,
                    )
                    estado["page"].insert_image(destino, stream=jpeg)
                except Exception:
                    estado["page"].insert_textbox(
                        caja_img, "Sin soporte", fontsize=9, fontname="helv",
                        color=muted, align=1,
                    )
            else:
                estado["page"].insert_textbox(
                    caja_img, "Sin soporte", fontsize=9, fontname="helv",
                    color=muted, align=1,
                )
            razon = str(g.get("tercero_razon_social") or "—")
            doc_no = str(g.get("documento_no") or "—")
            linea1 = f"#{g.get('consecutivo') or '—'}  {razon}"
            linea2 = f"{doc_no}  {fmt_cop(neto_de(g))}"
            rotulo = fitz.Rect(x, caja_img.y1 + 2, x + celda_w, caja_img.y1 + rotulo_h)
            estado["page"].insert_textbox(
                rotulo,
                lineas_de(linea1, celda_w - 2, 7.5, tope=1)[0] + "\n" + lineas_de(linea2, celda_w - 2, 7.5, tope=1)[0],
                fontsize=7.5, fontname="helv", color=tinta, align=0,
            )
            puestos += 1

    nueva()
    cuadro_info()
    dibujar_tabla()
    firmas()
    if gastos:
        soportes()

    total = doc.page_count
    for i, pagina in enumerate(doc, start=1):
        texto = f"Página {i} de {total}"
        largo = fitz.get_text_length(texto, fontname="helv", fontsize=8)
        pagina.insert_text(
            ((ancho - largo) / 2, alto_pag - 18),
            texto, fontsize=8, fontname="helv", color=muted,
        )
    return doc.tobytes()


def enlace_gasto(contrato_id: int, caja_id: int, gasto_id: int) -> str:
    from caja_menor_email import enlace_caja

    return f"{enlace_caja(contrato_id, caja_id)}&gasto={int(gasto_id)}"
