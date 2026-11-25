"""Informe de horas extras del personal (Bitácora) — PDF / Word.

Filas: una por trabajador×fecha con tiempo extra > 0.
Reutiliza listado de diarios del rango, cálculo de horas extra y paleta/logos
institucionales de Bitácora / Informes.
"""
from __future__ import annotations

import html
import io
import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from bitacora_export_rango import list_diarios_rango
from bitacora_horario import calcular_horas_extra, get_horario_contrato, normalize_horario
from bitacora_pdf import _palette
from bitacora_service import contrato_meta_bitacora
from topografia_utils import to_pdf_bytes

_log = logging.getLogger("claracore.bitacora.horas_extra")

CODIGO_FORMATO_HORAS_EXTRA = "CC-BIT-HE-001"
TITULO_FORMATO_HORAS_EXTRA = "INFORME DE HORAS EXTRAS DEL PERSONAL"
VERSION_FORMATO_HORAS_EXTRA = "1.0"

EMPRESA_SIN_NOMBRE = "Sin empresa"


def _esc(s: Any) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


def _key_empresa(nombre: Any) -> str:
    raw = str(nombre or "").strip().lower()
    if not raw:
        return "__sin_empresa__"
    raw = unicodedata.normalize("NFKD", raw)
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw or "__sin_empresa__"


def _nombre_empresa_asistencia(row: dict) -> str:
    for k in ("subcontratista_nombre", "empresa_nombre", "empresa"):
        v = str((row or {}).get(k) or "").strip()
        if v:
            return v
    return EMPRESA_SIN_NOMBRE


def _fmt_hora(raw: Any) -> str:
    s = str(raw or "").strip()
    if not s:
        return "—"
    return s[:5]


def _fmt_extra(n: float) -> str:
    try:
        v = float(n)
    except (TypeError, ValueError):
        return "0.00"
    if v <= 0:
        return "0.00"
    return f"{v:.2f}"


def _fmt_fecha_es(iso: str) -> str:
    s = str(iso or "").strip()[:10]
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if not m:
        return s or "—"
    return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"


def _usuario_nombre(u: Optional[dict]) -> str:
    if not isinstance(u, dict):
        return "—"
    full = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()
    return full or str(u.get("email") or "").strip() or "—"


def _usuario_cargo(u: Optional[dict]) -> str:
    if not isinstance(u, dict):
        return ""
    return str(u.get("cargo_nombre") or u.get("cargo") or "").strip()


def _extra_de_fila(row: dict, *, horario, fecha_iso: str) -> float:
    stored = row.get("horas_extra")
    try:
        if stored is not None and stored != "":
            v = float(stored)
            if v > 0:
                return round(v, 2)
    except (TypeError, ValueError):
        pass
    try:
        return float(calcular_horas_extra(
            hora_ingreso=row.get("hora_ingreso"),
            hora_salida=row.get("hora_salida"),
            horario=horario,
            fecha_iso=fecha_iso,
        ) or 0)
    except Exception:
        return 0.0


def _justificacion(row: dict) -> str:
    return str(
        row.get("justificacion_horas_extra")
        or row.get("justificacion_extra")
        or row.get("justificacion")
        or row.get("observacion")
        or ""
    ).strip()


def construir_filas_horas_extra(
    diarios: List[dict],
    *,
    empresa_key: Optional[str] = None,
    horario_contrato=None,
) -> List[dict]:
    """Filas con tiempo extra > 0, orden fecha → nombre."""
    emp_filtro = _key_empresa(empresa_key) if empresa_key else None
    if emp_filtro == "__sin_empresa__" and not str(empresa_key or "").strip():
        emp_filtro = None

    out: List[dict] = []
    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        if str(d.get("tipo") or "diario").lower() != "diario":
            continue
        fecha = str(d.get("fecha") or "").strip()[:10]
        if not fecha:
            continue
        try:
            if d.get("horario_aplicado"):
                horario = normalize_horario(d.get("horario_aplicado"))
            else:
                horario = horario_contrato
        except Exception:
            horario = horario_contrato

        asistencia = d.get("asistencia_colaboradores")
        if not isinstance(asistencia, list):
            asistencia = []
        for a in asistencia:
            if not isinstance(a, dict):
                continue
            nombre = str(a.get("nombre") or "").strip()
            if not nombre:
                continue
            empresa = _nombre_empresa_asistencia(a)
            if emp_filtro and _key_empresa(empresa) != emp_filtro:
                continue
            extra = _extra_de_fila(a, horario=horario, fecha_iso=fecha)
            if extra <= 0:
                continue
            out.append({
                "nombre": nombre,
                "documento": re.sub(r"\D+", "", str(a.get("documento_numero") or "")) or "—",
                "fecha": fecha,
                "hora_inicio": _fmt_hora(a.get("hora_ingreso")),
                "hora_fin": _fmt_hora(a.get("hora_salida")),
                "tiempo_extra": extra,
                "observacion": _justificacion(a) or "—",
                "empresa": empresa,
                "empresa_key": _key_empresa(empresa),
            })

    # Agrupar por colaborador: nombre → documento → fechas cronológicas.
    out.sort(key=lambda r: (
        r["nombre"].lower(),
        r.get("documento") or "",
        r["fecha"],
    ))
    return out


