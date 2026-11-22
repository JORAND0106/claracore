"""
Subdivisión de PK en subsectores por abscisa (Programación de obra).

- Subdividir es opcional: PK sin subsectores se comporta como hoy.
- Abscisas mandan (múltiplos de 10 m); el polígono se deriva de ellas.
- Suma subsectores + pendiente = total del PK, línea por línea.
- No modifica PK_ID, GeoJSON maestro, presupuesto ni SicoeObra.
"""
from __future__ import annotations

import math
import re
import unicodedata
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from sicoe_eje_franjas import (
    abscisa_a_metros,
    construir_franja_polygon,
    haversine_m,
    proyectar_sobre_eje,
    reconstruir_ejes_desde_plano,
)

# Excepciones: no se reparten; van completas al subsector de mayor solape.
EXCEPCION_LONGITUD_MAX_M = 5.0
EXCEPCION_UNIDADES = frozenset(
    {
        "un",
        "und",
        "u",
        "unidad",
        "unidades",
        "gl",
        "glb",
        "global",
        "gb",
        "vb",
        "viaje",
        "viajes",
    }
)


class SubsectorError(Exception):
    def __init__(self, message: str, *, code: str = "subsector"):
        super().__init__(message)
        self.message = message
        self.code = code


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _d(v: Any) -> Decimal:
    try:
        return Decimal(str(v if v is not None else 0))
    except Exception:
        return Decimal(0)


def _q2(v: Any) -> Decimal:
    return _d(v).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _norm(s: Any) -> str:
    return str(s or "").strip()


def _norm_und(u: Any) -> str:
    s = _norm(u).lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if ch.isalnum() or ch.isspace())
    return s.strip()


def round_abscisa_decena_m(metros: Any) -> Optional[float]:
    """Redondea metros a múltiplo de 10 (sin decimales)."""
    m = abscisa_a_metros(metros) if not isinstance(metros, (int, float)) else float(metros)
    if m is None or not math.isfinite(m):
        return None
    return float(int(round(m / 10.0)) * 10)


def format_abscisa_label(metros: Any, *, prefix: str = "K") -> str:
    """Formato institucional K3+000 (múltiplo de 10)."""
    m = round_abscisa_decena_m(metros)
    if m is None:
        return ""
    m_i = int(m)
    if m_i < 0:
        m_i = 0
    km = m_i // 1000
    rem = m_i % 1000
    return f"{prefix}{km}+{rem:03d}"


def parse_abscisa_label(label: Any) -> Optional[float]:
    """Acepta K3+000, 3+000, 3000."""
    if label is None or label == "":
        return None
    if isinstance(label, (int, float)):
        return round_abscisa_decena_m(label)
    s = _norm(label).upper().replace(" ", "")
    s = re.sub(r"^K", "", s)
    return round_abscisa_decena_m(s)


def label_rango_subsector(abs_ini_m: Any, abs_fin_m: Any) -> str:
    a = format_abscisa_label(abs_ini_m)
    b = format_abscisa_label(abs_fin_m)
    if not a or not b:
        return ""
    return f"{a}–{b}"


def display_label_subsector(pk_id: str, abs_ini_m: Any, abs_fin_m: Any) -> str:
    pk = _norm(pk_id)
    rango = label_rango_subsector(abs_ini_m, abs_fin_m)
    if not rango:
        return pk
    return f"{pk} · {rango}"


def linea_tiene_abscisado(row: dict) -> bool:
    a = abscisa_a_metros(row.get("abs_inicio"))
    b = abscisa_a_metros(row.get("abs_final"))
    return a is not None and b is not None


def lineas_sin_abscisado(rows: Sequence[dict]) -> List[dict]:
    out = []
    for r in rows:
        if not linea_tiene_abscisado(r):
            out.append(
                {
                    "capitulo": _norm(r.get("capitulo")),
                    "item": _norm(r.get("item")),
                    "descripcion": _norm(r.get("descripcion"))[:120],
                    "und": _norm(r.get("und")),
                }
            )
    return out


def _longitud_linea_m(row: dict) -> Optional[float]:
    a = abscisa_a_metros(row.get("abs_inicio"))
    b = abscisa_a_metros(row.get("abs_final"))
    if a is None or b is None:
        return None
    return abs(float(b) - float(a))


