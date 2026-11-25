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
from bitacora_he_clasificacion import clasificar_tiempo_extra
from bitacora_horario import calcular_horas_extra, get_horario_contrato, normalize_horario
from bitacora_pdf import _palette
from bitacora_service import contrato_meta_bitacora
from topografia_utils import to_pdf_bytes

_EXTRA_KEYS = (
    "extra_diurna",
    "extra_nocturna",
    "extra_festiva_diurna",
    "extra_festiva_nocturna",
)

_log = logging.getLogger("claracore.bitacora.horas_extra")

CODIGO_FORMATO_HORAS_EXTRA = "CC-BIT-HE-001"
TITULO_FORMATO_HORAS_EXTRA = "INFORME DE HORAS EXTRAS DEL PERSONAL"
VERSION_FORMATO_HORAS_EXTRA = "1.0"

EMPRESA_SIN_NOMBRE = "Sin empresa"


def _texto_unicode(s: Any) -> str:
    """NFC para que tildes/eñes lleguen bien a PDF/Word."""
    return unicodedata.normalize("NFC", str(s if s is not None else ""))


def _esc(s: Any) -> str:
    return html.escape(_texto_unicode(s), quote=True)


_NOMBRE_PARTICULAS = frozenset({
    "de", "del", "la", "las", "los", "y", "e", "da", "das", "do", "dos",
})


def _nombre_persona_informe(s: Any) -> str:
    """
    Nombre de persona para firmas/cabecera.
    Corrige artefactos tipo «EspaÑOl» → «Español» (mayúsculas internas
    tras un .title() defectuoso) sin tocar el contenido semántico.
    """
    raw = _texto_unicode(s).strip()
    if not raw or raw == "—":
        return raw or "—"
    parts = re.split(r"(\s+|-)", raw)
    out: List[str] = []
    word_i = 0
    for p in parts:
        if not p or p.isspace() or p == "-":
            out.append(p)
            continue
        low = p.lower()
        if word_i > 0 and low in _NOMBRE_PARTICULAS:
            out.append(low)
        elif len(p) == 1:
            out.append(p.upper())
        else:
            out.append(p[:1].upper() + p[1:].lower())
        word_i += 1
    return "".join(out)


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


def _fmt_extra(n: float, *, blank_zero: bool = False) -> str:
    try:
        v = float(n)
    except (TypeError, ValueError):
        return "" if blank_zero else "0.00"
    if v <= 0:
        return "" if blank_zero else "0.00"
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
            fecha=fecha_iso,
        ) or 0)
    except Exception:
        return 0.0


