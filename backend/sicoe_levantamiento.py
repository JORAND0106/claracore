"""Carga y validación de levantamiento topográfico (SicoeObra).

Puntos en EPSG:3116 (Norte/Este) → WGS84; validación de ubicación contra el eje
del contrato (misma proyección que franjas). La geometría dibujada se asocia al
registro como coords_geojson precisa.
"""
from __future__ import annotations

import csv
import io
import math
import re
from typing import Any, Dict, List, Optional, Tuple

from sicoe_eje_franjas import (
    SICOE_EJE_MAX_DIST_PROYECCION_M,
    proyectar_sobre_eje,
)
from topo_crs import gk_bogota_to_wgs84

HEADER_PUNTO = re.compile(r"^(punto|n[oº°]?|nro|num|numero|n[uú]mero|#|id|nodo)$", re.I)
HEADER_NORTE = re.compile(r"^(norte|north|y)$", re.I)
HEADER_ESTE = re.compile(r"^(este|east|x)$", re.I)
HEADER_COTA = re.compile(r"^(cota|z|elev|elevacion|elevaci[oó]n|altura)$", re.I)
HEADER_DESC = re.compile(r"^(desc|descripcion|descripci[oó]n|detalle|obs|observacion)$", re.I)


def _norm_header(raw: Any) -> str:
    s = str(raw or "").strip().lower()
    s = (
        s.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ñ", "n")
    )
    return re.sub(r"[^a-z0-9#]+", "", s)


def _classify_header(raw: Any) -> Optional[str]:
    s = _norm_header(raw)
    if not s:
        return None
    if HEADER_NORTE.match(s) or "norte" in s:
        # 'y' solo es cabecera si el texto es exactamente y (ambiguo en datos)
        if s == "y" and str(raw or "").strip().lower() == "y":
            return "norte"
        if s != "y":
            return "norte"
    if HEADER_ESTE.match(s) or "este" in s:
        if s == "x" and str(raw or "").strip().lower() == "x":
            return "este"
        if s != "x":
            return "este"
    if HEADER_COTA.match(s) or "cota" in s:
        return "cota"
    if HEADER_DESC.match(s) or "desc" in s:
        return "desc"
    if HEADER_PUNTO.match(s) or "punto" in s or "nodo" in s:
        return "punto"
    return None


def _parse_num(raw: Any) -> Optional[float]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, (int, float)) and math.isfinite(float(raw)):
        return float(raw)
    s = str(raw).strip().replace(" ", "").replace(",", ".")
    try:
        n = float(s)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def _header_map_fuerte(header_cells: List[Any]) -> Dict[str, int]:
    """Detecta cabecera; x/y solo cuentan si también hay otra columna tipada (punto/cota/…)."""
    raw_map: Dict[str, int] = {}
    kinds_present = set()
    for i, cell in enumerate(header_cells):
        kind = _classify_header(cell)
        if not kind:
            continue
        s = _norm_header(cell)
        ambiguous = s in ("x", "y")
        if kind not in raw_map:
            raw_map[kind] = i
            if not ambiguous:
                kinds_present.add(kind)
            else:
                kinds_present.add(f"amb_{kind}")
    # Exigir norte+este, o al menos un nombre explícito norte/este
    strong = {k for k in kinds_present if not k.startswith("amb_")}
    if "norte" in strong or "este" in strong:
        return raw_map
    if "norte" in raw_map and "este" in raw_map and len(strong) >= 1:
        return raw_map
    return {}


def parse_levantamiento_matrix(matrix: List[List[Any]]) -> List[dict]:
    """Parsea filas tipo Punto,Norte,Este,Cota,Descripción (con o sin cabecera)."""
    rows = [
        list(r) if isinstance(r, (list, tuple)) else []
        for r in (matrix or [])
    ]
    rows = [r for r in rows if any(str(c or "").strip() != "" for c in r)]
    if not rows:
        return []

    header_map = _header_map_fuerte(rows[0])
    has_header = bool(header_map) and ("norte" in header_map or "este" in header_map)
    col = (
        header_map
        if has_header
        else {"punto": 0, "norte": 1, "este": 2, "cota": 3, "desc": 4}
    )
    data = rows[1:] if has_header else rows
    out: List[dict] = []
    auto = 1
    for cells in data:
        norte = _parse_num(cells[col["norte"]] if col.get("norte") is not None and col["norte"] < len(cells) else None)
        este = _parse_num(cells[col["este"]] if col.get("este") is not None and col["este"] < len(cells) else None)
        if norte is None and este is None:
            continue
        punto_raw = (
            cells[col["punto"]]
            if col.get("punto") is not None and col["punto"] < len(cells)
            else None
        )
        punto = str(punto_raw or "").strip() or str(auto)
        cota = _parse_num(
            cells[col["cota"]] if col.get("cota") is not None and col["cota"] < len(cells) else None
        )
        desc = ""
        if col.get("desc") is not None and col["desc"] < len(cells):
            desc = str(cells[col["desc"]] or "").strip()
        out.append(
            {
                "punto": punto,
                "norte": norte if norte is not None else 0.0,
                "este": este if este is not None else 0.0,
                "cota": cota,
                "descripcion": desc,
            }
        )
        auto += 1
    return out


