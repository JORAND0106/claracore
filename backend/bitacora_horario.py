"""Horario laboral semanal de Bitácora por contrato + horas extra.

Espejo de la lógica FE en ``frontend/.../bitacoraHorario.js``.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

BOGOTA = ZoneInfo("America/Bogota")

# Import diferido evitado: prog_obra_calendar solo para festivos CO.

DIAS_SEMANA = ("lun", "mar", "mie", "jue", "vie", "sab", "dom")
# date.weekday(): Monday=0 … Sunday=6
_WEEKDAY_TO_KEY = {
    0: "lun",
    1: "mar",
    2: "mie",
    3: "jue",
    4: "vie",
    5: "sab",
    6: "dom",
}

HORA_INGRESO_DEFAULT = "07:30"
HORA_SALIDA_DEFAULT = "16:30"
ALMUERZO_INICIO_DEFAULT = "12:00"
ALMUERZO_FIN_DEFAULT = "13:00"
# Franja nocturna laboral CO (Ley 2101 / CST): 19:00–06:00. Configurable por contrato.
NOCTURNO_INICIO_DEFAULT = "19:00"
NOCTURNO_FIN_DEFAULT = "06:00"


def _hoy_iso_bogota() -> str:
    return datetime.now(BOGOTA).date().isoformat()


def _empty_no_laborable() -> Dict[str, Any]:
    return {
        "laborable": False,
        "entrada": "",
        "salida": "",
        "almuerzo_inicio": "",
        "almuerzo_fin": "",
    }


def _dia_laborable_default() -> Dict[str, Any]:
    return {
        "laborable": True,
        "entrada": HORA_INGRESO_DEFAULT,
        "salida": HORA_SALIDA_DEFAULT,
        "almuerzo_inicio": ALMUERZO_INICIO_DEFAULT,
        "almuerzo_fin": ALMUERZO_FIN_DEFAULT,
    }


def horario_default(vigente_desde: Optional[str] = None) -> Dict[str, Any]:
    dias: Dict[str, Any] = {}
    for key in DIAS_SEMANA:
        dias[key] = (
            _empty_no_laborable()
            if key in ("sab", "dom")
            else _dia_laborable_default()
        )
    return {
        "vigente_desde": (vigente_desde or _hoy_iso_bogota())[:10],
        "nocturno_inicio": NOCTURNO_INICIO_DEFAULT,
        "nocturno_fin": NOCTURNO_FIN_DEFAULT,
        "dias": dias,
    }


def hhmm_a_minutos(raw: Any) -> Optional[int]:
    s = str(raw or "").strip()[:5]
    if len(s) < 4 or ":" not in s:
        return None
    try:
        h_s, m_s = s.split(":", 1)
        h, m = int(h_s), int(m_s)
    except (TypeError, ValueError):
        return None
    if h < 0 or h > 23 or m < 0 or m > 59:
        return None
    return h * 60 + m


def horas_laborables_dia(dia: Optional[dict]) -> float:
    if not dia or not dia.get("laborable"):
        return 0.0
    ini = hhmm_a_minutos(dia.get("entrada"))
    fin = hhmm_a_minutos(dia.get("salida"))
    if ini is None or fin is None or fin <= ini:
        return 0.0
    total = fin - ini
    a0 = hhmm_a_minutos(dia.get("almuerzo_inicio"))
    a1 = hhmm_a_minutos(dia.get("almuerzo_fin"))
    if a0 is not None and a1 is not None and a1 > a0:
        solapa0 = max(ini, a0)
        solapa1 = min(fin, a1)
        if solapa1 > solapa0:
            total -= solapa1 - solapa0
    return max(0, total) / 60.0


def horas_semanales(horario: Optional[dict]) -> float:
    h = normalize_horario(horario)
    total = sum(horas_laborables_dia(h["dias"].get(k)) for k in DIAS_SEMANA)
    return round(total, 2)


def normalize_horario(
    raw: Any,
    *,
    vigente_desde: Optional[str] = None,
) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return horario_default(vigente_desde)
    base = horario_default(raw.get("vigente_desde") or vigente_desde)
    src = raw.get("dias") if isinstance(raw.get("dias"), dict) else raw
    for key in DIAS_SEMANA:
        row = src.get(key) if isinstance(src, dict) else None
        if not isinstance(row, dict):
            continue
        base["dias"][key] = {
            "laborable": bool(row.get("laborable")),
            "entrada": str(row.get("entrada") or "")[:5],
            "salida": str(row.get("salida") or "")[:5],
            "almuerzo_inicio": str(row.get("almuerzo_inicio") or "")[:5],
            "almuerzo_fin": str(row.get("almuerzo_fin") or "")[:5],
        }
    if raw.get("vigente_desde"):
        base["vigente_desde"] = str(raw["vigente_desde"])[:10]
    ni = str(raw.get("nocturno_inicio") or "").strip()[:5]
    nf = str(raw.get("nocturno_fin") or "").strip()[:5]
    if hhmm_a_minutos(ni) is not None:
        base["nocturno_inicio"] = ni
    if hhmm_a_minutos(nf) is not None:
        base["nocturno_fin"] = nf
    return base


def key_dia_desde_fecha(fecha: Any) -> Optional[str]:
    if isinstance(fecha, date):
        d = fecha
    else:
        s = str(fecha or "")[:10]
        try:
            d = date.fromisoformat(s)
        except ValueError:
            return None
    return _WEEKDAY_TO_KEY.get(d.weekday())


def dia_horario_para_fecha(horario: Any, fecha: Any) -> Dict[str, Any]:
    h = normalize_horario(horario)
    key = key_dia_desde_fecha(fecha)
    if not key:
        return _dia_laborable_default()
    return h["dias"].get(key) or _empty_no_laborable()


def _parse_fecha(fecha: Any) -> Optional[date]:
    if isinstance(fecha, date):
        return fecha
    s = str(fecha or "")[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def es_festivo_oficial_co(fecha: Any) -> bool:
    """Festivo oficial de Colombia (mismo cálculo que el calendario de Seguimiento)."""
    d = _parse_fecha(fecha)
    if not d:
        return False
    try:
        from prog_obra_calendar import festivos_colombia_año
    except Exception:
        return False
    return d in festivos_colombia_año(d.year)


def etiqueta_dia_especial(fecha: Any, horario: Any = None) -> Optional[str]:
    """
    Etiqueta breve para UI junto a Hrs extra: ``Festivo`` o ``Domingo``.
    Domingo con jornada ordinaria en el contrato no etiqueta (se trata como ordinario).
    """
    d = _parse_fecha(fecha)
    if not d:
        return None
    if es_festivo_oficial_co(d):
        return "Festivo"
    if d.weekday() == 6:
        dia = dia_horario_para_fecha(horario, d)
        if dia.get("laborable"):
            return None
        return "Domingo"
    return None


def tiene_jornada_ordinaria(horario: Any, fecha: Any) -> bool:
    """
    False en festivo oficial CO (aunque el día de la semana sea laborable).
    En domingo: solo True si el contrato marca domingo como laborable.
    En días ordinarios: según el horario del contrato.
    """
    d = _parse_fecha(fecha)
    if d and es_festivo_oficial_co(d):
        return False
    dia = dia_horario_para_fecha(horario, fecha)
    return bool(dia.get("laborable"))


def horas_precarga(horario: Any, fecha: Any) -> Dict[str, Any]:
    dia = dia_horario_para_fecha(horario, fecha)
    etiqueta = etiqueta_dia_especial(fecha, horario)
    if not tiene_jornada_ordinaria(horario, fecha):
        # Sin jornada ordinaria: no descontar almuerzo del contrato (todo el
        # tiempo de reloj trabajado cuenta como extra).
        return {
            "hora_ingreso": HORA_INGRESO_DEFAULT,
            "hora_salida": HORA_SALIDA_DEFAULT,
            "laborable": False,
            "almuerzo_inicio": "",
            "almuerzo_fin": "",
            "horas_jornada": 0.0,
            "etiqueta_especial": etiqueta,
        }
    return {
        "hora_ingreso": str(dia.get("entrada") or HORA_INGRESO_DEFAULT)[:5],
        "hora_salida": str(dia.get("salida") or HORA_SALIDA_DEFAULT)[:5],
        "laborable": True,
        "almuerzo_inicio": str(dia.get("almuerzo_inicio") or ""),
        "almuerzo_fin": str(dia.get("almuerzo_fin") or ""),
        "horas_jornada": horas_laborables_dia(dia),
        "etiqueta_especial": None,
    }


def horas_trabajadas(
    hora_ingreso: Any,
    hora_salida: Any,
    *,
    almuerzo_inicio: Any = "",
    almuerzo_fin: Any = "",
) -> float:
    ini = hhmm_a_minutos(hora_ingreso)
    fin = hhmm_a_minutos(hora_salida)
    if ini is None or fin is None or fin <= ini:
        return 0.0
    total = fin - ini
    a0 = hhmm_a_minutos(almuerzo_inicio)
    a1 = hhmm_a_minutos(almuerzo_fin)
    if a0 is not None and a1 is not None and a1 > a0:
        solapa0 = max(ini, a0)
        solapa1 = min(fin, a1)
        if solapa1 > solapa0:
            total -= solapa1 - solapa0
    return max(0, total) / 60.0


def calcular_horas_extra(
    *,
    hora_ingreso: Any,
    hora_salida: Any,
    horario: Any,
    fecha: Any,
) -> float:
    precarga = horas_precarga(horario, fecha)
    trabajadas = horas_trabajadas(
        hora_ingreso,
        hora_salida,
        almuerzo_inicio=precarga.get("almuerzo_inicio"),
        almuerzo_fin=precarga.get("almuerzo_fin"),
    )
    jornada = precarga["horas_jornada"] if precarga.get("laborable") else 0.0
    return round(max(0.0, trabajadas - jornada), 2)


def get_horario_contrato(sb, contrato_id: int) -> Dict[str, Any]:
    """Lee bitacora_horario del contrato; fallback a default si ausente/columna no existe."""
    try:
        rows = (
            sb.table("contratos")
            .select("bitacora_horario")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        return horario_default()
    if not rows:
        return horario_default()
    return normalize_horario(rows[0].get("bitacora_horario"))
