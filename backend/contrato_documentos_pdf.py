"""
Generación PDF — contrato de licenciamiento ClaraCore (plantilla HTML + xhtml2pdf).

Fuente legal: docs/Contrato_Licencia_Uso_ClaraCore.docx
Texto con placeholders: backend/assets/contrato_licencia_plantilla.txt
"""

from __future__ import annotations

import html
import logging
import os
import re
import base64
from datetime import datetime
from typing import Any, Dict, Optional

import pytz

from contrato_documentos_service import empresa_footer_config, logo_claracore_path
from contrato_numero_letras import entero_en_letras, formato_pesos_cop
from topografia_utils import to_pdf_bytes

_log = logging.getLogger("claracore.contrato_documentos.pdf")

# Escala del logo en portada (~30 % del PNG nativo). xhtml2pdf ignora max-width CSS.
_LOGO_ESCALA_COMPACTA = 0.30
_PLACEHOLDER_RE = re.compile(r"\{\{[A-Z_0-9]+\}\}")
_CAPITULO_RE = re.compile(r"CAPÍTULO [IVXLC]+")
_CLAUSULA_RE = re.compile(r"CLÁUSULA \d+\.")
_ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
_PLANTILLA_TXT = os.path.join(_ASSETS_DIR, "contrato_licencia_plantilla.txt")

_PAGE_CSS = """
@page {
  size: letter;
  margin: 1.45cm 1.85cm 1.55cm 1.85cm;
}
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 8.5pt;
  color: #111827;
  line-height: 1.28;
}
.w100 { width: 100%; border-collapse: collapse; }
.doc-logo-row {
  text-align: center;
  margin: 0 0 2pt 0;
  overflow: hidden;
  line-height: 0;
}
.doc-logo-row img {
  display: block;
  margin: 0 auto;
}
.doc-intro { margin-bottom: 0; }
.doc-title {
  font-size: 9.5pt;
  font-weight: bold;
  color: #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.2pt;
  line-height: 1.2;
  text-align: center;
}
.doc-sub-h {
  font-size: 7.75pt;
  color: #475569;
  margin-top: 1pt;
  line-height: 1.2;
  text-align: center;
}
.doc-meta-line {
  font-size: 8.25pt;
  text-align: center;
  color: #334155;
  margin: 1pt 0;
  line-height: 1.2;
}
.partes {
  text-align: justify;
  margin: 5pt 0 6pt 0;
}
.capitulo { margin-top: 3pt; }
h2 {
  font-size: 9pt;
  font-weight: bold;
  text-transform: uppercase;
  margin: 4pt 0 1.5pt 0;
  color: #0f172a;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 1pt;
  line-height: 1.15;
}
.capitulo-sub {
  font-size: 8.25pt;
  font-weight: bold;
  text-transform: uppercase;
  margin: 2pt 0 3pt 0;
  color: #334155;
  line-height: 1.15;
}
.clausula {
  text-align: justify;
  margin: 0 0 2.5pt 0;
}
.clausula-list {
  margin: 1pt 0 2pt 12pt;
  padding: 0;
}
.clausula-list li { margin-bottom: 1pt; text-align: justify; }
.cierre-doc {
  page-break-inside: avoid;
}
.firmas-block {
  margin-top: 6pt;
  page-break-before: avoid;
}
.firmas-unido {
  page-break-inside: avoid;
}
.firmas-intro { text-align: justify; margin-bottom: 4pt; }
.firmas-table { width: 100%; border-collapse: collapse; margin-top: 2pt; }
.firma-col { width: 48%; vertical-align: top; padding: 3pt 6pt; }
.firma-titulo {
  font-weight: bold;
  font-size: 8.25pt;
  text-transform: uppercase;
  margin-bottom: 14pt;
  color: #0f172a;
}
.firma-linea { border-top: 1px solid #111827; margin-bottom: 3pt; height: 1pt; }
.firma-datos { font-size: 8pt; line-height: 1.25; color: #1e293b; }
.doc-footer {
  font-size: 6.5pt;
  color: #64748b;
  text-align: center;
  border-top: 1px solid #cbd5e1;
  padding-top: 2pt;
}
"""


class PDFGeneracionNoDisponibleError(RuntimeError):
    """Error al generar el PDF del contrato de licenciamiento."""


