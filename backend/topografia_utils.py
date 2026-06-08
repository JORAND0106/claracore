"""Utilidades de calculo y generacion de graficos para el modulo Topografia."""
from __future__ import annotations

import base64
import html
import io
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def gms_to_decimal(gms: float) -> float:
    """Convierte GG.MMSS (valor numerico) a grados decimales.

    Ej.: 270.0451 -> 270° 04' 51\". No redondear MM.SS como un solo decimal
    (4.51 minutos != 5 minutos).
    """
    gms = float(gms or 0)
    sign = -1.0 if gms < 0 else 1.0
    gms = abs(gms)
    grados = int(gms)
    frac = round(gms - grados, 8)
    mmss = round(frac * 100, 6)
    minutos = int(mmss)
    segundos = round((mmss - minutos) * 100, 4)
    if segundos >= 60:
        minutos += 1
        segundos -= 60
    if minutos >= 60:
        grados += 1
        minutos -= 60
    return sign * (grados + minutos / 60 + segundos / 3600)


def decimal_to_gms(decimal: float) -> str:
    """Convierte grados decimales a formato GG.MMSS legible."""
    grados = int(decimal)
    minutos_dec = (decimal - grados) * 60
    minutos = int(minutos_dec)
    segundos = round((minutos_dec - minutos) * 60, 2)
    return f"{grados}°{minutos:02d}'{segundos:05.2f}\""


def decimal_a_gms_numero(decimal: float) -> float:
    """Convierte grados decimales al formato numerico GG.MMSS."""
    decimal = float(decimal or 0) % 360
    grados = int(decimal)
    minutos_dec = (decimal - grados) * 60
    minutos = int(minutos_dec)
    segundos = round((minutos_dec - minutos) * 60, 2)
    return round(grados + minutos / 100 + segundos / 10000, 4)


def azimut_desde_deltas(dn: float, de: float) -> float:
    az = math.degrees(math.atan2(de or 0, dn or 0))
    if az < 0:
        az += 360
    return az


def enriquecer_estaciones_poligonal(estaciones: list) -> list:
    """Agrega columnas de calculo para la libreta de poligonal trigonométrica."""
    out = []
    dist_acum = 0.0
    for e in estaciones or []:
        ang = e.get("angulo_medido")
        ang_corr = e.get("angulo_corregido")
        ang_v = e.get("angulo_vertical")
        az = e.get("azimut")
        dn = e.get("delta_norte")
        de = e.get("delta_este")
        dz = e.get("delta_cota")
        cn = e.get("correccion_norte") or 0
        ce = e.get("correccion_este") or 0
        cz = e.get("correccion_cota") or 0
        dist_acum += float(e.get("distancia") or 0)
        out.append({
            **e,
            "angulo_observado_gms": decimal_a_gms_numero(ang) if ang is not None else None,
            "angulo_observado_texto": decimal_to_gms(ang) if ang is not None else None,
            "angulo_corregido_gms": decimal_a_gms_numero(ang_corr) if ang_corr is not None else None,
            "angulo_corregido_texto": decimal_to_gms(ang_corr) if ang_corr is not None else None,
            "angulo_vertical_gms": decimal_a_gms_numero(ang_v) if ang_v is not None else None,
            "angulo_vertical_texto": decimal_to_gms(ang_v) if ang_v is not None else None,
            "azimut_gms": decimal_a_gms_numero(az) if az is not None else None,
            "azimut_texto": decimal_to_gms(az) if az is not None else None,
            "distancia_acumulada": round(dist_acum, 3),
            "proyeccion_norte": dn,
            "proyeccion_este": de,
            "proyeccion_cota": dz,
            "proyeccion_norte_corr": (dn + cn) if dn is not None else None,
            "proyeccion_este_corr": (de + ce) if de is not None else None,
            "proyeccion_cota_corr": (dz + cz) if dz is not None else None,
        })
    return out


def radiar_armadas(armadas: list, estaciones: list, amarres: dict):
    """Calcula la cartera por armadas (ceros atras).

    Por cada armada: azimut base = azimut(estacion -> visado); cada punto adelante
    se coordena acumulando desde el vertice anterior (cadena de poligonal), no
    re-radiando desde un origen fijo. Los amarres no se sobrescriben: el visado
    con nombre de amarre siempre usa coordenadas de amarre; la estacion en un
    monumento de amarre usa esas coordenadas fijas al plantar el equipo.

    Retorna (armadas_enriquecidas, puntos_conocidos, estaciones_planas).
    """
    amarre_fijos: dict = {}
    for nombre, c in (amarres or {}).items():
        if c and c.get("norte") is not None and c.get("este") is not None:
            amarre_fijos[nombre] = {
                "norte": c.get("norte"),
                "este": c.get("este"),
                "cota": c.get("cota"),
            }

    radiados: dict = {}

    def coords_estacion(nombre: Optional[str]) -> Optional[dict]:
        """Coordenadas donde esta plantado el equipo (amarre fijo o vertice radiado)."""
        if not nombre:
            return None
        if nombre in amarre_fijos:
            return amarre_fijos[nombre]
        return radiados.get(nombre)

    def coords_visado(nombre: Optional[str]) -> Optional[dict]:
        """Visado de atras: prioriza amarre fijo si el nombre es de amarre."""
        if not nombre:
            return None
        if nombre in amarre_fijos:
            return amarre_fijos[nombre]
        return radiados.get(nombre)

    obs_by_arm: dict = {}
    for e in estaciones or []:
        obs_by_arm.setdefault(e.get("armada_id"), []).append(e)
    for k in obs_by_arm:
        obs_by_arm[k].sort(key=lambda x: x.get("orden") or 0)

    # Vertice acumulado: inicia en el primer amarre de estacion de armada 1
    vertice_prev: Optional[dict] = None
    if armadas:
        first = sorted(armadas, key=lambda a: a.get("orden") or 0)[0]
        vertice_prev = coords_estacion(first.get("estacion_nombre"))

    armadas_out = []
    estaciones_flat = []
    for arm in sorted(armadas or [], key=lambda a: a.get("orden") or 0):
        est = coords_estacion(arm.get("estacion_nombre"))
        vis = coords_visado(arm.get("visado_nombre"))
        base_az = None
        if est and vis and est.get("norte") is not None and vis.get("norte") is not None:
            base_az = azimut_desde_deltas(vis["norte"] - est["norte"], vis["este"] - est["este"])
        hi = arm.get("altura_instrumento") or 0
        puntos = []
        for o in obs_by_arm.get(arm.get("id"), []):
            ang = o.get("angulo_medido")
            ang_v = o.get("angulo_vertical")
            dist = o.get("distancia")
            ht = o.get("altura_objetivo") or 0
            az = n = e_ = z = None
            # Coordenada del leg desde donde esta el instrumento (estacion de la armada).
            origen = est if (est and est.get("norte") is not None) else vertice_prev
            if base_az is not None and ang is not None:
                az = (base_az + ang) % 360
                if origen and origen.get("norte") is not None and dist is not None:
                    n = origen["norte"] + dist * math.cos(math.radians(az))
                    e_ = origen["este"] + dist * math.sin(math.radians(az))
                    z_base = origen.get("cota")
                    if z_base is not None and ang_v is not None:
                        vz = math.radians(ang_v)
                        sin_vz = math.sin(vz)
                        desnivel = (dist * math.cos(vz) / sin_vz) if abs(sin_vz) > 1e-9 else 0.0
                        z = z_base + hi + desnivel - ht
            punto = {
                **o,
                "tipo_punto": o.get("tipo_punto") or "auxiliar",
                "armada_orden": arm.get("orden"),
                "angulo_observado_gms": decimal_a_gms_numero(ang) if ang is not None else None,
                "angulo_observado_texto": decimal_to_gms(ang) if ang is not None else None,
                "angulo_vertical_gms": decimal_a_gms_numero(ang_v) if ang_v is not None else None,
                "angulo_vertical_texto": decimal_to_gms(ang_v) if ang_v is not None else None,
                "azimut": round(az, 6) if az is not None else None,
                "azimut_gms": decimal_a_gms_numero(az) if az is not None else None,
                "azimut_texto": decimal_to_gms(az) if az is not None else None,
                "norte": round(n, 4) if n is not None else None,
                "este": round(e_, 4) if e_ is not None else None,
                "cota": round(z, 4) if z is not None else None,
                "norte_estacion": est.get("norte") if est else None,
                "este_estacion": est.get("este") if est else None,
            }
            if n is not None and e_ is not None and o.get("nombre_punto"):
                vertice_prev = {
                    "norte": round(n, 4),
                    "este": round(e_, 4),
                    "cota": round(z, 4) if z is not None else None,
                }
                nombre_fwd = o["nombre_punto"]
                # No sobrescribir amarre fijo; guardar radiacion bajo el nombre del punto
                radiados[nombre_fwd] = vertice_prev
            puntos.append(punto)
            estaciones_flat.append(punto)
        armadas_out.append({
            **arm,
            "base_azimut": round(base_az, 6) if base_az is not None else None,
            "base_azimut_texto": decimal_to_gms(base_az) if base_az is not None else None,
            "estacion_coords": est,
            "visado_coords": vis,
            "puntos": puntos,
        })

    # Amarres fijos no se sobrescriben por puntos radiados con el mismo nombre (cierre).
    known = dict(amarre_fijos)
    for nombre, coords in radiados.items():
        if nombre not in amarre_fijos:
            known[nombre] = coords
    return armadas_out, known, estaciones_flat


