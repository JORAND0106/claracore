"""Bloques de nodo: vértices locales (metros) y polígono WGS84 centrado."""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sicoe_eje_franjas import destination_point

FORMAS_VALIDAS = frozenset({"circulo", "cuadrado", "rectangulo", "ovalo", "personalizado"})


def normalizar_forma(raw: Any) -> str:
    t = str(raw or "").strip().casefold()
    t = t.replace("í", "i").replace("ó", "o")
    if t in ("circle", "circunferencia", "pozo"):
        return "circulo"
    if t in ("square", "cuadro"):
        return "cuadrado"
    if t in ("rectangle", "rect"):
        return "rectangulo"
    if t in ("ellipse", "elipse", "oval"):
        return "ovalo"
    if t in ("custom", "path", "poligono", "polygon"):
        return "personalizado"
    if t in FORMAS_VALIDAS:
        return t
    return "circulo"


def _medida(v: Any, default: float = 1.0) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(n) or n <= 0:
        return default
    return n


def vertices_locales_bloque(
    forma: Any,
    ancho_m: Any,
    alto_m: Any,
    vertices: Optional[Sequence] = None,
    *,
    n_circulo: int = 24,
) -> List[Tuple[float, float]]:
    """
    Vértices en metros con centro en (0,0).
    +X = este, +Y = norte (antes de rotación / proyección).
    """
    forma_n = normalizar_forma(forma)
    w = _medida(ancho_m, 1.0)
    h = _medida(alto_m, w)
    if forma_n == "personalizado" and vertices:
        out: List[Tuple[float, float]] = []
        for p in vertices:
            if not isinstance(p, (list, tuple)) or len(p) < 2:
                continue
            try:
                out.append((float(p[0]), float(p[1])))
            except (TypeError, ValueError):
                continue
        if len(out) >= 3:
            return out
    if forma_n == "circulo":
        r = w / 2.0
        return [
            (r * math.cos(2 * math.pi * i / n_circulo), r * math.sin(2 * math.pi * i / n_circulo))
            for i in range(n_circulo)
        ]
    if forma_n == "ovalo":
        rx, ry = w / 2.0, h / 2.0
        return [
            (rx * math.cos(2 * math.pi * i / n_circulo), ry * math.sin(2 * math.pi * i / n_circulo))
            for i in range(n_circulo)
        ]
    # cuadrado / rectangulo
    hw, hh = w / 2.0, h / 2.0
    return [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]


def rotar_xy(x: float, y: float, deg: float) -> Tuple[float, float]:
    rad = math.radians(float(deg or 0.0))
    c, s = math.cos(rad), math.sin(rad)
    return (x * c - y * s, x * s + y * c)


def bloque_a_poligono_wgs84(
    lng: float,
    lat: float,
    *,
    forma: Any = "circulo",
    ancho_m: Any = 1.0,
    alto_m: Any = 1.0,
    vertices: Optional[Sequence] = None,
    rotacion_deg: float = 0.0,
) -> Optional[dict]:
    """Polygon WGS84 del bloque centrado en (lng, lat), rotado en sentido horario desde norte."""
    if not (math.isfinite(lng) and math.isfinite(lat)):
        return None
    verts = vertices_locales_bloque(forma, ancho_m, alto_m, vertices)
    if len(verts) < 3:
        return None
    ring = []
    for x, y in verts:
        xr, yr = rotar_xy(x, y, rotacion_deg)
        # bearing desde este(+X) / norte(+Y): atan2(este, norte) en grados desde norte
        dist = math.hypot(xr, yr)
        if dist < 1e-9:
            ring.append([lng, lat])
            continue
        bearing = (math.degrees(math.atan2(xr, yr)) + 360.0) % 360.0
        p = destination_point(lng, lat, bearing, dist)
        ring.append([p["lng"], p["lat"]])
    if ring[0] != ring[-1]:
        ring.append(ring[0][:])
    if len(ring) < 4:
        return None
    return {"type": "Polygon", "coordinates": [ring]}


def snapshot_bloque(row: Optional[dict]) -> Optional[Dict[str, Any]]:
    if not row or not isinstance(row, dict):
        return None
    return {
        "id": row.get("id"),
        "nombre": row.get("nombre"),
        "forma": normalizar_forma(row.get("forma")),
        "ancho_m": _medida(row.get("ancho_m"), 1.0),
        "alto_m": _medida(row.get("alto_m"), 1.0),
        "vertices": row.get("vertices"),
    }
