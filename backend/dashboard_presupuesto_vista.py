"""
Agregaciones de presupuesto para el dashboard según vista:
  - presupuesto_obra: versión vigente (total + desglose aprobado / no revisado)
  - obra_ejecutada: intersección cobro N3 ✓ ∩ presupuesto Obra Ejecutada aprobado
"""
from __future__ import annotations

import re
import time
import threading
from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from presupuesto_helpers import _presupuesto_aplica_filtro_interventoria

DASH_VISTA_PRESUPUESTO_OBRA = "presupuesto_obra"
DASH_VISTA_OBRA_EJECUTADA = "obra_ejecutada"

TIPO_OBRA_EJECUTADA = "Obra Ejecutada"
TIPO_PRESUPUESTO_OBRA = "Presupuesto de Obra"

ItemKey = Tuple[str, str]

_SCAN_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_SCAN_CACHE_LOCK = threading.Lock()
_SCAN_CACHE_TTL_SEC = 90

_CAP_INDEX_CACHE: Dict[str, Tuple[float, Dict[str, List[str]]]] = {}
_CAP_INDEX_LOCK = threading.Lock()
_CAP_INDEX_TTL_SEC = 300
_CAP_VARIANTS_CACHE: Dict[str, Tuple[float, List[str]]] = {}
_CAP_VARIANTS_LOCK = threading.Lock()
_CAP_VARIANTS_TTL_SEC = 300


def _scan_cache_key(contrato_id: int, vista: str, current_user) -> str:
    interv = "1" if _presupuesto_aplica_filtro_interventoria(current_user) else "0"
    return f"{int(contrato_id)}|{parse_dash_vista(vista)}|{interv}"


def invalidate_scan_presupuesto_cache(contrato_id: Optional[int] = None) -> None:
    prefix = f"{int(contrato_id)}|" if contrato_id is not None else None
    with _SCAN_CACHE_LOCK:
        if prefix is None:
            _SCAN_CACHE.clear()
        else:
            for k in list(_SCAN_CACHE.keys()):
                if k.startswith(prefix):
                    del _SCAN_CACHE[k]


def parse_dash_vista(vista: Optional[str]) -> str:
    v = (vista or "").strip().lower().replace(" ", "_")
    if v in ("obra_ejecutada", "obra-ejecutada"):
        return DASH_VISTA_OBRA_EJECUTADA
    return DASH_VISTA_PRESUPUESTO_OBRA


def ppto_tipo_for_vista(vista: Optional[str]) -> str:
    """Valor exacto de presupuesto.tipo_ejecucion según toggle del dashboard."""
    if parse_dash_vista(vista) == DASH_VISTA_OBRA_EJECUTADA:
        return TIPO_OBRA_EJECUTADA
    return TIPO_PRESUPUESTO_OBRA


def _norm_tipo_ejecucion_key(tipo: Any) -> str:
    t = (tipo or "").strip().lower().replace("-", "_").replace(" ", "_")
    if t in ("obra_ejecutada", "obraejecutada"):
        return "obra_ejecutada"
    if t in ("presupuesto_obra", "presupuestodeobra", "presupuesto_de_obra"):
        return "presupuesto_obra"
    return t


def ppto_row_matches_vista(row: dict, vista: Optional[str]) -> bool:
    """True si la fila de presupuesto corresponde al toggle activo (sin fallback cruzado)."""
    want = _norm_tipo_ejecucion_key(ppto_tipo_for_vista(vista))
    got = _norm_tipo_ejecucion_key(row.get("tipo_ejecucion"))
    return got == want


def norm_estado_revisado(v: Any) -> str:
    if v is None:
        return "No Revisado"
    s = str(v).strip()
    if not s:
        return "No Revisado"
    sl = s.lower()
    if sl == "aprobado":
        return "Aprobado"
    if sl == "pendiente":
        return "Pendiente"
    if sl == "rechazado":
        return "Rechazado"
    if "no revis" in sl or sl == "no revisado":
        return "No Revisado"
    return s


def norm_item_key(s: Optional[str]) -> str:
    if s is None:
        return ""
    t = str(s).strip()
    if not t:
        return ""
    return re.sub(r"\.+$", "", t)


def norm_capitulo_key(s: Optional[str]) -> str:
    if s is None:
        return "Sin capítulo"
    t = str(s).strip()
    if not t:
        return "Sin capítulo"
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"^(\d+\.)\s+", r"\1", t)
    return t


def norm_capitulo_display(s: Optional[str]) -> str:
    t = (s or "").strip()
    return t if t else "Sin capítulo"