def fusionar_estaciones_vista(estaciones_db: list, estaciones_flat: list) -> list:
    """Combina radiación en vivo con columnas ajustadas persistidas en BD."""
    db_by_id = {e["id"]: e for e in (estaciones_db or []) if e.get("id")}
    orden_map = {e["id"]: e.get("orden") or 0 for e in estaciones_db or []}
    merged = []
    for f in estaciones_flat or []:
        row = dict(f)
        db = db_by_id.get(f.get("id"), {})
        for key in (
            "angulo_corregido",
            "azimut",
            "delta_norte",
            "delta_este",
            "delta_cota",
            "correccion_norte",
            "correccion_este",
            "correccion_cota",
            "norte_ajustado",
            "este_ajustado",
            "cota_ajustada",
        ):
            if db.get(key) is not None:
                row[key] = db[key]
        if db.get("norte_ajustado") is not None:
            row["norte"] = db["norte_ajustado"]
            row["este"] = db["este_ajustado"]
            row["cota"] = db["cota_ajustada"]
        if db.get("azimut") is not None:
            row["azimut"] = db["azimut"]
        merged.append(row)
    merged.sort(key=lambda x: orden_map.get(x.get("id"), x.get("orden") or 0))
    return enriquecer_estaciones_poligonal(merged)


def ajustar_poligonal_armadas(
    pol: dict,
    armadas: list,
    estaciones_db: list,
    amarres: dict,
    punto_inicial: Optional[dict],
) -> dict:
    """Corrección angular + Bowditch usando azimuts de radiación por armadas (ceros atrás)."""
    armadas_enr, _, flat = radiar_armadas(armadas, estaciones_db, amarres)
    flat_by_id = {p["id"]: p for p in flat if p.get("id")}
    armada_hi = {a["id"]: a.get("altura_instrumento") or 0 for a in armadas or []}

    cierre = calcular_cierre_poligonal(
        armadas_enr,
        punto_inicial,
        sentido=pol.get("sentido") or "antihorario",
        tol_relativa=pol.get("tolerancia_relativa") or 25000,
        tol_cota_mm_km=pol.get("tolerancia_cota_mm_km") or 12,
        precision_angular_seg=pol.get("precision_angular_seg") or 10.0,
        longitud_max_delta_m=pol.get("longitud_max_delta_m"),
    )

    traverse = [
        e
        for e in sorted(estaciones_db or [], key=lambda x: x.get("orden") or 0)
        if float(e.get("distancia") or 0) > 1e-9
    ]
    n_trav = len(traverse)
    error_ang = cierre.get("error_angular")
    corr_ang = (-error_ang / n_trav) if (n_trav and error_ang is not None) else 0.0

    longitud = sum(float(e.get("distancia") or 0) for e in traverse)
    sum_dn = sum_de = sum_dz = 0.0
    leg_data = []

    for e in traverse:
        fp = flat_by_id.get(e["id"], {})
        az = fp.get("azimut")
        dist = float(e.get("distancia") or 0)
        ang_corr = (e.get("angulo_medido") or 0) + corr_ang
        dn = de = dz = None
        if az is not None:
            az_r = math.radians(az)
            dn = dist * math.cos(az_r)
            de = dist * math.sin(az_r)
            sum_dn += dn
            sum_de += de
            ang_v = e.get("angulo_vertical")
            hi = armada_hi.get(e.get("armada_id"), 0)
            ht = e.get("altura_objetivo") or 0
            if ang_v is not None:
                vz = math.radians(ang_v)
                sin_vz = math.sin(vz)
                if abs(sin_vz) > 1e-9:
                    dz = hi + (dist * math.cos(vz) / sin_vz) - ht
                    sum_dz += dz
        leg_data.append({"est": e, "az": az, "dn": dn, "de": de, "dz": dz, "ang_corr": ang_corr})

    pi = punto_inicial or {}
    if (pol.get("tipo") or "cerrada") == "cerrada":
        err_dn, err_de, err_dz = sum_dn, sum_de, sum_dz
    else:
        err_dn = sum_dn - (float(pi.get("norte") or 0) - float(pi.get("norte") or 0))
        err_de = sum_de
        err_dz = sum_dz

    err_lineal = math.hypot(err_dn, err_de)
    precision = (longitud / err_lineal) if err_lineal > 1e-9 else 999999

    norte_acum = float(pi.get("norte") or 0)
    este_acum = float(pi.get("este") or 0)
    cota_acum = float(pi.get("cota") or 0) if pi.get("cota") is not None else None

    updates = []
    for leg in leg_data:
        e = leg["est"]
        dist = float(e.get("distancia") or 0)
        cn = ce = cz = 0.0
        if longitud > 0 and dist > 0:
            cn = -(err_dn * dist / longitud)
            ce = -(err_de * dist / longitud)
            cz = -(err_dz * dist / longitud) if err_dz else 0.0
        if leg["dn"] is not None:
            norte_acum += leg["dn"] + cn
            este_acum += leg["de"] + ce
            if cota_acum is not None and leg["dz"] is not None:
                cota_acum += leg["dz"] + cz
        updates.append(
            {
                "id": e["id"],
                "angulo_corregido": round(leg["ang_corr"], 8),
                "azimut": round(leg["az"], 6) if leg["az"] is not None else None,
                "delta_norte": round(leg["dn"], 6) if leg["dn"] is not None else None,
                "delta_este": round(leg["de"], 6) if leg["de"] is not None else None,
                "delta_cota": round(leg["dz"], 6) if leg["dz"] is not None else None,
                "correccion_norte": round(cn, 6),
                "correccion_este": round(ce, 6),
                "correccion_cota": round(cz, 6),
                "norte_ajustado": round(norte_acum, 4),
                "este_ajustado": round(este_acum, 4),
                "cota_ajustada": round(cota_acum, 4) if cota_acum is not None else None,
            }
        )

    # Puntos sin distancia (orientación): solo azimut radiado
    for e in sorted(estaciones_db or [], key=lambda x: x.get("orden") or 0):
        if float(e.get("distancia") or 0) > 1e-9:
            continue
        fp = flat_by_id.get(e.get("id"), {})
        if fp.get("azimut") is not None:
            updates.append(
                {
                    "id": e["id"],
                    "azimut": round(fp["azimut"], 6),
                    "angulo_corregido": e.get("angulo_medido"),
                }
            )

    tol_cota_m = (float(pol.get("tolerancia_cota_mm_km") or 12) / 1000.0) * max(longitud / 1000.0, 1e-6)

    return {
        "cierre": cierre,
        "updates": updates,
        "resumen": {
            "error_dn": round(err_dn, 4),
            "error_de": round(err_de, 4),
            "error_dz": round(err_dz, 4) if err_dz else None,
            "error_lineal": round(err_lineal, 4),
            "precision": int(round(precision)),
            "longitud_total": round(longitud, 3),
            "correccion_angular_por_estacion": round(corr_ang, 8),
            "admisible_cota": abs(err_dz or 0) <= tol_cota_m or longitud == 0,
        },
    }


def _punto_estacion_adelante(armada: dict) -> Optional[dict]:
    """Punto de tipo 'estacion' radiado por la armada (vertice de la poligonal)."""
    for p in armada.get("puntos", []) or []:
        if (p.get("tipo_punto") or "auxiliar") == "estacion":
            return p
    return None


def tolerancia_relativa_res643(area_m2: float) -> int:
    """Tabla 2 Res. 643/2018 — precision de poligonal cerrada segun area del predio."""
    a = max(float(area_m2 or 0), 0)
    if a < 1000:
        return 20000
    if a < 10000:  # < 1 Ha
        return 15000
    if a < 100000:  # < 10 Ha
        return 10000
    return 5000


def _vertices_poligonal_cierre(armadas_enr: list) -> List[dict]:
    """Vertices tipo estacion con coordenadas, en orden de armadas."""
    verts = []
    for arm in armadas_enr or []:
        fwd = _punto_estacion_adelante(arm)
        if fwd and fwd.get("norte") is not None and fwd.get("este") is not None:
            verts.append(fwd)
    return verts


