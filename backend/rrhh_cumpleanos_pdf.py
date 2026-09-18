"""
PDF festivo — cumpleaños del mes (RRHH).
4 plantillas visuales; rotación cada 4 meses (plantilla_id 0–3).
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

# Colores por plantilla (fondo, acento, tarjeta, texto)
_PLANTILLAS = (
    {  # 0 — confeti coral
        "id": 0,
        "nombre": "Confeti coral",
        "bg": "#FFF1F2",
        "accent": "#E11D48",
        "card": "#FFE4E6",
        "border": "#FB7185",
        "text": "#881337",
        "muted": "#9F1239",
        "decor": "🎈 🎉 🎂 🎊",
    },
    {  # 1 — fiesta cyan
        "id": 1,
        "nombre": "Fiesta cyan",
        "bg": "#ECFEFF",
        "accent": "#0891B2",
        "card": "#CFFAFE",
        "border": "#22D3EE",
        "text": "#164E63",
        "muted": "#155E75",
        "decor": "🎊 🎈 ✨ 🎁",
    },
    {  # 2 — globos violeta
        "id": 2,
        "nombre": "Globos violeta",
        "bg": "#F5F3FF",
        "accent": "#7C3AED",
        "card": "#EDE9FE",
        "border": "#A78BFA",
        "text": "#4C1D95",
        "muted": "#5B21B6",
        "decor": "🎈 💜 🎂 🎉",
    },
    {  # 3 — sol dorado
        "id": 3,
        "nombre": "Sol dorado",
        "bg": "#FFFBEB",
        "accent": "#D97706",
        "card": "#FEF3C7",
        "border": "#FBBF24",
        "text": "#78350F",
        "muted": "#92400E",
        "decor": "🌟 🎂 🎁 ✨",
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

    # Collage en filas de 3
    rows_html = []
    if not cards:
        rows_html.append(
            '<tr><td colspan="3" class="empty">Sin cumpleaños de colaboradores activos este mes.</td></tr>'
        )
    else:
        for i in range(0, len(cards), 3):
            chunk = cards[i : i + 3]
            while len(chunk) < 3:
                chunk.append('<td class="card empty-cell"></td>')
            rows_html.append("<tr>" + "".join(chunk) + "</tr>")

    css = f"""
@page {{ size: letter; margin: 1.2cm; }}
body {{
  font-family: Helvetica, Arial, sans-serif;
  background: {pal['bg']};
  color: {pal['text']};
  font-size: 10pt;
}}
h1 {{
  text-align: center;
  color: {pal['accent']};
  font-size: 18pt;
  margin: 0 0 4pt 0;
}}
.decor {{
  text-align: center;
  font-size: 14pt;
  margin: 0 0 8pt 0;
  letter-spacing: 4pt;
}}
.msg {{
  text-align: center;
  font-size: 9.5pt;
  color: {pal['muted']};
  margin: 0 0 12pt 0;
  line-height: 1.35;
  padding: 0 18pt;
}}
table.collage {{
  width: 100%;
  border-collapse: separate;
  border-spacing: 8pt;
}}
td.card {{
  width: 33%;
  background: {pal['card']};
  border: 1.5pt solid {pal['border']};
  border-radius: 8pt;
  padding: 10pt 8pt;
  text-align: center;
  vertical-align: top;
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
  font-size: 8pt;
  color: {pal['muted']};
  margin-top: 3pt;
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
  margin-top: 14pt;
}}
"""
    return (
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>"
        f"<style>{css}</style></head><body>"
        f"<div class=\"decor\">{_esc(pal['decor'])}</div>"
        f"<h1>{_esc(titulo)}</h1>"
        f"<p class=\"msg\">{_esc(msg)}</p>"
        f"<table class=\"collage\">{''.join(rows_html)}</table>"
        f"<p class=\"foot\">ClaraCore · Recursos Humanos · {_esc(pal['nombre'])}</p>"
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
    )
    return to_pdf_bytes(html_doc, landscape=False)