def es_excepcion_reparto(row: dict) -> bool:
    """Líneas < 5 m o unidad un/global: nunca se reparten."""
    und = _norm_und(row.get("und") or row.get("unidad"))
    if und in EXCEPCION_UNIDADES:
        return True
    L = _longitud_linea_m(row)
    if L is not None and L < EXCEPCION_LONGITUD_MAX_M:
        return True
    return False


def _overlap_m(a0: float, a1: float, b0: float, b1: float) -> float:
    lo = max(min(a0, a1), min(b0, b1))
    hi = min(max(a0, a1), max(b0, b1))
    return max(0.0, hi - lo)


def _linea_rango(row: dict) -> Tuple[float, float]:
    a = float(abscisa_a_metros(row.get("abs_inicio")))
    b = float(abscisa_a_metros(row.get("abs_final")))
    return (min(a, b), max(a, b))


def _fully_inside(line_lo: float, line_hi: float, sub_lo: float, sub_hi: float, eps: float = 1e-6) -> bool:
    return line_lo >= sub_lo - eps and line_hi <= sub_hi + eps


def _crosses(line_lo: float, line_hi: float, sub_lo: float, sub_hi: float, eps: float = 1e-6) -> bool:
    ov = _overlap_m(line_lo, line_hi, sub_lo, sub_hi)
    if ov <= eps:
        return False
    if _fully_inside(line_lo, line_hi, sub_lo, sub_hi, eps):
        return False
    # Cruza si la línea se sale del subsector en algún extremo
    return line_lo < sub_lo - eps or line_hi > sub_hi + eps


def validar_rango_dentro_pk(
    abs_ini_m: float,
    abs_fin_m: float,
    pk_abs_ini: Optional[float],
    pk_abs_fin: Optional[float],
) -> None:
    if abs_fin_m <= abs_ini_m:
        raise SubsectorError("La abscisa final debe ser mayor que la inicial.")
    if abs_ini_m % 10 != 0 or abs_fin_m % 10 != 0:
        raise SubsectorError("Las abscisas deben ser múltiplos de 10 m.")
    if pk_abs_ini is not None and pk_abs_fin is not None:
        lo, hi = min(pk_abs_ini, pk_abs_fin), max(pk_abs_ini, pk_abs_fin)
        if abs_ini_m < lo - 1e-6 or abs_fin_m > hi + 1e-6:
            raise SubsectorError(
                f"El subsector debe quedar dentro del PK ({format_abscisa_label(lo)}–{format_abscisa_label(hi)})."
            )


def validar_sin_solape(
    abs_ini_m: float,
    abs_fin_m: float,
    existentes: Sequence[dict],
    *,
    exclude_id: Optional[str] = None,
) -> None:
    for s in existentes:
        sid = str(s.get("id") or "")
        if exclude_id and sid == str(exclude_id):
            continue
        a0 = float(s.get("abs_inicio_m"))
        a1 = float(s.get("abs_final_m"))
        if _overlap_m(abs_ini_m, abs_fin_m, a0, a1) > 1e-6:
            raise SubsectorError(
                f"Solapa con subsector {s.get('abs_inicio_label') or format_abscisa_label(a0)}"
                f"–{s.get('abs_final_label') or format_abscisa_label(a1)}."
            )


def _linea_key(row: dict) -> str:
    origen = row.get("presupuesto_item_id_origen")
    if origen is not None and str(origen).strip() != "":
        try:
            return f"ppto:{int(origen)}"
        except (TypeError, ValueError):
            pass
    rid = row.get("id")
    if rid is not None and str(rid).strip() != "":
        try:
            return f"snap:{int(rid)}"
        except (TypeError, ValueError):
            pass
    parts = [
        _norm(row.get("pk_id")),
        _norm(row.get("capitulo")),
        _norm(row.get("item")),
        _norm(row.get("abs_inicio")),
        _norm(row.get("abs_final")),
        _norm(row.get("cant_total")),
    ]
    return "hash:" + "|".join(parts)