def _lados_poligonal(vertices: List[dict], cerrado: bool) -> List[dict]:
    """Longitudes de los lados entre vertices consecutivos (y cierre si aplica)."""
    if len(vertices) < 2:
        return []
    lados = []
    for i in range(1, len(vertices)):
        a, b = vertices[i - 1], vertices[i]
        ln = math.hypot(b["norte"] - a["norte"], b["este"] - a["este"])
        lados.append({
            "desde": a.get("nombre_punto"),
            "hasta": b.get("nombre_punto"),
            "estacion_id": b.get("id"),
            "longitud": round(ln, 3),
        })
    if cerrado and len(vertices) >= 3:
        a, b = vertices[-1], vertices[0]
        ln = math.hypot(b["norte"] - a["norte"], b["este"] - a["este"])
        lados.append({
            "desde": a.get("nombre_punto"),
            "hasta": b.get("nombre_punto"),
            "estacion_id": b.get("id"),
            "longitud": round(ln, 3),
            "es_cierre_amarre": True,
        })
    return lados


def calcular_cierre_poligonal(
    armadas_enr: list,
    punto_inicial: Optional[dict],
    sentido: str = "antihorario",
    tol_relativa: float = 25000,
    tol_cota_mm_km: float = 12,
    precision_angular_seg: float = 10.0,
    longitud_max_delta_m: Optional[float] = 300.0,
) -> dict:
    """Calcula el cierre angular y lineal de una poligonal cerrada por armadas.

    - Vertices/perimetro: legs entre vertices 'estacion' hasta que el punto adelante
      regresa al punto inicial (leg de cierre incluido).
    - Angular: suma de los angulos observados de los puntos 'estacion' de todas las
      armadas (incluida la armada de cierre de orientacion).
    """
    start_name = (punto_inicial or {}).get("nombre") if punto_inicial else None
    if not start_name and armadas_enr:
        start_name = armadas_enr[0].get("estacion_nombre")
    start = None
    if punto_inicial and punto_inicial.get("norte") is not None:
        start = {
            "norte": punto_inicial.get("norte"),
            "este": punto_inicial.get("este"),
            "cota": punto_inicial.get("cota"),
        }

    angulos_travesia: List[float] = []
    perimetro = 0.0
    n_legs = 0
    retorno = None
    cerrado = False
    orientacion_ang = None
    az_ref_inicial = None
    az_ref_final = None

    if armadas_enr:
        first = armadas_enr[0]
        if first.get("base_azimut") is not None:
            az_ref_inicial = first["base_azimut"]

    for arm in armadas_enr or []:
        fwd = _punto_estacion_adelante(arm)
        if not fwd:
            continue
        dist = float(fwd.get("distancia") or 0)
        ang = fwd.get("angulo_medido")

        if dist > 1e-9 and not cerrado:
            if ang is not None:
                angulos_travesia.append(ang)
            perimetro += dist
            n_legs += 1
            if fwd.get("nombre_punto") == start_name and fwd.get("norte") is not None:
                retorno = fwd
                cerrado = True
        elif (dist <= 1e-9) and ang is not None:
            # Armada de orientacion (sin distancia): cierre angular al visado de referencia.
            orientacion_ang = ang
            base = arm.get("base_azimut")
            if base is not None:
                az_ref_final = (base + ang) % 360

    n_ang_trav = len(angulos_travesia)
    n_vert = n_legs
    suma_travesia = sum(angulos_travesia) if angulos_travesia else 0.0
    suma_obs = suma_travesia + (orientacion_ang or 0)
    tiene_orientacion = orientacion_ang is not None

    # Con orientacion al punto de referencia (libro Excel): Σ = (n+2)×180° (angulos exteriores).
    # Solo travesia (n lados): antihorario (n-2)×180°, horario (n+2)×180°.
    if n_vert:
        if tiene_orientacion:
            teorico = (n_vert + 2) * 180
        else:
            teorico = ((n_vert + 2) if sentido == "horario" else (n_vert - 2)) * 180
    else:
        teorico = None

    error_ang = (suma_obs - teorico) if teorico is not None else None
    error_ang_seg = (error_ang * 3600) if error_ang is not None else None

    error_orient_seg = None
    if az_ref_inicial is not None and az_ref_final is not None:
        diff_az = ((az_ref_final - az_ref_inicial + 180) % 360) - 180
        error_orient_seg = round(diff_az * 3600, 2)

    dN = dE = dZ = e_lineal = precision = None
    sum_dn = sum_de = 0.0
    for arm in armadas_enr or []:
        fwd = _punto_estacion_adelante(arm)
        if not fwd:
            continue
        dist = fwd.get("distancia")
        if dist is None or dist <= 0 or fwd.get("azimut") is None:
            continue
        az_r = math.radians(fwd["azimut"])
        sum_dn += dist * math.cos(az_r)
        sum_de += dist * math.sin(az_r)

    if cerrado and retorno and start:
        dN = round(start["norte"] - retorno["norte"], 4)
        dE = round(start["este"] - retorno["este"], 4)
        if start.get("cota") is not None and retorno.get("cota") is not None:
            dZ = round(start["cota"] - retorno["cota"], 4)
        e_lineal = round(math.hypot(dN, dE), 4)
        precision = (perimetro / e_lineal) if e_lineal > 1e-9 else None
    elif cerrado and abs(sum_dn) + abs(sum_de) > 0:
        # Cierre por suma de proyecciones de los legs (coherente con azimut + distancia)
        dN = round(-sum_dn, 4)
        dE = round(-sum_de, 4)
        e_lineal = round(math.hypot(sum_dn, sum_de), 4)
        precision = (perimetro / e_lineal) if e_lineal > 1e-9 else None

    # Res. 643 §9.2.2: error angular max = precision angular del equipo * sqrt(n vertices)
    n_ang = n_ang_trav + (1 if tiene_orientacion else 0)
    n_tol = n_vert if n_vert else n_ang
    prec_ang = float(precision_angular_seg or 10.0)
    tol_ang_seg = round(prec_ang * math.sqrt(n_tol), 1) if n_tol else None
    admisible_angular = (abs(error_ang_seg) <= tol_ang_seg) if (error_ang_seg is not None and tol_ang_seg) else None

    vertices = _vertices_poligonal_cierre(armadas_enr)
    area_m2 = area_por_coordenadas(vertices) if len(vertices) >= 3 else 0.0
    tol_res643 = tolerancia_relativa_res643(area_m2)
    lados = _lados_poligonal(vertices, cerrado)
    max_lado = max((l["longitud"] for l in lados), default=0.0)
    lim_delta = float(longitud_max_delta_m) if longitud_max_delta_m is not None else None
    admisible_lados = True
    lados_excedidos = []
    if lim_delta and lim_delta > 0:
        for lado in lados:
            if lado["longitud"] > lim_delta:
                admisible_lados = False
                lados_excedidos.append(lado)

    precision_int = int(round(precision)) if precision is not None else None
    admisible_lineal = (precision_int is not None and precision_int >= int(tol_relativa))
    tol_cota_m = (tol_cota_mm_km / 1000.0) * max(perimetro / 1000.0, 1e-6)
    admisible_cota = (abs(dZ) <= tol_cota_m) if dZ is not None else None
    admisible = bool(
        cerrado
        and admisible_lineal
        and (admisible_angular is not False)
        and (admisible_cota is not False)
        and admisible_lados
    )

    return {
        "sentido": sentido,
        "cerrado": cerrado,
        "tiene_orientacion": tiene_orientacion,
        "num_angulos": n_ang,
        "num_vertices": n_vert,
        "suma_observada": round(suma_obs, 6),
        "suma_observada_texto": decimal_to_gms(suma_obs) if (angulos_travesia or tiene_orientacion) else None,
        "suma_travesia": round(suma_travesia, 6),
        "suma_travesia_texto": decimal_to_gms(suma_travesia) if angulos_travesia else None,
        "error_orientacion_seg": error_orient_seg,
        "azimut_referencia_inicial_texto": decimal_to_gms(az_ref_inicial) if az_ref_inicial is not None else None,
        "azimut_referencia_final_texto": decimal_to_gms(az_ref_final) if az_ref_final is not None else None,
        "suma_teorica": teorico,
        "suma_teorica_texto": decimal_to_gms(teorico) if teorico is not None and teorico >= 0 else None,
        "error_angular": error_ang,
        "error_angular_seg": round(error_ang_seg, 2) if error_ang_seg is not None else None,
        "tolerancia_angular_seg": tol_ang_seg,
        "precision_angular_equipo_seg": prec_ang,
        "area_m2": round(area_m2, 2),
        "tolerancia_relativa_res643": tol_res643,
        "longitud_max_delta_m": lim_delta,
        "max_lado_m": round(max_lado, 3) if lados else None,
        "lados": lados,
        "lados_excedidos": lados_excedidos,
        "admisible_lados": admisible_lados if lim_delta else None,
        "perimetro": round(perimetro, 3),
        "delta_norte": dN,
        "delta_este": dE,
        "delta_cota": dZ,
        "error_lineal": e_lineal,
        "precision": precision_int,
        "tolerancia_relativa": int(tol_relativa),
        "admisible_lineal": admisible_lineal,
        "admisible_angular": admisible_angular,
        "admisible_cota": admisible_cota,
        "admisible": admisible,
    }


