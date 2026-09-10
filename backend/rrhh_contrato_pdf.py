"""
Generación PDF — contrato laboral RRHH (plantilla con placeholders {{...}}).

Patrón análogo a contrato_documentos_pdf (Documentos Contractuales de licenciamiento).
Plantilla: backend/assets/rrhh_contrato_laboral_plantilla.txt
"""
from __future__ import annotations

import html
import logging
import os
import re
from datetime import date, datetime
from typing import Any, Dict, Optional

import pytz

from contrato_numero_letras import entero_en_letras, formato_pesos_cop
from topografia_utils import to_pdf_bytes

_log = logging.getLogger("claracore.rrhh.contrato_pdf")

_PLACEHOLDER_RE = re.compile(r"\{\{[A-Z_0-9]+\}\}")
_ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
_PLANTILLA_TXT = os.path.join(_ASSETS_DIR, "rrhh_contrato_laboral_plantilla.txt")

_PAGE_CSS = """
@page {
  size: letter;
  margin: 1.6cm 1.9cm 1.6cm 1.9cm;
}
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10pt;
  color: #111827;
  line-height: 1.35;
}
.doc-title {
  font-size: 13pt;
  font-weight: bold;
  text-align: center;
  text-transform: uppercase;
  margin: 0 0 6pt 0;
  color: #0f172a;
}
.doc-sub {
  font-size: 9pt;
  text-align: center;
  color: #475569;
  margin: 0 0 12pt 0;
}
.meta {
  font-size: 9.5pt;
  margin: 0 0 10pt 0;
  color: #334155;
}
.partes {
  text-align: justify;
  margin: 0 0 10pt 0;
}
.clausula {
  text-align: justify;
  margin: 0 0 7pt 0;
}
h2 {
  font-size: 10.5pt;
  margin: 10pt 0 4pt 0;
  color: #0f172a;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 2pt;
}
.firmas {
  margin-top: 22pt;
  width: 100%;
  border-collapse: collapse;
}
.firmas td {
  width: 50%;
  vertical-align: top;
  padding: 8pt 10pt 0 0;
  font-size: 9.5pt;
}
.linea-firma {
  margin-top: 36pt;
  border-top: 1px solid #334155;
  width: 85%;
  padding-top: 4pt;
}
"""


def _campo(val: Optional[str], *, vacio: str = "________________") -> str:
    v = (val or "").strip()
    return v if v else vacio


def _fecha_bogota(fmt: str = "%d de %B de %Y") -> str:
    now = datetime.now(pytz.timezone("America/Bogota"))
    # Meses en español simples
    meses = {
        1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
        5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
        9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
    }
    return f"{now.day} de {meses[now.month]} de {now.year}"


def _fmt_fecha(val: Optional[str]) -> str:
    if not val:
        return "________________"
    s = str(val).strip()[:10]
    try:
        d = date.fromisoformat(s)
        meses = {
            1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
            5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
            9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
        }
        return f"{d.day} de {meses[d.month]} de {d.year}"
    except ValueError:
        return s


def construir_contexto_placeholders(
    *,
    trabajador: Dict[str, Any],
    tipo_contrato: Dict[str, Any],
    contrato_obra: Dict[str, Any],
    numero_contrato_laboral: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
) -> Dict[str, str]:
    nombre = f"{(trabajador.get('nombres') or '').strip()} {(trabajador.get('apellidos') or '').strip()}".strip()
    salario = trabajador.get("salario")
    letras = "CERO"
    if salario is not None and salario != "":
        try:
            letras = f"{entero_en_letras(int(round(float(salario))))} PESOS"
        except (TypeError, ValueError):
            letras = "CERO PESOS"
    subsidio = "SÍ" if trabajador.get("subsidio_transporte") else "NO"
    return {
        "{{NOMBRE_TRABAJADOR}}": _campo(nombre),
        "{{TIPO_DOCUMENTO}}": _campo(trabajador.get("tipo_documento"), vacio="CC"),
        "{{NUMERO_DOCUMENTO}}": _campo(trabajador.get("numero_documento")),
        "{{DIRECCION_TRABAJADOR}}": _campo(trabajador.get("direccion")),
        "{{CIUDAD_TRABAJADOR}}": _campo(trabajador.get("ciudad")),
        "{{TELEFONO_TRABAJADOR}}": _campo(trabajador.get("telefono")),
        "{{EMAIL_TRABAJADOR}}": _campo(trabajador.get("email")),
        "{{CARGO}}": _campo(trabajador.get("cargo_aspira")),
        "{{SALARIO}}": formato_pesos_cop(salario) if salario is not None else "________________",
        "{{SALARIO_LETRAS}}": letras,
        "{{SUBSIDIO_TRANSPORTE}}": subsidio,
        "{{TIPO_CONTRATO}}": _campo(tipo_contrato.get("nombre")),
        "{{EMPRESA_CONTRATANTE}}": _campo(trabajador.get("empresa_nombre")),
        "{{EMPRESA_NIT}}": _campo(trabajador.get("empresa_nit")),
        "{{EPS}}": _campo(trabajador.get("eps")),
        "{{PENSION}}": _campo(trabajador.get("pension")),
        "{{CESANTIAS}}": _campo(trabajador.get("cesantias")),
        "{{ARL}}": _campo(trabajador.get("arl")),
        "{{CAJA_COMPENSACION}}": _campo(trabajador.get("caja_compensacion")),
        "{{NUMERO_CONTRATO_LABORAL}}": _campo(numero_contrato_laboral),
        "{{FECHA_INICIO}}": _fmt_fecha(fecha_inicio),
        "{{FECHA_FIN}}": _fmt_fecha(fecha_fin),
        "{{FECHA_GENERACION}}": _fecha_bogota(),
        "{{CONTRATO_OBRA}}": _campo(contrato_obra.get("numero")),
        "{{OBJETO_OBRA}}": _campo(contrato_obra.get("objeto")),
        "{{EMERGENCIA_NOMBRE}}": _campo(trabajador.get("emergencia_nombre")),
        "{{EMERGENCIA_TELEFONO}}": _campo(trabajador.get("emergencia_telefono")),
    }


