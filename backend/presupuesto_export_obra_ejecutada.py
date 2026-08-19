"""
Completar export Excel de Presupuesto (modo Obra Ejecutada) con ítems
solo cobrados en SICOE Obra — misma prioridad ítem-a-ítem que el Dashboard
«Ppto vs Cobro por capítulo».

Regla (no se mezclan fuentes en el mismo ítem):
  - Si el ítem tiene filas en presupuesto (tipo Obra Ejecutada) → solo esas.
  - Si no tiene ninguna fila en presupuesto y hay cobrado SICOE (aprobado) →
    se trae el detalle desde so_registros.

Mapeo de campos (significado, no nombre literal):
  - Área/Long/Nodo (ppto.area_long_nod) ← so_registros.longitud
  - Cant. Total (ppto.cant_total) ← so_registros.cantidad_total  (NO «cantidad»)
  - Identificador de fila (ppto.id_pol) ← so_registros.numero_registro («Registro»)
  - Nodos (ppto.no_inicio/no_final) ← so_registros.nodo_ini/nodo_fin
  - Abscisas ← so_registros.abs_inicio/abs_final
  - Tipo de entidad → vacío (sin subtablas Área/Longitud/Unidad)
  - V.U. / costo → listado de precios (igual que dashboard), fallback vlr_unitario SICOE
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple

from dashboard_costo_agregado import cantidad_dashboard, costo_agregado_cant_vu

ItemKey = Tuple[str, str]

ORIGEN_SICOE_OBRA = "sicoe_obra"
ORIGEN_PRESUPUESTO = "presupuesto"

# Columnas reales de so_registros usadas en el fill del Excel Obra Ejecutada.
# Nodos = nodo_ini/nodo_fin (NO no_inicio/no_final, que son de presupuesto).
# Abscisas = abs_inicio/abs_final. Cantidad de Excel = cantidad_total.
SO_REGISTROS_EXPORT_SELECT_BASE = (
    "id, numero_registro, capitulo, competencia, item_numero, item_descripcion, unidad, "
    "vlr_unitario, longitud, ancho, espesor, cantidad, cantidad_total, costo_directo, "
    "observacion, tramo, calzada, abs_inicio, abs_final, nodo_ini, nodo_fin, "
    "pk_id_id, pk_ids(pk_id, infraestructura)"
)


def covered_item_keys(
    ppto_rows: Iterable[dict],
    *,
    norm_cap: Callable[[Any], str],
    norm_item: Callable[[Any], str],
) -> Set[ItemKey]:
    """Ítems con al menos una fila en Presupuesto (tienen_ppto_obra_ejecutada)."""
    out: Set[ItemKey] = set()
    for r in ppto_rows or []:
        if not str(r.get("capitulo") or "").strip():
            continue
        if not str(r.get("item") or "").strip():
            continue
        ck = norm_cap(r.get("capitulo"))
        ik = norm_item(r.get("item"))
        if ck and ik:
            out.add((ck, ik))
    return out


def fill_item_keys_from_sicoe_agg(
    sicoe_by: Dict[ItemKey, Dict[str, Any]],
    covered: Set[ItemKey],
    *,
    allow_caps: Optional[Set[str]] = None,
    allow_items: Optional[Set[str]] = None,
) -> List[ItemKey]:
    """
    Ítems a completar desde SICOE: no cubiertos por ppto y con cobrado ≠ 0
    (misma condición que ``_gerencial_capitulos_aggregate`` / ClaraCore igualado).
    """
    keys: List[ItemKey] = []
    for k, sg in (sicoe_by or {}).items():
        if k in covered:
            continue
        if float(sg.get("ap_c") or 0) == 0:
            continue
        ck, ik = k
        if allow_caps is not None and ck not in allow_caps:
            continue
        if allow_items is not None and ik not in allow_items:
            continue
        keys.append(k)
    keys.sort(key=lambda x: (x[0], x[1]))
    return keys


def _pk_display_from_sicoe(reg: dict) -> str:
    join = reg.get("pk_ids")
    if isinstance(join, dict):
        pk = join.get("pk_id")
        if pk not in (None, ""):
            return str(pk).strip()
    for key in ("pk_id", "pk_id_valor"):
        v = reg.get(key)
        if v not in (None, ""):
            return str(v).strip()
    return ""


def _infra_from_sicoe(reg: dict) -> str:
    join = reg.get("pk_ids")
    if isinstance(join, dict):
        infra = (join.get("infraestructura") or "").strip()
        if infra:
            return infra
    return (reg.get("infraestructura") or "").strip()


def map_sicoe_registro_a_fila_export(
    reg: dict,
    *,
    listado_meta: Optional[dict] = None,
    vu_override: Optional[float] = None,
) -> dict:
    """
    Convierte un so_registros aprobado en una fila con la misma forma que
    ``_PRESUPUESTO_EXPORT_SELECT`` / agregación de exportar-informe.
    """
    meta = listado_meta or {}
    cap = (reg.get("capitulo") or meta.get("capitulo") or "").strip()
    item = (reg.get("item_numero") or meta.get("item_numero") or "").strip()
    desc = (
        (meta.get("descripcion") or "").strip()
        or (reg.get("item_descripcion") or "").strip()
    )
    und = (
        (meta.get("unidad") or "").strip()
        or (reg.get("unidad") or "").strip()
    )
    cant = cantidad_dashboard(float(reg.get("cantidad_total") or 0))
    vu = float(vu_override if vu_override is not None else 0)
    if not vu:
        try:
            vu = float(meta.get("precio_unitario") or 0)
        except (TypeError, ValueError):
            vu = 0.0
    if not vu:
        try:
            vu = float(reg.get("vlr_unitario") or 0)
        except (TypeError, ValueError):
            vu = 0.0
    costo = costo_agregado_cant_vu(cant, vu)

    num_reg = reg.get("numero_registro")
    if num_reg in (None, ""):
        id_label = str(reg.get("id") or "")
    else:
        id_label = str(num_reg).strip()

    return {
        "id": reg.get("id"),
        "capitulo": cap,
        "item": item,
        "descripcion": desc,
        "und": und,
        "vlr_unitario": vu,
        "cant_total": cant,
        "costo_directo": costo,
        # Columna Excel «Registro» (misma posición que ID_POL).
        "id_pol": id_label,
        "pk_id": _pk_display_from_sicoe(reg),
        "tramo": (reg.get("tramo") or "").strip(),
        "calzada": (reg.get("calzada") or "").strip(),
        "abs_inicio": reg.get("abs_inicio"),
        "abs_final": reg.get("abs_final"),
        # Nodos SICOE: nodo_ini/nodo_fin → campos no_inicio/no_final del Excel ppto.
        "no_inicio": reg.get("nodo_ini"),
        "no_final": reg.get("nodo_fin"),
        # Área/Long/Nodo ← Longitud SICOE
        "area_long_nod": reg.get("longitud"),
        "ancho": reg.get("ancho"),
        "espesor": reg.get("espesor"),
        # Sin tipo de entidad → residual en memorias (sin subtablas A/L/U).
        "tipo_entidad": "",
        "competencia": (reg.get("competencia") or "").strip(),
        "revisado": "Aprobado",
        "pre_interv_estado": None,
        "pre_interv_por": "",
        "validado_por": "",
        "observacion": (reg.get("observacion") or "").strip(),
        "observacion_externa": "",
        "tipo_ejecucion": "Obra Ejecutada",
        "infraestructura": _infra_from_sicoe(reg),
        "_origen_export": ORIGEN_SICOE_OBRA,
    }


def filter_sicoe_regs_by_export_body(
    regs: List[dict],
    body: Any,
    *,
    norm_cap: Callable[[Any], str],
    norm_item: Callable[[Any], str],
) -> List[dict]:
    """Aplica filtros de estructura del body de export (competencia, tramo, ítem, …)."""
    if not regs:
        return []

    def _multi(single, multi) -> Optional[Set[str]]:
        vals: Set[str] = set()
        if multi:
            for v in multi:
                s = str(v or "").strip()
                if s:
                    vals.add(s)
        if single and str(single).strip():
            vals.add(str(single).strip())
        return vals or None

    allow_caps_raw = _multi(getattr(body, "capitulo", None), getattr(body, "capitulos", None))
    allow_items_raw = _multi(getattr(body, "item", None), getattr(body, "items", None))
    allow_caps = {norm_cap(c) for c in allow_caps_raw} if allow_caps_raw else None
    allow_items = {norm_item(i) for i in allow_items_raw} if allow_items_raw else None
    allow_tramos = _multi(getattr(body, "tramo", None), getattr(body, "tramos", None))
    allow_comps = _multi(getattr(body, "competencia", None), getattr(body, "competencias", None))
    allow_unds = _multi(getattr(body, "und", None), getattr(body, "unds", None))

    out: List[dict] = []
    for r in regs:
        ck = norm_cap(r.get("capitulo"))
        ik = norm_item(r.get("item_numero"))
        if allow_caps is not None and ck not in allow_caps:
            continue
        if allow_items is not None and ik not in allow_items:
            continue
        if allow_tramos is not None:
            tr = (r.get("tramo") or "").strip()
            if tr not in allow_tramos:
                continue
        if allow_comps is not None:
            comp = (r.get("competencia") or "").strip()
            if comp not in allow_comps:
                continue
        if allow_unds is not None:
            und = (r.get("unidad") or "").strip()
            if und not in allow_unds:
                continue
        out.append(r)
    return out


def allow_sets_from_export_body(
    body: Any,
    *,
    norm_cap: Callable[[Any], str],
    norm_item: Callable[[Any], str],
) -> Tuple[Optional[Set[str]], Optional[Set[str]]]:
    caps: Set[str] = set()
    items: Set[str] = set()
    for v in getattr(body, "capitulos", None) or []:
        n = norm_cap(v)
        if n:
            caps.add(n)
    c1 = getattr(body, "capitulo", None)
    if c1 and str(c1).strip():
        n = norm_cap(c1)
        if n:
            caps.add(n)
    for v in getattr(body, "items", None) or []:
        n = norm_item(v)
        if n:
            items.add(n)
    i1 = getattr(body, "item", None)
    if i1 and str(i1).strip():
        n = norm_item(i1)
        if n:
            items.add(n)
    return (caps or None, items or None)