def _plantilla_texto() -> str:
    path = _PLANTILLA_TXT
    if not os.path.isfile(path):
        raise PDFGeneracionNoDisponibleError(
            f"No se encontró la plantilla de contrato en {path}. "
            "Verifique backend/assets/contrato_licencia_plantilla.txt"
        )
    with open(path, encoding="utf-8") as fh:
        raw = fh.read().strip()
    return _normalizar_plantilla_texto(raw)


def _normalizar_plantilla_texto(texto: str) -> str:
    """Inserta saltos de línea estructurales (el DOCX exportado llega concatenado)."""
    t = (texto or "").replace("\r\n", "\n")

    subs = [
        (r"TECNOLÓGICA\s*Modalidad", "TECNOLÓGICA\nModalidad"),
        (r"\(SaaS\)\s*PLATAFORMA", "(SaaS)\nPLATAFORMA"),
        (r"PLATAFORMA CLARACORE\s*Contrato", "PLATAFORMA CLARACORE\nContrato"),
        (r"(Contrato N\.°[^\n]+?)\s*(Bogotá D\.C\.)", r"\1\n\2"),
        (r"([A-Z0-9][A-Z0-9.\-/]{2,})(Bogotá D\.C\.)", r"\1\n\2"),
        (r"(\{\{FECHA_GENERACION\}\})\s*PARTES", r"\1\n\nPARTES"),
        (r"(Bogotá D\.C\.,[^\n]+?)\s*PARTES", r"\1\n\nPARTES"),
        (r"PARTES\s*De una parte", "PARTES\n\nDe una parte"),
        (r"cláusulas:\s*", "cláusulas:\n\n"),
        (r"CAPÍTULO\s+", "\n\nCAPÍTULO "),
        (r"CLÁUSULA\s+", "\n\nCLÁUSULA "),
        (r"([A-ZÁÉÍÓÚÑ ]{4,40})\s*(?=CLÁUSULA \d+\.)", lambda m: m.group(1).strip() + "\n\n"),
        (r"\{\{LIC_VALOR_MENSUAL_LETRAS\}\}\s*pesos", "{{LIC_VALOR_MENSUAL_LETRAS}}"),
        (r"conductas:\s*", "conductas:\n"),
        (r"se obliga a:\s*", "se obliga a:\n"),
        (r"\s*FIRMAS\s*", "\n\nFIRMAS\n\n"),
        (r"FIRMAS\s*En constancia", "FIRMAS\n\nEn constancia"),
        (r"(\d{4})\.\s*(EL LICENCIANTE)", r"\1.\n\n\2"),
        (r"EL LICENCIANTE\s*([A-ZÁÉÍÓÚÑ])", r"EL LICENCIANTE\n\1"),
        (r"EL LICENCIATARIO\s*([A-ZÁÉÍÓÚÑ{])", r"EL LICENCIATARIO\n\1"),
        (r"([^\n]+?)\s*(C\.C\. N\.°)", r"\1\n\2"),
        (r"( de Bogotá)\s*(Representante Legal)", r"\1\n\2"),
        (r"Representante Legal\s*(CLARACORE|{{LIC_)", r"Representante Legal\n\1"),
        (r"Legal\s*(CLARACORE|{{LIC_)", r"Legal\n\1"),
        (r"(S\.A\.S\.)\s*(NIT)", r"\1\n\2"),
        (r"Representante\s*Legal\s*(\{\{LIC_RAZON_SOCIAL\}\})", r"Representante Legal\n\1"),
        (r"Legal\s*(\{\{LIC_RAZON_SOCIAL\}\})", r"Legal\n\1"),
        (r"(\{\{LIC_RAZON_SOCIAL\}\})\s*(NIT)", r"\1\n\2"),
    ]
    for pat, repl in subs:
        t = re.sub(pat, repl, t)

    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _normalizar_texto_final(texto: str) -> str:
    """Segunda pasada tras reemplazar placeholders (portada, firmas, cláusulas)."""
    t = _normalizar_plantilla_texto(texto)
    subs = [
        (r"([A-Z0-9][A-Z0-9.\-/]{2,})(Bogotá D\.C\.)", r"\1\n\2"),
        (r"( de [a-záéíóúñ]+ de \d{4})\.\s*(EL LICENCIANTE)", r"\1.\n\n\2"),
        (r"([A-Za-zÁÉÍÓÚÑáéíóúñ\s\.]+?)\s*(C\.C\. N\.°)", r"\1\n\2"),
        (r"(Representante Legal)\s*([A-ZÁÉÍÓÚÑ{{])", r"\1\n\2"),
        (r"(S\.A\.S\.)\s*(NIT\s)", r"\1\n\2"),
        (r"(S\.A\.S\.)\s*(NIT\b)", r"\1\n\2"),
        (r"(\bPESOS)\s+pesos\b", r"\1"),
    ]
    for pat, repl in subs:
        t = re.sub(pat, repl, t, flags=re.IGNORECASE)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def _fecha_generacion_bogota() -> str:
    tz = pytz.timezone("America/Bogota")
    now = datetime.now(tz)
    meses = (
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    )
    return f"{now.day} de {meses[now.month - 1]} de {now.year}"


