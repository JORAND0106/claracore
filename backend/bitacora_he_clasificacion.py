"""Clasificación de tiempo extra Bitácora en 4 tipos.

No cambia el total de horas extra: reparte el valor ya calculado/almacenado
en Extra diurna | Extra nocturna | Extra festiva diurna | Extra festiva nocturna.

Criterios:
- Festivo/ordinario: domingo o festivo oficial CO (prog_obra_calendar / holidays CO).
- Diurno/nocturno: parámetro de contrato ``nocturno_inicio``–``nocturno_fin``
  (default 19:00–06:00, normativa laboral colombiana).
- Si el intervalo cruza medianoche o el límite nocturno, se parte en el cambio.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from bitacora_horario import (
    NOCTURNO_FIN_DEFAULT,
    NOCTURNO_INICIO_DEFAULT,
    dia_horario_para_fecha,
    hhmm_a_minutos,
    normalize_horario,
    tiene_jornada_ordinaria,
)
from prog_obra_calendar import festivos_colombia_año

MIN_DIA = 24 * 60


def es_domingo_o_festivo_co(d: date) -> bool:
    if d.weekday() == 6:  # domingo
        return True
    return d in festivos_colombia_año(d.year)


def _parse_fecha(fecha: Any) -> Optional[date]:
    if isinstance(fecha, date):
        return fecha
    s = str(fecha or "")[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _limites_nocturno(horario: Any) -> Tuple[int, int]:
    h = normalize_horario(horario)
    ini = hhmm_a_minutos(h.get("nocturno_inicio") or NOCTURNO_INICIO_DEFAULT)
    fin = hhmm_a_minutos(h.get("nocturno_fin") or NOCTURNO_FIN_DEFAULT)
    if ini is None:
        ini = hhmm_a_minutos(NOCTURNO_INICIO_DEFAULT) or 19 * 60
    if fin is None:
        fin = hhmm_a_minutos(NOCTURNO_FIN_DEFAULT) or 6 * 60
    return int(ini), int(fin)


def _minuto_nocturno(m: int, noche_ini: int, noche_fin: int) -> bool:
    """``m`` en [0, 1440). Franja nocturna típica cruza medianoche."""
    m = m % MIN_DIA
    if noche_ini >= noche_fin:
        return m >= noche_ini or m < noche_fin
    return noche_ini <= m < noche_fin


def _restar_intervalo(
    segs: List[Tuple[int, int]],
    cut0: int,
    cut1: int,
) -> List[Tuple[int, int]]:
    """Resta [cut0, cut1) de una lista de segmentos [a,b) en el mismo eje."""
    if cut1 <= cut0:
        return segs
    out: List[Tuple[int, int]] = []
    for a, b in segs:
        if b <= cut0 or a >= cut1:
            out.append((a, b))
            continue
        if a < cut0:
            out.append((a, cut0))
        if b > cut1:
            out.append((cut1, b))
    return [(a, b) for a, b in out if b > a]


def _worked_abs_segments(
    hora_ingreso: Any,
    hora_salida: Any,
    *,
    almuerzo_inicio: Any = "",
    almuerzo_fin: Any = "",
) -> List[Tuple[int, int]]:
    """
    Segmentos trabajados en minutos absolutos desde medianoche del día de ingreso.
    Soporta cruce de medianoche (salida < ingreso → día siguiente).
    """
    ini = hhmm_a_minutos(hora_ingreso)
    fin = hhmm_a_minutos(hora_salida)
    if ini is None or fin is None:
        return []
    if fin > ini:
        segs = [(ini, fin)]
    elif fin < ini:
        segs = [(ini, MIN_DIA), (MIN_DIA, MIN_DIA + fin)]
    else:
        return []

    a0 = hhmm_a_minutos(almuerzo_inicio)
    a1 = hhmm_a_minutos(almuerzo_fin)
    if a0 is not None and a1 is not None and a1 > a0:
        # Almuerzo del día de ingreso (eje 0..1440)
        segs = _restar_intervalo(segs, a0, a1)
    return segs


def _ordinary_abs_segments(horario: Any, fecha: date) -> List[Tuple[int, int]]:
    # Festivo CO (u domingo no laborable): no hay jornada ordinaria que restar.
    if not tiene_jornada_ordinaria(horario, fecha):
        return []
    dia = dia_horario_para_fecha(horario, fecha)
    if not dia.get("laborable"):
        return []
    e0 = hhmm_a_minutos(dia.get("entrada"))
    e1 = hhmm_a_minutos(dia.get("salida"))
    if e0 is None or e1 is None or e1 <= e0:
        return []
    segs = [(e0, e1)]
    a0 = hhmm_a_minutos(dia.get("almuerzo_inicio"))
    a1 = hhmm_a_minutos(dia.get("almuerzo_fin"))
    if a0 is not None and a1 is not None and a1 > a0:
        segs = _restar_intervalo(segs, a0, a1)
    return segs


def _extra_segments_from_worked(
    worked: List[Tuple[int, int]],
    ordinary: List[Tuple[int, int]],
) -> List[Tuple[int, int]]:
    segs = list(worked)
    for o0, o1 in ordinary:
        segs = _restar_intervalo(segs, o0, o1)
    return segs


def _tomar_ultimos_minutos(
    segs: List[Tuple[int, int]],
    minutos: int,
) -> List[Tuple[int, int]]:
    """Conserva los últimos ``minutos`` del timeline (hora extra típica al final)."""
    if minutos <= 0 or not segs:
        return []
    total = sum(b - a for a, b in segs)
    if minutos >= total:
        return list(segs)
    need = minutos
    out_rev: List[Tuple[int, int]] = []
    for a, b in reversed(segs):
        leng = b - a
        if leng <= need:
            out_rev.append((a, b))
            need -= leng
        else:
            out_rev.append((b - need, b))
            need = 0
        if need <= 0:
            break
    return list(reversed(out_rev))


def _partir_por_nocturno(
    segs: List[Tuple[int, int]],
    noche_ini: int,
    noche_fin: int,
) -> List[Tuple[int, int, bool]]:
    """
    Parte segmentos absolutos en trozos homogéneos diurno/nocturno.
    Retorna (abs0, abs1, es_nocturno).
    """
    cuts = {0, MIN_DIA, 2 * MIN_DIA}
    for base in (0, MIN_DIA):
        cuts.add(base + noche_ini)
        cuts.add(base + noche_fin)
    cut_list = sorted(cuts)
    out: List[Tuple[int, int, bool]] = []
    for a, b in segs:
        cur = a
        for c in cut_list:
            if c <= a:
                continue
            if c >= b:
                break
            if c > cur:
                mid = (cur + c) // 2
                out.append((cur, c, _minuto_nocturno(mid % MIN_DIA, noche_ini, noche_fin)))
                cur = c
        if b > cur:
            mid = (cur + b) // 2
            out.append((cur, b, _minuto_nocturno(mid % MIN_DIA, noche_ini, noche_fin)))
    return [(a, b, n) for a, b, n in out if b > a]


def clasificar_tiempo_extra(
    *,
    hora_ingreso: Any,
    hora_salida: Any,
    fecha: Any,
    horario: Any,
    total_extra: Any,
) -> Dict[str, float]:
    """
    Reparte ``total_extra`` en 4 buckets. Suma == round(total_extra, 2).

    Returns keys: extra_diurna, extra_nocturna, extra_festiva_diurna,
    extra_festiva_nocturna, tiempo_extra.
    """
    empty = {
        "extra_diurna": 0.0,
        "extra_nocturna": 0.0,
        "extra_festiva_diurna": 0.0,
        "extra_festiva_nocturna": 0.0,
        "tiempo_extra": 0.0,
    }
    try:
        total = float(total_extra or 0)
    except (TypeError, ValueError):
        return empty
    if total <= 0:
        return empty
    total = round(total, 2)
    d0 = _parse_fecha(fecha)
    if not d0:
        # Sin fecha no se puede clasificar festivo; todo a diurna
        return {
            **empty,
            "extra_diurna": total,
            "tiempo_extra": total,
        }

    h = normalize_horario(horario)
    dia = dia_horario_para_fecha(h, d0)
    worked = _worked_abs_segments(
        hora_ingreso,
        hora_salida,
        almuerzo_inicio=dia.get("almuerzo_inicio"),
        almuerzo_fin=dia.get("almuerzo_fin"),
    )
    ordinary = _ordinary_abs_segments(h, d0)
    extra_segs = _extra_segments_from_worked(worked, ordinary)
    need_min = int(round(total * 60))
    if need_min <= 0:
        return {**empty, "tiempo_extra": total}

    sum_extra = sum(b - a for a, b in extra_segs)
    if sum_extra <= 0:
        # Fallback: últimos minutos trabajados (p. ej. sin jornada ordinaria)
        extra_segs = _tomar_ultimos_minutos(worked, need_min)
    elif abs(sum_extra - need_min) > 1:
        # Ajustar al total oficial (redondeos / almuerzo / overnight)
        if sum_extra > need_min:
            extra_segs = _tomar_ultimos_minutos(extra_segs, need_min)
        else:
            extra_segs = _tomar_ultimos_minutos(worked, need_min)

    noche_ini, noche_fin = _limites_nocturno(h)
    pieces = _partir_por_nocturno(extra_segs, noche_ini, noche_fin)

    buckets = {
        "extra_diurna": 0,
        "extra_nocturna": 0,
        "extra_festiva_diurna": 0,
        "extra_festiva_nocturna": 0,
    }
    for a, b, noc in pieces:
        # Fecha civil del punto medio del trozo
        mid = (a + b) // 2
        day_off = mid // MIN_DIA
        d = d0 + timedelta(days=day_off)
        fest = es_domingo_o_festivo_co(d)
        mins = b - a
        if fest and noc:
            buckets["extra_festiva_nocturna"] += mins
        elif fest:
            buckets["extra_festiva_diurna"] += mins
        elif noc:
            buckets["extra_nocturna"] += mins
        else:
            buckets["extra_diurna"] += mins

    # Convertir a horas y cuadrar redondeo con total
    as_h = {k: round(v / 60.0, 2) for k, v in buckets.items()}
    suma = round(sum(as_h.values()), 2)
    diff = round(total - suma, 2)
    if abs(diff) >= 0.01:
        # Ajuste en el bucket con más minutos
        key_max = max(as_h, key=lambda k: as_h[k])
        as_h[key_max] = round(as_h[key_max] + diff, 2)
        if as_h[key_max] < 0:
            as_h[key_max] = 0.0
    as_h["tiempo_extra"] = total
    return as_h


def fmt_extra_celda(n: Any) -> str:
    """Vacío si 0; si no, 2 decimales (grilla/PDF/Word)."""
    try:
        v = float(n or 0)
    except (TypeError, ValueError):
        return ""
    if v <= 0:
        return ""
    return f"{v:.2f}"
