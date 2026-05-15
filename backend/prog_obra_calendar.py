"""
Calendario laboral Colombia + días no hábiles por contrato (tabla prog_calendario_no_habiles).

Festivos nacionales: paquete `holidays` con calendario CO (Ley 51 de 1983 / observancia en `holidays` para Colombia).
Fuente de verdad del paquete: holidays/countries/colombia.py (reproducible por año).

Caché en proceso:
- festivos por año (frozenset de date) — global CO
- fechas extra desde BD por rango [desde, hasta] por contrato (suspensiones, regionales, otros; incluye filas globales contrato_id IS NULL).
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable, Dict, List, Set, Tuple

import holidays

_lock = threading.Lock()
_festivos_co_por_ano: Dict[int, frozenset] = {}


def festivos_colombia_año(year: int) -> frozenset:
    """Días festivos nacionales Colombia (observados según holidays.country_holidays CO)."""
    with _lock:
        if year not in _festivos_co_por_ano:
            co = holidays.country_holidays("CO", years=[year])
            _festivos_co_por_ano[year] = frozenset(co.keys())
        return _festivos_co_por_ano[year]


def es_fin_de_semana(d: date) -> bool:
    return d.weekday() >= 5


@dataclass
class CalendarioNoHabilesCache:
    """Caché por contrato de fechas extra cargadas desde BD."""

    loader: Callable[[int, date, date], List[dict]]
    _by_contract: Dict[int, Tuple[date, date, frozenset]] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def fechas_extra(self, contrato_id: int, desde: date, hasta: date) -> frozenset:
        with self._lock:
            key = int(contrato_id)
            cur = self._by_contract.get(key)
            if cur and cur[0] <= desde and cur[1] >= hasta:
                return frozenset(d for d in cur[2] if desde <= d <= hasta)
        rows = self.loader(contrato_id, desde, hasta)
        extra: Set[date] = set()
        for r in rows or []:
            fd = r.get("fecha")
            if fd is None:
                continue
            if isinstance(fd, str):
                try:
                    y, m, d0 = fd[:10].split("-")
                    fd = date(int(y), int(m), int(d0))
                except Exception:
                    continue
            if isinstance(fd, date) and desde <= fd <= hasta:
                extra.add(fd)
        frozen = frozenset(extra)
        with self._lock:
            self._by_contract[key] = (desde, hasta, frozen)
        return frozenset(d for d in frozen if desde <= d <= hasta)

    def invalidate(self, contrato_id: int) -> None:
        with self._lock:
            self._by_contract.pop(int(contrato_id), None)


def es_dia_habil(d: date, contrato_id: int, cache: CalendarioNoHabilesCache) -> bool:
    if es_fin_de_semana(d):
        return False
    if d in festivos_colombia_año(d.year):
        return False
    desde = d - timedelta(days=400)
    hasta = d + timedelta(days=400)
    extra = cache.fechas_extra(contrato_id, desde, hasta)
    return d not in extra


def siguiente_dia_habil(d: date, contrato_id: int, cache: CalendarioNoHabilesCache) -> date:
    cur = d
    for _ in range(2500):
        if es_dia_habil(cur, contrato_id, cache):
            return cur
        cur += timedelta(days=1)
    return d


def add_dias_habiles(
    contrato_id: int,
    fecha_inicio: date,
    duracion: int,
    cache: CalendarioNoHabilesCache,
) -> date | None:
    """
    Último día hábil de una secuencia de `duracion` días hábiles inclusive,
    empezando en el primer día hábil en o después de fecha_inicio.
    """
    if duracion <= 0 or fecha_inicio is None:
        return None
    d = siguiente_dia_habil(fecha_inicio, contrato_id, cache)
    rem = int(duracion)
    while rem > 1:
        d += timedelta(days=1)
        if es_dia_habil(d, contrato_id, cache):
            rem -= 1
    return d