def azimut_to_decimal(azimut_gms: float) -> float:
    return gms_to_decimal(azimut_gms)


def angulo_a_radianes(decimal: float) -> float:
    return math.radians(decimal)


def area_por_coordenadas(puntos: list) -> float:
    """Calcula area por formula de Gauss. Retorna area en m2 (positiva siempre)."""
    n = len(puntos)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += puntos[i]["este"] * puntos[j]["norte"]
        area -= puntos[j]["este"] * puntos[i]["norte"]
    return abs(area) / 2.0


def perimetro_por_coordenadas(puntos: list) -> float:
    """Suma distancias entre vertices consecutivos."""
    n = len(puntos)
    if n < 2:
        return 0.0
    total = 0.0
    for i in range(n):
        j = (i + 1) % n
        dn = puntos[j]["norte"] - puntos[i]["norte"]
        de = puntos[j]["este"] - puntos[i]["este"]
        total += math.sqrt(dn * dn + de * de)
    return total


def interseccion_dos_puntos(
    n1: float, e1: float, az1_gms: float, dist1: float,
    n2: float, e2: float, az2_gms: float, dist2: float,
) -> dict:
    """Calcula la interseccion de dos visuales desde puntos conocidos."""
    az1 = math.radians(gms_to_decimal(az1_gms))
    az2 = math.radians(gms_to_decimal(az2_gms))

    n_calc1 = n1 + dist1 * math.cos(az1)
    e_calc1 = e1 + dist1 * math.sin(az1)

    n_calc2 = n2 + dist2 * math.cos(az2)
    e_calc2 = e2 + dist2 * math.sin(az2)

    n_final = (n_calc1 + n_calc2) / 2
    e_final = (e_calc1 + e_calc2) / 2

    error_n = abs(n_calc1 - n_calc2)
    error_e = abs(e_calc1 - e_calc2)
    error_lineal = math.sqrt(error_n**2 + error_e**2)

    distancia_promedio = (dist1 + dist2) / 2
    error_angular_rad = math.atan2(error_lineal / 2, max(distancia_promedio, 0.001))
    error_angular_seg = math.degrees(error_angular_rad) * 3600

    return {
        "norte": round(n_final, 4),
        "este": round(e_final, 4),
        "error_norte": round(error_n, 4),
        "error_este": round(error_e, 4),
        "error_lineal": round(error_lineal, 4),
        "error_angular_segundos": round(error_angular_seg, 2),
        "norte_desde_p1": round(n_calc1, 4),
        "este_desde_p1": round(e_calc1, 4),
        "norte_desde_p2": round(n_calc2, 4),
        "este_desde_p2": round(e_calc2, 4),
    }


def calcular_verificacion_nivel(resultados: dict, tolerancia_mm: float = 2.0, distancia_m: float = 30.0) -> dict:
    """Prueba del doble estadal (two-peg test)."""
    la1 = float(resultados.get("lectura_a_pos1", 0))
    lb1 = float(resultados.get("lectura_b_pos1", 0))
    la2 = float(resultados.get("lectura_a_pos2", 0))
    lb2 = float(resultados.get("lectura_b_pos2", 0))
    dist = float(resultados.get("distancia_estacas", distancia_m) or distancia_m)
    delta = abs((la1 - lb1) - (la2 - lb2))
    error_mm_m = (delta * 1000.0) / max(dist, 0.001)
    cumple = error_mm_m <= tolerancia_mm
    recomendacion = "Equipo apto para nivelacion." if cumple else "Calibrar o enviar a servicio tecnico."
    return {
        "error_colimacion_mm_m": round(error_mm_m, 4),
        "tolerancia_mm_m": tolerancia_mm,
        "cumple": cumple,
        "diagnostico": "CUMPLE" if cumple else "NO CUMPLE",
        "recomendacion": recomendacion,
    }


def calcular_verificacion_estacion_total(resultados: dict, tolerancia_seg: float = 30.0) -> dict:
    """Verificacion de colimacion horizontal e indice vertical."""
    dir_directa = gms_to_decimal(float(resultados.get("horizontal_directa_gms", 0)))
    dir_inversa = gms_to_decimal(float(resultados.get("horizontal_inversa_gms", 0)))
    vert_directa = gms_to_decimal(float(resultados.get("vertical_directa_gms", 0)))
    vert_inversa = gms_to_decimal(float(resultados.get("vertical_inversa_gms", 0)))

    error_colimacion = abs((dir_inversa - dir_directa + 180) % 360 - 180) * 3600
    error_indice = abs((vert_inversa - vert_directa + 360) % 360 - 180) * 3600

    cumple_col = error_colimacion <= tolerancia_seg
    cumple_ind = error_indice <= tolerancia_seg
    cumple = cumple_col and cumple_ind
    recomendacion = "Equipo apto para medicion." if cumple else "Calibrar o enviar a servicio tecnico."

    return {
        "error_colimacion_seg": round(error_colimacion, 2),
        "error_indice_seg": round(error_indice, 2),
        "tolerancia_seg": tolerancia_seg,
        "cumple": cumple,
        "diagnostico": "CUMPLE" if cumple else "NO CUMPLE",
        "recomendacion": recomendacion,
    }


def svg_poligono(puntos: list, width: int = 500, height: int = 400, titulo: str = "") -> str:
    """Genera SVG de un poligono con cuadricula automatica."""
    if not puntos:
        return f'<svg width="{width}" height="{height}"><text x="10" y="20">Sin puntos</text></svg>'

    nortes = [p["norte"] for p in puntos]
    estes = [p["este"] for p in puntos]
    min_n, max_n = min(nortes), max(nortes)
    min_e, max_e = min(estes), max(estes)
    pad = max((max_n - min_n), (max_e - min_e), 1) * 0.15
    min_n -= pad
    max_n += pad
    min_e -= pad
    max_e += pad

    def tx(e):
        return 40 + (e - min_e) / max(max_e - min_e, 0.001) * (width - 80)

    def ty(n):
        return height - 40 - (n - min_n) / max(max_n - min_n, 0.001) * (height - 80)

    coords = " ".join(f"{tx(p['este'])},{ty(p['norte'])}" for p in puntos)
    labels = ""
    for p in puntos:
        x, y = tx(p["este"]), ty(p["norte"])
        nombre = html.escape(str(p.get("nombre", "")))
        labels += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#2563eb"/>'
        labels += f'<text x="{x + 6:.1f}" y="{y - 6:.1f}" font-size="10" fill="#1e293b">{nombre}</text>'

    titulo_html = f'<text x="{width/2:.0f}" y="16" text-anchor="middle" font-size="12" fill="#334155">{html.escape(titulo)}</text>' if titulo else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<rect width="100%" height="100%" fill="#f8fafc"/>'
        f'{titulo_html}'
        f'<polygon points="{coords}" fill="rgba(37,99,235,0.15)" stroke="#2563eb" stroke-width="2"/>'
        f'{labels}'
        f'<text x="{width - 20}" y="24" font-size="10" fill="#64748b">N</text>'
        f'<line x1="{width - 20}" y1="30" x2="{width - 20}" y2="10" stroke="#64748b" stroke-width="1.5"/>'
        f"</svg>"
    )


def svg_interseccion(
    p1: dict, p2: dict, pn: dict,
    width: int = 500, height: int = 400,
) -> str:
    """SVG del triangulo de interseccion."""
    puntos = [
        {"nombre": p1.get("nombre", "P1"), "norte": p1["norte"], "este": p1["este"]},
        {"nombre": p2.get("nombre", "P2"), "norte": p2["norte"], "este": p2["este"]},
        {"nombre": pn.get("nombre", "XXX"), "norte": pn["norte"], "este": pn["este"]},
    ]
    return svg_poligono(puntos, width=width, height=height, titulo="Interseccion de coordenadas")


