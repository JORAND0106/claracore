"""
Fuente combinada Obra Ejecutada para Reportar transporte.

Reutiliza exactamente `_presupuesto_export_merge_sicoe_obra` (misma prioridad
ítem-a-ítem que Dashboard / export Excel OE):

  - Si el ítem tiene filas en presupuesto (Obra Ejecutada) → solo esas.
  - Si no, y hay cobrado SICOE aprobado → detalle desde so_registros.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from presupuesto_export_obra_ejecutada import ORIGEN_PRESUPUESTO, ORIGEN_SICOE_OBRA
from presupuesto_transporte import elegir_ubicacion_origen

TIPO_OBRA = "Obra Ejecutada"

_PPTO_SELECT = (
    "id, pk_id, cant_total, tramo, calzada, abs_inicio, abs_final, "
    "no_inicio, no_final, infraestructura, item, competencia, capitulo, descripcion, und"
)


def _item_variants(items: List[str]) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()
    for it in items or []:
        s = str(it or "").strip()
        if not s:
            continue
        for cand in (s, f"{s}." if not s.endswith(".") else s.rstrip(".")):
            if cand and cand not in seen:
                seen.add(cand)
                out.append(cand)
    return out


def _comp_eq(row_comp: Any, want: str) -> bool:
    return str(row_comp or "").strip() == str(want or "").strip()


def fetch_ppto_obra_ejecutada(
    supabase,
    contrato_id: int,
    capitulo: str,
    *,
    items: Optional[List[str]] = None,
    competencia: Optional[str] = None,
    filtrar_competencia: bool = False,
) -> List[dict]:
    """Filas presupuesto tipo Obra Ejecutada (sin baja) para el capítulo."""
    out: List[dict] = []
    PAGE = 1000
    item_list = _item_variants(items) if items else None

    def _page(query, off: int):
        return query.order("id").range(off, off + PAGE - 1).execute().data or []

    if item_list is not None and not item_list:
        return []

    if item_list is None:
        off = 0
        while True:
            q = (
                supabase.table("presupuesto")
                .select(_PPTO_SELECT)
                .eq("contrato_id", contrato_id)
                .eq("tipo_ejecucion", TIPO_OBRA)
                .eq("dado_de_baja", False)
                .eq("capitulo", capitulo)
            )
            if filtrar_competencia:
                q = q.eq("competencia", competencia or "")
            batch = _page(q, off)
            out.extend(batch)
            if len(batch) < PAGE:
                break
            off += PAGE
        for r in out:
            r.setdefault("_origen_export", ORIGEN_PRESUPUESTO)
        return out

    for i in range(0, len(item_list), 80):
        chunk = item_list[i : i + 80]
        off = 0
        while True:
            q = (
                supabase.table("presupuesto")
                .select(_PPTO_SELECT)
                .eq("contrato_id", contrato_id)
                .eq("tipo_ejecucion", TIPO_OBRA)
                .eq("dado_de_baja", False)
                .eq("capitulo", capitulo)
                .in_("item", chunk)
            )
            if filtrar_competencia:
                q = q.eq("competencia", competencia or "")
            batch = _page(q, off)
            out.extend(batch)
            if len(batch) < PAGE:
                break
            off += PAGE
    for r in out:
        r.setdefault("_origen_export", ORIGEN_PRESUPUESTO)
    return out


def filas_oe_combinadas(
    contrato_id: int,
    capitulo: str,
    competencia: str,
    items: Optional[List[str]],
    current_user,
    *,
    filtrar_competencia: bool = True,
) -> List[dict]:
    """
    Presupuesto OE + fill SicoeObra vía `_presupuesto_export_merge_sicoe_obra`.
    """
    # Import diferido: evita ciclo al cargar rutas desde main.
    from main import ExportarPresupuestoInformeBody, _presupuesto_export_merge_sicoe_obra, supabase

    cap = str(capitulo or "").strip()
    comp = str(competencia or "").strip()
    if not cap:
        return []

    ppto = fetch_ppto_obra_ejecutada(
        supabase,
        contrato_id,
        cap,
        items=items,
        competencia=comp,
        filtrar_competencia=filtrar_competencia,
    )

    body_kwargs: Dict[str, Any] = {
        "modo": "obra_ejecutada",
        "capitulo": cap,
        "tipo_ejecucion": TIPO_OBRA,
        "papelera": False,
    }
    if items:
        body_kwargs["items"] = list(items)
    if filtrar_competencia and comp:
        # Misma semántica que export: filtro competencia no vacío.
        body_kwargs["competencia"] = comp
        body_kwargs["competencias"] = [comp]

    body = ExportarPresupuestoInformeBody(**body_kwargs)
    merged = _presupuesto_export_merge_sicoe_obra(contrato_id, body, ppto, current_user) or []

    # Filtrar por capítulo normalizado (misma clave que Dashboard/export OE).
    try:
        from main import _dash_norm_capitulo_key_py
        cap_key = _dash_norm_capitulo_key_py(cap)
        merged = [
            r for r in merged
            if _dash_norm_capitulo_key_py(r.get("capitulo")) == cap_key
            or str(r.get("capitulo") or "").strip() == cap
        ]
    except Exception:
        merged = [r for r in merged if str(r.get("capitulo") or "").strip() == cap]

    if filtrar_competencia:
        # Incluye competencia vacía (export no filtra string vacío).
        merged = [r for r in merged if _comp_eq(r.get("competencia"), comp)]

    if items:
        want = {str(x).strip().rstrip(".") for x in items}
        want |= {f"{x}." for x in list(want)}
        filtered = []
        for r in merged:
            it = str(r.get("item") or "").strip()
            if it in want or it.rstrip(".") in {x.rstrip(".") for x in want}:
                filtered.append(r)
        merged = filtered

    for r in merged:
        if not r.get("_origen_export"):
            r["_origen_export"] = ORIGEN_PRESUPUESTO
    return merged


def opciones_oe_capitulo(contrato_id: int, capitulo: str, current_user) -> Dict[str, Any]:
    """Competencias e ítems con cantidad en la fuente combinada del capítulo."""
    cap = str(capitulo or "").strip()
    rows = filas_oe_combinadas(
        contrato_id,
        cap,
        "",
        None,
        current_user,
        filtrar_competencia=False,
    )
    try:
        from main import _dash_norm_capitulo_key_py
        cap_key = _dash_norm_capitulo_key_py(cap)
    except Exception:
        _dash_norm_capitulo_key_py = None  # type: ignore
        cap_key = None

    def _mismo_capitulo(row_cap: Any) -> bool:
        s = str(row_cap or "").strip()
        if s == cap:
            return True
        if cap_key and _dash_norm_capitulo_key_py is not None:
            try:
                return _dash_norm_capitulo_key_py(row_cap) == cap_key
            except Exception:
                return False
        return False

    comps: Set[str] = set()
    items_map: Dict[str, dict] = {}
    for r in rows:
        if not _mismo_capitulo(r.get("capitulo")):
            continue
        try:
            cant = float(r.get("cant_total") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        if cant <= 0:
            continue
        c = str(r.get("competencia") or "").strip()
        if c:
            comps.add(c)
        it = str(r.get("item") or "").strip()
        if not it:
            continue
        prev = items_map.get(it)
        origen = r.get("_origen_export") or ORIGEN_PRESUPUESTO
        if prev is None:
            items_map[it] = {
                "item_numero": it,
                "descripcion": str(r.get("descripcion") or "").strip(),
                "unidad": str(r.get("und") or "").strip(),
                "capitulo": cap,
                "origen": origen,
            }
        else:
            # Preferir etiqueta presupuesto si el ítem ya estaba cubierto.
            if origen == ORIGEN_PRESUPUESTO:
                prev["origen"] = ORIGEN_PRESUPUESTO
            if not prev.get("descripcion") and r.get("descripcion"):
                prev["descripcion"] = str(r.get("descripcion") or "").strip()
            if not prev.get("unidad") and r.get("und"):
                prev["unidad"] = str(r.get("und") or "").strip()

    competencias = sorted(comps, key=lambda x: x.lower())
    items = sorted(
        items_map.values(),
        key=lambda x: str(x.get("item_numero") or ""),
    )
    return {"capitulo": cap, "competencias": competencias, "items": items}


def agregar_por_pk(rows: List[dict], pk_ubic: Dict[str, dict]) -> List[dict]:
    """
    Agrega cant_total por PK_ID y elige ubicación del registro de mayor cantidad.
    Si la fila viene de SicoeObra, prioriza sus campos de ubicación (incl. CIV).
    """
    by_pk: Dict[str, List[dict]] = {}
    for r in rows or []:
        pk = str(r.get("pk_id") or "").strip()
        if not pk:
            continue
        by_pk.setdefault(pk, []).append(r)

    filas = []
    for pk, regs in by_pk.items():
        cant = 0.0
        for r in regs:
            try:
                cant += float(r.get("cant_total") or 0)
            except (TypeError, ValueError):
                pass
        if cant <= 0:
            continue
        ubi = elegir_ubicacion_origen(regs)
        info = pk_ubic.get(pk) or {}
        origen = ubi.get("_origen_export") or ORIGEN_PRESUPUESTO
        civ = ""
        if ubi.get("civ") is not None and str(ubi.get("civ")).strip():
            civ = str(ubi.get("civ")).strip()
        elif info.get("civ") is not None and str(info.get("civ")).strip():
            civ = str(info.get("civ")).strip()
        infra = (
            (ubi.get("infraestructura") or "").strip()
            or str(info.get("infraestructura") or "").strip()
        )
        filas.append({
            "pk_id": pk,
            "cant_compacta": round(cant, 6),
            "origen": origen,
            "ubicacion": {
                "pk_id": pk,
                "civ": civ,
                "tramo": (ubi.get("tramo") or info.get("tramo") or "") or "",
                "calzada": (ubi.get("calzada") or info.get("calzada") or "") or "",
                "infraestructura": infra,
                "abs_inicio": ubi.get("abs_inicio"),
                "abs_final": ubi.get("abs_final"),
                "no_inicio": ubi.get("no_inicio"),
                "no_final": ubi.get("no_final"),
                "origen": origen,
            },
        })
    filas.sort(key=lambda x: x["pk_id"])
    return filas
