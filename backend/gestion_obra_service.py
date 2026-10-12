"""
Consolidado «Gestión de obra» para actas de Seguimiento.

Arma un snapshot por rango de fechas (semana anterior a la reunión por defecto)
desde Bitácora, SICOE Obra, Almacén y Programación. Se guarda en
seguimiento_acta.gestion_obra para que un acta sellada no cambie después.
"""
from __future__ import annotations

import logging
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
    return {"disponible": False, "mensaje": texto, "filas": [], "series": []}


def _agg_personal_desde_diarios(diarios: List[dict]) -> dict:
    """Personal por empresa/cargo (sin nombres) + maquinaria + materiales + jornada/ausentismo/transporte."""
    # cargo_empresa → max cantidad observada (o suma de diarios)
    personal_map: Dict[Tuple[str, str], float] = defaultdict(float)
    ausentes = 0
    presentes = 0
    jornada_horas: List[float] = []
    tiene_asistencia = False
    maquinaria_map: Dict[str, float] = defaultdict(float)
    materiales_map: Dict[Tuple[str, str], float] = defaultdict(float)
    transporte_registrado = False
    diarios_ok = 0

    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        diarios_ok += 1
        # Personal agregado (sin nombres)
        for p in d.get("personal") or []:
            if not isinstance(p, dict):
                continue
            cargo = str(p.get("cargo") or "Sin cargo").strip() or "Sin cargo"
            emp = str(p.get("empresa") or p.get("entidad") or "Sin empresa").strip() or "Sin empresa"
            try:
                cant = float(p.get("cantidad") or 0)
            except (TypeError, ValueError):
                cant = 0.0
            if cant > 0:
                personal_map[(emp, cargo)] += cant
        for p in d.get("personal_manual") or []:
            if not isinstance(p, dict):
                continue
            cargo = str(p.get("cargo") or "Sin cargo").strip() or "Sin cargo"
            emp = str(p.get("empresa") or p.get("entidad") or "Sin empresa").strip() or "Sin empresa"
            try:
                cant = float(p.get("cantidad") or 0)
            except (TypeError, ValueError):
                cant = 0.0
            if cant > 0:
                personal_map[(emp, cargo)] += cant

        # Asistencia RRHH (para ausentismo / jornada; no exponer nombres en filas)
        asis = d.get("asistencia_colaboradores")
        if isinstance(asis, list) and asis:
            tiene_asistencia = True
            for a in asis:
                if not isinstance(a, dict):
                    continue
                est = str(a.get("estado") or "").strip().lower()
                if est in ("ausente", "incapacidad", "permiso", "vacaciones", "no_asistio"):
                    ausentes += 1
                else:
                    presentes += 1
                hi = str(a.get("hora_ingreso") or "").strip()[:5]
                hs = str(a.get("hora_salida") or "").strip()[:5]
                if hi and hs and ":" in hi and ":" in hs:
                    try:
                        h0, m0 = [int(x) for x in hi.split(":")]
                        h1, m1 = [int(x) for x in hs.split(":")]
                        mins = (h1 * 60 + m1) - (h0 * 60 + m0)
                        if 0 < mins < 24 * 60:
                            jornada_horas.append(mins / 60.0)
                    except (ValueError, TypeError):
                        pass
                cargo = str(a.get("cargo") or "Sin cargo").strip() or "Sin cargo"
                emp = str(a.get("empresa_nombre") or a.get("empresa") or "Sin empresa").strip() or "Sin empresa"
                # Contar 1 por colaborador activo en el día
                if est not in ("ausente", "incapacidad", "permiso", "vacaciones", "no_asistio"):
                    personal_map[(emp, cargo)] += 1.0

        for eq in d.get("equipos_uso") or []:
            if not isinstance(eq, dict):
                continue
            nombre = str(eq.get("equipo_nombre") or eq.get("nombre") or "Equipo").strip() or "Equipo"
            try:
                cant = float(eq.get("cantidad") or 1)
            except (TypeError, ValueError):
                cant = 1.0
            maquinaria_map[nombre] += max(cant, 0)
            tipo = str(eq.get("tipo") or eq.get("categoria") or "").lower()
            if "transport" in tipo or "volqueta" in nombre.lower() or "camion" in nombre.lower():
                transporte_registrado = True

        for m in d.get("materiales") or []:
            if not isinstance(m, dict):
                continue
            nombre = str(m.get("nombre") or m.get("material") or "Material").strip() or "Material"
            und = str(m.get("unidad") or "").strip()
            try:
                cant = float(m.get("cantidad") or m.get("ingreso") or 0)
            except (TypeError, ValueError):
                cant = 0.0
            if cant:
                materiales_map[(nombre, und)] += cant

    filas_personal = [
        {"empresa": emp, "cargo": cargo, "cantidad": round(cant, 2)}
        for (emp, cargo), cant in sorted(personal_map.items(), key=lambda x: (-x[1], x[0][0], x[0][1]))
        if cant > 0
    ]
    series_personal = []
    by_emp: Dict[str, float] = defaultdict(float)
    for r in filas_personal:
        by_emp[r["empresa"]] += float(r["cantidad"])
    for emp, tot in sorted(by_emp.items(), key=lambda x: -x[1])[:12]:
        series_personal.append({"nombre": emp, "valor": round(tot, 2)})

    filas_maq = [
        {"equipo": k, "cantidad": round(v, 2)}
        for k, v in sorted(maquinaria_map.items(), key=lambda x: -x[1])
    ]
    filas_mat = [
        {"material": n, "unidad": u, "cantidad": round(v, 2)}
        for (n, u), v in sorted(materiales_map.items(), key=lambda x: -x[1])
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
        "nota": "Se muestra la maquinaria/equipos reportados; no hay módulo de transporte dedicado."
        if filas_maq and not transporte_registrado
        else None,
        "filas": filas_maq[:30],
    }

    return {
        "disponible": diarios_ok > 0,
        "mensaje": None
        if diarios_ok
        else "No hay reportes diarios de Bitácora en el rango seleccionado.",
        "diarios_count": diarios_ok,
        "personal": {
            "filas": filas_personal,
            "series": series_personal,
        },
        "maquinaria": {"filas": filas_maq, "series": [
            {"nombre": r["equipo"], "valor": r["cantidad"]} for r in filas_maq[:10]
        ]},
        "materiales": {"filas": filas_mat},
        "ausentismo": ausentismo,
        "jornada": jornada,
        "transporte": transporte,
    }


