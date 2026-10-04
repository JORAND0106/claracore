"""
Dibujos de reportes → auditoría + nodo contenedor (SicoeObra).

- Nodo contenedor: un punto en el plano aloaja N reportes dentro del radio del contrato.
- Hallazgos desde dibujo: traslapo (mismo ítem), cantidad > área, abscisa/costado/PK-ID.
- Conserva fingerprints/canonización del motor de hallazgos existente.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from sicoe_auditoria_traslapos import canonizar_hallazgo
from sicoe_eje_franjas import (
    abscisa_a_metros,
    analizar_registro_franja,
    haversine_m,
    normalizar_costado_digitado,
    proyectar_sobre_eje,
)
from sicoe_huellas_espacial import (
    SICOE_RADIO_NODO_DEFAULT_M,
    area_poligono_m2,
    interseccion_poligonos_m2,
    normalizar_radio_nodo_m,
    punto_en_poligono,
)


def _txt(v: Any) -> str:
    return str(v or "").strip()


def centro_desde_feature(feat: Optional[dict]) -> Optional[dict]:
    """Centro lng/lat de una Feature de huella (nodo/línea/polígono)."""
    if not isinstance(feat, dict):
        return None
    g = feat.get("geometry") if feat.get("type") == "Feature" else feat
    if not isinstance(g, dict):
        return None
    t = g.get("type")
    coords = g.get("coordinates")
    if t == "Point" and isinstance(coords, (list, tuple)) and len(coords) >= 2:
        return {"lng": float(coords[0]), "lat": float(coords[1])}
    props = feat.get("properties") if feat.get("type") == "Feature" else {}
    centro = (props or {}).get("centro")
    if isinstance(centro, (list, tuple)) and len(centro) >= 2:
        try:
            return {"lng": float(centro[0]), "lat": float(centro[1])}
        except (TypeError, ValueError):
            pass
    if t == "Polygon" and coords and coords[0]:
        ring = coords[0]
        n = 0
        sx = sy = 0.0
        for c in ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring:
            if not isinstance(c, (list, tuple)) or len(c) < 2:
                continue
            sx += float(c[0])
            sy += float(c[1])
            n += 1
        if n:
            return {"lng": sx / n, "lat": sy / n}
    if t == "LineString" and isinstance(coords, list) and len(coords) >= 2:
        mid = coords[len(coords) // 2]
        if isinstance(mid, (list, tuple)) and len(mid) >= 2:
            return {"lng": float(mid[0]), "lat": float(mid[1])}
    if t == "MultiPolygon" and coords:
        # primer polígono
        return centro_desde_feature({"type": "Polygon", "coordinates": coords[0]})
    return None


def dibujo_tipo_desde_feature(feat: Optional[dict]) -> str:
    if not isinstance(feat, dict):
        return ""
    props = feat.get("properties") or {}
    t = _txt(props.get("dibujo_tipo") or props.get("huella_tipo")).casefold()
    if t in ("nodo", "punto", "point"):
        return "nodo"
    if t in ("linea", "línea", "line", "franja"):
        return "linea"
    if t in ("poligono", "polígono", "area", "área", "polygon"):
        return "poligono"
    g = (feat.get("geometry") or {}).get("type")
    if g == "Point":
        return "nodo"
    if g in ("LineString", "MultiLineString"):
        return "linea"
    if g in ("Polygon", "MultiPolygon"):
        return "poligono"
    return ""


def longitud_linestring_m(coords: List) -> float:
    total = 0.0
    for i in range(1, len(coords or [])):
        a, b = coords[i - 1], coords[i]
        if not (isinstance(a, (list, tuple)) and isinstance(b, (list, tuple))):
            continue
        if len(a) < 2 or len(b) < 2:
            continue
        total += haversine_m({"lng": a[0], "lat": a[1]}, {"lng": b[0], "lat": b[1]})
    return total


def interseccion_lineas_aprox_m(coords_a: List, coords_b: List, step_m: float = 1.0) -> float:
    """
    Longitud aproximada de solape entre dos LineString:
    suma de muestras de A que caen a ≤ step_m/2 de B.
    """
    if not coords_a or not coords_b or len(coords_a) < 2 or len(coords_b) < 2:
        return 0.0
    step = max(0.5, float(step_m) or 1.0)
    # Densificar A
    samples = [coords_a[0]]
    for i in range(1, len(coords_a)):
        a, b = coords_a[i - 1], coords_a[i]
        if len(a) < 2 or len(b) < 2:
            continue
        d = haversine_m({"lng": a[0], "lat": a[1]}, {"lng": b[0], "lat": b[1]})
        n = max(1, int(math.ceil(d / step)))
        for k in range(1, n + 1):
            t = k / n
            samples.append([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    hit = 0
    thr = step * 0.55
    for s in samples:
        p = {"lng": s[0], "lat": s[1]}
        best = 1e18
        for j in range(1, len(coords_b)):
            c0, c1 = coords_b[j - 1], coords_b[j]
            if len(c0) < 2 or len(c1) < 2:
                continue
            # distancia aprox al segmento (muestreo 3 puntos)
            for t in (0.0, 0.5, 1.0):
                q = {
                    "lng": c0[0] + t * (c1[0] - c0[0]),
                    "lat": c0[1] + t * (c1[1] - c0[1]),
                }
                best = min(best, haversine_m(p, q))
        if best <= thr:
            hit += 1
    if hit <= 1:
        return 0.0
    return round((hit - 1) * step, 2)


def geometry_coords(feat: Optional[dict]) -> Tuple[str, Any]:
    if not isinstance(feat, dict):
        return "", None
    g = feat.get("geometry") if feat.get("type") == "Feature" else feat
    if not isinstance(g, dict):
        return "", None
    return str(g.get("type") or ""), g.get("coordinates")


def cluster_puntos_por_radio(
    puntos: List[dict],
    radio_m: float = SICOE_RADIO_NODO_DEFAULT_M,
) -> List[List[dict]]:
    """
    Agrupa puntos (cada uno con lat/lng y clave opcional) en clusters ≤ radio.
    Greedy: el primero ancla el cluster.
    """
    radio = normalizar_radio_nodo_m(radio_m)
    pending = [p for p in (puntos or []) if p and p.get("lat") is not None and p.get("lng") is not None]
    clusters: List[List[dict]] = []
    while pending:
        seed = pending.pop(0)
        group = [seed]
        rest = []
        for p in pending:
            d = haversine_m(
                {"lat": float(seed["lat"]), "lng": float(seed["lng"])},
                {"lat": float(p["lat"]), "lng": float(p["lng"])},
            )
            if d <= radio:
                group.append(p)
            else:
                rest.append(p)
        pending = rest
        clusters.append(group)
    return clusters


def _mk_hallazgo(tipo: str, texto: str, regs: List[dict], **extra) -> dict:
    inv = []
    for r in regs or []:
        if not r:
            continue
        inv.append({
            "id": r.get("id"),
            "numero_registro": r.get("numero_registro"),
            "reporte_id": r.get("reporte_id"),
            "item_numero": r.get("item_numero"),
            "pk_id_id": r.get("pk_id_id"),
            "abs_inicio": r.get("abs_inicio"),
            "abs_final": r.get("abs_final"),
        })
    base = regs[0] if regs else {}
    h = {
        "tipo": tipo,
        "texto": texto,
        "item_numero": _txt(base.get("item_numero")) or extra.get("item_numero"),
        "tramo": _txt(base.get("tramo")),
        "infraestructura": _txt(base.get("infraestructura")),
        "costado": _txt(base.get("margen") or base.get("calzada") or base.get("costado")),
        "ubicacion": extra.get("ubicacion"),
        "medida_m": extra.get("medida_m"),
        "abs_desde": abscisa_a_metros(base.get("abs_inicio")),
        "abs_hasta": abscisa_a_metros(base.get("abs_final")),
        "pk_id_id": base.get("pk_id_id"),
        "valor_en_juego": float(extra.get("valor_en_juego") or 0),
        "registros_involucrados": inv,
    }
    for k, v in extra.items():
        if k not in h and v is not None:
            h[k] = v
    return canonizar_hallazgo(h)


def hallazgos_traslapo_nodo_contenedor(
    reportes_en_contenedor: List[dict],
    registros_por_reporte: Dict[Any, List[dict]],
) -> List[dict]:
    """
    Mismo ítem en dos reportes alojados en el mismo nodo contenedor → traslapo.
    Ítems distintos no generan hallazgo.
    """
    # item -> list of (reporte, registros con ese ítem)
    by_item: Dict[str, List[Tuple[dict, List[dict]]]] = {}
    for rep in reportes_en_contenedor or []:
        rid = rep.get("id")
        regs = list(registros_por_reporte.get(rid) or registros_por_reporte.get(str(rid)) or [])
        items_seen = {}
        for r in regs:
            item = _txt(r.get("item_numero"))
            if not item:
                continue
            items_seen.setdefault(item, []).append(r)
        for item, regs_item in items_seen.items():
            by_item.setdefault(item, []).append((rep, regs_item))

    out: List[dict] = []
    for item, groups in by_item.items():
        if len(groups) < 2:
            continue
        regs_all = []
        nums = []
        for rep, regs_item in groups:
            nums.append(str(rep.get("numero_reporte") or rep.get("id") or "?"))
            regs_all.extend(regs_item)
        out.append(
            _mk_hallazgo(
                "traslapo",
                f"Traslapo · ítem {item} en el mismo nodo (reportes {', '.join(nums)})",
                regs_all,
                item_numero=item,
                ubicacion="nodo contenedor",
            )
        )
    return out


def hallazgos_traslapo_dibujos_mismo_item(
    pares: List[Tuple[dict, dict, dict, dict, str, List[dict]]],
) -> List[dict]:
    """
    pares: (reporte_a, feat_a, reporte_b, feat_b, item, regs)
    Genera traslapo con medida (m o m²).
    """
    out: List[dict] = []
    for rep_a, feat_a, rep_b, feat_b, item, regs in pares:
        ta = dibujo_tipo_desde_feature(feat_a)
        tb = dibujo_tipo_desde_feature(feat_b)
        medida = None
        unidad = ""
        ga_t, ga_c = geometry_coords(feat_a)
        gb_t, gb_c = geometry_coords(feat_b)
        if ta == "poligono" and tb == "poligono" and ga_t == "Polygon" and gb_t == "Polygon":
            medida = interseccion_poligonos_m2(ga_c, gb_c)
            unidad = "m²"
            if not (medida and medida > 0.05):
                continue
            texto = (
                f"Traslapo · ítem {item}: dibujos se pisan {medida:.2f} m² "
                f"(reportes {rep_a.get('numero_reporte')}, {rep_b.get('numero_reporte')})"
            )
        elif ta == "linea" and tb == "linea" and ga_t == "LineString" and gb_t == "LineString":
            medida = interseccion_lineas_aprox_m(ga_c, gb_c)
            unidad = "m"
            if not (medida and medida > 0.5):
                continue
            texto = (
                f"Traslapo · ítem {item}: dibujos se pisan {medida:.2f} m "
                f"(reportes {rep_a.get('numero_reporte')}, {rep_b.get('numero_reporte')})"
            )
        else:
            continue
        out.append(
            _mk_hallazgo(
                "traslapo",
                texto,
                regs,
                item_numero=item,
                medida_m=round(float(medida), 2),
                ubicacion=f"solape dibujo ({unidad})",
            )
        )
    return out


def hallazgos_cantidad_mayor_area_dibujo(
    reporte: dict,
    feat: dict,
    registros: List[dict],
) -> List[dict]:
    """Cantidad cobrada (m²) > área del polígono dibujado."""
    if dibujo_tipo_desde_feature(feat) != "poligono":
        return []
    g_t, g_c = geometry_coords(feat)
    if g_t != "Polygon" or not g_c:
        return []
    area = area_poligono_m2(g_c)
    if not (area > 0):
        return []
    out = []
    # Agrupar cantidad por ítem
    by_item: Dict[str, List[dict]] = {}
    for r in registros or []:
        item = _txt(r.get("item_numero"))
        if not item:
            continue
        unidad = _txt(r.get("unidad")).casefold().replace("²", "2")
        if "m2" not in unidad and unidad not in ("m2", "m²"):
            continue
        by_item.setdefault(item, []).append(r)
    for item, regs in by_item.items():
        total = 0.0
        for r in regs:
            try:
                total += float(r.get("cantidad_total") or 0)
            except (TypeError, ValueError):
                pass
        if total > area + 0.05:
            out.append(
                _mk_hallazgo(
                    "cantidad_mayor_area",
                    f"Cantidad mayor al área · ítem {item}: {total:.2f} m² > {area:.2f} m² dibujados",
                    regs,
                    item_numero=item,
                    medida_m=round(total - area, 2),
                    ubicacion=f"reporte #{reporte.get('numero_reporte')}",
                )
            )
    return out


def hallazgos_consistencia_dibujo_registro(
    registro: dict,
    feat: dict,
    *,
    ejes: Optional[List[dict]] = None,
    tolerancia_ubicacion_m: float = 1.0,
    pk_poligono: Optional[dict] = None,
) -> List[dict]:
    """
    Abscisa / costado / PK-ID inconsistentes respecto a donde cae el dibujo.
    Reutiliza semántica de franja cuando hay ejes; PK-ID si hay polígono oficial.
    """
    centro = centro_desde_feature(feat)
    if not centro:
        return []
    hallazgos: List[dict] = []
    tol = max(0.1, float(tolerancia_ubicacion_m or 1.0))

    # PK-ID: dibujo fuera del polígono del PK
    if pk_poligono and isinstance(pk_poligono, dict):
        g = pk_poligono.get("geometry") if pk_poligono.get("type") == "Feature" else pk_poligono
        if (g or {}).get("type") == "Polygon":
            if not punto_en_poligono(centro["lng"], centro["lat"], g.get("coordinates")):
                hallazgos.append(
                    _mk_hallazgo(
                        "ubicacion_inconsistente",
                        f"PK-ID inconsistente · dibujo fuera del polígono del PK {registro.get('pk_id_id')}",
                        [registro],
                        ubicacion=f"PK {registro.get('pk_id_id')}",
                    )
                )

    if not ejes:
        return hallazgos

    # Reusar analizar_registro_franja con coords del centro del dibujo
    reg_virtual = dict(registro or {})
    reg_virtual["coord_lat"] = centro["lat"]
    reg_virtual["coord_lng"] = centro["lng"]
    # Sin segundo punto: franja compara contra abs cercana
    try:
        fr = analizar_registro_franja(
            registro=reg_virtual,
            ejes=ejes,
            tolerancia_ubicacion_m=tol,
        )
        for h in fr.get("hallazgos") or []:
            tipo = _txt(h.get("tipo")).casefold()
            if tipo in ("ubicacion_inconsistente", "costado_inconsistente"):
                # Prefijo para dejar claro que viene del dibujo
                texto = _txt(h.get("texto"))
                if "dibujo" not in texto.casefold():
                    texto = texto.replace("Ubicación inconsistente", "Abscisa inconsistente · dibujo", 1)
                    if tipo == "costado_inconsistente" and "dibujo" not in texto.casefold():
                        texto = f"{texto} (según dibujo)"
                hallazgos.append(
                    _mk_hallazgo(
                        tipo,
                        texto,
                        [registro],
                        medida_m=h.get("medida_m"),
                        ubicacion=h.get("ubicacion"),
                    )
                )
    except Exception:
        # Fallback mínimo: proyección directa
        proy = proyectar_sobre_eje(ejes, centro["lng"], centro["lat"], max_dist_m=60)
        if proy and proy.get("sobre_eje"):
            abs_dig = abscisa_a_metros(registro.get("abs_inicio"))
            if abs_dig is not None:
                delta = abs(float(proy["abs_m"]) - float(abs_dig))
                if delta > tol:
                    hallazgos.append(
                        _mk_hallazgo(
                            "ubicacion_inconsistente",
                            f"Abscisa inconsistente · dibujo en {proy['abs_m']:.1f} vs digitada {abs_dig} (Δ {delta:.1f} m)",
                            [registro],
                            medida_m=round(delta, 2),
                        )
                    )
            costado = normalizar_costado_digitado(registro.get("margen") or registro.get("calzada"))
            lado = normalizar_costado_digitado(proy.get("lado"))
            if costado and lado and costado != "central" and lado != "central" and costado != lado:
                hallazgos.append(
                    _mk_hallazgo(
                        "costado_inconsistente",
                        f"Costado inconsistente · dibujo en {lado} vs digitado {costado}",
                        [registro],
                    )
                )
    return hallazgos


def mensaje_nodo_alojado(numero_reporte_existente: Any = None) -> str:
    if numero_reporte_existente is not None:
        return (
            f"Ya existe un nodo en ese punto (reporte #{numero_reporte_existente}). "
            "Este reporte quedó alojado en esa entidad."
        )
    return (
        "Ya existe un nodo en ese punto. "
        "Este reporte quedó alojado en la entidad existente."
    )


def elegir_contenedor_cercano(
    centro: dict,
    contenedores: List[dict],
    radio_m: float = SICOE_RADIO_NODO_DEFAULT_M,
) -> Optional[dict]:
    radio = normalizar_radio_nodo_m(radio_m)
    best = None
    best_d = None
    for c in contenedores or []:
        try:
            lat, lng = float(c["coord_lat"]), float(c["coord_lng"])
        except (KeyError, TypeError, ValueError):
            continue
        d = haversine_m(centro, {"lat": lat, "lng": lng})
        if d <= radio and (best_d is None or d < best_d):
            best = c
            best_d = d
    return best


def resumen_dibujos_contrato(reportes: List[dict], *, usuario_id: Any = None) -> dict:
    """Indicador: cuántos reportes tienen dibujo y cuántos no."""
    total = con = sin = 0
    mios_con = mios_sin = 0
    uid = str(usuario_id) if usuario_id is not None else None
    for r in reportes or []:
        total += 1
        tiene = bool(r.get("tiene_dibujo") or r.get("dibujo_geojson") or r.get("perimetro_geojson"))
        if tiene:
            con += 1
        else:
            sin += 1
        if uid is not None and str(r.get("creado_por") or r.get("dibujo_por") or "") == uid:
            if tiene:
                mios_con += 1
            else:
                mios_sin += 1
    return {
        "total_reportes": total,
        "con_dibujo": con,
        "sin_dibujo": sin,
        "usuario": {
            "con_dibujo": mios_con,
            "sin_dibujo": mios_sin,
        } if uid is not None else None,
    }