def _aplicar_placeholders(texto: str, ctx: Dict[str, str]) -> str:
    out = texto
    for k, v in ctx.items():
        out = out.replace(k, v)
    restantes = _PLACEHOLDER_RE.findall(out)
    if restantes:
        _log.warning("Placeholders sin reemplazar en contrato laboral RRHH: %s", restantes)
    return out


def _esc(s: str) -> str:
    return html.escape(str(s or ""), quote=False)


def _cargar_plantilla() -> str:
    if not os.path.isfile(_PLANTILLA_TXT):
        raise ValueError("No se encontró la plantilla de contrato laboral RRHH.")
    with open(_PLANTILLA_TXT, "r", encoding="utf-8") as fh:
        return fh.read()


def _texto_a_html(texto: str) -> str:
    """Convierte plantilla en prosa a HTML simple (párrafos por doble salto / etiquetas)."""
    blocks = []
    for raw in texto.replace("\r\n", "\n").split("\n\n"):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("# "):
            blocks.append(f"<h2>{_esc(line[2:].strip())}</h2>")
        elif line.startswith("## "):
            blocks.append(f'<div class="doc-sub">{_esc(line[3:].strip())}</div>')
        elif line.upper().startswith("TÍTULO:") or line.upper().startswith("TITULO:"):
            blocks.append(f'<div class="doc-title">{_esc(line.split(":", 1)[1].strip())}</div>')
        else:
            cls = "clausula"
            if line.upper().startswith("PARTES"):
                cls = "partes"
            paragraphs = line.split("\n")
            for p in paragraphs:
                p = p.strip()
                if p:
                    blocks.append(f'<p class="{cls}">{_esc(p)}</p>')
    firmas = """
<table class="firmas"><tr>
  <td><div class="linea-firma">EL EMPLEADOR<br/>{{EMPRESA_CONTRATANTE}}</div></td>
  <td><div class="linea-firma">EL TRABAJADOR<br/>{{NOMBRE_TRABAJADOR}}</div></td>
</tr></table>
""".replace("{{EMPRESA_CONTRATANTE}}", "").replace("{{NOMBRE_TRABAJADOR}}", "")
    # Firmas se agregan desde plantilla; si no hay sección FIRMAS, append default
    html_body = "\n".join(blocks)
    if "linea-firma" not in html_body and "EL EMPLEADOR" not in html_body.upper():
        html_body += """
<table class="firmas"><tr>
  <td><div class="linea-firma">EL EMPLEADOR</div></td>
  <td><div class="linea-firma">EL TRABAJADOR</div></td>
</tr></table>
"""
    return f"<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><style>{_PAGE_CSS}</style></head><body>{html_body}</body></html>"


def generar_pdf_contrato_laboral(
    *,
    trabajador: Dict[str, Any],
    tipo_contrato: Dict[str, Any],
    contrato_obra: Dict[str, Any],
    numero_contrato_laboral: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
) -> bytes:
    plantilla = _cargar_plantilla()
    ctx = construir_contexto_placeholders(
        trabajador=trabajador,
        tipo_contrato=tipo_contrato,
        contrato_obra=contrato_obra or {},
        numero_contrato_laboral=numero_contrato_laboral,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
    )
    texto = _aplicar_placeholders(plantilla, ctx)
    # Re-aplicar en firmas del HTML helper también
    html_doc = _texto_a_html(texto)
    # Insertar nombres en firmas si el HTML default fue usado
    html_doc = html_doc.replace(
        '<div class="linea-firma">EL EMPLEADOR</div>',
        f'<div class="linea-firma">EL EMPLEADOR<br/>{_esc(ctx["{{EMPRESA_CONTRATANTE}}"])}</div>',
    )
    html_doc = html_doc.replace(
        '<div class="linea-firma">EL TRABAJADOR</div>',
        f'<div class="linea-firma">EL TRABAJADOR<br/>{_esc(ctx["{{NOMBRE_TRABAJADOR}}"])}</div>',
    )
    return to_pdf_bytes(html_doc, landscape=False)
