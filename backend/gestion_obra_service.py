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

_log = logging.getLogger("claracore.seguimiento.gestion_obra")

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


def _empresa_asistencia(row: dict) -> str:
    """Misma regla que Bitácora FE: subcontratista_nombre (snapshot RRHH)."""
    for k in ("subcontratista_nombre", "empresa_nombre", "empresa", "entidad"):
        n = str((row or {}).get(k) or "").strip()
        if n:
            return n
    return "Sin empresa"


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


def _agg_personal_desde_diarios(diarios: List[dict], dias: List[str]) -> dict:
    """
    Personal por empresa/cargo sin nombres, consolidado por día.

    Fuente: asistencia_colaboradores (empresa = subcontratista_nombre), igual que
    el resumen de Bitácora. Si hay asistencia ese día, NO se suma también
    `personal`/`personal_manual` (evitar doble conteo: persona-día vs agregado).
    """
    # (empresa, cargo, fecha) → cantidad
    personal_dia: Dict[Tuple[str, str, str], float] = defaultdict(float)
    maq_dia: Dict[Tuple[str, str], float] = defaultdict(float)
    ausentes = 0
    presentes = 0
    jornada_horas: List[float] = []
    tiene_asistencia = False
    transporte_registrado = False
    diarios_ok = 0
    notas_conteo = []

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
            for a in asis:
                if not isinstance(a, dict):
                    continue
                emp = _empresa_asistencia(a)
                cargo = str(a.get("cargo") or "Sin cargo").strip() or "Sin cargo"
                if _es_ausente(a.get("estado")):
                    ausentes += 1
                    continue
                presentes += 1
                personal_dia[(emp, cargo, fecha)] += 1.0
                h = _horas_jornada(a.get("hora_ingreso"), a.get("hora_salida"))
                if h is not None:
                    jornada_horas.append(h)
        else:
            # Solo si NO hay asistencia RRHH ese día: usar agregados cargo/cantidad.
            # Estos arrays no traen empresa → etiquetar «Registro directo».
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

    # Series: total persona-días por empresa (suma de lo registrado cada día)
    by_emp: Dict[str, float] = defaultdict(float)
    for (emp, _cargo, _f), cant in personal_dia.items():
        by_emp[emp] += cant
    series_personal = [
        {"nombre": emp, "valor": round(tot, 2)}
        for emp, tot in sorted(by_emp.items(), key=lambda x: -x[1])
    ]

    # Por empresa: tabla cargo × día + total
    empresas_detalle = []
    for emp, _ in sorted(by_emp.items(), key=lambda x: -x[1]):
        cargos = sorted({c for (e, c, _f) in personal_dia if e == emp})
        filas_cargo = []
        for cargo in cargos:
            por_dia = {f: 0.0 for f in dias}
            total = 0.0
            for (e, c, f), cant in personal_dia.items():
                if e == emp and c == cargo and f in por_dia:
                    por_dia[f] += cant
                    total += cant
            filas_cargo.append({
                "cargo": cargo,
                "por_dia": {k: round(v, 2) for k, v in por_dia.items()},
                "total": round(total, 2),
            })
        empresas_detalle.append({
            "empresa": emp,
            "total": round(by_emp[emp], 2),
            "filas": filas_cargo,
        })

    # Maquinaria: total por equipo + tabla equipo × día
    by_eq: Dict[str, float] = defaultdict(float)
    for (eq, _f), cant in maq_dia.items():
        by_eq[eq] += cant
    series_maq = [
        {"nombre": eq, "valor": round(tot, 2)}
        for eq, tot in sorted(by_eq.items(), key=lambda x: -x[1])
    ]
    filas_maq = []
    for eq, _ in sorted(by_eq.items(), key=lambda x: -x[1]):
        por_dia = {f: 0.0 for f in dias}
        total = 0.0
        for (e, f), cant in maq_dia.items():
            if e == eq and f in por_dia:
                por_dia[f] += cant
                total += cant
        filas_maq.append({
            "equipo": eq,
            "por_dia": {k: round(v, 2) for k, v in por_dia.items()},
            "total": round(total, 2),
        })

    total_persona_dias = round(sum(by_emp.values()), 2)
    notas_conteo = [
        "El gráfico de personal suma persona-días: cada persona presente en un día cuenta 1 "
        f"(total del rango: {total_persona_dias}).",
        "Ausentismo y jornada cuentan registros de asistencia RRHH del rango "
        f"(presentes={presentes}, ausentes={ausentes}, total={presentes + ausentes}). "
        "No incluyen el agregado legacy `personal` cuando ya hay asistencia.",
    ]

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
        else "La Bitácora no registra ausentismo (asistencia RRHH) en este rango.",
        "presentes": presentes,
        "ausentes": ausentes,
        "total": presentes + ausentes,
    }
    transporte = {
        "disponible": transporte_registrado or bool(filas_maq),
        "mensaje": None
        if (transporte_registrado or filas_maq)
        else "La Bitácora no registra transporte de forma separada en este rango.",
        "nota": (
            "Se muestra la maquinaria/equipos reportados; no hay módulo de transporte dedicado."
            if filas_maq and not transporte_registrado else None
        ),
    }

    return {
        "disponible": diarios_ok > 0 and (bool(series_personal) or bool(filas_maq) or tiene_asistencia),
        "mensaje": None if diarios_ok else "No hay reportes diarios de Bitácora en el rango seleccionado.",
        "diarios_count": diarios_ok,
        "dias": dias,
        "personal": {
            "series": series_personal,
            "empresas": empresas_detalle,
            "total_persona_dias": total_persona_dias,
        },
        "maquinaria": {
            "series": series_maq,
            "filas": filas_maq,
        },
        "ausentismo": ausentismo,
        "jornada": jornada,
        "transporte": transporte,
        "notas_conteo": notas_conteo,
        # Compat lectura previa
        "filas": [
            {"empresa": e["empresa"], "cargo": f["cargo"], "cantidad": f["total"]}
            for e in empresas_detalle for f in e["filas"]
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
    """
    try:
        reps = (
            sb.table("so_reportes")
            .select("id,created_at,tramo,capitulo,estado")
            .eq("contrato_id", int(contrato_id))
            .gte("created_at", f"{fecha_desde}T00:00:00")
            .lte("created_at", f"{fecha_hasta}T23:59:59.999")
            .limit(1000)
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
            "fecha": str(r.get("created_at") or "")[:10],
            "tramo": str(r.get("tramo") or "").strip(),
            "capitulo": str(r.get("capitulo") or "").strip(),
        }
        for r in reps if r.get("id") is not None
    }
    ids = list(rep_meta.keys())
    rows: List[dict] = []
    # Chunk IN queries
    for i in range(0, len(ids), 80):
        chunk_ids = ids[i:i + 80]
        try:
            chunk = (
                sb.table("so_registros")
                .select(
                    "id,reporte_id,item_numero,item_descripcion,unidad,cantidad_total,tramo,capitulo"
                )
                .eq("contrato_id", int(contrato_id))
                .in_("reporte_id", chunk_ids)
                .limit(5000)
                .execute()
                .data
                or []
            )
            rows.extend(chunk)
        except Exception as exc:
            _log.warning("gestion_obra sicoe registros: %s", exc)

    if not rows:
        return _msg_sin("No hay cantidades reportadas en SICOE Obra en el rango seleccionado.")

    # (tramo, capitulo, item_numero) → {desc, und, cantidad}
    agg: Dict[Tuple[str, str, str], dict] = {}
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
                "cantidad": 0.0,
            }
        agg[key]["cantidad"] += cant
        if not agg[key]["item_descripcion"]:
            agg[key]["item_descripcion"] = str(r.get("item_descripcion") or "").strip()
        if not agg[key]["unidad"]:
            agg[key]["unidad"] = str(r.get("unidad") or "").strip()

    filas = [
        {**v, "cantidad": round(v["cantidad"], 4)}
        for v in sorted(agg.values(), key=lambda x: (x["tramo"], x["capitulo"], x["item_numero"]))
    ]

    # Series: cantidad por tramo
    by_tramo: Dict[str, float] = defaultdict(float)
    for f in filas:
        by_tramo[f["tramo"]] += float(f["cantidad"])
    series = [{"nombre": k, "valor": round(v, 2)} for k, v in sorted(by_tramo.items(), key=lambda x: -x[1])]

    # Agrupar para UI tipo informe: por tramo → capítulos → ítems
    por_tramo: Dict[str, Dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for f in filas:
        por_tramo[f["tramo"]][f["capitulo"]].append({
            "item_numero": f["item_numero"],
            "item_descripcion": f["item_descripcion"],
            "unidad": f["unidad"],
            "cantidad": f["cantidad"],
        })
    tramos = []
    for tramo, caps in sorted(por_tramo.items()):
        tramos.append({
            "tramo": tramo,
            "capitulos": [
                {"capitulo": cap, "items": items}
                for cap, items in sorted(caps.items())
            ],
        })

    return {
        "disponible": True,
        "mensaje": None,
        "series": series,
        "tramos": tramos,
        "filas": filas[:500],
        "reportes_count": len(ids),
    }


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
        from almacen_service import list_solicitudes, list_entradas, list_salidas
    except Exception:
        list_solicitudes = list_entradas = list_salidas = None  # type: ignore

    def _in_range(raw) -> bool:
        s = str(raw or "")[:10]
        return bool(s) and d0 <= s <= d1

    try:
        if list_solicitudes:
            sols = list_solicitudes(
                int(contrato_id), limit=200, ver_economicos=bool(ver_economicos),
            ) or []
            if isinstance(sols, dict):
                sols = sols.get("items") or sols.get("data") or []
            for s in sols:
                if not isinstance(s, dict):
                    continue
                f = s.get("created_at") or s.get("fecha") or s.get("fecha_solicitud")
                if not _in_range(f):
                    continue
                estado = str(s.get("estado") or "").strip().lower()
                row = {
                    "fecha": str(f)[:10],
                    "estado": estado,
                    "solicitante": str(s.get("solicitante_nombre") or "").strip() or "—",
                    "insumos_resumen": (
                        f"{s.get('items_count')} insumo(s)"
                        if s.get("items_count") not in (None, "")
                        else "—"
                    ),
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

    try:
        if list_entradas:
            ents = list_entradas(int(contrato_id)) or []
            if isinstance(ents, dict):
                ents = ents.get("items") or ents.get("data") or []
            for e in ents:
                if not isinstance(e, dict):
                    continue
                f = e.get("fecha_entrada") or e.get("fecha") or e.get("created_at")
                if _in_range(f):
                    entradas_f.append({
                        "fecha": str(f)[:10],
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
                f = s.get("fecha_hora_salida") or s.get("fecha") or s.get("created_at")
                if _in_range(f):
                    salidas_f.append({
                        "fecha": str(f)[:10],
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


def _agg_programacion(sb, contrato_id: int) -> dict:
    """Solo módulo Programación de obra; vacío si el contrato no tiene programación cargada."""
    try:
        # Detectar si hay versiones/cargas de programación
        vers = (
            sb.table("prog_versiones")
            .select("id")
            .eq("contrato_id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        vers = None

    if vers is not None and len(vers) == 0:
        return _msg_sin("Este contrato no tiene Programación de obra cargada.")

    try:
        from prog_obra_ejecutado import build_ejecucion_resumen
        resumen = build_ejecucion_resumen(sb, int(contrato_id))
    except Exception as exc:
        _log.warning("gestion_obra programacion: %s", exc)
        return _msg_sin(
            "Este contrato no tiene Programación de obra cargada, o no fue posible consultarla."
        )

    if not resumen or not isinstance(resumen, dict):
        return _msg_sin("Este contrato no tiene Programación de obra cargada.")

    presupuesto = resumen.get("presupuesto_total")
    ejecutado = resumen.get("ejecutado_total")
    pct = resumen.get("ejecutado_pct")
    caps = resumen.get("por_capitulo") or []
    if presupuesto in (None, 0) and not caps and ejecutado in (None, 0):
        return _msg_sin("Este contrato no tiene Programación de obra cargada.")

    filas = []
    for c in caps[:40]:
        if not isinstance(c, dict):
            continue
        filas.append({
            "capitulo": c.get("capitulo") or "—",
            "presupuesto": c.get("presupuesto"),
            "ejecutado": c.get("ejecutado"),
            "ejecutado_pct": c.get("ejecutado_pct"),
        })
    series = [
        {"nombre": (f.get("capitulo") or "—")[:40], "valor": float(f.get("ejecutado_pct") or 0)}
        for f in filas[:10]
    ]
    alertas = []
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
    except Exception:
        pass

    return {
        "disponible": True,
        "mensaje": None,
        "presupuesto_total": presupuesto,
        "ejecutado_total": ejecutado,
        "ejecutado_pct": pct,
        "filas": filas,
        "series": series,
        "alertas": alertas[:15],
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
    out = {
        "fecha_desde": str(raw.get("fecha_desde") or "")[:10] or None,
        "fecha_hasta": str(raw.get("fecha_hasta") or "")[:10] or None,
        "snapshot_at": raw.get("snapshot_at"),
        "ver_valores_almacen": bool(raw.get("ver_valores_almacen")),
        "datos": raw.get("datos") if isinstance(raw.get("datos"), dict) else {},
        "observaciones": merge_observaciones(None, raw.get("observaciones")),
    }
    return out


def acta_esta_sellada(acta: dict) -> bool:
    est = str((acta or {}).get("estado") or "").strip().lower()
    return est in ("realizada", "firmada", "en_firma", "cerrada")
