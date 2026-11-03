"""
Subcontratistas «por_servicios»: tarifas pactadas, valor de corte y presencia Bitácora.

- Valor del período: tarifa_mensual × cantidad_profesionales × factor
  (0.5 quincenal, 1.0 mensual). Nunca se descuenta automáticamente.
- Presencia: solo informativa (alertas). Días esperados lun–sáb salvo festivos CO;
  sábado solo si ese día hay personal o maquinaria en la Bitácora del contrato.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from prog_obra_calendar import festivos_colombia_año

_log = logging.getLogger("subcontratista_servicios")

TIPO_CANTIDADES = "por_cantidades"
TIPO_SERVICIOS = "por_servicios"
TIPOS_VALIDOS = frozenset({TIPO_CANTIDADES, TIPO_SERVICIOS})


def normalizar_tipo_subcontratista(raw: Any) -> str:
    t = str(raw or "").strip().lower().replace(" ", "_")
    if t in ("por_servicios", "servicios", "servicio"):
        return TIPO_SERVICIOS
    return TIPO_CANTIDADES


def es_subcontratista_por_servicios(sub_or_tipo: Any) -> bool:
    if isinstance(sub_or_tipo, dict):
        return normalizar_tipo_subcontratista(sub_or_tipo.get("tipo")) == TIPO_SERVICIOS
    return normalizar_tipo_subcontratista(sub_or_tipo) == TIPO_SERVICIOS


def factor_periodo_corte(tipo_periodo: Any) -> float:
    """Quincenal → 0.5, mensual → 1.0 (y cualquier otro → 1.0)."""
    t = str(tipo_periodo or "").strip().lower()
    if t in ("quincenal", "quincena", "quince"):
        return 0.5
    return 1.0


def _sf(n: Any, default: float = 0.0) -> float:
    if n is None or n == "":
        return float(default)
    try:
        x = float(n)
        if x != x or x in (float("inf"), float("-inf")):
            return float(default)
        return x
    except (TypeError, ValueError):
        return float(default)


def _round0(n: Any) -> float:
    return float(round(_sf(n), 0))


def _parse_date(raw: Any) -> Optional[date]:
    from datetime import datetime as _dt

    if isinstance(raw, _dt):
        return raw.date()
    if isinstance(raw, date):
        return raw
    s = str(raw or "").strip()[:10]
    if not s:
        return None
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def valor_concepto_periodo(
    *,
    tarifa_mensual: Any,
    cantidad_profesionales: Any,
    tipo_periodo: Any,
) -> float:
    """tarifa × cant × factor. Siempre respeta el valor pactado (sin descuentos)."""
    cant = _sf(cantidad_profesionales, 1.0)
    if cant <= 0:
        cant = 1.0
    return _round0(_sf(tarifa_mensual) * cant * factor_periodo_corte(tipo_periodo))


def items_corte_desde_tarifas(
    tarifas: Sequence[dict],
    *,
    tipo_periodo: Any,
) -> Tuple[List[dict], float]:
    """Convierte tarifas pactadas en filas de corte (ítems) + total CD."""
    items: List[dict] = []
    total = 0.0
    factor = factor_periodo_corte(tipo_periodo)
    for i, t in enumerate(tarifas or []):
        if not isinstance(t, dict):
            continue
        if t.get("activo") is False:
            continue
        concepto = str(t.get("concepto") or "").strip()
        if not concepto:
            continue
        tarifa = _sf(t.get("tarifa_mensual"))
        cant = _sf(t.get("cantidad_profesionales"), 1.0)
        if cant <= 0:
            cant = 1.0
        vu_periodo = _round0(tarifa * factor)  # VU mostrado = tarifa del período unitaria
        cd = valor_concepto_periodo(
            tarifa_mensual=tarifa,
            cantidad_profesionales=cant,
            tipo_periodo=tipo_periodo,
        )
        items.append(
            {
                "item_numero": str(t.get("id") or i + 1),
                "item_descripcion": concepto,
                "unidad": "mes" if factor >= 1.0 else "quincena",
                "cantidad": cant,
                "vlr_unitario_sub": vu_periodo,
                "costo_directo": cd,
                "capitulo": "Servicios",
                "sin_precio": False,
                "tarifa_mensual": tarifa,
                "cantidad_profesionales": cant,
                "factor_periodo": factor,
                "origen": "tarifa_servicio",
            }
        )
        total += cd
    return items, _round0(total)


def _iter_dias(desde: date, hasta: date):
    cur = desde
    while cur <= hasta:
        yield cur
        cur += timedelta(days=1)


def dias_con_actividad_bitacora_contrato(diarios: Sequence[dict]) -> Set[str]:
    """
    Fechas (YYYY-MM-DD) del contrato con personal o maquinaria reportados.
    Usado para decidir si un sábado «espera» presencia.
    """
    out: Set[str] = set()
    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        fecha = str(d.get("fecha") or "")[:10]
        if not fecha:
            continue
        asis = d.get("asistencia_colaboradores")
        if isinstance(asis, list) and any(isinstance(a, dict) for a in asis):
            out.add(fecha)
            continue
        personal = list(d.get("personal") or []) + list(d.get("personal_manual") or [])
        if any(isinstance(p, dict) and _sf(p.get("cantidad")) > 0 for p in personal):
            out.add(fecha)
            continue
        equipos = d.get("equipos_uso") or d.get("maquinaria") or []
        if any(isinstance(eq, dict) for eq in equipos):
            out.add(fecha)
    return out


def dias_esperados_en_periodo(
    fecha_inicio: Any,
    fecha_fin: Any,
    *,
    fechas_con_actividad_contrato: Optional[Iterable[str]] = None,
) -> List[str]:
    """
    Lun–sáb esperados; festivos CO nunca; domingo nunca;
    sábado solo si hay actividad (personal/maquinaria) ese día en la bitácora del contrato.
    """
    di = _parse_date(fecha_inicio)
    df = _parse_date(fecha_fin)
    if not di or not df or df < di:
        return []
    act = {str(x)[:10] for x in (fechas_con_actividad_contrato or []) if x}
    festivos: Set[date] = set()
    for y in range(di.year, df.year + 1):
        festivos |= set(festivos_colombia_año(y))
    out: List[str] = []
    for d in _iter_dias(di, df):
        if d in festivos:
            continue
        wd = d.weekday()  # 0=lun … 6=dom
        if wd == 6:
            continue
        iso = d.isoformat()
        if wd == 5 and iso not in act:
            continue
        out.append(iso)
    return out


def _es_ausente(estado: Any) -> bool:
    s = str(estado or "").strip().lower()
    return s in ("ausente", "ausencia", "faltó", "falto", "no asistio", "no asistió")


def _persona_match_sub(row: dict, sub_id: int) -> bool:
    raw = row.get("subcontratista_id")
    if raw is None:
        raw = row.get("empresa_subcontratista_id")
    try:
        return raw is not None and int(raw) == int(sub_id)
    except (TypeError, ValueError):
        return False


def _persona_key(row: dict) -> str:
    rid = row.get("rrhh_trabajador_id") or row.get("id")
    if rid is not None and str(rid).strip() != "":
        return f"rrhh:{rid}"
    nombre = str(row.get("nombre") or "").strip().lower()
    cargo = str(row.get("cargo") or row.get("cargo_aspira") or "").strip().lower()
    return f"nom:{nombre}|{cargo}"


def construir_control_presencia(
    *,
    subcontratista_id: int,
    fecha_inicio: Any,
    fecha_fin: Any,
    trabajadores: Sequence[dict],
    diarios: Sequence[dict],
) -> Dict[str, Any]:
    """
    Relación de personal del sub con días esperados / presencia / fechas sin reporte.
    Solo informativo: genera alertas; no altera el valor del corte.
    """
    act_contrato = dias_con_actividad_bitacora_contrato(diarios)
    esperados = dias_esperados_en_periodo(
        fecha_inicio, fecha_fin, fechas_con_actividad_contrato=act_contrato
    )
    esperados_set = set(esperados)

    # Presencia por persona (solo no ausentes) en el rango
    present_by_pk: Dict[str, Set[str]] = {}
    identity: Dict[str, dict] = {}
    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        fecha = str(d.get("fecha") or "")[:10]
        if not fecha or fecha not in esperados_set:
            # También contar presencia en días esperados; si no es esperado, ignora
            if fecha not in esperados_set:
                continue
        asis = d.get("asistencia_colaboradores")
        if not isinstance(asis, list):
            continue
        for a in asis:
            if not isinstance(a, dict):
                continue
            if not _persona_match_sub(a, subcontratista_id):
                continue
            if _es_ausente(a.get("estado")):
                continue
            pk = _persona_key(a)
            present_by_pk.setdefault(pk, set()).add(fecha)
            identity.setdefault(
                pk,
                {
                    "nombre": str(a.get("nombre") or "").strip() or "—",
                    "cargo": str(a.get("cargo") or "").strip() or "—",
                    "rrhh_trabajador_id": a.get("rrhh_trabajador_id"),
                },
            )

    # Semilla con trabajadores RRHH del sub (aunque no hayan aparecido aún)
    for t in trabajadores or []:
        if not isinstance(t, dict):
            continue
        if not _persona_match_sub(t, subcontratista_id) and str(
            t.get("empresa_tipo") or ""
        ).lower() != "subcontratista":
            # Si viene filtrado por API ya es del sub; aceptar también por id
            sid = t.get("empresa_subcontratista_id")
            try:
                if sid is None or int(sid) != int(subcontratista_id):
                    continue
            except (TypeError, ValueError):
                continue
        pk = _persona_key(
            {
                "rrhh_trabajador_id": t.get("id"),
                "nombre": t.get("nombre"),
                "cargo": t.get("cargo_aspira") or t.get("cargo"),
            }
        )
        identity.setdefault(
            pk,
            {
                "nombre": str(t.get("nombre") or "").strip() or "—",
                "cargo": str(t.get("cargo_aspira") or t.get("cargo") or "").strip() or "—",
                "rrhh_trabajador_id": t.get("id"),
            },
        )
        present_by_pk.setdefault(pk, set())

    personas: List[dict] = []
    alertas: List[dict] = []
    for pk, meta in sorted(identity.items(), key=lambda x: (x[1].get("nombre") or "", pk)):
        presentes = sorted(present_by_pk.get(pk) or set())
        sin_reporte = [d for d in esperados if d not in (present_by_pk.get(pk) or set())]
        row = {
            "persona_key": pk,
            "nombre": meta.get("nombre"),
            "cargo": meta.get("cargo"),
            "rrhh_trabajador_id": meta.get("rrhh_trabajador_id"),
            "dias_esperados": len(esperados),
            "dias_con_presencia": len(presentes),
            "fechas_esperadas": list(esperados),
            "fechas_con_presencia": presentes,
            "fechas_sin_reporte": sin_reporte,
            "alerta": bool(sin_reporte),
        }
        personas.append(row)
        if sin_reporte:
            alertas.append(
                {
                    "tipo": "sin_presencia",
                    "nombre": row["nombre"],
                    "cargo": row["cargo"],
                    "fechas": sin_reporte,
                    "mensaje": (
                        f"{row['nombre']} ({row['cargo']}): "
                        f"{len(sin_reporte)} día(s) sin reporte de presencia."
                    ),
                }
            )

    return {
        "fecha_inicio": str(fecha_inicio or "")[:10],
        "fecha_fin": str(fecha_fin or "")[:10],
        "dias_esperados": esperados,
        "n_dias_esperados": len(esperados),
        "sabados_con_actividad": sorted(
            d for d in esperados if _parse_date(d) and _parse_date(d).weekday() == 5
        ),
        "personas": personas,
        "alertas": alertas,
        "tiene_alertas": bool(alertas),
        "informativo": True,
    }


def fetch_tarifas_servicio(sb, subcontratista_id: int) -> List[dict]:
    try:
        rows = (
            sb.table("subcontratista_tarifas_servicio")
            .select("*")
            .eq("subcontratista_id", int(subcontratista_id))
            .eq("activo", True)
            .order("orden")
            .order("id")
            .execute()
            .data
            or []
        )
        return rows
    except Exception as exc:
        _log.warning("fetch_tarifas_servicio sub=%s: %s", subcontratista_id, exc)
        return []


def normalizar_fila_tarifa(raw: dict, *, orden: int = 0) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    concepto = str(raw.get("concepto") or "").strip()
    if not concepto:
        return None
    cant = _sf(raw.get("cantidad_profesionales"), 1.0)
    if cant <= 0:
        cant = 1.0
    return {
        "concepto": concepto[:200],
        "tarifa_mensual": round(_sf(raw.get("tarifa_mensual")), 2),
        "cantidad_profesionales": cant,
        "orden": int(raw.get("orden") if raw.get("orden") is not None else orden),
        "activo": False if raw.get("activo") is False else True,
    }
