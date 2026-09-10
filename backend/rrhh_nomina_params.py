"""
Parámetros legales de nómina colombiana (porcentajes y SMMLV).

Valores por defecto alineados a la legislación vigente 2026.
Sobrescribibles por variables de entorno:
  RRHH_SMMLV, RRHH_AUXILIO_TRANSPORTE, RRHH_HORAS_MES
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict


def _env_float(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return float(default)
    try:
        return float(raw.replace(",", "."))
    except ValueError:
        return float(default)


# SMMLV y auxilio de transporte por año (COP)
_SMMLV_DEFAULTS: Dict[int, float] = {
    2025: 1_423_500.0,
    2026: 1_750_000.0,
}
_AUX_TRANSPORTE_DEFAULTS: Dict[int, float] = {
    2025: 200_000.0,
    2026: 250_000.0,
}

# Divisor mensual de horas (Ley 2101 — reducción gradual jornada).
# 2026: 44 h/semana ≈ 220 h/mes.
_HORAS_MES_DEFAULTS: Dict[int, float] = {
    2025: 220.0,
    2026: 220.0,
}

# Deducciones colaborador
PCT_SALUD_EMPLEADO = 0.04
PCT_PENSION_EMPLEADO = 0.04

# Aportes patronales
PCT_SALUD_PATRONAL = 0.085
PCT_PENSION_PATRONAL = 0.12
PCT_CAJA = 0.04
PCT_SENA = 0.02
PCT_ICBF = 0.03

# Umbral exoneración salud/parafiscales (Ley 1607 / 1819) — IBC < 10 SMMLV
UMBRAL_EXONERACION_SMMLV = 10.0

# ARL por clase de riesgo (Decreto 2616 / tarifas vigentes)
ARL_PCT: Dict[str, float] = {
    "I": 0.00522,
    "II": 0.01044,
    "III": 0.02436,
    "IV": 0.04350,
    "V": 0.06960,
}

# Provisiones sociales (mensuales sobre base salarial del periodo)
PCT_CESANTIAS = 1.0 / 12.0          # 8.33%
PCT_INTERES_CESANTIAS_ANUAL = 0.12  # 12% anual sobre cesantías
PCT_PRIMA = 1.0 / 12.0              # 8.33%
PCT_VACACIONES = 15.0 / 360.0       # 4.17%

# Factores sobre valor hora ordinaria
FACTORES_HORA: Dict[str, float] = {
    "extra_diurna": 1.25,
    "extra_nocturna": 1.75,
    "recargo_nocturno": 1.35,
    "dominical_diurna": 1.75,
    "dominical_nocturna": 2.10,
    "extra_dominical_diurna": 2.00,
    "extra_dominical_nocturna": 2.50,
}

TIPOS_EXTRA = frozenset({
    "extra_diurna", "extra_nocturna",
    "extra_dominical_diurna", "extra_dominical_nocturna",
})
TIPOS_RECARGO = frozenset({
    "recargo_nocturno", "dominical_diurna", "dominical_nocturna",
})

# FSP: 1% desde 4 SMMLV; tramos adicionales sobre el exceso (simplificado vigente)
FSP_UMBRAL_SMMLV = 4.0
FSP_PCT_BASE = 0.01
# Tramos adicionales (sobre el exceso del IBC respecto a 4 SMMLV) — aproximación práctica
FSP_TRAMOS = (
    (16.0, 0.002),   # 4–16 SMMLV: +0.2%
    (17.0, 0.004),
    (18.0, 0.006),
    (19.0, 0.008),
    (20.0, 0.010),
)


@dataclass(frozen=True)
class NominaParams:
    anio: int
    smmlv: float
    auxilio_transporte: float
    horas_mes: float

    @property
    def valor_hora_divisor(self) -> float:
        return self.horas_mes if self.horas_mes > 0 else 220.0


def params_for_year(anio: int) -> NominaParams:
    y = int(anio)
    smmlv = _env_float("RRHH_SMMLV", _SMMLV_DEFAULTS.get(y, _SMMLV_DEFAULTS[2026]))
    aux = _env_float(
        "RRHH_AUXILIO_TRANSPORTE",
        _AUX_TRANSPORTE_DEFAULTS.get(y, _AUX_TRANSPORTE_DEFAULTS[2026]),
    )
    horas = _env_float(
        "RRHH_HORAS_MES",
        _HORAS_MES_DEFAULTS.get(y, 220.0),
    )
    return NominaParams(anio=y, smmlv=smmlv, auxilio_transporte=aux, horas_mes=horas)


def arl_porcentaje(nivel: str | None) -> float:
    key = (nivel or "I").strip().upper()
    return float(ARL_PCT.get(key, ARL_PCT["I"]))


def money(n: float) -> float:
    return round(float(n or 0), 2)