def filas_informe_agrupadas(filas: List[dict]) -> List[dict]:
    """
    Convierte filas detalle en filas de vista:
      - detalle (No = índice de colaborador; nombre/doc en cada fila)
      - subtotal por colaborador
      - total general al final
    """
    if not filas:
        return []

    groups: List[Tuple[str, str, List[dict]]] = []
    cur_key: Optional[Tuple[str, str]] = None
    cur_rows: List[dict] = []
    for r in filas:
        if not isinstance(r, dict):
            continue
        key = (str(r.get("nombre") or "").strip(), str(r.get("documento") or "").strip())
        if cur_key is None:
            cur_key = key
            cur_rows = [r]
            continue
        if key != cur_key:
            groups.append((cur_key[0], cur_key[1], cur_rows))
            cur_key = key
            cur_rows = [r]
        else:
            cur_rows.append(r)
    if cur_key is not None and cur_rows:
        groups.append((cur_key[0], cur_key[1], cur_rows))

    vista: List[dict] = []
    total_general = 0.0
    for idx, (nombre, documento, rows) in enumerate(groups, 1):
        subtotal = 0.0
        for r in rows:
            try:
                extra = float(r.get("tiempo_extra") or 0)
            except (TypeError, ValueError):
                extra = 0.0
            if extra < 0:
                extra = 0.0
            subtotal += extra
            vista.append({
                "tipo": "detalle",
                "no": idx,
                "nombre": nombre,
                "documento": documento or "—",
                "fecha": r.get("fecha") or "",
                "hora_inicio": r.get("hora_inicio") or "—",
                "hora_fin": r.get("hora_fin") or "—",
                "tiempo_extra": extra,
                "observacion": r.get("observacion") or "—",
                "empresa": r.get("empresa"),
                "empresa_key": r.get("empresa_key"),
            })
        total_general += subtotal
        vista.append({
            "tipo": "subtotal",
            "no": "",
            "nombre": nombre,
            "documento": documento or "—",
            "fecha": "",
            "hora_inicio": "",
            "hora_fin": "",
            "tiempo_extra": round(subtotal, 2),
            "observacion": "Subtotal",
        })

    vista.append({
        "tipo": "total",
        "no": "",
        "nombre": "",
        "documento": "",
        "fecha": "",
        "hora_inicio": "",
        "hora_fin": "",
        "tiempo_extra": round(total_general, 2),
        "observacion": "Total general",
    })
    return vista


def empresas_con_personal_reportado(diarios: List[dict]) -> List[dict]:
    """Empresas que aparecen en asistencia de los diarios (para el selector)."""
    seen: Dict[str, str] = {}
    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        for a in d.get("asistencia_colaboradores") or []:
            if not isinstance(a, dict):
                continue
            if not str(a.get("nombre") or "").strip():
                continue
            nombre = _nombre_empresa_asistencia(a)
            key = _key_empresa(nombre)
            if key not in seen:
                seen[key] = nombre
    items = [{"key": k, "nombre": n} for k, n in seen.items()]
    items.sort(key=lambda x: (x["nombre"] == EMPRESA_SIN_NOMBRE, x["nombre"].lower()))
    return items


