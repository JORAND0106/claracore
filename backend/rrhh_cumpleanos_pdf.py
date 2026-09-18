"""
PDF festivo — cumpleaños del mes (RRHH).
4 plantillas visuales alineadas a la paleta ClaraCore; rotación cada 4 meses.
El HTML/CSS busca reproducir el collage del popup (tarjetas blancas + decoración).
"""
from __future__ import annotations

import html
import logging
from typing import Any, Dict, List, Optional

from topografia_utils import to_pdf_bytes

_log = logging.getLogger("claracore.rrhh.cumpleanos_pdf")

_MESES = (
    "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)

# Paleta ClaraCore (#0077B6 / cyan / cielo / teal) — ambientación festiva vía decoración
_PLANTILLAS = (
    {  # 0 — Azul ClaraCore
        "id": 0,
        "nombre": "Azul ClaraCore",
        "bg": "#E0F2FE",
        "accent": "#0077B6",
        "card": "#FFFFFF",
        "border": "#7DD3FC",
        "text": "#0F2942",
        "muted": "#4A7FA5",
        "decor": "🎊 🎉 🎂 🎈 ✨ 🎁 🌟",
        "decor2": "🎀 🥳 🎈 🎊 ✨ 🎉 🎁",
        "btn": "#0077B6",
    },
    {  # 1 — Cyan ClaraCore
        "id": 1,
        "nombre": "Cyan ClaraCore",
        "bg": "#ECFEFF",
        "accent": "#00B4C6",
        "card": "#FFFFFF",
        "border": "#67E8F9",
        "text": "#164E63",
        "muted": "#0E7490",
        "decor": "🎈 🎂 🎊 ✨ 🎁 🎉 🌟",
        "decor2": "🥳 🎀 🎈 🎊 ✨ 🎉 🎁",
        "btn": "#00B4C6",
    },
    {  # 2 — Cielo ClaraCore
        "id": 2,
        "nombre": "Cielo ClaraCore",
        "bg": "#F0F9FF",
        "accent": "#0284C7",
        "card": "#FFFFFF",
        "border": "#93C5FD",
        "text": "#0C4A6E",
        "muted": "#0369A1",
        "decor": "🎉 ✨ 🎂 🎈 🎊 🎁 🌟",
        "decor2": "🥳 🎀 🎈 🎊 ✨ 🎉 🎁",
        "btn": "#0284C7",
    },
    {  # 3 — Teal ClaraCore
        "id": 3,
        "nombre": "Teal ClaraCore",
        "bg": "#F0FDFA",
        "accent": "#0E7490",
        "card": "#FFFFFF",
        "border": "#5EEAD4",
        "text": "#134E4A",
        "muted": "#0F766E",
        "decor": "🌟 🎂 🎁 ✨ 🎈 🎊 🎉",
        "decor2": "🥳 🎀 🎈 🎊 ✨ 🎉 🎁",
        "btn": "#0E7490",
    },
)


def plantilla_por_id(plantilla_id: int) -> dict:
    idx = int(plantilla_id) % 4
    return _PLANTILLAS[idx]


def _esc(v: Any) -> str:
    return html.escape(str(v if v is not None else ""))


def _mensaje_default() -> str:
    return (
        "En este mes celebramos a quienes hacen posible nuestro día a día. "
        "¡Feliz cumpleaños! Gracias por su compromiso y por aportar su talento a nuestro equipo."
    )


def construir_html_cumpleanos(
    *,
    mes: int,
    anio: Optional[int],
    items: List[dict],
    plantilla_id: int = 0,
    mensaje: Optional[str] = None,
    titular: Optional[str] = None,
) -> str:
    pal = plantilla_por_id(plantilla_id)
    mes_nom = _MESES[int(mes)] if 1 <= int(mes) <= 12 else ""
    titulo = f"Cumpleaños de {mes_nom}" if mes_nom else "Cumpleaños del mes"
    if anio:
        titulo = f"{titulo} {anio}"
    msg = (mensaje or "").strip() or _mensaje_default()

    cards = []
    for it in items or []:
        dia = int(it.get("dia") or 0)
        nombre = it.get("nombre_completo") or it.get("primer_nombre") or "—"
        emp = it.get("empresa_abrev") or it.get("empresa_nombre") or "—"
        cards.append(
            f'<td class="card">'
            f'<div class="dia">{_esc(f"{dia:02d}")}</div>'
            f'<div class="nom">{_esc(nombre)}</div>'
            f'<div class="emp">{_esc(emp)}</div>'
            f"</td>"
        )

    rows_html = []
    if not cards:
        rows_html.append(
            '<tr><td colspan="3" class="empty">Ningún colaborador activo cumple años este mes.</td></tr>'
        )
    else:
        for i in range(0, len(cards), 3):
            chunk = cards[i : i + 3]
            while len(chunk) < 3:
                chunk.append('<td class="card empty-cell"></td>')
            rows_html.append("<tr>" + "".join(chunk) + "</tr>")

    foot_extra = f" · {_esc(titular)}" if (titular or "").strip() else ""

    css = f"""
@page {{ size: letter; margin: 1cm; }}
body {{
  font-family: Helvetica, Arial, sans-serif;
  background: {pal['bg']};
  color: {pal['text']};
  font-size: 10pt;
}}
.banner {{
  background: {pal['bg']};
  border: 1.5pt solid {pal['border']};
  border-radius: 10pt;
  padding: 12pt 10pt 14pt;
}}
h1 {{
  text-align: center;
  color: {pal['accent']};
  font-size: 18pt;
  margin: 0 0 4pt 0;
  font-weight: bold;
}}
.decor {{
  text-align: center;
  font-size: 13pt;
  margin: 0 0 4pt 0;
  letter-spacing: 3pt;
}}
.decor2 {{
  text-align: center;
  font-size: 11pt;
  margin: 0 0 8pt 0;
  letter-spacing: 2pt;
  opacity: 0.92;
}}
.msg {{
  text-align: center;
  font-size: 9.5pt;
  color: {pal['muted']};
  margin: 0 0 12pt 0;
  line-height: 1.4;
  padding: 0 14pt;
  font-weight: bold;
}}
table.collage {{
  width: 100%;
  border-collapse: separate;
  border-spacing: 7pt;
}}
td.card {{
  width: 33%;
  background: {pal['card']};
  border: 1.8pt solid {pal['border']};
  border-radius: 9pt;
  padding: 11pt 8pt;
  text-align: center;
  vertical-align: middle;
}}
td.empty-cell {{ background: transparent; border: none; }}
.dia {{
  font-size: 16pt;
  font-weight: bold;
  color: {pal['accent']};
}}
.nom {{
  font-size: 9.5pt;
  font-weight: bold;
  margin-top: 4pt;
  color: {pal['text']};
}}
.emp {{
  font-size: 7.5pt;
  color: {pal['muted']};
  margin-top: 3pt;
  font-weight: bold;
}}
.empty {{
  text-align: center;
  color: {pal['muted']};
  padding: 24pt;
}}
.foot {{
  text-align: center;
  font-size: 7.5pt;
  color: {pal['muted']};
  margin-top: 12pt;
}}
"""
    return (
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>"
        f"<style>{css}</style></head><body>"
        '<div class="banner">'
        f"<div class=\"decor\">{_esc(pal['decor'])}</div>"
        f"<div class=\"decor2\">{_esc(pal['decor2'])}</div>"
        f"<h1>{_esc(titulo)}</h1>"
        f"<p class=\"msg\">{_esc(msg)}</p>"
        f"<table class=\"collage\">{''.join(rows_html)}</table>"
        f"<p class=\"foot\">ClaraCore · Recursos Humanos · {_esc(pal['nombre'])}{foot_extra}</p>"
        "</div>"
        "</body></html>"
    )


def generar_pdf_cumpleanos_mes(payload: Dict[str, Any]) -> bytes:
    """payload = salida de list_cumpleanos_mes."""
    html_doc = construir_html_cumpleanos(
        mes=int(payload.get("mes") or 1),
        anio=payload.get("anio"),
        items=payload.get("items") or [],
        plantilla_id=int(payload.get("plantilla_id") or 0),
        mensaje=payload.get("mensaje_motivacional"),
        titular=payload.get("titular_contrato"),
    )
    return to_pdf_bytes(html_doc, landscape=False)
