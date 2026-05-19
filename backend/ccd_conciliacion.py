"""Consultas so_registros para formatos CCD de conciliación interventoría–contratista (semana / acta RPO)."""
from __future__ import annotations

import logging
import math
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger("uvicorn.error")

# Nivel 3 = validación de Interventoría (SICOE obra; última capa del flujo)
# La UI / Excel a veces guarda plural; la normalización de matriz acepta minúsculas
N3_INTERVENTORIA_APROB: Tuple[str, ...] = (
    "Aprobado",
    "Aprobados",
    "aprobado",
    "Aprobado ",
)


def _n3_in_aprob_interventoria() -> List[str]:
    return list(dict.fromkeys(s.strip() for s in N3_INTERVENTORIA_APROB if s.strip()))


def _aplicar_regla_bloqueado_por_acta(
    filas: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Misma lógica que CCD, pero POR acta RPO. Si se mezclan actas en un .in_(), sin esto
    basta con que UNA tenga al menos un bloqueado en el lote para dejar a las otras con costo 0
    aunque tengan aprobado sin bloquear aún.
    En cada acta: si hay ≥1 registro con bloqueado, solo se cuentan bloqueados; si no hay ninguno, todos N3 aprob.
    """
    if not filas:
        return []
    by: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for r in filas:
        aid = r.get("acta_rpo_id")
        if aid is None:
            continue
        try:
            by[int(aid)].append(r)
        except (TypeError, ValueError):
            continue
    out: List[Dict[str, Any]] = []
    for _aid, subs in by.items():
        con_b = [s for s in subs if s.get("bloqueado") is True]
        if con_b:
            out.extend(con_b)
        else:
            out.extend(subs)
    return out


def _aplicar_regla_bloqueado_lote_unico(
    filas: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Misma lógica CCD en un contexto (ej. un solo `semana_id` sin repartir por acta)."""
    if not filas:
        return filas
    con_b = [f for f in filas if f.get("bloqueado") is True]
    if con_b:
        return con_b
    return filas


def _nivel_norm_matriz(v: Any) -> str:
    """Alineado con _matriz_validacion_norm_estado (main) para el dashboard de validación."""
    if v is None:
        return "No Revisado"
    s = str(v).strip()
    if not s:
        return "No Revisado"
    sl = s.lower()
    if sl in ("aprobado", "aprobados"):
        return "Aprobado"
    if sl in ("pendiente", "pendientes"):
        return "Pendiente"
    if sl in ("rechazado", "rechazados"):
        return "Rechazado"
    if "no revis" in sl or sl in ("no revisado", "no_revisado"):
        return "No Revisado"
    return s


def _niveles_activos_contrato_sb(sb, contrato_id: int) -> List[int]:
    """Lee contrato_niveles_validacion; sin fila → [1, 2, 3]."""
    try:
        cid = int(contrato_id)
    except (TypeError, ValueError):
        return [1, 2, 3]
    try:
        res = (
            sb.table("contrato_niveles_validacion")
            .select("niveles_activos")
            .eq("contrato_id", cid)
            .limit(1)
            .execute()
            .data
        )
        if res and res[0] is not None:
            raw = res[0].get("niveles_activos")
            if isinstance(raw, list) and raw:
                out: List[int] = []
                for x in raw:
                    try:
                        n = int(x)
                        if 1 <= n <= 6:
                            out.append(n)
                    except (TypeError, ValueError):
                        continue
                out = sorted(set(out))
                if out:
                    return out
    except Exception as e:
        _log.warning("niveles_activos contrato %s: %s", contrato_id, e)
    return [1, 2, 3]


def _campo_nivel_maximo_matriz(niveles_activos: List[int]) -> str:
    try:
        mx = max(int(x) for x in (niveles_activos or [3]))
    except (TypeError, ValueError):
        mx = 3
    mx = min(6, max(1, mx))
    return f"nivel{mx}_estado"


def _registro_aprobado_matriz_panel(
    reg: Dict[str, Any],
    niveles_activos: List[int],
    campo_nivel_max: str,
) -> bool:
    """
    Misma regla que dashboard_matriz / panel drill: ítem asignado, prerequisitos de niveles
    activos inferiores en «Aprobado» y nivel máximo activo en «Aprobado» (sellado).
    """
    if not (str(reg.get("item_numero") or "").strip()):
        return False
    activos = niveles_activos or [1, 2, 3]
    try:
        max_n = max(int(x) for x in activos)
    except (TypeError, ValueError):
        max_n = 3
    max_n = min(6, max(1, max_n))
    for n in activos:
        try:
            ni = int(n)
        except (TypeError, ValueError):
            continue
        if ni >= max_n:
            continue
        campo = f"nivel{ni}_estado"
        if _nivel_norm_matriz(reg.get(campo)) != "Aprobado":
            return False
    if _nivel_norm_matriz(reg.get(campo_nivel_max)) != "Aprobado":
        return False
    return True


def matriz_params_contrato(sb, contrato_id: int) -> Tuple[str, List[int]]:
    """(campo nivel máximo, niveles activos) para RPC panel actas y fallback Python."""
    niveles = _niveles_activos_contrato_sb(sb, contrato_id)
    return _campo_nivel_maximo_matriz(niveles), niveles


def _bloque_capitulo_matriz(capitulo: Optional[str]) -> str:
    """
    Misma lógica que /sicoe-obra/.../dashboard-matriz-validación:
    Obra (sin AIU en título) vs ensayos/sondeos (14/15, sin IVA en título).
    """
    c = (capitulo or "").strip().upper()
    if c.startswith("14.") or c.startswith("15.") or "ENSAYO" in c or "SONDEO" in c:
        return "ensayos"
    return "obra"


def _orden_titulo_capitulo_obra(nombre: str) -> Tuple[int, int, str]:
    """
    Ordena como en SICOE: número inicial del título (1, 2, 16…). «Sin capítulo» al final.
    """
    c = (nombre or "").strip()
    if not c or c == "Sin capítulo":
        return (9_999_999, 0, c or "Sin capítulo")
    m0 = re.match(r"^\s*(\d+)", c)
    if m0:
        return (0, int(m0.group(1)), c)
    m1 = re.search(r"(\d+)", c)
    if m1:
        return (1, int(m1.group(1)), c)
    return (2, 0, c)


def _sf(n: Any, default: float = 0.0) -> float:
    try:
        x = float(n)
        return x if math.isfinite(x) else default
    except (TypeError, ValueError):
        return default


def fetch_registros_conciliacion(
    sb,
    contrato_id: int,
    *,
    semana_id: Optional[int] = None,
    acta_rpo_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Registros con nivel3 Aprobado; preferiblemente bloqueados. Sin filtro de subcontratista."""
    if semana_id is None and acta_rpo_id is None:
        return []
    n3v = _n3_in_aprob_interventoria()
    sel = (
        "item_numero, item_descripcion, unidad, cantidad_total, vlr_unitario, capitulo, "
        "bloqueado, acta_rpo_id, semana_id"
    )
    cid, sid, aid = contrato_id, semana_id, acta_rpo_id

    def _build_conc():
        q = (
            sb.table("so_registros")
            .select(sel)
            .eq("contrato_id", cid)
            .in_("nivel3_estado", n3v)
        )
        if sid is not None:
            q = q.eq("semana_id", sid)
        if aid is not None:
            q = q.eq("acta_rpo_id", aid)
        return q

    try:
        raw = _leer_paginado(_build_conc)
    except Exception as e2:
        _log.warning("conciliación: lectura N3 aprob. interventoría (%s)", e2)
        return []
    if acta_rpo_id is not None:
        return _aplicar_regla_bloqueado_por_acta(raw)
    if semana_id is not None:
        return _aplicar_regla_bloqueado_lote_unico(raw)
    return raw


def aggregate_items_conciliacion(registros: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], float]:
    """
    Agrega filas SICOE por item_numero. Suma el costo por línea con _linea_costo_registro (alineado
    a lista de actas / matriz) en lugar de (suma cantidades) × (un V.U.), que distorsionaba el total
    con varias líneas por ítem o V.U. distintos.
    """
    items_map: Dict[str, Dict[str, Any]] = {}
    for r in registros or []:
        k = r.get("item_numero") or "SIN_ITEM"
        if k not in items_map:
            items_map[k] = {
                "item_numero": r.get("item_numero", ""),
                "item_descripcion": (r.get("item_descripcion") or "") or "",
                "unidad": (r.get("unidad") or "") or "",
                "cantidad": 0.0,
                "vlr_unitario": 0.0,
                "costo_directo": 0.0,
                "capitulo": "",
            }
        cap = str(r.get("capitulo") or "").strip()
        if cap and not items_map[k].get("capitulo"):
            items_map[k]["capitulo"] = cap
        items_map[k]["cantidad"] += _sf(r.get("cantidad_total"), 0.0)
        vu = _sf(r.get("vlr_unitario"), 0.0)
        if items_map[k]["vlr_unitario"] == 0.0 and vu != 0.0:
            items_map[k]["vlr_unitario"] = vu
        if not (items_map[k].get("item_descripcion") or "").strip() and (r.get("item_descripcion") or "").strip():
            items_map[k]["item_descripcion"] = (r.get("item_descripcion") or "").strip()
        if not (items_map[k].get("unidad") or "").strip() and (r.get("unidad") or "").strip():
            items_map[k]["unidad"] = (r.get("unidad") or "").strip()
        items_map[k]["costo_directo"] = _sf(items_map[k].get("costo_directo"), 0.0) + _linea_costo_registro(r)
    for _k, it in items_map.items():
        cd = _sf(it.get("costo_directo"), 0.0)
        cant = _sf(it.get("cantidad"), 0.0)
        if not math.isfinite(cd):
            cd = 0.0
        it["costo_directo"] = cd
        it["vlr_unitario"] = (cd / cant) if cant > 1e-9 else _sf(it.get("vlr_unitario"), 0.0)
    items = list(items_map.values())
    total = sum(_sf(i.get("costo_directo"), 0.0) for i in items)
    if not math.isfinite(total):
        total = 0.0
    return items, total


def fetch_registros_memoria_conciliacion(
    sb,
    contrato_id: int,
    item_numero: str,
    *,
    semana_id: Optional[int] = None,
    acta_rpo_id: Optional[int] = None,
    item_exacto: bool = False,
) -> List[Dict[str, Any]]:
    """Mismo detalle que memoria CC-SUB-002, con filtro semana o acta RPO."""
    if semana_id is None and acta_rpo_id is None:
        return []
    n3v = _n3_in_aprob_interventoria()
    sel = (
        "numero_registro, abs_inicio, abs_final, pk_id_id, pk_ids(pk_id), calzada, longitud, ancho, espesor, "
        "cantidad, cantidad_total, observacion, foto_url, foto_numero, item_numero, item_descripcion, unidad, "
        "bloqueado, acta_rpo_id, semana_id"
    )

    cid, sid, aid, itn, exact = contrato_id, semana_id, acta_rpo_id, item_numero, item_exacto

    def _build_mem():
        qq = (
            sb.table("so_registros")
            .select(sel)
            .eq("contrato_id", cid)
            .in_("nivel3_estado", n3v)
        )
        if sid is not None:
            qq = qq.eq("semana_id", sid)
        if aid is not None:
            qq = qq.eq("acta_rpo_id", aid)
        if exact:
            qq = qq.eq("item_numero", (itn or "").strip())
        else:
            qq = qq.ilike("item_numero", f"%{itn}%")
        return qq.order("numero_registro")

    try:
        raw = _leer_paginado(_build_mem)
    except Exception as e:
        _log.warning("memoria conc: lectura N3 aprob. interventoría (%s)", e)
        return []
    if acta_rpo_id is not None:
        return _aplicar_regla_bloqueado_por_acta(raw)
    if semana_id is not None:
        return _aplicar_regla_bloqueado_lote_unico(raw)
    return raw


def _linea_costo_registro(r: Dict[str, Any]) -> float:
    """Costo de una fila: costo_directo almacenado, o cantidad×V.U. (alineado con SICOE)."""
    cd = _sf(r.get("costo_directo"), 0.0)
    if abs(cd) > 1e-9:
        return cd
    c = _sf(r.get("cantidad_total"), 0.0) * _sf(r.get("vlr_unitario"), 0.0)
    return c if math.isfinite(c) else 0.0


_PAGE_SICOE = 1000
_MAX_PAGINAS = 5000


def _leer_paginado(
    build_q,
) -> List[Dict[str, Any]]:
    """
    PostgREST/Supabase suelen devolver un máx. de filas por respuesta (~1000).
    Sin esto, un solo .execute() no recorre todos los so_registros.
    `build_q` -> función sin argumentos que devuelve una query nueva (sin .range).
    """
    all_rows: List[Dict[str, Any]] = []
    off = 0
    for _ in range(_MAX_PAGINAS):
        try:
            part = build_q().range(off, off + _PAGE_SICOE - 1).execute().data or []
        except Exception as e:
            _log.warning("so_registros paginada: %s", e)
            break
        if not part:
            break
        all_rows.extend(part)
        if len(part) < _PAGE_SICOE:
            break
        off += _PAGE_SICOE
    return all_rows


def _estados_aprob_sql() -> List[str]:
    """Valores frecuentes de «Aprobado» en n1 / n2 / n3 (matriz SICOE)."""
    return list(
        dict.fromkeys(_n3_in_aprob_interventoria() + ["Aprobado", "Aprobados", "aprobado", "APROBADO"])
    )


def _fetch_cascade_interventoria_actas_rpo(
    sb,
    contrato_id: int,
    acta_rpo_ids: List[int],
    *,
    campo_nivel_max: Optional[str] = None,
    niveles_activos: Optional[List[int]] = None,
) -> List[Dict[str, Any]]:
    """
    Líneas SICOE con ítem y último nivel activo del contrato en «Aprobado» (misma regla que
    dashboard de validación). No filtra por `bloqueado` (formatos CCD).
    """
    if not acta_rpo_ids:
        return []
    if campo_nivel_max is None or niveles_activos is None:
        campo_nivel_max, niveles_activos = matriz_params_contrato(sb, contrato_id)
    out: List[Dict[str, Any]] = []
    chunk = 100
    sel = (
        "acta_rpo_id, capitulo, cantidad_total, vlr_unitario, costo_directo, "
        "nivel1_estado, nivel2_estado, nivel3_estado, nivel4_estado, nivel5_estado, nivel6_estado, "
        "item_numero, item_descripcion, unidad"
    )
    for i in range(0, len(acta_rpo_ids), chunk):
        part = acta_rpo_ids[i : i + chunk]
        raw = _leer_paginado(
            lambda part=part: (
                sb.table("so_registros")
                .select(sel)
                .eq("contrato_id", contrato_id)
                .in_("acta_rpo_id", part)
                .not_.is_("item_numero", "null")
                .neq("item_numero", "")
            )
        )
        for r in raw or []:
            if _registro_aprobado_matriz_panel(r, niveles_activos, campo_nivel_max):
                out.append(r)
    return out


def fetch_registros_informe_cc_mes_por_acta(
    sb, contrato_id: int, acta_rpo_id: int
) -> List[Dict[str, Any]]:
    """
    Totales y filas alineados con el listado de actas / módulo Actas: cascada N1·N2·N3 aprobada,
    sin regla CCD de «solo bloqueados» (es la causa típica de 4M vs 510M).
    """
    if not acta_rpo_id:
        return []
    return _fetch_cascade_interventoria_actas_rpo(sb, int(contrato_id), [int(acta_rpo_id)])


def registro_tiene_pendiente_matriz(r: Dict[str, Any]) -> bool:
    for k in ("nivel1_estado", "nivel2_estado", "nivel3_estado"):
        if _nivel_norm_matriz(r.get(k)) == "Pendiente":
            return True
    return False


def fetch_registros_memoria_cc_mes_alineado_acta(
    sb,
    contrato_id: int,
    item_numero: str,
    *,
    acta_rpo_id: int,
    item_exacto: bool = False,
) -> List[Dict[str, Any]]:
    """
    Misma lógica de aprobación que el informe mensual alineado a actas (cascada N1·N2·N3),
    con el detalle de memoria (fotos, PK, etc.); sin regla CCD de bloqueado.
    """
    if not acta_rpo_id:
        return []
    aprob = _estados_aprob_sql()
    sel = (
        "numero_registro, abs_inicio, abs_final, pk_id_id, pk_ids(pk_id), calzada, longitud, ancho, espesor, "
        "cantidad, cantidad_total, observacion, foto_url, foto_numero, item_numero, item_descripcion, unidad, "
        "nivel1_estado, nivel2_estado, nivel3_estado, bloqueado, acta_rpo_id, semana_id, costo_directo, vlr_unitario, capitulo"
    )
    itn = (item_numero or "").strip()
    exact = item_exacto

    def _build_mem():
        qq = (
            sb.table("so_registros")
            .select(sel)
            .eq("contrato_id", int(contrato_id))
            .eq("acta_rpo_id", int(acta_rpo_id))
            .not_.is_("item_numero", "null")
            .neq("item_numero", "")
            .in_("nivel1_estado", aprob)
            .in_("nivel2_estado", aprob)
            .in_("nivel3_estado", aprob)
        )
        if exact:
            qq = qq.eq("item_numero", itn)
        else:
            qq = qq.ilike("item_numero", f"%{itn}%")
        return qq.order("numero_registro")

    try:
        raw = _leer_paginado(_build_mem)
    except Exception as e:
        _log.warning("memoria CC-MES (cascade): %s", e)
        return []
    out: List[Dict[str, Any]] = []
    for r in raw or []:
        if not (str(r.get("item_numero") or "").strip()):
            continue
        if (
            _nivel_norm_matriz(r.get("nivel1_estado")) != "Aprobado"
            or _nivel_norm_matriz(r.get("nivel2_estado")) != "Aprobado"
            or _nivel_norm_matriz(r.get("nivel3_estado")) != "Aprobado"
        ):
            continue
        out.append(r)
    return out


def suma_por_capitulo_desde_registros(registros: List[Dict[str, Any]]) -> Dict[str, float]:
    by: Dict[str, float] = defaultdict(float)
    for r in registros or []:
        cap = (str(r.get("capitulo") or "").strip()) or "Sin capítulo"
        by[cap] += _linea_costo_registro(r)
    return dict(by)


def suma_por_capitulo_solo_cdirecto_almacenado(registros: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Suma por capítulo con COALESCE(costo_directo,0) por fila (misma regla que la CTE `base` del
    dashboard `dashboard_matriz_validacion_agg` para la fila HABILITADO / inspector).
    """
    by: Dict[str, float] = defaultdict(float)
    for r in registros or []:
        cap = (str(r.get("capitulo") or "").strip()) or "Sin capítulo"
        by[cap] += _sf(r.get("costo_directo"), 0.0)
    return dict(by)


def suma_por_capitulo_solo_n3_aprobado(registros: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Suma por capítulo con rpo_panel / línea: solo filas con ítem y nivel3 = Aprobado
    (informe CC-GER-001 col. «Total Aprobados» / interventoría).
    """
    by: Dict[str, float] = defaultdict(float)
    for r in registros or []:
        if _nivel_norm_matriz(r.get("nivel3_estado")) != "Aprobado":
            continue
        inum = (str(r.get("item_numero") or "")).strip()
        if not inum:
            continue
        cap = (str(r.get("capitulo") or "").strip()) or "Sin capítulo"
        by[cap] += _linea_costo_registro(r)
    return dict(by)


def fetch_registros_acta_todas_sico_obra(
    sb, contrato_id: int, acta_rpo_id: int
) -> List[Dict[str, Any]]:
    """
    Todas las filas so_registros del acta (cualquier estado de matriz N1 N2 N3) con ítem,
    para informe gerencia col. 1 (habilitado) y 4 (pendiente).
    """
    if not acta_rpo_id:
        return []
    sel = (
        "capitulo, costo_directo, cantidad_total, vlr_unitario, item_numero, item_descripcion, unidad, "
        "nivel1_estado, nivel2_estado, nivel3_estado, acta_rpo_id"
    )
    try:
        return _leer_paginado(
            lambda: (
                sb.table("so_registros")
                .select(sel)
                .eq("contrato_id", int(contrato_id))
                .eq("acta_rpo_id", int(acta_rpo_id))
                .not_.is_("item_numero", "null")
                .neq("item_numero", "")
            )
        )
    except Exception as e:
        _log.warning("acta todos niveles: %s", e)
        return []


def _filas_por_capitulo_desde_map(
    by_cap: Dict[str, float], total: float
) -> List[Dict[str, Any]]:
    caps = sorted(
        list(by_cap.items()),
        key=lambda t: _orden_titulo_capitulo_obra(t[0]),
    )
    filas: List[Dict[str, Any]] = []
    for c, v in caps:
        pg = (v / total * 100.0) if total and total > 0 else 0.0
        filas.append(
            {
                "capitulo": c,
                "costo_directo": v,
                "porcentaje": round(pg, 2),
            }
        )
    return filas


def rpo_conciliacion_por_contrato(
    sb,
    contrato_id: int,
    rpo_acta_ids: List[int],
    *,
    campo_nivel_max: Optional[str] = None,
    niveles_activos: Optional[List[int]] = None,
) -> Dict[int, Dict[str, Any]]:
    """
    Alineado con dashboard de validación: último nivel activo aprobado + prerequisitos,
    ítems con item_numero, sin filtro de bloqueado.
    """
    ids_unic: List[int] = []
    for x in rpo_acta_ids or []:
        if x is None:
            continue
        try:
            n = int(x)
        except (TypeError, ValueError):
            continue
        if n not in ids_unic:
            ids_unic.append(n)
    if not ids_unic:
        return {}
    if campo_nivel_max is None or niveles_activos is None:
        campo_nivel_max, niveles_activos = matriz_params_contrato(sb, contrato_id)
    flat = _fetch_cascade_interventoria_actas_rpo(
        sb,
        contrato_id,
        ids_unic,
        campo_nivel_max=campo_nivel_max,
        niveles_activos=niveles_activos,
    )
    by_acta: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for r in flat:
        aid = r.get("acta_rpo_id")
        if aid is None:
            continue
        try:
            by_acta[int(aid)].append(r)
        except (TypeError, ValueError):
            continue
    out: Dict[int, Dict[str, Any]] = {}
    for aid in ids_unic:
        reg_list = by_acta.get(aid) or []
        if not reg_list:
            out[aid] = {
                "costo_directo_total": 0.0,
                "registros_cascade_interventoria": 0,
                "registros_n3_aprobado": 0,
                "por_capitulo": [],
                "secciones": {},
            }
            continue
        by_cap: Dict[str, float] = defaultdict(float)
        by_cap_obra: Dict[str, float] = defaultdict(float)
        by_cap_ens: Dict[str, float] = defaultdict(float)
        for row in reg_list:
            cap = (str(row.get("capitulo") or "").strip()) or "Sin capítulo"
            line = _linea_costo_registro(row)
            by_cap[cap] += line
            if _bloque_capitulo_matriz(cap) == "ensayos":
                by_cap_ens[cap] += line
            else:
                by_cap_obra[cap] += line
        total = sum(by_cap.values())
        if not math.isfinite(total):
            total = 0.0
        sub_obra = sum(by_cap_obra.values())
        sub_ens = sum(by_cap_ens.values())
        if not math.isfinite(sub_obra):
            sub_obra = 0.0
        if not math.isfinite(sub_ens):
            sub_ens = 0.0
        secc: Dict[str, Any] = {}
        if sub_obra > 0:
            secc["obra_ejecutada_directo_sin_aiu"] = {
                "id": "obra",
                "titulo": "Obra ejecutada (directo, bloque obras; sin 14/15/ensayos/sondeos)",
                "subtotal": round(sub_obra, 2),
                "por_capitulo": _filas_por_capitulo_desde_map(dict(by_cap_obra), total),
            }
        if sub_ens > 0:
            secc["ensayos_sondeos_directo_sin_iva"] = {
                "id": "ensayos",
                "titulo": "Ensayos y sondeos (directo, cap. 14/15, ENSAYO, SONDEO)",
                "subtotal": round(sub_ens, 2),
                "por_capitulo": _filas_por_capitulo_desde_map(dict(by_cap_ens), total),
            }
        out[aid] = {
            "costo_directo_total": total,
            "registros_cascade_interventoria": len(reg_list),
            "registros_n3_aprobado": len(reg_list),
            "por_capitulo": _filas_por_capitulo_desde_map(dict(by_cap), total),
            "secciones": secc,
        }
    return out


def _bloqueo_rpo_vacio() -> Dict[str, Any]:
    return {
        "costo_directo_total": 0.0,
        "registros_cascade_interventoria": 0,
        "registros_n3_aprobado": 0,
        "por_capitulo": [],
        "secciones": {},
    }


def rpo_resumen_actas_rpc(
    sb,
    contrato_id: int,
    rpo_acta_ids: List[int],
    *,
    campo_nivel_max: Optional[str] = None,
    niveles_activos: Optional[List[int]] = None,
) -> Optional[Dict[int, Dict[str, Any]]]:
    """
    Suma y conteo por acta vía RPC `rpo_panel_actas_resumen` (SQL en rpo_panel_admin_agg.sql).
    None = RPC no disponible; usar rpo_conciliacion_por_contrato.
    """
    ids: List[int] = []
    for x in rpo_acta_ids or []:
        if x is None:
            continue
        try:
            n = int(x)
        except (TypeError, ValueError):
            continue
        if n not in ids:
            ids.append(n)
    if not ids:
        return {}
    if campo_nivel_max is None or niveles_activos is None:
        campo_nivel_max, niveles_activos = matriz_params_contrato(sb, contrato_id)
    try:
        res = (
            sb.rpc(
                "rpo_panel_actas_resumen",
                {
                    "p_contrato_id": contrato_id,
                    "p_acta_ids": ids,
                    "p_campo_nivel_max": campo_nivel_max,
                    "p_niveles_activos": niveles_activos,
                },
            ).execute()
        )
        rows = res.data or []
    except Exception as e:
        _log.warning("rpo_panel_actas_resumen: %s", e)
        return None
    m: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        aid = int(row["acta_rpo_id"])
        n = int(row.get("n_reg") or 0)
        tot = _sf(row.get("total_cd"), 0.0)
        m[aid] = {
            "costo_directo_total": tot,
            "registros_cascade_interventoria": n,
            "registros_n3_aprobado": n,
            "por_capitulo": [],
            "secciones": {},
        }
    for aid in ids:
        if int(aid) not in m:
            m[int(aid)] = _bloqueo_rpo_vacio()
    return m


def rpo_conciliacion_un_acta_rpc(
    sb,
    contrato_id: int,
    acta_id: int,
    *,
    campo_nivel_max: Optional[str] = None,
    niveles_activos: Optional[List[int]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Desglose (por capítulo + secciones obra/ensayos) vía RPC `rpo_panel_acta_por_capitulo_bloque`.
    None = RPC no disponible; usar rpo_conciliacion_por_contrato.
    """
    if campo_nivel_max is None or niveles_activos is None:
        campo_nivel_max, niveles_activos = matriz_params_contrato(sb, contrato_id)
    try:
        res = (
            sb.rpc(
                "rpo_panel_acta_por_capitulo_bloque",
                {
                    "p_contrato_id": contrato_id,
                    "p_acta_id": int(acta_id),
                    "p_campo_nivel_max": campo_nivel_max,
                    "p_niveles_activos": niveles_activos,
                },
            ).execute()
        )
        rows = res.data or []
    except Exception as e:
        _log.warning("rpo_panel_acta_por_capitulo_bloque: %s", e)
        return None
    if not rows:
        return _bloqueo_rpo_vacio()
    by_cap: Dict[str, float] = defaultdict(float)
    by_cap_obra: Dict[str, float] = defaultdict(float)
    by_cap_ens: Dict[str, float] = defaultdict(float)
    n_reg = 0
    for row in rows:
        cap = str(row.get("capitulo") or "Sin capítulo")
        bl = (str(row.get("bloque") or "obra")).strip().lower()
        v = _sf(row.get("sum_cd"), 0.0)
        n = int(row.get("n_reg") or 0)
        n_reg += n
        by_cap[cap] += v
        if bl == "ensayos":
            by_cap_ens[cap] += v
        else:
            by_cap_obra[cap] += v
    total = sum(by_cap.values())
    if not math.isfinite(total):
        total = 0.0
    sub_obra = sum(by_cap_obra.values())
    sub_ens = sum(by_cap_ens.values())
    if not math.isfinite(sub_obra):
        sub_obra = 0.0
    if not math.isfinite(sub_ens):
        sub_ens = 0.0
    secc: Dict[str, Any] = {}
    if sub_obra > 0:
        secc["obra_ejecutada_directo_sin_aiu"] = {
            "id": "obra",
            "titulo": "Obra ejecutada (directo, bloque obras; sin 14/15/ensayos/sondeos)",
            "subtotal": round(sub_obra, 2),
            "por_capitulo": _filas_por_capitulo_desde_map(dict(by_cap_obra), total),
        }
    if sub_ens > 0:
        secc["ensayos_sondeos_directo_sin_iva"] = {
            "id": "ensayos",
            "titulo": "Ensayos y sondeos (directo, cap. 14/15, ENSAYO, SONDEO)",
            "subtotal": round(sub_ens, 2),
            "por_capitulo": _filas_por_capitulo_desde_map(dict(by_cap_ens), total),
        }
    return {
        "costo_directo_total": total,
        "registros_cascade_interventoria": n_reg,
        "registros_n3_aprobado": n_reg,
        "por_capitulo": _filas_por_capitulo_desde_map(dict(by_cap), total),
        "secciones": secc,
    }


def _mapa_cap_bloque_desde_rpc_rows(rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str], float]:
    m: Dict[Tuple[str, str], float] = {}
    for r in rows or []:
        cap = (str(r.get("capitulo") or "Sin capítulo").strip()) or "Sin capítulo"
        bl = (str(r.get("bloque") or "obra")).strip().lower()
        if bl not in ("ensayos", "obra"):
            bl = "obra"
        m[(cap, bl)] = m.get((cap, bl), 0.0) + _sf(r.get("sum_cd"), 0.0)
    return m


def informe_gerencia_matriz_maps_por_rpc(
    sb,
    contrato_id: int,
    acta_presente_id: int,
    acta_anterior_id: Optional[int],
    acta_ids_acumulado: List[int],
    items_cobro: Optional[set],
) -> Optional[Dict[str, Dict[Tuple[str, str], float]]]:
    """
    Suma c1..c4 por (capítulo, bloque) vía `sql/rpo_informe_gerencia.sql`: c1 habilitado (ítem);
    c2 cascada N1·N2·N3 en acta de referencia; c3 acum. solo con nivel3 Aprobado; c4 pendiente.
    None = RPC no disponible.
    """
    cid, ap = int(contrato_id), int(acta_presente_id)
    _ = items_cobro  # Col. 1 = todo ítem con registro (matriz HABILITADO), sin filtrar por tabla cobro
    acta_ant_i = int(acta_anterior_id) if acta_anterior_id is not None else 0
    ids_c3 = [int(x) for x in (acta_ids_acumulado or []) if x is not None]

    def _run_c1():
        try:
            return (
                sb.rpc(
                    "rpo_ger_suma_por_capitulo_bloque_col1_hab_cobro",
                    {
                        "p_contrato_id": cid,
                        "p_acta_id": ap,
                        "p_items_cobro": None,
                    },
                )
                .execute()
                .data
                or []
            )
        except Exception as e:
            _log.warning("rpo_ger col1: %s", e)
            raise

    def _run_c2():
        if acta_ant_i <= 0:
            return []
        try:
            return (
                sb.rpc(
                    "rpo_ger_suma_por_capitulo_bloque_cascade",
                    {
                        "p_contrato_id": cid,
                        "p_acta_ids": [acta_ant_i],
                    },
                )
                .execute()
                .data
                or []
            )
        except Exception as e2:
            _log.warning("rpo_ger cascade ant: %s", e2)
            raise

    def _run_c3():
        try:
            return (
                sb.rpc(
                    "rpo_ger_suma_por_capitulo_bloque_solo_n3",
                    {"p_contrato_id": cid, "p_acta_ids": ids_c3},
                )
                .execute()
                .data
                or []
            )
        except Exception as e3:
            _log.warning("rpo_ger solo_n3 acum: %s", e3)
            raise

    def _run_c4():
        try:
            return (
                sb.rpc(
                    "rpo_ger_suma_por_capitulo_bloque_pendiente",
                    {"p_contrato_id": cid, "p_acta_id": ap},
                )
                .execute()
                .data
                or []
            )
        except Exception as e4:
            _log.warning("rpo_ger pend: %s", e4)
            raise

    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            f1 = pool.submit(_run_c1)
            f2 = pool.submit(_run_c2)
            f3 = pool.submit(_run_c3)
            f4 = pool.submit(_run_c4)
            c1q = f1.result()
            c2d = f2.result()
            c3d = f3.result()
            c4d = f4.result()
    except Exception:
        return None

    c1m = _mapa_cap_bloque_desde_rpc_rows(c1q)
    c2m = _mapa_cap_bloque_desde_rpc_rows(c2d)
    c3m = _mapa_cap_bloque_desde_rpc_rows(c3d)
    c4m = _mapa_cap_bloque_desde_rpc_rows(c4d)
    return {"c1": c1m, "c2": c2m, "c3": c3m, "c4": c4m}
