"""
Informe diario de clima en la zona de obra (Excel).

Fuente: Open-Meteo (archive + forecast), timezone America/Bogota.
Ubicación: punto medio del plano GeoJSON / centro del contrato activo.
"""
from __future__ import annotations

import io
import logging
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

_log = logging.getLogger("claracore.clima.informe")

TZ_BOGOTA = ZoneInfo("America/Bogota")

CLIMA_INFORME_FORMATO = {
    "codigo": "CC-INI-CLIMA-001",
    "version": "1.0",
    "nombre": "Informe de clima",
    "nombre_mayus": "INFORME DE CLIMA",
}

# Etiquetas claras (español) alineadas a WMO / Open-Meteo.
WMO_ESTADO_DIA = {
    0: "Soleado",
    1: "Mayormente soleado",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Niebla",
    48: "Niebla",
    51: "Llovizna ligera",
    53: "Llovizna",
    55: "Llovizna intensa",
    56: "Llovizna helada",
    57: "Llovizna helada",
    61: "Lluvioso (ligero)",
    63: "Lluvioso",
    65: "Lluvioso (intenso)",
    66: "Lluvia helada",
    67: "Lluvia helada intensa",
    71: "Nieve ligera",
    73: "Nieve",
    75: "Nieve intensa",
    77: "Granos de nieve",
    80: "Chubascos ligeros",
    81: "Chubascos",
    82: "Chubascos intensos",
    85: "Chubascos de nieve",
    86: "Chubascos de nieve intensos",
    95: "Tormenta",
    96: "Tormenta con granizo",
    99: "Tormenta fuerte con granizo",
}

_DIAS_SEMANA = (
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
)

_HTTP_TIMEOUT = 18.0
_MAX_DIAS = 366


class ClimaInformeError(ValueError):
    """Error de negocio con mensaje institucional (HTTP 400)."""


def _hoy_bogota() -> date:
    return datetime.now(TZ_BOGOTA).date()


def _ahora_bogota() -> datetime:
    return datetime.now(TZ_BOGOTA)


def _parse_iso_date(raw: Any) -> Optional[date]:
    s = str(raw or "").strip()[:10]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def validar_rango(desde: Any, hasta: Any) -> Tuple[date, date]:
    d0 = _parse_iso_date(desde)
    d1 = _parse_iso_date(hasta)
    if not d0 or not d1:
        raise ClimaInformeError("Indique un rango de fechas válido (Desde / Hasta).")
    if d1 < d0:
        raise ClimaInformeError("La fecha Hasta no puede ser anterior a Desde.")
    hoy = _hoy_bogota()
    if d0 > hoy or d1 > hoy:
        raise ClimaInformeError(
            "El informe solo incluye fechas hasta hoy. Ajuste el rango sin fechas futuras."
        )
    if (d1 - d0).days + 1 > _MAX_DIAS:
        raise ClimaInformeError(
            f"El rango no puede superar {_MAX_DIAS} días. Divida la consulta en períodos más cortos."
        )
    return d0, d1


def estado_clima_label(code: Any) -> str:
    try:
        c = int(code)
    except (TypeError, ValueError):
        return "Sin dato"
    if c in WMO_ESTADO_DIA:
        return WMO_ESTADO_DIA[c]
    # Vecino más cercano conocido
    nearest = min(WMO_ESTADO_DIA.keys(), key=lambda k: abs(k - c))
    return WMO_ESTADO_DIA[nearest]


def fmt_fecha_con_dia(d: date) -> str:
    dia = _DIAS_SEMANA[d.weekday()]
    return f"{d.strftime('%d/%m/%Y')} ({dia})"