def _nit_claracore_display(val: Optional[str]) -> str:
    """NIT del licenciante ClaraCore; vacío o placeholder inválido → «En trámite»."""
    v = (val or "").strip()
    if not v or v in ("1", "0", "-", "__", "________________"):
        return "En trámite"
    return v


def _campo(val: Optional[str], *, vacio: str = "________________") -> str:
    v = (val or "").strip()
    return v if v else vacio


def construir_contexto_placeholders(
    *,
    licenciatario: Dict[str, Any],
    numero_contrato: str,
) -> Dict[str, str]:
    empresa = empresa_footer_config()
    valor = licenciatario.get("valor_mensual")
    letras = "CERO"
    if valor is not None and valor != "":
        try:
            letras = f"{entero_en_letras(int(round(float(valor))))} PESOS"
        except (TypeError, ValueError):
            letras = "CERO PESOS"
    return {
        "{{NUMERO_CONTRATO}}": _campo(numero_contrato, vacio="____________"),
        "{{FECHA_GENERACION}}": _fecha_generacion_bogota(),
        "{{CLARACORE_NIT}}": _nit_claracore_display(empresa.get("nit")),
        "{{LIC_RAZON_SOCIAL}}": _campo(licenciatario.get("razon_social")),
        "{{LIC_NIT}}": _campo(licenciatario.get("nit")),
        "{{LIC_REPRESENTANTE}}": _campo(licenciatario.get("representante_nombre")),
        "{{LIC_CEDULA}}": _campo(licenciatario.get("representante_cedula")),
        "{{LIC_DIRECCION}}": _campo(licenciatario.get("direccion")),
        "{{LIC_EMAIL}}": _campo(licenciatario.get("email_notificaciones")),
        "{{LIC_OBRA}}": _campo(licenciatario.get("identificacion_obra")),
        "{{LIC_VALOR_MENSUAL}}": formato_pesos_cop(valor),
        "{{LIC_VALOR_MENSUAL_LETRAS}}": letras,
    }


def _aplicar_placeholders(texto: str, ctx: Dict[str, str]) -> str:
    out = texto
    for k, v in ctx.items():
        out = out.replace(k, v)
    restantes = _PLACEHOLDER_RE.findall(out)
    if restantes:
        _log.warning("Placeholders sin reemplazar en contrato licencia: %s", restantes)
    return out


def _esc(s: str) -> str:
    return html.escape(str(s or ""), quote=False)


def _dimensiones_logo_png(path: str) -> tuple[int, int]:
    """Ancho y alto del PNG (píxeles)."""
    try:
        from PIL import Image

        with Image.open(path) as im:
            return im.size
    except Exception:
        return (436, 127)


def _escala_logo_px(ancho_nativo: int, alto_nativo: int, *, compact: bool) -> tuple[int, int]:
    """Calcula width/height en px para xhtml2pdf (atributos explícitos)."""
    if compact:
        max_w = max(1, int(round(ancho_nativo * _LOGO_ESCALA_COMPACTA)))
        max_h = max(1, int(round(alto_nativo * _LOGO_ESCALA_COMPACTA)))
    else:
        max_w, max_h = 132, 38
    escala = min(max_w / ancho_nativo, max_h / alto_nativo)
    return max(1, int(round(ancho_nativo * escala))), max(1, int(round(alto_nativo * escala)))


