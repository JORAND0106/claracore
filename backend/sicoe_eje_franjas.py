"""
Eje desde abscisado + franjas lineales (SicoeObra).
Misma semántica que frontend/src/modules/sicoe-obra/sicoeEjeFranjas.js.
"""
from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Tuple

SICOE_TOLERANCIA_UBICACION_DEFAULT_M = 1.0
SICOE_TOLERANCIA_UBICACION_MIN_M = 0.1
SICOE_EJE_MAX_DIST_PROYECCION_M = 30.0
SICOE_FRANJA_ANCHO_DEFAULT_M = 0.6
SICOE_FRANJA_OFFSET_COSTADO_M = 2.0

SICOE_AUDITORIA_JUSTIFICACIONES_UBICACION = (
    "Coordenada de referencia del PK, no del elemento",
    "Abscisado del plano desactualizado",
    "Elemento en curva compleja",
    "Error de digitación corregido en campo",
)

SICOE_AUDITORIA_JUSTIFICACIONES_COSTADO = (
    "Costado reportado según calzada de cobro",
    "Eje del plano no coincide con el eje de obra",
    "Elemento central / sobre el eje",
    "Error de digitación corregido en campo",
)

_EARTH_R = 6371000.0


def _txt(v: Any) -> str:
    return str(v or "").strip()


def normalizar_tolerancia_ubicacion_m(raw: Any) -> float:
    if raw is None or raw == "":
        return SICOE_TOLERANCIA_UBICACION_DEFAULT_M
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return SICOE_TOLERANCIA_UBICACION_DEFAULT_M
    if not math.isfinite(v):
        return SICOE_TOLERANCIA_UBICACION_DEFAULT_M
    return max(SICOE_TOLERANCIA_UBICACION_MIN_M, v)


def abscisa_a_metros(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)) and math.isfinite(float(val)):
        return float(val)
    s = str(val).strip().replace(",", ".")
    km = re.match(r"^(\d+)\+(\d+(?:\.\d+)?)$", s)
    if km:
        return int(km.group(1)) * 1000 + float(km.group(2))
    try:
        n = float(s)
    except ValueError:
        return None
    return n if math.isfinite(n) else None


def haversine_m(a: dict, b: dict) -> float:
    lat1 = math.radians(float(a["lat"]))
    lat2 = math.radians(float(b["lat"]))
    dlat = lat2 - lat1
    dlng = math.radians(float(b["lng"]) - float(a["lng"]))
    s = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * _EARTH_R * math.asin(min(1.0, math.sqrt(s)))


def bearing_deg(a: dict, b: dict) -> float:
    lat1 = math.radians(float(a["lat"]))
    lat2 = math.radians(float(b["lat"]))
    dlng = math.radians(float(b["lng"]) - float(a["lng"]))
    y = math.sin(dlng) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def destination_point(lng: float, lat: float, bearing: float, dist_m: float) -> dict:
    br = math.radians(float(bearing))
    ang = float(dist_m) / _EARTH_R
    lat1 = math.radians(float(lat))
    lng1 = math.radians(float(lng))
    lat2 = math.asin(math.sin(lat1) * math.cos(ang) + math.cos(lat1) * math.sin(ang) * math.cos(br))
    lng2 = lng1 + math.atan2(
        math.sin(br) * math.sin(ang) * math.cos(lat1),
        math.cos(ang) - math.sin(lat1) * math.sin(lat2),
    )
    return {"lng": math.degrees(lng2), "lat": math.degrees(lat2)}


def lado_relativo(a: dict, b: dict, p: dict) -> str:
    ax = float(b["lng"]) - float(a["lng"])
    ay = float(b["lat"]) - float(a["lat"])
    bx = float(p["lng"]) - float(a["lng"])
    by = float(p["lat"]) - float(a["lat"])
    cross = ax * by - ay * bx
    if abs(cross) < 1e-14:
        return "central"
    return "izquierda" if cross > 0 else "derecha"


def normalizar_costado_digitado(raw: Any) -> str:
    s = _txt(raw).casefold()
    # quitar acentos básicos
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ü", "u")):
        s = s.replace(a, b)
    if not s:
        return ""
    if s.startswith("izq") or s == "i" or "left" in s:
        return "izquierda"
    if s.startswith("der") or s == "d" or "right" in s:
        return "derecha"
    if s.startswith("cent") or s.startswith("unic") or s == "c" or "eje" in s:
        return "central"
    return s