def clasificar_lineas_para_subsector(
    lineas: Sequence[dict],
    abs_ini_m: float,
    abs_fin_m: float,
) -> Dict[str, List[dict]]:
    """
    Clasifica líneas respecto al rango del subsector.
    Retorna { completas, cruzan, excepciones, fuera }.
    """
    completas: List[dict] = []
    cruzan: List[dict] = []
    excepciones: List[dict] = []
    fuera: List[dict] = []
    for r in lineas:
        if not linea_tiene_abscisado(r):
            continue
        lo, hi = _linea_rango(r)
        ov = _overlap_m(lo, hi, abs_ini_m, abs_fin_m)
        if ov <= 1e-6:
            fuera.append(r)
            continue
        if es_excepcion_reparto(r):
            excepciones.append(r)
            continue
        if _fully_inside(lo, hi, abs_ini_m, abs_fin_m):
            completas.append(r)
        elif _crosses(lo, hi, abs_ini_m, abs_fin_m):
            cruzan.append(r)
        else:
            # Solape parcial sin «cruzar» extremos (línea más corta dentro) → completa
            completas.append(r)
    return {
        "completas": completas,
        "cruzan": cruzan,
        "excepciones": excepciones,
        "fuera": fuera,
    }


def cantidad_automatica(
    row: dict,
    abs_ini_m: float,
    abs_fin_m: float,
) -> Decimal:
    """Proporción por longitud de línea dentro del subsector."""
    total = _d(row.get("cant_total") or row.get("cantidad") or 0)
    lo, hi = _linea_rango(row)
    L = hi - lo
    if L <= 1e-9:
        return _q2(total)
    ov = _overlap_m(lo, hi, abs_ini_m, abs_fin_m)
    return _q2(total * Decimal(str(ov / L)))


def asignar_excepcion_a_subsector(
    row: dict,
    abs_ini_m: float,
    abs_fin_m: float,
    *,
    dibujando: bool = True,
) -> bool:
    """
    Excepción va al subsector donde queda la mayor parte.
    Empate → al subsector que se está dibujando.
    """
    lo, hi = _linea_rango(row)
    L = max(hi - lo, 1e-9)
    ov = _overlap_m(lo, hi, abs_ini_m, abs_fin_m)
    fuera = L - ov
    if ov > fuera + 1e-6:
        return True
    if fuera > ov + 1e-6:
        return False
    return bool(dibujando)


