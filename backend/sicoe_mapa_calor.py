"""Mapa de calor SicoeObra: puntos ponderados por costo_directo (sin deps de Supabase)."""
from __future__ import annotations

from typing import List, Optional, Tuple

SICOE_MAPA_CALOR_MAX_FEATURES = 8000


def parse_coord_wgs84(lat, lng) -> Optional[Tuple[float, float]]:
    """Devuelve (lng, lat) si es WGS84 usable; si no, None."""
    try:
        la = float(lat)
        ln = float(lng)
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= la <= 90.0 and -180.0 <= ln <= 180.0):
        return None
    if la == 0.0 and ln == 0.0:
        return None
    return (ln, la)


def build_mapa_calor_geojson(
    registros: List[dict],
    reporte_map: dict,
    *,
    max_features: int = SICOE_MAPA_CALOR_MAX_FEATURES,
) -> dict:
    """
    FeatureCollection de puntos ponderados por costo_directo.

    La intensidad (weight) es siempre relativa al conjunto `registros` recibido
    (ya filtrado por el caller): max(costo_directo) de ese conjunto = weight 1.0.
    No usa un máximo absoluto del contrato ni de otra consulta.

    Preferencia de coords: registro; fallback: reporte (loc. única).
    """
    costos = []
    for r in registros or []:
        try:
            c = float(r.get("costo_directo") or 0)
        except (TypeError, ValueError):
            c = 0.0
        if c > 0:
            costos.append(c)
    # Máximo del conjunto filtrado actual (recalculado en cada respuesta).
    max_costo = max(costos) if costos else 0.0

    features: List[dict] = []
    sin_coords = 0
    truncado = False
    for r in registros or []:
        if len(features) >= max_features:
            truncado = True
            break
        coords = parse_coord_wgs84(r.get("coord_lat"), r.get("coord_lng"))
        origen = "registro"
        rep = reporte_map.get(r.get("reporte_id")) or {}
        if coords is None:
            coords = parse_coord_wgs84(rep.get("coord_lat"), rep.get("coord_lng"))
            origen = "reporte"
        if coords is None:
            sin_coords += 1
            continue
        try:
            costo = float(r.get("costo_directo") or 0)
        except (TypeError, ValueError):
            costo = 0.0
        if max_costo > 0:
            weight = min(1.0, max(0.0, costo / max_costo))
        else:
            weight = 0.15
        # Evitar peso 0 en heatmap (Mapbox ignora weight 0)
        if weight <= 0 and costo >= 0:
            weight = 0.05
        niveles = {}
        for i in range(1, 7):
            est = r.get(f"nivel{i}_estado")
            if est:
                niveles[f"nivel{i}"] = est
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [coords[0], coords[1]]},
                "properties": {
                    "id": r.get("id"),
                    "numero_registro": r.get("numero_registro"),
                    "reporte_id": r.get("reporte_id"),
                    "numero_reporte": rep.get("numero_reporte"),
                    "capitulo": r.get("capitulo") or rep.get("capitulo"),
                    "item_numero": r.get("item_numero"),
                    "item_descripcion": r.get("item_descripcion"),
                    "cantidad_total": r.get("cantidad_total"),
                    "costo_directo": costo,
                    "weight": round(weight, 6),
                    "estado_reporte": rep.get("estado"),
                    "descripcion_actividad": rep.get("descripcion_actividad"),
                    "pk_id_id": r.get("pk_id_id"),
                    "tramo": r.get("tramo"),
                    "margen": r.get("margen"),
                    "abs_inicio": r.get("abs_inicio"),
                    "abs_final": r.get("abs_final"),
                    "created_at": r.get("created_at"),
                    "origen_coord": origen,
                    **niveles,
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "total_registros": len(registros or []),
            "con_coords": len(features),
            "sin_coords": sin_coords,
            "max_costo_directo": max_costo,
            "intensidad": "relativa_conjunto_filtrado",
            "truncado": truncado,
            "max_features": max_features,
        },
    }