def opciones_informe_horas_extra(
    sb,
    contrato_id: int,
    *,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: Optional[str] = None,
) -> dict:
    """Empresas + usuarios; si viene empresa_key, también filas de preview."""
    from seguimiento_service import list_usuarios_contrato_enriquecidos

    diarios = list_diarios_rango(sb, contrato_id, fecha_desde, fecha_hasta)
    try:
        horario_contrato = get_horario_contrato(sb, int(contrato_id))
    except Exception:
        horario_contrato = None
    usuarios = list_usuarios_contrato_enriquecidos(sb, int(contrato_id)) or []
    usuarios_out = []
    for u in usuarios:
        if not isinstance(u, dict):
            continue
        # Solo usuarios reales del contrato para firmas / responsable.
        if u.get("es_externo"):
            continue
        usuarios_out.append({
            "id": u.get("id"),
            "nombre": _usuario_nombre(u),
            "cargo": _usuario_cargo(u),
            "email": u.get("email") or "",
        })
    empresas = empresas_con_personal_reportado(diarios)
    filas: List[dict] = []
    emp = str(empresa_key or "").strip()
    if emp:
        detalle = construir_filas_horas_extra(
            diarios,
            empresa_key=emp,
            horario_contrato=horario_contrato,
        )
        filas = filas_informe_agrupadas(detalle)
    return {
        "empresas": empresas,
        "usuarios": usuarios_out,
        "filas": filas,
        "diarios_count": len(diarios),
        "formato": {
            "codigo": CODIGO_FORMATO_HORAS_EXTRA,
            "version": VERSION_FORMATO_HORAS_EXTRA,
            "titulo": TITULO_FORMATO_HORAS_EXTRA,
        },
    }


def _resolver_usuario(usuarios: List[dict], usuario_id: Optional[int]) -> Optional[dict]:
    if usuario_id is None:
        return None
    try:
        uid = int(usuario_id)
    except (TypeError, ValueError):
        return None
    for u in usuarios or []:
        try:
            if int(u.get("id")) == uid:
                return u
        except (TypeError, ValueError):
            continue
    return None