def calcular_cantidades_subsector(
    lineas: Sequence[dict],
    abs_ini_m: float,
    abs_fin_m: float,
    *,
    modo: str = "automatico",
    manual: Optional[Dict[str, float]] = None,
    dibujando: bool = True,
) -> Tuple[List[dict], List[dict]]:
    """
    Calcula filas de cantidad para el subsector.
    Retorna (asignaciones, cruzan_pendientes_decision).
    manual: mapa linea_key → cantidad (modo manual).
    """
    modo_n = (modo or "automatico").strip().lower()
    if modo_n not in ("manual", "automatico", "mixto"):
        modo_n = "automatico"
    manual = manual or {}
    clases = clasificar_lineas_para_subsector(lineas, abs_ini_m, abs_fin_m)
    asignaciones: List[dict] = []
    cruzan_decision: List[dict] = []

    for r in clases["completas"]:
        total = _q2(r.get("cant_total") or r.get("cantidad") or 0)
        asignaciones.append(
            {
                "linea_key": _linea_key(r),
                "capitulo": _norm(r.get("capitulo")),
                "item": _norm(r.get("item")),
                "descripcion": _norm(r.get("descripcion")),
                "und": _norm(r.get("und")),
                "cantidad": float(total),
                "cantidad_total_linea": float(total),
                "modo": "completa",
            }
        )

    for r in clases["excepciones"]:
        if not asignar_excepcion_a_subsector(r, abs_ini_m, abs_fin_m, dibujando=dibujando):
            continue
        total = _q2(r.get("cant_total") or r.get("cantidad") or 0)
        asignaciones.append(
            {
                "linea_key": _linea_key(r),
                "capitulo": _norm(r.get("capitulo")),
                "item": _norm(r.get("item")),
                "descripcion": _norm(r.get("descripcion")),
                "und": _norm(r.get("und")),
                "cantidad": float(total),
                "cantidad_total_linea": float(total),
                "modo": "excepcion",
            }
        )

    for r in clases["cruzan"]:
        key = _linea_key(r)
        total = _q2(r.get("cant_total") or r.get("cantidad") or 0)
        lo, hi = _linea_rango(r)
        ov = _overlap_m(lo, hi, abs_ini_m, abs_fin_m)
        info = {
            "linea_key": key,
            "capitulo": _norm(r.get("capitulo")),
            "item": _norm(r.get("item")),
            "descripcion": _norm(r.get("descripcion")),
            "und": _norm(r.get("und")),
            "cantidad_total_linea": float(total),
            "abs_inicio": r.get("abs_inicio"),
            "abs_final": r.get("abs_final"),
            "longitud_m": round(hi - lo, 2),
            "solape_m": round(ov, 2),
            "cantidad_sugerida": float(cantidad_automatica(r, abs_ini_m, abs_fin_m)),
        }
        if modo_n == "automatico" or (modo_n == "mixto" and key not in manual):
            cant = cantidad_automatica(r, abs_ini_m, abs_fin_m)
            if cant > total:
                cant = total
            asignaciones.append(
                {
                    **{k: info[k] for k in ("linea_key", "capitulo", "item", "descripcion", "und")},
                    "cantidad": float(cant),
                    "cantidad_total_linea": float(total),
                    "modo": "automatico",
                }
            )
        elif modo_n == "manual" or key in manual:
            raw = manual.get(key)
            if raw is None:
                cruzan_decision.append(info)
                continue
            cant = _q2(raw)
            if cant < 0:
                raise SubsectorError(f"Cantidad negativa en {_norm(r.get('item'))}.")
            if cant > total:
                raise SubsectorError(
                    f"Cantidad de {_norm(r.get('item'))} supera el total disponible ({float(total)})."
                )
            asignaciones.append(
                {
                    **{k: info[k] for k in ("linea_key", "capitulo", "item", "descripcion", "und")},
                    "cantidad": float(cant),
                    "cantidad_total_linea": float(total),
                    "modo": "manual",
                }
            )
        else:
            cruzan_decision.append(info)

    return asignaciones, cruzan_decision


def validar_cobertura_cantidades(
    lineas_ppto: Sequence[dict],
    asignaciones_por_subsector: Sequence[Sequence[dict]],
) -> List[dict]:
    """
    Control obligatorio: suma subsectores ≤ total; reporta líneas que no cuadran
    cuando se pide cobertura completa (pendiente calculable).
    Retorna lista de inconsistencias {capitulo,item,total,suma,pendiente,mensaje}.
    """
    totales: Dict[Tuple[str, str, str], Decimal] = {}
    for r in lineas_ppto:
        if not linea_tiene_abscisado(r):
            continue
        key = (_norm(r.get("capitulo")), _norm(r.get("item")), _linea_key(r))
        totales[key] = totales.get(key, Decimal(0)) + _q2(r.get("cant_total") or 0)

    sumas: Dict[Tuple[str, str, str], Decimal] = {k: Decimal(0) for k in totales}
    for asigns in asignaciones_por_subsector:
        for a in asigns:
            key = (_norm(a.get("capitulo")), _norm(a.get("item")), _norm(a.get("linea_key")))
            if key not in sumas:
                # línea agregada por key capitulo+item si no hay linea_key match
                alt = [
                    k
                    for k in totales
                    if k[0] == key[0] and k[1] == key[1] and (not key[2] or k[2] == key[2])
                ]
                if len(alt) == 1:
                    key = alt[0]
                else:
                    continue
            sumas[key] = sumas.get(key, Decimal(0)) + _q2(a.get("cantidad"))

    errores = []
    for key, total in totales.items():
        s = _q2(sumas.get(key, 0))
        if s > total + Decimal("0.001"):
            errores.append(
                {
                    "capitulo": key[0],
                    "item": key[1],
                    "linea_key": key[2],
                    "total": float(total),
                    "suma": float(s),
                    "pendiente": float(_q2(total - s)),
                    "mensaje": f"{key[0]}/{key[1]}: suma subsectores ({float(s)}) supera total ({float(total)}).",
                }
            )
    return errores


