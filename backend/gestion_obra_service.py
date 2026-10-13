"""
Consolidado «Gestión de obra» para actas de Seguimiento.

Snapshot por rango (semana previa por defecto) desde Bitácora, SICOE Obra,
Almacén y Programación. Persistido en seguimiento_acta.gestion_obra.
"""
from __future__ import annotations

import logging
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

_log = logging.getLogger("claracore.seguimiento.gestion_obra")

BOGOTA = ZoneInfo("America/Bogota")

# Bump cuando cambia la forma del snapshot; el FE fuerza recálculo si es menor.
SCHEMA_VERSION = 3

SECCIONES = (
    "personal_jornada",
    "cantidades_obra",
    "actividades",
    "almacen",
    "programacion",
)

# Equiparación de estados de solicitud Almacén → buckets del gráfico diario.
# borrador/enviada = pendientes de cierre; enviada también se cuenta como «gestionada»
# (ya salió del borrador y está en trámite); aprobada = aprobadas; rechazada queda
# fuera de las cuatro series pedidas pero se lista en la tabla.
ALMACEN_ESTADO_BUCKET = {
    "borrador": "pendientes",
    "enviada": "gestionadas",  # en trámite / gestionada
    "aprobada": "aprobadas",
    "rechazada": "rechazadas",
}


