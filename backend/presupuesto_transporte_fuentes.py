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

# infraestructura NO existe en tabla presupuesto (vive en pk_ids); se completa vía
# _pk_ids_ubicacion_por_codigo / agregar_por_pk.
_PPTO_SELECT = (
    "id, pk_id, cant_total, tramo, calzada, abs_inicio, abs_final, "
    "no_inicio, no_final, item, competencia, capitulo, descripcion, und"
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

    El merge es ítem-a-ítem (prioridad presupuesto) **sin** filtrar competencia
    dentro del merge — así un ítem cubierto en ppto no se rellena con SicoeObra.
    Luego, si ``filtrar_competencia``, se dejan solo filas de esa competencia.
    """
    # Import diferido: evita ciclo al cargar rutas desde main.
    from main import ExportarPresupuestoInformeBody, _presupuesto_export_merge_sicoe_obra, supabase

    cap = str(capitulo or "").strip()
    comp = str(competencia or "").strip()
    if not cap:
        return []

    # Merge OE: traer ppto del capítulo/ítems sin filtrar competencia (cubre el ítem).
    ppto = fetch_ppto_obra_ejecutada(
        supabase,
        contrato_id,
        cap,
        items=items,
        competencia=None,
        filtrar_competencia=False,
    )

    body_kwargs: Dict[str, Any] = {
        "modo": "obra_ejecutada",
        "capitulo": cap,
        "tipo_ejecucion": TIPO_OBRA,
        "papelera": False,
    }
    if items:
        body_kwargs["items"] = list(items)

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


def _norm_cap_helpers(cap: str):
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

    return cap_key, _mismo_capitulo


def _competencias_ligeras_capitulo(contrato_id: int, capitulo: str) -> Set[str]:
    """
    Union de competencias del capítulo sin merge OE completo:
      - presupuesto (Obra Ejecutada, cant > 0)
      - so_registros del capítulo (cobro)
      - listado_precios del capítulo
    """
    from main import supabase

    cap = str(capitulo or "").strip()
    comps: Set[str] = set()
    if not cap:
        return comps
    _, mismo = _norm_cap_helpers(cap)
    PAGE = 1000

    # 1) Presupuesto OE
    try:
        off = 0
        while True:
            batch = (
                supabase.table("presupuesto")
                .select("competencia, capitulo, cant_total")
                .eq("contrato_id", contrato_id)
                .eq("tipo_ejecucion", TIPO_OBRA)
                .eq("dado_de_baja", False)
                .eq("capitulo", cap)
                .order("id")
                .range(off, off + PAGE - 1)
                .execute()
                .data
                or []
            )
            for r in batch:
                if not mismo(r.get("capitulo")):
                    continue
                try:
                    if float(r.get("cant_total") or 0) <= 0:
                        continue
                except (TypeError, ValueError):
                    continue
                comps.add(str(r.get("competencia") or "").strip())
            if len(batch) < PAGE:
                break
            off += PAGE
    except Exception:
        pass

    # Si el capítulo exacto no trajo filas, reintentar por contrato y filtrar normalizado.
    if not comps:
        try:
            off = 0
            while True:
                batch = (
                    supabase.table("presupuesto")
                    .select("competencia, capitulo, cant_total")
                    .eq("contrato_id", contrato_id)
                    .eq("tipo_ejecucion", TIPO_OBRA)
                    .eq("dado_de_baja", False)
                    .order("id")
                    .range(off, off + PAGE - 1)
                    .execute()
                    .data
                    or []
                )
                for r in batch:
                    if not mismo(r.get("capitulo")):
                        continue
                    try:
                        if float(r.get("cant_total") or 0) <= 0:
                            continue
                    except (TypeError, ValueError):
                        continue
                    comps.add(str(r.get("competencia") or "").strip())
                if len(batch) < PAGE:
                    break
                off += PAGE
        except Exception:
            pass

    # 2) SicoeObra (so_registros) — competencias del capítulo
    try:
        off = 0
        while True:
            batch = (
                supabase.table("so_registros")
                .select("competencia, capitulo, cantidad_total")
                .eq("contrato_id", contrato_id)
                .eq("capitulo", cap)
                .order("id")
                .range(off, off + PAGE - 1)
                .execute()
                .data
                or []
            )
            for r in batch:
                if not mismo(r.get("capitulo")):
                    continue
                try:
                    if float(r.get("cantidad_total") or 0) <= 0:
                        continue
                except (TypeError, ValueError):
                    continue
                comps.add(str(r.get("competencia") or "").strip())
            if len(batch) < PAGE:
                break
            off += PAGE
    except Exception:
        pass

    # 3) Listado de precios del capítulo (catálogo)
    try:
        rows = (
            supabase.table("listado_precios")
            .select("competencia, capitulo")
            .eq("contrato_id", contrato_id)
            .eq("capitulo", cap)
            .execute()
            .data
            or []
        )
        for r in rows:
            if not mismo(r.get("capitulo")):
                continue
            c = str(r.get("competencia") or "").strip()
            if c:
                comps.add(c)
    except Exception:
        pass

    return comps


def _ordenar_competencias(comps: Set[str]) -> List[str]:
    comps_nonempty = sorted((c for c in comps if c), key=lambda x: x.lower())
    out = list(comps_nonempty)
    if "" in comps:
        out.append("")
    return out


def opciones_oe_capitulo(
    contrato_id: int,
    capitulo: str,
    current_user,
    *,
    competencia: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Cascada Fase 1:
      - competencias: union ligera ppto + SicoeObra + listado (sin merge completo).
      - items: si se pasa competencia, merge OE filtrado por cap+comp.
    """
    cap = str(capitulo or "").strip()
    filtrar_items_por_comp = competencia is not None
    comp_filtro = str(competencia).strip() if filtrar_items_por_comp else None

    comps = _competencias_ligeras_capitulo(contrato_id, cap)
    items_map: Dict[str, dict] = {}

    if filtrar_items_por_comp:
        _, mismo = _norm_cap_helpers(cap)
        rows = filas_oe_combinadas(
            contrato_id,
            cap,
            comp_filtro or "",
            None,
            current_user,
            filtrar_competencia=True,
        )
        for r in rows:
            if not mismo(r.get("capitulo")):
                continue
            try:
                cant = float(r.get("cant_total") or 0)
            except (TypeError, ValueError):
                cant = 0.0
            if cant <= 0:
                continue
            c = str(r.get("competencia") or "").strip()
            comps.add(c)
            if not _comp_eq(c, comp_filtro or ""):
                continue
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
                    "competencia": c,
                    "origen": origen,
                }
            else:
                if origen == ORIGEN_PRESUPUESTO:
                    prev["origen"] = ORIGEN_PRESUPUESTO
                if not prev.get("descripcion") and r.get("descripcion"):
                    prev["descripcion"] = str(r.get("descripcion") or "").strip()
                if not prev.get("unidad") and r.get("und"):
                    prev["unidad"] = str(r.get("und") or "").strip()

    items = sorted(
        items_map.values(),
        key=lambda x: str(x.get("item_numero") or ""),
    )
    return {
        "capitulo": cap,
        "competencia": comp_filtro if filtrar_items_por_comp else None,
        "competencias": _ordenar_competencias(comps),
        "items": items,
    }


def agregar_por_pk(rows: List[dict], pk_ubic: Dict[str, dict]) -> List[dict]:
    """
    Agrega cant_total por PK_ID y elige ubicación del registro de mayor cantidad.
    Incluye competencia y origen (presupuesto / sicoe_obra) del registro elegido.
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
        competencia = str(ubi.get("competencia") or "").strip()
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
            "competencia": competencia,
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
                "competencia": competencia,
            },
        })
    filas.sort(key=lambda x: x["pk_id"])
    return filas