def absorber_redondeo_ultimo_subsector(
    lineas_ppto: Sequence[dict],
    asignaciones_por_subsector: List[List[dict]],
) -> List[List[dict]]:
    """
    El último subsector absorbe la diferencia de redondeo para que
    suma(subsectores) + pendiente_restante sea exacta al total.
    Aquí ajusta solo entre subsectores ya asignados: si la suma de asignaciones
    de una línea (completa en todos) no cuadra con el total y no queda pendiente
    espacial, el último subsector recibe el delta.
    """
    if not asignaciones_por_subsector:
        return asignaciones_por_subsector

    # Agrupar por linea_key
    by_key: Dict[str, Dict[str, Any]] = {}
    for r in lineas_ppto:
        if not linea_tiene_abscisado(r):
            continue
        k = _linea_key(r)
        by_key[k] = {
            "total": _q2(r.get("cant_total") or 0),
            "capitulo": _norm(r.get("capitulo")),
            "item": _norm(r.get("item")),
        }

    for k, meta in by_key.items():
        idxs = []
        suma = Decimal(0)
        for si, asigns in enumerate(asignaciones_por_subsector):
            for ai, a in enumerate(asigns):
                if _norm(a.get("linea_key")) == k:
                    idxs.append((si, ai))
                    suma += _q2(a.get("cantidad"))
        if not idxs:
            continue
        # Solo absorber si la línea quedó totalmente cubierta por subsectores
        # (sin pendiente espacial). Eso se detecta cuando suma ≈ total o
        # el llamador marcó cobertura completa; aquí ajustamos delta pequeño.
        delta = _q2(meta["total"] - suma)
        if abs(delta) < Decimal("0.005"):
            continue
        if abs(delta) > Decimal("1.00"):
            # Diferencia grande → pendiente real, no redondeo
            continue
        si, ai = idxs[-1]
        nueva = _q2(_d(asignaciones_por_subsector[si][ai]["cantidad"]) + delta)
        if nueva < 0:
            continue
        asignaciones_por_subsector[si][ai] = {
            **asignaciones_por_subsector[si][ai],
            "cantidad": float(nueva),
        }
    return asignaciones_por_subsector


def pendiente_por_linea(
    lineas_ppto: Sequence[dict],
    asignaciones_por_subsector: Sequence[Sequence[dict]],
) -> List[dict]:
    """Cantidad pendiente (no cubierta por ningún subsector) por línea."""
    totales: Dict[str, dict] = {}
    for r in lineas_ppto:
        if not linea_tiene_abscisado(r):
            continue
        k = _linea_key(r)
        totales[k] = {
            "linea_key": k,
            "capitulo": _norm(r.get("capitulo")),
            "item": _norm(r.get("item")),
            "descripcion": _norm(r.get("descripcion")),
            "und": _norm(r.get("und")),
            "total": _q2(r.get("cant_total") or 0),
            "asignado": Decimal(0),
        }
    for asigns in asignaciones_por_subsector:
        for a in asigns:
            k = _norm(a.get("linea_key"))
            if k in totales:
                totales[k]["asignado"] += _q2(a.get("cantidad"))
    out = []
    for meta in totales.values():
        pend = _q2(meta["total"] - meta["asignado"])
        if pend < 0:
            pend = Decimal(0)
        out.append(
            {
                "linea_key": meta["linea_key"],
                "capitulo": meta["capitulo"],
                "item": meta["item"],
                "descripcion": meta["descripcion"],
                "und": meta["und"],
                "cantidad_total": float(meta["total"]),
                "cantidad_asignada": float(_q2(meta["asignado"])),
                "cantidad_pendiente": float(pend),
            }
        )
    return out


def _ring_from_geom(geom: Optional[dict]) -> Optional[List[List[float]]]:
    if not geom or not isinstance(geom, dict):
        return None
    t = geom.get("type")
    coords = geom.get("coordinates")
    if t == "Polygon" and coords and coords[0]:
        return [[float(c[0]), float(c[1])] for c in coords[0] if len(c) >= 2]
    if t == "MultiPolygon" and coords and coords[0] and coords[0][0]:
        return [[float(c[0]), float(c[1])] for c in coords[0][0] if len(c) >= 2]
    return None