def costados_coinciden(digitado: Any, real: Any) -> bool:
    a = normalizar_costado_digitado(digitado)
    b = normalizar_costado_digitado(real)
    if not a or not b:
        return True
    if a == "central" or b == "central":
        return True
    return a == b


def indice_abscisas_desde_plano(fc: Optional[dict]) -> List[dict]:
    feats = (fc or {}).get("features") or []
    out: List[dict] = []
    for f in feats:
        geom = f.get("geometry") or {}
        gt = geom.get("type")
        if gt not in ("Point", "MultiPoint"):
            continue
        props = f.get("properties") or {}
        et = _txt(props.get("etiqueta") or props.get("Etiqueta"))
        m = abscisa_a_metros(et)
        if m is None:
            continue
        coords = geom.get("coordinates")
        if gt == "Point":
            lng, lat = (coords or [None, None])[0], (coords or [None, None])[1]
        else:
            first = (coords or [[None, None]])[0]
            lng, lat = first[0], first[1]
        try:
            lng_f, lat_f = float(lng), float(lat)
        except (TypeError, ValueError):
            continue
        if not (math.isfinite(lng_f) and math.isfinite(lat_f)):
            continue
        out.append({"m": m, "lng": lng_f, "lat": lat_f, "etiqueta": et})
    out.sort(key=lambda p: p["m"])
    return out


def reconstruir_ejes_desde_indice(
    indice: List[dict],
    *,
    max_factor: float = 4.0,
    min_gap_m: float = 35.0,
) -> List[dict]:
    pts = list(indice or [])
    if len(pts) < 2:
        return []
    ejes: List[dict] = []
    cur = [pts[0]]
    for p in pts[1:]:
        prev = cur[-1]
        dm = abs(float(p["m"]) - float(prev["m"]))
        dist = haversine_m(prev, p)
        limite = max(min_gap_m, dm * max_factor)
        if dm > 15 and dist > limite:
            if len(cur) >= 2:
                ejes.append({"id": len(ejes), "puntos": cur})
            cur = [p]
        else:
            cur.append(p)
    if len(cur) >= 2:
        ejes.append({"id": len(ejes), "puntos": cur})
    return ejes


def reconstruir_ejes_desde_plano(fc: Optional[dict], **opts) -> List[dict]:
    return reconstruir_ejes_desde_indice(indice_abscisas_desde_plano(fc), **opts)


def _closest_on_segment(a: dict, b: dict, p: dict) -> dict:
    ax, ay = float(a["lng"]), float(a["lat"])
    bx, by = float(b["lng"]), float(b["lat"])
    px, py = float(p["lng"]), float(p["lat"])
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    ab2 = abx * abx + aby * aby
    t = (apx * abx + apy * aby) / ab2 if ab2 > 0 else 0.0
    t = max(0.0, min(1.0, t))
    lng = ax + t * abx
    lat = ay + t * aby
    proj = {"lng": lng, "lat": lat}
    dist = haversine_m(p, proj)
    m = float(a["m"]) + t * (float(b["m"]) - float(a["m"]))
    return {
        "lng": lng,
        "lat": lat,
        "m": m,
        "dist_m": dist,
        "lado": lado_relativo(a, b, p),
        "t": t,
    }


def proyectar_sobre_eje(
    ejes: List[dict],
    lng: float,
    lat: float,
    *,
    max_dist_m: float = SICOE_EJE_MAX_DIST_PROYECCION_M,
) -> Optional[dict]:
    if not (math.isfinite(lng) and math.isfinite(lat)):
        return None
    p = {"lng": lng, "lat": lat}
    best = None
    for eje in ejes or []:
        pts = eje.get("puntos") or []
        for i in range(len(pts) - 1):
            cand = _closest_on_segment(pts[i], pts[i + 1], p)
            if best is None or cand["dist_m"] < best["dist_m"]:
                best = {**cand, "eje_id": eje.get("id")}
    if best is None:
        return None
    return {
        "abs_m": best["m"],
        "dist_m": best["dist_m"],
        "lado": best["lado"],
        "lng": best["lng"],
        "lat": best["lat"],
        "eje_id": best["eje_id"],
        "sobre_eje": best["dist_m"] <= max_dist_m,
    }


