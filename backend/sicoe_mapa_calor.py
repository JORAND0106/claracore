"""Mapa de calor SicoeObra: puntos ponderados por costo_directo (sin deps de Supabase)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

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


def _reporte_geojson_tiene_dibujo(dg) -> bool:
    if not isinstance(dg, dict):
        return False
    if dg.get("type") == "FeatureCollection":
        return bool(dg.get("features"))
    return True


def _iter_features_dibujo(dibujo_geojson) -> List[dict]:
    """Normaliza dibujo/perímetro/huella a lista de Features con geometría usable."""
    if not isinstance(dibujo_geojson, dict):
        return []
    t = dibujo_geojson.get("type")
    raw: List[Any] = []
    if t == "FeatureCollection":
        raw = list(dibujo_geojson.get("features") or [])
    elif t == "Feature":
        raw = [dibujo_geojson]
    elif t in ("Polygon", "MultiPolygon", "LineString", "MultiLineString", "Point"):
        raw = [{"type": "Feature", "geometry": dibujo_geojson, "properties": {}}]
    out: List[dict] = []
    for f in raw:
        if not isinstance(f, dict):
            continue
        props = dict(f.get("properties") or {})
        if props.get("omitida"):
            continue
        g = f.get("geometry") if f.get("type") == "Feature" else (
            f if f.get("type") in (
                "Polygon", "MultiPolygon", "LineString", "MultiLineString", "Point",
            ) else None
        )
        if not isinstance(g, dict) or not g.get("type"):
            continue
        if g.get("coordinates") is None:
            continue
        out.append({
            "type": "Feature",
            "geometry": g,
            "properties": props,
        })
    return out


def _huella_tipo_desde_feature(feat: dict) -> str:
    props = feat.get("properties") or {}
    raw = str(props.get("huella_tipo") or props.get("dibujo_tipo") or "").lower()
    if raw in ("nodo", "punto", "linea", "poligono", "area", "franja"):
        if raw == "area":
            return "poligono"
        if raw == "punto":
            return "nodo"
        return raw
    if props.get("es_bloque") or props.get("es_entidad"):
        return "nodo"
    gt = (feat.get("geometry") or {}).get("type")
    if gt == "Point":
        return "nodo"
    if gt in ("LineString", "MultiLineString"):
        return "linea"
    return "poligono"


def features_desde_dibujo_reporte(dibujo_geojson, reporte_id=None) -> List[dict]:
    """
    Expande el dibujo del reporte a Features para el plano ClaraGIS.

    A diferencia de la propagación a huella_geojson (que colapsa a un solo Feature
    y prioriza nodos), aquí se conservan TODAS las geometrías dibujadas.
    """
    feats = _iter_features_dibujo(dibujo_geojson)
    out: List[dict] = []
    for i, f in enumerate(feats):
        props = dict(f.get("properties") or {})
        ht = _huella_tipo_desde_feature(f)
        props.update({
            "origen": "reporte_dibujo",
            "reporte_id": reporte_id,
            "precision": props.get("precision") or "precisa",
            "huella_tipo": ht,
            "dibujo_tipo": props.get("dibujo_tipo") or ht,
            "dibujo_parte": i,
        })
        out.append({
            "type": "Feature",
            "geometry": f.get("geometry"),
            "properties": props,
        })
    return out


def features_desde_huella_registro(huella_geojson, registro_id=None, reporte_id=None) -> List[dict]:
    """Features desde huella_geojson de un registro (fallback si el reporte no tiene dibujo)."""
    feats = _iter_features_dibujo(huella_geojson)
    out: List[dict] = []
    for i, f in enumerate(feats):
        props = dict(f.get("properties") or {})
        ht = _huella_tipo_desde_feature(f)
        props.update({
            "origen": props.get("origen") or "registro_huella",
            "registro_id": registro_id,
            "reporte_id": reporte_id if reporte_id is not None else props.get("reporte_id"),
            "precision": props.get("precision") or "precisa",
            "huella_tipo": ht,
            "dibujo_tipo": props.get("dibujo_tipo") or ht,
            "dibujo_parte": i,
        })
        out.append({
            "type": "Feature",
            "geometry": f.get("geometry"),
            "properties": props,
        })
    return out


def build_dibujos_mapa_calor(
    registros: List[dict],
    reporte_map: dict,
    *,
    heat_features: Optional[List[dict]] = None,
) -> dict:
    """
    FeatureCollection de dibujos del conjunto filtrado para ClaraGIS.

    Preferencia:
    1) dibujo_geojson / perimetro_geojson del reporte (botón Dibujar)
    2) huella_geojson del registro (propagación / dibujo masivo)

    Un reporte con dibujo aporta una sola geometría (o FC completo) asociada a
    `reporte_id`; no se duplica por cada ítem del reporte.
    """
    heat_by_reg: Dict[str, dict] = {}
    for f in heat_features or []:
        p = (f or {}).get("properties") or {}
        rid = p.get("id")
        if rid is None:
            continue
        heat_by_reg[str(rid)] = p

    regs_by_rep: Dict[str, List[dict]] = {}
    for r in registros or []:
        rid_rep = r.get("reporte_id")
        if rid_rep is None:
            continue
        regs_by_rep.setdefault(str(rid_rep), []).append(r)

    seen_reps: set = set()
    features: List[dict] = []

    for r in registros or []:
        rid_rep = r.get("reporte_id")
        if rid_rep is None:
            continue
        rep_key = str(rid_rep)
        if rep_key in seen_reps:
            continue
        seen_reps.add(rep_key)

        rep = reporte_map.get(rid_rep) or reporte_map.get(rep_key) or {}
        dg = rep.get("dibujo_geojson") or rep.get("perimetro_geojson")
        peers = regs_by_rep.get(rep_key) or [r]

        # Peso = máximo de los registros filtrados del reporte (calor relativo)
        max_w = 0.05
        max_costo = 0.0
        for peer in peers:
            pid = peer.get("id")
            hp = heat_by_reg.get(str(pid)) if pid is not None else None
            if hp:
                try:
                    max_w = max(max_w, float(hp.get("weight") or 0.05))
                except (TypeError, ValueError):
                    pass
                try:
                    max_costo = max(max_costo, float(hp.get("costo_directo") or 0))
                except (TypeError, ValueError):
                    pass
            else:
                try:
                    max_costo = max(max_costo, float(peer.get("costo_directo") or 0))
                except (TypeError, ValueError):
                    pass

        if _reporte_geojson_tiene_dibujo(dg):
            for feat in features_desde_dibujo_reporte(dg, rid_rep):
                props = dict(feat.get("properties") or {})
                props.update({
                    "weight": max_w,
                    "costo_directo": max_costo,
                    "tiene_dibujo": 1,
                    "color_mode": "calor",
                    "sin_dibujo": 0,
                    # ancla al primer registro filtrado (click / foco)
                    "registro_id": peers[0].get("id"),
                    "id": peers[0].get("id"),
                })
                features.append({**feat, "properties": props})
            continue

        # Fallback: huellas de registros del reporte (sin dibujo de cabecera)
        for peer in peers:
            hg = peer.get("huella_geojson")
            if not hg:
                continue
            for feat in features_desde_huella_registro(
                hg, registro_id=peer.get("id"), reporte_id=rid_rep
            ):
                props = dict(feat.get("properties") or {})
                hp = heat_by_reg.get(str(peer.get("id"))) if peer.get("id") is not None else None
                w = 0.05
                costo = 0.0
                if hp:
                    try:
                        w = float(hp.get("weight") or 0.05)
                    except (TypeError, ValueError):
                        w = 0.05
                    try:
                        costo = float(hp.get("costo_directo") or 0)
                    except (TypeError, ValueError):
                        costo = 0.0
                else:
                    try:
                        costo = float(peer.get("costo_directo") or 0)
                    except (TypeError, ValueError):
                        costo = 0.0
                props.update({
                    "weight": w,
                    "costo_directo": costo,
                    "tiene_dibujo": 1,
                    "color_mode": "calor",
                    "sin_dibujo": 0,
                    "registro_id": peer.get("id"),
                    "id": peer.get("id"),
                })
                features.append({**feat, "properties": props})

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "total": len(features),
            "reportes_con_dibujo": len({
                str((f.get("properties") or {}).get("reporte_id"))
                for f in features
                if (f.get("properties") or {}).get("origen") == "reporte_dibujo"
            }),
        },
    }


def build_mapa_calor_geojson(
    registros: List[dict],
    reporte_map: dict,
    *,
    max_features: int = SICOE_MAPA_CALOR_MAX_FEATURES,
    incluir_dibujos: bool = False,
) -> dict:
    """
    FeatureCollection de puntos ponderados por costo_directo.

    La intensidad (weight) es siempre relativa al conjunto `registros` recibido
    (ya filtrado por el caller): max(costo_directo) de ese conjunto = weight 1.0.
    No usa un máximo absoluto del contrato ni de otra consulta.

    Preferencia de coords: registro; fallback: reporte (loc. única).

    Si `incluir_dibujos`, añade clave `dibujos` con el FC de geometrías del
    botón Dibujar / huellas del conjunto filtrado (ClaraGIS).
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
        rep = reporte_map.get(r.get("reporte_id")) or reporte_map.get(str(r.get("reporte_id") or "")) or {}
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

    out = {
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
    if incluir_dibujos:
        out["dibujos"] = build_dibujos_mapa_calor(
            registros, reporte_map, heat_features=features
        )
        out["meta"]["con_dibujo"] = out["dibujos"]["meta"].get("total", 0)
        out["meta"]["reportes_con_dibujo"] = out["dibujos"]["meta"].get(
            "reportes_con_dibujo", 0
        )
    return out