def _html_logo_celda(*, compact: bool = False) -> str:
    path = logo_claracore_path()
    if os.path.isfile(path):
        try:
            with open(path, "rb") as fh:
                b64 = base64.b64encode(fh.read()).decode("ascii")
            nat_w, nat_h = _dimensiones_logo_png(path)
            w_px, h_px = _escala_logo_px(nat_w, nat_h, compact=compact)
            return (
                f'<img src="data:image/png;base64,{b64}" alt="ClaraCore" '
                f'width="{w_px}" height="{h_px}" '
                f'style="display:block;margin:0 auto;width:{w_px}px;height:{h_px}px;" />'
            )
        except OSError as exc:
            _log.warning("No se pudo leer logo ClaraCore: %s", exc)
    return '<span style="font-size:8pt;font-weight:bold;color:#0e7490;">CLARACORE</span>'


def _texto_a_html_cuerpo(texto: str) -> str:
    partes = re.split(r"(?=FIRMAS)", texto, maxsplit=1)
    cuerpo = partes[0].strip()
    firmas = partes[1].strip() if len(partes) > 1 else ""

    chunks = _CAPITULO_RE.split(cuerpo)
    caps = _CAPITULO_RE.findall(cuerpo)

    html_parts: list[str] = []
    intro = (chunks[0] if chunks else "").strip()
    if intro:
        html_parts.append(_html_intro(intro))

    capitulos: list[str] = []
    for i, cap in enumerate(caps):
        body = chunks[i + 1] if i + 1 < len(chunks) else ""
        capitulos.append(_html_capitulo(cap, body))

    if capitulos and firmas:
        ultimo_cap = caps[-1]
        ultimo_body = chunks[len(caps)] if len(chunks) > len(caps) else ""
        capitulos[-1] = _html_capitulo_con_cierre_firmas(
            ultimo_cap,
            ultimo_body,
            _html_firmas(firmas),
        )
    html_parts.extend(capitulos)
    if firmas and not capitulos:
        html_parts.append(_html_firmas(firmas))

    return "\n".join(html_parts)


def _html_intro(intro: str) -> str:
    intro = intro.replace("PARTES", "\nPARTES\n")
    lines = [ln.strip() for ln in intro.split("\n") if ln.strip()]
    if not lines:
        return ""

    title_lines: list[str] = []
    partes_idx = None
    for i, ln in enumerate(lines):
        if ln == "PARTES":
            partes_idx = i
            break
        title_lines.append(ln)

    out = ['<div class="doc-intro">']
    out.append(f'<div class="doc-logo-row">{_html_logo_celda(compact=True)}</div>')
    if title_lines:
        out.append(f'<div class="doc-title">{_esc(title_lines[0])}</div>')
        for ln in title_lines[1:]:
            cls = "doc-meta-line"
            if ln.startswith("Modalidad"):
                cls = "doc-sub-h"
            elif "CLARACORE" in ln and len(ln) < 48:
                cls = "doc-sub-h"
            out.append(f'<div class="{cls}">{_esc(ln)}</div>')
    if partes_idx is not None:
        partes_text = " ".join(lines[partes_idx + 1 :])
        out.append(f'<p class="partes"><strong>PARTES</strong> {_esc(partes_text)}</p>')
    out.append("</div>")
    return "\n".join(out)


def _html_capitulo(cap: str, body: str) -> str:
    body = body.strip()
    sub = ""
    m = re.match(r"^([^\n]+?)(?=\n\nCLÁUSULA|\nCLÁUSULA|CLÁUSULA)", body, flags=re.S)
    if m:
        sub = m.group(1).strip()
        body = body[len(m.group(0)) :].lstrip()

    parts = _CLAUSULA_RE.split(body)
    clausulas = _CLAUSULA_RE.findall(body)

    out = [f'<div class="capitulo"><h2>{_esc(cap.strip())}</h2>']
    if sub:
        out.append(f'<div class="capitulo-sub">{_esc(sub)}</div>')

    for i, cl in enumerate(clausulas):
        contenido = parts[i + 1].strip() if i + 1 < len(parts) else ""
        contenido = _formatear_lista_clausula(contenido)
        out.append(
            f'<p class="clausula"><strong>{_esc(cl.strip())}</strong> {contenido}</p>'
        )
    out.append("</div>")
    return "\n".join(out)