def matplotlib_poligono_base64(
    puntos: list,
    titulo: str = "",
    *,
    figsize: tuple = (6, 4),
    dpi: int = 120,
    fontsize: int = 8,
) -> str:
    """Genera imagen PNG base64 de un poligono con matplotlib."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return ""

    if not puntos:
        return ""

    estes = [p["este"] for p in puntos] + [puntos[0]["este"]]
    nortes = [p["norte"] for p in puntos] + [puntos[0]["norte"]]
    fig, ax = plt.subplots(figsize=figsize)
    ax.plot(estes, nortes, "b-o", linewidth=2, markersize=8)
    for p in puntos:
        ax.annotate(
            str(p.get("nombre", "")),
            (p["este"], p["norte"]),
            fontsize=fontsize,
            fontweight="bold",
            xytext=(6, 6),
            textcoords="offset points",
        )
    ax.set_xlabel("Este (m)", fontsize=fontsize + 1)
    ax.set_ylabel("Norte (m)", fontsize=fontsize + 1)
    ax.set_title(titulo or "Plano topografico", fontsize=fontsize + 2)
    ax.grid(True, alpha=0.3)
    ax.set_aspect("equal", adjustable="box")
    buf = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format="png", dpi=dpi)
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _fmt_pdf_num(v, dec=4) -> str:
    if v is None or v == "":
        return "—"
    try:
        return f"{float(v):.{dec}f}"
    except (TypeError, ValueError):
        return html.escape(str(v))


_PDF_CELL = "padding:1px 2px;font-size:6pt;border:1px solid #cbd5e1;vertical-align:middle;"
_PDF_CELL_ANG = "padding:1px 1px;font-size:5.5pt;white-space:nowrap;border:1px solid #cbd5e1;vertical-align:middle;"
_PDF_TH = "padding:2px 3px;font-size:6pt;font-weight:700;background:#e2e8f0;border:1px solid #94a3b8;"


def html_tabla_poligonal_pdf(estaciones: list, pol: dict) -> str:
    """Cartera de calculo compacta para PDF."""
    headers = [
        ("#", _PDF_TH),
        ("Arm", _PDF_TH),
        ("Pto", _PDF_TH),
        ("∠obs", _PDF_TH + "white-space:nowrap;"),
        ("∠cor", _PDF_TH + "white-space:nowrap;"),
        ("∠vert", _PDF_TH + "white-space:nowrap;"),
        ("Dist", _PDF_TH),
        ("Az", _PDF_TH + "white-space:nowrap;"),
        ("ΔN", _PDF_TH),
        ("ΔE", _PDF_TH),
        ("ΔZ", _PDF_TH),
        ("cN", _PDF_TH),
        ("cE", _PDF_TH),
        ("Norte", _PDF_TH),
        ("Este", _PDF_TH),
        ("Cota", _PDF_TH),
    ]
    ths = "".join(f'<th style="{st}">{html.escape(lbl)}</th>' for lbl, st in headers)
    rows = ""
    for e in estaciones or []:
        rows += (
            "<tr>"
            f'<td style="{_PDF_CELL}">{e.get("orden", "")}</td>'
            f'<td style="{_PDF_CELL}">{e.get("armada_orden", "")}</td>'
            f'<td style="{_PDF_CELL}"><b>{html.escape(str(e.get("nombre_punto") or ""))}</b></td>'
            f'<td style="{_PDF_CELL_ANG}">{html.escape(str(e.get("angulo_observado_texto") or "—"))}</td>'
            f'<td style="{_PDF_CELL_ANG}">{html.escape(str(e.get("angulo_corregido_texto") or "—"))}</td>'
            f'<td style="{_PDF_CELL_ANG}">{html.escape(str(e.get("angulo_vertical_texto") or "—"))}</td>'
            f'<td style="{_PDF_CELL}">{_fmt_pdf_num(e.get("distancia"), 3)}</td>'
            f'<td style="{_PDF_CELL_ANG}">{html.escape(str(e.get("azimut_texto") or "—"))}</td>'
            f'<td style="{_PDF_CELL}">{_fmt_pdf_num(e.get("proyeccion_norte"), 3)}</td>'
            f'<td style="{_PDF_CELL}">{_fmt_pdf_num(e.get("proyeccion_este"), 3)}</td>'
            f'<td style="{_PDF_CELL}">{_fmt_pdf_num(e.get("proyeccion_cota"), 3)}</td>'
            f'<td style="{_PDF_CELL}">{_fmt_pdf_num(e.get("correccion_norte"), 3)}</td>'
            f'<td style="{_PDF_CELL}">{_fmt_pdf_num(e.get("correccion_este"), 3)}</td>'
            f'<td style="{_PDF_CELL}">{_fmt_pdf_num(e.get("norte"), 3)}</td>'
            f'<td style="{_PDF_CELL}">{_fmt_pdf_num(e.get("este"), 3)}</td>'
            f'<td style="{_PDF_CELL}">{_fmt_pdf_num(e.get("cota"), 3)}</td>'
            "</tr>"
        )
    equipo = " / ".join(
        x
        for x in [
            pol.get("equipo_marca"),
            pol.get("equipo_referencia"),
            pol.get("equipo_serial") and f"S/N {pol.get('equipo_serial')}",
        ]
        if x
    ) or pol.get("equipo") or "—"
    return f"""
    <p style="font-size:7pt;margin:4px 0 2px;color:#334155;">
      <b>Equipo:</b> {html.escape(str(equipo))} |
      <b>Operador:</b> {html.escape(str(pol.get("operador") or "—"))} |
      <b>Fecha:</b> {html.escape(str(pol.get("fecha_campo") or "—"))}
    </p>
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;">
      <tr>{ths}</tr>
      {rows}
    </table>
    """


def _fmt_ratio_pdf(n) -> str:
    try:
        v = int(n)
        if v <= 0:
            return "—"
        return f"1:{v:,}".replace(",", " ")
    except (TypeError, ValueError):
        return "—"


def _pdf_cierre_celda(label: str, valor: str, *, valor_style: str = "") -> str:
    return f"""
    <tr>
      <td style="padding:2px 4px;font-size:6pt;font-weight:600;background:#f1f5f9;color:#334155;width:44%;">{html.escape(label)}</td>
      <td style="padding:2px 4px;font-size:6pt;text-align:right;font-weight:600;color:#0f172a;{valor_style}">{valor}</td>
    </tr>
    """


def _pdf_badge(ok: Optional[bool], ok_txt: str = "CUMPLE", bad_txt: str = "REVISAR") -> str:
    if ok is None:
        return ""
    if ok:
        return f'<span style="font-size:6pt;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:4px;">{ok_txt}</span>'
    return f'<span style="font-size:6pt;background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;">{bad_txt}</span>'


def html_cierre_poligonal_pdf(cierre: Optional[dict], pol: Optional[dict] = None) -> str:
    """Cuadros de cierre angular y lineal (como en pantalla), para PDF."""
    cierre = cierre or {}
    pol = pol or {}
    sentido_txt = "Horario (ext.)" if cierre.get("sentido") == "horario" else "Antihorario (int.)"
    seg = cierre.get("error_angular_seg")
    seg_txt = "—" if seg is None else f'{"" if seg >= 0 else "-"}{abs(float(seg)):.1f}"'

    ang_rows = [
        _pdf_cierre_celda("Sentido", sentido_txt),
        _pdf_cierre_celda("Áng. / Vért.", f'{cierre.get("num_angulos", "—")} / {cierre.get("num_vertices", "—")}'),
        _pdf_cierre_celda("Σ Observada", html.escape(str(cierre.get("suma_observada_texto") or "—"))),
    ]
    teorica = html.escape(str(cierre.get("suma_teorica_texto") or "—"))
    if cierre.get("tiene_orientacion"):
        teorica += ' <span style="color:#64748b;font-weight:400;">(n+2)×180°</span>'
    ang_rows.append(_pdf_cierre_celda("Σ Teórica", teorica))
    ang_rows.append(_pdf_cierre_celda("Diferencia", html.escape(seg_txt), valor_style="color:#b45309;"))
    if cierre.get("error_orientacion_seg") is not None:
        eo = float(cierre["error_orientacion_seg"])
        orient = f'{"" if eo >= 0 else "-"}{abs(eo):.1f}"'
        ref = (
            f'<span style="font-size:6pt;color:#64748b;display:block;">'
            f'{html.escape(str(cierre.get("azimut_referencia_inicial_texto") or "—"))} → '
            f'{html.escape(str(cierre.get("azimut_referencia_final_texto") or "—"))}'
            f"</span>"
        )
        ang_rows.append(_pdf_cierre_celda("Orient. ref.", orient + ref))
    if cierre.get("tolerancia_angular_seg") is not None:
        tol = cierre["tolerancia_angular_seg"]
        nv = cierre.get("num_vertices") or cierre.get("num_angulos") or 0
        prec = cierre.get("precision_angular_equipo_seg") or 10
        ang_rows.append(
            _pdf_cierre_celda(
                "Tolerancia",
                f'± {tol}" <span style="color:#64748b;font-weight:400;">({prec}"×√{nv})</span>',
            )
        )

    lin_adm = cierre.get("admisible_lineal")
    cierre_obt = _fmt_ratio_pdf(cierre.get("precision") or pol.get("precision_relativa"))
    cierre_style = (
        "background:#dcfce7;color:#166534;font-weight:800;"
        if lin_adm
        else "background:#fee2e2;color:#991b1b;font-weight:800;"
    )
    lin_rows = [
        _pdf_cierre_celda("Perímetro", f'{_fmt_pdf_num(cierre.get("perimetro"), 3)} m'),
        _pdf_cierre_celda(
            "ΔN / ΔE / ΔZ",
            f'{_fmt_pdf_num(cierre.get("delta_norte"), 4)} / {_fmt_pdf_num(cierre.get("delta_este"), 4)} / '
            f'{_fmt_pdf_num(cierre.get("delta_cota"), 4)}',
        ),
        _pdf_cierre_celda("Error lineal", f'{_fmt_pdf_num(cierre.get("error_lineal") or pol.get("error_lineal"), 4)} m'),
        _pdf_cierre_celda("Cierre obtenido", cierre_obt, valor_style=cierre_style),
        _pdf_cierre_celda("Tolerancia plan", _fmt_ratio_pdf(cierre.get("tolerancia_relativa") or pol.get("tolerancia_relativa"))),
    ]
    if cierre.get("tolerancia_relativa_res643") is not None:
        res643 = _fmt_ratio_pdf(cierre["tolerancia_relativa_res643"])
        area = cierre.get("area_m2")
        extra = f' · {_fmt_pdf_num(area, 0)} m²' if area is not None else ""
        lin_rows.append(_pdf_cierre_celda("Tol. Res. 643", res643 + extra))

    cota_badge = ""
    if cierre.get("admisible_cota") is False:
        cota_badge = '<span style="font-size:6pt;background:#fee2e2;color:#991b1b;padding:1px 5px;border-radius:4px;margin-right:4px;">Cota</span>'

    def _cuadro(titulo: str, badges: str, filas: list) -> str:
        return f"""
        <table width="100%" border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-color:#94a3b8;">
          <tr>
            <td colspan="2" style="background:#475569;color:#fff;font-size:6.5pt;font-weight:700;padding:3px 6px;">
              <span>{html.escape(titulo)}</span>
              <span style="float:right;">{badges}</span>
            </td>
          </tr>
          {''.join(filas)}
        </table>
        """

    bloque_cierre = f"""
    <table width="100%" cellspacing="0" cellpadding="2"><tr>
      <td width="49%" valign="top">{_cuadro("Cierre angular", _pdf_badge(cierre.get("admisible_angular")), ang_rows)}</td>
      <td width="2%"></td>
      <td width="49%" valign="top">{_cuadro("Cierre lineal", cota_badge + _pdf_badge(lin_adm, bad_txt="NO CUMPLE"), lin_rows)}</td>
    </tr></table>
    """
    return f"""
    <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:6px;">
      <tr>
        <td width="54%" valign="bottom" style="font-size:6pt;color:#64748b;padding-right:8px;">
          Cartera de cálculo — {html.escape(str(pol.get("nombre") or ""))}
        </td>
        <td width="46%" valign="top">{bloque_cierre}</td>
      </tr>
    </table>
    """


def _nice_grid_step(span: float) -> float:
    raw = span / 6.0
    mag = 10 ** math.floor(math.log10(max(raw, 1e-6)))
    norm = raw / mag
    if norm <= 1:
        return mag
    if norm <= 2:
        return 2 * mag
    if norm <= 5:
        return 5 * mag
    return 10 * mag


def _puntos_para_plano(estaciones: list, punto_inicial: Optional[dict]) -> list:
    out: List[dict] = []
    if punto_inicial and punto_inicial.get("norte") is not None:
        out.append(
            {
                "nombre": str(punto_inicial.get("nombre") or "Amarre"),
                "norte": float(punto_inicial["norte"]),
                "este": float(punto_inicial["este"]),
                "cota": punto_inicial.get("cota"),
                "tipo_punto": "amarre",
                "distancia": None,
            }
        )
    for e in sorted(estaciones or [], key=lambda x: int(x.get("orden") or 0)):
        if e.get("norte") is None or e.get("este") is None:
            continue
        out.append(
            {
                "nombre": str(e.get("nombre_punto") or ""),
                "norte": float(e["norte"]),
                "este": float(e["este"]),
                "cota": e.get("cota"),
                "tipo_punto": str(e.get("tipo_punto") or "auxiliar").lower(),
                "distancia": e.get("distancia"),
            }
        )
    return out


def _cadena_vertices_plano(puntos: list) -> list:
    """Vértices del polígono (estaciones + amarre) en orden."""
    chain = [p for p in puntos if p.get("tipo_punto") in ("estacion", "amarre")]
    if len(chain) >= 2:
        return chain
    chain = [p for p in puntos if (p.get("distancia") or 0) > 0]
    return chain if len(chain) >= 2 else puntos


def _html_logo_pdf(contrato: dict, *, max_h: int = 36, placeholder_pt: int = 7) -> str:
    """Logo del contratista para PDF (sin URLs remotas)."""
    logo = contrato.get("logo_contratista") or ""
    if logo and (str(logo).startswith("http://") or str(logo).startswith("https://")):
        logo = ""
    if logo:
        return (
            f'<img src="{html.escape(str(logo), quote=True)}" '
            f'style="max-height:{max_h}px;max-width:72px;display:block;" />'
        )
    return (
        f'<div style="border:0.5px dashed #94a3b8;padding:4px;font-size:{placeholder_pt}pt;'
        f'color:#94a3b8;text-align:center;">LOGO</div>'
    )


def svg_plano_poligonal_profesional(
    estaciones: list,
    punto_inicial: Optional[dict],
    pol: dict,
    *,
    width: int = 980,
    height: int = 420,
    escala_texto: str = "",
) -> str:
    """Plano con cuadricula, norte, distancias y simbologia (▲ auxiliar)."""
    puntos = _puntos_para_plano(estaciones, punto_inicial)
    if len(puntos) < 2:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
            f'<text x="24" y="40" font-size="12" fill="#64748b">Sin geometría para el plano</text></svg>'
        )

    frame = 6
    ml, mr, mt, mb = 34, 10, 12, 22
    x0 = frame + ml
    y0 = frame + mt
    w = width - 2 * frame - ml - mr
    h = height - 2 * frame - mt - mb

    nortes = [p["norte"] for p in puntos]
    estes = [p["este"] for p in puntos]
    min_n_raw, max_n_raw = min(nortes), max(nortes)
    min_e_raw, max_e_raw = min(estes), max(estes)
    span_n = max(max_n_raw - min_n_raw, 1.0)
    span_e = max(max_e_raw - min_e_raw, 1.0)
    half = max(span_n, span_e) * 0.56
    cx_n = (min_n_raw + max_n_raw) / 2
    cx_e = (min_e_raw + max_e_raw) / 2
    min_n, max_n = cx_n - half, cx_n + half
    min_e, max_e = cx_e - half, cx_e + half
    span_m = 2 * half
    scale_px = min(w, h) / max(span_m, 1e-9)
    off_x = x0 + (w - span_m * scale_px) / 2
    off_y = y0 + (h - span_m * scale_px) / 2

    def tx(e: float) -> float:
        return off_x + (e - min_e) * scale_px

    def ty(n: float) -> float:
        return off_y + (max_n - n) * scale_px

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect x="0.5" y="0.5" width="{width - 1}" height="{height - 1}" fill="#fff" stroke="#000" stroke-width="0.6"/>',
        f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="#fafafa" stroke="#000" stroke-width="0.5"/>',
    ]

    step_e = _nice_grid_step(span_m)
    step_n = step_e
    e_val = math.floor(min_e / step_e) * step_e
    while e_val <= max_e + step_e * 0.01:
        if e_val < min_e - 1e-6 or e_val > max_e + 1e-6:
            e_val += step_e
            continue
        xg = tx(e_val)
        if x0 <= xg <= x0 + w:
            parts.append(
                f'<line x1="{xg:.1f}" y1="{y0}" x2="{xg:.1f}" y2="{y0 + h}" stroke="#d1d5db" stroke-width="0.4"/>'
            )
            parts.append(
                f'<text x="{xg:.1f}" y="{y0 + h + 14}" font-size="6.5" fill="#374151" text-anchor="middle">{e_val:.0f}</text>'
            )
        e_val += step_e
    n_val = math.floor(min_n / step_n) * step_n
    while n_val <= max_n + step_n * 0.01:
        if n_val < min_n - 1e-6 or n_val > max_n + 1e-6:
            n_val += step_n
            continue
        yg = ty(n_val)
        if y0 <= yg <= y0 + h:
            parts.append(
                f'<line x1="{x0}" y1="{yg:.1f}" x2="{x0 + w}" y2="{yg:.1f}" stroke="#d1d5db" stroke-width="0.4"/>'
            )
            parts.append(
                f'<text x="{x0 - 5}" y="{yg + 3:.1f}" font-size="6.5" fill="#374151" text-anchor="end">{n_val:.0f}</text>'
            )
        n_val += step_n

    chain = _cadena_vertices_plano(puntos)
    if len(chain) >= 2:
        pts_str = " ".join(f"{tx(p['este']):.1f},{ty(p['norte']):.1f}" for p in chain)
        cerrada = (pol.get("tipo") or "cerrada") == "cerrada"
        if cerrada and len(chain) >= 3:
            area_m2 = area_por_coordenadas(chain)
            parts.append(
                f'<polygon points="{pts_str}" fill="rgba(0,0,0,0.06)" stroke="#000" stroke-width="0.9"/>'
            )
            cx = sum(tx(p["este"]) for p in chain) / len(chain)
            cy = sum(ty(p["norte"]) for p in chain) / len(chain)
            area_txt = html.escape(f"A = {area_m2:,.2f} m²".replace(",", " "))
            parts.append(
                f'<text x="{cx:.1f}" y="{cy:.1f}" font-size="8" font-weight="700" fill="#111827" '
                f'text-anchor="middle" dominant-baseline="middle">{area_txt}</text>'
            )
        else:
            parts.append(
                f'<polyline points="{pts_str}" fill="none" stroke="#000" stroke-width="0.9"/>'
            )
        for i in range(len(chain) - 1):
            p1, p2 = chain[i], chain[i + 1]
            dist = p2.get("distancia")
            if dist is None or float(dist or 0) <= 0:
                continue
            mx = (tx(p1["este"]) + tx(p2["este"])) / 2
            my = (ty(p1["norte"]) + ty(p2["norte"])) / 2
            parts.append(
                f'<text x="{mx:.1f}" y="{my - 4:.1f}" font-size="6.5" fill="#111827" font-weight="600" '
                f'text-anchor="middle">{float(dist):.2f} m</text>'
            )
        if cerrada and len(chain) >= 3:
            p1, p2 = chain[-1], chain[0]
            dist = chain[-1].get("distancia") or p2.get("distancia")
            if dist and float(dist) > 0:
                mx = (tx(p1["este"]) + tx(p2["este"])) / 2
                my = (ty(p1["norte"]) + ty(p2["norte"])) / 2
                parts.append(
                    f'<text x="{mx:.1f}" y="{my - 4:.1f}" font-size="6.5" fill="#111827" font-weight="600" '
                    f'text-anchor="middle">{float(dist):.2f} m</text>'
                )

    for p in puntos:
        x, y = tx(p["este"]), ty(p["norte"])
        nombre = html.escape(str(p.get("nombre") or ""))
        tipo = p.get("tipo_punto") or "auxiliar"
        if tipo == "auxiliar":
            s = 6
            parts.append(
                f'<polygon points="{x:.1f},{y - s:.1f} {x - s:.1f},{y + s * 0.75:.1f} {x + s:.1f},{y + s * 0.75:.1f}" '
                f'fill="#ea580c" stroke="#9a3412" stroke-width="1"/>'
            )
            label_fill = "#9a3412"
        elif tipo == "amarre":
            s = 5
            parts.append(
                f'<rect x="{x - s:.1f}" y="{y - s:.1f}" width="{s * 2:.1f}" height="{s * 2:.1f}" '
                f'fill="#16a34a" stroke="#fff" stroke-width="1"/>'
            )
            label_fill = "#166534"
        else:
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#111827" stroke="#fff" stroke-width="0.8"/>')
            label_fill = "#111827"
        parts.append(
            f'<text x="{x + 7:.1f}" y="{y - 6:.1f}" font-size="8" font-weight="700" fill="{label_fill}">{nombre}</text>'
        )

    nx, ny = x0 + w - 24, y0 + 18
    parts.append(f'<line x1="{nx}" y1="{ny + 16}" x2="{nx}" y2="{ny}" stroke="#000" stroke-width="0.6"/>')
    parts.append(
        f'<polygon points="{nx},{ny} {nx - 4},{ny + 8} {nx + 4},{ny + 8}" fill="#000"/>'
    )
    parts.append(
        f'<text x="{nx}" y="{ny - 3}" font-size="8" font-weight="700" fill="#000" text-anchor="middle">N</text>'
    )
    if escala_texto and escala_texto != "—":
        bar_m = 50.0
        if ":" in escala_texto:
            try:
                denom = int(escala_texto.split(":")[1].replace(" ", ""))
                bar_m = 50.0 if denom <= 1000 else 100.0
            except ValueError:
                bar_m = 50.0
        bar_px = min(w * 0.22, max(40.0, bar_m * scale_px))
        bx, by = x0 + 10, y0 + h - 14
        parts.append(
            f'<line x1="{bx:.0f}" y1="{by:.0f}" x2="{bx + bar_px:.0f}" y2="{by:.0f}" stroke="#000" stroke-width="0.7"/>'
        )
        parts.append(f'<line x1="{bx:.0f}" y1="{by - 2:.0f}" x2="{bx:.0f}" y2="{by + 2:.0f}" stroke="#000" stroke-width="0.5"/>')
        parts.append(
            f'<line x1="{bx + bar_px:.0f}" y1="{by - 2:.0f}" x2="{bx + bar_px:.0f}" y2="{by + 2:.0f}" stroke="#000" stroke-width="0.5"/>'
        )
        parts.append(
            f'<text x="{bx:.0f}" y="{by - 4:.0f}" font-size="6.5" fill="#000">'
            f'{bar_m:.0f} m · {html.escape(escala_texto)}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


def _escala_plano_sugerida(puntos: list, ancho_util_mm: float = 200.0) -> tuple[str, float]:
    """Escala 1:N para impresión carta horizontal y extensión en metros."""
    if len(puntos) < 2:
        return "—", 0.0
    estes = [p["este"] for p in puntos]
    nortes = [p["norte"] for p in puntos]
    span_m = max(max(estes) - min(estes), max(nortes) - min(nortes), 1.0)
    span_dibujo = span_m * 1.2
    papel_m = ancho_util_mm / 1000.0
    denom_raw = max(span_dibujo / papel_m, 1.0)
    candidatos = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000]
    denom = next((c for c in candidatos if c >= denom_raw), int(round(denom_raw)))
    return f"1:{denom}", span_m


def _filas_tabla_coordenadas_plano(puntos: list) -> str:
    """Filas HTML del cuadro de coordenadas (sin tabla contenedora; evita anidar en PDF)."""
    cell = "padding:1px 4px;font-size:5.5pt;border:1px solid #94a3b8;"
    spacer = '<td width="55%" style="border:none;padding:0;"></td>'
    hdr = (
        f'<th style="{cell}background:#1e40af;color:#fff;">Pto</th>'
        f'<th style="{cell}background:#1e40af;color:#fff;">Norte</th>'
        f'<th style="{cell}background:#1e40af;color:#fff;">Este</th>'
        f'<th style="{cell}background:#1e40af;color:#fff;">Cota</th>'
    )
    rows = f"<tr>{spacer}{hdr}</tr>"
    for p in puntos:
        rows += (
            f"<tr>{spacer}"
            f'<td style="{cell}font-weight:700;">{html.escape(str(p.get("nombre") or ""))}</td>'
            f'<td style="{cell}text-align:right;">{_fmt_pdf_num(p.get("norte"), 3)}</td>'
            f'<td style="{cell}text-align:right;">{_fmt_pdf_num(p.get("este"), 3)}</td>'
            f'<td style="{cell}text-align:right;">{_fmt_pdf_num(p.get("cota"), 3)}</td>'
            "</tr>"
        )
    if len(puntos) == 0:
        rows += f'<tr>{spacer}<td colspan="4" style="{cell}">Sin puntos</td></tr>'
    return rows


def html_tabla_coordenadas_plano(puntos: list) -> str:
    """Cuadro compacto Punto | Norte | Este | Cota."""
    cell = "padding:1px 3px;font-size:5.5pt;border:1px solid #94a3b8;"
    rows = ""
    for p in puntos:
        rows += (
            "<tr>"
            f'<td style="{cell}font-weight:700;">{html.escape(str(p.get("nombre") or ""))}</td>'
            f'<td style="{cell}text-align:right;">{_fmt_pdf_num(p.get("norte"), 3)}</td>'
            f'<td style="{cell}text-align:right;">{_fmt_pdf_num(p.get("este"), 3)}</td>'
            f'<td style="{cell}text-align:right;">{_fmt_pdf_num(p.get("cota"), 3)}</td>'
            "</tr>"
        )
    if not rows:
        rows = f'<tr><td colspan="4" style="{cell}">Sin puntos</td></tr>'
    return f"""
    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1.5px solid #1e40af;width:200px;">
      <tr style="background:#1e40af;color:#fff;">
        <th style="padding:2px 3px;font-size:5.5pt;">Pto</th>
        <th style="padding:2px 3px;font-size:5.5pt;">Norte</th>
        <th style="padding:2px 3px;font-size:5.5pt;">Este</th>
        <th style="padding:2px 3px;font-size:5.5pt;">Cota</th>
      </tr>
      {rows}
    </table>
    """


def html_rotulado_plano(contrato: dict, pol: dict, firmas: List[dict]) -> str:
    """Franja inferior: LOGO | Contrato/Objeto | Contratista | Interventoría | Equipo/Prof. | Fecha."""
    numero = html.escape(str(contrato.get("numero") or ""))
    objeto = html.escape(str(contrato.get("objeto") or ""))
    contratista = html.escape(str(contrato.get("contratista") or ""))
    interventoria = html.escape(str(contrato.get("interventoria") or ""))
    fecha = html.escape(str(pol.get("fecha_campo") or "—"))
    operador = html.escape(str(pol.get("operador") or "—"))
    topo = next((f for f in firmas or [] if f.get("tipo_firmante") == "topografo"), None)
    mat = ""
    if topo:
        operador = html.escape(str(topo.get("nombre_firmante") or operador))
        mat = html.escape(str(topo.get("matricula") or ""))
    equipo = " / ".join(
        x
        for x in [
            pol.get("equipo_marca"),
            pol.get("equipo_referencia"),
            pol.get("equipo_serial") and f"S/N {pol.get('equipo_serial')}",
        ]
        if x
    ) or "—"
    prof = f"{operador}{f' · CPIC {mat}' if mat else ''}"
    logo = _html_logo_pdf(contrato, max_h=34, placeholder_pt=6)
    cell = (
        "padding:3px 5px;font-size:5pt;line-height:1.25;color:#000;"
        "border:0.5px solid #000;vertical-align:top;"
    )
    return f"""
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td width="9%" align="center" style="{cell}">{logo}</td>
        <td width="28%" style="{cell}">
          <b>Contrato</b> {numero}<br/><b>Objeto</b> {objeto}
        </td>
        <td width="17%" style="{cell}"><b>Contratista</b><br/>{contratista}</td>
        <td width="14%" style="{cell}"><b>Interventoría</b><br/>{interventoria}</td>
        <td width="24%" style="{cell}"><b>Equipo</b> {html.escape(str(equipo))}<br/><b>Profesional</b> {prof}</td>
        <td width="8%" style="{cell}"><b>Fecha</b><br/>{fecha}</td>
      </tr>
    </table>
    """


def html_pagina_plano_poligonal(
    contrato: dict,
    pol: dict,
    estaciones: list,
    punto_inicial: Optional[dict],
    firmas: List[dict],
) -> str:
    """Una sola hoja carta horizontal: plano a escala uniforme y rotulado compacto."""
    titulo = f"Plano — {pol.get('nombre', '')}"
    puntos = _puntos_para_plano(estaciones, punto_inicial)
    escala_txt, span_m = _escala_plano_sugerida(puntos)
    svg = svg_plano_poligonal_profesional(
        estaciones, punto_inicial, pol, width=720, height=400, escala_texto=escala_txt
    )
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    rotulado = html_rotulado_plano(contrato, pol, firmas)
    leyenda = (
        '<span style="font-size:5pt;margin-right:6px;">● Est.</span>'
        '<span style="font-size:5pt;margin-right:6px;color:#ea580c;">▲ Aux.</span>'
        '<span style="font-size:5pt;color:#16a34a;">■ Am.</span>'
    )
    info_escala = (
        f'Escala sugerida {html.escape(escala_txt)} · Ext. ~{_fmt_pdf_num(span_m, 1)} m · Carta horizontal'
    )
    return f"""
    <div style="page-break-before:always;"></div>
    <table width="100%" cellspacing="0" cellpadding="0" style="border:0.6px solid #000;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:4px 8px;font-size:10pt;font-weight:700;border-bottom:0.5px solid #000;">
          {html.escape(titulo)}
        </td>
      </tr>
      <tr>
        <td style="padding:2px 8px;font-size:5pt;color:#374151;border-bottom:0.5px solid #e5e7eb;">
          {info_escala}
        </td>
      </tr>
      <tr>
        <td style="padding:2px 4px;background:#fff;line-height:0;">
          <img src="data:image/svg+xml;base64,{b64}" width="720" height="400" style="display:block;" />
        </td>
      </tr>
      <tr>
        <td style="padding:2px 0 3px 0;border-top:0.5px solid #000;background:#fafafa;">
          {rotulado}
          <div style="padding:2px 6px 0;font-size:5pt;color:#374151;">{leyenda}</div>
        </td>
      </tr>
    </table>
    """


def html_documento_poligonal_pdf(
    contrato: dict,
    pol: dict,
    estaciones: list,
    cierre: Optional[dict],
    firmas: List[dict],
    punto_inicial: Optional[dict] = None,
) -> str:
    """HTML: hoja cálculo compacta + hoja plano con rotulado."""
    titulo = f"Poligonal trigonométrica — {pol.get('nombre', '')}"
    bloque_calculo = f"""
    {html_tabla_poligonal_pdf(estaciones, pol)}
    {html_cierre_poligonal_pdf(cierre, pol)}
    """
    pagina_plano = html_pagina_plano_poligonal(contrato, pol, estaciones, punto_inicial, firmas)
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="font-family:Arial,Helvetica,sans-serif;font-size:8pt;margin:8px;color:#0f172a;">
    {html_encabezado_pdf(contrato, titulo)}
    {bloque_calculo}
    {html_firmas_pdf(firmas)}
    {pagina_plano}
    </body></html>"""