def get_vigente_version_id(sb, contrato_id: int) -> Optional[str]:
    rows = (
        sb.table("presupuesto_versiones")
        .select("id")
        .eq("contrato_id", int(contrato_id))
        .eq("es_vigente", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    return str(rows[0]["id"])


def _capitulo_keys_match(stored: Any, requested: Any) -> bool:
    return norm_capitulo_key(stored) == norm_capitulo_key(requested)


def _cap_index_cache_key(contrato_id: int, source: str) -> str:
    return f"{int(contrato_id)}|{source}"


def _build_capitulo_index(sb, contrato_id: int, source: str) -> Dict[str, List[str]]:
    """Índice norm_key -> [textos crudos en BD] desde presupuesto o so_registros."""
    idx: Dict[str, List[str]] = defaultdict(list)
    off = 0
    while True:
        if source == "sicoe":
            q = (
                sb.table("so_registros")
                .select("capitulo")
                .eq("contrato_id", int(contrato_id))
            )
        else:
            q = (
                sb.table("presupuesto")
                .select("capitulo")
                .eq("contrato_id", int(contrato_id))
                .eq("dado_de_baja", False)
            )
            if source != "all":
                q = q.eq("tipo_ejecucion", source)
        batch = q.range(off, off + 999).execute().data or []
        for r in batch:
            raw = (r.get("capitulo") or "").strip()
            if not raw:
                continue
            nk = norm_capitulo_key(raw)
            if raw not in idx[nk]:
                idx[nk].append(raw)
        if len(batch) < 1000:
            break
        off += 1000
    return dict(idx)


def _get_capitulo_index(sb, contrato_id: int, source: str) -> Dict[str, List[str]]:
    key = _cap_index_cache_key(contrato_id, source)
    now = time.time()
    with _CAP_INDEX_LOCK:
        hit = _CAP_INDEX_CACHE.get(key)
        if hit and now - hit[0] < _CAP_INDEX_TTL_SEC:
            return hit[1]
    idx = _build_capitulo_index(sb, contrato_id, source)
    with _CAP_INDEX_LOCK:
        _CAP_INDEX_CACHE[key] = (now, idx)
    return idx


def resolve_capitulo_db(
    sb,
    contrato_id: int,
    capitulo: str,
    *,
    tipo_ejecucion: Optional[str] = None,
) -> str:
    """Texto de capítulo en BD (eq exacto) a partir del valor UI o clave normalizada."""
    cap_in = (capitulo or "").strip()
    if not cap_in:
        return ""
    tipos = [tipo_ejecucion] if tipo_ejecucion else [TIPO_PRESUPUESTO_OBRA, TIPO_OBRA_EJECUTADA]
    for tipo in tipos:
        hit = (
            sb.table("presupuesto")
            .select("capitulo")
            .eq("contrato_id", int(contrato_id))
            .eq("tipo_ejecucion", tipo)
            .eq("capitulo", cap_in)
            .limit(1)
            .execute()
            .data
            or []
        )
        if hit:
            return cap_in
    target = norm_capitulo_key(cap_in)
    for source in tipos + ["all"]:
        idx = _get_capitulo_index(sb, contrato_id, source)
        for raw in idx.get(target, []):
            if raw == cap_in or norm_capitulo_key(raw) == target:
                return raw
    idx_sicoe = _get_capitulo_index(sb, contrato_id, "sicoe")
    for raw in idx_sicoe.get(target, []):
        if raw == cap_in or norm_capitulo_key(raw) == target:
            return raw
    return cap_in


def capitulo_variants_heuristic(capitulo: str) -> List[str]:
    """Variantes de texto frecuentes (espacio tras «4.») sin escanear tablas."""
    cap_in = (capitulo or "").strip()
    if not cap_in:
        return []
    seen: set = set()
    out: List[str] = []

    def _add(raw: Any) -> None:
        v = (raw or "").strip()
        if v and v not in seen:
            seen.add(v)
            out.append(v)

    _add(cap_in)
    _add(norm_capitulo_key(cap_in))
    m = re.match(r"^(\d+\.)\s*(.+)$", cap_in, re.I)
    if m:
        pref = m.group(1)
        rest = m.group(2).strip()
        _add(f"{pref}{rest}")
        _add(f"{pref} {rest}")
    return out


def resolve_capitulo_variants(
    sb,
    contrato_id: int,
    capitulo: str,
    *,
    tipo_ejecucion: Optional[str] = None,
) -> List[str]:
    """Variantes de texto de capítulo (presupuesto y SICOE) con la misma clave normalizada."""
    cap_in = (capitulo or "").strip()
    if not cap_in:
        return []
    target = norm_capitulo_key(cap_in)
    cache_key = f"{int(contrato_id)}|{target}|{tipo_ejecucion or ''}"
    now = time.time()
    with _CAP_VARIANTS_LOCK:
        hit = _CAP_VARIANTS_CACHE.get(cache_key)
        if hit and now - hit[0] < _CAP_VARIANTS_TTL_SEC:
            return list(hit[1])

    variants: List[str] = []
    seen: set = set()

    def _add(raw: Any) -> None:
        v = (raw or "").strip()
        if v and v not in seen:
            seen.add(v)
            variants.append(v)

    for v in capitulo_variants_heuristic(cap_in):
        _add(v)

    # Solo enriquecer desde índice si ya está en caché (evita scan completo al abrir un capítulo).
    with _CAP_INDEX_LOCK:
        sources: Tuple[str, ...]
        if tipo_ejecucion:
            sources = (tipo_ejecucion,)
        else:
            sources = ("sicoe", "all")
        for source in sources:
            idx_hit = _CAP_INDEX_CACHE.get(_cap_index_cache_key(contrato_id, source))
            if idx_hit and now - idx_hit[0] < _CAP_INDEX_TTL_SEC:
                for raw in idx_hit[1].get(target, []):
                    _add(raw)

    with _CAP_VARIANTS_LOCK:
        _CAP_VARIANTS_CACHE[cache_key] = (now, list(variants))
    return variants


def apply_sicoe_capitulo_filter(q, sb, contrato_id: int, capitulo: str):
    """Filtra so_registros por capítulo (variantes de texto en BD)."""
    variants = resolve_capitulo_variants(sb, contrato_id, capitulo)
    if not variants:
        return q
    if len(variants) == 1:
        return q.eq("capitulo", variants[0])
    return q.in_("capitulo", variants)


def _apply_capitulo_filter(q, sb, contrato_id: int, capitulo: str, *, tipo_ejecucion: Optional[str] = None):
    """Filtra por capítulo usando todas las variantes de texto en BD."""
    variants = resolve_capitulo_variants(sb, contrato_id, capitulo, tipo_ejecucion=tipo_ejecucion)
    if not variants:
        return q
    if len(variants) == 1:
        return q.eq("capitulo", variants[0])
    return q.in_("capitulo", variants)


def _apply_interventoria_filter(q, current_user):
    if _presupuesto_aplica_filtro_interventoria(current_user):
        return q.or_("pre_interv_estado.is.null,pre_interv_estado.eq.Aprobado")
    return q


def _ingest_presupuesto_row(
    r: dict,
    *,
    ppto_ap_c: Dict[str, float],
    ppto_nr_c: Dict[str, float],
    ppto_total_c: Dict[str, float],
    ppto_by_item: Optional[Dict[ItemKey, List[dict]]],
    ppto_keys: Optional[Set[ItemKey]],
) -> None:
    ck = norm_capitulo_key(r.get("capitulo"))
    ik = norm_item_key(r.get("item"))
    if not ik:
        return
    cap_disp = norm_capitulo_display(r.get("capitulo"))
    cost = float(r.get("costo_directo") or 0)
    rev = norm_estado_revisado(r.get("revisado"))
    row = {
        "item": ik,
        "descripcion": r.get("descripcion") or "",
        "capitulo": cap_disp,
        "cant_total": float(r.get("cant_total") or 0),
        "costo_directo": cost,
        "revisado": rev,
        "pk_id": r.get("pk_id"),
    }
    if ppto_by_item is not None:
        ppto_by_item[(ck, ik)].append(row)
    if ppto_keys is not None:
        ppto_keys.add((ck, ik))
    ppto_total_c[cap_disp] += cost
    if rev == "Aprobado":
        ppto_ap_c[cap_disp] += cost
    else:
        ppto_nr_c[cap_disp] += cost


def _scan_live_presupuesto(
    sb,
    contrato_id: int,
    current_user,
    tipo_ejecucion: str,
    *,
    capitulo: Optional[str] = None,
    resumen_only: bool = False,
    track_keys: bool = False,
) -> Dict[str, Any]:
    """Lee tabla presupuesto en vivo (misma fuente que el módulo Presupuesto)."""
    ppto_ap_c: Dict[str, float] = defaultdict(float)
    ppto_nr_c: Dict[str, float] = defaultdict(float)
    ppto_total_c: Dict[str, float] = defaultdict(float)
    ppto_by_item: Optional[Dict[ItemKey, List[dict]]] = None if resumen_only else defaultdict(list)
    ppto_keys: Optional[Set[ItemKey]] = set() if track_keys else None
    cap_db = resolve_capitulo_db(sb, contrato_id, capitulo or "", tipo_ejecucion=tipo_ejecucion) if capitulo else ""
    cols = "capitulo, costo_directo, revisado" if resumen_only else "capitulo, item, descripcion, cant_total, costo_directo, revisado, pk_id"
    off = 0
    while True:
        q = (
            sb.table("presupuesto")
            .select(cols)
            .eq("contrato_id", int(contrato_id))
            .eq("dado_de_baja", False)
            .eq("tipo_ejecucion", tipo_ejecucion)
        )
        q = _apply_interventoria_filter(q, current_user)
        if capitulo:
            q = _apply_capitulo_filter(q, sb, contrato_id, capitulo, tipo_ejecucion=tipo_ejecucion)
        batch = q.range(off, off + 999).execute().data or []
        for r in batch:
            if capitulo and not _capitulo_keys_match(r.get("capitulo"), capitulo):
                continue
            if resumen_only:
                cap_disp = norm_capitulo_display(r.get("capitulo"))
                cost = float(r.get("costo_directo") or 0)
                rev = norm_estado_revisado(r.get("revisado"))
                ppto_total_c[cap_disp] += cost
                if rev == "Aprobado":
                    ppto_ap_c[cap_disp] += cost
                else:
                    ppto_nr_c[cap_disp] += cost
            else:
                _ingest_presupuesto_row(
                    r,
                    ppto_ap_c=ppto_ap_c,
                    ppto_nr_c=ppto_nr_c,
                    ppto_total_c=ppto_total_c,
                    ppto_by_item=ppto_by_item,
                    ppto_keys=ppto_keys,
                )
        if len(batch) < 1000:
            break
        off += 1000

    por_capitulo = [
        {"capitulo": cap, "costo": round(v, 2), "registros": 0}
        for cap, v in sorted(ppto_total_c.items(), key=lambda x: str(x[0]))
    ]
    costo_total = sum(ppto_total_c.values())
    allowed = ppto_keys if track_keys else None
    return {
        "ppto_ap_c": dict(ppto_ap_c),
        "ppto_nr_c": dict(ppto_nr_c),
        "ppto_total_c": dict(ppto_total_c),
        "ppto_by_item": dict(ppto_by_item or {}),
        "allowed_sicoe_keys": allowed,
        "por_capitulo_list": por_capitulo,
        "costo_total": round(costo_total, 2),
    }


def _scan_version_items(sb, contrato_id: int, version_id: str) -> Dict[str, Any]:
    ppto_ap_c: Dict[str, float] = defaultdict(float)
    ppto_nr_c: Dict[str, float] = defaultdict(float)
    ppto_total_c: Dict[str, float] = defaultdict(float)
    ppto_by_item: Dict[ItemKey, List[dict]] = defaultdict(list)
    off = 0
    while True:
        q = (
            sb.table("presupuesto_version_items")
            .select("capitulo, item, descripcion, cant_total, costo_directo, revisado, pk_id")
            .eq("version_id", version_id)
            .eq("contrato_id", int(contrato_id))
            .eq("dado_de_baja", False)
        )
        batch = q.range(off, off + 999).execute().data or []
        for r in batch:
            ck = norm_capitulo_key(r.get("capitulo"))
            ik = norm_item_key(r.get("item"))
            if not ik:
                continue
            cap_disp = norm_capitulo_display(r.get("capitulo"))
            cost = float(r.get("costo_directo") or 0)
            rev = norm_estado_revisado(r.get("revisado"))
            ppto_by_item[(ck, ik)].append(
                {
                    "item": ik,
                    "descripcion": r.get("descripcion") or "",
                    "capitulo": cap_disp,
                    "cant_total": float(r.get("cant_total") or 0),
                    "costo_directo": cost,
                    "revisado": rev,
                    "pk_id": r.get("pk_id"),
                }
            )
            ppto_total_c[cap_disp] += cost
            if rev == "Aprobado":
                ppto_ap_c[cap_disp] += cost
            else:
                ppto_nr_c[cap_disp] += cost
        if len(batch) < 1000:
            break
        off += 1000

    por_capitulo = [
        {"capitulo": cap, "costo": round(v, 2), "registros": 0}
        for cap, v in sorted(ppto_total_c.items(), key=lambda x: str(x[0]))
    ]
    costo_total = sum(ppto_total_c.values())
    return {
        "ppto_ap_c": dict(ppto_ap_c),
        "ppto_nr_c": dict(ppto_nr_c),
        "ppto_total_c": dict(ppto_total_c),
        "ppto_by_item": dict(ppto_by_item),
        "allowed_sicoe_keys": None,
        "por_capitulo_list": por_capitulo,
        "costo_total": round(costo_total, 2),
    }


def _scan_live_obra_ejecutada_light(sb, contrato_id: int, current_user) -> Dict[str, Any]:
    """Agregado por capítulo para resumen dashboard (sin cargar filas ítem a ítem)."""
    return _scan_live_presupuesto(
        sb, contrato_id, current_user, TIPO_OBRA_EJECUTADA, resumen_only=True
    )


def _scan_live_obra_ejecutada(sb, contrato_id: int, current_user) -> Dict[str, Any]:
    return _scan_live_presupuesto(
        sb, contrato_id, current_user, TIPO_OBRA_EJECUTADA, track_keys=True
    )


def _empty_scan() -> Dict[str, Any]:
    return {
        "ppto_ap_c": {},
        "ppto_nr_c": {},
        "ppto_total_c": {},
        "ppto_by_item": {},
        "allowed_sicoe_keys": None,
        "por_capitulo_list": [],
        "costo_total": 0.0,
    }


def _scan_version_items_capitulo(sb, contrato_id: int, version_id: str, capitulo: str) -> Dict[str, Any]:
    cap_raw = (capitulo or "").strip()
    if not cap_raw:
        return _empty_scan()
    ppto_ap_c: Dict[str, float] = defaultdict(float)
    ppto_nr_c: Dict[str, float] = defaultdict(float)
    ppto_total_c: Dict[str, float] = defaultdict(float)
    ppto_by_item: Dict[ItemKey, List[dict]] = defaultdict(list)
    off = 0
    while True:
        q = (
            sb.table("presupuesto_version_items")
            .select("capitulo, item, descripcion, cant_total, costo_directo, revisado, pk_id")
            .eq("version_id", version_id)
            .eq("contrato_id", int(contrato_id))
            .eq("capitulo", cap_raw)
            .eq("dado_de_baja", False)
        )
        batch = q.range(off, off + 999).execute().data or []
        for r in batch:
            ck = norm_capitulo_key(r.get("capitulo"))
            ik = norm_item_key(r.get("item"))
            if not ik:
                continue
            cap_disp = norm_capitulo_display(r.get("capitulo"))
            cost = float(r.get("costo_directo") or 0)
            rev = norm_estado_revisado(r.get("revisado"))
            ppto_by_item[(ck, ik)].append(
                {
                    "item": ik,
                    "descripcion": r.get("descripcion") or "",
                    "capitulo": cap_disp,
                    "cant_total": float(r.get("cant_total") or 0),
                    "costo_directo": cost,
                    "revisado": rev,
                    "pk_id": r.get("pk_id"),
                }
            )
            ppto_total_c[cap_disp] += cost
            if rev == "Aprobado":
                ppto_ap_c[cap_disp] += cost
            else:
                ppto_nr_c[cap_disp] += cost
        if len(batch) < 1000:
            break
        off += 1000
    por_capitulo = [
        {"capitulo": cap, "costo": round(v, 2), "registros": 0}
        for cap, v in sorted(ppto_total_c.items(), key=lambda x: str(x[0]))
    ]
    return {
        "ppto_ap_c": dict(ppto_ap_c),
        "ppto_nr_c": dict(ppto_nr_c),
        "ppto_total_c": dict(ppto_total_c),
        "ppto_by_item": dict(ppto_by_item),
        "allowed_sicoe_keys": None,
        "por_capitulo_list": por_capitulo,
        "costo_total": round(sum(ppto_total_c.values()), 2),
    }


def _scan_obra_ejecutada_capitulo(sb, contrato_id: int, capitulo: str, current_user) -> Dict[str, Any]:
    cap_raw = (capitulo or "").strip()
    if not cap_raw:
        return _empty_scan()
    return _scan_live_presupuesto(
        sb,
        contrato_id,
        current_user,
        TIPO_OBRA_EJECUTADA,
        capitulo=cap_raw,
        track_keys=True,
    )


def scan_presupuesto_capitulo_vista(
    sb, contrato_id: int, capitulo: str, vista: str, current_user
) -> Dict[str, Any]:
    """Solo un capítulo — para drill dashboard / detalle sin leer todo el contrato."""
    cap_raw = (capitulo or "").strip()
    if not cap_raw:
        return _empty_scan()
    if parse_dash_vista(vista) == DASH_VISTA_OBRA_EJECUTADA:
        return _scan_obra_ejecutada_capitulo(sb, contrato_id, cap_raw, current_user)
    return _scan_live_presupuesto(
        sb,
        contrato_id,
        current_user,
        TIPO_PRESUPUESTO_OBRA,
        capitulo=cap_raw,
    )


def scan_presupuesto_vista(sb, contrato_id: int, vista: str, current_user, *, resumen_only: bool = False) -> Dict[str, Any]:
    key = _scan_cache_key(contrato_id, vista, current_user) + ("|resumen" if resumen_only else "")
    now = time.time()
    with _SCAN_CACHE_LOCK:
        cached = _SCAN_CACHE.get(key)
        if cached and now - cached[0] < _SCAN_CACHE_TTL_SEC:
            return cached[1]

    if parse_dash_vista(vista) == DASH_VISTA_OBRA_EJECUTADA:
        result = (
            _scan_live_obra_ejecutada_light(sb, contrato_id, current_user)
            if resumen_only
            else _scan_live_obra_ejecutada(sb, contrato_id, current_user)
        )
    else:
        result = _scan_live_presupuesto(
            sb,
            contrato_id,
            current_user,
            TIPO_PRESUPUESTO_OBRA,
            resumen_only=resumen_only,
        )

    with _SCAN_CACHE_LOCK:
        _SCAN_CACHE[key] = (now, result)
    return result


def ppto_rows_capitulo_vista(sb, contrato_id: int, capitulo: str, vista: str, current_user) -> List[dict]:
    scan = scan_presupuesto_capitulo_vista(sb, contrato_id, capitulo, vista, current_user)
    cap_key = norm_capitulo_key(capitulo)
    rows: List[dict] = []
    for (ck, _ik), item_rows in scan.get("ppto_by_item", {}).items():
        if ck == cap_key:
            rows.extend(item_rows)
    return rows


def _sicoe_item_allowed(key: ItemKey, allowed: Optional[Set[ItemKey]]) -> bool:
    return allowed is None or key in allowed


def filter_sicoe_by_allowed_keys(
    sicoe_by_item: Dict[ItemKey, Dict[str, Any]],
    allowed: Set[ItemKey],
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float], Dict[str, float]]:
    ap_c: Dict[str, float] = defaultdict(float)
    nr_c: Dict[str, float] = defaultdict(float)
    ap_q: Dict[str, float] = defaultdict(float)
    nr_q: Dict[str, float] = defaultdict(float)
    for key, vals in sicoe_by_item.items():
        if key not in allowed:
            continue
        cap = vals.get("cap_display") or key[0]
        ap_c[cap] += float(vals.get("ap_c") or 0)
        nr_c[cap] += float(vals.get("nr_c") or 0)
        ap_q[cap] += float(vals.get("ap_q") or 0)
        nr_q[cap] += float(vals.get("nr_q") or 0)
    return dict(ap_c), dict(nr_c), dict(ap_q), dict(nr_q)


def rebuild_comparativo_capitulos(
    scan: Dict[str, Any],
    sicoe_ap_c: Dict[str, float],
    sicoe_nr_c: Dict[str, float],
    sicoe_ap_q: Optional[Dict[str, float]] = None,
    sicoe_nr_q: Optional[Dict[str, float]] = None,
) -> List[dict]:
    ppto_ap = scan.get("ppto_ap_c") or {}
    ppto_nr = scan.get("ppto_nr_c") or {}
    ppto_tot = scan.get("ppto_total_c") or {}
    ap_m: Dict[str, float] = defaultdict(float)
    nr_m: Dict[str, float] = defaultdict(float)
    tot_m: Dict[str, float] = defaultdict(float)
    disp: Dict[str, str] = {}
    for src, tgt in ((ppto_ap, ap_m), (ppto_nr, nr_m), (ppto_tot, tot_m)):
        for k, v in src.items():
            nk = norm_capitulo_key(k)
            tgt[nk] += float(v or 0)
            disp.setdefault(nk, norm_capitulo_display(k))
    sic_ap_m: Dict[str, float] = defaultdict(float)
    sic_nr_m: Dict[str, float] = defaultdict(float)
    sic_ap_q_m: Dict[str, float] = defaultdict(float)
    sic_nr_q_m: Dict[str, float] = defaultdict(float)
    for k, v in sicoe_ap_c.items():
        sic_ap_m[norm_capitulo_key(k)] += float(v or 0)
    for k, v in sicoe_nr_c.items():
        sic_nr_m[norm_capitulo_key(k)] += float(v or 0)
    for k, v in (sicoe_ap_q or {}).items():
        sic_ap_q_m[norm_capitulo_key(k)] += float(v or 0)
    for k, v in (sicoe_nr_q or {}).items():
        sic_nr_q_m[norm_capitulo_key(k)] += float(v or 0)
    caps = sorted(
        set(list(tot_m.keys()) + list(ap_m.keys()) + list(nr_m.keys()) + list(sic_ap_m.keys()) + list(sic_nr_m.keys())),
        key=lambda x: str(x),
    )
    out = []
    for nk in caps:
        apc = float(sic_ap_m.get(nk, 0))
        nrc = float(sic_nr_m.get(nk, 0))
        pap = float(ap_m.get(nk, 0))
        pnr = float(nr_m.get(nk, 0))
        pt = float(tot_m.get(nk, pap + pnr))
        label = disp.get(nk, nk)
        out.append(
            {
                "capitulo": label,
                "nombre": label,
                "descripcion": "",
                "presupuesto": round(pt, 2),
                "cobrado": round(apc, 2),
                "presupuesto_aprobado_n3": round(pap, 2),
                "presupuesto_no_revisado_n3": round(pnr, 2),
                "sicoe_no_revisado_n3": round(nrc, 2),
                "delta": round(pt - apc, 2),
                "pct": round(apc / pt * 100, 1) if pt else 0,
                "cant_ppto": 0,
                "cant_sicoe_aprobado": round(float(sic_ap_q_m.get(nk, 0)), 3),
                "cant_sicoe_no_revisado": round(float(sic_nr_q_m.get(nk, 0)), 3),
            }
        )
    return out


def drill_items_capitulo_vista(
    scan: Dict[str, Any],
    capitulo: str,
    sicoe_by_item: Dict[ItemKey, Dict[str, Any]],
    allowed_sicoe_keys: Optional[Set[ItemKey]],
) -> List[dict]:
    cap_key = norm_capitulo_key(capitulo)
    ppto_by = scan.get("ppto_by_item") or {}
    keys: Set[ItemKey] = set()
    if allowed_sicoe_keys is not None:
        ppto_keys_cap = {k for k in ppto_by if k[0] == cap_key}
        keys = ppto_keys_cap
        for k in sicoe_by_item:
            if k[0] == cap_key:
                keys.add(k)
    else:
        for k in ppto_by:
            if k[0] == cap_key:
                keys.add(k)
        for k in sicoe_by_item:
            if k[0] == cap_key and _sicoe_item_allowed(k, allowed_sicoe_keys):
                keys.add(k)

    out = []
    for k in sorted(keys, key=lambda x: str(x[1])):
        rows_it = ppto_by.get(k, [])
        p_cost = sum(float(x.get("costo_directo") or 0) for x in rows_it)
        p_cant = sum(float(x.get("cant_total") or 0) for x in rows_it)
        pap = sum(
            float(x.get("costo_directo") or 0)
            for x in rows_it
            if norm_estado_revisado(x.get("revisado")) == "Aprobado"
        )
        pnr = p_cost - pap
        desc = next((str(x["descripcion"]) for x in rows_it if x.get("descripcion")), "")
        sg = sicoe_by_item.get(k, {})
        apc = float(sg.get("ap_c") or 0)
        pp_show = p_cost
        out.append(
            {
                "item": k[1],
                "nombre": k[1],
                "descripcion": desc,
                "presupuesto": round(pp_show, 2),
                "cobrado": round(apc, 2),
                "presupuesto_aprobado_n3": round(pap, 2),
                "presupuesto_no_revisado_n3": round(pnr, 2),
                "sicoe_no_revisado_n3": round(float(sg.get("nr_c") or 0), 2),
                "delta": round(pp_show - apc, 2),
                "pct": round(apc / pp_show * 100, 1) if pp_show else 0,
                "cant_ppto": round(p_cant, 3),
                "cant_sicoe_aprobado": round(float(sg.get("ap_q") or 0), 3),
                "cant_sicoe_no_revisado": round(float(sg.get("nr_q") or 0), 3),
            }
        )
    return out


def liquidacion_items_vista(
    sb,
    contrato_id: int,
    nivel: str,
    current_user,
    vista: str,
    sicoe_approved_fn: Callable[[dict], bool],
    norm_cap_fn: Callable[[Optional[str]], str],
    norm_item_fn: Callable[[Optional[str]], str],
) -> List[Dict[str, Any]]:
    v = parse_dash_vista(vista)
    scan = scan_presupuesto_vista(sb, contrato_id, v, current_user)
    allowed = scan.get("allowed_sicoe_keys")
    ppto_by = scan.get("ppto_by_item") or {}

    sic: Dict[ItemKey, Dict[str, Any]] = {}
    off = 0
    while True:
        batch = (
            sb.table("so_registros")
            .select("capitulo, item_numero, cantidad_total, costo_directo")
            .eq("contrato_id", int(contrato_id))
            .range(off, off + 999)
            .execute()
            .data
            or []
        )
        for r in batch:
            if not sicoe_approved_fn(r):
                continue
            ck_cap = norm_cap_fn(r.get("capitulo"))
            ik = norm_item_fn(r.get("item_numero"))
            if not ik:
                continue
            k = (ck_cap, ik)
            if allowed is not None and k not in allowed:
                continue
            if k not in sic:
                sic[k] = {
                    "cant": 0.0,
                    "cost": 0.0,
                    "cap_raw": (r.get("capitulo") or "").strip() or ck_cap,
                    "item_raw": (r.get("item_numero") or "").strip() or ik,
                }
            sic[k]["cant"] += float(r.get("cantidad_total") or 0)
            sic[k]["cost"] += float(r.get("costo_directo") or 0)
        if len(batch) < 1000:
            break
        off += 1000

    keys_all = (set(ppto_by.keys()) & set(sic.keys())) if v == DASH_VISTA_OBRA_EJECUTADA else set(ppto_by.keys())

    item_rows: List[Dict[str, Any]] = []
    for k in sorted(keys_all, key=lambda x: (x[0], x[1])):
        meta_rows = ppto_by.get(k, [])
        sg = sic.get(k, {"cant": 0.0, "cost": 0.0, "cap_raw": k[0], "item_raw": k[1]})
        cant_cob = float(sg["cant"])
        cob = float(sg["cost"])
        cap_raw = meta_rows[0].get("capitulo") if meta_rows else sg.get("cap_raw") or k[0]
        item_raw = meta_rows[0].get("item") if meta_rows else sg.get("item_raw") or k[1]
        desc = next((str(mr["descripcion"])[:400] for mr in meta_rows if mr.get("descripcion")), "")
        cant_re = sum(float(m.get("cant_total") or 0) for m in meta_rows)
        rec = sum(float(m.get("costo_directo") or 0) for m in meta_rows)
        delta_cant = cant_re - cant_cob
        delta_cost = rec - cob
        pct = 999.0 if cob and rec > cob else (round(cob / rec * 100, 1) if rec else 0.0)
        item_rows.append(
            {
                "capitulo": cap_raw,
                "nombre": item_raw,
                "descripcion": desc,
                "cant_recalc": round(cant_re, 2),
                "recalculado": round(rec, 0),
                "cant_cobro": round(cant_cob, 2),
                "cobrado": round(cob, 0),
                "delta_cant": round(delta_cant, 2),
                "delta_costo": round(delta_cost, 0),
                "pct": pct,
                "categoria": "CALCULO" if meta_rows else "EJECUCION",
                "_ck": k[0],
            }
        )

    if nivel != "capitulo":
        for r in item_rows:
            r.pop("_ck", None)
        return item_rows

    caps: Dict[str, Dict[str, Any]] = {}
    for r in item_rows:
        ck = r["_ck"]
        if ck not in caps:
            caps[ck] = {
                "capitulo": r["capitulo"],
                "nombre": r["capitulo"],
                "cant_recalc": 0.0,
                "recalculado": 0.0,
                "cant_cobro": 0.0,
                "cobrado": 0.0,
            }
        caps[ck]["cant_recalc"] += float(r["cant_recalc"])
        caps[ck]["recalculado"] += float(r["recalculado"])
        caps[ck]["cant_cobro"] += float(r["cant_cobro"])
        caps[ck]["cobrado"] += float(r["cobrado"])

    return [
        {
            "capitulo": c["capitulo"],
            "nombre": c["nombre"],
            "cant_recalc": round(c["cant_recalc"], 2),
            "recalculado": round(c["recalculado"], 0),
            "cant_cobro": round(c["cant_cobro"], 2),
            "cobrado": round(c["cobrado"], 0),
            "delta_cant": round(c["cant_recalc"] - c["cant_cobro"], 2),
            "delta_costo": round(c["recalculado"] - c["cobrado"], 0),
            "pct": round(c["cobrado"] / c["recalculado"] * 100, 1) if c["recalculado"] else 0,
            "categoria": "CALCULO",
        }
        for c in (caps[k] for k in sorted(caps.keys(), key=lambda x: str(x)))
    ]


def ppto_filas_pk_drill(
    sb,
    contrato_id: int,
    capitulo: Optional[str],
    item: Optional[str],
    vista: str,
    current_user,
) -> Tuple[List[dict], Optional[Set[ItemKey]], Dict[str, Any]]:
    """Filas presupuesto (con pk_id) para drill PK según vista."""
    if capitulo and str(capitulo).strip() and item and str(item).strip():
        rows = ppto_rows_item_pk_drill(sb, contrato_id, capitulo, item, vista, current_user)
        allowed: Optional[Set[ItemKey]] = None
        if parse_dash_vista(vista) == DASH_VISTA_OBRA_EJECUTADA:
            ck = norm_capitulo_key(capitulo)
            ik = norm_item_key(item)
            if ik:
                allowed = {(ck, ik)}
        return rows, allowed, _empty_scan()
    if capitulo and str(capitulo).strip():
        scan = scan_presupuesto_capitulo_vista(sb, contrato_id, capitulo, vista, current_user)
    else:
        scan = scan_presupuesto_vista(sb, contrato_id, vista, current_user)
    cap_key = norm_capitulo_key(capitulo) if capitulo else None
    it_key = norm_item_key(item) if item else None
    rows: List[dict] = []
    for (ck, ik), item_rows in (scan.get("ppto_by_item") or {}).items():
        if cap_key and ck != cap_key:
            continue
        if it_key and ik != it_key:
            continue
        for r in item_rows:
            rows.append(
                {
                    "pk_id": r.get("pk_id"),
                    "item": ik,
                    "cant_total": float(r.get("cant_total") or 0),
                    "costo_directo": float(r.get("costo_directo") or 0),
                    "descripcion": r.get("descripcion") or "",
                    "revisado": r.get("revisado"),
                    "capitulo": r.get("capitulo") or "",
                }
            )
    return rows, scan.get("allowed_sicoe_keys"), scan


def _item_variants_heuristic(item: str) -> List[str]:
    it_in = (item or "").strip()
    if not it_in:
        return []
    ik = norm_item_key(it_in)
    seen: set = set()
    out: List[str] = []

    def _add(v: Any) -> None:
        s = (v or "").strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)

    _add(it_in)
    _add(ik)
    if ik:
        _add(f"{ik}.")
    return out