def _html_clausula_p(cl: str, contenido_raw: str) -> str:
    contenido = _formatear_lista_clausula(contenido_raw.strip())
    return f'<p class="clausula"><strong>{_esc(cl.strip())}</strong> {contenido}</p>'


def _html_capitulo_con_cierre_firmas(cap: str, body: str, firmas_html: str) -> str:
    """
    Último capítulo: deja las primeras cláusulas en flujo normal y agrupa
    las dos últimas + bloque de firmas para que no queden aisladas.
    """
    body = body.strip()
    sub = ""
    m = re.match(r"^([^\n]+?)(?=\n\nCLÁUSULA|\nCLÁUSULA|CLÁUSULA)", body, flags=re.S)
    if m:
        sub = m.group(1).strip()
        body = body[len(m.group(0)) :].lstrip()

    parts = _CLAUSULA_RE.split(body)
    clausulas = _CLAUSULA_RE.findall(body)
    if not clausulas:
        return f'<div class="cierre-doc">\n{_html_capitulo(cap, body)}\n{firmas_html}\n</div>'

    split_at = max(len(clausulas) - 2, 0)
    head_cls = clausulas[:split_at]
    tail_cls = clausulas[split_at:]

    chunks: list[str] = []
    if head_cls:
        out = [f'<div class="capitulo"><h2>{_esc(cap.strip())}</h2>']
        if sub:
            out.append(f'<div class="capitulo-sub">{_esc(sub)}</div>')
        for i, cl in enumerate(head_cls):
            idx = i + 1
            contenido = parts[idx].strip() if idx < len(parts) else ""
            out.append(_html_clausula_p(cl, contenido))
        out.append("</div>")
        chunks.append("\n".join(out))

    cierre = [f'<div class="cierre-doc"><div class="capitulo">']
    if not head_cls:
        cierre.append(f'<h2>{_esc(cap.strip())}</h2>')
        if sub:
            cierre.append(f'<div class="capitulo-sub">{_esc(sub)}</div>')
    for j, cl in enumerate(tail_cls):
        idx = split_at + j + 1
        contenido = parts[idx].strip() if idx < len(parts) else ""
        cierre.append(_html_clausula_p(cl, contenido))
    cierre.append("</div>")
    cierre.append(firmas_html)
    cierre.append("</div>")
    chunks.append("\n".join(cierre))
    return "\n".join(chunks)


def _formatear_lista_clausula(texto: str) -> str:
    texto = (texto or "").strip()
    if ";" not in texto:
        return _esc(texto)

    idx = texto.rfind(":")
    if idx <= 0:
        return _esc(texto)

    intro = texto[: idx + 1].strip()
    list_body = texto[idx + 1 :].strip()
    items = [x.strip() for x in re.split(r";(?=\s*[A-ZÁÉÍÓÚÑ])", list_body) if x.strip()]
    if len(items) < 2:
        return _esc(texto)

    lis = "".join(f"<li>{_esc(it)}</li>" for it in items)
    return f'{_esc(intro)}<ul class="clausula-list">{lis}</ul>'


def _desglosar_lineas_firma(raw: str) -> list[str]:
    """Separa nombre, cédula, cargo, razón social y NIT en líneas independientes."""
    t = (raw or "").strip()
    if not t:
        return []
    t = re.sub(r"\s*(C\.C\. N\.°)", r"\n\1", t)
    t = re.sub(r"\s*(Representante Legal)", r"\n\1", t)
    t = re.sub(r"(Representante Legal)\s*", r"\1\n", t)
    t = re.sub(r"(S\.A\.S\.)\s*(NIT\b)", r"\1\n\2", t)
    t = re.sub(r"(S\.A\.S\.)\s*(NIT\s)", r"\1\n\2", t)
    t = re.sub(r"(NIT\s+[^\n]+?)(\s*EL LICENCIATARIO|\s*$)", r"\1", t)
    lines = [ln.strip() for ln in t.split("\n") if ln.strip()]
    out: list[str] = []
    for ln in lines:
        if ln in ("EL LICENCIANTE", "EL LICENCIATARIO"):
            continue
        out.append(ln)
    return out