def html_encabezado_pdf(contrato: dict, titulo: str) -> str:
    """Encabezado comun para PDFs de topografia."""
    nombre = html.escape(str(contrato.get("objeto") or contrato.get("numero") or ""))
    numero = html.escape(str(contrato.get("numero") or ""))
    contratista = html.escape(str(contrato.get("contratista") or ""))
    interventoria = html.escape(str(contrato.get("interventoria") or ""))
    entidad = html.escape(
        str(contrato.get("entidad") or contrato.get("entidad_otra") or contrato.get("municipio") or "")
    )
    fecha = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    logo = contrato.get("logo_contratista") or ""
    if logo and (str(logo).startswith("http://") or str(logo).startswith("https://")):
        logo = ""
    logo_html = (
        f'<img src="{html.escape(str(logo), quote=True)}" style="max-height:60px;max-width:120px;" />'
        if logo
        else '<div style="border:1px dashed #cbd5e1;padding:8px;font-size:8pt;color:#94a3b8;">LOGO</div>'
    )
    return f"""
    <table width="100%" style="border-bottom:2px solid #1e40af;margin-bottom:12px;">
      <tr>
        <td width="18%" valign="top">{logo_html}</td>
        <td width="64%" valign="middle">
          <div style="font-size:13pt;font-weight:bold;color:#1e293b;">{html.escape(titulo)}</div>
          <div style="font-size:9pt;color:#334155;margin-top:4px;"><b>Contrato N°:</b> {numero}</div>
          <div style="font-size:9pt;color:#475569;"><b>Objeto:</b> {nombre}</div>
          <div style="font-size:8pt;color:#475569;margin-top:3px;">
            <b>Contratista:</b> {contratista} &nbsp;|&nbsp; <b>Interventoría:</b> {interventoria}
          </div>
        </td>
        <td width="18%" align="right" valign="top" style="font-size:8pt;color:#64748b;">
          {entidad}<br/>{fecha}
        </td>
      </tr>
    </table>
    """