def _cargar_usuarios_por_ids(sb, usuario_ids: List[Optional[int]]) -> Dict[int, dict]:
    """Carga solo los firmantes/responsable pedidos (evita listar todo el contrato)."""
    ids: List[int] = []
    for raw in usuario_ids or []:
        if raw is None or raw == "":
            continue
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            continue
    ids = list(dict.fromkeys(ids))
    if not ids:
        return {}
    try:
        users = (
            sb.table("usuarios")
            .select("id, nombre, apellidos, email, cargo_id, activo")
            .in_("id", ids)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("horas_extra usuarios por id: %s", exc)
        return {}
    cargo_ids = list({u.get("cargo_id") for u in users if u.get("cargo_id")})
    cargos: Dict[Any, Any] = {}
    if cargo_ids:
        try:
            crows = (
                sb.table("cargos")
                .select("id, nombre")
                .in_("id", cargo_ids)
                .execute()
                .data
                or []
            )
            cargos = {c["id"]: c.get("nombre") for c in crows}
        except Exception:
            cargos = {}
    out: Dict[int, dict] = {}
    for u in users:
        if not isinstance(u, dict):
            continue
        try:
            uid = int(u.get("id"))
        except (TypeError, ValueError):
            continue
        row = dict(u)
        cid = u.get("cargo_id")
        if cid is not None and cid in cargos:
            row["cargo_nombre"] = cargos[cid]
            row["cargo"] = cargos[cid]
        out[uid] = row
    return out


def construir_informe_horas_extra(
    sb,
    contrato_id: int,
    *,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: str,
    responsable_id: Optional[int] = None,
    elaborador_id: Optional[int] = None,
    aprobador_id: Optional[int] = None,
) -> dict:
    """Arma el payload del informe o lanza ValueError si no hay filas."""
    import time as _time

    if not str(empresa_key or "").strip():
        raise ValueError("Seleccione la empresa a la cual se genera el tiempo extra.")

    t0 = _time.perf_counter()
    diarios = list_diarios_rango(sb, contrato_id, fecha_desde, fecha_hasta)
    t_diarios = _time.perf_counter()
    try:
        horario_contrato = get_horario_contrato(sb, int(contrato_id))
    except Exception:
        horario_contrato = None

    detalle = construir_filas_horas_extra(
        diarios,
        empresa_key=empresa_key,
        horario_contrato=horario_contrato,
    )
    if not detalle:
        raise ValueError(
            "No hay tiempo extra registrado para el rango y la empresa seleccionados."
        )
    filas = filas_informe_agrupadas(detalle)
    t_filas = _time.perf_counter()

    contrato = contrato_meta_bitacora(sb, int(contrato_id)) or {}
    users_by_id = _cargar_usuarios_por_ids(
        sb, [responsable_id, elaborador_id, aprobador_id],
    )

    def _by_id(raw_id: Optional[int]) -> Optional[dict]:
        if raw_id is None:
            return None
        try:
            return users_by_id.get(int(raw_id))
        except (TypeError, ValueError):
            return None

    resp = _by_id(responsable_id)
    elaboro = _by_id(elaborador_id)
    aprobo = _by_id(aprobador_id)
    t_meta = _time.perf_counter()

    emp_key = _key_empresa(empresa_key)
    emp_nombre = None
    for e in empresas_con_personal_reportado(diarios):
        if e["key"] == emp_key:
            emp_nombre = e["nombre"]
            break
    if not emp_nombre:
        emp_nombre = detalle[0].get("empresa") or EMPRESA_SIN_NOMBRE

    _log.info(
        "horas_extra payload contrato=%s diarios=%s filas=%s "
        "ms_diarios=%.0f ms_filas=%.0f ms_meta=%.0f",
        contrato_id,
        len(diarios or []),
        len(filas),
        (t_diarios - t0) * 1000,
        (t_filas - t_diarios) * 1000,
        (t_meta - t_filas) * 1000,
    )

    return {
        "contrato": contrato,
        "fecha_desde": str(fecha_desde)[:10],
        "fecha_hasta": str(fecha_hasta)[:10],
        "empresa": emp_nombre,
        "empresa_key": emp_key,
        "responsable": {
            "nombre": _usuario_nombre(resp),
            "cargo": _usuario_cargo(resp),
        },
        "elaboro": {
            "nombre": _usuario_nombre(elaboro),
            "cargo": _usuario_cargo(elaboro) or "Elaboró",
        },
        "aprobo": {
            "nombre": _usuario_nombre(aprobo),
            "cargo": _usuario_cargo(aprobo) or "Aprobó",
        },
        "filas": filas,
        "formato": {
            "codigo": CODIGO_FORMATO_HORAS_EXTRA,
            "version": VERSION_FORMATO_HORAS_EXTRA,
            "titulo": TITULO_FORMATO_HORAS_EXTRA,
        },
    }


# Filas de cuerpo (detalle+subtotal) a partir de las cuales una sola hoja carta
# landscape ya no alcanza con encabezado+meta+firmas → cierre en hoja final.
_PDF_FORCE_CLOSING_BODY_ROWS = 29


def _html_informe(payload: dict) -> str:
    """
    HTML del PDF. Prioridades de paginación (xhtml2pdf):
    1) Encabezado 3 paneles + datos generales unidos al inicio de la tabla.
    2) Firmas en la misma hoja que el final de la tabla (total + filas finales).
    Nunca hojas con solo encabezado o solo firmas.
    """
    import time as _time

    t0 = _time.perf_counter()
    contrato = payload.get("contrato") or {}
    pal = _palette(contrato)
    t1 = pal.get("titulo_1") or {"bg": "#0077B6", "text": "#FFFFFF"}
    t2 = pal.get("titulo_2") or {"bg": "#E5F4FA", "text": "#1F4E70"}
    fmt = payload.get("formato") or {}
    filas = payload.get("filas") or []

    # Solo el logo que se pinta (no los 3). Bitmap ya acotado; width/height fijos
    # porque xhtml2pdf ignora max-height/max-width CSS.
    logo_uri = ""
    try:
        from pdf_institucional import prepare_image_for_pdf

        raw_logo = str(contrato.get("logo_contratista") or "").strip()
        if raw_logo:
            logo_uri = prepare_image_for_pdf(
                raw_logo, max_px_w=120, max_px_h=56, allow_http=True,
            ) or ""
    except Exception as exc:
        _log.debug("logo horas extra: %s", exc)
    if logo_uri:
        logo_html = (
            f'<img src="{_esc(logo_uri)}" width="90" height="42" '
            f'style="width:90pt;height:42pt;" alt="Logo"/>'
        )
    else:
        logo_html = (
            f'<div style="font-size:9pt;font-weight:bold;color:{t1["text"]};">'
            f'{_esc(contrato.get("contratista") or "ClaraCore")}</div>'
        )
    t_logo = _time.perf_counter()

    body_rows: List[str] = []
    total_row_html = ""
    det_i = 0
    for r in filas:
        tipo = str(r.get("tipo") or "detalle")
        if tipo == "subtotal":
            bg = t2.get("bg") or "#E5F4FA"
            body_rows.append(
                "<tr class=\"subtotal\" style=\"background:%s;font-weight:bold;"
                "page-break-before:avoid;\">"
                "<td style=\"text-align:center;\"></td>"
                "<td colspan=\"5\">Subtotal · %s</td>"
                "<td style=\"text-align:center;\">%s</td>"
                "<td></td>"
                "</tr>" % (
                    bg,
                    _esc(r.get("nombre") or ""),
                    _esc(_fmt_extra(r.get("tiempo_extra"))),
                )
            )
            continue
        if tipo == "total":
            bg = t1.get("bg") or "#0077B6"
            fg = t1.get("text") or "#FFFFFF"
            total_row_html = (
                "<tr class=\"total\" style=\"background:%s;color:%s;font-weight:bold;"
                "page-break-after:avoid;-pdf-keep-with-next:true;\">"
                "<td style=\"text-align:center;\"></td>"
                "<td colspan=\"5\">Total general</td>"
                "<td style=\"text-align:center;\">%s</td>"
                "<td></td>"
                "</tr>" % (
                    bg,
                    fg,
                    _esc(_fmt_extra(r.get("tiempo_extra"))),
                )
            )
            continue
        det_i += 1
        bg = "#FFFFFF" if det_i % 2 else "#F8FAFC"
        body_rows.append(
            "<tr style=\"background:%s;\">"
            "<td style=\"text-align:center;\">%s</td>"
            "<td>%s</td>"
            "<td style=\"text-align:center;\">%s</td>"
            "<td style=\"text-align:center;\">%s</td>"
            "<td style=\"text-align:center;\">%s</td>"
            "<td style=\"text-align:center;\">%s</td>"
            "<td style=\"text-align:center;font-weight:bold;\">%s</td>"
            "<td>%s</td>"
            "</tr>" % (
                bg,
                _esc(r.get("no") if r.get("no") not in (None, "") else ""),
                _esc(r.get("nombre")),
                _esc(r.get("documento")),
                _esc(_fmt_fecha_es(r.get("fecha"))),
                _esc(r.get("hora_inicio")),
                _esc(r.get("hora_fin")),
                _esc(_fmt_extra(r.get("tiempo_extra"))),
                _esc(r.get("observacion")),
            )
        )

    elaboro = payload.get("elaboro") or {}
    aprobo = payload.get("aprobo") or {}
    responsable = payload.get("responsable") or {}

    firmas_row = f"""
<tr class="firmas-row">
  <td colspan="4" style="vertical-align:top;padding:6pt 10pt;">
    <div class="lbl">Elaboró</div>
    <div class="line"></div>
    <div class="nom">{_esc(elaboro.get("nombre") or "—")}</div>
    <div class="cargo">{_esc(elaboro.get("cargo") or "")}</div>
  </td>
  <td colspan="4" style="vertical-align:top;padding:6pt 10pt;">
    <div class="lbl">Aprobó</div>
    <div class="line"></div>
    <div class="nom">{_esc(aprobo.get("nombre") or "—")}</div>
    <div class="cargo">{_esc(aprobo.get("cargo") or "")}</div>
  </td>
</tr>"""

    closing_body = f"{total_row_html}{firmas_row}"
    thead_html = """
<thead>
<tr>
  <th style="width:5%;">No</th>
  <th style="width:20%;">Nombre colaborador</th>
  <th style="width:11%;">No. Documento</th>
  <th style="width:9%;">Fecha</th>
  <th style="width:11%;">Hora de inicio de jornada</th>
  <th style="width:11%;">Hora fin de jornada</th>
  <th style="width:9%;">Tiempo extra</th>
  <th style="width:24%;">Observación</th>
</tr>
</thead>"""

    # Multi-página: mover últimos grupos + total + firmas a hoja final (evita
    # firmas solas). Encabezado va con keep-with-next al inicio de la grilla.
    force_closing_page = len(body_rows) >= _PDF_FORCE_CLOSING_BODY_ROWS
    main_rows = list(body_rows)
    trail_rows: List[str] = []
    if force_closing_page and main_rows:
        sub_idx = [i for i, tr in enumerate(main_rows) if 'class="subtotal"' in tr]
        if len(sub_idx) >= 2:
            start = sub_idx[-2] + 1
        elif len(sub_idx) == 1:
            start = max(0, sub_idx[0] - 3)
        else:
            start = max(0, len(main_rows) - 6)
        trail_rows = main_rows[start:]
        main_rows = main_rows[:start]

    main_html = "".join(main_rows)
    if force_closing_page:
        trail_html = "".join(trail_rows)
        grid_html = (
            f'<table class="grid">{thead_html}<tbody>{main_html}</tbody></table>'
            f'<div style="page-break-before:always;">'
            f'<table class="grid">{thead_html}'
            f'<tbody class="closing" style="page-break-inside:avoid;">'
            f"{trail_html}{closing_body}</tbody></table></div>"
        )
    else:
        grid_html = (
            f'<table class="grid">{thead_html}'
            f'<tbody class="closing">{main_html}{closing_body}</tbody></table>'
        )

    # -pdf-keep-with-next en hdr/meta: sin esto xhtml2pdf deja el encabezado
    # solo en la primera hoja cuando la grilla pasa a la siguiente.
    html_doc = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page {{
    size: letter landscape;
    margin: 2mm;
  }}
  html, body {{
    margin: 0;
    padding: 0;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 8.5pt;
    color: #0F2942;
  }}
  .hdr {{ width: 100%; margin: 0 0 4pt 0; }}
  .hdr td {{
    border: 1pt solid {t1["bg"]};
    background: {t1["bg"]};
    color: {t1["text"]};
    padding: 8pt;
    vertical-align: middle;
  }}
  .hdr .logo {{ width: 18%; text-align: center; background: #FFFFFF; }}
  .hdr .title {{ width: 52%; text-align: center; font-size: 12pt; font-weight: bold; }}
  .hdr .calidad {{ width: 30%; text-align: center; font-size: 8pt; white-space: pre-line; }}
  .meta {{ width: 100%; margin: 0 0 4pt 0; font-size: 8pt; }}
  .meta td {{ border: 0.6pt solid #94A3B8; padding: 4pt 6pt; }}
  .meta .lbl {{ font-weight: bold; background: {t2["bg"]}; color: {t2["text"]}; width: 18%; }}
  table.grid {{ width: 100%; font-size: 7pt; margin: 0; }}
  table.grid th, table.grid td {{
    border: 0.6pt solid #64748B;
    padding: 1.5pt 3pt;
    word-wrap: break-word;
    vertical-align: middle;
    line-height: 1.15;
  }}
  table.grid th {{
    background: {t2["bg"]};
    color: {t2["text"]};
    font-size: 6pt;
    font-weight: bold;
  }}
  table.grid thead {{ display: table-header-group; }}
  table.grid tbody {{ display: table-row-group; }}
  table.grid tr.firmas-row td {{
    border: 0.6pt solid #94A3B8;
    background: #FFFFFF;
    color: #0F2942;
  }}
  .lbl {{ font-size: 8pt; font-weight: bold; color: {t2["text"]}; margin-bottom: 10pt; }}
  .line {{ border-bottom: 0.8pt solid #64748B; height: 36pt; margin-bottom: 6pt; }}
  .nom {{ font-size: 8.5pt; font-weight: bold; }}
  .cargo {{ font-size: 7.5pt; color: #475569; }}
</style></head><body>
<table class="hdr" style="-pdf-keep-with-next:true;page-break-after:avoid;"><tr>
  <td class="logo">{logo_html}</td>
  <td class="title">{_esc(fmt.get("titulo") or TITULO_FORMATO_HORAS_EXTRA)}</td>
  <td class="calidad">{_esc(fmt.get("codigo") or CODIGO_FORMATO_HORAS_EXTRA)}
Versión {_esc(fmt.get("version") or VERSION_FORMATO_HORAS_EXTRA)}
{_esc(_fmt_fecha_es(payload.get("fecha_hasta")))}</td>
</tr></table>

<table class="meta" style="-pdf-keep-with-next:true;page-break-after:avoid;">
<tr>
  <td class="lbl">Contrato</td>
  <td>{_esc(contrato.get("numero") or "—")}</td>
  <td class="lbl">Objeto</td>
  <td colspan="3">{_esc(contrato.get("objeto") or "—")}</td>
</tr>
<tr>
  <td class="lbl">Empresa (tiempo extra)</td>
  <td>{_esc(payload.get("empresa") or "—")}</td>
  <td class="lbl">Responsable de obra</td>
  <td>{_esc(responsable.get("nombre") or "—")}</td>
  <td class="lbl">Periodo</td>
  <td>{_esc(_fmt_fecha_es(payload.get("fecha_desde")))} – {_esc(_fmt_fecha_es(payload.get("fecha_hasta")))}</td>
</tr>
</table>

{grid_html}
</body></html>"""
    _log.info(
        "horas_extra html filas=%s body_rows=%s force_closing=%s logo_ms=%.0f html_ms=%.0f",
        len(filas),
        len(body_rows),
        force_closing_page,
        (t_logo - t0) * 1000,
        (_time.perf_counter() - t0) * 1000,
    )
    return html_doc


def generar_pdf_horas_extra(payload: dict) -> bytes:
    import time as _time

    t0 = _time.perf_counter()
    html_doc = _html_informe(payload)
    t1 = _time.perf_counter()
    pdf = to_pdf_bytes(html_doc, landscape=True)
    _log.info(
        "horas_extra pdf html_ms=%.0f pisa_ms=%.0f bytes=%s",
        (t1 - t0) * 1000,
        (_time.perf_counter() - t1) * 1000,
        len(pdf or b""),
    )
    return pdf


def generar_docx_horas_extra(payload: dict) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    from docx.shared import Cm, Pt, RGBColor

    doc = Document()
    section = doc.sections[0]
    section.orientation = 1  # landscape
    section.page_width = Cm(27.94)
    section.page_height = Cm(21.59)
    section.left_margin = Cm(1.2)
    section.right_margin = Cm(1.2)
    section.top_margin = Cm(1.2)
    section.bottom_margin = Cm(1.2)

    fmt = payload.get("formato") or {}
    contrato = payload.get("contrato") or {}

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(str(fmt.get("titulo") or TITULO_FORMATO_HORAS_EXTRA))
    run.bold = True
    run.font.size = Pt(14)

    meta = doc.add_paragraph()
    meta.add_run(
        f"Código: {fmt.get('codigo') or CODIGO_FORMATO_HORAS_EXTRA}  ·  "
        f"Versión: {fmt.get('version') or VERSION_FORMATO_HORAS_EXTRA}"
    ).font.size = Pt(9)

    for label, value in (
        ("Contrato", contrato.get("numero") or "—"),
        ("Objeto", contrato.get("objeto") or "—"),
        ("Empresa (tiempo extra)", payload.get("empresa") or "—"),
        ("Responsable de obra", (payload.get("responsable") or {}).get("nombre") or "—"),
        (
            "Periodo",
            f"{_fmt_fecha_es(payload.get('fecha_desde'))} – {_fmt_fecha_es(payload.get('fecha_hasta'))}",
        ),
    ):
        p = doc.add_paragraph()
        r = p.add_run(f"{label}: ")
        r.bold = True
        r.font.size = Pt(9)
        p.add_run(str(value)).font.size = Pt(9)

    headers = [
        "No", "Nombre colaborador", "No. Documento", "Fecha",
        "Hora de inicio de jornada", "Hora fin de jornada", "Tiempo extra", "Observación",
    ]
    filas = payload.get("filas") or []
    table = doc.add_table(rows=1 + len(filas), cols=len(headers))
    table.style = "Table Grid"
    cell_pt = Pt(6.5)  # −1.5 pt vs 8 pt anterior
    head_pt = Pt(6)
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = h
        for p in cell.paragraphs:
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            for run in p.runs:
                run.bold = True
                run.font.size = head_pt
        try:
            tc_pr = cell._tc.get_or_add_tcPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:fill"), "E5F4FA")
            shd.set(qn("w:val"), "clear")
            tc_pr.append(shd)
        except Exception:
            pass

    def _shade(cell, fill: str):
        try:
            tc_pr = cell._tc.get_or_add_tcPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:fill"), fill)
            shd.set(qn("w:val"), "clear")
            tc_pr.append(shd)
        except Exception:
            pass

    for ri, r in enumerate(filas):
        tipo = str(r.get("tipo") or "detalle")
        if tipo == "subtotal":
            vals = [
                "",
                f"Subtotal · {r.get('nombre') or ''}",
                r.get("documento") or "",
                "",
                "",
                "",
                _fmt_extra(r.get("tiempo_extra")),
                "",
            ]
            fill = "E5F4FA"
            bold = True
        elif tipo == "total":
            vals = [
                "",
                "Total general",
                "",
                "",
                "",
                "",
                _fmt_extra(r.get("tiempo_extra")),
                "",
            ]
            fill = "0077B6"
            bold = True
        else:
            vals = [
                str(r.get("no") if r.get("no") not in (None, "") else ""),
                r.get("nombre") or "",
                r.get("documento") or "",
                _fmt_fecha_es(r.get("fecha")),
                r.get("hora_inicio") or "",
                r.get("hora_fin") or "",
                _fmt_extra(r.get("tiempo_extra")),
                r.get("observacion") or "",
            ]
            fill = None
            bold = False
        for ci, val in enumerate(vals):
            cell = table.rows[ri + 1].cells[ci]
            cell.text = str(val)
            if fill:
                _shade(cell, fill)
            for p in cell.paragraphs:
                p.paragraph_format.space_before = Pt(0)
                p.paragraph_format.space_after = Pt(0)
                for run in p.runs:
                    run.font.size = cell_pt
                    run.bold = bold
                    if tipo == "total":
                        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    # Repeat header on each page
    try:
        tbl = table._tbl
        tr = tbl.tr_lst[0]
        trPr = tr.get_or_add_trPr()
        tblHeader = OxmlElement("w:tblHeader")
        trPr.append(tblHeader)
    except Exception:
        pass

    doc.add_paragraph("")
    firmas = doc.add_table(rows=1, cols=2)
    firmas.style = "Table Grid"
    elaboro = payload.get("elaboro") or {}
    aprobo = payload.get("aprobo") or {}
    for idx, (lbl, person) in enumerate((("Elaboró", elaboro), ("Aprobó", aprobo))):
        cell = firmas.rows[0].cells[idx]
        cell.text = ""
        p0 = cell.paragraphs[0]
        r0 = p0.add_run(lbl)
        r0.bold = True
        r0.font.size = Pt(9)
        cell.add_paragraph("")
        cell.add_paragraph("")
        p1 = cell.add_paragraph()
        r1 = p1.add_run(str(person.get("nombre") or "—"))
        r1.bold = True
        r1.font.size = Pt(9)
        p2 = cell.add_paragraph()
        r2 = p2.add_run(str(person.get("cargo") or ""))
        r2.font.size = Pt(8)
        r2.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def exportar_informe_horas_extra(
    sb,
    contrato_id: int,
    *,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: str,
    formato: str = "pdf",
    responsable_id: Optional[int] = None,
    elaborador_id: Optional[int] = None,
    aprobador_id: Optional[int] = None,
) -> Tuple[bytes, str, str]:
    """
    Returns (bytes, media_type, filename).
    Raises ValueError with user-facing message when empty / invalid.
    """
    import time as _time

    t0 = _time.perf_counter()
    payload = construir_informe_horas_extra(
        sb,
        contrato_id,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        empresa_key=empresa_key,
        responsable_id=responsable_id,
        elaborador_id=elaborador_id,
        aprobador_id=aprobador_id,
    )
    t_payload = _time.perf_counter()
    fmt = str(formato or "pdf").strip().lower()
    d0 = str(fecha_desde)[:10]
    d1 = str(fecha_hasta)[:10]
    if fmt in ("docx", "word", "doc"):
        data = generar_docx_horas_extra(payload)
        _log.info(
            "horas_extra export docx contrato=%s filas=%s payload_ms=%.0f total_ms=%.0f",
            contrato_id,
            len(payload.get("filas") or []),
            (t_payload - t0) * 1000,
            (_time.perf_counter() - t0) * 1000,
        )
        return (
            data,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            f"{CODIGO_FORMATO_HORAS_EXTRA}_horas_extra_{d0}_{d1}.docx",
        )
    data = generar_pdf_horas_extra(payload)
    _log.info(
        "horas_extra export pdf contrato=%s filas=%s payload_ms=%.0f total_ms=%.0f",
        contrato_id,
        len(payload.get("filas") or []),
        (t_payload - t0) * 1000,
        (_time.perf_counter() - t0) * 1000,
    )
    return data, "application/pdf", f"{CODIGO_FORMATO_HORAS_EXTRA}_horas_extra_{d0}_{d1}.pdf"