def _interp_abs_en_eje(eje: dict, metros: float) -> Optional[dict]:
    pts = (eje or {}).get("puntos") or []
    if len(pts) < 2 or metros is None or not math.isfinite(metros):
        return None
    if metros <= pts[0]["m"]:
        return {
            "lng": pts[0]["lng"],
            "lat": pts[0]["lat"],
            "bearing": bearing_deg(pts[0], pts[1]),
        }
    last = pts[-1]
    if metros >= last["m"]:
        return {
            "lng": last["lng"],
            "lat": last["lat"],
            "bearing": bearing_deg(pts[-2], last),
        }
    lo, hi = 0, len(pts) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if pts[mid]["m"] <= metros:
            lo = mid
        else:
            hi = mid
    a, b = pts[lo], pts[hi]
    t = 0.0 if a["m"] == b["m"] else (metros - a["m"]) / (b["m"] - a["m"])
    return {
        "lng": a["lng"] + t * (b["lng"] - a["lng"]),
        "lat": a["lat"] + t * (b["lat"] - a["lat"]),
        "bearing": bearing_deg(a, b),
    }


def _sample_abs_range(eje: dict, abs0: float, abs1: float, step_m: float = 5.0) -> List[dict]:
    lo, hi = min(abs0, abs1), max(abs0, abs1)
    out: List[dict] = []
    step = max(1.0, float(step_m or 5))
    m = lo
    while m <= hi + 1e-9:
        p = _interp_abs_en_eje(eje, min(m, hi))
        if p:
            out.append({"m": min(m, hi), **p})
        m += step
    end = _interp_abs_en_eje(eje, hi)
    if end and (not out or abs(out[-1]["m"] - hi) > 1e-6):
        out.append({"m": hi, **end})
    return out


def _offset_bearing_for_lado(bearing: float, lado: str) -> float:
    l = normalizar_costado_digitado(lado) or "central"
    if l == "central":
        return bearing
    if l == "izquierda":
        return (bearing + 270.0) % 360.0
    return (bearing + 90.0) % 360.0


def construir_franja_polygon(
    *,
    eje: dict,
    abs_inicio: float,
    abs_final: float,
    dist_ini: float = 0.0,
    dist_fin: float = 0.0,
    ancho: float = SICOE_FRANJA_ANCHO_DEFAULT_M,
    lado: str = "central",
    step_m: float = 5.0,
) -> Optional[dict]:
    if not eje or abs_inicio is None or abs_final is None:
        return None
    a0, a1 = float(abs_inicio), float(abs_final)
    if not (math.isfinite(a0) and math.isfinite(a1)) or abs(a1 - a0) < 1e-6:
        return None
    samples = _sample_abs_range(eje, a0, a1, step_m)
    if len(samples) < 2:
        return None
    half = max(0.15, float(ancho or SICOE_FRANJA_ANCHO_DEFAULT_M) / 2.0)
    left: List[dict] = []
    right: List[dict] = []
    n = len(samples)
    for i, s in enumerate(samples):
        t = 0.0 if n == 1 else i / (n - 1)
        dist_centro = float(dist_ini) + t * (float(dist_fin) - float(dist_ini))
        br_lado = _offset_bearing_for_lado(s["bearing"], lado)
        if abs(dist_centro) < 1e-9 or normalizar_costado_digitado(lado) == "central":
            centro = {"lng": s["lng"], "lat": s["lat"]}
        else:
            centro = destination_point(s["lng"], s["lat"], br_lado, abs(dist_centro))
        left.append(destination_point(centro["lng"], centro["lat"], (s["bearing"] + 270) % 360, half))
        right.append(destination_point(centro["lng"], centro["lat"], (s["bearing"] + 90) % 360, half))
    ring = [[p["lng"], p["lat"]] for p in left] + [[p["lng"], p["lat"]] for p in reversed(right)]
    if ring:
        ring.append(ring[0])
    if len(ring) < 4:
        return None
    return {"type": "Polygon", "coordinates": [ring]}


def _parse_coord_pair(lat: Any, lng: Any) -> Optional[dict]:
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