def _max_dist_to_eje(ring: List[List[float]], eje: dict) -> float:
    ejes = [eje]
    mx = 0.0
    for lng, lat in ring:
        p = proyectar_sobre_eje(ejes, lng, lat, max_dist_m=500)
        if p and p.get("dist_m") is not None:
            mx = max(mx, float(p["dist_m"]))
    return mx


def clip_pk_polygon_entre_abscisas(
    pk_geom: dict,
    plano_fc: Optional[dict],
    abs_ini_m: float,
    abs_fin_m: float,
) -> Optional[dict]:
    """
    Recorta el polígono del PK entre abscisas siguiendo el eje (también en curvas).
    Estrategia: franja ancha entre estaciones ∩ aproximación por muestreo del anillo
    del PK proyectado (filtra vértices fuera de rango y cierra con transversales).
    """
    ring = _ring_from_geom(pk_geom if pk_geom.get("type") in ("Polygon", "MultiPolygon") else pk_geom.get("geometry"))
    if not ring or len(ring) < 4:
        # Si viene Feature
        if pk_geom.get("type") == "Feature":
            ring = _ring_from_geom(pk_geom.get("geometry"))
        if not ring or len(ring) < 4:
            return None

    ejes = reconstruir_ejes_desde_plano(plano_fc) if plano_fc else []
    if not ejes:
        # Sin eje: bbox transversal no disponible → devolver franja nula y
        # dejar que el cliente envíe geojson; backend acepta geojson del preview.
        return None

    # Elegir eje con más proyecciones exitosas del anillo
    best_eje = ejes[0]
    best_hits = -1
    for e in ejes:
        hits = 0
        for lng, lat in ring[:-1]:
            p = proyectar_sobre_eje([e], lng, lat, max_dist_m=200)
            if p and p.get("sobre_eje"):
                hits += 1
        if hits > best_hits:
            best_hits = hits
            best_eje = e

    half = max(8.0, _max_dist_to_eje(ring, best_eje) + 4.0)
    franja = construir_franja_polygon(
        eje=best_eje,
        abs_inicio=float(abs_ini_m),
        abs_final=float(abs_fin_m),
        ancho=half * 2,
        lado="central",
        step_m=5.0,
    )
    if not franja:
        return None

    # Intersección aproximada: conservar vértices del PK cuya proyección cae
    # en [abs_ini, abs_fin] y añadir puntos de corte en los bordes.
    kept: List[List[float]] = []
    n = len(ring)
    # quitar cierre duplicado
    pts = ring[:-1] if (
        len(ring) > 1 and ring[0][0] == ring[-1][0] and ring[0][1] == ring[-1][1]
    ) else ring

    def _proy(lng, lat):
        return proyectar_sobre_eje([best_eje], lng, lat, max_dist_m=250)

    def _inside(proy) -> bool:
        if not proy or not proy.get("sobre_eje"):
            return False
        m = float(proy["abs_m"])
        return abs_ini_m - 1e-6 <= m <= abs_fin_m + 1e-6

    def _cut(a, b, target_m: float) -> Optional[List[float]]:
        pa, pb = _proy(a[0], a[1]), _proy(b[0], b[1])
        if not pa or not pb:
            return None
        ma, mb = float(pa["abs_m"]), float(pb["abs_m"])
        if abs(mb - ma) < 1e-9:
            return None
        if (ma - target_m) * (mb - target_m) > 0:
            return None
        t = (target_m - ma) / (mb - ma)
        if t < -0.05 or t > 1.05:
            return None
        t = max(0.0, min(1.0, t))
        return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]

    for i, p in enumerate(pts):
        nxt = pts[(i + 1) % len(pts)]
        proy = _proy(p[0], p[1])
        inn = _inside(proy)
        if inn:
            kept.append([p[0], p[1]])
        proy_n = _proy(nxt[0], nxt[1])
        inn_n = _inside(proy_n)
        if inn != inn_n:
            # Cortar en ambos límites posibles
            for tm in (abs_ini_m, abs_fin_m):
                c = _cut(p, nxt, tm)
                if c:
                    kept.append(c)

    if len(kept) < 3:
        # Fallback: usar la franja misma (cubre el tramo del eje)
        return franja

    # Ordenar approx por ángulo alrededor del centroide
    cx = sum(p[0] for p in kept) / len(kept)
    cy = sum(p[1] for p in kept) / len(kept)
    kept.sort(key=lambda p: math.atan2(p[1] - cy, p[0] - cx))
    # dedup
    dedup: List[List[float]] = []
    for p in kept:
        if not dedup or haversine_m(
            {"lng": dedup[-1][0], "lat": dedup[-1][1]},
            {"lng": p[0], "lat": p[1]},
        ) > 0.4:
            dedup.append(p)
    if len(dedup) < 3:
        return franja
    if dedup[0] != dedup[-1]:
        dedup.append(dedup[0])
    return {"type": "Polygon", "coordinates": [dedup]}


