"""
Asignación compartida de cantidades presupuesto ↔ subcontratistas
y redistribución del saldo (presupuestado − ejecutado reconocido).

Ejecutado reconocido (solo para distribución entre subcontratistas):
  - so_registros asignados al sub con nivel2_objeto_pago_sub = true
    (objeto de cobro Nivel 2), aunque no estén aprobados ni en un corte; y
  - cantidades en cortes con conciliación estado='enviado' (como hasta ahora).
Cada so_registro se cuenta una sola vez.

NO modifica el acumulado/saldo del formato de Corte de Informes
(ese sigue usando solo cortes enviados/conciliados).

Regla de no reemplazo: nunca se sobrescribe la asignación de otro sub
sin pasar por el flujo de redistribución (popup Mantener/Saldar).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from sicoe_cantidad_redondeo import redondear_cantidad_total_dinamico

_log = logging.getLogger(__name__)

PROP_SUM_TOL = 1e-9
DECISION_MANTENER = "mantener"
DECISION_SALDAR = "saldar"


def round_cant(valor: Any) -> float:
    return float(redondear_cantidad_total_dinamico(valor))


def _f(v: Any) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0.0
    if n != n:  # NaN
        return 0.0
    return n


def proporciones_iguales(sub_ids: Sequence[int]) -> Dict[int, float]:
    ids = sorted({int(s) for s in sub_ids if int(s) > 0})
    if not ids:
        return {}
    n = len(ids)
    base = round(1.0 / n, 6)
    out = {sid: base for sid in ids}
    # Ajuste residual al último para sumar exactamente 1.00
    residual = round(1.0 - base * (n - 1), 6)
    out[ids[-1]] = residual
    return out


def validar_proporciones(proporciones: Dict[Any, Any], participantes: Sequence[int]) -> Optional[str]:
    """Retorna mensaje de error o None si OK. Debe sumar 1.00 y cubrir a todos."""
    parts = sorted({int(s) for s in participantes if int(s) > 0})
    if not parts:
        return "No hay subcontratistas participantes."
    props: Dict[int, float] = {}
    for sid in parts:
        raw = proporciones.get(sid, proporciones.get(str(sid)))
        if raw is None or raw == "":
            return f"Falta la proporción del subcontratista #{sid}."
        try:
            p = float(raw)
        except (TypeError, ValueError):
            return f"Proporción inválida para el subcontratista #{sid}."
        if p < 0 or p > 1:
            return f"La proporción del subcontratista #{sid} debe estar entre 0 y 1."
        props[sid] = p
    extra = {
        int(k) for k in proporciones.keys()
        if str(k).strip().lstrip("-").isdigit() and int(k) > 0 and int(k) not in props
    }
    if extra:
        return "Hay proporciones de subcontratistas que no participan en esta redistribución."
    s = sum(props.values())
    if abs(s - 1.0) > 1e-6:
        return f"Las proporciones deben sumar exactamente 1.00 (actual: {s:.4f})."
    return None


def saldo_disponible(presupuestado: float, ejecutados: Dict[int, float]) -> float:
    total_ejec = sum(max(0.0, _f(v)) for v in (ejecutados or {}).values())
    return max(0.0, round_cant(max(0.0, _f(presupuestado)) - total_ejec))


def redistribuir_cantidades(
    presupuestado: float,
    ejecutados: Dict[int, float],
    proporciones: Dict[int, float],
) -> Dict[int, float]:
    """
    cantidad_nueva(sub) = ejecutado(sub) + proporción(sub) × saldo.

    El ejecutado conciliado de cada sub queda fijo.
    """
    presup = max(0.0, _f(presupuestado))
    ejec = {int(k): max(0.0, _f(v)) for k, v in (ejecutados or {}).items()}
    props = {int(k): _f(v) for k, v in (proporciones or {}).items()}
    saldo = saldo_disponible(presup, ejec)
    out: Dict[int, float] = {}
    ordered = sorted(props.keys())
    assigned_sum = 0.0
    for i, sid in enumerate(ordered):
        base = ejec.get(sid, 0.0)
        if i < len(ordered) - 1:
            share = round_cant(props[sid] * saldo)
            val = round_cant(base + share)
            out[sid] = val
            assigned_sum += share
        else:
            # Último absorbe residual del saldo para no perder/ganar por redondeo.
            share = round_cant(saldo - assigned_sum)
            if share < 0:
                share = 0.0
            out[sid] = round_cant(base + share)
    return out


def atribuir_ejecutado_a_filas(
    acumulado_item: float,
    filas: Sequence[Tuple[int, float]],
) -> Dict[int, float]:
    """
    Reparte el acumulado conciliado de un ítem entre filas (presupuesto_id, cantidad_asignada)
    en proporción a la cantidad asignada. Cap por cantidad de cada fila.
    """
    acum = max(0.0, _f(acumulado_item))
    clean = [(int(pid), max(0.0, _f(cant))) for pid, cant in filas if int(pid) > 0]
    total = sum(c for _, c in clean)
    if acum <= 0 or total <= 0:
        return {pid: 0.0 for pid, _ in clean}
    out: Dict[int, float] = {}
    allocated = 0.0
    for i, (pid, cant) in enumerate(clean):
        if i < len(clean) - 1:
            share = round_cant(acum * (cant / total))
            share = min(share, cant)
            out[pid] = share
            allocated += share
        else:
            share = round_cant(acum - allocated)
            share = max(0.0, min(share, cant))
            out[pid] = share
    return out


def item_key_norm(item: Any) -> str:
    import re
    t = str(item or "").strip()
    if not t:
        return ""
    return re.sub(r"\.+$", "", t)


# ── Persistencia / agregación ──────────────────────────────────────────────


def _table_exists(sb, table: str) -> bool:
    try:
        sb.table(table).select("id").limit(1).execute()
        return True
    except Exception:
        return False


def fetch_asignaciones_por_presupuesto(
    sb, presupuesto_ids: Sequence[int],
) -> Dict[int, List[dict]]:
    """presupuesto_id → [{subcontratista_id, cantidad, ...}]"""
    ids = [int(x) for x in presupuesto_ids if int(x) > 0]
    if not ids or not _table_exists(sb, "presupuesto_sub_asignacion"):
        return {}
    out: Dict[int, List[dict]] = defaultdict(list)
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        try:
            rows = (
                sb.table("presupuesto_sub_asignacion")
                .select("id, presupuesto_id, subcontratista_id, cantidad, contrato_id")
                .in_("presupuesto_id", chunk)
                .execute()
                .data
            ) or []
        except Exception as exc:
            _log.warning("fetch_asignaciones_por_presupuesto: %s", exc)
            return dict(out)
        for r in rows:
            try:
                pid = int(r["presupuesto_id"])
                sid = int(r["subcontratista_id"])
            except (TypeError, ValueError, KeyError):
                continue
            out[pid].append({
                "id": r.get("id"),
                "presupuesto_id": pid,
                "subcontratista_id": sid,
                "cantidad": _f(r.get("cantidad")),
                "contrato_id": r.get("contrato_id"),
            })
    return dict(out)


def fetch_ppto_rows_cant_map_for_sub(
    sb, *, contrato_id: int, subcontratista_id: int,
) -> List[dict]:
    """
    Filas compatibles con aggregate_presupuesto_cant_map:
    usa cantidad de presupuesto_sub_asignacion; fallback a subcontratista_id legado.
    """
    sid = int(subcontratista_id)
    cid = int(contrato_id)
    rows_out: List[dict] = []

    if _table_exists(sb, "presupuesto_sub_asignacion"):
        try:
            asig: List[dict] = []
            offset = 0
            select_asig = "presupuesto_id, cantidad, saldado"
            while True:
                try:
                    batch = (
                        sb.table("presupuesto_sub_asignacion")
                        .select(select_asig)
                        .eq("contrato_id", cid)
                        .eq("subcontratista_id", sid)
                        .order("id")
                        .range(offset, offset + 999)
                        .execute()
                        .data
                    ) or []
                except Exception:
                    select_asig = "presupuesto_id, cantidad"
                    batch = (
                        sb.table("presupuesto_sub_asignacion")
                        .select(select_asig)
                        .eq("contrato_id", cid)
                        .eq("subcontratista_id", sid)
                        .order("id")
                        .range(offset, offset + 999)
                        .execute()
                        .data
                    ) or []
                asig.extend(batch)
                if len(batch) < 1000:
                    break
                offset += 1000
            pids = [int(a["presupuesto_id"]) for a in asig if a.get("presupuesto_id")]
            cant_by_pid = {int(a["presupuesto_id"]): _f(a.get("cantidad")) for a in asig}
            saldado_by_pid = {
                int(a["presupuesto_id"]): bool(a.get("saldado"))
                for a in asig if a.get("presupuesto_id")
            }
            for i in range(0, len(pids), 200):
                chunk = pids[i:i + 200]
                batch = (
                    sb.table("presupuesto")
                    .select("id, capitulo, competencia, item, cant_total, dado_de_baja, tipo_ejecucion, tramo")
                    .in_("id", chunk)
                    .execute()
                    .data
                ) or []
                for r in batch:
                    if r.get("dado_de_baja") is True:
                        continue
                    if str(r.get("tipo_ejecucion") or "") != "Presupuesto de Obra":
                        continue
                    pid = int(r["id"])
                    rows_out.append({
                        "capitulo": r.get("capitulo"),
                        "competencia": r.get("competencia"),
                        "item": r.get("item"),
                        "tramo": r.get("tramo"),
                        "cant_total": cant_by_pid.get(pid, 0.0),
                        "saldado": saldado_by_pid.get(pid, False),
                    })
            if rows_out or asig:
                return rows_out
        except Exception as exc:
            _log.warning("fetch_ppto_rows_cant_map_for_sub asignacion: %s", exc)

    # Fallback legado
    try:
        offset = 0
        while True:
            batch = (
                sb.table("presupuesto")
                .select("capitulo, competencia, item, cant_total")
                .eq("contrato_id", cid)
                .eq("subcontratista_id", sid)
                .eq("tipo_ejecucion", "Presupuesto de Obra")
                .eq("dado_de_baja", False)
                .order("id")
                .range(offset, offset + 999)
                .execute()
                .data
            ) or []
            rows_out.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
    except Exception as exc:
        _log.warning("fetch_ppto_rows_cant_map_for_sub legado: %s", exc)
    return rows_out


def ejecutado_enviado_por_item(sb, *, contrato_id: int, subcontratista_id: int) -> Dict[str, float]:
    """Suma cantidad_total por ítem de cortes con conciliación enviada (Corte / Informes)."""
    from corte_sub_conciliacion import (
        ESTADO_ENVIADO,
        cantidades_por_item_cortes,
        item_key,
    )

    try:
        conc = (
            sb.table("corte_sub_conciliacion")
            .select("corte_id, estado, subcontratista_id")
            .eq("subcontratista_id", int(subcontratista_id))
            .eq("estado", ESTADO_ENVIADO)
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("ejecutado_enviado_por_item conc: %s", exc)
        return {}
    corte_ids = [
        int(r["corte_id"])
        for r in conc
        if r.get("corte_id") is not None
        and int(r.get("subcontratista_id") or 0) == int(subcontratista_id)
        and str(r.get("estado") or "") == ESTADO_ENVIADO
    ]
    if not corte_ids:
        return {}
    raw = cantidades_por_item_cortes(
        sb,
        contrato_id=int(contrato_id),
        subcontratista_id=int(subcontratista_id),
        corte_ids=corte_ids,
        solo_aprobados=True,
    )
    return {item_key(k): _f(v) for k, v in raw.items()}


def ejecutado_borrador_por_item(sb, *, contrato_id: int, subcontratista_id: int) -> Dict[str, float]:
    """Cantidades en cortes aún no enviados (borrador) — solo para aviso."""
    from corte_sub_conciliacion import ESTADO_BORRADOR, cantidades_por_item_cortes, item_key

    try:
        conc = (
            sb.table("corte_sub_conciliacion")
            .select("corte_id, estado, subcontratista_id")
            .eq("subcontratista_id", int(subcontratista_id))
            .eq("estado", ESTADO_BORRADOR)
            .execute()
            .data
        ) or []
    except Exception:
        return {}
    corte_ids = [
        int(r["corte_id"])
        for r in conc
        if r.get("corte_id") is not None
        and int(r.get("subcontratista_id") or 0) == int(subcontratista_id)
    ]
    if not corte_ids:
        return {}
    raw = cantidades_por_item_cortes(
        sb,
        contrato_id=int(contrato_id),
        subcontratista_id=int(subcontratista_id),
        corte_ids=corte_ids,
        solo_aprobados=False,
    )
    return {item_key(k): _f(v) for k, v in raw.items()}


def _fetch_so_registros_sub(
    sb,
    *,
    contrato_id: int,
    subcontratista_id: int,
    select_cols: str,
    eq_filters: Optional[Dict[str, Any]] = None,
    in_filters: Optional[Dict[str, List[Any]]] = None,
) -> List[dict]:
    """Paginación genérica de so_registros del subcontratista."""
    rows: List[dict] = []
    try:
        offset = 0
        while True:
            q = (
                sb.table("so_registros")
                .select(select_cols)
                .eq("contrato_id", int(contrato_id))
                .eq("subcontratista_id", int(subcontratista_id))
                .order("id")
                .range(offset, offset + 999)
            )
            for k, v in (eq_filters or {}).items():
                q = q.eq(k, v)
            for k, vals in (in_filters or {}).items():
                if not vals:
                    return rows
                q = q.in_(k, vals)
            batch = q.execute().data or []
            rows.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
    except Exception as exc:
        _log.warning("_fetch_so_registros_sub: %s", exc)
        return []
    return rows


def ejecutado_nivel2_objeto_cobro_rows(
    sb, *, contrato_id: int, subcontratista_id: int,
) -> List[dict]:
    """so_registros del sub con objeto de cobro Nivel 2 (nivel2_objeto_pago_sub)."""
    return _fetch_so_registros_sub(
        sb,
        contrato_id=contrato_id,
        subcontratista_id=subcontratista_id,
        select_cols="id, item_numero, cantidad_total, nivel2_objeto_pago_sub, corte_id, sub_estado",
        eq_filters={"nivel2_objeto_pago_sub": True},
    )


def ejecutado_cortes_enviados_rows(
    sb, *, contrato_id: int, subcontratista_id: int,
) -> List[dict]:
    """so_registros del sub en cortes con conciliación enviada y sub_estado Aprobado."""
    from corte_sub_conciliacion import ESTADO_ENVIADO

    try:
        conc = (
            sb.table("corte_sub_conciliacion")
            .select("corte_id, estado, subcontratista_id")
            .eq("subcontratista_id", int(subcontratista_id))
            .eq("estado", ESTADO_ENVIADO)
            .execute()
            .data
        ) or []
    except Exception as exc:
        _log.warning("ejecutado_cortes_enviados_rows conc: %s", exc)
        return []
    corte_ids = [
        int(r["corte_id"])
        for r in conc
        if r.get("corte_id") is not None
        and int(r.get("subcontratista_id") or 0) == int(subcontratista_id)
    ]
    if not corte_ids:
        return []
    rows: List[dict] = []
    for i in range(0, len(corte_ids), 50):
        chunk = corte_ids[i:i + 50]
        rows.extend(_fetch_so_registros_sub(
            sb,
            contrato_id=contrato_id,
            subcontratista_id=subcontratista_id,
            select_cols="id, item_numero, cantidad_total, nivel2_objeto_pago_sub, corte_id, sub_estado",
            in_filters={"corte_id": chunk},
            eq_filters={"sub_estado": "Aprobado"},
        ))
    return rows


def ejecutado_reconocido_por_item(
    sb, *, contrato_id: int, subcontratista_id: int,
) -> Dict[str, float]:
    """
    Cantidad reconocida como ejecutada para distribución entre subcontratistas.

    Unión sin doble conteo (por id de so_registro) de:
      - objeto de cobro Nivel 2 (nivel2_objeto_pago_sub), y
      - cortes enviados/conciliados con sub_estado Aprobado.
    """
    from corte_sub_conciliacion import item_key

    seen: set = set()
    acc: Dict[str, float] = defaultdict(float)
    for r in (
        ejecutado_nivel2_objeto_cobro_rows(
            sb, contrato_id=contrato_id, subcontratista_id=subcontratista_id,
        )
        + ejecutado_cortes_enviados_rows(
            sb, contrato_id=contrato_id, subcontratista_id=subcontratista_id,
        )
    ):
        try:
            rid = int(r["id"])
        except (TypeError, ValueError, KeyError):
            continue
        if rid in seen:
            continue
        seen.add(rid)
        k = item_key(r.get("item_numero"))
        if not k:
            continue
        acc[k] += _f(r.get("cantidad_total"))
    return {k: round_cant(v) for k, v in acc.items()}


def participantes_desde_decisiones(
    existentes: Sequence[int],
    nuevo: int,
    decisiones: Optional[Dict[Any, Any]] = None,
) -> Tuple[List[int], List[int]]:
    """
    Retorna (participantes, saldados).
    El nuevo siempre participa. Existentes: mantener (default) o saldar.
    """
    dec = {}
    for k, v in (decisiones or {}).items():
        try:
            dec[int(k)] = str(v or "").strip().lower()
        except (TypeError, ValueError):
            continue
    saldados: List[int] = []
    mantenidos: List[int] = []
    for sid in sorted({int(s) for s in existentes if int(s) > 0 and int(s) != int(nuevo)}):
        d = dec.get(sid, DECISION_MANTENER)
        if d == DECISION_SALDAR:
            saldados.append(sid)
        else:
            mantenidos.append(sid)
    participantes = sorted(set(mantenidos) | {int(nuevo)})
    return participantes, saldados


def redistribuir_con_decisiones(
    presupuestado: float,
    ejecutados: Dict[int, float],
    proporciones: Dict[int, float],
    participantes: Sequence[int],
    saldados: Sequence[int],
) -> Dict[int, float]:
    """
    Saldados quedan en ejecutado reconocido.
    El saldo (presupuestado − Σ ejecutados de todos) se reparte solo entre participantes.
    """
    out: Dict[int, float] = {}
    ejec = {int(k): max(0.0, _f(v)) for k, v in (ejecutados or {}).items()}
    for sid in saldados:
        out[int(sid)] = round_cant(ejec.get(int(sid), 0.0))
    parts = [int(s) for s in participantes if int(s) > 0]
    props = {int(k): _f(v) for k, v in (proporciones or {}).items() if int(k) in set(parts)}
    # Incluir ejecutados de saldados para que resten del saldo, pero props solo de participantes.
    ejec_para_saldo = {sid: ejec.get(sid, 0.0) for sid in set(parts) | {int(s) for s in saldados}}
    for sid in parts:
        ejec_para_saldo.setdefault(sid, 0.0)
    nuevas = redistribuir_cantidades(presupuestado, ejec_para_saldo, props) if parts and props else {}
    for sid, cant in nuevas.items():
        if int(sid) in set(parts):
            out[int(sid)] = cant
    return out


def upsert_asignacion(
    sb,
    *,
    contrato_id: int,
    presupuesto_id: int,
    subcontratista_id: int,
    cantidad: float,
    saldado: bool = False,
    saldado_por: Optional[int] = None,
) -> None:
    payload = {
        "contrato_id": int(contrato_id),
        "presupuesto_id": int(presupuesto_id),
        "subcontratista_id": int(subcontratista_id),
        "cantidad": round_cant(cantidad),
        "updated_at": "now()",
        "saldado": bool(saldado),
    }
    if saldado:
        payload["saldado_at"] = "now()"
        if saldado_por:
            payload["saldado_por"] = int(saldado_por)
    else:
        payload["saldado_at"] = None
        payload["saldado_por"] = None
    try:
        sb.table("presupuesto_sub_asignacion").upsert(
            payload,
            on_conflict="presupuesto_id,subcontratista_id",
        ).execute()
    except Exception:
        # Columna saldado aún no migrada: degradar sin romper asignación.
        payload.pop("saldado", None)
        payload.pop("saldado_at", None)
        payload.pop("saldado_por", None)
        sb.table("presupuesto_sub_asignacion").upsert(
            payload,
            on_conflict="presupuesto_id,subcontratista_id",
        ).execute()


def delete_asignacion(sb, *, presupuesto_id: int, subcontratista_id: int) -> None:
    try:
        sb.table("presupuesto_sub_asignacion").delete().eq(
            "presupuesto_id", int(presupuesto_id),
        ).eq(
            "subcontratista_id", int(subcontratista_id),
        ).execute()
    except Exception as exc:
        _log.warning("delete_asignacion: %s", exc)


def filas_tienen_otro_sub(
    sb,
    *,
    contrato_id: int,
    presupuesto_ids: Sequence[int],
    nuevo_subcontratista_id: int,
) -> List[int]:
    """IDs de presupuesto que ya tienen otro subcontratista (asignacion o FK legado)."""
    ids = [int(x) for x in presupuesto_ids if int(x) > 0]
    nuevo = int(nuevo_subcontratista_id)
    if not ids:
        return []
    conflict: set = set()
    asig = fetch_asignaciones_por_presupuesto(sb, ids)
    for pid, lst in asig.items():
        for a in lst:
            if int(a["subcontratista_id"]) != nuevo:
                conflict.add(int(pid))
    try:
        rows = (
            sb.table("presupuesto")
            .select("id, subcontratista_id, contrato_id")
            .in_("id", ids)
            .execute()
            .data
        ) or []
    except Exception:
        rows = []
    for r in rows:
        if int(r.get("contrato_id") or 0) != int(contrato_id):
            continue
        leg = r.get("subcontratista_id")
        if leg and int(leg) != nuevo:
            conflict.add(int(r["id"]))
    return sorted(conflict)


def sync_presupuesto_subcontratista_id(sb, presupuesto_id: int, sub_ids: Sequence[int]) -> Optional[int]:
    """
    Mantiene columna legado:
    - 1 sub → ese id
    - 0 → null
    - varios → null (varios; la verdad está en asignacion)
    """
    ids = sorted({int(s) for s in sub_ids if int(s) > 0})
    val = ids[0] if len(ids) == 1 else None
    sb.table("presupuesto").update(
        {"subcontratista_id": val, "updated_at": "now()"}
    ).eq("id", int(presupuesto_id)).execute()
    return val


def registrar_redistribucion(
    sb,
    *,
    contrato_id: int,
    usuario_id: Optional[int],
    nuevo_subcontratista_id: int,
    proporciones: Dict[int, float],
    detalle: List[dict],
    decisiones: Optional[Dict[int, str]] = None,
) -> None:
    if not _table_exists(sb, "presupuesto_sub_redistribucion"):
        return
    payload = {
        "contrato_id": int(contrato_id),
        "usuario_id": int(usuario_id) if usuario_id else None,
        "nuevo_subcontratista_id": int(nuevo_subcontratista_id),
        "proporciones": {str(k): float(v) for k, v in proporciones.items()},
        "detalle": detalle,
        "decisiones": {
            str(k): str(v) for k, v in (decisiones or {}).items()
        },
    }
    try:
        sb.table("presupuesto_sub_redistribucion").insert(payload).execute()
    except Exception:
        payload.pop("decisiones", None)
        try:
            sb.table("presupuesto_sub_redistribucion").insert(payload).execute()
        except Exception as exc:
            _log.warning("registrar_redistribucion: %s", exc)


def _labels_subs(sb, sub_ids: Iterable[int]) -> Dict[int, str]:
    ids = [int(s) for s in sub_ids if int(s) > 0]
    if not ids:
        return {}
    out: Dict[int, str] = {}
    try:
        rows = (
            sb.table("subcontratistas")
            .select("id, razon_social")
            .in_("id", ids)
            .execute()
            .data
        ) or []
        for r in rows:
            out[int(r["id"])] = str(r.get("razon_social") or f"#{r['id']}").strip()
    except Exception:
        pass
    for sid in ids:
        out.setdefault(sid, f"#{sid}")
    return out


def preview_asignacion_compartida(
    sb,
    *,
    contrato_id: int,
    presupuesto_ids: Sequence[int],
    nuevo_subcontratista_id: int,
) -> dict:
    """
    Analiza los registros seleccionados y arma el payload del popup de redistribución.

    Retorna:
      mode: 'simple' | 'redistribuir' | 'bloqueado'
      filas_simples / filas_redistribuir / filas_bloqueadas
      participantes, proporciones_default, advertencias
    """
    from corte_sub_conciliacion import item_key as csc_item_key

    nuevo = int(nuevo_subcontratista_id)
    ids = [int(x) for x in presupuesto_ids if int(x) > 0]
    if not ids:
        return {
            "mode": "bloqueado",
            "message": "No hay registros seleccionados.",
            "filas_simples": [],
            "filas_redistribuir": [],
            "filas_bloqueadas": [],
            "participantes": [],
            "proporciones_default": {},
            "advertencias": [],
        }

    rows = (
        sb.table("presupuesto")
        .select(
            "id, contrato_id, item, capitulo, competencia, tramo, cant_total, "
            "subcontratista_id, pk_id, sellado, dado_de_baja"
        )
        .in_("id", ids)
        .execute()
        .data
    ) or []
    rows = [
        r for r in rows
        if int(r.get("contrato_id") or 0) == int(contrato_id)
        and r.get("dado_de_baja") is not True
    ]
    if not rows:
        return {
            "mode": "bloqueado",
            "message": "Ningún registro válido para este contrato.",
            "filas_simples": [],
            "filas_redistribuir": [],
            "filas_bloqueadas": [],
            "participantes": [],
            "proporciones_default": {},
            "advertencias": [],
        }

    asig_map = fetch_asignaciones_por_presupuesto(sb, [int(r["id"]) for r in rows])
    # Completar con legado si no hay filas en asignacion
    for r in rows:
        pid = int(r["id"])
        if pid in asig_map and asig_map[pid]:
            continue
        leg = r.get("subcontratista_id")
        if leg:
            asig_map[pid] = [{
                "presupuesto_id": pid,
                "subcontratista_id": int(leg),
                "cantidad": _f(r.get("cant_total")),
            }]

    # Subs ya presentes (para cargar ejecutado)
    all_prev_subs = set()
    for lst in asig_map.values():
        for a in lst:
            all_prev_subs.add(int(a["subcontratista_id"]))

    ejec_por_sub_item: Dict[int, Dict[str, float]] = {}
    borr_por_sub_item: Dict[int, Dict[str, float]] = {}
    for sid in all_prev_subs | {nuevo}:
        # Criterio de distribución: Nivel 2 objeto de cobro ∪ cortes enviados.
        ejec_por_sub_item[sid] = ejecutado_reconocido_por_item(
            sb, contrato_id=contrato_id, subcontratista_id=sid,
        )
        borr_por_sub_item[sid] = ejecutado_borrador_por_item(
            sb, contrato_id=contrato_id, subcontratista_id=sid,
        )

    # Para atribución: todas las asignaciones del contrato por (sub, item)
    # (para repartir acumulado entre filas del mismo ítem).
    filas_por_sub_item: Dict[Tuple[int, str], List[Tuple[int, float]]] = defaultdict(list)
    try:
        if _table_exists(sb, "presupuesto_sub_asignacion"):
            offset = 0
            while True:
                batch = (
                    sb.table("presupuesto_sub_asignacion")
                    .select("presupuesto_id, subcontratista_id, cantidad")
                    .eq("contrato_id", int(contrato_id))
                    .order("id")
                    .range(offset, offset + 999)
                    .execute()
                    .data
                ) or []
                pids_batch = [int(a["presupuesto_id"]) for a in batch]
                meta = {}
                if pids_batch:
                    for j in range(0, len(pids_batch), 200):
                        chunk = pids_batch[j:j + 200]
                        pr = (
                            sb.table("presupuesto")
                            .select("id, item")
                            .in_("id", chunk)
                            .execute()
                            .data
                        ) or []
                        for p in pr:
                            meta[int(p["id"])] = csc_item_key(p.get("item"))
                for a in batch:
                    pid = int(a["presupuesto_id"])
                    sid = int(a["subcontratista_id"])
                    ik = meta.get(pid) or ""
                    if ik:
                        filas_por_sub_item[(sid, ik)].append((pid, _f(a.get("cantidad"))))
                if len(batch) < 1000:
                    break
                offset += 1000
    except Exception as exc:
        _log.warning("preview filas_por_sub_item: %s", exc)

    # Atribución ejecutado por (sub, presupuesto_id)
    ejec_por_sub_pid: Dict[Tuple[int, int], float] = {}
    for (sid, ik), filas in filas_por_sub_item.items():
        acum = _f(ejec_por_sub_item.get(sid, {}).get(ik, 0))
        attributed = atribuir_ejecutado_a_filas(acum, filas)
        for pid, val in attributed.items():
            ejec_por_sub_pid[(sid, pid)] = val

    labels = _labels_subs(sb, all_prev_subs | {nuevo})
    filas_simples: List[dict] = []
    filas_redistribuir: List[dict] = []
    filas_bloqueadas: List[dict] = []
    participantes: set = set()
    advertencias: List[str] = []

    for r in rows:
        pid = int(r["id"])
        presup = max(0.0, _f(r.get("cant_total")))
        actuales = asig_map.get(pid) or []
        otros = [
            a for a in actuales
            if int(a["subcontratista_id"]) != nuevo
        ]
        ya_este = any(int(a["subcontratista_id"]) == nuevo for a in actuales)
        ik = csc_item_key(r.get("item"))

        if not otros and not ya_este:
            # Libre: asignación simple de toda la cantidad
            filas_simples.append({
                "presupuesto_id": pid,
                "pk_id": r.get("pk_id"),
                "item": r.get("item"),
                "capitulo": r.get("capitulo"),
                "tramo": r.get("tramo"),
                "presupuestado": presup,
                "cantidad_nueva": presup,
            })
            continue

        # Participantes = otros + nuevo (si ya estaba, también redistribuye)
        part_ids = sorted({int(a["subcontratista_id"]) for a in actuales} | {nuevo})
        ejecutados = {
            sid: _f(ejec_por_sub_pid.get((sid, pid), 0.0))
            for sid in part_ids
        }
        # Cap ejecutado a la cantidad actualmente asignada (no inventar más)
        cant_antes = {
            int(a["subcontratista_id"]): _f(a.get("cantidad"))
            for a in actuales
        }
        for sid in part_ids:
            if sid in cant_antes:
                ejecutados[sid] = min(ejecutados.get(sid, 0.0), cant_antes[sid])
            else:
                ejecutados[sid] = min(ejecutados.get(sid, 0.0), 0.0)

        saldo = saldo_disponible(presup, ejecutados)
        existentes_fila = sorted(
            {int(a["subcontratista_id"]) for a in otros if int(a["subcontratista_id"]) != nuevo}
        )
        base_fila = {
            "presupuesto_id": pid,
            "pk_id": r.get("pk_id"),
            "item": r.get("item"),
            "capitulo": r.get("capitulo"),
            "tramo": r.get("tramo"),
            "presupuestado": presup,
            "ejecutados": {
                str(sid): {
                    "subcontratista_id": sid,
                    "label": labels.get(sid, f"#{sid}"),
                    "ejecutado": ejecutados.get(sid, 0.0),
                    "cantidad_antes": cant_antes.get(sid, 0.0),
                    "cantidad_no_reconocida": round_cant(
                        max(0.0, cant_antes.get(sid, 0.0) - ejecutados.get(sid, 0.0))
                    ),
                }
                for sid in part_ids
            },
            "saldo": saldo,
            "participantes": part_ids,
            "subs_existentes": existentes_fila,
        }

        # Aviso borrador (no cuenta como ejecutado reconocido)
        for sid in part_ids:
            borr = _f(borr_por_sub_item.get(sid, {}).get(ik, 0))
            if borr > 0:
                advertencias.append(
                    f"{labels.get(sid, '#' + str(sid))} tiene {borr:g} en cortes aún no "
                    f"enviados/conciliados (ítem {r.get('item') or '—'}); solo cuentan si "
                    f"son objeto de cobro en Nivel 2."
                )

        if saldo <= 0 and nuevo not in cant_antes:
            filas_bloqueadas.append({
                **base_fila,
                "motivo": "Saldo disponible es cero: no se puede asignar al nuevo subcontratista.",
            })
            continue

        # Regla de no reemplazo: si hay otro sub, SIEMPRE popup (aunque ejecutado=0).
        participantes.update(part_ids)
        filas_redistribuir.append(base_fila)

    # Dedup advertencias
    adv_unique = []
    seen_adv = set()
    for a in advertencias:
        if a not in seen_adv:
            seen_adv.add(a)
            adv_unique.append(a)

    # Subcontratistas ya presentes (distintos del nuevo) → decisiones Mantener/Saldar
    subs_existentes_ids = sorted(
        {
            int(sid)
            for f in (filas_redistribuir + filas_bloqueadas)
            for sid in (f.get("subs_existentes") or [])
            if int(sid) != nuevo
        }
        | {
            int(a["subcontratista_id"])
            for lst in asig_map.values()
            for a in lst
            if int(a["subcontratista_id"]) != nuevo
        }
    )
    subs_existentes = [
        {
            "id": sid,
            "label": labels.get(sid, f"#{sid}"),
            "decision_default": DECISION_MANTENER,
        }
        for sid in subs_existentes_ids
    ]

    if filas_bloqueadas and not filas_simples and not filas_redistribuir:
        return {
            "mode": "bloqueado",
            "message": (
                "El saldo disponible de los registros seleccionados es cero. "
                "No se realiza la asignación del nuevo subcontratista."
            ),
            "filas_simples": [],
            "filas_redistribuir": [],
            "filas_bloqueadas": filas_bloqueadas,
            "participantes": [],
            "subs_existentes": subs_existentes,
            "proporciones_default": {},
            "decisiones_default": {
                str(s["id"]): DECISION_MANTENER for s in subs_existentes
            },
            "advertencias": adv_unique,
            "criterio_ejecutado": "nivel2_objeto_cobro_o_corte_enviado",
            "nuevo_subcontratista_id": nuevo,
            "nuevo_subcontratista_label": labels.get(nuevo, f"#{nuevo}"),
        }

    if filas_redistribuir:
        props = proporciones_iguales(sorted(participantes))
        return {
            "mode": "redistribuir",
            "message": None,
            "filas_simples": filas_simples,
            "filas_redistribuir": filas_redistribuir,
            "filas_bloqueadas": filas_bloqueadas,
            "participantes": [
                {"id": sid, "label": labels.get(sid, f"#{sid}")}
                for sid in sorted(participantes)
            ],
            "subs_existentes": subs_existentes,
            "proporciones_default": {str(k): v for k, v in props.items()},
            "decisiones_default": {
                str(s["id"]): DECISION_MANTENER for s in subs_existentes
            },
            "advertencias": adv_unique,
            "criterio_ejecutado": "nivel2_objeto_cobro_o_corte_enviado",
            "nuevo_subcontratista_id": nuevo,
            "nuevo_subcontratista_label": labels.get(nuevo, f"#{nuevo}"),
        }

    return {
        "mode": "simple",
        "message": None,
        "filas_simples": filas_simples,
        "filas_redistribuir": [],
        "filas_bloqueadas": filas_bloqueadas,
        "participantes": [{"id": nuevo, "label": labels.get(nuevo, f"#{nuevo}")}],
        "subs_existentes": [],
        "proporciones_default": {str(nuevo): 1.0},
        "decisiones_default": {},
        "advertencias": adv_unique,
        "criterio_ejecutado": "nivel2_objeto_cobro_o_corte_enviado",
        "nuevo_subcontratista_id": nuevo,
        "nuevo_subcontratista_label": labels.get(nuevo, f"#{nuevo}"),
    }


def _desvincular_precios_item_si_aplica(
    sb, *, contrato_id: int, subcontratista_id: int, item: Any,
) -> None:
    """Si el ítem ya no tiene cantidad asignada al sub, limpia precio de origen presupuesto."""
    try:
        from subcontratistas_items_cobro import norm_item_key
        ik = norm_item_key(item)
        if not ik:
            return
        # ¿Queda alguna asignación activa de este sub para el mismo ítem?
        asig = fetch_ppto_rows_cant_map_for_sub(
            sb, contrato_id=contrato_id, subcontratista_id=subcontratista_id,
        )
        queda = any(norm_item_key(r.get("item")) == ik and _f(r.get("cant_total")) > 0 for r in asig)
        if queda:
            return
        # Buscar listado_precios del ítem y borrar precio origen presupuesto
        lps = (
            sb.table("listado_precios")
            .select("id, item_numero")
            .eq("contrato_id", int(contrato_id))
            .execute()
            .data
        ) or []
        lp_ids = [
            int(r["id"]) for r in lps
            if norm_item_key(r.get("item_numero")) == ik and r.get("id")
        ]
        if not lp_ids:
            return
        for i in range(0, len(lp_ids), 100):
            chunk = lp_ids[i:i + 100]
            sb.table("subcontratista_precios").delete().eq(
                "subcontratista_id", int(subcontratista_id),
            ).eq("origen", "presupuesto").in_("listado_precio_id", chunk).execute()
    except Exception as exc:
        _log.warning("_desvincular_precios_item_si_aplica: %s", exc)


def aplicar_asignacion_compartida(
    sb,
    *,
    contrato_id: int,
    nuevo_subcontratista_id: int,
    proporciones: Optional[Dict[Any, Any]] = None,
    preview: Optional[dict] = None,
    usuario_id: Optional[int] = None,
    decisiones: Optional[Dict[Any, Any]] = None,
    confirmar_saldar_no_reconocidas: bool = False,
) -> dict:
    """
    Aplica asignación simple y/o redistribución según preview ya validado.

    ``decisiones``: {sub_id: 'mantener'|'saldar'} para subcontratistas existentes.
    Protección: las filas simples no pueden tener otro subcontratista previo.
    """
    if preview is None:
        raise ValueError("preview requerido")
    nuevo = int(nuevo_subcontratista_id)
    mode = preview.get("mode")
    if mode == "bloqueado":
        raise ValueError(preview.get("message") or "Asignación bloqueada.")

    filas_simples = preview.get("filas_simples") or []
    filas_redist = preview.get("filas_redistribuir") or []

    # Defensa: nunca aplicar "simple" si el registro ya tiene otro sub.
    if filas_simples:
        conflict = filas_tienen_otro_sub(
            sb,
            contrato_id=contrato_id,
            presupuesto_ids=[int(f["presupuesto_id"]) for f in filas_simples],
            nuevo_subcontratista_id=nuevo,
        )
        if conflict:
            raise ValueError(
                "No se puede reemplazar la asignación de otro subcontratista. "
                f"Registros en conflicto: {conflict[:20]}. Use el popup de redistribución."
            )

    props_raw = proporciones if proporciones is not None else (preview.get("proporciones_default") or {})
    props: Dict[int, float] = {}
    for k, v in props_raw.items():
        try:
            props[int(k)] = float(v)
        except (TypeError, ValueError):
            continue

    dec_raw = decisiones if decisiones is not None else (preview.get("decisiones_default") or {})
    dec_map: Dict[int, str] = {}
    for k, v in (dec_raw or {}).items():
        try:
            d = str(v or "").strip().lower()
            if d in (DECISION_MANTENER, DECISION_SALDAR):
                dec_map[int(k)] = d
        except (TypeError, ValueError):
            continue

    existentes_global = sorted({
        int(sid)
        for f in filas_redist
        for sid in (f.get("subs_existentes") or [])
        if int(sid) != nuevo
    })
    for sid in existentes_global:
        dec_map.setdefault(sid, DECISION_MANTENER)

    participantes, saldados = participantes_desde_decisiones(
        existentes_global, nuevo, dec_map,
    )

    # Advertencia: saldar libera cantidades no reconocidas como ejecutadas.
    liberaciones: List[dict] = []
    if saldados:
        for f in filas_redist:
            for sid in saldados:
                info = (f.get("ejecutados") or {}).get(str(sid)) or (f.get("ejecutados") or {}).get(sid) or {}
                no_rec = _f(info.get("cantidad_no_reconocida"))
                if no_rec > 0:
                    liberaciones.append({
                        "presupuesto_id": f.get("presupuesto_id"),
                        "item": f.get("item"),
                        "tramo": f.get("tramo"),
                        "subcontratista_id": sid,
                        "label": info.get("label") or f"#{sid}",
                        "cantidad_no_reconocida": no_rec,
                    })
        if liberaciones and not confirmar_saldar_no_reconocidas:
            raise ValueError(
                "CONFIRM_SALDAR_NO_RECONOCIDAS: Al saldar se liberarán cantidades asignadas "
                "que no cumplen Nivel 2 (objeto de cobro) y por tanto no se reconocen como "
                "ejecutadas. Confirme explícitamente para continuar."
            )

    if filas_redist:
        err = validar_proporciones(props, participantes)
        if err:
            raise ValueError(err)

    actualizados = 0
    detalle_hist: List[dict] = []
    desvinculados: List[dict] = []

    # Simples: cantidad completa al nuevo (solo registros libres)
    for f in filas_simples:
        pid = int(f["presupuesto_id"])
        cant = _f(f.get("cantidad_nueva") if f.get("cantidad_nueva") is not None else f.get("presupuestado"))
        upsert_asignacion(
            sb,
            contrato_id=contrato_id,
            presupuesto_id=pid,
            subcontratista_id=nuevo,
            cantidad=cant,
            saldado=False,
        )
        sync_presupuesto_subcontratista_id(sb, pid, [nuevo])
        actualizados += 1
        detalle_hist.append({
            "presupuesto_id": pid,
            "tipo": "simple",
            "presupuestado": _f(f.get("presupuestado")),
            "despues": {str(nuevo): cant},
        })

    # Redistribución con Mantener / Saldar
    for f in filas_redist:
        pid = int(f["presupuesto_id"])
        presup = _f(f.get("presupuestado"))
        ejec_map: Dict[int, float] = {}
        antes_map: Dict[int, float] = {}
        for sid_s, info in (f.get("ejecutados") or {}).items():
            sid = int(info.get("subcontratista_id") or sid_s)
            ejec_map[sid] = _f(info.get("ejecutado"))
            antes_map[sid] = _f(info.get("cantidad_antes"))

        exist_fila = [int(s) for s in (f.get("subs_existentes") or []) if int(s) != nuevo]
        parts_fila, saldados_fila = participantes_desde_decisiones(exist_fila, nuevo, dec_map)
        props_fila = {sid: props.get(sid, 0.0) for sid in parts_fila}
        nuevas = redistribuir_con_decisiones(
            presup, ejec_map, props_fila, parts_fila, saldados_fila,
        )

        activos_finales: List[int] = []
        for sid, cant in nuevas.items():
            if sid in saldados_fila:
                if cant <= 0:
                    delete_asignacion(sb, presupuesto_id=pid, subcontratista_id=sid)
                    _desvincular_precios_item_si_aplica(
                        sb,
                        contrato_id=contrato_id,
                        subcontratista_id=sid,
                        item=f.get("item"),
                    )
                    desvinculados.append({
                        "presupuesto_id": pid,
                        "subcontratista_id": sid,
                        "item": f.get("item"),
                    })
                else:
                    upsert_asignacion(
                        sb,
                        contrato_id=contrato_id,
                        presupuesto_id=pid,
                        subcontratista_id=sid,
                        cantidad=cant,
                        saldado=True,
                        saldado_por=usuario_id,
                    )
                    activos_finales.append(sid)
                continue
            if cant <= 0 and sid != nuevo and antes_map.get(sid, 0) <= 0:
                continue
            upsert_asignacion(
                sb,
                contrato_id=contrato_id,
                presupuesto_id=pid,
                subcontratista_id=sid,
                cantidad=cant,
                saldado=False,
            )
            activos_finales.append(sid)

        sync_presupuesto_subcontratista_id(sb, pid, activos_finales)
        actualizados += 1
        detalle_hist.append({
            "presupuesto_id": pid,
            "tipo": "redistribuir",
            "presupuestado": presup,
            "saldo": _f(f.get("saldo")),
            "ejecutados": {str(k): v for k, v in ejec_map.items()},
            "antes": {str(k): v for k, v in antes_map.items()},
            "despues": {str(k): v for k, v in nuevas.items()},
            "proporciones": {str(k): v for k, v in props_fila.items()},
            "decisiones": {
                str(sid): dec_map.get(sid, DECISION_MANTENER) for sid in exist_fila
            },
            "saldados": saldados_fila,
            "participantes": parts_fila,
        })

    if filas_redist:
        registrar_redistribucion(
            sb,
            contrato_id=contrato_id,
            usuario_id=usuario_id,
            nuevo_subcontratista_id=nuevo,
            proporciones=props,
            detalle=detalle_hist,
            decisiones=dec_map,
        )

    return {
        "ok": True,
        "mode": mode,
        "actualizados": actualizados,
        "subcontratista_id": nuevo,
        "simples": len(filas_simples),
        "redistribuidos": len(filas_redist),
        "bloqueados": len(preview.get("filas_bloqueadas") or []),
        "saldados": saldados,
        "participantes": participantes,
        "desvinculados": desvinculados,
        "liberaciones_no_reconocidas": liberaciones,
        "decisiones": {str(k): v for k, v in dec_map.items()},
    }
