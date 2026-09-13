"""Sistemas de coordenadas topográficos — MAGNA-SIRGAS / Bogotá (EPSG:3116)."""
from __future__ import annotations

import math
from typing import Iterable, List, Optional, Tuple

# GRS80 / MAGNA-SIRGAS — Transverse Mercator Origen Bogotá (EPSG:3116)
_A = 6378137.0
_F = 1 / 298.257222101
_E2 = _F * (2 - _F)
_EP2 = _E2 / (1 - _E2)
_K0 = 1.0
_FE = 1000000.0
_FN = 1000000.0
_LON0 = math.radians(-74.0775079166667)
_LAT0 = math.radians(4.596200416666666)


def _meridional_arc(phi: float) -> float:
    return _A * (
        (1 - _E2 / 4 - 3 * _E2**2 / 64 - 5 * _E2**3 / 256) * phi
        - (3 * _E2 / 8 + 3 * _E2**2 / 32 + 45 * _E2**3 / 1024) * math.sin(2 * phi)
        + (15 * _E2**2 / 256 + 45 * _E2**3 / 1024) * math.sin(4 * phi)
        - (35 * _E2**3 / 3072) * math.sin(6 * phi)
    )


_M0 = _meridional_arc(_LAT0)


def gk_bogota_to_wgs84(este: float, norte: float) -> Tuple[float, float]:
    """EPSG:3116 (E, N) → (lon, lat) WGS84 en grados decimales."""
    x = float(este) - _FE
    y = float(norte) - _FN
    e1 = (1 - math.sqrt(1 - _E2)) / (1 + math.sqrt(1 - _E2))
    mu = (_M0 + y / _K0) / (_A * (1 - _E2 / 4 - 3 * _E2**2 / 64 - 5 * _E2**3 / 256))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
        + (151 * e1**3 / 96) * math.sin(6 * mu)
        + (1097 * e1**4 / 512) * math.sin(8 * mu)
    )
    n1 = _A / math.sqrt(1 - _E2 * math.sin(phi1) ** 2)
    t1 = math.tan(phi1) ** 2
    c1 = _EP2 * math.cos(phi1) ** 2
    r1 = _A * (1 - _E2) / (1 - _E2 * math.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * _K0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * _EP2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * _EP2 - 3 * c1**2) * d**6 / 720
    )
    lon = _LON0 + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * _EP2 + 24 * t1**2) * d**5 / 120
    ) / math.cos(phi1)
    return math.degrees(lon), math.degrees(lat)


def puntos_gk_a_lonlat(puntos: Iterable[dict]) -> List[Tuple[float, float]]:
    """Lista de dicts con este/norte → [(lon, lat), ...]. Omite inválidos."""
    out: List[Tuple[float, float]] = []
    for p in puntos or []:
        if p is None:
            continue
        if p.get("este") is None or p.get("norte") is None:
            continue
        try:
            out.append(gk_bogota_to_wgs84(float(p["este"]), float(p["norte"])))
        except (TypeError, ValueError):
            continue
    return out


def bbox_lonlat(
    lonlats: List[Tuple[float, float]], *, pad_frac: float = 0.12
) -> Optional[Tuple[float, float, float, float]]:
    """(west, south, east, north) con padding relativo."""
    if not lonlats:
        return None
    lons = [x[0] for x in lonlats]
    lats = [x[1] for x in lonlats]
    west, east = min(lons), max(lons)
    south, north = min(lats), max(lats)
    span_lon = max(east - west, 1e-6)
    span_lat = max(north - south, 1e-6)
    # Evitar bbox degenerado en poligonales muy cortas
    min_span = 0.0008  # ~90 m
    if span_lon < min_span:
        mid = (west + east) / 2
        west, east = mid - min_span / 2, mid + min_span / 2
        span_lon = min_span
    if span_lat < min_span:
        mid = (south + north) / 2
        south, north = mid - min_span / 2, mid + min_span / 2
        span_lat = min_span
    pad_lon = span_lon * pad_frac
    pad_lat = span_lat * pad_frac
    return west - pad_lon, south - pad_lat, east + pad_lon, north + pad_lat