def fetch_pk_abs_range(sb, contrato_id: int, pk_id: str) -> Tuple[Optional[float], Optional[float]]:
    rows = (
        sb.table("pk_ids")
        .select("abs_inicio,abs_final")
        .eq("contrato_id", int(contrato_id))
        .eq("pk_id", _norm(pk_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None, None
    a = abscisa_a_metros(rows[0].get("abs_inicio"))
    b = abscisa_a_metros(rows[0].get("abs_final"))
    if a is None or b is None:
        return a, b
    return float(min(a, b)), float(max(a, b))


def list_subsectores(sb, version_id: str, pk_id: str) -> List[dict]:
    rows = (
        sb.table("prog_pk_subsectores")
        .select("*")
        .eq("version_id", version_id)
        .eq("pk_id", _norm(pk_id))
        .order("orden")
        .execute()
        .data
        or []
    )
    return rows


def list_subsectores_version(sb, version_id: str) -> List[dict]:
    return (
        sb.table("prog_pk_subsectores")
        .select("*")
        .eq("version_id", version_id)
        .order("pk_id")
        .order("orden")
        .execute()
        .data
        or []
    )


def fetch_subsector_lineas(sb, subsector_id: str) -> List[dict]:
    return (
        sb.table("prog_pk_subsector_lineas")
        .select("*")
        .eq("subsector_id", subsector_id)
        .execute()
        .data
        or []
    )


def fetch_subsector_lineas_pk(sb, version_id: str, pk_id: str) -> List[dict]:
    return (
        sb.table("prog_pk_subsector_lineas")
        .select("*")
        .eq("version_id", version_id)
        .eq("pk_id", _norm(pk_id))
        .execute()
        .data
        or []
    )


def _tables_ok(sb) -> bool:
    try:
        sb.table("prog_pk_subsectores").select("id").limit(1).execute()
        return True
    except Exception:
        return False


def cobertura_completa_programada(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    lineas_ppto: Sequence[dict],
) -> bool:
    """
    True si no hay pendiente de cantidad y todas las cantidades de subsectores
    (o del PK completo) tienen fecha programada.
    """
    pk = _norm(pk_id)
    subs = list_subsectores(sb, version_id, pk) if _tables_ok(sb) else []
    if not subs:
        # Comportamiento actual: prog_pk_estado
        return False  # caller usa estado existente

    lineas = fetch_subsector_lineas_pk(sb, version_id, pk)
    by_sub: Dict[str, List[dict]] = {}
    for L in lineas:
        by_sub.setdefault(str(L["subsector_id"]), []).append(
            {
                "linea_key": L.get("presupuesto_linea_key") or "",
                "capitulo": L.get("capitulo"),
                "item": L.get("item"),
                "cantidad": L.get("cantidad"),
            }
        )
    pend = pendiente_por_linea(lineas_ppto, [by_sub.get(str(s["id"]), []) for s in subs])
    if any(_d(p["cantidad_pendiente"]) > Decimal("0.009") for p in pend):
        return False

    # Todas las actividades de subsectores con cantidad > 0 deben tener fecha
    acts = (
        sb.table("prog_actividades")
        .select("id,subsector_id,fecha_inicio,cantidad_programada")
        .eq("version_id", version_id)
        .eq("pk_id", pk)
        .not_.is_("subsector_id", "null")
        .execute()
        .data
        or []
    )
    if not acts:
        return False
    for a in acts:
        if _d(a.get("cantidad_programada")) > 0 and not a.get("fecha_inicio"):
            return False
    return True
