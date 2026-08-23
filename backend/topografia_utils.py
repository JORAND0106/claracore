"""Utilidades de calculo y generacion de graficos para el modulo Topografia."""
from __future__ import annotations

import base64
import html
import io
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

_PDF_TZ = ZoneInfo("America/Bogota")


def _fecha_informe_pdf() -> str:
    """Fecha/hora local Colombia para encabezados PDF."""
    return datetime.now(_PDF_TZ).strftime("%d/%m/%Y %H:%M")


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


def segundos_arco_a_gms_numero(seg: float) -> float:
    """Convierte segundos de arco al valor numerico GG.MMSS (ej. 23.69 -> 0.002369)."""
    n = float(seg or 0)
    sign = -1.0 if n < 0 else 1.0
    abs_n = abs(n)
    grados = int(abs_n // 3600)
    resto = abs_n - grados * 3600
    minutos = int(resto // 60)
    segundos = round(resto - minutos * 60, 2)
    return sign * (grados + minutos / 100 + segundos / 10000)


def formato_gms_numero_texto(gms: float, grados_pad: int = 2) -> str:
    """Formatea GG.MMSS numerico con ceros a la izquierda (ej. 00.002369)."""
    n = float(gms or 0)
    sign = "-" if n < 0 else ""
    abs_n = abs(n)
    ent, _, frac = f"{abs_n:.6f}".partition(".")
    return f"{sign}{int(ent):0{grados_pad}d}.{frac}"


def segundos_arco_a_gms_texto(seg: float) -> str:
    return formato_gms_numero_texto(segundos_arco_a_gms_numero(seg))


def segundos_arco_a_texto(seg: float) -> str:
    """Formato legible GG°MM'SS'' para error angular en segundos de arco."""
    n = float(seg or 0)
    sign = "-" if n < 0 else ""
    abs_n = abs(n)
    grados = int(abs_n // 3600)
    resto = abs_n - grados * 3600
    minutos = int(resto // 60)
    segundos = round(resto - minutos * 60, 2)
    return f"{sign}{grados:02d}°{minutos:02d}'{segundos:05.2f}\""


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
    punto_final: Optional[dict] = None,
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
        punto_final=punto_final,
        tipo_pol=pol.get("tipo") or "cerrada",
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
    *,
    punto_final: Optional[dict] = None,
    tipo_pol: str = "cerrada",
) -> dict:
    """Calcula cierre angular y lineal (cerrada → al inicio; abierta → a llegada)."""
    tipo_pol = (tipo_pol or "cerrada").lower()
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

    target = None
    end_name = start_name
    if tipo_pol == "abierta" and punto_final:
        end_name = punto_final.get("nombre") or end_name
        if punto_final.get("norte") is not None and punto_final.get("este") is not None:
            target = {
                "norte": punto_final.get("norte"),
                "este": punto_final.get("este"),
                "cota": punto_final.get("cota"),
                "nombre": punto_final.get("nombre"),
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
            if fwd.get("nombre_punto") == end_name and fwd.get("norte") is not None:
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

    if cerrado and retorno and target:
        dN = round(float(target["norte"]) - float(retorno["norte"]), 4)
        dE = round(float(target["este"]) - float(retorno["este"]), 4)
        if target.get("cota") is not None and retorno.get("cota") is not None:
            dZ = round(float(target["cota"]) - float(retorno["cota"]), 4)
        e_lineal = round(math.hypot(dN, dE), 4)
        precision = (perimetro / e_lineal) if e_lineal > 1e-9 else None
    elif cerrado and retorno and start and tipo_pol != "abierta":
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
    area_m2 = area_por_coordenadas(vertices) if len(vertices) >= 3 and tipo_pol != "abierta" else 0.0
    tol_res643 = tolerancia_relativa_res643(area_m2)
    lados = _lados_poligonal(vertices, cerrado and tipo_pol != "abierta")
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
        "tipo_pol": tipo_pol,
        "llegada_objetivo": target,
        "llegada_calculada": (
            {
                "nombre": retorno.get("nombre_punto"),
                "norte": retorno.get("norte"),
                "este": retorno.get("este"),
                "cota": retorno.get("cota"),
            }
            if retorno and tipo_pol == "abierta"
            else None
        ),
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


def _interseccion_circulos(
    n1: float, e1: float, r1: float, n2: float, e2: float, r2: float,
) -> list[tuple[float, float]]:
    """Interseccion de dos circulos (centros P1/P2, radios = distancias medidas)."""
    dn = n2 - n1
    de = e2 - e1
    d = math.hypot(dn, de)
    if d < 1e-9:
        return []
    if d > r1 + r2 + 1e-6 or d < abs(r1 - r2) - 1e-6:
        return []
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
    h2 = r1 * r1 - a * a
    if h2 < -1e-6:
        return []
    h = math.sqrt(max(0.0, h2))
    n0 = n1 + a * dn / d
    e0 = e1 + a * de / d
    px, py = -de / d, dn / d
    return [(n0 + h * px, e0 + h * py), (n0 - h * px, e0 - h * py)]


def _angulo_interior_estacion(
    nu: float, eu: float, n1: float, e1: float, n2: float, e2: float,
) -> float:
    """Angulo interior en la estacion entre las visuales a P1 y P2 (grados, 0–180)."""
    v1n, v1e = n1 - nu, e1 - eu
    v2n, v2e = n2 - nu, e2 - eu
    d1 = math.hypot(v1n, v1e)
    d2 = math.hypot(v2n, v2e)
    if d1 < 1e-9 or d2 < 1e-9:
        return 0.0
    cos_a = max(-1.0, min(1.0, (v1n * v2n + v1e * v2e) / (d1 * d2)))
    return math.degrees(math.acos(cos_a))


def _punto_dentro_poligono(n: float, e: float, vertices: list[tuple[float, float]]) -> bool:
    """Ray casting: True si (norte, este) cae dentro del poligono."""
    if len(vertices or []) < 3:
        return False
    x, y = e, n
    inside = False
    j = len(vertices) - 1
    for i in range(len(vertices)):
        ni, ei = vertices[i]
        nj, ej = vertices[j]
        yi, xi = ni, ei
        yj, xj = nj, ej
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def _detalle_opcion_newpoint(
    letra: str,
    nu: float, eu: float,
    n1: float, e1: float, n2: float, e2: float,
    alpha_deg: float,
    vertices_poligonal: list[tuple[float, float]] | None,
) -> dict:
    ang_int = _angulo_interior_estacion(nu, eu, n1, e1, n2, e2)
    err_ang = abs(ang_int - alpha_deg) * 3600
    inside = (
        _punto_dentro_poligono(nu, eu, vertices_poligonal)
        if vertices_poligonal and len(vertices_poligonal) >= 3
        else None
    )
    return {
        "id": letra,
        "norte": round(nu, 4),
        "este": round(eu, 4),
        "error_angular_segundos": round(err_ang, 2),
        "error_angular_gms_texto": segundos_arco_a_texto(err_ang),
        "angulo_calculado_texto": decimal_to_gms(ang_int),
        "dentro_poligonal": inside,
    }


def newpoint_por_angulo_distancias(
    n1: float, e1: float, d1: float,
    n2: float, e2: float, d2: float,
    angulo_observado_gms: float,
    vertices_poligonal: list[tuple[float, float]] | None = None,
) -> dict:
    """NewPoint: calcula opciones A y B (soluciones espejo); el usuario elige en campo."""
    alpha_deg = gms_to_decimal(angulo_observado_gms)
    alpha = math.radians(alpha_deg)
    d_p1p2 = math.hypot(n2 - n1, e2 - e1)
    d_triangulo = math.sqrt(max(0.0, d1 * d1 + d2 * d2 - 2 * d1 * d2 * math.cos(alpha)))
    error_lineal_medicion = abs(d_p1p2 - d_triangulo)

    candidatos = _interseccion_circulos(n1, e1, d1, n2, e2, d2)
    if not candidatos:
        a_n = n2 - n1
        a_e = e2 - e1
        c = -d1 + d2 * math.cos(alpha)
        s = d2 * math.sin(alpha)
        if abs(c) < 1e-12 and abs(s) < 1e-12:
            raise ValueError("Geometria degenerada: revise distancias y angulo observado.")
        theta = math.atan2(a_e, a_n) - math.atan2(s, c)
        candidatos = [(n1 - d1 * math.cos(theta), e1 - d1 * math.sin(theta))]

    # Orden estable: A = menor norte (desempate este)
    candidatos = sorted(candidatos, key=lambda p: (p[0], p[1]))
    letras = ["A", "B"]
    opciones = [
        _detalle_opcion_newpoint(letras[i], nu, eu, n1, e1, n2, e2, alpha_deg, vertices_poligonal)
        for i, (nu, eu) in enumerate(candidatos[:2])
    ]
    err_ang_ref = opciones[0]["error_angular_segundos"] if opciones else 0.0

    return {
        "opciones": opciones,
        "distancia_p1p2": round(d_p1p2, 4),
        "distancia_triangulo": round(d_triangulo, 4),
        "error_lineal": round(error_lineal_medicion, 4),
        "error_angular_segundos": err_ang_ref,
        "error_angular_gms_texto": segundos_arco_a_texto(err_ang_ref),
    }


def desarrollo_triangulo_reseccion_newpoint(
    nu: float, eu: float,
    n1: float, e1: float, d1: float,
    n2: float, e2: float, d2: float,
    angulo_observado_gms: float,
) -> dict:
    """Desarrollo completo del triángulo de resección: elementos, ángulos y radiaciones."""
    gamma_deg = gms_to_decimal(angulo_observado_gms)
    gamma_rad = math.radians(gamma_deg)

    dn12 = n2 - n1
    de12 = e2 - e1
    c = math.hypot(dn12, de12)
    a = d2
    b = d1

    c_cos = math.sqrt(max(0.0, b * b + a * a - 2 * b * a * math.cos(gamma_rad)))
    err_c = abs(c - c_cos)

    cos_beta = max(-1.0, min(1.0, (b * b + c * c - a * a) / (2 * b * c))) if b * c > 0 else 0.0
    cos_delta = max(-1.0, min(1.0, (a * a + c * c - b * b) / (2 * a * c))) if a * c > 0 else 0.0
    beta_deg = math.degrees(math.acos(cos_beta))
    delta_deg = math.degrees(math.acos(cos_delta))

    az_12 = math.degrees(math.atan2(de12, dn12)) % 360
    az_21 = math.degrees(math.atan2(-de12, -dn12)) % 360
    az_1p = math.degrees(math.atan2(eu - e1, nu - n1)) % 360
    az_2p = math.degrees(math.atan2(eu - e2, nu - n2)) % 360

    giro_p1 = (az_1p - az_12 + 360) % 360
    signo_p1 = "+" if giro_p1 <= 180 else "−"
    az_1p_calc = (az_12 + beta_deg) % 360 if giro_p1 <= 180 else (az_12 - beta_deg + 360) % 360

    giro_p2 = (az_2p - az_21 + 360) % 360
    signo_p2 = "+" if giro_p2 <= 180 else "−"
    az_2p_calc = (az_21 + delta_deg) % 360 if giro_p2 <= 180 else (az_21 - delta_deg + 360) % 360

    n_rad_p1 = n1 + b * math.cos(math.radians(az_1p))
    e_rad_p1 = e1 + b * math.sin(math.radians(az_1p))
    n_rad_p2 = n2 + a * math.cos(math.radians(az_2p))
    e_rad_p2 = e2 + a * math.sin(math.radians(az_2p))

    d_chk_p1 = math.hypot(n1 - nu, e1 - eu)
    d_chk_p2 = math.hypot(n2 - nu, e2 - eu)
    ang_chk = _angulo_interior_estacion(nu, eu, n1, e1, n2, e2)
    err_ang = abs(ang_chk - gamma_deg) * 3600

    return {
        "delta_n_12": round(dn12, 4),
        "delta_e_12": round(de12, 4),
        "lado_a_p2_puesto": round(a, 4),
        "lado_b_p1_puesto": round(b, 4),
        "lado_c_p1_p2": round(c, 4),
        "lado_c_cosenos": round(c_cos, 4),
        "error_lado_c": round(err_c, 4),
        "angulo_puesto_gamma_texto": decimal_to_gms(gamma_deg),
        "angulo_p1_beta_texto": decimal_to_gms(beta_deg),
        "angulo_p2_delta_texto": decimal_to_gms(delta_deg),
        "cos_beta": round(cos_beta, 6),
        "cos_delta": round(cos_delta, 6),
        "azimut_p1_p2_texto": decimal_to_gms(az_12),
        "azimut_p2_p1_texto": decimal_to_gms(az_21),
        "azimut_p1_puesto_texto": decimal_to_gms(az_1p),
        "azimut_p2_puesto_texto": decimal_to_gms(az_2p),
        "azimut_p1_puesto_desde_beta_texto": decimal_to_gms(az_1p_calc),
        "azimut_p2_puesto_desde_delta_texto": decimal_to_gms(az_2p_calc),
        "signo_beta": signo_p1,
        "signo_delta": signo_p2,
        "n_radiacion_p1": round(n_rad_p1, 4),
        "e_radiacion_p1": round(e_rad_p1, 4),
        "n_radiacion_p2": round(n_rad_p2, 4),
        "e_radiacion_p2": round(e_rad_p2, 4),
        "norte_puesto": round(nu, 4),
        "este_puesto": round(eu, 4),
        "distancia_calc_p1": round(d_chk_p1, 4),
        "distancia_calc_p2": round(d_chk_p2, 4),
        "error_dist_p1": round(abs(d_chk_p1 - b), 4),
        "error_dist_p2": round(abs(d_chk_p2 - a), 4),
        "angulo_calculado_texto": decimal_to_gms(ang_chk),
        "angulo_observado_texto": decimal_to_gms(gamma_deg),
        "error_angular_gms_texto": segundos_arco_a_texto(err_ang),
    }


def demostracion_calculo_newpoint(
    nu: float, eu: float,
    n1: float, e1: float, d1_obs: float,
    n2: float, e2: float, d2_obs: float,
    angulo_observado_gms: float,
) -> dict:
    """Alias compacto sobre desarrollo_triangulo_reseccion_newpoint."""
    d = desarrollo_triangulo_reseccion_newpoint(
        nu, eu, n1, e1, d1_obs, n2, e2, d2_obs, angulo_observado_gms,
    )
    return {
        **d,
        "distancia_p1p2": d["lado_c_p1_p2"],
        "distancia_triangulo": d["lado_c_cosenos"],
        "error_lineal_triangulo": d["error_lado_c"],
    }


def faltantes_campo_newpoint(row: dict) -> list[str]:
    """Campos obligatorios de campo antes de validación contratista (nivel 1)."""
    labels = {
        "operador": "operador",
        "fecha": "fecha de campo",
        "equipo_marca": "marca del equipo",
        "equipo_referencia": "modelo / referencia del equipo",
        "equipo_serial": "serial del equipo",
    }
    falt: list[str] = []
    for key, label in labels.items():
        val = row.get(key)
        if val is None or not str(val).strip():
            falt.append(label)
    return falt


def media_hilos_nivelacion(h_sup, h_med, h_inf) -> float | None:
    """Media aritmética de hilos de nivel automático (solo valores no nulos)."""
    vals = [v for v in (h_sup, h_med, h_inf) if v is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


STADIA_K = 100


def distancia_taquimetrica_nivelacion(
    h_sup: float | None, h_inf: float | None, k: float = STADIA_K
) -> float | None:
    """Distancia horizontal taquimétrica: K × |hilo inf − hilo sup|."""
    if h_sup is None or h_inf is None:
        return None
    return abs(float(h_inf) - float(h_sup)) * float(k)


def distancia_lectura_nivelacion(lect: dict, tipo_nivel: str) -> float | None:
    """Distancia de una lectura: taquimétrica (automático) o manual (electrónico)."""
    if tipo_nivel == "automatico":
        return distancia_taquimetrica_nivelacion(
            lect.get("hilo_superior"), lect.get("hilo_inferior")
        )
    d = lect.get("distancia_m")
    return float(d) if d is not None else None


def lectura_efectiva_nivelacion(lect: dict, tipo_nivel: str) -> float | None:
    """Lectura de cálculo: hilo medio (automático) o lectura directa (electrónico)."""
    h_med = lect.get("hilo_medio")
    lectura = lect.get("lectura")
    if tipo_nivel == "automatico":
        if h_med is not None:
            return float(h_med)
        if lectura is not None:
            return float(lectura)
        return None
    if lectura is not None:
        return float(lectura)
    if h_med is not None:
        return float(h_med)
    return None


def _tipos_procesamiento_grupo(grupo: list[dict]) -> list[str]:
    orden = ["V-", "Vi", "V+"]
    presentes = set()
    for l in grupo:
        t = (l.get("tipo_lectura") or "").strip().replace("V−", "V-")
        if t.upper() == "VI":
            t = "Vi"
        elif t == "V+":
            t = "V+"
        presentes.add(t)
    return [t for t in orden if t in presentes]


def _agrupar_lecturas_por_fila(lecturas: list[dict]) -> list[list[dict]]:
    ordenadas = sorted(lecturas, key=lambda x: x.get("orden") or 0)
    if not ordenadas:
        return []
    if all((l.get("orden") or 0) < 10 for l in ordenadas):
        return [[l] for l in ordenadas]
    grupos: dict[int, list[dict]] = {}
    for lect in ordenadas:
        o = lect.get("orden") or 0
        rk = (o - 1) // 10
        grupos.setdefault(rk, []).append(lect)
    return [grupos[k] for k in sorted(grupos)]


def calcular_nivelacion_geometrica(
    nivelacion: dict,
    lecturas: list[dict],
    cotas_biblioteca: dict[str, float],
    bm_inicial_nombre: str | None = None,
    bm_final_nombre: str | None = None,
) -> dict:
    """
    Calcula HI, cotas, error de cierre y semáforo para nivelación geométrica.

    cotas_biblioteca: mapa nombre_punto -> cota (m) desde biblioteca / BM inicial-final.
    """
    dist_max = float(nivelacion.get("distancia_max_visual_m") or 50)
    max_km = float(nivelacion.get("distancia_max_circuito_km") or 1)
    tol_mm_km = float(nivelacion.get("tolerancia_mm_km") or 1)
    tipo_nivel = nivelacion.get("tipo_nivel") or "electronico"

    errores: list[str] = []
    avisos: list[str] = []
    hi: float | None = None
    cotas: dict[str, float] = dict(cotas_biblioteca)
    dist_total_m = 0.0
    dist_vplus_m = 0.0
    dist_vminus_m = 0.0
    filas: list[dict] = []
    grupos = _agrupar_lecturas_por_fila(lecturas)

    for g_idx, grupo in enumerate(grupos):
        lect_por_tipo = {}
        for lect in grupo:
            row = dict(lect)
            tipo_lect = (row.get("tipo_lectura") or "").strip()
            if tipo_lect.upper() in ("V+",):
                tipo_lect = "V+"
            elif tipo_lect in ("V-", "V−"):
                tipo_lect = "V-"
            elif tipo_lect.upper() == "VI":
                tipo_lect = "Vi"
            lect_por_tipo[tipo_lect] = row

        for tipo_lect in ("V+", "V-"):
            row = lect_por_tipo.get(tipo_lect)
            if not row:
                continue
            if lectura_efectiva_nivelacion(row, tipo_nivel) is None:
                continue
            dist = row.get("distancia_m")
            if dist is None and tipo_nivel == "automatico":
                dist = distancia_taquimetrica_nivelacion(
                    row.get("hilo_superior"), row.get("hilo_inferior")
                )
                if dist is not None:
                    row["distancia_m"] = round(dist, 3)
            if dist is None:
                continue
            try:
                d = abs(float(dist))
            except (TypeError, ValueError):
                errores.append(f"Fila {g_idx + 1}: distancia inválida en {tipo_lect}.")
                continue
            dist_total_m += d
            if tipo_lect == "V+":
                dist_vplus_m += d
            else:
                dist_vminus_m += d
            if d > dist_max:
                errores.append(
                    f"Fila {g_idx + 1}: Dist ({tipo_lect}) {d:.2f} m supera el tope de {dist_max:.0f} m."
                )

        cota_calculada_fila: float | None = None

        for tipo_lect in _tipos_procesamiento_grupo(grupo):
            row = lect_por_tipo.get(tipo_lect)
            if not row:
                continue
            lectura = lectura_efectiva_nivelacion(row, tipo_nivel)
            if lectura is None:
                errores.append(f"Fila {g_idx + 1}: falta hilo medio en {tipo_lect}.")
                filas.append(row)
                continue

            nombre = (row.get("nombre_punto") or row.get("nombre") or "").strip()

            if tipo_lect == "V+":
                cota_ref = cotas.get(nombre)
                if cota_ref is None:
                    cota_ref = cota_calculada_fila
                if cota_ref is None:
                    errores.append(
                        f"Fila {g_idx + 1} ({nombre or 'cambio'}): V+ requiere cota "
                        f"(biblioteca, V−/Vi previa o V− en la misma fila)."
                    )
                else:
                    hi = cota_ref + float(lectura)
                    row["altura_instrumento"] = round(hi, 4)
                    row["cota_calculada"] = round(cota_ref, 4)
            elif tipo_lect in ("V-", "Vi"):
                if hi is None:
                    errores.append(
                        f"Fila {g_idx + 1}: {tipo_lect} sin altura instrumental previa (falta V+ en BM o cambio)."
                    )
                else:
                    cota = hi - float(lectura)
                    cota_calculada_fila = cota
                    row["cota_calculada"] = round(cota, 4)
                    row["altura_instrumento"] = round(hi, 4)
                    if nombre:
                        cotas[nombre] = cota

            filas.append(row)

    dist_km = dist_total_m / 1000.0
    dist_vplus_km = dist_vplus_m / 1000.0
    dist_vminus_km = dist_vminus_m / 1000.0
    if dist_vplus_km > max_km:
        errores.append(
            f"Distancia V+ {dist_vplus_km:.3f} km supera el máximo de {max_km:.1f} km."
        )
    if dist_vminus_km > max_km:
        errores.append(
            f"Distancia V− {dist_vminus_km:.3f} km supera el máximo de {max_km:.1f} km."
        )
    if dist_km > max_km:
        errores.append(
            f"Distancia total del circuito {dist_km:.3f} km supera el máximo de {max_km:.1f} km."
        )

    bm_ini = (bm_inicial_nombre or nivelacion.get("bm_inicial") or "").strip()
    bm_fin = (bm_final_nombre or nivelacion.get("bm_final") or "").strip()
    cota_bm_fin_bib = cotas_biblioteca.get(bm_fin) if bm_fin else None

    grupos_cierre = _agrupar_lecturas_por_fila(lecturas)
    ultimo_grupo = grupos_cierre[-1] if grupos_cierre else []
    tiene_fila_cierre = bool(ultimo_grupo) and _grupo_es_cierre(ultimo_grupo, bm_fin)
    tiene_vminus_cierre = (
        _fila_tiene_lectura_vminus(ultimo_grupo, tipo_nivel) if tiene_fila_cierre else False
    )

    cota_fin_calc = _cota_vminus_cierre(filas) if tiene_vminus_cierre else None
    if cota_fin_calc is None and bm_fin:
        cota_fin_calc = cotas.get(bm_fin)
    if cota_fin_calc is None and filas:
        ult = filas[-1]
        cota_fin_calc = ult.get("cota_calculada")

    error_cierre: float | None = None
    if not tiene_fila_cierre or not tiene_vminus_cierre:
        avisos.append("Ingrese cierre: use «Ingresar cierre» y registre V− en el BM final.")
    elif cota_fin_calc is not None and cota_bm_fin_bib is not None:
        error_cierre = float(cota_fin_calc) - float(cota_bm_fin_bib)
    elif bm_ini and bm_fin and bm_ini == bm_fin and tiene_vminus_cierre:
        cota_ini = cotas_biblioteca.get(bm_ini)
        if cota_ini is not None and cota_fin_calc is not None:
            error_cierre = float(cota_fin_calc) - float(cota_ini)

    tolerancia_m: float | None = None
    admisible = False
    if error_cierre is not None and dist_km > 0 and tiene_fila_cierre and tiene_vminus_cierre:
        tolerancia_m = (tol_mm_km * math.sqrt(dist_km)) / 1000.0
        admisible = abs(error_cierre) <= tolerancia_m and not errores
        if not admisible and not errores:
            avisos.append(
                f"Error de cierre {error_cierre * 1000:.2f} mm excede tolerancia "
                f"{tolerancia_m * 1000:.2f} mm ({tol_mm_km} mm/km × √{dist_km:.3f})."
            )
    elif not bm_fin:
        avisos.append("Defina BM final en biblioteca para error de cierre.")
    elif error_cierre is None:
        avisos.append("No se pudo calcular error de cierre: verifique lecturas y BM.")

    n = len(filas)
    if error_cierre is not None and n > 0:
        for i, row in enumerate(filas, start=1):
            corr = -(error_cierre * i / n)
            row["correccion"] = round(corr, 6)
            cc = row.get("cota_calculada")
            if cc is not None:
                row["cota_ajustada"] = round(float(cc) + corr, 4)

    semaforo = "verde" if admisible else "rojo"

    return {
        "lecturas": filas,
        "altura_instrumento_ultima": hi,
        "distancia_total_m": round(dist_total_m, 3),
        "distancia_total_km": round(dist_km, 4),
        "distancia_vplus_m": round(dist_vplus_m, 3),
        "distancia_vminus_m": round(dist_vminus_m, 3),
        "distancia_vplus_km": round(dist_vplus_km, 4),
        "distancia_vminus_km": round(dist_vminus_km, 4),
        "distancia_km": round(dist_km, 4),
        "error_cierre": round(error_cierre, 6) if error_cierre is not None else None,
        "tolerancia_cierre": round(tolerancia_m, 6) if tolerancia_m is not None else None,
        "tolerancia": round(tolerancia_m, 6) if tolerancia_m is not None else None,
        "tolerancia_calculada": round(tolerancia_m, 6) if tolerancia_m is not None else None,
        "admisible": admisible,
        "semaforo": semaforo,
        "errores": errores,
        "avisos": avisos,
        "cotas": {k: round(v, 4) for k, v in cotas.items()},
    }


def _fila_tiene_lectura_vminus(lecturas_grupo: list[dict], tipo_nivel: str) -> bool:
    for l in lecturas_grupo:
        if (l.get("tipo_lectura") or "").replace("V−", "V-") != "V-":
            continue
        if lectura_efectiva_nivelacion(l, tipo_nivel) is not None:
            return True
    return False


def _fila_tiene_lectura_vplus(lecturas_grupo: list[dict], tipo_nivel: str) -> bool:
    for l in lecturas_grupo:
        if (l.get("tipo_lectura") or "").strip() != "V+":
            continue
        if lectura_efectiva_nivelacion(l, tipo_nivel) is not None:
            return True
    return False


def _fila_tiene_lectura_vi(lecturas_grupo: list[dict], tipo_nivel: str) -> bool:
    for l in lecturas_grupo:
        t = (l.get("tipo_lectura") or "").strip().upper()
        if t not in ("VI",):
            continue
        if lectura_efectiva_nivelacion(l, tipo_nivel) is not None:
            return True
    return False


def _grupo_es_cierre(grupo: list[dict], bm_fin: str | None = None) -> bool:
    if any(l.get("punto_biblioteca_id") for l in grupo):
        return True
    if not grupo:
        return False
    g0 = grupo[0]
    desc = (g0.get("descripcion_punto") or g0.get("ubicacion") or "").lower()
    if "cierre" in desc:
        return True
    if bm_fin:
        nombre = (g0.get("nombre_punto") or "").strip()
        if nombre and nombre == bm_fin.strip():
            return True
    return False


def _cota_vminus_cierre(filas_calc: list[dict]) -> float | None:
    """Cota de la última V− (lectura de cierre)."""
    for row in reversed(filas_calc):
        if (row.get("tipo_lectura") or "").replace("V−", "V-") != "V-":
            continue
        cc = row.get("cota_calculada")
        if cc is not None:
            return float(cc)
    return None


def _fila_vplus_sin_vista(grupo: list[dict], g_idx: int, tipo_nivel: str, grupos: list | None = None) -> bool:
    if g_idx == 0:
        return False
    if not _fila_tiene_lectura_vplus(grupo, tipo_nivel):
        return False
    if grupos and g_idx + 1 < len(grupos) and _grupo_es_cierre(grupos[g_idx + 1]):
        return False
    return not _fila_tiene_lectura_vminus(grupo, tipo_nivel) and not _fila_tiene_lectura_vi(grupo, tipo_nivel)


def _abscisa_numerica_valida(abscisa: str) -> bool:
    s = (abscisa or "").strip().replace(",", ".")
    if not s:
        return False
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False


def validar_lecturas_nivelacion(
    lecturas: list[dict],
    tipo_nivel: str,
    bm_inicial_nombre: str | None = None,
) -> list[str]:
    errores: list[str] = []
    grupos = _agrupar_lecturas_por_fila(lecturas)
    for g_idx, grupo in enumerate(grupos):
        nombre = (grupo[0].get("nombre_punto") or "").strip()
        if g_idx == 0 and bm_inicial_nombre:
            nombre = bm_inicial_nombre
        abscisa = (grupo[0].get("abscisa") or "").strip()
        desc = (grupo[0].get("descripcion_punto") or grupo[0].get("ubicacion") or "").strip()
        tipo = (grupo[0].get("tipo_punto") or "").strip()
        if g_idx == 0 and not tipo:
            tipo = "BM"
        if tipo == "TP":
            tipo = "estacion"
        tiene_lect = any(lectura_efectiva_nivelacion(l, tipo_nivel) is not None for l in grupo)
        if tiene_lect:
            if not nombre or not abscisa or not desc or not tipo:
                errores.append(f"Fila {g_idx + 1}: complete nombre, abscisa, descripción y tipo.")
            elif not _abscisa_numerica_valida(abscisa):
                errores.append(f"Fila {g_idx + 1}: la abscisa debe ser numérica.")
            if (
                g_idx > 0
                and _fila_tiene_lectura_vplus(grupo, tipo_nivel)
                and not _fila_tiene_lectura_vminus(grupo, tipo_nivel)
            ):
                errores.append(f"Fila {g_idx + 1}: V+ requiere V− en la misma fila (cambio).")
            if _fila_vplus_sin_vista(grupo, g_idx, tipo_nivel, grupos):
                errores.append(
                    f"Fila {g_idx + 1}: V+ sin Vi ni V−. Registre vista adelante o borre la V+."
                )
    for g_idx, grupo in enumerate(grupos):
        if _grupo_es_cierre(grupo) and not _fila_tiene_lectura_vminus(grupo, tipo_nivel):
            errores.append(f"Fila {g_idx + 1}: complete la lectura V− en el punto de cierre.")
    if grupos:
        ultimo = grupos[-1]
        if _grupo_es_cierre(ultimo):
            pass
        elif _fila_tiene_lectura_vminus(ultimo, tipo_nivel) and not _fila_tiene_lectura_vplus(ultimo, tipo_nivel):
            errores.append("La última fila tiene V− sin V+. Complete el cambio o el cierre del tramo.")
        ult_idx = len(grupos) - 1
        if (
            not _grupo_es_cierre(ultimo)
            and _fila_tiene_lectura_vplus(ultimo, tipo_nivel)
            and not _fila_tiene_lectura_vminus(ultimo, tipo_nivel)
            and not _fila_tiene_lectura_vi(ultimo, tipo_nivel)
        ):
            errores.append("La última fila tiene V+ sin Vi ni V−. Complete el tramo o ingrese cierre.")
    return errores


def faltantes_campo_nivelacion(row: dict) -> list[str]:
    """Campos obligatorios de campo antes de validación contratista (nivel 1)."""
    labels = {
        "operador": "operador",
        "equipo_marca": "marca del equipo",
        "equipo_referencia": "modelo / referencia del equipo",
        "equipo_serial": "serial del equipo",
    }
    falt: list[str] = []
    for key, label in labels.items():
        val = row.get(key)
        if val is None or not str(val).strip():
            falt.append(label)
    return falt


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


def svg_newpoint_opciones(
    vertices_poligonal: list[dict],
    p1: dict,
    p2: dict,
    opciones: list[dict],
    *,
    opcion_elegida: str | None = None,
    nombre_nuevo: str = "",
    punto_resultado: dict | None = None,
    width: int = 560,
    height: int = 420,
    titulo: str = "NewPoint",
) -> str:
    """SVG: poligonal completa, amarres P1/P2 resaltados y opciones A/B."""
    todos: list[dict] = []
    for v in vertices_poligonal or []:
        if v.get("norte") is not None and v.get("este") is not None:
            todos.append({"norte": v["norte"], "este": v["este"]})
    for pt in (p1, p2):
        if pt.get("norte") is not None and pt.get("este") is not None:
            todos.append(pt)
    for op in opciones or []:
        if op.get("norte") is not None and op.get("este") is not None:
            todos.append(op)
    if punto_resultado and punto_resultado.get("norte") is not None:
        todos.append(punto_resultado)
    if not todos:
        return f'<svg width="{width}" height="{height}"><text x="10" y="20">Sin datos</text></svg>'

    nortes = [p["norte"] for p in todos]
    estes = [p["este"] for p in todos]
    min_n, max_n = min(nortes), max(nortes)
    min_e, max_e = min(estes), max(estes)
    pad = max((max_n - min_n), (max_e - min_e), 1) * 0.12
    min_n -= pad
    max_n += pad
    min_e -= pad
    max_e += pad

    def tx(e):
        return 44 + (e - min_e) / max(max_e - min_e, 0.001) * (width - 88)

    def ty(n):
        return height - 44 - (n - min_n) / max(max_n - min_n, 0.001) * (height - 88)

    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="100%" height="100%" fill="#f8fafc"/>',
    ]
    if titulo:
        parts.append(
            f'<text x="{width / 2:.0f}" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">'
            f'{html.escape(titulo)}</text>'
        )

    if vertices_poligonal and len(vertices_poligonal) >= 3:
        coords = " ".join(f"{tx(v['este'])},{ty(v['norte'])}" for v in vertices_poligonal)
        parts.append(
            f'<polygon points="{coords}" fill="#2563eb" fill-opacity="0.12" stroke="#64748b" stroke-width="2"/>'
        )
        for v in vertices_poligonal:
            x, y = tx(v["este"]), ty(v["norte"])
            nm = html.escape(str(v.get("nombre") or ""))
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#64748b"/>')
            if nm:
                parts.append(
                    f'<text x="{x + 5:.1f}" y="{y - 4:.1f}" font-size="8" fill="#64748b">{nm}</text>'
                )

    x1, y1 = tx(p1["este"]), ty(p1["norte"])
    x2, y2 = tx(p2["este"]), ty(p2["norte"])
    parts.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4,3"/>')

    colores = {"A": "#16a34a", "B": "#7c3aed"}
    if punto_resultado and punto_resultado.get("norte") is not None:
        xo, yo = tx(float(punto_resultado["este"])), ty(float(punto_resultado["norte"]))
        parts.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{xo:.1f}" y2="{yo:.1f}" stroke="#94a3b8" stroke-width="0.8" opacity="0.7"/>')
        parts.append(f'<line x1="{x2:.1f}" y1="{y2:.1f}" x2="{xo:.1f}" y2="{yo:.1f}" stroke="#94a3b8" stroke-width="0.8" opacity="0.7"/>')
        lbl = html.escape(str(punto_resultado.get("nombre") or nombre_nuevo or "P"))
        parts.append(
            f'<circle cx="{xo:.1f}" cy="{yo:.1f}" r="9" fill="#16a34a" fill-opacity="0.3" '
            f'stroke="#16a34a" stroke-width="3"/>'
        )
        parts.append(
            f'<text x="{xo:.1f}" y="{yo - 12:.1f}" text-anchor="middle" font-size="10" font-weight="700" fill="#16a34a">{lbl}</text>'
        )
    else:
        for op in opciones or []:
            oid = str(op.get("id") or "")
            xo, yo = tx(op["este"]), ty(op["norte"])
            parts.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{xo:.1f}" y2="{yo:.1f}" stroke="#94a3b8" stroke-width="0.8" opacity="0.7"/>')
            parts.append(f'<line x1="{x2:.1f}" y1="{y2:.1f}" x2="{xo:.1f}" y2="{yo:.1f}" stroke="#94a3b8" stroke-width="0.8" opacity="0.7"/>')
            color = colores.get(oid, "#0f766e")
            sel = oid and oid == (opcion_elegida or "")
            r = 9 if sel else 7
            sw = 3 if sel else 1.5
            parts.append(
                f'<circle cx="{xo:.1f}" cy="{yo:.1f}" r="{r}" fill="{color}" fill-opacity="0.25" '
                f'stroke="{color}" stroke-width="{sw}"/>'
            )
            lbl = oid or "?"
            parts.append(
                f'<text x="{xo:.1f}" y="{yo - 12:.1f}" text-anchor="middle" font-size="11" font-weight="700" fill="{color}">{lbl}</text>'
            )
            if sel and nombre_nuevo:
                parts.append(
                    f'<text x="{xo:.1f}" y="{yo + 18:.1f}" text-anchor="middle" font-size="9" fill="#1e293b">'
                    f'{html.escape(nombre_nuevo)}</text>'
                )

    for pt, label, fill, r in (
        (p1, p1.get("nombre", "P1"), "#f59e0b", 8),
        (p2, p2.get("nombre", "P2"), "#f59e0b", 8),
    ):
        xp, yp = tx(pt["este"]), ty(pt["norte"])
        parts.append(
            f'<circle cx="{xp:.1f}" cy="{yp:.1f}" r="{r}" fill="{fill}" fill-opacity="0.35" '
            f'stroke="#d97706" stroke-width="2"/>'
        )
        parts.append(
            f'<text x="{xp:.1f}" y="{yp - 12:.1f}" text-anchor="middle" font-size="10" font-weight="700" fill="#b45309">'
            f'{html.escape(str(label))}</text>'
        )

    parts.append(f'<text x="{width - 22}" y="22" font-size="10" fill="#64748b">N</text>')
    parts.append(f'<line x1="{width - 22}" y1="28" x2="{width - 22}" y2="10" stroke="#64748b" stroke-width="1.5"/>')
    parts.append("</svg>")
    return "".join(parts)


def svg_embed_pdf(svg: str, width: int, height: int) -> str:
    """Inserta SVG como imagen base64 (WeasyPrint no renderiza bien SVG inline con rgba)."""
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return (
        f'<img src="data:image/svg+xml;base64,{b64}" '
        f'width="{width}" height="{height}" style="display:block;margin:0 auto;" alt="Plano"/>'
    )


def svg_newpoint_resultado(
    vertices_poligonal: list[dict],
    p1: dict,
    p2: dict,
    puesto: dict,
    *,
    width: int = 340,
    height: int = 300,
    titulo: str = "Plano — poligonal y puesto",
) -> str:
    """SVG para informe: poligonal, amarres y único punto resultado."""
    return svg_newpoint_opciones(
        vertices_poligonal, p1, p2, [],
        punto_resultado={
            "nombre": puesto.get("nombre"),
            "norte": puesto.get("norte"),
            "este": puesto.get("este"),
        },
        width=width, height=height, titulo=titulo,
    )


def svg_interseccion(
    p1: dict, p2: dict, pn: dict,
    width: int = 500, height: int = 400,
    titulo: str = "Interseccion de coordenadas",
) -> str:
    """SVG del triangulo de interseccion / NewPoint."""
    puntos = [
        {"nombre": p1.get("nombre", "P1"), "norte": p1["norte"], "este": p1["este"]},
        {"nombre": p2.get("nombre", "P2"), "norte": p2["norte"], "este": p2["este"]},
        {"nombre": pn.get("nombre", "XXX"), "norte": pn["norte"], "este": pn["este"]},
    ]
    return svg_poligono(puntos, width=width, height=height, titulo=titulo)


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
_PDF_SEC = "font-size:5.5pt;font-weight:700;color:#1e40af;margin:1px 0 0;"
_PDF_TH_C = "padding:1px;font-size:5pt;font-weight:700;background:#e2e8f0;border:1px solid #94a3b8;vertical-align:middle;"
_PDF_CELL_C = "padding:1px;font-size:5pt;border:1px solid #cbd5e1;vertical-align:middle;"
_PDF_CELL_ANG_C = "padding:1px;font-size:4.8pt;white-space:nowrap;border:1px solid #cbd5e1;vertical-align:middle;"
_PDF_TBL = "border-collapse:collapse;table-layout:fixed;width:100%;"


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
    """Logo del contratista para PDF (aplana transparencia; permite http→data-URI)."""
    from pdf_institucional import prepare_image_for_pdf

    uri = prepare_image_for_pdf(contrato.get("logo_contratista") or "", max_px_h=max_h * 4, max_px_w=max_h * 6)
    if uri:
        return (
            f'<img src="{html.escape(uri, quote=True)}" '
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
    punto_final: Optional[dict] = None,
    cierre: Optional[dict] = None,
) -> str:
    """Plano con cuadricula, norte, distancias y simbologia (▲ auxiliar)."""
    puntos = _puntos_para_plano(estaciones, punto_inicial)
    extra_coords = []
    if (pol.get("tipo") or "cerrada") == "abierta":
        obj = (cierre or {}).get("llegada_objetivo") or punto_final
        calc = (cierre or {}).get("llegada_calculada")
        for p in (obj, calc):
            if p and p.get("norte") is not None and p.get("este") is not None:
                extra_coords.append(p)
    if len(puntos) < 2 and not extra_coords:
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

    nortes = [p["norte"] for p in puntos] + [float(p["norte"]) for p in extra_coords]
    estes = [p["este"] for p in puntos] + [float(p["este"]) for p in extra_coords]
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

    if (pol.get("tipo") or "cerrada") == "abierta":
        obj = (cierre or {}).get("llegada_objetivo") or punto_final
        calc = (cierre or {}).get("llegada_calculada")
        if obj and obj.get("norte") is not None and obj.get("este") is not None:
            ox, oy = tx(float(obj["este"])), ty(float(obj["norte"]))
            s = 6
            parts.append(
                f'<polygon points="{ox:.1f},{oy - s:.1f} {ox + s:.1f},{oy:.1f} {ox:.1f},{oy + s:.1f} {ox - s:.1f},{oy:.1f}" '
                f'fill="none" stroke="#15803d" stroke-width="1.2"/>'
            )
            nom = html.escape(str(obj.get("nombre") or "Llegada"))
            parts.append(
                f'<text x="{ox + 8:.1f}" y="{oy - 8:.1f}" font-size="7" font-weight="700" fill="#15803d">{nom} (obj.)</text>'
            )
        if calc and calc.get("norte") is not None and calc.get("este") is not None:
            cx, cy = tx(float(calc["este"])), ty(float(calc["norte"]))
            parts.append(
                f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="5" fill="none" stroke="#c2410c" stroke-width="1.4" stroke-dasharray="3,2"/>'
            )
            nom_c = html.escape(str(calc.get("nombre") or "Llegada"))
            parts.append(
                f'<text x="{cx + 8:.1f}" y="{cy + 10:.1f}" font-size="7" font-weight="700" fill="#c2410c">{nom_c} (calc.)</text>'
            )
            if obj and obj.get("norte") is not None and obj.get("este") is not None:
                ox, oy = tx(float(obj["este"])), ty(float(obj["norte"]))
                parts.append(
                    f'<line x1="{ox:.1f}" y1="{oy:.1f}" x2="{cx:.1f}" y2="{cy:.1f}" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="4,3"/>'
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
    punto_final: Optional[dict] = None,
    cierre: Optional[dict] = None,
) -> str:
    """Una sola hoja carta horizontal: plano a escala uniforme y rotulado compacto."""
    titulo = f"Plano — {pol.get('nombre', '')}"
    if (pol.get("tipo") or "cerrada") == "abierta":
        titulo += " (abierta)"
    puntos = _puntos_para_plano(estaciones, punto_inicial)
    escala_txt, span_m = _escala_plano_sugerida(puntos)
    svg = svg_plano_poligonal_profesional(
        estaciones,
        punto_inicial,
        pol,
        width=720,
        height=400,
        escala_texto=escala_txt,
        punto_final=punto_final,
        cierre=cierre,
    )
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    rotulado = html_rotulado_plano(contrato, pol, firmas)
    leyenda = (
        '<span style="font-size:5pt;margin-right:6px;">● Est.</span>'
        '<span style="font-size:5pt;margin-right:6px;color:#ea580c;">▲ Aux.</span>'
        '<span style="font-size:5pt;margin-right:6px;color:#16a34a;">■ Am.</span>'
    )
    if (pol.get("tipo") or "cerrada") == "abierta":
        leyenda += (
            '<span style="font-size:5pt;margin-right:6px;color:#15803d;">◆ Llegada obj.</span>'
            '<span style="font-size:5pt;color:#c2410c;">○ Llegada calc.</span>'
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


def html_firmas_validacion_newpoint_pdf(np: dict, contrato: dict) -> str:
    """Pie del informe: elabora (contratista) y aprueba (interventoría)."""
    return html_firmas_elabora_aprueba_pdf(np, contrato)


def html_firmas_elabora_aprueba_pdf(
    registro: dict, contrato: dict, *, font_size: str = "5pt", meta_font_size: str = "4.8pt"
) -> str:
    """Pie del informe: elabora (contratista) y aprueba (interventoría)."""
    contratista = html.escape(str(contrato.get("contratista") or "—"))
    interventoria = html.escape(str(contrato.get("interventoria") or "—"))
    elabora = html.escape(str(registro.get("nivel1_usuario_nombre") or registro.get("operador") or ""))
    aprueba = html.escape(str(registro.get("nivel2_usuario_nombre") or ""))
    est_c = html.escape(str(registro.get("nivel1_estado") or "No Revisado"))
    est_i = html.escape(str(registro.get("nivel2_estado") or "No Revisado"))
    fc = str(registro.get("nivel1_fecha") or "")[:10]
    fi = str(registro.get("nivel2_fecha") or "")[:10]
    meta_c = f"{est_c}" + (f" · {fc}" if fc else "")
    meta_i = f"{est_i}" + (f" · {fi}" if fi else "")
    return f"""
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:3px;border-top:1px solid #64748b;">
      <tr>
        <td width="50%" valign="bottom" style="padding:3px 6px 2px;font-size:{font_size};">
          <div style="font-weight:700;color:#1e40af;margin-bottom:8px;">ELABORÓ — Contratista</div>
          <div style="border-top:1px solid #0f172a;width:90%;padding-top:2px;min-height:22px;">
            <strong>{elabora or '—'}</strong><br/>
            <span style="color:#475569;">{contratista}</span><br/>
            <span style="color:#64748b;font-size:{meta_font_size};">{meta_c}</span>
          </div>
        </td>
        <td width="50%" valign="bottom" style="padding:3px 6px 2px;font-size:{font_size};border-left:1px solid #cbd5e1;">
          <div style="font-weight:700;color:#1e40af;margin-bottom:8px;">APROBÓ — Interventoría</div>
          <div style="border-top:1px solid #0f172a;width:90%;padding-top:2px;min-height:22px;">
            <strong>{aprueba or '—'}</strong><br/>
            <span style="color:#475569;">{interventoria}</span><br/>
            <span style="color:#64748b;font-size:{meta_font_size};">{meta_i}</span>
          </div>
        </td>
      </tr>
    </table>"""


def _tipo_lectura_norm(tipo: str) -> str:
    t = (tipo or "").strip().replace("V−", "V-")
    if t.upper() == "VI":
        return "Vi"
    if t == "V+":
        return "V+"
    if t in ("V-", "V−"):
        return "V-"
    return t


def _bloque_hilos_pdf(lect: dict | None, tipo_nivel: str) -> str:
    if not lect:
        return "—"
    if tipo_nivel == "automatico":
        hs, hm, hi = lect.get("hilo_superior"), lect.get("hilo_medio"), lect.get("hilo_inferior")
        if hs is None and hm is None and hi is None:
            return "—"
        return f"{_fmt_pdf_num(hs, 3)}/{_fmt_pdf_num(hm, 3)}/{_fmt_pdf_num(hi, 3)}"
    v = lect.get("lectura")
    return _fmt_pdf_num(v, 4) if v is not None else "—"


def html_tabla_circuito_nivelacion_pdf(niv: dict, lecturas: list[dict]) -> str:
    """Tabla cartera de circuito de nivelación (filas agrupadas)."""
    tipo_nivel = niv.get("tipo_nivel") or "electronico"
    th = _NIV_PDF_TH_C
    td = _NIV_PDF_CELL_C
    tbl = _PDF_TBL
    grupos = _agrupar_lecturas_por_fila(lecturas)
    body = ""
    for g_idx, grupo in enumerate(grupos):
        base = grupo[0]
        lect_map = {}
        for l in grupo:
            lect_map[_tipo_lectura_norm(l.get("tipo_lectura"))] = l
        hi = None
        cota = None
        for l in grupo:
            if l.get("altura_instrumento") is not None:
                hi = l.get("altura_instrumento")
            c = l.get("cota_ajustada")
            if c is None:
                c = l.get("cota_calculada")
            if c is not None:
                cota = c
        dist_vp = None
        dist_vm = None
        l_vp = lect_map.get("V+")
        l_vm = lect_map.get("V-")
        if l_vp and lectura_efectiva_nivelacion(l_vp, tipo_nivel) is not None:
            d = l_vp.get("distancia_m")
            if d is None and tipo_nivel == "automatico":
                d = distancia_taquimetrica_nivelacion(l_vp.get("hilo_superior"), l_vp.get("hilo_inferior"))
            dist_vp = d
        if l_vm and lectura_efectiva_nivelacion(l_vm, tipo_nivel) is not None:
            d = l_vm.get("distancia_m")
            if d is None and tipo_nivel == "automatico":
                d = distancia_taquimetrica_nivelacion(l_vm.get("hilo_superior"), l_vm.get("hilo_inferior"))
            dist_vm = d
        nombre = html.escape(str(base.get("nombre_punto") or ""))
        tipo_pto = html.escape(str(base.get("tipo_punto") or ""))
        abscisa = html.escape(str(base.get("abscisa") or ""))
        desc = html.escape(str(base.get("descripcion_punto") or base.get("ubicacion") or ""))
        body += (
            f"<tr>"
            f'<td style="{td}">{g_idx + 1}</td>'
            f'<td style="{td}"><b>{nombre}</b></td>'
            f'<td style="{td}">{tipo_pto}</td>'
            f'<td style="{td}">{_bloque_hilos_pdf(lect_map.get("V+"), tipo_nivel)}</td>'
            f'<td style="{td}">{_fmt_pdf_num(dist_vp, 2) if dist_vp is not None else "—"}</td>'
            f'<td style="{td}">{_bloque_hilos_pdf(lect_map.get("Vi"), tipo_nivel)}</td>'
            f'<td style="{td}">{_bloque_hilos_pdf(lect_map.get("V-"), tipo_nivel)}</td>'
            f'<td style="{td}">{_fmt_pdf_num(dist_vm, 2) if dist_vm is not None else "—"}</td>'
            f'<td style="{td}">{_fmt_pdf_num(hi, 4) if hi is not None else "—"}</td>'
            f'<td style="{td}">{_fmt_pdf_num(cota, 4) if cota is not None else "—"}</td>'
            f'<td style="{td}">{abscisa or "—"}</td>'
            f'<td style="{td}">{desc or "—"}</td>'
            f"</tr>"
        )
    hilos_hdr = "S/M/I" if tipo_nivel == "automatico" else "Lect."
    header = (
        f"<tr>"
        f'<th style="{th}">#</th>'
        f'<th style="{th}">Punto</th>'
        f'<th style="{th}">Tipo</th>'
        f'<th style="{th}">V+ ({hilos_hdr})</th>'
        f'<th style="{th}">Dist (V+)</th>'
        f'<th style="{th}">Vi ({hilos_hdr})</th>'
        f'<th style="{th}">V− ({hilos_hdr})</th>'
        f'<th style="{th}">Dist (V−)</th>'
        f'<th style="{th}">H. ins.</th>'
        f'<th style="{th}">Cota</th>'
        f'<th style="{th}">Abscisa</th>'
        f'<th style="{th}">Descripción</th>'
        f"</tr>"
    )
    return f"""
    <table cellspacing="0" cellpadding="0" style="{tbl}margin-bottom:4px;">
      <thead>{header}</thead>
      <tbody>{body or f'<tr><td colspan="12" style="{td}">Sin lecturas</td></tr>'}</tbody>
    </table>"""


_PDF_TH_BLK = "padding:2px 4px;font-size:5.5pt;font-weight:700;background:#f8fafc;border:0.5pt solid #334155;vertical-align:middle;"
_PDF_CELL_BLK = "padding:2px 4px;font-size:5.5pt;border:0.5pt solid #334155;vertical-align:top;line-height:1.35;"
_PDF_TBL_BLK = "border-collapse:collapse;table-layout:fixed;width:100%;border:0.5pt solid #334155;"

# Estilos del informe Circuito de Nivelación (+≈2pt vs estilos compactos compartidos).
_NIV_PDF_SEC = "font-size:7.5pt;font-weight:700;color:#1e40af;margin:2px 0 1px;"
_NIV_PDF_TH_C = "padding:2px;font-size:7pt;font-weight:700;background:#e2e8f0;border:1px solid #94a3b8;vertical-align:middle;"
_NIV_PDF_CELL_C = "padding:2px;font-size:7pt;border:1px solid #cbd5e1;vertical-align:middle;"
_NIV_PDF_TH_BLK = "padding:3px 5px;font-size:7.5pt;font-weight:700;background:#f8fafc;border:0.5pt solid #334155;vertical-align:middle;"
_NIV_PDF_CELL_BLK = "padding:3px 5px;font-size:7.5pt;border:0.5pt solid #334155;vertical-align:top;line-height:1.35;"
_NIV_PDF_BODY_FS = "10pt"
_NIV_PDF_PIE_FS = "9pt"
_NIV_PDF_FIRMAS_FS = "7pt"
_NIV_PDF_FIRMAS_META_FS = "6.5pt"


def _merge_lecturas_calculo_pdf(lecturas: list[dict], calc: dict) -> list[dict]:
    """Fusiona cotas/HI del cálculo geométrico sobre las lecturas guardadas."""
    calc_rows = calc.get("lecturas") or []
    if not calc_rows:
        return lecturas
    by_id = {str(r["id"]): r for r in calc_rows if r.get("id")}
    if not by_id:
        return calc_rows
    merged: list[dict] = []
    for lect in lecturas:
        row = dict(lect)
        ref = by_id.get(str(lect.get("id")))
        if ref:
            for k in ("altura_instrumento", "cota_calculada", "cota_ajustada", "correccion", "distancia_m"):
                if ref.get(k) is not None:
                    row[k] = ref[k]
        merged.append(row)
    return merged


def enriquecer_nivelacion_pdf(
    contrato_id: int,
    niv: dict,
    lecturas: list[dict],
    *,
    cotas_biblioteca: dict[str, float],
    bm_ini: str | None,
    bm_fin: str | None,
) -> tuple[dict, list[dict]]:
    """Recalcula cierre (igual que la UI) para el informe PDF."""
    out = dict(niv)
    out["bm_inicial"] = bm_ini
    out["bm_final"] = bm_fin or bm_ini
    calc = calcular_nivelacion_geometrica(out, lecturas, cotas_biblioteca, bm_ini, bm_fin)
    for k in (
        "error_cierre",
        "tolerancia_calculada",
        "distancia_total_km",
        "distancia_vplus_km",
        "distancia_vminus_km",
        "admisible",
    ):
        if calc.get(k) is not None:
            out[k] = calc[k]
    if calc.get("cotas"):
        out["_cotas_calc"] = calc["cotas"]
    lecturas_out = _merge_lecturas_calculo_pdf(lecturas, calc)
    adm = _admisible_nivelacion_pdf(out)
    if adm is not None:
        out["admisible"] = adm
    return out, lecturas_out


def _resolver_bms_nivelacion_pdf(contrato_id: int, niv: dict, lecturas: list[dict]) -> tuple[str | None, str | None]:
    """Nombres BM ini/fin desde filas de cartera si faltan en cabecera."""
    bm_ini: str | None = None
    bm_fin: str | None = None
    grupos = _agrupar_lecturas_por_fila(lecturas)
    if grupos:
        bm_ini = (grupos[0][0].get("nombre_punto") or "").strip() or None
    if grupos:
        for g in reversed(grupos):
            if _grupo_es_cierre(g, bm_fin):
                bm_fin = (g[0].get("nombre_punto") or "").strip() or None
                break
        if not bm_fin:
            bm_fin = (grupos[-1][0].get("nombre_punto") or "").strip() or None
    if not bm_fin and bm_ini:
        bm_fin = bm_ini
    return bm_ini, bm_fin


def _admisible_nivelacion_pdf(niv: dict) -> bool | None:
    adm = niv.get("admisible")
    if adm is not None:
        return bool(adm)
    err = niv.get("error_cierre")
    tol = niv.get("tolerancia_calculada")
    if err is not None and tol is not None:
        return abs(float(err)) <= float(tol)
    return None


def _distancia_grupo_nivelacion_m(grupo: list[dict], tipo_nivel: str) -> float:
    total = 0.0
    for lect in grupo:
        tl = (lect.get("tipo_lectura") or "").strip().replace("V−", "V-")
        if tl not in ("V+", "V-"):
            continue
        if lectura_efectiva_nivelacion(lect, tipo_nivel) is None:
            continue
        dist = lect.get("distancia_m")
        if dist is None and tipo_nivel == "automatico":
            dist = distancia_taquimetrica_nivelacion(lect.get("hilo_superior"), lect.get("hilo_inferior"))
        if dist is not None:
            total += abs(float(dist))
    return total


def _puntos_perfil_nivelacion(lecturas: list[dict], niv: dict) -> list[dict]:
    tipo_nivel = niv.get("tipo_nivel") or "electronico"
    grupos = _agrupar_lecturas_por_fila(lecturas)
    bm_ini = niv.get("bm_inicial")
    bm_fin = niv.get("bm_final") or bm_ini
    pts: list[dict] = []
    prog = 0.0
    for g_idx, grupo in enumerate(grupos):
        base = grupo[0]
        nombre = (base.get("nombre_punto") or f"P{g_idx + 1}").strip()
        cota = None
        for lect in grupo:
            c = lect.get("cota_ajustada")
            if c is None:
                c = lect.get("cota_calculada")
            if c is not None:
                cota = float(c)
        if cota is None:
            cotas_map = niv.get("_cotas_calc") or {}
            if nombre in cotas_map:
                cota = float(cotas_map[nombre])
        abscisa_raw = base.get("abscisa")
        if abscisa_raw is not None and str(abscisa_raw).strip() and _abscisa_numerica_valida(str(abscisa_raw)):
            abs_val = float(str(abscisa_raw).strip().replace(",", "."))
        else:
            abs_val = prog
        if cota is not None:
            pts.append({
                "nombre": nombre,
                "abscisa": abs_val,
                "cota": cota,
                "cierre": _grupo_es_cierre(grupo, bm_fin),
            })
        prog += _distancia_grupo_nivelacion_m(grupo, tipo_nivel)
    return pts


def svg_perfil_nivelacion_pdf(lecturas: list[dict], niv: dict, *, width: int = 720, height: int = 200) -> str:
    """Perfil abscisa–cota del circuito para PDF."""
    pts = _puntos_perfil_nivelacion(lecturas, niv)
    if len(pts) < 2:
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"><text x="8" y="20" font-size="10" fill="#64748b">Sin cotas suficientes para el perfil</text></svg>'

    abs_vals = [p["abscisa"] for p in pts]
    cotas = [p["cota"] for p in pts]
    min_a, max_a = min(abs_vals), max(abs_vals)
    min_c, max_c = min(cotas), max(cotas)
    pad_a = max(max_a - min_a, 1) * 0.12
    pad_c = max(max_c - min_c, 0.5) * 0.15
    min_a -= pad_a
    max_a += pad_a
    min_c -= pad_c
    max_c += pad_c

    margin = {"l": 52, "r": 24, "t": 28, "b": 44}
    w = width - margin["l"] - margin["r"]
    h = height - margin["t"] - margin["b"]

    def tx(a):
        return margin["l"] + (a - min_a) / max(max_a - min_a, 0.001) * w

    def ty(c):
        return margin["t"] + h - (c - min_c) / max(max_c - min_c, 0.001) * h

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="100%" height="100%" fill="#fafafa"/>',
        f'<text x="{width / 2:.0f}" y="14" text-anchor="middle" font-size="9" font-weight="600" fill="#334155">Perfil del circuito (Abscisa vs Cota)</text>',
    ]

    span_a = max(max_a - min_a, 1)
    span_c = max(max_c - min_c, 0.5)

    def _nice_step(span):
        raw = span / 6
        mag = 10 ** math.floor(math.log10(max(raw, 1e-6)))
        norm = raw / mag
        if norm <= 1:
            return mag
        if norm <= 2:
            return 2 * mag
        if norm <= 5:
            return 5 * mag
        return 10 * mag

    step_a = _nice_step(span_a)
    step_c = _nice_step(span_c)
    a = math.ceil(min_a / step_a) * step_a
    while a <= max_a:
        x = tx(a)
        parts.append(f'<line x1="{x:.1f}" y1="{margin["t"]}" x2="{x:.1f}" y2="{margin["t"] + h}" stroke="#cbd5e1" stroke-width="0.5"/>')
        parts.append(
            f'<text x="{x:.1f}" y="{margin["t"] + h + 10}" font-size="6" fill="#64748b" text-anchor="middle">'
            f'{_fmt_pdf_num(a, 0 if step_a >= 1 else 2)}</text>'
        )
        a += step_a
    c = math.ceil(min_c / step_c) * step_c
    while c <= max_c:
        y = ty(c)
        parts.append(f'<line x1="{margin["l"]}" y1="{y:.1f}" x2="{margin["l"] + w}" y2="{y:.1f}" stroke="#cbd5e1" stroke-width="0.5"/>')
        parts.append(
            f'<text x="{margin["l"] - 4}" y="{y + 2:.1f}" font-size="6" fill="#64748b" text-anchor="end">'
            f'{_fmt_pdf_num(c, 2 if step_c < 1 else 1)}</text>'
        )
        c += step_c

    poly = " ".join(f"{tx(p['abscisa']):.1f},{ty(p['cota']):.1f}" for p in pts)
    parts.append(f'<polyline points="{poly}" fill="none" stroke="#2563eb" stroke-width="1.5"/>')

    for p in pts:
        x, y = tx(p["abscisa"]), ty(p["cota"])
        fill = "#7c3aed" if p.get("cierre") else "#2563eb"
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{fill}" stroke="#fff" stroke-width="0.8"/>')
        nm = html.escape(p["nombre"][:12])
        parts.append(f'<text x="{x + 5:.1f}" y="{y - 5:.1f}" font-size="7" fill="#334155">{nm}</text>')

    nx = margin["l"] + w - 16
    parts.append(f'<line x1="{nx}" y1="{margin["t"] + 16}" x2="{nx}" y2="{margin["t"] + 4}" stroke="#1e40af" stroke-width="1.2"/>')
    parts.append(f'<text x="{nx}" y="{margin["t"] + 2}" font-size="8" fill="#1e40af" text-anchor="middle">N</text>')
    cx = margin["l"] + w / 2
    cy = margin["t"] + h / 2
    parts.append(
        f'<text x="{cx:.0f}" y="{height - 6}" font-size="7.5" fill="#334155" text-anchor="middle" font-weight="700">'
        f'X · Abscisa (m)</text>'
    )
    parts.append(
        f'<text x="14" y="{cy:.0f}" font-size="7.5" fill="#334155" text-anchor="middle" font-weight="700" '
        f'transform="rotate(-90 14 {cy:.0f})">Y · Cota (m)</text>'
    )
    parts.append("</svg>")
    return "".join(parts)


def html_cierre_nivelacion_pdf(niv: dict, lecturas: list[dict] | None = None) -> str:
    """Cuadro de cierre (30% ancho), procedimiento a la derecha, conclusión y perfil."""
    err = niv.get("error_cierre")
    tol = niv.get("tolerancia_calculada")
    dist_km = niv.get("distancia_total_km")
    dist_vp_km = niv.get("distancia_vplus_km")
    dist_vm_km = niv.get("distancia_vminus_km")
    tol_mm_km = float(niv.get("tolerancia_mm_km") or 1)
    max_km = niv.get("distancia_max_circuito_km")
    adm = _admisible_nivelacion_pdf(niv)
    tipo_nivel = niv.get("tipo_nivel") or "electronico"
    tipo_txt = "Automático (3 hilos)" if tipo_nivel == "automatico" else "Electrónico"
    bm_ini = html.escape(str(niv.get("bm_inicial") or "—"))
    bm_fin = html.escape(str(niv.get("bm_final") or "—"))
    err_mm = _fmt_pdf_num(float(err) * 1000, 2) if err is not None else "—"
    tol_mm = _fmt_pdf_num(float(tol) * 1000, 2) if tol is not None else "—"
    dist_km_s = _fmt_pdf_num(dist_km, 4) if dist_km is not None else "—"
    dist_vp_s = _fmt_pdf_num(dist_vp_km, 4) if dist_vp_km is not None else "—"
    dist_vm_s = _fmt_pdf_num(dist_vm_km, 4) if dist_vm_km is not None else "—"
    sqrt_km = _fmt_pdf_num(math.sqrt(float(dist_km)), 4) if dist_km is not None else "—"
    tol_formula = (
        f"{tol_mm_km:g} mm/km × √{sqrt_km} km = {tol_mm} mm"
        if dist_km is not None and tol is not None
        else f"{tol_mm_km:g} mm/km × √km"
    )
    if adm is True:
        adm_txt = "ACEPTADA"
        adm_color = "#166534"
        adm_bg = "#dcfce7"
        conclusion = (
            "El circuito de nivelación geométrica <b>cierra dentro de la tolerancia</b> "
            f"(error {err_mm} mm ≤ {tol_mm} mm). Las cotas ajustadas son admisibles."
        )
    elif adm is False:
        adm_txt = "NO ACEPTADA"
        adm_color = "#991b1b"
        adm_bg = "#fee2e2"
        conclusion = (
            "El circuito <b>no cierra</b> dentro de la tolerancia "
            f"(error {err_mm} mm &gt; {tol_mm} mm). Debe corregir lecturas y recalcular."
        )
    else:
        adm_txt = "PENDIENTE"
        adm_color = "#64748b"
        adm_bg = "#f1f5f9"
        conclusion = (
            "Complete la cartera, registre el cierre en el BM final y calcule el circuito "
            "para determinar admisibilidad."
        )

    th, td, tbl, sec = _NIV_PDF_TH_BLK, _NIV_PDF_CELL_BLK, _PDF_TBL_BLK, _NIV_PDF_SEC
    cuadro_cierre = f"""
    <table cellspacing="0" cellpadding="0" style="{tbl}">
      <tr><th style="{th}" colspan="2">Verificación de cierre</th></tr>
      <tr>
        <td style="{td}width:42%;"><b>Error cierre</b></td>
        <td style="{td}"><b>{err_mm} mm</b></td>
      </tr>
      <tr>
        <td style="{td}"><b>Tolerancia</b></td>
        <td style="{td}"><b>{tol_mm} mm</b><br/><span style="font-size:6.5pt;color:#64748b;">{html.escape(tol_formula)}</span></td>
      </tr>
      <tr>
        <td style="{td}"><b>Dist. total</b></td>
        <td style="{td}">{dist_km_s} km</td>
      </tr>
      <tr>
        <td style="{td}"><b>Dist. V+</b></td>
        <td style="{td}">{dist_vp_s} km</td>
      </tr>
      <tr>
        <td style="{td}"><b>Dist. V−</b></td>
        <td style="{td}">{dist_vm_s} km</td>
      </tr>
      <tr>
        <td style="{td}"><b>BM ini. → fin.</b></td>
        <td style="{td}">{bm_ini} → {bm_fin}</td>
      </tr>
      <tr>
        <td style="{td}"><b>Tipo nivel</b></td>
        <td style="{td}">{html.escape(tipo_txt)}</td>
      </tr>
      <tr>
        <td style="{td}"><b>Dictamen</b></td>
        <td style="{td}background:{adm_bg};color:{adm_color};font-weight:800;">{adm_txt}</td>
      </tr>
    </table>"""

    procedimiento = f"""
    <div style="font-size:7.5pt;font-weight:700;color:#1e40af;margin:0 0 4px;">Procedimiento de verificación</div>
    <ul style="margin:0;padding-left:12px;font-size:7.5pt;line-height:1.5;color:#0f172a;">
      <li>Circuito desde <b>{bm_ini}</b> con V+, Vi y V− ({html.escape(tipo_txt)}).</li>
      <li>Distancia = suma tramos V+ y V− (excluye Vi).</li>
      <li>Cierre en <b>{bm_fin}</b>: error = cota V− calculada − cota biblioteca.</li>
      <li>Tolerancia <b>T = {tol_mm_km:g} mm/km × √L</b>; distribución proporcional del error.</li>
    </ul>
    <div style="font-size:7.5pt;font-weight:700;color:#1e40af;margin:8px 0 4px;">Conclusión</div>
    <p style="margin:0;font-size:7.5pt;line-height:1.45;padding:4px 6px;border:0.5pt solid #334155;border-radius:2px;">{conclusion}</p>"""

    layout = f"""
    <div style="{sec}">Verificación y cierre del circuito</div>
    <table cellspacing="0" cellpadding="0" style="width:100%;border:none;border-collapse:collapse;margin-bottom:6px;">
      <tr>
        <td width="32%" valign="top" style="padding:0 8px 0 0;border:none;">{cuadro_cierre}</td>
        <td width="68%" valign="top" style="padding:0;border:none;">{procedimiento}</td>
      </tr>
    </table>"""

    perfil_html = ""
    if lecturas:
        svg_raw = svg_perfil_nivelacion_pdf(lecturas, niv)
        perfil_html = f"""
    <div style="{sec}margin-top:6px;">Perfil del circuito de nivelación</div>
    {svg_embed_pdf(svg_raw, 720, 200)}"""

    return layout + perfil_html


def html_documento_nivelacion_pdf(
    contrato: dict,
    niv: dict,
    lecturas: list[dict],
    *,
    generado_por: str = "",
) -> str:
    """Informe PDF circuito de nivelación geométrica."""
    nombre = str(niv.get("nombre") or "—")
    titulo = "Informe de circuito de nivelación geométrica"
    subtitulo = f"Circuito: {nombre}"
    tipo_nivel = niv.get("tipo_nivel") or "electronico"
    tipo_txt = "Automático (3 hilos)" if tipo_nivel == "automatico" else "Electrónico"
    operador = html.escape(str(niv.get("operador") or "—"))
    fecha = html.escape(str(niv.get("fecha_campo") or "—"))
    equipo = "—"
    if niv.get("equipo_marca") or niv.get("equipo_referencia"):
        parts = [p for p in [niv.get("equipo_marca"), niv.get("equipo_referencia")] if p]
        equipo = html.escape(" / ".join(str(x) for x in parts))
        if niv.get("equipo_serial"):
            equipo += html.escape(f" · S/N {niv.get('equipo_serial')}")

    datos_campo = f"""
    <div style="{_NIV_PDF_SEC}">Datos de campo</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}margin-bottom:4px;">
      <tr>
        <td style="{_NIV_PDF_CELL_C}"><b>Operador</b><br/>{operador}</td>
        <td style="{_NIV_PDF_CELL_C}"><b>Fecha</b><br/>{fecha}</td>
        <td style="{_NIV_PDF_CELL_C}"><b>Equipo</b><br/>{equipo}</td>
        <td style="{_NIV_PDF_CELL_C}"><b>Tipo nivel</b><br/>{html.escape(tipo_txt)}</td>
      </tr>
    </table>
    <div style="{_NIV_PDF_SEC}">Cálculo de nivelación — cartera de lecturas</div>
    """
    firmas = html_firmas_elabora_aprueba_pdf(
        niv,
        contrato,
        font_size=_NIV_PDF_FIRMAS_FS,
        meta_font_size=_NIV_PDF_FIRMAS_META_FS,
    )
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="font-family:Arial,Helvetica,sans-serif;font-size:{_NIV_PDF_BODY_FS};margin:8px;color:#0f172a;">
    {html_encabezado_pdf_nivelacion(contrato, titulo, subtitulo, generado_por=generado_por)}
    {datos_campo}
    {html_tabla_circuito_nivelacion_pdf(niv, lecturas)}
    {html_cierre_nivelacion_pdf(niv, lecturas)}
    {firmas}
    {html_pie_pdf(contrato, font_size=_NIV_PDF_PIE_FS)}
    </body></html>"""


def html_encabezado_pdf_nivelacion(
    contrato: dict, titulo: str, subtitulo: str = "", *, generado_por: str = ""
) -> str:
    """Encabezado solo para Circuito de Nivelación: logos +20%, tipografía +2pt, bloque denso."""
    from pdf_institucional import html_encabezado_institucional

    return html_encabezado_institucional(
        contrato,
        titulo,
        subtitulo=subtitulo,
        compact=True,
        generado_por=generado_por,
        logo_scale=1.2,
        title_fs="10pt",
        meta_fs="7.5pt",
        sub_fs="7.5pt",
        dense=True,
    )


def html_documento_newpoint_pdf(
    contrato: dict,
    np: dict,
    p1: dict,
    p2: dict,
    vertices_poligonal: list[dict] | None = None,
) -> str:
    """Informe NewPoint: procedimiento y demostración solo para la coordenada confirmada."""
    nombre_nuevo_raw = str(np.get("nombre_punto_nuevo") or "—")
    titulo = "Informe de creación de puntos de amarre por resección de coordenadas"
    subtitulo = f"Punto nuevo: {nombre_nuevo_raw}"
    p1n = html.escape(str(p1.get("nombre") or np.get("punto1_nombre") or "P1"))
    p2n = html.escape(str(p2.get("nombre") or np.get("punto2_nombre") or "P2"))
    pol_nombre = html.escape(str(np.get("poligonal_nombre") or "—"))
    nombre_nuevo = html.escape(str(np.get("nombre_punto_nuevo") or "—"))
    operador = html.escape(str(np.get("operador") or "—"))
    fecha_campo = html.escape(str(np.get("fecha") or "—"))
    eq_serial = html.escape(str(np.get("equipo_serial") or "—"))
    equipo_txt = "—"
    if np.get("equipo_marca") or np.get("equipo_referencia") or np.get("equipo_serial"):
        parts_eq = [p for p in [np.get("equipo_marca"), np.get("equipo_referencia")] if p]
        equipo_txt = html.escape(" / ".join(str(x) for x in parts_eq))
        if np.get("equipo_serial"):
            equipo_txt += html.escape(f" · S/N {np.get('equipo_serial')}")
    tipo_pto = html.escape(str(np.get("tipo_punto") or "auxiliar"))
    desc = html.escape(str(np.get("descripcion") or ""))

    n_res = np.get("norte_resultado")
    e_res = np.get("este_resultado")
    if n_res is None or e_res is None:
        return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
        {html_encabezado_pdf_compacto(contrato, titulo, subtitulo)}
        <p style="color:#b45309;">Debe confirmar la posición del puesto en la plataforma antes de generar el informe.</p>
        {html_pie_pdf(contrato)}</body></html>"""

    n1f = float(p1.get("norte") or np.get("punto1_norte") or 0)
    e1f = float(p1.get("este") or np.get("punto1_este") or 0)
    n2f = float(p2.get("norte") or np.get("punto2_norte") or 0)
    e2f = float(p2.get("este") or np.get("punto2_este") or 0)
    d1 = float(np.get("distancia1") or 0)
    d2 = float(np.get("distancia2") or 0)
    ang_gms = float(np.get("angulo_observado_gms") or 0)

    demo = desarrollo_triangulo_reseccion_newpoint(
        float(n_res), float(e_res), n1f, e1f, d1, n2f, e2f, d2, ang_gms,
    )
    ang_obs = html.escape(demo["angulo_observado_texto"])
    ang_calc = html.escape(demo["angulo_calculado_texto"])
    err_ang = html.escape(demo["error_angular_gms_texto"])
    admisible = np.get("admisible")
    diag = "ADMISIBLE" if admisible else "INADMISIBLE"
    diag_color = "#16a34a" if admisible else "#dc2626"

    n1 = _fmt_pdf_num(n1f, 4)
    e1 = _fmt_pdf_num(e1f, 4)
    n2 = _fmt_pdf_num(n2f, 4)
    e2 = _fmt_pdf_num(e2f, 4)
    d1s = _fmt_pdf_num(d1, 4)
    d2s = _fmt_pdf_num(d2, 4)

    svg_raw = svg_newpoint_resultado(
        vertices_poligonal or [],
        {"nombre": p1.get("nombre") or "P1", "norte": n1f, "este": e1f},
        {"nombre": p2.get("nombre") or "P2", "norte": n2f, "este": e2f},
        {"nombre": np.get("nombre_punto_nuevo"), "norte": float(n_res), "este": float(e_res)},
        width=300, height=240,
    )
    svg = svg_embed_pdf(svg_raw, 280, 220)
    th, td, tda = _PDF_TH_C, _PDF_CELL_C, _PDF_CELL_ANG_C
    sec = _PDF_SEC

    bloque_datos = f"""
    <div style="{sec}">1. Datos del cálculo</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}margin-bottom:1px;">
      <colgroup><col width="11%"/><col width="39%"/><col width="11%"/><col width="39%"/></colgroup>
      <tr>
        <td style="{th}">Poligonal</td><td style="{td}">{pol_nombre}</td>
        <td style="{th}">Punto</td><td style="{td}"><b>{nombre_nuevo}</b> ({tipo_pto})</td>
      </tr>
      <tr>
        <td style="{th}">Fecha</td><td style="{td}">{fecha_campo}</td>
        <td style="{th}">Operador</td><td style="{td}">{operador}</td>
      </tr>
      <tr>
        <td style="{th}">Equipo</td><td style="{td}">{equipo_txt}</td>
        <td style="{th}">Serial</td><td style="{td}">{eq_serial}</td>
      </tr>
      {f'<tr><td style="{th}">Descripción</td><td colspan="3" style="{td}">{desc}</td></tr>' if desc else ''}
    </table>
    <div style="{sec}">2. Puntos de amarre (poligonal sellada)</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}margin-bottom:2px;">
      <colgroup><col width="14%"/><col width="12%"/><col width="26%"/><col width="26%"/><col width="22%"/></colgroup>
      <tr>
        <th style="{th}">Rol</th><th style="{th}">Pto</th><th style="{th}">Norte</th>
        <th style="{th}">Este</th><th style="{th}">Dist.(m)</th>
      </tr>
      <tr>
        <td style="{td}">00.0000→</td><td style="{td}"><b>{p1n}</b></td>
        <td style="{td}">{n1}</td><td style="{td}">{e1}</td><td style="{td}">{d1s}</td>
      </tr>
      <tr>
        <td style="{td}">Amarre 2</td><td style="{td}"><b>{p2n}</b></td>
        <td style="{td}">{n2}</td><td style="{td}">{e2}</td><td style="{td}">{d2s}</td>
      </tr>
    </table>"""

    bloque_procedimiento = f"""
    <div style="{sec}">3. Procedimiento y metodología</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}margin-bottom:2px;">
      <colgroup><col width="6%"/><col width="94%"/></colgroup>
      <tr><td colspan="2" style="{th}">A. Procedimiento de campo — puesto arbitrario</td></tr>
      <tr>
        <td style="{td}">1</td>
        <td style="{td}">Armar estación en puesto sin coordenadas. <b>No hay azimut inicial</b>; la referencia horizontal es
        <b>00.0000</b> hacia el primer amarre <b>{p1n}</b>.</td>
      </tr>
      <tr>
        <td style="{td}">2</td>
        <td style="{td}">Medir ángulo horizontal observado <b>{p1n} → {p2n}</b>: γ = {ang_obs}.</td>
      </tr>
      <tr>
        <td style="{td}">3</td>
        <td style="{td}">Medir distancias inclinadas a amarres de biblioteca: b ({p1n}→{nombre_nuevo}) = {d1s} m;
        a ({p2n}→{nombre_nuevo}) = {d2s} m.</td>
      </tr>
      <tr><td colspan="2" style="{th}">B. Modelo analítico — triángulo Δ({p1n} — {nombre_nuevo} — {p2n})</td></tr>
      <tr>
        <td style="{td}">4</td>
        <td style="{td}">Se dispone de <b>1 ángulo</b> (γ en el puesto) y <b>3 lados</b>: b y a de campo; c = distancia
        entre amarres, calculada con coordenadas de la poligonal sellada.</td>
      </tr>
      <tr>
        <td style="{td}">5</td>
        <td style="{td}"><b>Ley de cosenos</b> en el triángulo: c = √(b² + a² − 2·b·a·cos γ). Con c se obtienen los
        ángulos β en {p1n} y δ en {p2n}.</td>
      </tr>
      <tr>
        <td style="{td}">6</td>
        <td style="{td}"><b>Radiación</b> desde {p1n}: Az({p1n}→{nombre_nuevo}) = Az({p1n}→{p2n}) {html.escape(demo['signo_beta'])} β;
        N = N + b·cos(Az), E = E + b·sen(Az). Comprobación independiente desde {p2n} con δ.</td>
      </tr>
    </table>"""

    bloque_elementos = f"""
    <div style="{sec}">4. Elementos del triángulo</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}margin-bottom:2px;">
      <colgroup><col width="28%"/><col width="8%"/><col width="22%"/><col width="42%"/></colgroup>
      <tr>
        <th style="{th}">Elem.</th><th style="{th}">Sym</th><th style="{th}">Valor</th><th style="{th}">Origen</th>
      </tr>
      <tr><td style="{td}">{p1n}→{nombre_nuevo}</td><td style="{td}">b</td><td style="{td}">{d1s}</td><td style="{td}">Campo</td></tr>
      <tr><td style="{td}">{p2n}→{nombre_nuevo}</td><td style="{td}">a</td><td style="{td}">{d2s}</td><td style="{td}">Campo</td></tr>
      <tr><td style="{td}">{p1n}→{p2n}</td><td style="{td}">c</td><td style="{td}">{_fmt_pdf_num(demo['lado_c_p1_p2'], 4)}</td><td style="{td}">Coord.</td></tr>
      <tr><td style="{td}">∠ puesto γ</td><td style="{td}">γ</td><td style="{tda}">{ang_obs}</td><td style="{td}">Campo</td></tr>
    </table>"""

    bloque_lado_c = f"""
    <div style="{sec}">5. Lado c ({p1n}—{p2n})</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}">
      <colgroup><col width="38%"/><col width="62%"/></colgroup>
      <tr><td style="{td}">ΔN</td><td style="{td}">{_fmt_pdf_num(demo['delta_n_12'], 4)}</td></tr>
      <tr><td style="{td}">ΔE</td><td style="{td}">{_fmt_pdf_num(demo['delta_e_12'], 4)}</td></tr>
      <tr><td style="{td}">c=√(ΔN²+ΔE²)</td><td style="{td}"><b>{_fmt_pdf_num(demo['lado_c_p1_p2'], 4)}</b></td></tr>
      <tr><td style="{td}">|Δc|</td><td style="{td}">{_fmt_pdf_num(demo['error_lado_c'], 4)}</td></tr>
      <tr><td style="{td}">c=√(b²+a²−2ab·cosγ)</td><td style="{td}">{_fmt_pdf_num(demo['lado_c_cosenos'], 4)}</td></tr>
    </table>"""

    bloque_angulos = f"""
    <div style="{sec}">6. Ángulos en amarres (ley de cosenos)</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}">
      <colgroup><col width="38%"/><col width="62%"/></colgroup>
      <tr><td colspan="2" style="{td}font-size:4.6pt;">cos β = (b² + c² − a²) / (2·b·c)</td></tr>
      <tr><td style="{td}">{p1n} β</td><td style="{tda}"><b>{html.escape(demo['angulo_p1_beta_texto'])}</b></td></tr>
      <tr><td colspan="2" style="{td}font-size:4.6pt;">cos δ = (a² + c² − b²) / (2·a·c)</td></tr>
      <tr><td style="{td}">{p2n} δ</td><td style="{tda}"><b>{html.escape(demo['angulo_p2_delta_texto'])}</b></td></tr>
      <tr><td style="{td}">cos β</td><td style="{td}">{demo['cos_beta']}</td></tr>
      <tr><td style="{td}">cos δ</td><td style="{td}">{demo['cos_delta']}</td></tr>
    </table>"""

    bloque_radiacion_p1 = f"""
    <div style="{sec}">7. Radiación desde {p1n}</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}">
      <colgroup><col width="42%"/><col width="58%"/></colgroup>
      <tr><td colspan="2" style="{td}font-size:4.6pt;">Az({p1n}→{nombre_nuevo}) = Az({p1n}→{p2n}) {html.escape(demo['signo_beta'])} β</td></tr>
      <tr><td style="{td}">Az→{p2n}</td><td style="{tda}">{html.escape(demo['azimut_p1_p2_texto'])}</td></tr>
      <tr><td style="{td}">Az→{nombre_nuevo}</td><td style="{tda}"><b>{html.escape(demo['azimut_p1_puesto_texto'])}</b></td></tr>
      <tr><td colspan="2" style="{td}font-size:4.6pt;">N = N + b·cos(Az) · E = E + b·sen(Az)</td></tr>
      <tr><td style="{td}">N</td><td style="{td}"><b>{_fmt_pdf_num(demo['n_radiacion_p1'], 4)}</b></td></tr>
      <tr><td style="{td}">E</td><td style="{td}"><b>{_fmt_pdf_num(demo['e_radiacion_p1'], 4)}</b></td></tr>
    </table>"""

    bloque_radiacion_p2 = f"""
    <div style="{sec}">8. Comprobación desde {p2n}</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}">
      <colgroup><col width="42%"/><col width="58%"/></colgroup>
      <tr><td colspan="2" style="{td}font-size:4.6pt;">Az({p2n}→{nombre_nuevo}) = Az({p2n}→{p1n}) {html.escape(demo['signo_delta'])} δ</td></tr>
      <tr><td style="{td}">Az→{p1n}</td><td style="{tda}">{html.escape(demo['azimut_p2_p1_texto'])}</td></tr>
      <tr><td style="{td}">Az→{nombre_nuevo}</td><td style="{tda}">{html.escape(demo['azimut_p2_puesto_texto'])}</td></tr>
      <tr><td style="{td}">N / E</td><td style="{td}">{_fmt_pdf_num(demo['n_radiacion_p2'], 4)} / {_fmt_pdf_num(demo['e_radiacion_p2'], 4)}</td></tr>
    </table>"""

    bloque_verificacion = f"""
    <div style="{sec}">9. Verificación geométrica</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}margin-bottom:1px;">
      <colgroup><col width="22%"/><col width="26%"/><col width="26%"/><col width="26%"/></colgroup>
      <tr>
        <th style="{th}">Check</th><th style="{th}">Obs.</th><th style="{th}">Calc.</th><th style="{th}">Δ</th>
      </tr>
      <tr>
        <td style="{td}">Dist→{p1n}</td><td style="{td}">{d1s}</td>
        <td style="{td}">{_fmt_pdf_num(demo['distancia_calc_p1'], 4)}</td><td style="{td}">{_fmt_pdf_num(demo['error_dist_p1'], 4)}</td>
      </tr>
      <tr>
        <td style="{td}">Dist→{p2n}</td><td style="{td}">{d2s}</td>
        <td style="{td}">{_fmt_pdf_num(demo['distancia_calc_p2'], 4)}</td><td style="{td}">{_fmt_pdf_num(demo['error_dist_p2'], 4)}</td>
      </tr>
      <tr>
        <td style="{td}">∠ puesto</td><td style="{tda}">{ang_obs}</td>
        <td style="{tda}">{ang_calc}</td><td style="{tda}">{err_ang}</td>
      </tr>
    </table>
    <div style="{sec}">10. Resultado final — {nombre_nuevo}</div>
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}margin-bottom:1px;">
      <colgroup><col width="22%"/><col width="28%"/><col width="28%"/><col width="22%"/></colgroup>
      <tr>
        <td style="{td}"><b>Norte (m)</b></td><td style="{td}font-size:6pt;font-weight:700;">{_fmt_pdf_num(n_res, 4)}</td>
        <td style="{td}"><b>Este (m)</b></td><td style="{td}font-size:6pt;font-weight:700;">{_fmt_pdf_num(e_res, 4)}</td>
      </tr>
      <tr>
        <td style="{td}">Diagnóstico</td><td style="{td}color:{diag_color};font-weight:700;">{diag}</td>
        <td style="{td}">Tolerancia</td><td style="{td}">{_fmt_pdf_num(np.get('tolerancia_lineal'), 3)} m / {_fmt_pdf_num(np.get('tolerancia_angular_seg'), 0)}″</td>
      </tr>
    </table>"""

    firmas = html_firmas_validacion_newpoint_pdf(np, contrato)

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>@page {{ size: letter landscape; margin: 5mm 6mm; }}</style></head>
    <body style="font-family:Arial,Helvetica,sans-serif;font-size:5.5pt;margin:0;color:#0f172a;line-height:1.2;">
    {html_encabezado_pdf_compacto(contrato, titulo, subtitulo)}
    <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}">
      <colgroup><col width="57%"/><col width="43%"/></colgroup>
      <tr>
        <td valign="top" style="padding-right:3px;">
          {bloque_datos}{bloque_procedimiento}{bloque_elementos}
          <table cellspacing="0" cellpadding="0" style="{_PDF_TBL}">
            <colgroup><col width="50%"/><col width="50%"/></colgroup>
            <tr>
              <td valign="top" style="padding-right:2px;">{bloque_lado_c}</td>
              <td valign="top" style="padding-left:2px;">{bloque_angulos}</td>
            </tr>
            <tr>
              <td valign="top" style="padding-right:2px;">{bloque_radiacion_p1}</td>
              <td valign="top" style="padding-left:2px;">{bloque_radiacion_p2}</td>
            </tr>
          </table>
          {bloque_verificacion}
        </td>
        <td valign="top" style="padding-left:3px;border-left:1px solid #e2e8f0;">
          <div style="{sec}text-align:center;">Plano de ubicación — {nombre_nuevo}</div>
          <div style="text-align:center;">{svg}</div>
        </td>
      </tr>
    </table>
    {firmas}
    </body></html>"""


def html_documento_poligonal_pdf(
    contrato: dict,
    pol: dict,
    estaciones: list,
    cierre: Optional[dict],
    firmas: List[dict],
    punto_inicial: Optional[dict] = None,
    punto_final: Optional[dict] = None,
) -> str:
    """HTML: hoja cálculo compacta + hoja plano con rotulado."""
    titulo = f"Poligonal trigonométrica — {pol.get('nombre', '')}"
    bloque_calculo = f"""
    {html_tabla_poligonal_pdf(estaciones, pol)}
    {html_cierre_poligonal_pdf(cierre, pol)}
    """
    pagina_plano = html_pagina_plano_poligonal(
        contrato, pol, estaciones, punto_inicial, firmas, punto_final, cierre
    )
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="font-family:Arial,Helvetica,sans-serif;font-size:8pt;margin:8px;color:#0f172a;">
    {html_encabezado_pdf(contrato, titulo)}
    {bloque_calculo}
    {html_firmas_pdf(firmas)}
    {pagina_plano}
    </body></html>"""


def html_encabezado_pdf_compacto(
    contrato: dict, titulo: str, subtitulo: str = "", *, generado_por: str = ""
) -> str:
    """Encabezado compacto con 3 logos institucionales (Contratista | Interventoría | Entidad)."""
    from pdf_institucional import html_encabezado_institucional

    return html_encabezado_institucional(
        contrato,
        titulo,
        subtitulo=subtitulo,
        compact=True,
        generado_por=generado_por,
    )


def html_encabezado_pdf(contrato: dict, titulo: str) -> str:
    """Encabezado comun para PDFs de topografia (3 logos institucionales)."""
    from pdf_institucional import html_encabezado_institucional

    return html_encabezado_institucional(contrato, titulo, compact=False)


def html_pie_pdf(contrato: dict, *, font_size: str = "7pt") -> str:
    nombre = html.escape(str(contrato.get("objeto") or contrato.get("numero") or ""))
    return f"""
    <div style="font-size:{font_size};color:#64748b;text-align:center;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:6px;">
      Producto ClaraCore para el contrato {nombre}
    </div>
    """


def html_firmas_pdf(firmas: List[dict]) -> str:
    if not firmas:
        return ""
    from pdf_institucional import prepare_image_for_pdf

    rows = ""
    for f in firmas:
        img = f.get("firma_base64") or ""
        uri = prepare_image_for_pdf(str(img), max_px_w=400, max_px_h=200, allow_http=True) if img else ""
        img_html = (
            f'<img src="{html.escape(uri, quote=True)}" style="max-height:50px;" />' if uri else ""
        )
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