def _html_firmas(firmas: str) -> str:
    firmas = firmas.replace("FIRMAS", "").strip()
    firmas = re.sub(r"\s*EL LICENCIANTE\s*", "\nEL LICENCIANTE\n", firmas)
    firmas = re.sub(r"\s*EL LICENCIATARIO\s*", "\nEL LICENCIATARIO\n", firmas)
    partes = re.split(r"\nEL LICENCIATARIO\n|\nEL LICENCIANTE\n", firmas)
    # partes[0] = intro, then lic, then licat depending on split
    intro = partes[0].strip()
    lic_raw = ""
    licat_raw = ""
    m = re.search(
        r"^(.*?)\nEL LICENCIANTE\n(.*)\nEL LICENCIATARIO\n(.*)$",
        firmas,
        flags=re.S,
    )
    if m:
        intro = m.group(1).strip()
        lic_raw = m.group(2).strip()
        licat_raw = m.group(3).strip()
    elif len(partes) >= 2:
        intro = partes[0].strip()
        lic_raw = partes[1].strip() if len(partes) > 1 else ""
        licat_raw = partes[2].strip() if len(partes) > 2 else ""

    lic_lines = _desglosar_lineas_firma(lic_raw)
    licat_lines = _desglosar_lineas_firma(licat_raw)

    out = ['<div class="firmas-block">']
    out.append('<div class="firmas-unido">')
    if intro:
        out.append(f'<p class="firmas-intro">{_esc(intro)}</p>')
    out.append("<table class=\"firmas-table\"><tr>")
    out.append(f'<td class="firma-col">{_firma_col_html("EL LICENCIANTE", lic_lines)}</td>')
    out.append(f'<td class="firma-col">{_firma_col_html("EL LICENCIATARIO", licat_lines)}</td>')
    out.append("</tr></table>")
    out.append("</div></div>")
    return "\n".join(out)


def _firma_col_html(titulo: str, lines: list[str]) -> str:
    body = "<br/>".join(_esc(ln) for ln in lines)
    return (
        f'<div class="firma-titulo">{_esc(titulo)}</div>'
        f'<div class="firma-linea">&nbsp;</div>'
        f'<div class="firma-datos">{body}</div>'
    )


def _html_documento_completo(cuerpo_html: str) -> str:
    empresa = empresa_footer_config()
    razon = _esc(empresa.get("razon_social") or "")
    nit = _esc(_nit_claracore_display(empresa.get("nit")))
    email = _esc(empresa.get("email") or "")
    ciudad = _esc(empresa.get("ciudad") or "")
    footer_txt = f"{razon} · NIT {nit} · {email} · {ciudad}"

    return f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"/>
<style>{_PAGE_CSS}</style>
</head>
<body>
<pdf:footer>
<div class="doc-footer">{footer_txt}</div>
</pdf:footer>
{cuerpo_html}
</body>
</html>"""


def generar_pdf_contrato_licencia(
    *,
    licenciatario: Dict[str, Any],
    numero_contrato: str,
) -> bytes:
    """Genera el PDF del contrato de licenciamiento a partir de la plantilla HTML."""
    if not licenciatario or not (licenciatario.get("razon_social") or "").strip():
        raise ValueError("razon_social es obligatoria para generar el contrato")

    ctx = construir_contexto_placeholders(
        licenciatario=licenciatario,
        numero_contrato=numero_contrato or "",
    )
    texto = _normalizar_texto_final(_aplicar_placeholders(_plantilla_texto(), ctx))
    cuerpo_html = _texto_a_html_cuerpo(texto)
    html_doc = _html_documento_completo(cuerpo_html)

    try:
        pdf = to_pdf_bytes(html_doc, landscape=False)
    except Exception as exc:
        _log.exception("xhtml2pdf contrato licencia")
        raise PDFGeneracionNoDisponibleError(f"No se pudo generar el PDF: {exc}") from exc

    if not pdf or len(pdf) < 500:
        raise PDFGeneracionNoDisponibleError("El PDF generado está vacío o es inválido")
    return pdf