def _agg_actividades(diarios: List[dict]) -> dict:
    filas = []
    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        fecha = str(d.get("fecha") or "")[:10]
        tramo = str(d.get("tramo") or "")
        # Eventos embebidos
        for ev in d.get("eventos") or []:
            if not isinstance(ev, dict):
                continue
            detalle = ev.get("evento_detalle") if isinstance(ev.get("evento_detalle"), dict) else {}
            acts = detalle.get("actividades") if isinstance(detalle.get("actividades"), list) else []
            if not acts and ev.get("titulo"):
                filas.append({
                    "fecha": fecha,
                    "tramo": tramo,
                    "actividad": str(ev.get("titulo") or "").strip(),
                    "detalle": _plain(ev.get("cuerpo_html") or ev.get("descripcion") or ""),
                })
            for a in acts:
                if isinstance(a, dict):
                    filas.append({
                        "fecha": fecha,
                        "tramo": tramo or str(a.get("tramo") or ""),
                        "actividad": str(a.get("nombre") or a.get("actividad") or a.get("texto") or "").strip(),
                        "detalle": _plain(a.get("detalle") or a.get("descripcion") or ""),
                    })
                elif a:
                    filas.append({
                        "fecha": fecha,
                        "tramo": tramo,
                        "actividad": str(a).strip(),
                        "detalle": "",
                    })
        # También cuerpo del diario como nota si no hay eventos
        cuerpo = _plain(d.get("cuerpo_html") or "")
        if cuerpo and not (d.get("eventos") or []):
            filas.append({
                "fecha": fecha,
                "tramo": tramo,
                "actividad": "Observaciones del día",
                "detalle": cuerpo[:500],
            })

    filas = [f for f in filas if f.get("actividad")]
    return {
        "disponible": bool(filas),
        "mensaje": None if filas else "No hay actividades adicionales reportadas en Bitácora en este rango.",
        "filas": filas[:200],
        "series": _top_series([f["actividad"] for f in filas], 8),
    }


