"""
Huellas de nodo y polígono + auditoría espacial por ítem (SicoeObra).
Complementa sicoe_eje_franjas (franjas lineales). Misma semántica que
frontend/src/modules/sicoe-obra/sicoeHuellasEspacial.js.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from sicoe_eje_franjas import (
    abscisa_a_metros,
    destination_point,
    haversine_m,
    reconstruir_ejes_desde_plano,
    _interp_abs_en_eje,
)

SICOE_RADIO_NODO_DEFAULT_M = 1.0
SICOE_RADIO_NODO_MIN_M = 0.1
SICOE_NODO_MARKER_RADIUS_M = 0.45

SICOE_AUDITORIA_JUSTIFICACIONES_CANTIDAD_AREA = (
    "Cantidad incluye desperdicio / desperdicios de obra",
    "Polígono parcial; cobro por sector",
    "Área levantada pendiente de actualizar",
    "Error de digitación corregido en campo",
)

_EARTH_R = 6371000.0


def _txt(v: Any) -> str:
    return str(v or "").strip()


def normalizar_radio_nodo_m(raw: Any) -> float:
    if raw is None or raw == "":
        return SICOE_RADIO_NODO_DEFAULT_M
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return SICOE_RADIO_NODO_DEFAULT_M
    if not math.isfinite(v):
        return SICOE_RADIO_NODO_DEFAULT_M
    return max(SICOE_RADIO_NODO_MIN_M, v)


def sugerir_geometria_tipo(registro: Optional[dict] = None, n_coords: int = 0) -> str:
    """Sugiere punto/linea/area según unidad y cantidad de coordenadas."""
    if n_coords >= 3:
        return "area"
    if n_coords == 2:
        return "linea"
    unidad = _txt((registro or {}).get("unidad")).casefold()
    unidad = unidad.replace("²", "2").replace("m2", "m2")
    if "m2" in unidad or "m²" in unidad or unidad in ("m2", "m²"):
        return "area"
    if unidad in ("un", "und", "u", "unidad", "unid", "und."):
        return "punto"
    if "ml" in unidad or unidad in ("m", "ml", "m.l.", "ml."):
        return "linea"
    # Con abs inicio/fin tipicamente lineal
    if (registro or {}).get("abs_inicio") is not None and (registro or {}).get("abs_final") is not None:
        return "linea"
    return "punto"


def normalizar_geometria_tipo(raw: Any, registro: Optional[dict] = None, n_coords: int = 0) -> str:
    t = _txt(raw).casefold()
    if t in ("punto", "point", "nodo"):
        return "punto"
    if t in ("linea", "línea", "line", "franja"):
        return "linea"
    if t in ("area", "área", "poligono", "polígono", "polygon"):
        return "area"
    return sugerir_geometria_tipo(registro, n_coords=n_coords)


def _parse_coord(lat: Any, lng: Any) -> Optional[dict]:
    try:
        la, ln = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(la) and math.isfinite(ln)):
        return None
    if la == 0 and ln == 0:
        return None
    if abs(la) > 90 or abs(ln) > 180:
        return None
    return {"lat": la, "lng": ln}


def punto_en_poligono(lng: float, lat: float, polygon_coords: List) -> bool:
    """Ray casting. polygon_coords = ring [[lng,lat], ...] o Polygon coordinates[0]."""
    ring = polygon_coords
    if ring and isinstance(ring[0][0], (list, tuple)):
        ring = ring[0]
    if not ring or len(ring) < 3:
        return False
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = float(ring[i][0]), float(ring[i][1])
        xj, yj = float(ring[j][0]), float(ring[j][1])
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-15) + xi
        ):
            inside = not inside
        j = i
    return inside


def area_poligono_m2(polygon_coords: List) -> float:
    """Área aproximada en m² (equirectangular local)."""
    ring = polygon_coords
    if ring and isinstance(ring[0][0], (list, tuple)):
        ring = ring[0]
    if not ring or len(ring) < 3:
        return 0.0
    # Cerrar
    pts = list(ring)
    if pts[0] != pts[-1]:
        pts = pts + [pts[0]]
    lat0 = math.radians(sum(float(p[1]) for p in pts[:-1]) / max(1, len(pts) - 1))
    m_per_deg_lat = (_EARTH_R * math.pi) / 180.0
    m_per_deg_lng = m_per_deg_lat * math.cos(lat0)
    xy = [(float(p[0]) * m_per_deg_lng, float(p[1]) * m_per_deg_lat) for p in pts]
    area = 0.0
    for i in range(len(xy) - 1):
        x1, y1 = xy[i]
        x2, y2 = xy[i + 1]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def interseccion_poligonos_m2(a_coords: List, b_coords: List) -> float:
    """
    Aproximación: si hay solape, estima área de intersección por muestreo de
    bounding box (suficiente para alerta; no es un GIS completo).
    """
    def _ring(coords):
        r = coords
        if r and isinstance(r[0][0], (list, tuple)):
            r = r[0]
        return r or []

    ra, rb = _ring(a_coords), _ring(b_coords)
    if len(ra) < 3 or len(rb) < 3:
        return 0.0
    # Quick reject
    def _bbox(r):
        xs = [float(p[0]) for p in r]
        ys = [float(p[1]) for p in r]
        return min(xs), min(ys), max(xs), max(ys)

    ax0, ay0, ax1, ay1 = _bbox(ra)
    bx0, by0, bx1, by1 = _bbox(rb)
    if ax1 < bx0 or bx1 < ax0 or ay1 < by0 or by1 < ay0:
        return 0.0
    # Sample grid
    xmin, xmax = max(ax0, bx0), min(ax1, bx1)
    ymin, ymax = max(ay0, by0), min(ay1, by1)
    if xmax <= xmin or ymax <= ymin:
        return 0.0
    n = 12
    hits = 0
    total = 0
    for i in range(n):
        for j in range(n):
            lng = xmin + (i + 0.5) * (xmax - xmin) / n
            lat = ymin + (j + 0.5) * (ymax - ymin) / n
            total += 1
            if punto_en_poligono(lng, lat, ra) and punto_en_poligono(lng, lat, rb):
                hits += 1
    if hits == 0:
        return 0.0
    # Área del bbox de solape * proporción
    # Convert bbox to m² roughly
    lat_mid = math.radians((ymin + ymax) / 2)
    m_lat = (_EARTH_R * math.pi) / 180.0
    m_lng = m_lat * math.cos(lat_mid)
    box_m2 = abs(xmax - xmin) * m_lng * abs(ymax - ymin) * m_lat
    return box_m2 * (hits / total)


def _mk_hallazgo(tipo: str, texto: str, reg: dict, **extra) -> dict:
    return {
        "tipo": tipo,
        "texto": texto,
        "medida_m": extra.get("medida_m"),
        "abs_desde": reg.get("abs_inicio"),
        "abs_hasta": reg.get("abs_final"),
        "valor_en_juego": float(extra.get("valor_en_juego") or 0),
        "item_numero": _txt(reg.get("item_numero")),
        "tramo": _txt(reg.get("tramo")),
        "infraestructura": _txt(reg.get("infraestructura")),
        "costado": _txt(reg.get("margen") or reg.get("calzada")),
        "pk_id_id": reg.get("pk_id_id"),
        "ubicacion": extra.get("ubicacion") or _txt(reg.get("ubicacion")) or "—",
        "registros_involucrados": extra.get("registros_involucrados")
        or [
            {
                "id": reg.get("id"),
                "numero_registro": reg.get("numero_registro"),
                "reporte_id": reg.get("reporte_id"),
                "item_numero": reg.get("item_numero"),
                "pk_id_id": reg.get("pk_id_id"),
            }
        ],
    }


def _circle_polygon(lng: float, lat: float, radius_m: float, n: int = 20) -> dict:
    ring = []
    for i in range(n):
        br = (360.0 * i) / n
        p = destination_point(lng, lat, br, radius_m)
        ring.append([p["lng"], p["lat"]])
    ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}


def coords_desde_registro(reg: dict) -> Tuple[Optional[dict], Optional[dict]]:
    """(Point geometry or None, Polygon geometry or None) from coords_geojson / coord fields."""
    cg = reg.get("coords_geojson")
    point = None
    poly = None
    if isinstance(cg, dict):
        gt = (cg.get("geometry") or cg).get("type") if cg.get("type") == "Feature" else cg.get("type")
        geom = cg.get("geometry") if cg.get("type") == "Feature" else cg
        if gt == "Point":
            coords = geom.get("coordinates") or []
            if len(coords) >= 2:
                point = _parse_coord(coords[1], coords[0])
        elif gt == "Polygon":
            poly = geom
        elif gt == "FeatureCollection":
            for f in cg.get("features") or []:
                g = f.get("geometry") or {}
                if g.get("type") == "Polygon" and poly is None:
                    poly = g
                elif g.get("type") == "Point" and point is None:
                    c = g.get("coordinates") or []
                    if len(c) >= 2:
                        point = _parse_coord(c[1], c[0])
    if point is None:
        point = _parse_coord(reg.get("coord_lat"), reg.get("coord_lng"))
    # Perímetro de reporte
    if poly is None and isinstance(reg.get("perimetro_geojson"), dict):
        pg = reg["perimetro_geojson"]
        geom = pg.get("geometry") if pg.get("type") == "Feature" else pg
        if (geom or {}).get("type") == "Polygon":
            poly = geom
    return point, poly


def analizar_nodo(
    registro: dict,
    nodo_existente: Optional[dict],
    *,
    radio_m: float = SICOE_RADIO_NODO_DEFAULT_M,
    ejes: Optional[List[dict]] = None,
    pares_mismo_item_en_nodo: Optional[List[dict]] = None,
) -> dict:
    """
    Analiza registro puntual: pega al nodo PK_ID o crea/actualiza coordenada oficial.
    """
    radio = normalizar_radio_nodo_m(radio_m)
    reg = registro or {}
    pk = reg.get("pk_id_id")
    point, poly_reg = coords_desde_registro(reg)
    hallazgos: List[dict] = []
    precision = "aproximada"
    nodo_update = None
    huella = None

    # Si el registro trae polígono de excavación del nodo
    if poly_reg and pk is not None:
        nodo_update = {
            "pk_id_id": pk,
            "poligono_geojson": {"type": "Feature", "geometry": poly_reg, "properties": {"pk_id_id": pk}},
        }
        # Si hay punto, verificar dentro del polígono
        if point and not punto_en_poligono(point["lng"], point["lat"], poly_reg.get("coordinates")):
            hallazgos.append(
                _mk_hallazgo(
                    "ubicacion_inconsistente",
                    "Ubicación inconsistente · punto fuera del polígono del nodo",
                    reg,
                )
            )
        if point:
            nodo_update["coord_lat"] = point["lat"]
            nodo_update["coord_lng"] = point["lng"]
            precision = "precisa"
        huella = {
            "type": "Feature",
            "geometry": poly_reg,
            "properties": {
                "registro_id": reg.get("id"),
                "pk_id_id": pk,
                "huella_tipo": "poligono",
                "precision": precision,
                "item_numero": reg.get("item_numero"),
            },
        }
    elif point and pk is not None:
        if nodo_existente and nodo_existente.get("coord_lat") is not None:
            dist = haversine_m(
                {"lat": float(nodo_existente["coord_lat"]), "lng": float(nodo_existente["coord_lng"])},
                point,
            )
            poly_nodo = None
            if isinstance(nodo_existente.get("poligono_geojson"), dict):
                pg = nodo_existente["poligono_geojson"]
                poly_nodo = pg.get("geometry") if pg.get("type") == "Feature" else pg
            dentro_poly = False
            if poly_nodo and poly_nodo.get("type") == "Polygon":
                dentro_poly = punto_en_poligono(point["lng"], point["lat"], poly_nodo.get("coordinates"))
            if dentro_poly or dist <= radio:
                precision = "precisa"
                # No mueve la coord oficial
                nodo_update = {"pk_id_id": pk}  # touch
            else:
                hallazgos.append(
                    _mk_hallazgo(
                        "ubicacion_inconsistente",
                        f"Ubicación inconsistente · {dist:.1f} m fuera del nodo PK (radio {radio:.2f} m)",
                        reg,
                        medida_m=round(dist, 2),
                    )
                )
                precision = "aproximada"
        else:
            # Primera coordenada oficial del nodo
            nodo_update = {
                "pk_id_id": pk,
                "coord_lat": point["lat"],
                "coord_lng": point["lng"],
            }
            precision = "precisa"
        # Huella nodo: círculo pequeño en coord oficial o punto actual
        olat = (nodo_existente or {}).get("coord_lat") if nodo_existente else None
        olng = (nodo_existente or {}).get("coord_lng") if nodo_existente else None
        if olat is None:
            olat, olng = point["lat"], point["lng"]
        geom = _circle_polygon(float(olng), float(olat), SICOE_NODO_MARKER_RADIUS_M)
        # Si hay polígono del nodo, la huella visual del registro es el marcador; el polígono se dibuja aparte
        huella = {
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "registro_id": reg.get("id"),
                "pk_id_id": pk,
                "huella_tipo": "nodo",
                "precision": precision,
                "item_numero": reg.get("item_numero"),
                "numero_registro": reg.get("numero_registro"),
                "reporte_id": reg.get("reporte_id"),
            },
        }
    else:
        # Sin coords: aproximado por abscisa media sobre el eje
        abs_m = None
        a0 = abscisa_a_metros(reg.get("abs_inicio"))
        a1 = abscisa_a_metros(reg.get("abs_final"))
        if a0 is not None and a1 is not None:
            abs_m = (a0 + a1) / 2
        elif a0 is not None:
            abs_m = a0
        if ejes and abs_m is not None:
            eje = ejes[0]
            p = _interp_abs_en_eje(eje, abs_m)
            if p:
                geom = _circle_polygon(p["lng"], p["lat"], SICOE_NODO_MARKER_RADIUS_M)
                huella = {
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "registro_id": reg.get("id"),
                        "pk_id_id": pk,
                        "huella_tipo": "nodo",
                        "precision": "aproximada",
                        "item_numero": reg.get("item_numero"),
                    },
                }
                if pk is not None and (not nodo_existente or nodo_existente.get("coord_lat") is None):
                    nodo_update = {
                        "pk_id_id": pk,
                        "coord_lat": p["lat"],
                        "coord_lng": p["lng"],
                        "abs_aprox": abs_m,
                    }

    # Traslapo: mismo ítem más de una vez en el mismo nodo
    pares = pares_mismo_item_en_nodo or []
    item = _txt(reg.get("item_numero"))
    if item and pk is not None and pares:
        otros = [p for p in pares if str(p.get("id")) != str(reg.get("id"))]
        if otros:
            inv = [
                {
                    "id": reg.get("id"),
                    "numero_registro": reg.get("numero_registro"),
                    "reporte_id": reg.get("reporte_id"),
                    "item_numero": item,
                    "pk_id_id": pk,
                }
            ] + [
                {
                    "id": o.get("id"),
                    "numero_registro": o.get("numero_registro"),
                    "reporte_id": o.get("reporte_id"),
                    "item_numero": item,
                    "pk_id_id": pk,
                }
                for o in otros
            ]
            hallazgos.append(
                _mk_hallazgo(
                    "traslapo",
                    f"Traslapo · ítem {item} repetido en el mismo nodo PK {pk}",
                    reg,
                    registros_involucrados=inv,
                    ubicacion=f"PK {pk}",
                )
            )

    return {
        "ok": True,
        "precision": precision,
        "huella": huella,
        "huella_tipo": "nodo" if (huella and huella["properties"].get("huella_tipo") == "nodo") else (
            "poligono" if huella else None
        ),
        "hallazgos": hallazgos,
        "nodo_update": nodo_update,
        "semaforo": "rojo" if any(h["tipo"] == "traslapo" for h in hallazgos) else (
            "amarillo" if hallazgos else "verde"
        ),
    }


def analizar_poligono(
    registro: dict,
    pares_mismo_item: Optional[List[dict]] = None,
) -> dict:
    """Huella de área + traslapo por solape + cantidad > área."""
    reg = registro or {}
    point, poly = coords_desde_registro(reg)
    hallazgos: List[dict] = []
    precision = "aproximada"
    huella = None

    if poly and poly.get("type") == "Polygon":
        precision = "precisa"
        area = area_poligono_m2(poly.get("coordinates"))
        huella = {
            "type": "Feature",
            "geometry": poly,
            "properties": {
                "registro_id": reg.get("id"),
                "huella_tipo": "poligono",
                "precision": precision,
                "item_numero": reg.get("item_numero"),
                "area_m2": round(area, 2),
                "numero_registro": reg.get("numero_registro"),
                "reporte_id": reg.get("reporte_id"),
                "pk_id_id": reg.get("pk_id_id"),
            },
        }
        # Cantidad > área
        try:
            cant = float(reg.get("cantidad_total") or reg.get("cantidad") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        unidad = _txt(reg.get("unidad")).casefold().replace("²", "2")
        if ("m2" in unidad or unidad == "m2") and area > 0 and cant > area + 1e-6:
            hallazgos.append(
                _mk_hallazgo(
                    "cantidad_mayor_area",
                    f"Cantidad mayor al área levantada · {cant:.2f} m² > {area:.2f} m²",
                    reg,
                    medida_m=round(cant - area, 2),
                    valor_en_juego=0,
                )
            )
        # Solapes con pares del mismo ítem
        item = _txt(reg.get("item_numero"))
        for peer in pares_mismo_item or []:
            if str(peer.get("id")) == str(reg.get("id")):
                continue
            _, peer_poly = coords_desde_registro(peer)
            if not peer_poly:
                hg = peer.get("huella_geojson")
                if isinstance(hg, dict):
                    peer_poly = hg.get("geometry") if hg.get("type") == "Feature" else hg
            if not peer_poly or peer_poly.get("type") != "Polygon":
                continue
            ov = interseccion_poligonos_m2(poly.get("coordinates"), peer_poly.get("coordinates"))
            if ov > 0.05:  # > 5 cm²
                hallazgos.append(
                    _mk_hallazgo(
                        "traslapo",
                        f"Traslapo · área pisada ≈ {ov:.2f} m² con Reg. {peer.get('numero_registro') or peer.get('id')}",
                        reg,
                        medida_m=round(ov, 2),
                        registros_involucrados=[
                            {
                                "id": reg.get("id"),
                                "numero_registro": reg.get("numero_registro"),
                                "reporte_id": reg.get("reporte_id"),
                                "item_numero": item,
                            },
                            {
                                "id": peer.get("id"),
                                "numero_registro": peer.get("numero_registro"),
                                "reporte_id": peer.get("reporte_id"),
                                "item_numero": item,
                            },
                        ],
                    )
                )
    elif point:
        # Área sin perímetro: marcador aproximado
        geom = _circle_polygon(point["lng"], point["lat"], 1.0)
        huella = {
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "registro_id": reg.get("id"),
                "huella_tipo": "poligono",
                "precision": "aproximada",
                "item_numero": reg.get("item_numero"),
            },
        }
    else:
        return {
            "ok": True,
            "precision": None,
            "huella": None,
            "huella_tipo": None,
            "hallazgos": [],
            "semaforo": "verde",
        }

    return {
        "ok": True,
        "precision": precision,
        "huella": huella,
        "huella_tipo": "poligono",
        "hallazgos": hallazgos,
        "semaforo": "rojo" if any(h["tipo"] == "traslapo" for h in hallazgos) else (
            "amarillo" if hallazgos else "verde"
        ),
    }


def nodos_to_geojson(nodos: List[dict]) -> dict:
    features = []
    for n in nodos or []:
        if n.get("coord_lat") is not None and n.get("coord_lng") is not None:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [float(n["coord_lng"]), float(n["coord_lat"])],
                    },
                    "properties": {
                        "nodo_id": n.get("id"),
                        "pk_id_id": n.get("pk_id_id"),
                        "huella_tipo": "nodo",
                        "abs_aprox": n.get("abs_aprox"),
                    },
                }
            )
        pg = n.get("poligono_geojson")
        if isinstance(pg, dict):
            geom = pg.get("geometry") if pg.get("type") == "Feature" else pg
            if geom and geom.get("type") == "Polygon":
                features.append(
                    {
                        "type": "Feature",
                        "geometry": geom,
                        "properties": {
                            "nodo_id": n.get("id"),
                            "pk_id_id": n.get("pk_id_id"),
                            "huella_tipo": "poligono_nodo",
                        },
                    }
                )
    return {"type": "FeatureCollection", "features": features}