def analizar_registro_franja(
    registro: dict,
    ejes: List[dict],
    *,
    tolerancia_ubicacion_m: float = SICOE_TOLERANCIA_UBICACION_DEFAULT_M,
    max_dist_proyeccion_m: float = SICOE_EJE_MAX_DIST_PROYECCION_M,
) -> dict:
    tol = normalizar_tolerancia_ubicacion_m(tolerancia_ubicacion_m)
    reg = registro or {}
    abs_ini = abscisa_a_metros(reg.get("abs_inicio"))
    abs_fin = abscisa_a_metros(reg.get("abs_final"))
    try:
        ancho = float(reg.get("ancho") or 0)
    except (TypeError, ValueError):
        ancho = 0.0
    if ancho <= 0:
        ancho = SICOE_FRANJA_ANCHO_DEFAULT_M
    costado_dig = reg.get("margen") or reg.get("calzada") or ""

    p_ini = _parse_coord_pair(reg.get("coord_lat"), reg.get("coord_lng"))
    p_fin = _parse_coord_pair(reg.get("coord_lat_fin"), reg.get("coord_lng_fin"))

    empty = {
        "ok": False,
        "precision": None,
        "huella": None,
        "hallazgos": [],
        "proyecciones": {},
        "semaforo": "verde",
        "tolerancia_m": tol,
    }
    if not ejes or abs_ini is None or abs_fin is None:
        return empty

    proy_ini = proy_fin = None
    eje = None
    if p_ini:
        proy_ini = proyectar_sobre_eje(ejes, p_ini["lng"], p_ini["lat"], max_dist_m=max_dist_proyeccion_m)
        if proy_ini:
            eje = next((e for e in ejes if e.get("id") == proy_ini.get("eje_id")), None)
    if p_fin:
        proy_fin = proyectar_sobre_eje(ejes, p_fin["lng"], p_fin["lat"], max_dist_m=max_dist_proyeccion_m)
        if eje is None and proy_fin:
            eje = next((e for e in ejes if e.get("id") == proy_fin.get("eje_id")), None)
    if eje is None:
        for e in ejes:
            ms = [p["m"] for p in (e.get("puntos") or [])]
            if not ms:
                continue
            lo, hi = min(ms), max(ms)
            if min(abs_ini, abs_fin) >= lo - 1 and max(abs_ini, abs_fin) <= hi + 1:
                eje = e
                break
        if eje is None:
            eje = ejes[0]

    def _mk(tipo: str, texto: str, medida: Optional[float] = None) -> dict:
        return {
            "tipo": tipo,
            "texto": texto,
            "medida_m": medida,
            "abs_desde": abs_ini,
            "abs_hasta": abs_fin,
            "valor_en_juego": 0.0,
            "item_numero": _txt(reg.get("item_numero")),
            "tramo": _txt(reg.get("tramo")),
            "infraestructura": _txt(reg.get("infraestructura")),
            "costado": _txt(costado_dig),
            "pk_id_id": reg.get("pk_id_id"),
            "ubicacion": f"{abs_ini} – {abs_fin}",
            "registros_involucrados": [
                {
                    "id": reg.get("id"),
                    "numero_registro": reg.get("numero_registro"),
                    "reporte_id": reg.get("reporte_id"),
                    "item_numero": reg.get("item_numero"),
                    "pk_id_id": reg.get("pk_id_id"),
                    "abs_inicio": abs_ini,
                    "abs_final": abs_fin,
                }
            ],
        }

    hallazgos: List[dict] = []
    precision = "aproximada"
    dist_ini = SICOE_FRANJA_OFFSET_COSTADO_M
    dist_fin = SICOE_FRANJA_OFFSET_COSTADO_M
    lado_franja = normalizar_costado_digitado(costado_dig) or "central"
    if lado_franja == "central":
        dist_ini = dist_fin = 0.0

    tiene_coords = bool(p_ini or p_fin)
    coords_sobre_eje = True

    if p_ini and proy_ini:
        if not proy_ini["sobre_eje"]:
            coords_sobre_eje = False
            hallazgos.append(
                _mk(
                    "ubicacion_inconsistente",
                    f"Ubicación inconsistente · coord. inicio a {proy_ini['dist_m']:.1f} m del eje",
                    round(proy_ini["dist_m"], 2),
                )
            )
        else:
            ref_abs = (
                abs_ini
                if p_fin
                else (
                    abs_ini
                    if abs(proy_ini["abs_m"] - abs_ini) <= abs(proy_ini["abs_m"] - abs_fin)
                    else abs_fin
                )
            )
            delta = abs(proy_ini["abs_m"] - ref_abs)
            if delta > tol:
                hallazgos.append(
                    _mk(
                        "ubicacion_inconsistente",
                        f"Ubicación inconsistente · abscisa real {proy_ini['abs_m']:.1f} vs digitada {ref_abs} (Δ {delta:.1f} m)",
                        round(delta, 2),
                    )
                )
            if not costados_coinciden(costado_dig, proy_ini["lado"]):
                hallazgos.append(
                    _mk(
                        "costado_inconsistente",
                        f"Costado inconsistente · real {proy_ini['lado']} vs digitado {costado_dig or '—'}",
                    )
                )
            dist_ini = float(proy_ini["dist_m"])
            if proy_ini["lado"] != "central":
                lado_franja = proy_ini["lado"]

    if p_fin and proy_fin:
        if not proy_fin["sobre_eje"]:
            coords_sobre_eje = False
            hallazgos.append(
                _mk(
                    "ubicacion_inconsistente",
                    f"Ubicación inconsistente · coord. fin a {proy_fin['dist_m']:.1f} m del eje",
                    round(proy_fin["dist_m"], 2),
                )
            )
        else:
            delta = abs(proy_fin["abs_m"] - abs_fin)
            if delta > tol:
                hallazgos.append(
                    _mk(
                        "ubicacion_inconsistente",
                        f"Ubicación inconsistente · abscisa fin real {proy_fin['abs_m']:.1f} vs digitada {abs_fin} (Δ {delta:.1f} m)",
                        round(delta, 2),
                    )
                )
            if not costados_coinciden(costado_dig, proy_fin["lado"]):
                hallazgos.append(
                    _mk(
                        "costado_inconsistente",
                        f"Costado inconsistente · fin real {proy_fin['lado']} vs digitado {costado_dig or '—'}",
                    )
                )
            dist_fin = float(proy_fin["dist_m"])
            if not p_ini and proy_fin["lado"] != "central":
                lado_franja = proy_fin["lado"]

    if tiene_coords and coords_sobre_eje and (
        (proy_ini and proy_ini.get("sobre_eje")) or (proy_fin and proy_fin.get("sobre_eje"))
    ):
        precision = "precisa"
        if p_ini and proy_ini and proy_ini.get("sobre_eje") and not (
            p_fin and proy_fin and proy_fin.get("sobre_eje")
        ):
            dist_fin = dist_ini
        if p_fin and proy_fin and proy_fin.get("sobre_eje") and not (
            p_ini and proy_ini and proy_ini.get("sobre_eje")
        ):
            dist_ini = dist_fin
    else:
        precision = "aproximada"
        if lado_franja == "central":
            dist_ini = dist_fin = 0.0
        else:
            dist_ini = dist_fin = SICOE_FRANJA_OFFSET_COSTADO_M

    geom = construir_franja_polygon(
        eje=eje,
        abs_inicio=abs_ini,
        abs_final=abs_fin,
        dist_ini=dist_ini,
        dist_fin=dist_fin,
        ancho=ancho,
        lado=lado_franja,
    )
    huella = None
    if geom:
        huella = {
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "registro_id": reg.get("id"),
                "numero_registro": reg.get("numero_registro"),
                "reporte_id": reg.get("reporte_id"),
                "item_numero": reg.get("item_numero"),
                "precision": precision,
                "abs_inicio": abs_ini,
                "abs_final": abs_fin,
                "costado": costado_dig or None,
                "lado": lado_franja,
                "ancho": ancho,
            },
        }

    return {
        "ok": True,
        "precision": precision,
        "huella": huella,
        "hallazgos": hallazgos,
        "proyecciones": {"inicio": proy_ini, "fin": proy_fin},
        "semaforo": "amarillo" if hallazgos else "verde",
        "tolerancia_m": tol,
    }


def ejes_to_geojson(ejes: List[dict]) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"eje_id": e.get("id"), "tipo": "eje_abscisado"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[p["lng"], p["lat"]] for p in (e.get("puntos") or [])],
                },
            }
            for e in (ejes or [])
        ],
    }