def _parse_date(raw) -> Optional[date]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    s = str(raw).strip()[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def rango_semana_anterior(fecha_reunion) -> Tuple[str, str]:
    """Semana calendario inmediatamente anterior a la fecha del acta (7 días)."""
    fr = _parse_date(fecha_reunion) or date.today()
    hasta = fr - timedelta(days=1)
    desde = hasta - timedelta(days=6)
    return desde.isoformat(), hasta.isoformat()


def empty_observaciones() -> Dict[str, str]:
    return {k: "" for k in SECCIONES}


def _msg_sin(texto: str) -> dict:
    return {"disponible": False, "mensaje": texto, "filas": [], "series": [], "por_dia": []}


def _dias_rango(d0: date, d1: date) -> List[str]:
    out = []
    cur = d0
    while cur <= d1:
        out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


def _plain(html: str) -> str:
    t = re.sub(r"<[^>]+>", " ", str(html or ""))
    return re.sub(r"\s+", " ", t).strip()


def _bogota_day_bounds_utc(fecha_desde: str, fecha_hasta: str) -> Tuple[str, str]:
    """Inicio/fin del rango en America/Bogota, expresados como ISO UTC (timestamptz)."""
    d0 = _parse_date(fecha_desde)
    d1 = _parse_date(fecha_hasta)
    if not d0 or not d1:
        raise ValueError("Rango de fechas inválido")
    start = datetime(d0.year, d0.month, d0.day, 0, 0, 0, 0, tzinfo=BOGOTA)
    end = datetime(d1.year, d1.month, d1.day, 23, 59, 59, 999999, tzinfo=BOGOTA)
    return (
        start.astimezone(timezone.utc).isoformat(),
        end.astimezone(timezone.utc).isoformat(),
    )


def _fecha_bogota(raw) -> Optional[str]:
    """YYYY-MM-DD en America/Bogota desde date o timestamptz."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, datetime):
        dt = raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
        return dt.astimezone(BOGOTA).date().isoformat()
    if isinstance(raw, date):
        return raw.isoformat()
    s = str(raw).strip()
    if len(s) >= 10 and s[4] == "-" and "T" not in s[:11] and " " not in s[:11]:
        return s[:10]
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(BOGOTA).date().isoformat()
    except ValueError:
        return s[:10] if len(s) >= 10 else None


def _empresa_asistencia(row: dict) -> str:
    """Misma regla que Bitácora FE: subcontratista_nombre (snapshot RRHH)."""
    for k in ("subcontratista_nombre", "empresa_nombre", "empresa", "entidad"):
        n = str((row or {}).get(k) or "").strip()
        if n:
            return n
    return "Sin empresa"


def _enrich_diarios_empresa_rrhh(sb, contrato_id: int, diarios: List[dict]) -> List[dict]:
    """
    Rellena subcontratista_nombre vacío desde el catálogo RRHH (solo lectura).
    list_entradas no re-enriquece; filas viejas pueden quedar sin empresa en JSON.
    """
    if not diarios:
        return diarios
    needs = False
    for d in diarios:
        for a in d.get("asistencia_colaboradores") or []:
            if isinstance(a, dict) and a.get("rrhh_trabajador_id") is not None:
                if _empresa_asistencia(a) == "Sin empresa":
                    needs = True
                    break
        if needs:
            break
    if not needs:
        return diarios

    by_id: Dict[int, dict] = {}
    try:
        from rrhh_service import list_trabajadores
        todos = list_trabajadores(sb, int(contrato_id)) or []
        for t in todos:
            try:
                by_id[int(t["id"])] = t
            except (TypeError, ValueError, KeyError):
                continue
    except Exception as exc:
        _log.warning("gestion_obra enrich RRHH empresas: %s", exc)
        return diarios

    for d in diarios:
        asis = d.get("asistencia_colaboradores")
        if not isinstance(asis, list):
            continue
        for a in asis:
            if not isinstance(a, dict):
                continue
            if _empresa_asistencia(a) != "Sin empresa":
                continue
            tid = a.get("rrhh_trabajador_id")
            try:
                tid_i = int(tid)
            except (TypeError, ValueError):
                continue
            trab = by_id.get(tid_i)
            if not trab:
                continue
            nombre = str(trab.get("empresa_nombre") or "").strip()
            if nombre:
                a["subcontratista_nombre"] = nombre
                if trab.get("empresa_subcontratista_id") is not None:
                    try:
                        a["subcontratista_id"] = int(trab["empresa_subcontratista_id"])
                    except (TypeError, ValueError):
                        pass
    return diarios


def _es_ausente(estado: str) -> bool:
    est = str(estado or "").strip().lower()
    return est in (
        "ausente", "incapacidad", "permiso", "vacaciones", "no_asistio", "inactivo",
    )


def _horas_jornada(hi: str, hs: str) -> Optional[float]:
    hi = str(hi or "").strip()[:5]
    hs = str(hs or "").strip()[:5]
    if not (hi and hs and ":" in hi and ":" in hs):
        return None
    try:
        h0, m0 = [int(x) for x in hi.split(":")]
        h1, m1 = [int(x) for x in hs.split(":")]
        mins = (h1 * 60 + m1) - (h0 * 60 + m0)
        if 0 < mins < 24 * 60:
            return mins / 60.0
    except (ValueError, TypeError):
        return None
    return None


def _persona_key(row: dict) -> Optional[str]:
    """Identidad estable para cruzar asistencia entre días (sin exponer nombres)."""
    tid = (row or {}).get("rrhh_trabajador_id")
    if tid is not None and tid != "":
        try:
            return f"rrhh:{int(tid)}"
        except (TypeError, ValueError):
            pass
    doc = str((row or {}).get("documento_numero") or "").strip()
    if doc:
        return f"doc:{doc}"
    nom = str((row or {}).get("nombre") or "").strip().lower()
    if nom:
        return f"nom:{nom}"
    return None


def _agg_personal_desde_diarios(diarios: List[dict], dias: List[str]) -> dict:
    """
    Personal por empresa/cargo sin nombres, consolidado por día.

    Cifras = cantidad real de personas/máquinas (máximo diario), nunca suma de días.
    Ausentismo: persona que asistió en otro día laboral del rango y falta ese día.
    """
    # (empresa, cargo, fecha) → cantidad presentes
    personal_dia: Dict[Tuple[str, str, str], float] = defaultdict(float)
    maq_dia: Dict[Tuple[str, str], float] = defaultdict(float)
    # persona_key → historial
    personas: Dict[str, dict] = {}
    jornada_horas: List[float] = []
    tiene_asistencia = False
    transporte_registrado = False
    diarios_ok = 0
    dias_laborales: set = set()

    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        diarios_ok += 1
        fecha = str(d.get("fecha") or "")[:10]
        if not fecha:
            continue

        asis = d.get("asistencia_colaboradores")
        uso_asistencia = isinstance(asis, list) and len(asis) > 0

        if uso_asistencia:
            tiene_asistencia = True
            dias_laborales.add(fecha)
            for a in asis:
                if not isinstance(a, dict):
                    continue
                emp = _empresa_asistencia(a)
                cargo = str(a.get("cargo") or "Sin cargo").strip() or "Sin cargo"
                pk = _persona_key(a)
                if _es_ausente(a.get("estado")):
                    # Marcado ausente ese día: no suma a presentes; se cruza abajo
                    # si ya tenía asistencia previa en el rango.
                    if pk:
                        personas.setdefault(pk, {
                            "first_present": None,
                            "present_days": set(),
                            "identity_by_day": {},
                        })
                    continue
                personal_dia[(emp, cargo, fecha)] += 1.0
                h = _horas_jornada(a.get("hora_ingreso"), a.get("hora_salida"))
                if h is not None:
                    jornada_horas.append(h)
                if pk:
                    info = personas.setdefault(pk, {
                        "first_present": None,
                        "present_days": set(),
                        "identity_by_day": {},
                    })
                    info["present_days"].add(fecha)
                    info["identity_by_day"][fecha] = (emp, cargo)
                    if info["first_present"] is None or fecha < info["first_present"]:
                        info["first_present"] = fecha
        else:
            for p in list(d.get("personal") or []) + list(d.get("personal_manual") or []):
                if not isinstance(p, dict):
                    continue
                cargo = str(p.get("cargo") or "Sin cargo").strip() or "Sin cargo"
                emp = str(
                    p.get("subcontratista_nombre") or p.get("empresa") or p.get("entidad") or ""
                ).strip() or "Registro directo"
                try:
                    cant = float(p.get("cantidad") or 0)
                except (TypeError, ValueError):
                    cant = 0.0
                if cant > 0:
                    personal_dia[(emp, cargo, fecha)] += cant

        for eq in d.get("equipos_uso") or []:
            if not isinstance(eq, dict):
                continue
            nombre = str(eq.get("equipo_nombre") or eq.get("nombre") or "Equipo").strip() or "Equipo"
            try:
                cant = float(eq.get("cantidad") or 1)
            except (TypeError, ValueError):
                cant = 1.0
            maq_dia[(nombre, fecha)] += max(cant, 0)
            tipo = str(eq.get("tipo") or eq.get("categoria") or "").lower()
            if "transport" in tipo or "volqueta" in nombre.lower() or "camion" in nombre.lower():
                transporte_registrado = True

    # Ausencias: en día laboral, tras la 1ª asistencia, sin registro de presencia.
    ausencias_celda: Dict[Tuple[str, str, str], int] = defaultdict(int)
    workdays = sorted(dias_laborales)
    for _pk, info in personas.items():
        first = info.get("first_present")
        if not first:
            continue
        present = info.get("present_days") or set()
        ident = info.get("identity_by_day") or {}
        last_emp_cargo: Optional[Tuple[str, str]] = None
        for day in workdays:
            if day in ident:
                last_emp_cargo = ident[day]
            if day < first:
                continue
            if day in present:
                continue
            if not last_emp_cargo:
                # Buscar identidad del día presente más cercano anterior
                prev = [d for d in sorted(ident.keys()) if d < day]
                if not prev:
                    continue
                last_emp_cargo = ident[prev[-1]]
            emp, cargo = last_emp_cargo
            ausencias_celda[(emp, cargo, day)] += 1

    total_ausencias = int(sum(ausencias_celda.values()))

    # Totales por empresa y día (suma de cargos ese día)
    emp_dia_total: Dict[Tuple[str, str], float] = defaultdict(float)
    for (emp, _cargo, f), cant in personal_dia.items():
        emp_dia_total[(emp, f)] += cant

    emp_max: Dict[str, float] = {}
    for (emp, _f), cant in emp_dia_total.items():
        emp_max[emp] = max(emp_max.get(emp, 0.0), cant)

    series_personal = [
        {"nombre": emp, "valor": round(mx, 2)}
        for emp, mx in sorted(emp_max.items(), key=lambda x: -x[1])
    ]

    empresas_detalle = []
    for emp, _ in sorted(emp_max.items(), key=lambda x: -x[1]):
        cargos = sorted({c for (e, c, _f) in personal_dia if e == emp}
                        | {c for (e, c, _f) in ausencias_celda if e == emp})
        filas_cargo = []
        for cargo in cargos:
            por_dia = {f: 0.0 for f in dias}
            aus_dia = {f: 0 for f in dias}
            for (e, c, f), cant in personal_dia.items():
                if e == emp and c == cargo and f in por_dia:
                    por_dia[f] += cant
            for (e, c, f), n in ausencias_celda.items():
                if e == emp and c == cargo and f in aus_dia:
                    aus_dia[f] += int(n)
            max_diario = max(por_dia.values()) if por_dia else 0.0
            filas_cargo.append({
                "cargo": cargo,
                "por_dia": {k: round(v, 2) for k, v in por_dia.items()},
                "max_diario": round(max_diario, 2),
                "ausencias_por_dia": {k: v for k, v in aus_dia.items() if v > 0},
                # compat
                "total": round(max_diario, 2),
            })
        total_por_dia = {f: round(emp_dia_total.get((emp, f), 0.0), 2) for f in dias}
        max_emp = round(emp_max.get(emp, 0.0), 2)
        filas_cargo.append({
            "cargo": "Total del día",
            "es_total_dia": True,
            "por_dia": total_por_dia,
            "max_diario": max_emp,
            "ausencias_por_dia": {},
            "total": max_emp,
        })
        empresas_detalle.append({
            "empresa": emp,
            "max_diario": max_emp,
            "total": max_emp,  # compat lecturas previas
            "filas": filas_cargo,
        })

    # Maquinaria: máximo diario por equipo (no suma de días)
    eq_names = sorted({eq for (eq, _f) in maq_dia}, key=lambda n: (
        -max((c for (e, f), c in maq_dia.items() if e == n), default=0), n
    ))
    series_maq = []
    filas_maq = []
    for eq in eq_names:
        por_dia = {f: 0.0 for f in dias}
        for (e, f), cant in maq_dia.items():
            if e == eq and f in por_dia:
                por_dia[f] += cant
        max_diario = max(por_dia.values()) if por_dia else 0.0
        series_maq.append({"nombre": eq, "valor": round(max_diario, 2)})
        filas_maq.append({
            "equipo": eq,
            "por_dia": {k: round(v, 2) for k, v in por_dia.items()},
            "max_diario": round(max_diario, 2),
            "total": round(max_diario, 2),
        })
    # Ordenar series/filas por máx desc
    series_maq.sort(key=lambda x: -float(x["valor"]))
    filas_maq.sort(key=lambda x: -float(x["max_diario"]))

    presentes_registros = int(sum(personal_dia.values()))

    jornada = {
        "disponible": bool(jornada_horas),
        "mensaje": None
        if jornada_horas
        else "La Bitácora no registra jornada laboral (horas de ingreso/salida) en este rango.",
        "promedio_horas": round(sum(jornada_horas) / len(jornada_horas), 2) if jornada_horas else None,
        "registros": len(jornada_horas),
    }
    ausentismo = {
        "disponible": tiene_asistencia,
        "mensaje": None
        if tiene_asistencia
        else "La Bitácora no registra asistencia RRHH en este rango.",
        "ausentes": total_ausencias,
        "presentes": presentes_registros,
        "total": total_ausencias,
        "dias_laborales": workdays,
        "regla": (
            "Ausencia = persona que asistió en otro día laboral del rango y no tiene "
            "asistencia ese día. Solo cuentan días con asistencia registrada en el contrato."
        ),
    }
    transporte = {
        "disponible": transporte_registrado or bool(filas_maq),
        "mensaje": None
        if (transporte_registrado or filas_maq)
        else "Sin equipos reportados en Bitácora en este rango.",
        "nota": None,
    }

    return {
        "disponible": diarios_ok > 0 and (bool(series_personal) or bool(filas_maq) or tiene_asistencia),
        "mensaje": None if diarios_ok else "No hay reportes diarios de Bitácora en el rango seleccionado.",
        "diarios_count": diarios_ok,
        "dias": dias,
        "personal": {
            "series": series_personal,
            "empresas": empresas_detalle,
            "metrica": "max_diario",
        },
        "maquinaria": {
            "series": series_maq,
            "filas": filas_maq,
            "metrica": "max_diario",
        },
        "ausentismo": ausentismo,
        "jornada": jornada,
        "transporte": transporte,
        "convencion_ausentismo": (
            "Celdas sombreadas: hubo ausencias ese día en ese cargo "
            "(toque la celda para ver cuántas)."
        ),
        # Compat
        "filas": [
            {"empresa": e["empresa"], "cargo": f["cargo"], "cantidad": f["max_diario"]}
            for e in empresas_detalle for f in e["filas"] if not f.get("es_total_dia")
        ],
        "series": series_personal,
    }


def _agg_actividades(diarios: List[dict], dias: List[str]) -> dict:
    """Actividades por día: serie de barras + resumen con observaciones."""
    por_dia_count: Dict[str, int] = {d: 0 for d in dias}
    por_dia_detalle: Dict[str, List[dict]] = {d: [] for d in dias}

    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        fecha = str(d.get("fecha") or "")[:10]
        if fecha not in por_dia_count:
            continue
        tramo = str(d.get("tramo") or "")
        acts_dia = []
        for ev in d.get("eventos") or []:
            if not isinstance(ev, dict):
                continue
            detalle = ev.get("evento_detalle") if isinstance(ev.get("evento_detalle"), dict) else {}
            acts = detalle.get("actividades") if isinstance(detalle.get("actividades"), list) else []
            if not acts and ev.get("titulo"):
                acts_dia.append({
                    "actividad": str(ev.get("titulo") or "").strip(),
                    "detalle": _plain(ev.get("cuerpo_html") or ev.get("descripcion") or ""),
                    "tramo": tramo,
                })
            for a in acts:
                if isinstance(a, dict):
                    acts_dia.append({
                        "actividad": str(
                            a.get("nombre") or a.get("actividad") or a.get("texto") or ""
                        ).strip(),
                        "detalle": _plain(a.get("detalle") or a.get("descripcion") or ""),
                        "tramo": tramo or str(a.get("tramo") or ""),
                    })
                elif a:
                    acts_dia.append({"actividad": str(a).strip(), "detalle": "", "tramo": tramo})
        cuerpo = _plain(d.get("cuerpo_html") or "")
        if cuerpo:
            acts_dia.append({
                "actividad": "Observaciones del día",
                "detalle": cuerpo[:800],
                "tramo": tramo,
            })
        acts_dia = [x for x in acts_dia if x.get("actividad")]
        por_dia_count[fecha] += len(acts_dia)
        por_dia_detalle[fecha].extend(acts_dia)

    series = [{"nombre": d, "valor": por_dia_count[d]} for d in dias]
    resumen = [
        {
            "fecha": d,
            "cantidad": por_dia_count[d],
            "actividades": por_dia_detalle[d][:40],
        }
        for d in dias
        if por_dia_count[d] > 0
    ]
    filas = []
    for r in resumen:
        for a in r["actividades"]:
            filas.append({
                "fecha": r["fecha"],
                "tramo": a.get("tramo") or "",
                "actividad": a.get("actividad") or "",
                "detalle": a.get("detalle") or "",
            })

    return {
        "disponible": bool(filas),
        "mensaje": None if filas else "No hay actividades adicionales reportadas en Bitácora en este rango.",
        "dias": dias,
        "series": series,
        "por_dia": resumen,
        "filas": filas[:200],
    }


def _agg_sicoe(sb, contrato_id: int, fecha_desde: str, fecha_hasta: str) -> dict:
    """
    Cantidades SICOE por fecha de creación del reporte (cualquier estado),
    agrupadas por tramo → capítulo → ítem (estilo informe mensual, solo cantidad del período).

    El filtro de fechas usa límites America/Bogota convertidos a UTC, igual que la
    grilla SICOE («F. Crea.») percibida por el usuario.
    """
    try:
        start_utc, end_utc = _bogota_day_bounds_utc(fecha_desde, fecha_hasta)
    except ValueError:
        return _msg_sin("Rango de fechas inválido para consultar SICOE Obra.")

    try:
        reps = (
            sb.table("so_reportes")
            .select("id,created_at,tramo,capitulo,estado")
            .eq("contrato_id", int(contrato_id))
            .gte("created_at", start_utc)
            .lte("created_at", end_utc)
            .limit(2000)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("gestion_obra sicoe reportes: %s", exc)
        return _msg_sin("No se pudieron consultar las cantidades de SICOE Obra en este momento.")

    if not reps:
        return _msg_sin("No hay cantidades reportadas en SICOE Obra en el rango seleccionado.")

    rep_meta = {
        int(r["id"]): {
            "fecha": _fecha_bogota(r.get("created_at")) or str(r.get("created_at") or "")[:10],
            "tramo": str(r.get("tramo") or "").strip(),
            "capitulo": str(r.get("capitulo") or "").strip(),
        }
        for r in reps if r.get("id") is not None
    }
    ids = list(rep_meta.keys())
    rows: List[dict] = []
    # Selects resilientes: algunas BD omiten columnas opcionales.
    select_vars = (
        "id,reporte_id,item_numero,item_descripcion,unidad,cantidad_total,tramo,capitulo",
        "id,reporte_id,item_numero,item_descripcion,unidad,cantidad_total",
        "id,reporte_id,item_numero,unidad,cantidad_total",
    )

    def _fetch_registros(chunk_ids: List[int]) -> List[dict]:
        for sel in select_vars:
            for with_contrato in (True, False):
                try:
                    q = sb.table("so_registros").select(sel).in_("reporte_id", chunk_ids)
                    if with_contrato:
                        q = q.eq("contrato_id", int(contrato_id))
                    return q.limit(5000).execute().data or []
                except Exception as exc:
                    msg = str(exc).lower()
                    if "column" in msg or "pgrst" in msg or "42703" in msg:
                        continue
                    _log.warning("gestion_obra sicoe registros: %s", exc)
                    return []
        return []

    for i in range(0, len(ids), 80):
        rows.extend(_fetch_registros(ids[i:i + 80]))

    if not rows:
        return _msg_sin("No hay cantidades reportadas en SICOE Obra en el rango seleccionado.")

    from sicoe_valor_canonico import (
        cap_item_key,
        load_listado_vu_by_cap_item,
        round_cant,
        valor_cant_vu,
        vu_listado_para_registro,
    )

    listado_idx: Dict = {}
    try:
        listado_idx = load_listado_vu_by_cap_item(sb, int(contrato_id)) or {}
    except Exception as exc:
        _log.warning("gestion_obra sicoe listado: %s", exc)

    # (tramo, capitulo, item_numero) → acumula cantidades crudas; valora una sola vez
    agg: Dict[Tuple[str, str, str], dict] = {}
    sin_item = 0
    for r in rows:
        if not isinstance(r, dict):
            continue
        rid = r.get("reporte_id")
        try:
            rid_i = int(rid)
        except (TypeError, ValueError):
            continue
        meta = rep_meta.get(rid_i) or {}
        tramo = str(r.get("tramo") or meta.get("tramo") or "Sin tramo").strip() or "Sin tramo"
        capitulo = str(r.get("capitulo") or meta.get("capitulo") or "Sin capítulo").strip() or "Sin capítulo"
        codigo = str(r.get("item_numero") or "").strip()
        if not codigo:
            sin_item += 1
            continue
        try:
            cant = float(r.get("cantidad_total") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        if cant == 0:
            continue
        key = (tramo, capitulo, codigo)
        if key not in agg:
            agg[key] = {
                "tramo": tramo,
                "capitulo": capitulo,
                "item_numero": codigo,
                "item_descripcion": str(r.get("item_descripcion") or "").strip(),
                "unidad": str(r.get("unidad") or "").strip(),
                "cantidad_raw": 0.0,
            }
        agg[key]["cantidad_raw"] += cant
        if not agg[key]["item_descripcion"]:
            agg[key]["item_descripcion"] = str(r.get("item_descripcion") or "").strip()
        if not agg[key]["unidad"]:
            agg[key]["unidad"] = str(r.get("unidad") or "").strip()

    filas = []
    for v in sorted(agg.values(), key=lambda x: (x["tramo"], x["capitulo"], x["item_numero"])):
        cant = round_cant(v["cantidad_raw"])
        vu = vu_listado_para_registro(
            {"capitulo": v["capitulo"], "item_numero": v["item_numero"]},
            listado_idx,
        )
        valor = valor_cant_vu(cant, vu) if vu is not None else None
        meta_lp = listado_idx.get(cap_item_key(v["capitulo"], v["item_numero"])) if listado_idx else None
        if isinstance(meta_lp, dict):
            if not v["item_descripcion"] and meta_lp.get("descripcion"):
                v["item_descripcion"] = str(meta_lp.get("descripcion") or "").strip()
            if not v["unidad"] and meta_lp.get("unidad"):
                v["unidad"] = str(meta_lp.get("unidad") or "").strip()
        filas.append({
            "tramo": v["tramo"],
            "capitulo": v["capitulo"],
            "item_numero": v["item_numero"],
            "item_descripcion": v["item_descripcion"],
            "unidad": v["unidad"],
            "cantidad": cant,
            "vlr_unitario": vu,
            "valor_total": valor,
        })

    by_tramo: Dict[str, float] = defaultdict(float)
    for f in filas:
        by_tramo[f["tramo"]] += float(f["cantidad"] or 0)
    series = [{"nombre": k, "valor": round(v, 2)} for k, v in sorted(by_tramo.items(), key=lambda x: -x[1])]

    # Tramo → capítulos → ítems + subtotal capítulo (suma valores por ítem ya valorados)
    # Regla: por ítem se suma cant primero y se multiplica una vez; el subtotal suma esos valores.
    por_tramo: Dict[str, Dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for f in filas:
        por_tramo[f["tramo"]][f["capitulo"]].append(f)

    tramos = []
    total_general = 0.0
    for tramo, caps in sorted(por_tramo.items()):
        caps_out = []
        for cap, items in sorted(caps.items()):
            sub_valor = 0.0
            tiene_valor = False
            for it in items:
                if it.get("valor_total") is not None:
                    sub_valor += float(it["valor_total"])
                    tiene_valor = True
            caps_out.append({
                "capitulo": cap,
                "items": [
                    {
                        "item_numero": it["item_numero"],
                        "item_descripcion": it["item_descripcion"],
                        "unidad": it["unidad"],
                        "cantidad": it["cantidad"],
                        "vlr_unitario": it.get("vlr_unitario"),
                        "valor_total": it.get("valor_total"),
                    }
                    for it in items
                ],
                "subtotal_valor": round(sub_valor, 0) if tiene_valor else None,
            })
            if tiene_valor:
                total_general += sub_valor
        tramos.append({"tramo": tramo, "capitulos": caps_out})

    return {
        "disponible": True,
        "mensaje": None,
        "series": series,
        "tramos": tramos,
        "filas": filas[:500],
        "reportes_count": len(ids),
        "total_general_valor": round(total_general, 0) if filas else None,
        "registros_sin_item": sin_item,
        "tiene_valores": True,
    }


def _insumos_resumen_solicitud(s: dict) -> str:
    """Resumen breve: título de la solicitud o conteo de ítems."""
    titulo = str(s.get("titulo") or "").strip()
    if titulo:
        return titulo[:80] + ("…" if len(titulo) > 80 else "")
    n = s.get("items_count")
    if n is None or n == "":
        return "—"
    try:
        n_i = int(n)
    except (TypeError, ValueError):
        return "—"
    return f"{n_i} insumo(s)"


def _agg_almacen(
    sb,
    contrato_id: int,
    fecha_desde: str,
    fecha_hasta: str,
    dias: List[str],
    *,
    ver_economicos: bool = False,
) -> dict:
    d0, d1 = fecha_desde[:10], fecha_hasta[:10]
    solicitudes_f = []
    entradas_f = []
    salidas_f = []
    try:
        start_utc, end_utc = _bogota_day_bounds_utc(fecha_desde, fecha_hasta)
    except ValueError:
        start_utc = f"{d0}T00:00:00+00:00"
        end_utc = f"{d1}T23:59:59.999999+00:00"

    def _in_range_bogota(raw) -> bool:
        s = _fecha_bogota(raw)
        return bool(s) and d0 <= s <= d1

    # Solicitudes del rango por created_at (Bogotá→UTC), enriquecidas como la grilla.
    try:
        from almacen_service import (
            _SOLICITUD_LIST_SELECT,
            _list_solicitudes_resumen,
            list_entradas,
            list_salidas,
        )
        raw_sols = (
            sb.table("almacen_solicitud")
            .select(_SOLICITUD_LIST_SELECT)
            .eq("contrato_id", int(contrato_id))
            .gte("created_at", start_utc)
            .lte("created_at", end_utc)
            .order("created_at", desc=True)
            .limit(500)
            .execute()
            .data
            or []
        )
        sols = _list_solicitudes_resumen(
            sb, raw_sols, int(contrato_id), ver_economicos=bool(ver_economicos),
        )
        for s in sols:
            if not isinstance(s, dict):
                continue
            f_raw = s.get("created_at") or s.get("fecha") or s.get("fecha_solicitud")
            f = _fecha_bogota(f_raw)
            if not f or not (d0 <= f <= d1):
                continue
            estado = str(s.get("estado") or "").strip().lower()
            row = {
                "id": s.get("id"),
                "fecha": f,
                "estado": estado,
                "solicitante": str(s.get("solicitante_nombre") or "").strip() or "—",
                "insumos_resumen": _insumos_resumen_solicitud(s),
                "items_count": s.get("items_count"),
                "ref": s.get("consecutivo") or s.get("numero") or s.get("id"),
            }
            if ver_economicos and s.get("valor_solicitud") is not None:
                try:
                    row["valor"] = float(s.get("valor_solicitud"))
                except (TypeError, ValueError):
                    row["valor"] = None
            else:
                row["valor"] = None
            solicitudes_f.append(row)
    except Exception as exc:
        _log.warning("gestion_obra almacen solicitudes: %s", exc)
        # Fallback: listado completo filtrado en cliente
        try:
            from almacen_service import list_solicitudes
            sols = list_solicitudes(
                int(contrato_id), limit=200, ver_economicos=bool(ver_economicos),
            ) or []
            if isinstance(sols, dict):
                sols = sols.get("items") or sols.get("data") or []
            for s in sols:
                if not isinstance(s, dict):
                    continue
                f_raw = s.get("created_at") or s.get("fecha") or s.get("fecha_solicitud")
                if not _in_range_bogota(f_raw):
                    continue
                f = _fecha_bogota(f_raw) or str(f_raw)[:10]
                estado = str(s.get("estado") or "").strip().lower()
                row = {
                    "id": s.get("id"),
                    "fecha": f,
                    "estado": estado,
                    "solicitante": str(s.get("solicitante_nombre") or "").strip() or "—",
                    "insumos_resumen": _insumos_resumen_solicitud(s),
                    "items_count": s.get("items_count"),
                    "ref": s.get("consecutivo") or s.get("numero") or s.get("id"),
                }
                if ver_economicos and s.get("valor_solicitud") is not None:
                    try:
                        row["valor"] = float(s.get("valor_solicitud"))
                    except (TypeError, ValueError):
                        row["valor"] = None
                else:
                    row["valor"] = None
                solicitudes_f.append(row)
        except Exception as exc2:
            _log.warning("gestion_obra almacen solicitudes fallback: %s", exc2)

    try:
        from almacen_service import list_entradas, list_salidas
    except Exception:
        list_entradas = list_salidas = None  # type: ignore

    try:
        if list_entradas:
            ents = list_entradas(int(contrato_id)) or []
            if isinstance(ents, dict):
                ents = ents.get("items") or ents.get("data") or []
            for e in ents:
                if not isinstance(e, dict):
                    continue
                f_raw = e.get("fecha_entrada") or e.get("fecha") or e.get("created_at")
                if _in_range_bogota(f_raw):
                    entradas_f.append({
                        "fecha": _fecha_bogota(f_raw) or str(f_raw)[:10],
                        "estado": e.get("estado") or "",
                        "ref": e.get("consecutivo") or e.get("numero") or e.get("id"),
                    })
    except Exception as exc:
        _log.warning("gestion_obra almacen entradas: %s", exc)

    try:
        if list_salidas:
            sals = list_salidas(int(contrato_id)) or []
            if isinstance(sals, dict):
                sals = sals.get("items") or sals.get("data") or []
            for s in sals:
                if not isinstance(s, dict):
                    continue
                f_raw = s.get("fecha_hora_salida") or s.get("fecha") or s.get("created_at")
                if _in_range_bogota(f_raw):
                    salidas_f.append({
                        "fecha": _fecha_bogota(f_raw) or str(f_raw)[:10],
                        "estado": s.get("estado") or "",
                        "ref": s.get("consecutivo") or s.get("numero_salida") or s.get("id"),
                    })
    except Exception as exc:
        _log.warning("gestion_obra almacen salidas: %s", exc)

    if not solicitudes_f and not entradas_f and not salidas_f:
        return _msg_sin("No hay movimientos de Almacén (solicitudes, entradas o salidas) en el rango.")

    # Gráfico por día: creadas / gestionadas / aprobadas / pendientes
    # Equiparación:
    # - creadas: todas las solicitudes con created_at ese día
    # - gestionadas: estado enviada (en trámite)
    # - aprobadas: estado aprobada
    # - pendientes: borrador (aún no gestionadas) + enviada (siguen abiertas)
    series_por_dia = []
    for d in dias:
        creadas = [s for s in solicitudes_f if s["fecha"] == d]
        series_por_dia.append({
            "fecha": d,
            "creadas": len(creadas),
            "gestionadas": sum(1 for s in creadas if s["estado"] == "enviada"),
            "aprobadas": sum(1 for s in creadas if s["estado"] == "aprobada"),
            "pendientes": sum(1 for s in creadas if s["estado"] in ("borrador", "enviada")),
        })

    estado_equiparacion = {
        "creadas": "Todas las solicitudes con fecha de creación en el día",
        "gestionadas": "estado = enviada (en trámite / ya salieron de borrador)",
        "aprobadas": "estado = aprobada",
        "pendientes": "estado = borrador o enviada (aún no cerradas)",
        "rechazadas": "estado = rechazada (solo en tabla, no en las 4 series del gráfico)",
    }

    return {
        "disponible": True,
        "mensaje": None,
        "dias": dias,
        "ver_valores": bool(ver_economicos),
        "estado_equiparacion": estado_equiparacion,
        "series_por_dia": series_por_dia,
        "series": [
            {"nombre": "Solicitudes", "valor": len(solicitudes_f)},
            {"nombre": "Entradas", "valor": len(entradas_f)},
            {"nombre": "Salidas", "valor": len(salidas_f)},
        ],
        "solicitudes": solicitudes_f[:100],
        "entradas": entradas_f[:100],
        "salidas": salidas_f[:100],
        "filas": [
            {
                "tipo": "Solicitud",
                "fecha": x["fecha"],
                "estado": x["estado"],
                "ref": x["ref"],
                "solicitante": x.get("solicitante"),
            }
            for x in solicitudes_f
        ] + [
            {"tipo": "Entrada", "fecha": x["fecha"], "estado": x["estado"], "ref": x["ref"]}
            for x in entradas_f
        ] + [
            {"tipo": "Salida", "fecha": x["fecha"], "estado": x["estado"], "ref": x["ref"]}
            for x in salidas_f
        ],
    }


def _contrato_tiene_programacion_cargada(sb, contrato_id: int) -> Tuple[bool, List[dict]]:
    """
    True solo si hay versiones de programación Y al menos una actividad con fecha_inicio.
    (Tener filas vacías en prog_versiones no cuenta como programación cargada.)
    """
    try:
        vers = (
            sb.table("prog_versiones")
            .select("id,numero_version,tipo,estado")
            .eq("contrato_id", int(contrato_id))
            .limit(50)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("gestion_obra programacion versiones: %s", exc)
        return False, []
    if not vers:
        return False, []
    ids = [v["id"] for v in vers if v.get("id") is not None]
    if not ids:
        return False, vers
    try:
        acts = (
            sb.table("prog_actividades")
            .select("id")
            .in_("version_id", ids[:40])
            .not_.is_("fecha_inicio", "null")
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("gestion_obra programacion actividades: %s", exc)
        return False, vers
    return bool(acts), vers


def _agg_programacion(sb, contrato_id: int) -> dict:
    """
    Solo módulo Programación de obra.

    No calcula ni muestra % ejecutado a partir de presupuesto/SICOE
    (eso era el origen del falso «Avance 2%» / «% por capítulo»).
    """
    cargada, vers = _contrato_tiene_programacion_cargada(sb, int(contrato_id))
    if not cargada:
        return _msg_sin("Este contrato no tiene Programación de obra cargada.")

    alertas: List[str] = []
    try:
        from prog_obra_compare import compute_desviaciones
        desv = compute_desviaciones(sb, int(contrato_id))
        if isinstance(desv, dict):
            cto = desv.get("contrato") or {}
            if cto.get("alerta"):
                alertas.append(str(cto.get("alerta")))
            elif cto.get("alerta_fechas") or cto.get("alerta_costo"):
                alertas.append("Desviación de programación detectada en el contrato")
            for pk in (desv.get("pks") or [])[:20]:
                if isinstance(pk, dict) and pk.get("alerta"):
                    alertas.append(str(pk.get("alerta")))
    except Exception as exc:
        _log.info("gestion_obra programacion desviaciones: %s", exc)

    versiones = []
    for v in vers[:20]:
        if not isinstance(v, dict):
            continue
        versiones.append({
            "id": v.get("id"),
            "numero": v.get("numero_version"),
            "tipo": v.get("tipo"),
            "estado": v.get("estado"),
        })

    return {
        "disponible": True,
        "mensaje": None,
        "fuente": "modulo_programacion",
        "versiones": versiones,
        "alertas": alertas[:15],
        # Explícitamente vacío: no reutilizar KPIs de SICOE/presupuesto.
        "ejecutado_pct": None,
        "presupuesto_total": None,
        "ejecutado_total": None,
        "filas": [],
        "series": [],
    }


def build_snapshot(
    sb,
    contrato_id: int,
    fecha_desde: str,
    fecha_hasta: str,
    *,
    observaciones: Optional[dict] = None,
    ver_economicos: bool = False,
) -> dict:
    d0 = _parse_date(fecha_desde)
    d1 = _parse_date(fecha_hasta)
    if not d0 or not d1:
        raise ValueError("Indique un rango de fechas válido")
    if d1 < d0:
        raise ValueError("La fecha hasta debe ser posterior o igual a la fecha desde")
    if (d1 - d0).days > 62:
        raise ValueError("El rango no puede superar 62 días")

    dias = _dias_rango(d0, d1)
    diarios: List[dict] = []
    try:
        from bitacora_service import list_entradas
        diarios = list_entradas(
            sb,
            int(contrato_id),
            fecha_desde=d0.isoformat(),
            fecha_hasta=d1.isoformat(),
            tipo="diario",
        ) or []
    except Exception as exc:
        _log.warning("gestion_obra bitacora: %s", exc)

    diarios = _enrich_diarios_empresa_rrhh(sb, int(contrato_id), diarios)
    personal = _agg_personal_desde_diarios(diarios, dias)
    actividades = _agg_actividades(diarios, dias)
    cantidades = _agg_sicoe(sb, contrato_id, d0.isoformat(), d1.isoformat())
    almacen = _agg_almacen(
        sb, contrato_id, d0.isoformat(), d1.isoformat(), dias,
        ver_economicos=ver_economicos,
    )
    programacion = _agg_programacion(sb, contrato_id)

    obs = empty_observaciones()
    if isinstance(observaciones, dict):
        for k in SECCIONES:
            if k in observaciones and observaciones[k] is not None:
                obs[k] = str(observaciones[k])

    return {
        "schema_version": SCHEMA_VERSION,
        "fecha_desde": d0.isoformat(),
        "fecha_hasta": d1.isoformat(),
        "snapshot_at": _now_iso(),
        "ver_valores_almacen": bool(ver_economicos),
        "datos": {
            "personal_jornada": personal,
            "cantidades_obra": cantidades,
            "actividades": actividades,
            "almacen": almacen,
            "programacion": programacion,
        },
        "observaciones": obs,
    }


def merge_observaciones(existing: Optional[dict], patch: Optional[dict]) -> dict:
    base = empty_observaciones()
    if isinstance(existing, dict):
        for k in SECCIONES:
            if existing.get(k) is not None:
                base[k] = str(existing.get(k) or "")
    if isinstance(patch, dict):
        for k in SECCIONES:
            if k in patch:
                base[k] = str(patch.get(k) or "")
    return base


def normalize_gestion_obra(raw) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    try:
        schema_v = int(raw.get("schema_version") or 0)
    except (TypeError, ValueError):
        schema_v = 0
    out = {
        "schema_version": schema_v,
        "fecha_desde": str(raw.get("fecha_desde") or "")[:10] or None,
        "fecha_hasta": str(raw.get("fecha_hasta") or "")[:10] or None,
        "snapshot_at": raw.get("snapshot_at"),
        "ver_valores_almacen": bool(raw.get("ver_valores_almacen")),
        "datos": raw.get("datos") if isinstance(raw.get("datos"), dict) else {},
        "observaciones": merge_observaciones(None, raw.get("observaciones")),
    }
    return out


def snapshot_esta_obsoleto(raw) -> bool:
    """True si falta el consolidado o su schema es anterior al vigente."""
    if not isinstance(raw, dict) or not isinstance(raw.get("datos"), dict):
        return True
    try:
        return int(raw.get("schema_version") or 0) < SCHEMA_VERSION
    except (TypeError, ValueError):
        return True


def acta_esta_sellada(acta: dict) -> bool:
    est = str((acta or {}).get("estado") or "").strip().lower()
    return est in ("realizada", "firmada", "en_firma", "cerrada")
