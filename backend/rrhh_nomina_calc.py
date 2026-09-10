"""
Cálculo de nómina y liquidación — legislación laboral colombiana.
"""
from __future__ import annotations

import calendar
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from rrhh_nomina_params import (
    FACTORES_HORA,
    FSP_PCT_BASE,
    FSP_TRAMOS,
    FSP_UMBRAL_SMMLV,
    PCT_CAJA,
    PCT_CESANTIAS,
    PCT_ICBF,
    PCT_INTERES_CESANTIAS_ANUAL,
    PCT_PENSION_EMPLEADO,
    PCT_PENSION_PATRONAL,
    PCT_PRIMA,
    PCT_SALUD_EMPLEADO,
    PCT_SALUD_PATRONAL,
    PCT_SENA,
    PCT_VACACIONES,
    TIPOS_EXTRA,
    TIPOS_RECARGO,
    UMBRAL_EXONERACION_SMMLV,
    NominaParams,
    arl_porcentaje,
    money,
    params_for_year,
)


def _as_date(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    s = str(v).strip()[:10]
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except ValueError:
        return None


def periodo_fechas(
    *,
    anio: int,
    mes: int,
    periodicidad: str,
    quincena: Optional[int] = None,
) -> Tuple[date, date]:
    """Retorna (fecha_inicio, fecha_fin) del periodo de nómina."""
    y, m = int(anio), int(mes)
    last = calendar.monthrange(y, m)[1]
    per = (periodicidad or "mensual").strip().lower()
    if per == "mensual":
        return date(y, m, 1), date(y, m, last)
    q = int(quincena or 1)
    if q == 1:
        return date(y, m, 1), date(y, m, 15)
    return date(y, m, 16), date(y, m, last)


def dias_periodo(fecha_inicio: date, fecha_fin: date) -> int:
    return max(0, (fecha_fin - fecha_inicio).days + 1)


def dias_mes_calendario(anio: int, mes: int) -> int:
    return calendar.monthrange(int(anio), int(mes))[1]


def overlaps(
    a_ini: date, a_fin: date, b_ini: date, b_fin: date
) -> bool:
    return a_ini <= b_fin and b_ini <= a_fin


def overlap_days(
    a_ini: date, a_fin: date, b_ini: date, b_fin: date
) -> int:
    start = max(a_ini, b_ini)
    end = min(a_fin, b_fin)
    if end < start:
        return 0
    return (end - start).days + 1


def valor_hora_ordinaria(salario_mensual: float, params: NominaParams) -> float:
    div = params.valor_hora_divisor
    if div <= 0:
        return 0.0
    return money(float(salario_mensual or 0) / div)


def calcular_fsp(ibc: float, smmlv: float) -> float:
    """Fondo de solidaridad pensional (parte colaborador)."""
    if smmlv <= 0:
        return 0.0
    umbral = FSP_UMBRAL_SMMLV * smmlv
    if ibc < umbral:
        return 0.0
    base = money(ibc * FSP_PCT_BASE)
    multiplo = ibc / smmlv
    extra_pct = 0.0
    lower = FSP_UMBRAL_SMMLV
    for upper, pct in FSP_TRAMOS:
        if multiplo > lower:
            extra_pct = pct
            if multiplo < upper:
                break
        lower = upper
    return money(base + ibc * extra_pct)


@dataclass
class ExtrasBreakdown:
    por_tipo: Dict[str, Dict[str, float]] = field(default_factory=dict)
    valor_extras: float = 0.0
    valor_recargos: float = 0.0
    valor_bonificaciones: float = 0.0
    total: float = 0.0


def calcular_extras(
    salario_mensual: float,
    params: NominaParams,
    horas_rows: Sequence[dict],
) -> ExtrasBreakdown:
    vh = valor_hora_ordinaria(salario_mensual, params)
    out = ExtrasBreakdown()
    for row in horas_rows or []:
        tipo = str(row.get("tipo") or "").strip().lower()
        horas = float(row.get("cantidad_horas") or 0)
        valor_fijo = row.get("valor_fijo")
        if tipo == "bonificacion":
            monto = money(float(valor_fijo or 0))
            bucket = out.por_tipo.setdefault(tipo, {"horas": 0.0, "valor": 0.0})
            bucket["valor"] = money(bucket["valor"] + monto)
            out.valor_bonificaciones = money(out.valor_bonificaciones + monto)
            continue
        factor = FACTORES_HORA.get(tipo)
        if factor is None:
            continue
        if valor_fijo is not None and float(valor_fijo or 0) > 0 and horas <= 0:
            monto = money(float(valor_fijo))
        else:
            monto = money(vh * horas * factor)
        bucket = out.por_tipo.setdefault(tipo, {"horas": 0.0, "valor": 0.0})
        bucket["horas"] = money(bucket["horas"] + horas)
        bucket["valor"] = money(bucket["valor"] + monto)
        if tipo in TIPOS_EXTRA:
            out.valor_extras = money(out.valor_extras + monto)
        elif tipo in TIPOS_RECARGO:
            out.valor_recargos = money(out.valor_recargos + monto)
        else:
            out.valor_extras = money(out.valor_extras + monto)
    out.total = money(out.valor_extras + out.valor_recargos + out.valor_bonificaciones)
    return out


@dataclass
class NovedadesBreakdown:
    items: List[dict] = field(default_factory=list)
    dias_no_trabajados: float = 0.0
    descuento: float = 0.0  # monto descontado del salario del periodo


def calcular_novedades(
    salario_periodo: float,
    dias_periodo_n: int,
    fecha_inicio: date,
    fecha_fin: date,
    novedades: Sequence[dict],
) -> NovedadesBreakdown:
    """
    Descuenta del salario del periodo los días de ausencia/licencia/incapacidad
    según porcentaje_pago (0 = no paga, 100 = paga completo → sin descuento).
    """
    out = NovedadesBreakdown()
    if dias_periodo_n <= 0 or salario_periodo <= 0:
        return out
    salario_dia = salario_periodo / dias_periodo_n
    for nov in novedades or []:
        ini = _as_date(nov.get("fecha_inicio"))
        fin = _as_date(nov.get("fecha_fin"))
        if not ini or not fin:
            continue
        dias = float(nov.get("dias") or 0)
        if dias <= 0:
            dias = float(overlap_days(fecha_inicio, fecha_fin, ini, fin))
        else:
            # Limitar a solape con el periodo
            dias = min(dias, float(overlap_days(fecha_inicio, fecha_fin, ini, fin)))
        if dias <= 0:
            continue
        pct_pago = float(nov.get("porcentaje_pago") or 0)
        pct_pago = max(0.0, min(100.0, pct_pago))
        descuento = money(salario_dia * dias * (1.0 - pct_pago / 100.0))
        out.items.append({
            "id": nov.get("id"),
            "tipo": nov.get("tipo"),
            "fecha_inicio": ini.isoformat(),
            "fecha_fin": fin.isoformat(),
            "dias": dias,
            "porcentaje_pago": pct_pago,
            "descuento": descuento,
            "notas": nov.get("notas"),
        })
        out.dias_no_trabajados = money(out.dias_no_trabajados + dias)
        out.descuento = money(out.descuento + descuento)
    return out


@dataclass
class ItemCalculo:
    trabajador_id: int
    salario_base: float
    salario_periodo: float
    valor_extras: float
    valor_recargos: float
    valor_bonificaciones: float
    descuento_novedades: float
    subsidio_transporte: float
    total_devengado: float
    ibc: float
    deduccion_salud: float
    deduccion_pension: float
    deduccion_fsp: float
    total_deducciones: float
    neto_pagar: float
    aporte_salud_patronal: float
    aporte_pension_patronal: float
    aporte_arl: float
    aporte_caja: float
    aporte_sena: float
    aporte_icbf: float
    total_aportes_patronales: float
    prov_cesantias: float
    prov_interes_cesantias: float
    prov_prima: float
    prov_vacaciones: float
    total_provisiones: float
    detalle: Dict[str, Any] = field(default_factory=dict)

    def as_row(self) -> Dict[str, Any]:
        d = asdict(self)
        detalle = d.pop("detalle")
        d["detalle_json"] = detalle
        return d


def _salario_periodo(
    salario_mensual: float,
    *,
    periodicidad: str,
    anio: int,
    mes: int,
    fecha_inicio: date,
    fecha_fin: date,
) -> float:
    """Prorratea el salario mensual al periodo (quincena o mes)."""
    per = (periodicidad or "mensual").strip().lower()
    if per == "quincenal":
        # Dos quincenas iguales = salario / 2 (práctica común)
        return money(float(salario_mensual or 0) / 2.0)
    # Mensual: salario completo del mes
    _ = (anio, mes, fecha_inicio, fecha_fin)
    return money(float(salario_mensual or 0))


def calcular_item_colaborador(
    trabajador: dict,
    *,
    params: NominaParams,
    periodicidad: str,
    anio: int,
    mes: int,
    fecha_inicio: date,
    fecha_fin: date,
    novedades: Sequence[dict],
    horas_extras: Sequence[dict],
) -> ItemCalculo:
    tid = int(trabajador["id"])
    salario = float(trabajador.get("salario") or 0)
    sal_periodo = _salario_periodo(
        salario,
        periodicidad=periodicidad,
        anio=anio,
        mes=mes,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
    )
    n_dias = dias_periodo(fecha_inicio, fecha_fin)

    extras = calcular_extras(salario, params, horas_extras)
    novs = calcular_novedades(sal_periodo, n_dias, fecha_inicio, fecha_fin, novedades)

    # Subsidio de transporte: solo si marcado y salario <= 2 SMMLV; prorrateado al periodo
    subsidio = 0.0
    if trabajador.get("subsidio_transporte") and salario <= (2.0 * params.smmlv) + 0.01:
        if (periodicidad or "").lower() == "quincenal":
            subsidio = money(params.auxilio_transporte / 2.0)
        else:
            subsidio = money(params.auxilio_transporte)

    salario_neto_periodo = money(max(0.0, sal_periodo - novs.descuento))
    total_devengado = money(
        salario_neto_periodo
        + extras.valor_extras
        + extras.valor_recargos
        + extras.valor_bonificaciones
        + subsidio
    )

    # IBC: salario + extras/recargos (sin subsidio transporte ni bonificaciones extralegales no salariales)
    # Bonificaciones se incluyen si son salariales; aquí las tratamos como parte del IBC.
    ibc = money(
        salario_neto_periodo
        + extras.valor_extras
        + extras.valor_recargos
        + extras.valor_bonificaciones
    )
    # Tope IBC 25 SMMLV
    ibc = money(min(ibc, 25.0 * params.smmlv))

    ded_salud = money(ibc * PCT_SALUD_EMPLEADO)
    ded_pension = money(ibc * PCT_PENSION_EMPLEADO)
    ded_fsp = calcular_fsp(ibc, params.smmlv)
    total_ded = money(ded_salud + ded_pension + ded_fsp)
    neto = money(total_devengado - total_ded)

    # Aportes patronales
    exonera = ibc < (UMBRAL_EXONERACION_SMMLV * params.smmlv)
    aporte_salud_pat = 0.0 if exonera else money(ibc * PCT_SALUD_PATRONAL)
    aporte_pension_pat = money(ibc * PCT_PENSION_PATRONAL)
    aporte_arl = money(ibc * arl_porcentaje(trabajador.get("arl_nivel_riesgo")))
    aporte_caja = money(ibc * PCT_CAJA)
    aporte_sena = 0.0 if exonera else money(ibc * PCT_SENA)
    aporte_icbf = 0.0 if exonera else money(ibc * PCT_ICBF)
    total_pat = money(
        aporte_salud_pat
        + aporte_pension_pat
        + aporte_arl
        + aporte_caja
        + aporte_sena
        + aporte_icbf
    )

    # Base provisiones: salario + extras/recargos (+ bonificaciones salariales)
    base_prov = money(
        salario_neto_periodo
        + extras.valor_extras
        + extras.valor_recargos
        + extras.valor_bonificaciones
    )
    # Fracción del mes cubierta por el periodo (quincena ≈ 0.5)
    # Cesantías/prima/vacaciones sobre la base del periodo (ya prorrateada)
    prov_ces = money(base_prov * PCT_CESANTIAS)
    # Intereses: 12% anual / 12 sobre cesantías causadas en el periodo
    prov_int = money(prov_ces * (PCT_INTERES_CESANTIAS_ANUAL / 12.0))
    prov_prima = money(base_prov * PCT_PRIMA)
    prov_vac = money(base_prov * PCT_VACACIONES)
    total_prov = money(prov_ces + prov_int + prov_prima + prov_vac)

    detalle = {
        "params": {
            "anio": params.anio,
            "smmlv": params.smmlv,
            "auxilio_transporte": params.auxilio_transporte,
            "horas_mes": params.horas_mes,
            "valor_hora": valor_hora_ordinaria(salario, params),
        },
        "extras": {
            "por_tipo": extras.por_tipo,
            "valor_extras": extras.valor_extras,
            "valor_recargos": extras.valor_recargos,
            "valor_bonificaciones": extras.valor_bonificaciones,
        },
        "novedades": novs.items,
        "dias_periodo": n_dias,
        "salario_neto_periodo": salario_neto_periodo,
        "ibc": ibc,
        "exoneracion_parafiscales": exonera,
        "arl_nivel": (trabajador.get("arl_nivel_riesgo") or "I"),
        "nombre": f"{trabajador.get('nombres') or ''} {trabajador.get('apellidos') or ''}".strip(),
        "documento": f"{trabajador.get('tipo_documento') or 'CC'} {trabajador.get('numero_documento') or ''}".strip(),
        "cargo": trabajador.get("cargo_aspira"),
        "email": trabajador.get("email"),
        "eps": trabajador.get("eps"),
        "pension": trabajador.get("pension"),
        "arl": trabajador.get("arl"),
        "caja_compensacion": trabajador.get("caja_compensacion"),
    }

    return ItemCalculo(
        trabajador_id=tid,
        salario_base=money(salario),
        salario_periodo=sal_periodo,
        valor_extras=extras.valor_extras,
        valor_recargos=extras.valor_recargos,
        valor_bonificaciones=extras.valor_bonificaciones,
        descuento_novedades=novs.descuento,
        subsidio_transporte=subsidio,
        total_devengado=total_devengado,
        ibc=ibc,
        deduccion_salud=ded_salud,
        deduccion_pension=ded_pension,
        deduccion_fsp=ded_fsp,
        total_deducciones=total_ded,
        neto_pagar=neto,
        aporte_salud_patronal=aporte_salud_pat,
        aporte_pension_patronal=aporte_pension_pat,
        aporte_arl=aporte_arl,
        aporte_caja=aporte_caja,
        aporte_sena=aporte_sena,
        aporte_icbf=aporte_icbf,
        total_aportes_patronales=total_pat,
        prov_cesantias=prov_ces,
        prov_interes_cesantias=prov_int,
        prov_prima=prov_prima,
        prov_vacaciones=prov_vac,
        total_provisiones=total_prov,
        detalle=detalle,
    )


@dataclass
class LiquidacionCalculo:
    salario_pendiente: float
    vacaciones_dinero: float
    cesantias: float
    interes_cesantias: float
    prima_proporcional: float
    indemnizacion: float
    total_liquidacion: float
    detalle: Dict[str, Any] = field(default_factory=dict)


def calcular_liquidacion(
    trabajador: dict,
    *,
    fecha_retiro: date,
    causa: Optional[str] = None,
    indemnizacion: float = 0.0,
    provisiones: Optional[dict] = None,
    salario_pendiente: float = 0.0,
    dias_vacaciones_pendientes: Optional[float] = None,
    params: Optional[NominaParams] = None,
) -> LiquidacionCalculo:
    """
    Liquidación al finalizar la relación laboral.
    Usa provisiones acumuladas cuando existen; si no, estima proporcionalmente
    desde fecha_ingreso hasta fecha_retiro.
    """
    p = params or params_for_year(fecha_retiro.year)
    salario = float(trabajador.get("salario") or 0)
    prov = provisiones or {}

    ces = money(float(prov.get("cesantias") or 0))
    interes = money(float(prov.get("interes_cesantias") or 0))
    prima = money(float(prov.get("prima") or 0))
    vac_acum = money(float(prov.get("vacaciones") or 0))

    ingreso = _as_date(trabajador.get("fecha_ingreso"))
    if ingreso and (ces <= 0 or prima <= 0 or vac_acum <= 0):
        # Estimación proporcional si no hay provisiones
        dias = max(0, (fecha_retiro - ingreso).days + 1)
        anios = dias / 365.0
        if ces <= 0:
            ces = money(salario * anios)  # 1 mes por año
        if interes <= 0:
            interes = money(ces * PCT_INTERES_CESANTIAS_ANUAL * min(1.0, anios))
        if prima <= 0:
            # Prima semestral proporcional (1/2 salario * semestres)
            semestres = dias / 180.0
            prima = money(salario * 0.5 * semestres)
        if vac_acum <= 0:
            # 15 días hábiles ≈ 15/30 salario por año
            vac_acum = money(salario * (15.0 / 30.0) * anios)

    if dias_vacaciones_pendientes is not None and dias_vacaciones_pendientes >= 0:
        vacaciones_dinero = money(salario / 30.0 * float(dias_vacaciones_pendientes))
    else:
        vacaciones_dinero = vac_acum

    sal_pend = money(float(salario_pendiente or 0))
    indem = money(float(indemnizacion or 0))
    total = money(sal_pend + vacaciones_dinero + ces + interes + prima + indem)

    detalle = {
        "fecha_retiro": fecha_retiro.isoformat(),
        "causa": causa,
        "fecha_ingreso": ingreso.isoformat() if ingreso else None,
        "salario_base": salario,
        "smmlv": p.smmlv,
        "nombre": f"{trabajador.get('nombres') or ''} {trabajador.get('apellidos') or ''}".strip(),
        "documento": f"{trabajador.get('tipo_documento') or 'CC'} {trabajador.get('numero_documento') or ''}".strip(),
        "email": trabajador.get("email"),
        "provisiones_fuente": "acumuladas" if provisiones else "estimadas",
    }
    return LiquidacionCalculo(
        salario_pendiente=sal_pend,
        vacaciones_dinero=money(vacaciones_dinero),
        cesantias=ces,
        interes_cesantias=interes,
        prima_proporcional=prima,
        indemnizacion=indem,
        total_liquidacion=total,
        detalle=detalle,
    )