def parse_levantamiento_csv(text: str) -> List[dict]:
    raw = str(text or "").lstrip("\ufeff")
    sample = raw[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
        if ";" in sample and sample.count(";") > sample.count(","):
            dialect.delimiter = ";"
        elif "\t" in sample:
            dialect.delimiter = "\t"
    reader = csv.reader(io.StringIO(raw), dialect)
    matrix = [list(row) for row in reader]
    return parse_levantamiento_matrix(matrix)


def enriquecer_punto_wgs84(punto: dict) -> dict:
    """Añade lng/lat WGS84 a un punto GK. No muta si ya tiene coords válidas."""
    p = dict(punto or {})
    lng = p.get("lng")
    lat = p.get("lat")
    if (
        lng is not None
        and lat is not None
        and math.isfinite(float(lng))
        and math.isfinite(float(lat))
    ):
        p["lng"] = float(lng)
        p["lat"] = float(lat)
        return p
    try:
        lon, la = gk_bogota_to_wgs84(float(p["este"]), float(p["norte"]))
        p["lng"] = lon
        p["lat"] = la
    except (TypeError, ValueError, KeyError):
        p["lng"] = None
        p["lat"] = None
    return p


def validar_ubicacion_punto(
    punto: dict,
    ejes: List[dict],
    *,
    max_dist_m: float = SICOE_EJE_MAX_DIST_PROYECCION_M,
) -> dict:
    """
    Misma idea que franjas: el punto debe proyectarse sobre el eje del contrato.
    Sin eje disponible, se acepta si la transformación CRS es válida.
    """
    p = enriquecer_punto_wgs84(punto)
    lng, lat = p.get("lng"), p.get("lat")
    if lng is None or lat is None:
        return {
            "ok": False,
            "razon": "crs_invalido",
            "mensaje": f"Punto {p.get('punto') or '?'}: coordenadas Este/Norte no transformables.",
            "punto": p,
        }
    if not ejes:
        return {"ok": True, "razon": "sin_eje", "punto": p, "proyeccion": None}
    proy = proyectar_sobre_eje(ejes, float(lng), float(lat), max_dist_m=max_dist_m)
    if not proy or not proy.get("sobre_eje"):
        dist = proy.get("dist_m") if proy else None
        return {
            "ok": False,
            "razon": "fuera_eje",
            "mensaje": (
                f"Punto {p.get('punto') or '?'}: ubicación inconsistente"
                + (f" ({dist:.1f} m del eje)" if dist is not None else " (fuera del eje)")
            ),
            "punto": p,
            "proyeccion": proy,
        }
    return {"ok": True, "razon": "ok", "punto": p, "proyeccion": proy}


def validar_puntos_levantamiento(
    puntos: List[dict],
    ejes: List[dict],
    *,
    max_dist_m: float = SICOE_EJE_MAX_DIST_PROYECCION_M,
) -> dict:
    aceptados: List[dict] = []
    rechazados: List[dict] = []
    for raw in puntos or []:
        r = validar_ubicacion_punto(raw, ejes, max_dist_m=max_dist_m)
        if r["ok"]:
            aceptados.append(r["punto"])
        else:
            rechazados.append(
                {
                    "punto": (r.get("punto") or {}).get("punto"),
                    "razon": r.get("razon"),
                    "mensaje": r.get("mensaje"),
                    "norte": (r.get("punto") or {}).get("norte"),
                    "este": (r.get("punto") or {}).get("este"),
                }
            )
    return {
        "ok": len(rechazados) == 0 and len(aceptados) > 0,
        "aceptados": aceptados,
        "rechazados": rechazados,
        "total": len(aceptados) + len(rechazados),
    }


def puntos_a_geojson(puntos: List[dict], *, reporte_id: Any = None) -> dict:
    features = []
    for p in puntos or []:
        ep = enriquecer_punto_wgs84(p)
        lng, lat = ep.get("lng"), ep.get("lat")
        if lng is None or lat is None:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": {
                    "id": ep.get("id"),
                    "punto": ep.get("punto") or "",
                    "label": str(ep.get("punto") or ep.get("id") or ""),
                    "norte": ep.get("norte"),
                    "este": ep.get("este"),
                    "cota": ep.get("cota"),
                    "descripcion": ep.get("descripcion") or "",
                    "origen": ep.get("origen") or "manual",
                    "reporte_id": reporte_id if reporte_id is not None else ep.get("reporte_id"),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def geometria_desde_vertices(
    vertices: List[dict],
    geometria_tipo: str,
) -> Tuple[Optional[dict], Optional[str], Optional[dict]]:
    """
    Construye GeoJSON + coord_lat/lng representativos desde vértices {lng,lat}.
    Returns (coords_geojson, geometria_tipo_norm, centro {lat,lng}).
    """
    tipo = str(geometria_tipo or "").strip().lower()
    if tipo in ("área", "area", "poligono", "polígono"):
        tipo = "area"
    elif tipo in ("línea", "linea", "line", "linestring"):
        tipo = "linea"
    elif tipo in ("punto", "point", "nodo"):
        tipo = "punto"
    else:
        n = len(vertices or [])
        if n >= 3:
            tipo = "area"
        elif n == 2:
            tipo = "linea"
        else:
            tipo = "punto"

    verts = []
    for v in vertices or []:
        try:
            lng = float(v.get("lng") if isinstance(v, dict) else v[0])
            lat = float(v.get("lat") if isinstance(v, dict) else v[1])
        except (TypeError, ValueError, IndexError, KeyError):
            continue
        if math.isfinite(lng) and math.isfinite(lat):
            verts.append((lng, lat))
    if not verts:
        return None, tipo, None

    if tipo == "area":
        if len(verts) < 3:
            return None, tipo, None
        ring = [[lng, lat] for lng, lat in verts]
        if ring[0] != ring[-1]:
            ring.append(list(ring[0]))
        geom = {"type": "Polygon", "coordinates": [ring]}
    elif tipo == "linea":
        if len(verts) < 2:
            return None, tipo, None
        geom = {"type": "LineString", "coordinates": [[lng, lat] for lng, lat in verts]}
    else:
        geom = {"type": "Point", "coordinates": [verts[0][0], verts[0][1]]}

    # Centroide simple (media de vértices, sin cierre)
    base = verts[:-1] if (tipo == "area" and len(verts) > 1 and verts[0] == verts[-1]) else verts
    clng = sum(v[0] for v in base) / len(base)
    clat = sum(v[1] for v in base) / len(base)
    return geom, tipo, {"lng": clng, "lat": clat}


def resumir_precision_huellas(rows: List[dict], *, usuario_id: Optional[int] = None) -> dict:
    """Indicador precisa / aproximada / sin huella (contrato y por usuario creador)."""
    total = precisas = aproximadas = sin = 0
    u_total = u_precisas = u_aproximadas = u_sin = 0
    uid = int(usuario_id) if usuario_id is not None else None
    for r in rows or []:
        prec = str(r.get("huella_precision") or "").strip().lower()
        total += 1
        if prec == "precisa":
            precisas += 1
        elif prec == "aproximada":
            aproximadas += 1
        else:
            sin += 1
        if uid is not None:
            try:
                creador = int(r.get("creado_por_reg") or 0)
            except (TypeError, ValueError):
                creador = 0
            if creador == uid:
                u_total += 1
                if prec == "precisa":
                    u_precisas += 1
                elif prec == "aproximada":
                    u_aproximadas += 1
                else:
                    u_sin += 1
    return {
        "contrato": {
            "total": total,
            "precisas": precisas,
            "aproximadas": aproximadas,
            "sin_huella": sin,
        },
        "usuario": {
            "usuario_id": uid,
            "total": u_total,
            "precisas": u_precisas,
            "aproximadas": u_aproximadas,
            "sin_huella": u_sin,
        },
    }