def _plain(html: str) -> str:
    import re
    t = re.sub(r"<[^>]+>", " ", str(html or ""))
    return re.sub(r"\s+", " ", t).strip()


def _top_series(labels: List[str], n: int = 8) -> List[dict]:
    counts: Dict[str, int] = defaultdict(int)
    for lab in labels:
        k = (lab or "—").strip() or "—"
        counts[k] += 1
    return [
        {"nombre": k, "valor": v}
        for k, v in sorted(counts.items(), key=lambda x: -x[1])[:n]
    ]


def _agg_sicoe(sb, contrato_id: int, fecha_desde: str, fecha_hasta: str) -> dict:
    """Cantidades reportadas en SICOE Obra por fecha de reporte, separadas por tramo."""
    try:
        # Preferir so_registros join so_reportes por created_at del reporte
        q = (
            sb.table("so_registros")
            .select(
                "id,item_codigo,item_descripcion,unidad,cantidad_total,tramo,"
                "reporte_id,so_reportes!inner(id,created_at,contrato_id,estado)"
            )
            .eq("so_reportes.contrato_id", int(contrato_id))
            .gte("so_reportes.created_at", f"{fecha_desde}T00:00:00")
            .lte("so_reportes.created_at", f"{fecha_hasta}T23:59:59")
            .limit(5000)
        )
        rows = q.execute().data or []
    except Exception as exc:
        _log.warning("gestion_obra sicoe query: %s", exc)
        # Fallback más simple
        try:
            reps = (
                sb.table("so_reportes")
                .select("id,created_at")
                .eq("contrato_id", int(contrato_id))
                .gte("created_at", f"{fecha_desde}T00:00:00")
                .lte("created_at", f"{fecha_hasta}T23:59:59")
                .limit(500)
                .execute()
                .data
                or []
            )
            ids = [int(r["id"]) for r in reps if r.get("id") is not None]
            rows = []
            for rid in ids[:200]:
                try:
                    chunk = (
                        sb.table("so_registros")
                        .select("id,item_codigo,item_descripcion,unidad,cantidad_total,tramo,reporte_id")
                        .eq("reporte_id", rid)
                        .limit(500)
                        .execute()
                        .data
                        or []
                    )
                    for c in chunk:
                        c["_reporte_fecha"] = next(
                            (str(r.get("created_at") or "")[:10] for r in reps if int(r["id"]) == rid),
                            "",
                        )
                    rows.extend(chunk)
                except Exception:
                    continue
        except Exception as exc2:
            _log.warning("gestion_obra sicoe fallback: %s", exc2)
            return _msg_sin("No se pudieron consultar las cantidades de SICOE Obra en este momento.")

    if not rows:
        return _msg_sin("No hay cantidades reportadas en SICOE Obra en el rango seleccionado.")

    # Agrupar por tramo + ítem
    agg: Dict[Tuple[str, str, str, str], float] = defaultdict(float)
    for r in rows:
        if not isinstance(r, dict):
            continue
        tramo = str(r.get("tramo") or "Sin tramo").strip() or "Sin tramo"
        codigo = str(r.get("item_codigo") or "").strip()
        desc = str(r.get("item_descripcion") or r.get("descripcion") or "").strip()
        und = str(r.get("unidad") or "").strip()
        try:
            cant = float(r.get("cantidad_total") or r.get("cantidad") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        if cant == 0:
            continue
        label = f"{codigo} {desc}".strip() or "Ítem"
        agg[(tramo, label, und, codigo)] += cant

    filas = [
        {
            "tramo": tramo,
            "item": label,
            "item_codigo": codigo,
            "unidad": und,
            "cantidad": round(cant, 4),
        }
        for (tramo, label, und, codigo), cant in sorted(agg.items(), key=lambda x: (x[0][0], x[0][1]))
    ]
    by_tramo: Dict[str, float] = defaultdict(float)
    for f in filas:
        by_tramo[f["tramo"]] += float(f["cantidad"])
    series = [{"nombre": k, "valor": round(v, 2)} for k, v in sorted(by_tramo.items(), key=lambda x: -x[1])[:12]]
    return {
        "disponible": True,
        "mensaje": None,
        "filas": filas[:500],
        "series": series,
    }


def _agg_almacen(sb, contrato_id: int, fecha_desde: str, fecha_hasta: str) -> dict:
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
            sols = list_solicitudes(int(contrato_id), limit=200) or []
            if isinstance(sols, dict):
                sols = sols.get("items") or sols.get("data") or []
            for s in sols:
                if not isinstance(s, dict):
                    continue
                f = s.get("fecha") or s.get("created_at") or s.get("fecha_solicitud")
                if _in_range(f):
                    solicitudes_f.append({
                        "fecha": str(f)[:10],
                        "estado": s.get("estado") or "",
                        "consecutivo": s.get("consecutivo") or s.get("numero") or s.get("id"),
                        "items": len(s.get("lineas") or s.get("items") or []) or None,
                    })
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
                        "consecutivo": e.get("consecutivo") or e.get("numero") or e.get("id"),
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
                        "consecutivo": s.get("consecutivo") or s.get("numero_salida") or s.get("id"),
                    })
    except Exception as exc:
        _log.warning("gestion_obra almacen salidas: %s", exc)

    if not solicitudes_f and not entradas_f and not salidas_f:
        return _msg_sin("No hay movimientos de Almacén (solicitudes, entradas o salidas) en el rango.")

    series = [
        {"nombre": "Solicitudes", "valor": len(solicitudes_f)},
        {"nombre": "Entradas", "valor": len(entradas_f)},
        {"nombre": "Salidas", "valor": len(salidas_f)},
    ]
    return {
        "disponible": True,
        "mensaje": None,
        "solicitudes": solicitudes_f[:100],
        "entradas": entradas_f[:100],
        "salidas": salidas_f[:100],
        "series": series,
        "filas": [
            {"tipo": "Solicitud", "fecha": x["fecha"], "estado": x["estado"], "ref": x["consecutivo"]}
            for x in solicitudes_f
        ] + [
            {"tipo": "Entrada", "fecha": x["fecha"], "estado": x["estado"], "ref": x["consecutivo"]}
            for x in entradas_f
        ] + [
            {"tipo": "Salida", "fecha": x["fecha"], "estado": x["estado"], "ref": x["consecutivo"]}
            for x in salidas_f
        ],
    }


def _agg_programacion(sb, contrato_id: int) -> dict:
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
) -> dict:
    d0 = _parse_date(fecha_desde)
    d1 = _parse_date(fecha_hasta)
    if not d0 or not d1:
        raise ValueError("Indique un rango de fechas válido")
    if d1 < d0:
        raise ValueError("La fecha hasta debe ser posterior o igual a la fecha desde")
    if (d1 - d0).days > 62:
        raise ValueError("El rango no puede superar 62 días")

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

    personal = _agg_personal_desde_diarios(diarios)
    actividades = _agg_actividades(diarios)
    cantidades = _agg_sicoe(sb, contrato_id, d0.isoformat(), d1.isoformat())
    almacen = _agg_almacen(sb, contrato_id, d0.isoformat(), d1.isoformat())
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
        "datos": raw.get("datos") if isinstance(raw.get("datos"), dict) else {},
        "observaciones": merge_observaciones(None, raw.get("observaciones")),
    }
    return out


def acta_esta_sellada(acta: dict) -> bool:
    est = str((acta or {}).get("estado") or "").strip().lower()
    return est in ("realizada", "firmada", "en_firma", "cerrada")