def html_pie_pdf(contrato: dict) -> str:
    nombre = html.escape(str(contrato.get("objeto") or contrato.get("numero") or ""))
    return f"""
    <div style="font-size:7pt;color:#64748b;text-align:center;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:6px;">
      Producto ClaraCore para el contrato {nombre}
    </div>
    """


def html_firmas_pdf(firmas: List[dict]) -> str:
    if not firmas:
        return ""
    rows = ""
    for f in firmas:
        img = f.get("firma_base64") or ""
        # No incrustar URLs remotas: xhtml2pdf puede colgarse intentando descargarlas.
        if img.startswith("http://") or img.startswith("https://"):
            img = ""
        img_html = f'<img src="{html.escape(str(img), quote=True)}" style="max-height:50px;" />' if img else ""
        rows += f"""
        <td align="center" width="{100 // max(len(firmas), 1)}%">
          {img_html}<br/>
          <strong>{html.escape(str(f.get('nombre_firmante') or ''))}</strong><br/>
          <span style="font-size:8pt;">{html.escape(str(f.get('cargo_firmante') or ''))}</span><br/>
          <span style="font-size:7pt;">CPIC: {html.escape(str(f.get('matricula') or ''))}</span>
        </td>
        """
    return f'<table width="100%" style="margin-top:20px;"><tr>{rows}</tr></table>'


PDF_LANDSCAPE_CSS = """
<style type="text/css">
@page {
  size: letter landscape;
  margin: 8mm 10mm;
}
</style>
"""


def _inject_pdf_landscape(html_doc: str) -> str:
    if "@page" in html_doc:
        return html_doc
    if "<head>" in html_doc:
        return html_doc.replace("<head>", f"<head>{PDF_LANDSCAPE_CSS}", 1)
    return f"<!DOCTYPE html><html><head>{PDF_LANDSCAPE_CSS}<meta charset=\"utf-8\"/></head><body>{html_doc}</body></html>"


def to_pdf_bytes(html_doc: str, *, landscape: bool = True) -> bytes:
    """Genera PDF con xhtml2pdf (por defecto carta horizontal)."""
    from xhtml2pdf import pisa

    if landscape:
        html_doc = _inject_pdf_landscape(html_doc)
    buf = io.BytesIO()
    src = io.BytesIO(html_doc.encode("utf-8", errors="replace"))
    result = pisa.CreatePDF(src, dest=buf, encoding="utf-8")
    buf.seek(0)
    out = buf.read()
    if not out:
        raise ValueError("xhtml2pdf no produjo bytes")
    if getattr(result, "err", 0):
        pass
    return out
