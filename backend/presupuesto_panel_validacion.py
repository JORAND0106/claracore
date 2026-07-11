"""Panel validación Interventoría: agregado en servidor (RPC) sin paginar filas."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from presupuesto_helpers import (
    _presupuesto_aplica_filtro_interventoria,
    _presupuesto_q_visibilidad_interventoria,
)

_PPTO_PANEL_ESTADOS = ("No Revisado", "Aprobado", "Pendiente", "Rechazado")


def _resolve_tipo_ejecucion(tipo_ejecucion: Optional[str]) -> str:
    t = (tipo_ejecucion or "").strip()
    if t in ("Presupuesto de Obra", "Obra Ejecutada"):
        return t
    return "Presupuesto de Obra"


def _orden_capitulo(c: Optional[str]) -> tuple:
    if not c:
        return (2, 0, c or "")
    m = re.match(r"^(\d+)", str(c).strip())
    if m:
        return (0, int(m.group(1)), c)
    return (1, 0, c)


def presupuesto_filtros_a_jsonb(
    *,
    capitulo: Optional[str] = None,
    capitulos: Optional[List[str]] = None,
    item: Optional[str] = None,
    items: Optional[List[str]] = None,
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    calzada: Optional[str] = None,
    calzadas: Optional[List[str]] = None,
    competencia: Optional[str] = None,
    competencias: Optional[List[str]] = None,
    und: Optional[str] = None,
    unds: Optional[List[str]] = None,
    nodo_inicio: Optional[str] = None,
    nodo_final: Optional[str] = None,
    buscar: Optional[str] = None,
    id_pol: Optional[str] = None,
    pk_criterio: Optional[str] = None,
    texto: Optional[str] = None,
    abs_desde: Optional[float] = None,
    abs_hasta: Optional[float] = None,
    revisado: Optional[str] = None,
    pre_interv_estado: Optional[str] = None,
    sellado: Optional[bool] = None,
    vlr_unitario_desde: Optional[float] = None,
    vlr_unitario_hasta: Optional[float] = None,
    cant_total_desde: Optional[float] = None,
    cant_total_hasta: Optional[float] = None,
    costo_directo_desde: Optional[float] = None,
    costo_directo_hasta: Optional[float] = None,
) -> dict:
    """JSON para presupuesto_panel_validacion_interv (mismos filtros que GET /presupuesto)."""

    def _lista(single: Optional[str], multi: Optional[List[str]]) -> List[str]:
        out: List[str] = []
        if multi:
            out.extend(str(x).strip() for x in multi if str(x).strip())
        if single and str(single).strip():
            out.append(str(single).strip())
        return list(dict.fromkeys(out))

    f: Dict[str, Any] = {}
    caps = _lista(capitulo, capitulos)
    if caps:
        f["capitulos"] = caps
    its = _lista(item, items)
    if its:
        f["items"] = its
    for key, single, multi in (
        ("tramos", tramo, tramos),
        ("calzadas", calzada, calzadas),
        ("competencias", competencia, competencias),
        ("unds", und, unds),
    ):
        vals = _lista(single, multi)
        if vals:
            f[key] = vals
    if nodo_inicio and str(nodo_inicio).strip():
        f["nodo_inicio"] = str(nodo_inicio).strip()
    if nodo_final and str(nodo_final).strip():
        f["nodo_final"] = str(nodo_final).strip()
    if buscar and str(buscar).strip():
        f["buscar"] = str(buscar).strip()
    if id_pol and str(id_pol).strip():
        f["id_pol"] = str(id_pol).strip()
    if pk_criterio and str(pk_criterio).strip():
        f["pk_criterio"] = str(pk_criterio).strip()
    if texto and str(texto).strip():
        f["texto"] = str(texto).strip()
    if revisado and str(revisado).strip():
        f["revisado"] = str(revisado).strip()
    if pre_interv_estado and str(pre_interv_estado).strip():
        f["pre_interv_estado"] = str(pre_interv_estado).strip()
    if sellado is not None:
        f["sellado"] = bool(sellado)
    if abs_desde is not None:
        f["abs_desde"] = abs_desde
    if abs_hasta is not None:
        f["abs_hasta"] = abs_hasta
    if vlr_unitario_desde is not None:
        f["vlr_unitario_desde"] = vlr_unitario_desde
    if vlr_unitario_hasta is not None:
        f["vlr_unitario_hasta"] = vlr_unitario_hasta
    if cant_total_desde is not None:
        f["cant_total_desde"] = cant_total_desde
    if cant_total_hasta is not None:
        f["cant_total_hasta"] = cant_total_hasta
    if costo_directo_desde is not None:
        f["costo_directo_desde"] = costo_directo_desde
    if costo_directo_hasta is not None:
        f["costo_directo_hasta"] = costo_directo_hasta
    return f


def _parse_rpc_raw(raw: Any) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list) and raw:
        first = raw[0]
        return first if isinstance(first, dict) else {}
    return {}


def _norm_estado_panel(revisado: Any) -> str:
    est = str(revisado or "").strip() or "No Revisado"
    return est if est in _PPTO_PANEL_ESTADOS else "No Revisado"


def _por_estado_sin_cantidad(data: dict) -> bool:
    """True si algún estado tiene registros pero cant_total por estado es 0 o falta."""
    for g in data.get("grupos") or []:
        if not isinstance(g, dict):
            continue
        pe = g.get("por_estado")
        if not isinstance(pe, dict):
            continue
        for slot in pe.values():
            if not isinstance(slot, dict):
                continue
            if int(slot.get("registros") or 0) > 0 and float(slot.get("cant_total") or 0) == 0:
                return True
    return False


def _fetch_panel_validacion_rows(
    supabase,
    contrato_id: int,
    current_user: dict,
    *,
    nivel: str,
    capitulo: Optional[str],
    tipo_ejecucion: Optional[str],
    filtros: dict,
) -> List[dict]:
    """Filas mínimas para agregar cantidades (mismos filtros que el panel)."""
    from presupuesto_helpers import _presupuesto_q_estructura, _presupuesto_q_filtros_ubicacion

    caps = filtros.get("capitulos") or []
    items = filtros.get("items") or []
    offset = 0
    rows: List[dict] = []
    while True:
        q = supabase.table("presupuesto").select(
            "capitulo, item, cant_total, revisado"
        ).eq("contrato_id", int(contrato_id)).eq("dado_de_baja", False)
        q = q.eq("tipo_ejecucion", _resolve_tipo_ejecucion(tipo_ejecucion))
        if nivel == "item" and capitulo:
            q = q.eq("capitulo", capitulo)
        q = _presupuesto_q_estructura(
            q,
            capitulo=caps[0] if len(caps) == 1 else None,
            capitulos=caps if len(caps) > 1 else None,
            item=items[0] if len(items) == 1 else None,
            items=items if len(items) > 1 else None,
            tramo=filtros.get("tramos", [None])[0] if len(filtros.get("tramos") or []) == 1 else None,
            tramos=filtros.get("tramos") if len(filtros.get("tramos") or []) > 1 else None,
            calzada=filtros.get("calzadas", [None])[0] if len(filtros.get("calzadas") or []) == 1 else None,
            calzadas=filtros.get("calzadas") if len(filtros.get("calzadas") or []) > 1 else None,
            competencia=filtros.get("competencias", [None])[0] if len(filtros.get("competencias") or []) == 1 else None,
            competencias=filtros.get("competencias") if len(filtros.get("competencias") or []) > 1 else None,
            und=filtros.get("unds", [None])[0] if len(filtros.get("unds") or []) == 1 else None,
            unds=filtros.get("unds") if len(filtros.get("unds") or []) > 1 else None,
        )
        q = _presupuesto_q_filtros_ubicacion(
            q,
            nodo_inicio=filtros.get("nodo_inicio"),
            nodo_final=filtros.get("nodo_final"),
            buscar=filtros.get("buscar"),
            id_pol=filtros.get("id_pol"),
            pk_criterio=filtros.get("pk_criterio"),
            texto=filtros.get("texto"),
            abs_desde=filtros.get("abs_desde"),
            abs_hasta=filtros.get("abs_hasta"),
            revisado=filtros.get("revisado"),
            pre_interv_estado=filtros.get("pre_interv_estado"),
            sellado=filtros.get("sellado"),
            vlr_unitario_desde=filtros.get("vlr_unitario_desde"),
            vlr_unitario_hasta=filtros.get("vlr_unitario_hasta"),
            cant_total_desde=filtros.get("cant_total_desde"),
            cant_total_hasta=filtros.get("cant_total_hasta"),
            costo_directo_desde=filtros.get("costo_directo_desde"),
            costo_directo_hasta=filtros.get("costo_directo_hasta"),
        )
        q = _presupuesto_q_visibilidad_interventoria(q, current_user)
        batch = q.range(offset, offset + 999).execute().data or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows


def _enrich_rpc_por_estado_cant(data: dict, rows: List[dict], nivel: str) -> dict:
    """Completa cant_total en por_estado cuando la RPC desplegada es anterior."""
    from collections import defaultdict

    acc: Dict[tuple, float] = defaultdict(float)
    nv = (nivel or data.get("nivel") or "capitulo").strip().lower()
    for r in rows:
        cap = str(r.get("capitulo") or "").strip() or "(sin capítulo)"
        it = str(r.get("item") or "").strip() if nv == "item" else None
        est = _norm_estado_panel(r.get("revisado"))
        acc[(cap, it, est)] += float(r.get("cant_total") or 0)

    for g in data.get("grupos") or []:
        if not isinstance(g, dict):
            continue
        cap = str(g.get("capitulo") or "").strip() or "(sin capítulo)"
        it = g.get("item")
        item_str = str(it).strip() if it is not None and str(it).strip() else None
        pe = g.get("por_estado")
        if not isinstance(pe, dict):
            pe = {}
            g["por_estado"] = pe
        for est in _PPTO_PANEL_ESTADOS:
            cant = acc.get((cap, item_str if nv == "item" else None, est), 0.0)
            slot = pe.get(est)
            if isinstance(slot, dict):
                slot["cant_total"] = round(cant, 4)
            elif cant > 0:
                pe[est] = {
                    "registros": 0,
                    "costo_directo": 0.0,
                    "cant_total": round(cant, 4),
                }
    return data


def panel_validacion_rpc_a_filas(data: dict, nivel: str, orden_capitulos: Optional[List] = None) -> List[dict]:
    """Convierte respuesta RPC al formato de filas del panel (pptoPanelValidacionAgg)."""
    nv = (nivel or data.get("nivel") or "capitulo").strip().lower()
    grupos = data.get("grupos") or []
    if not isinstance(grupos, list):
        grupos = []

    orden_map = {}
    for i, c in enumerate(orden_capitulos or []):
        cap = c.get("capitulo") if isinstance(c, dict) else c
        if cap:
            orden_map[str(cap)] = i

    filas = []
    for g in grupos:
        if not isinstance(g, dict):
            continue
        cap = str(g.get("capitulo") or "").strip() or "(sin capítulo)"
        it = g.get("item")
        item_str = str(it).strip() if it is not None and str(it).strip() else None
        label = item_str if nv == "item" and item_str else cap
        key = f"{cap}\x1f{item_str}" if nv == "item" and item_str else cap

        por_estado = g.get("por_estado") or {}
        celdas = {e: {"count": 0, "costo": 0.0, "cant": 0.0} for e in _PPTO_PANEL_ESTADOS}
        for est in _PPTO_PANEL_ESTADOS:
            slot = por_estado.get(est) if isinstance(por_estado, dict) else None
            if not slot:
                continue
            celdas[est] = {
                "count": int(slot.get("registros") or 0),
                "costo": float(slot.get("costo_directo") or 0),
                "cant": float(slot.get("cant_total") or 0),
            }

        total_regs = int(g.get("total_registros") or 0)
        total_costo = float(g.get("total_costo") or 0)
        nr = celdas["No Revisado"]["count"]
        pct = round(((total_regs - nr) / total_regs) * 100) if total_regs else 100

        filas.append({
            "key": key,
            "label": label,
            "capitulo": cap,
            "item": item_str,
            "descripcion": str(g.get("descripcion") or "").strip(),
            "und": str(g.get("und") or "").strip() or None,
            "cantTotal": float(g.get("cant_total") or 0),
            "celdas": celdas,
            "totalRegs": total_regs,
            "totalCosto": total_costo,
            "pendientesValidar": nr,
            "pctValidado": pct,
        })

    filas.sort(
        key=lambda row: (
            row.get("pctValidado", 0),
            orden_map.get(row.get("capitulo"), 9999),
            row.get("label", ""),
        )
    )
    return filas


def fetch_panel_validacion_interv(
    supabase_execute,
    supabase,
    contrato_id: int,
    current_user: dict,
    *,
    nivel: str = "capitulo",
    capitulo: Optional[str] = None,
    tipo_ejecucion: Optional[str] = None,
    filtros: Optional[dict] = None,
    orden_capitulos: Optional[List] = None,
) -> dict:
    """
    Llama RPC presupuesto_panel_validacion_interv.
    Devuelve { nivel, total_registros, filas, fuente: 'rpc'|'legacy' }.
    """
    payload = {
        "p_contrato_id": int(contrato_id),
        "p_tipo_ejecucion": (tipo_ejecucion or "").strip() or None,
        "p_nivel": (nivel or "capitulo").strip().lower(),
        "p_capitulo": (capitulo or "").strip() or None,
        "p_filtrar_interv": bool(_presupuesto_aplica_filtro_interventoria(current_user)),
        "p_filtros": filtros or {},
    }

    def _rpc():
        return supabase.rpc("presupuesto_panel_validacion_interv", payload).execute().data

    try:
        raw = supabase_execute(_rpc, retries=1)
        data = _parse_rpc_raw(raw)
        nv = payload["p_nivel"]
        fuente = "rpc"
        if _por_estado_sin_cantidad(data):
            rows = _fetch_panel_validacion_rows(
                supabase,
                contrato_id,
                current_user,
                nivel=nv,
                capitulo=payload["p_capitulo"],
                tipo_ejecucion=payload["p_tipo_ejecucion"],
                filtros=filtros or {},
            )
            data = _enrich_rpc_por_estado_cant(data, rows, nv)
            fuente = "rpc+cant"
        filas = panel_validacion_rpc_a_filas(data, nv, orden_capitulos)
        return {
            "nivel": nv,
            "capitulo": data.get("capitulo"),
            "total_registros": int(data.get("total_registros") or 0),
            "filas": filas,
            "fuente": fuente,
        }
    except Exception as exc:
        err = str(exc).lower()
        # Solo fallback si la RPC no existe o no está desplegada (no en timeout/error SQL genérico).
        rpc_missing = (
            "presupuesto_panel_validacion_interv" in err
            or "could not find the function" in err
            or "does not exist" in err
            or "pgrst202" in err
        )
        if not rpc_missing:
            raise
        return _fetch_panel_validacion_legacy(
            supabase,
            contrato_id,
            current_user,
            nivel=payload["p_nivel"],
            capitulo=payload["p_capitulo"],
            tipo_ejecucion=payload["p_tipo_ejecucion"],
            filtros=filtros or {},
            orden_capitulos=orden_capitulos,
        )


def _fetch_panel_validacion_legacy(
    supabase,
    contrato_id: int,
    current_user: dict,
    *,
    nivel: str,
    capitulo: Optional[str],
    tipo_ejecucion: Optional[str],
    filtros: dict,
    orden_capitulos: Optional[List],
) -> dict:
    """Fallback paginado (lento) si la RPC no está desplegada."""
    from collections import defaultdict
    from presupuesto_helpers import _presupuesto_q_estructura, _presupuesto_q_filtros_ubicacion

    caps = filtros.get("capitulos") or []
    items = filtros.get("items") or []
    offset = 0
    rows: List[dict] = []
    while True:
        q = supabase.table("presupuesto").select(
            "capitulo, item, descripcion, und, cant_total, costo_directo, revisado"
        ).eq("contrato_id", int(contrato_id)).eq("dado_de_baja", False)
        q = q.eq("tipo_ejecucion", _resolve_tipo_ejecucion(tipo_ejecucion))
        if nivel == "item" and capitulo:
            q = q.eq("capitulo", capitulo)
        q = _presupuesto_q_estructura(
            q,
            capitulo=caps[0] if len(caps) == 1 else None,
            capitulos=caps if len(caps) > 1 else None,
            item=items[0] if len(items) == 1 else None,
            items=items if len(items) > 1 else None,
            tramo=filtros.get("tramos", [None])[0] if len(filtros.get("tramos") or []) == 1 else None,
            tramos=filtros.get("tramos") if len(filtros.get("tramos") or []) > 1 else None,
            calzada=filtros.get("calzadas", [None])[0] if len(filtros.get("calzadas") or []) == 1 else None,
            calzadas=filtros.get("calzadas") if len(filtros.get("calzadas") or []) > 1 else None,
            competencia=filtros.get("competencias", [None])[0] if len(filtros.get("competencias") or []) == 1 else None,
            competencias=filtros.get("competencias") if len(filtros.get("competencias") or []) > 1 else None,
            und=filtros.get("unds", [None])[0] if len(filtros.get("unds") or []) == 1 else None,
            unds=filtros.get("unds") if len(filtros.get("unds") or []) > 1 else None,
        )
        q = _presupuesto_q_filtros_ubicacion(
            q,
            nodo_inicio=filtros.get("nodo_inicio"),
            nodo_final=filtros.get("nodo_final"),
            buscar=filtros.get("buscar"),
            id_pol=filtros.get("id_pol"),
            pk_criterio=filtros.get("pk_criterio"),
            texto=filtros.get("texto"),
            abs_desde=filtros.get("abs_desde"),
            abs_hasta=filtros.get("abs_hasta"),
            revisado=filtros.get("revisado"),
            pre_interv_estado=filtros.get("pre_interv_estado"),
            sellado=filtros.get("sellado"),
            vlr_unitario_desde=filtros.get("vlr_unitario_desde"),
            vlr_unitario_hasta=filtros.get("vlr_unitario_hasta"),
            cant_total_desde=filtros.get("cant_total_desde"),
            cant_total_hasta=filtros.get("cant_total_hasta"),
            costo_directo_desde=filtros.get("costo_directo_desde"),
            costo_directo_hasta=filtros.get("costo_directo_hasta"),
        )
        q = _presupuesto_q_visibilidad_interventoria(q, current_user)
        batch = q.range(offset, offset + 999).execute().data or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    mapa: Dict[str, dict] = defaultdict(lambda: {
        "capitulo": "",
        "item": None,
        "descripcion": "",
        "und": "",
        "cant_total": 0.0,
        "por_estado": defaultdict(lambda: {"registros": 0, "costo_directo": 0.0, "cant_total": 0.0}),
    })
    for r in rows:
        cap = str(r.get("capitulo") or "").strip() or "(sin capítulo)"
        if nivel == "item" and capitulo and cap != capitulo:
            continue
        it = str(r.get("item") or "").strip() if nivel == "item" else None
        gkey = f"{cap}\x1f{it}" if it else cap
        g = mapa[gkey]
        g["capitulo"] = cap
        g["item"] = it
        if r.get("descripcion"):
            g["descripcion"] = str(r.get("descripcion") or "").strip()
        if r.get("und"):
            g["und"] = str(r.get("und") or "").strip()
        est = str(r.get("revisado") or "").strip() or "No Revisado"
        if est not in _PPTO_PANEL_ESTADOS:
            est = "No Revisado"
        cd = float(r.get("costo_directo") or 0)
        g["cant_total"] += float(r.get("cant_total") or 0)
        g["por_estado"][est]["registros"] += 1
        g["por_estado"][est]["costo_directo"] += cd
        g["por_estado"][est]["cant_total"] += float(r.get("cant_total") or 0)

    grupos = []
    total = 0
    for g in mapa.values():
        por_estado = {k: dict(v) for k, v in g["por_estado"].items()}
        tr = sum(v["registros"] for v in por_estado.values())
        tc = sum(v["costo_directo"] for v in por_estado.values())
        total += tr
        grupos.append({
            "capitulo": g["capitulo"],
            "item": g["item"],
            "descripcion": g["descripcion"],
            "und": g["und"],
            "cant_total": g["cant_total"],
            "total_registros": tr,
            "total_costo": round(tc, 2),
            "por_estado": por_estado,
        })

    data = {"nivel": nivel, "total_registros": total, "grupos": grupos}
    filas = panel_validacion_rpc_a_filas(data, nivel, orden_capitulos)
    return {
        "nivel": nivel,
        "capitulo": capitulo,
        "total_registros": total,
        "filas": filas,
        "fuente": "legacy",
    }