def ppto_rows_item_pk_drill(
    sb,
    contrato_id: int,
    capitulo: str,
    item: str,
    vista: str,
    current_user,
) -> List[dict]:
    """Presupuesto por PK para un ítem (consulta acotada por capítulo + ítem)."""
    cap_raw = (capitulo or "").strip()
    it_key = norm_item_key(item)
    if not cap_raw or not it_key:
        return []
    tipo = (
        TIPO_OBRA_EJECUTADA
        if parse_dash_vista(vista) == DASH_VISTA_OBRA_EJECUTADA
        else TIPO_PRESUPUESTO_OBRA
    )
    item_vars = _item_variants_heuristic(item)
    rows: List[dict] = []
    off = 0
    while True:
        q = (
            sb.table("presupuesto")
            .select("pk_id, item, descripcion, cant_total, costo_directo, revisado, capitulo")
            .eq("contrato_id", int(contrato_id))
            .eq("dado_de_baja", False)
            .eq("tipo_ejecucion", tipo)
        )
        q = _apply_interventoria_filter(q, current_user)
        q = _apply_capitulo_filter(q, sb, contrato_id, cap_raw, tipo_ejecucion=tipo)
        if item_vars:
            if len(item_vars) == 1:
                q = q.eq("item", item_vars[0])
            else:
                q = q.in_("item", item_vars)
        batch = q.range(off, off + 999).execute().data or []
        for r in batch:
            if norm_item_key(r.get("item")) != it_key:
                continue
            rows.append(
                {
                    "pk_id": r.get("pk_id"),
                    "item": it_key,
                    "cant_total": float(r.get("cant_total") or 0),
                    "costo_directo": float(r.get("costo_directo") or 0),
                    "descripcion": r.get("descripcion") or "",
                    "revisado": r.get("revisado"),
                    "capitulo": r.get("capitulo") or "",
                }
            )
        if len(batch) < 1000:
            break
        off += 1000
    return rows


def sicoe_registro_en_vista(reg: dict, allowed: Optional[Set[ItemKey]]) -> bool:
    if allowed is None:
        return True
    ck = norm_capitulo_key(reg.get("capitulo"))
    ik = norm_item_key(reg.get("item_numero"))
    if not ik:
        return False
    return (ck, ik) in allowed