def _clasificar_fila(row: dict, *, horario, fecha_iso: str, total_extra: float) -> dict:
    try:
        return clasificar_tiempo_extra(
            hora_ingreso=row.get("hora_ingreso"),
            hora_salida=row.get("hora_salida"),
            fecha=fecha_iso,
            horario=horario,
            total_extra=total_extra,
        )
    except Exception:
        return {
            "extra_diurna": round(float(total_extra or 0), 2),
            "extra_nocturna": 0.0,
            "extra_festiva_diurna": 0.0,
            "extra_festiva_nocturna": 0.0,
            "tiempo_extra": round(float(total_extra or 0), 2),
        }


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
            tipos = _clasificar_fila(a, horario=horario, fecha_iso=fecha, total_extra=extra)
            out.append({
                "nombre": nombre,
                "documento": re.sub(r"\D+", "", str(a.get("documento_numero") or "")) or "—",
                "fecha": fecha,
                "hora_inicio": _fmt_hora(a.get("hora_ingreso")),
                "hora_fin": _fmt_hora(a.get("hora_salida")),
                "extra_diurna": float(tipos.get("extra_diurna") or 0),
                "extra_nocturna": float(tipos.get("extra_nocturna") or 0),
                "extra_festiva_diurna": float(tipos.get("extra_festiva_diurna") or 0),
                "extra_festiva_nocturna": float(tipos.get("extra_festiva_nocturna") or 0),
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
    total_buckets = {k: 0.0 for k in _EXTRA_KEYS}
    for idx, (nombre, documento, rows) in enumerate(groups, 1):
        subtotal = 0.0
        sub_buckets = {k: 0.0 for k in _EXTRA_KEYS}
        for r in rows:
            try:
                extra = float(r.get("tiempo_extra") or 0)
            except (TypeError, ValueError):
                extra = 0.0
            if extra < 0:
                extra = 0.0
            buckets = {}
            for k in _EXTRA_KEYS:
                try:
                    buckets[k] = max(0.0, float(r.get(k) or 0))
                except (TypeError, ValueError):
                    buckets[k] = 0.0
            # Si faltan tipos (filas legacy de test), todo a diurna.
            if extra > 0 and sum(buckets.values()) <= 0:
                buckets["extra_diurna"] = extra
            subtotal += extra
            for k in _EXTRA_KEYS:
                sub_buckets[k] += buckets[k]
            vista.append({
                "tipo": "detalle",
                "no": idx,
                "nombre": nombre,
                "documento": documento or "—",
                "fecha": r.get("fecha") or "",
                "hora_inicio": r.get("hora_inicio") or "—",
                "hora_fin": r.get("hora_fin") or "—",
                **{k: round(buckets[k], 2) for k in _EXTRA_KEYS},
                "tiempo_extra": extra,
                "observacion": r.get("observacion") or "—",
                "empresa": r.get("empresa"),
                "empresa_key": r.get("empresa_key"),
            })
        total_general += subtotal
        for k in _EXTRA_KEYS:
            total_buckets[k] += sub_buckets[k]
        vista.append({
            "tipo": "subtotal",
            "no": "",
            "nombre": nombre,
            "documento": documento or "—",
            "fecha": "",
            "hora_inicio": "",
            "hora_fin": "",
            **{k: round(sub_buckets[k], 2) for k in _EXTRA_KEYS},
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
        **{k: round(total_buckets[k], 2) for k in _EXTRA_KEYS},
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
            "nombre": _nombre_persona_informe(_usuario_nombre(resp)),
            "cargo": _nombre_persona_informe(_usuario_cargo(resp)) if _usuario_cargo(resp) else "",
        },
        "elaboro": {
            "nombre": _nombre_persona_informe(_usuario_nombre(elaboro)),
            "cargo": _nombre_persona_informe(_usuario_cargo(elaboro) or "Elaboró"),
        },
        "aprobo": {
            "nombre": _nombre_persona_informe(_usuario_nombre(aprobo)),
            "cargo": _nombre_persona_informe(_usuario_cargo(aprobo) or "Aprobó"),
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

    def _cols_extra(r: dict) -> str:
        return "".join(
            "<td style=\"text-align:center;\">%s</td>" % _esc(_fmt_extra(r.get(k), blank_zero=True))
            for k in _EXTRA_KEYS
        ) + (
            "<td style=\"text-align:center;font-weight:bold;\">%s</td>"
            % _esc(_fmt_extra(r.get("tiempo_extra"), blank_zero=True))
        )

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
                "%s"
                "<td></td>"
                "</tr>" % (
                    bg,
                    _esc(r.get("nombre") or ""),
                    _cols_extra(r),
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
                "%s"
                "<td></td>"
                "</tr>" % (
                    bg,
                    fg,
                    _cols_extra(r),
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
            "%s"
            "<td>%s</td>"
            "</tr>" % (
                bg,
                _esc(r.get("no") if r.get("no") not in (None, "") else ""),
                _esc(r.get("nombre")),
                _esc(r.get("documento")),
                _esc(_fmt_fecha_es(r.get("fecha"))),
                _esc(r.get("hora_inicio")),
                _esc(r.get("hora_fin")),
                _cols_extra(r),
                _esc(r.get("observacion")),
            )
        )

    elaboro = payload.get("elaboro") or {}
    aprobo = payload.get("aprobo") or {}
    responsable = payload.get("responsable") or {}
    elaboro_nom = _nombre_persona_informe(elaboro.get("nombre") or "—")
    elaboro_cargo = _nombre_persona_informe(elaboro.get("cargo") or "") if elaboro.get("cargo") else ""
    aprobo_nom = _nombre_persona_informe(aprobo.get("nombre") or "—")
    aprobo_cargo = _nombre_persona_informe(aprobo.get("cargo") or "") if aprobo.get("cargo") else ""
    responsable_nom = _nombre_persona_informe(responsable.get("nombre") or "—")

    # Firmas FUERA de la grilla (si van dentro, xhtml2pdf repite thead sin filas).
    # Espaciador con &nbsp; (xhtml2pdf ignora height en divs vacíos) — solo lo
    # justo para firma a mano. Tabla compacta: no dejar que se estire al final.
    firmas_html = f"""
<table class="firmas" style="page-break-before:avoid;page-break-inside:avoid;">
<tr>
  <td class="firma-cell" style="vertical-align:top;">
    <div class="firma-lbl">Elaboró</div>
    <div class="firma-sp">&nbsp;</div>
    <div class="firma-line">&nbsp;</div>
    <div class="firma-nom">{_esc(elaboro_nom)}</div>
    <div class="firma-cargo">{_esc(elaboro_cargo)}</div>
  </td>
  <td class="firma-cell" style="vertical-align:top;">
    <div class="firma-lbl">Aprobó</div>
    <div class="firma-sp">&nbsp;</div>
    <div class="firma-line">&nbsp;</div>
    <div class="firma-nom">{_esc(aprobo_nom)}</div>
    <div class="firma-cargo">{_esc(aprobo_cargo)}</div>
  </td>
</tr>
</table>
<div style="font-size:1pt;line-height:1pt;">&nbsp;</div>"""

    thead_html = """
<thead>
<tr>
  <th style="width:3%;">No</th>
  <th style="width:14%;">Nombre colaborador</th>
  <th style="width:8%;">No. Documento</th>
  <th style="width:7%;">Fecha</th>
  <th style="width:7%;">Hora de inicio de jornada</th>
  <th style="width:7%;">Hora fin de jornada</th>
  <th style="width:7%;">Extra diurna</th>
  <th style="width:7%;">Extra nocturna</th>
  <th style="width:8%;">Extra festiva diurna</th>
  <th style="width:8%;">Extra festiva nocturna</th>
  <th style="width:7%;">Total tiempo extra</th>
  <th style="width:17%;">Observación</th>
</tr>
</thead>"""

    # Multi-página: últimos grupos + total en hoja final; firmas debajo (sin thead).
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
            f"{trail_html}{total_row_html}</tbody></table>"
            f"{firmas_html}</div>"
        )
    else:
        grid_html = (
            f'<table class="grid">{thead_html}'
            f'<tbody class="closing">{main_html}{total_row_html}</tbody></table>'
            f"{firmas_html}"
        )

    # -pdf-keep-with-next en hdr/meta: une encabezado al inicio de la grilla.
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
    font-size: 7pt;
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
  table.grid {{ width: 100%; font-size: 6pt; margin: 0; }}
  table.grid th, table.grid td {{
    border: 0.6pt solid #64748B;
    padding: 1pt 2pt;
    word-wrap: break-word;
    vertical-align: middle;
    line-height: 1.1;
  }}
  table.grid th {{
    background: {t2["bg"]};
    color: {t2["text"]};
    font-size: 5.5pt;
    font-weight: bold;
  }}
  table.grid thead {{ display: table-header-group; }}
  table.grid tbody {{ display: table-row-group; }}
  table.firmas {{
    width: 100%;
    margin: 3pt 0 0 0;
  }}
  table.firmas td.firma-cell {{
    width: 50%;
    vertical-align: top;
    padding: 2pt 8pt 3pt 8pt;
    border: 0.6pt solid #94A3B8;
    background: #FFFFFF;
  }}
  .firma-lbl {{
    font-size: 7.5pt;
    font-weight: bold;
    color: {t2["text"]};
    margin: 0;
    line-height: 1.1;
  }}
  .firma-sp {{
    font-size: 11pt;
    line-height: 12pt;
    color: #FFFFFF;
    margin: 0;
  }}
  .firma-line {{
    border-bottom: 0.8pt solid #64748B;
    font-size: 2pt;
    line-height: 2pt;
    margin: 0 0 1pt 0;
  }}
  .firma-nom {{ font-size: 8pt; font-weight: bold; line-height: 1.1; margin: 0; }}
  .firma-cargo {{ font-size: 7pt; color: #475569; line-height: 1.1; margin: 0; }}
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
  <td>{_esc(responsable_nom)}</td>
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
        (
            "Responsable de obra",
            _nombre_persona_informe(
                (payload.get("responsable") or {}).get("nombre") or "—"
            ),
        ),
        (
            "Periodo",
            f"{_fmt_fecha_es(payload.get('fecha_desde'))} – {_fmt_fecha_es(payload.get('fecha_hasta'))}",
        ),
    ):
        p = doc.add_paragraph()
        r = p.add_run(f"{label}: ")
        r.bold = True
        r.font.size = Pt(9)
        p.add_run(_texto_unicode(value)).font.size = Pt(9)

    headers = [
        "No", "Nombre colaborador", "No. Documento", "Fecha",
        "Hora de inicio de jornada", "Hora fin de jornada",
        "Extra diurna", "Extra nocturna", "Extra festiva diurna", "Extra festiva nocturna",
        "Total tiempo extra", "Observación",
    ]
    filas = payload.get("filas") or []
    table = doc.add_table(rows=1 + len(filas), cols=len(headers))
    table.style = "Table Grid"
    cell_pt = Pt(5.5)
    head_pt = Pt(5)
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
                *[_fmt_extra(r.get(k), blank_zero=True) for k in _EXTRA_KEYS],
                _fmt_extra(r.get("tiempo_extra"), blank_zero=True),
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
                *[_fmt_extra(r.get(k), blank_zero=True) for k in _EXTRA_KEYS],
                _fmt_extra(r.get("tiempo_extra"), blank_zero=True),
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
                *[_fmt_extra(r.get(k), blank_zero=True) for k in _EXTRA_KEYS],
                _fmt_extra(r.get("tiempo_extra"), blank_zero=True),
                r.get("observacion") or "",
            ]
            fill = None
            bold = False
        for ci, val in enumerate(vals):
            cell = table.rows[ri + 1].cells[ci]
            cell.text = _texto_unicode(val)
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
        r0 = p0.add_run(_texto_unicode(lbl))
        r0.bold = True
        r0.font.size = Pt(9)
        # Espacio mínimo para firma a mano (una línea en blanco, no dos).
        p_sp = cell.add_paragraph("")
        p_sp.paragraph_format.space_before = Pt(0)
        p_sp.paragraph_format.space_after = Pt(0)
        p1 = cell.add_paragraph()
        r1 = p1.add_run(_nombre_persona_informe(person.get("nombre") or "—"))
        r1.bold = True
        r1.font.size = Pt(9)
        p2 = cell.add_paragraph()
        cargo_txt = person.get("cargo") or ""
        r2 = p2.add_run(
            _nombre_persona_informe(cargo_txt) if cargo_txt else ""
        )
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