def resolver_coords_obra(sb, contrato_id: int) -> Tuple[float, float, dict]:
    """
    Misma lógica que la barra de clima: centro_lat/lng o centroide del plano.
    Sin plano / sin centro → error institucional (no cae a Bogotá).
    """
    from bitacora_service import _centroide_desde_geojson

    select_cols = (
        "id, numero, objeto, contratista, logo_contratista, "
        "centro_lat, centro_lng, plano_geojson"
    )
    rows = (
        sb.table("contratos")
        .select(select_cols)
        .eq("id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ClimaInformeError("Contrato no encontrado.")
    c = dict(rows[0])
    lat_f = lng_f = None
    try:
        if c.get("centro_lat") not in (None, "") and c.get("centro_lng") not in (None, ""):
            lat_f = float(c["centro_lat"])
            lng_f = float(c["centro_lng"])
    except (TypeError, ValueError):
        lat_f = lng_f = None
    if lat_f is None or lng_f is None:
        centro = _centroide_desde_geojson(c.get("plano_geojson"))
        if centro:
            lat_f, lng_f = centro
    if lat_f is None or lng_f is None or not (
        -90 <= lat_f <= 90 and -180 <= lng_f <= 180
    ):
        raise ClimaInformeError(
            "Este contrato no tiene plano GeoJSON cargado. "
            "Cargue el plano de la zona de obra para generar el informe de clima."
        )
    return float(lat_f), float(lng_f), c


def _fetch_daily_open_meteo(
    lat: float,
    lng: float,
    desde: date,
    hasta: date,
) -> List[dict]:
    """Consulta diaria: weather_code + precipitation_hours (horas con lluvia)."""
    import httpx

    params = {
        "latitude": f"{lat:.6f}",
        "longitude": f"{lng:.6f}",
        "start_date": desde.isoformat(),
        "end_date": hasta.isoformat(),
        "daily": "weather_code,precipitation_hours",
        "timezone": "America/Bogota",
    }
    hoy = _hoy_bogota()
    urls: List[str] = []
    # Histórico: archive; tramo reciente / hoy: forecast (soporta start/end).
    if hasta < hoy - timedelta(days=2):
        urls = [
            "https://archive-api.open-meteo.com/v1/archive",
            "https://api.open-meteo.com/v1/forecast",
        ]
    elif desde >= hoy - timedelta(days=5):
        urls = [
            "https://api.open-meteo.com/v1/forecast",
            "https://archive-api.open-meteo.com/v1/archive",
        ]
    else:
        # Rango mixto: preferir archive y completar con forecast si hace falta.
        urls = [
            "https://archive-api.open-meteo.com/v1/archive",
            "https://api.open-meteo.com/v1/forecast",
        ]

    timeout = httpx.Timeout(_HTTP_TIMEOUT, connect=min(6.0, _HTTP_TIMEOUT))
    daily: dict = {}
    last_err: Optional[str] = None
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            for url in urls:
                try:
                    res = client.get(url, params=params)
                    if res.status_code >= 400:
                        last_err = f"HTTP {res.status_code}"
                        continue
                    data = res.json() or {}
                    daily = data.get("daily") or {}
                    if daily.get("time"):
                        break
                    last_err = "respuesta sin días"
                except Exception as exc:
                    last_err = str(exc)
                    _log.warning("open-meteo informe clima %s: %s", url, exc)
    except Exception as exc:
        _log.warning("open-meteo cliente informe clima: %s", exc)
        raise ClimaInformeError(
            "No fue posible consultar el clima en este momento. Intente de nuevo en unos minutos."
        ) from exc

    times = daily.get("time") or []
    if not times:
        raise ClimaInformeError(
            "No fue posible consultar el clima en este momento. Intente de nuevo en unos minutos."
            + (f" ({last_err})" if last_err else "")
        )

    codes = daily.get("weather_code") or []
    precip_h = daily.get("precipitation_hours") or []
    by_date: Dict[str, dict] = {}
    for i, ts in enumerate(times):
        key = str(ts)[:10]
        code = codes[i] if i < len(codes) else None
        hours = precip_h[i] if i < len(precip_h) else None
        try:
            hours_f = float(hours) if hours is not None and hours != "" else 0.0
        except (TypeError, ValueError):
            hours_f = 0.0
        if hours_f < 0:
            hours_f = 0.0
        by_date[key] = {
            "fecha": key,
            "weather_code": code,
            "estado": estado_clima_label(code),
            "horas_lluvia": round(hours_f, 1),
        }

    # Completar días faltantes del rango (huecos) con «Sin dato».
    out: List[dict] = []
    cur = desde
    while cur <= hasta:
        key = cur.isoformat()
        row = by_date.get(key) or {
            "fecha": key,
            "weather_code": None,
            "estado": "Sin dato",
            "horas_lluvia": 0.0,
        }
        out.append(row)
        cur += timedelta(days=1)
    return out


def _apply_calidad_header(ws, *, n_cols: int, contrato: dict) -> int:
    """Encabezado CCD: logo | nombre del formato | código/versión/fecha."""
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    fmt = CLIMA_INFORME_FORMATO
    fill_title = PatternFill("solid", fgColor="0F2942")
    font_title = Font(name="Calibri", bold=True, size=14, color="FFFFFF")
    font_calidad = Font(name="Calibri", bold=True, size=9, color="FFFFFF")
    thin = Border(
        left=Side(style="thin", color="94A3B8"),
        right=Side(style="thin", color="94A3B8"),
        top=Side(style="thin", color="94A3B8"),
        bottom=Side(style="thin", color="94A3B8"),
    )
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)

    n_cols = max(n_cols, 3)
    for c in range(1, n_cols + 1):
        cell = ws.cell(1, c, "")
        cell.fill = fill_title
        cell.border = thin
        cell.alignment = center

    if n_cols >= 3:
        ws.merge_cells(start_row=1, start_column=2, end_row=1, end_column=2)

    logo_cell = ws.cell(1, 1)
    logo_cell.font = font_calidad
    logo_cell.alignment = center
    logo_ok = False
    logo_url = (contrato.get("logo_contratista") or "").strip()
    if logo_url:
        try:
            from main import _xlsx_fetch_image_bytes, _xlsx_fit_image_to_cell
            from openpyxl.drawing.image import Image as XLImage

            raw = _xlsx_fetch_image_bytes(logo_url)
            if raw:
                img = XLImage(io.BytesIO(raw))
                _xlsx_fit_image_to_cell(img, 48, 18)
                ws.add_image(img, "A1")
                logo_ok = True
        except Exception:
            logo_ok = False
    if not logo_ok:
        logo_cell.value = "ClaraCore"

    titulo = ws.cell(1, 2)
    titulo.value = fmt.get("nombre_mayus") or "INFORME DE CLIMA"
    titulo.font = font_title
    titulo.alignment = center

    cal = ws.cell(1, 3)
    cal.value = (
        f"{fmt.get('codigo') or 'CC-INI-CLIMA-001'}\n"
        f"Versión {fmt.get('version') or '1.0'}\n"
        f"Fecha {_ahora_bogota().strftime('%d/%m/%Y')}"
    )
    cal.font = font_calidad
    cal.alignment = center
    ws.row_dimensions[1].height = 52
    return 2


def construir_xlsx(
    *,
    contrato: dict,
    lat: float,
    lng: float,
    desde: date,
    hasta: date,
    filas: List[dict],
) -> Tuple[bytes, str]:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Informe de clima"

    font_head = Font(name="Calibri", bold=True, size=9, color="0F2942")
    font_body = Font(name="Calibri", size=9, color="0F2942")
    font_meta = Font(name="Calibri", size=8, color="475569", italic=True)
    fill_th = PatternFill("solid", fgColor="E2E8F0")
    fill_total = PatternFill("solid", fgColor="FEF3C7")
    thin = Border(
        left=Side(style="thin", color="94A3B8"),
        right=Side(style="thin", color="94A3B8"),
        top=Side(style="thin", color="94A3B8"),
        bottom=Side(style="thin", color="94A3B8"),
    )
    left = Alignment(horizontal="left", vertical="center", wrap_text=True)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)

    n_cols = 3
    row = _apply_calidad_header(ws, n_cols=n_cols, contrato=contrato)

    # Meta del informe
    meta_rows = [
        ("Contrato", str(contrato.get("numero") or "—")),
        ("Descripción", str(contrato.get("objeto") or "—")),
        (
            "Período",
            f"{desde.strftime('%d/%m/%Y')} — {hasta.strftime('%d/%m/%Y')}",
        ),
        (
            "Ubicación (punto medio zona de obra)",
            f"{lat:.5f}, {lng:.5f}",
        ),
    ]
    for label, value in meta_rows:
        ws.cell(row, 1, label).font = font_head
        ws.cell(row, 1).border = thin
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
        cell = ws.cell(row, 2, value)
        cell.font = font_body
        cell.alignment = left
        cell.border = thin
        ws.cell(row, 3).border = thin
        row += 1

    row += 1  # espacio
    headers = ("Fecha", "Estado del clima", "Horas de lluvia")
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row, col, h)
        cell.font = font_head
        cell.fill = fill_th
        cell.border = thin
        cell.alignment = center
    header_row = row
    row += 1

    total_horas = 0.0
    first_data = row
    for f in filas:
        d = _parse_iso_date(f.get("fecha")) or desde
        horas = float(f.get("horas_lluvia") or 0)
        total_horas += horas
        vals = (
            fmt_fecha_con_dia(d),
            str(f.get("estado") or "Sin dato"),
            horas,
        )
        for col, v in enumerate(vals, 1):
            cell = ws.cell(row, col, v)
            cell.font = font_body
            cell.border = thin
            cell.alignment = center if col != 2 else left
        row += 1
    last_data = row - 1

    # Total
    ws.cell(row, 1, "Total horas de lluvia del período").font = font_head
    ws.cell(row, 1).fill = fill_total
    ws.cell(row, 1).border = thin
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
    ws.cell(row, 2).fill = fill_total
    ws.cell(row, 2).border = thin
    total_cell = ws.cell(row, 3, round(total_horas, 1))
    total_cell.font = font_head
    total_cell.fill = fill_total
    total_cell.border = thin
    total_cell.alignment = center
    row += 2

    gen = _ahora_bogota().strftime("%d/%m/%Y %H:%M")
    pie = (
        "Fuente: Open-Meteo (datos históricos / reanálisis). "
        f"Generado: {gen} (hora local Colombia)."
    )
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=3)
    pie_cell = ws.cell(row, 1, pie)
    pie_cell.font = font_meta
    pie_cell.alignment = left

    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 28
    ws.column_dimensions["C"].width = 16

    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_title_rows = f"{header_row}:{header_row}"
    if last_data >= first_data:
        ws.print_area = f"A1:{get_column_letter(n_cols)}{row}"

    buf = io.BytesIO()
    wb.save(buf)
    data = buf.getvalue()
    num = re.sub(r"[^\w.\-]+", "_", str(contrato.get("numero") or contrato.get("id") or "contrato"))
    fname = (
        f"informe_clima_{num}_{desde.isoformat()}_{hasta.isoformat()}.xlsx"
    )
    return data, fname


def generar_informe_clima_xlsx(
    sb,
    contrato_id: int,
    *,
    desde: Any,
    hasta: Any,
) -> Tuple[bytes, str, dict]:
    """
    Genera el Excel del informe.
    Retorna (bytes, filename, meta_log).
    """
    d0, d1 = validar_rango(desde, hasta)
    lat, lng, contrato = resolver_coords_obra(sb, int(contrato_id))
    filas = _fetch_daily_open_meteo(lat, lng, d0, d1)
    data, fname = construir_xlsx(
        contrato=contrato,
        lat=lat,
        lng=lng,
        desde=d0,
        hasta=d1,
        filas=filas,
    )
    meta = {
        "desde": d0.isoformat(),
        "hasta": d1.isoformat(),
        "lat": round(lat, 5),
        "lng": round(lng, 5),
        "dias": len(filas),
        "archivo": fname,
        "total_horas_lluvia": round(
            sum(float(f.get("horas_lluvia") or 0) for f in filas), 1
        ),
    }
    return data, fname, meta
