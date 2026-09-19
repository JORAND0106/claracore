"""
Motor único de cálculo — Planillas de Tubería (ALCANTARILLA / FILTRO).

Fuente de verdad para sección, cartera calculada, cantidades y descuentos.
Frontend y exportaciones NO recalculan: consumen estos resultados.

Convenciones
------------
- Campo (inviolable): abscisa, terreno_natural, nivel_referencia
  (subrasante_via | terminado_filtro), cota_fondo_excavacion.
- Calculados: altura_excavacion, altura_triturado, altura_relleno, ancho_geotextil.
- Altura Relleno (atraque): 2·(θ/2 + esp) / denominador
  (denominador = segundo número de la relación 1:N).
"""
from __future__ import annotations

import math
from typing import Any, Optional

TIPOS_PLANILLA = ("ALCANTARILLA", "FILTRO")
RELACIONES_ATRAQUE = ("1:1", "1:2", "1:3", "1:4", "1:6")

ITEMS_CANTIDADES = (
    {"codigo": "EXC", "nombre": "Excavación", "unidad": "m³"},
    {"codigo": "TRI", "nombre": "Triturado / cama de atraque", "unidad": "m³"},
    {"codigo": "REL", "nombre": "Relleno compactado", "unidad": "m³"},
    {"codigo": "GEO", "nombre": "Geotextil", "unidad": "m²"},
    {"codigo": "TUB", "nombre": "Tubería instalada", "unidad": "m"},
)

# Descuentos vinculados por codigo de ítem (nunca por posición de fila).
# DESC_TUB descuenta Area2 del relleno (Area1 ya descuenta la fracción embebida).
ITEMS_DESCUENTOS_ALCANTARILLA = (
    {"codigo": "DESC_TUB", "nombre": "Descuento volumen tubería", "unidad": "m³", "item_cant_codigo": "REL"},
    {"codigo": "DESC_POZO", "nombre": "Descuento pozos / estructuras", "unidad": "m³", "item_cant_codigo": "EXC"},
)

ITEMS_DESCUENTOS_FILTRO = (
    {"codigo": "DESC_TUB", "nombre": "Descuento volumen tubería", "unidad": "m³", "item_cant_codigo": "REL"},
    {"codigo": "DESC_FILT", "nombre": "Descuento material filtro", "unidad": "m³", "item_cant_codigo": "REL"},
)


def _f(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        x = float(v)
        if math.isnan(x) or math.isinf(x):
            return None
        return x
    except (TypeError, ValueError):
        return None


def _r4(v: Optional[float]) -> Optional[float]:
    return round(v, 4) if v is not None else None


def _avg(vals: list[Optional[float]]) -> Optional[float]:
    xs = [v for v in vals if v is not None]
    return (sum(xs) / len(xs)) if xs else None


def parse_denominador_relacion(relacion: str) -> int:
    rel = (relacion or "").strip()
    if rel not in RELACIONES_ATRAQUE:
        raise ValueError(f"Relación de atraque inválida: {relacion!r}. Use {RELACIONES_ATRAQUE}.")
    return int(rel.split(":")[1])


def diametro_externo_m(theta_m: float, espesor_m: float) -> float:
    return float(theta_m) + 2.0 * float(espesor_m)


def altura_relleno_atraque_m(theta_m: float, espesor_m: float, relacion: str) -> float:
    """2·(θ/2 + esp) / denominador."""
    den = parse_denominador_relacion(relacion)
    return 2.0 * (float(theta_m) / 2.0 + float(espesor_m)) / den


def area_1_m2(theta_m: float, espesor_m: float, ancho_excavacion_m: float, relacion: str) -> float:
    """Área atraque: B·h − (área tubo)/denominador."""
    h = altura_relleno_atraque_m(theta_m, espesor_m, relacion)
    den = parse_denominador_relacion(relacion)
    d_ext = diametro_externo_m(theta_m, espesor_m)
    area_tubo = math.pi * (d_ext / 2.0) ** 2
    return max(0.0, float(ancho_excavacion_m) * h - area_tubo / den)


def area_2_m2(theta_m: float, espesor_m: float, relacion: str) -> float:
    """Fracción del tubo sobre el atraque."""
    den = parse_denominador_relacion(relacion)
    d_ext = diametro_externo_m(theta_m, espesor_m)
    area_tubo = math.pi * (d_ext / 2.0) ** 2
    return max(0.0, area_tubo * (1.0 - 1.0 / den))


def calcular_seccion(
    *,
    tipo: str,
    diametro_m: float,
    espesor_m: float,
    ancho_excavacion_m: float,
    relacion_atraque: str,
) -> dict[str, Any]:
    tipo_u = (tipo or "ALCANTARILLA").upper()
    if tipo_u not in TIPOS_PLANILLA:
        raise ValueError(f"Tipo de planilla inválido: {tipo}")
    theta = float(diametro_m)
    esp = float(espesor_m)
    b = float(ancho_excavacion_m)
    if theta <= 0 or esp < 0 or b <= 0:
        raise ValueError("Diámetro > 0, espesor ≥ 0 y ancho excavación > 0.")
    h = altura_relleno_atraque_m(theta, esp, relacion_atraque)
    return {
        "tipo": tipo_u,
        "diametro_m": theta,
        "espesor_m": esp,
        "diametro_externo_m": diametro_externo_m(theta, esp),
        "ancho_excavacion_m": b,
        "relacion_atraque": relacion_atraque,
        "denominador_atraque": parse_denominador_relacion(relacion_atraque),
        "altura_relleno_m": round(h, 6),
        "area_1_m2": round(area_1_m2(theta, esp, b, relacion_atraque), 6),
        "area_2_m2": round(area_2_m2(theta, esp, relacion_atraque), 6),
    }


def _nivel_ref(fila: dict, tipo: str) -> Optional[float]:
    if tipo == "FILTRO":
        v = fila.get("terminado_filtro")
        if v in (None, ""):
            v = fila.get("nivel_referencia")
        return _f(v)
    v = fila.get("subrasante_via")
    if v in (None, ""):
        v = fila.get("nivel_referencia")
    return _f(v)


def calcular_fila_cartera(fila_campo: dict, seccion: dict) -> dict[str, Any]:
    tipo = seccion["tipo"]
    abscisa = _f(fila_campo.get("abscisa"))
    tn = _f(fila_campo.get("terreno_natural"))
    cfe = _f(fila_campo.get("cota_fondo_excavacion"))
    nivel = _nivel_ref(fila_campo, tipo)
    h_atr = float(seccion["altura_relleno_m"])
    d_ext = float(seccion["diametro_externo_m"])
    b = float(seccion["ancho_excavacion_m"])

    vacio = all(v is None for v in (abscisa, tn, cfe, nivel))
    h_exc = (tn - cfe) if tn is not None and cfe is not None else None
    h_trit = None if vacio else h_atr

    h_rel = None
    if cfe is not None and nivel is not None:
        h_rel = nivel - (cfe + d_ext)

    ancho_geo = None
    if h_exc is not None:
        if tipo == "FILTRO":
            extra = (h_trit or 0.0) + max(h_rel or 0.0, 0.0)
            ancho_geo = b + 2.0 * extra
        else:
            ancho_geo = b + 2.0 * h_exc

    return {
        "orden": int(fila_campo.get("orden") or 0),
        "abscisa": abscisa,
        "terreno_natural": tn,
        "nivel_referencia": nivel,
        "subrasante_via": _f(fila_campo.get("subrasante_via")) if tipo == "ALCANTARILLA" else None,
        "terminado_filtro": _f(fila_campo.get("terminado_filtro")) if tipo == "FILTRO" else None,
        "cota_fondo_excavacion": cfe,
        "altura_excavacion": _r4(h_exc),
        "altura_triturado": _r4(h_trit),
        "altura_relleno": _r4(h_rel),
        "ancho_geotextil": _r4(ancho_geo),
        "vacio": vacio,
        "norte": _f(fila_campo.get("norte")),
        "este": _f(fila_campo.get("este")),
        "observacion": fila_campo.get("observacion") or None,
    }


def calcular_cartera(filas_campo: list[dict], seccion: dict) -> dict[str, Any]:
    filas = [calcular_fila_cartera(f, seccion) for f in (filas_campo or [])]
    activas = [f for f in filas if not f.get("vacio")]
    abs_vals = [f["abscisa"] for f in activas if f.get("abscisa") is not None]
    longitud = abs(max(abs_vals) - min(abs_vals)) if len(abs_vals) >= 2 else None
    return {
        "filas": filas,
        "totales": {
            "n_filas": len(activas),
            "longitud_m": _r4(longitud),
            "prom_altura_excavacion": _r4(_avg([f["altura_excavacion"] for f in activas])),
            "prom_altura_triturado": _r4(_avg([f["altura_triturado"] for f in activas])),
            "prom_altura_relleno": _r4(_avg([f["altura_relleno"] for f in activas])),
            "prom_ancho_geotextil": _r4(_avg([f["ancho_geotextil"] for f in activas])),
            "abscisa_inicial": min(abs_vals) if abs_vals else None,
            "abscisa_final": max(abs_vals) if abs_vals else None,
        },
    }


def _formula(codigo: str, tipo: str) -> str:
    return {
        "EXC": "B · prom(h_exc) · L",
        "TRI": "Area1 · L",
        "REL": "B · prom(h_relleno) · L" + (" (mín. Area2·L en FILTRO)" if tipo == "FILTRO" else ""),
        "GEO": "prom(ancho_geotextil) · L",
        "TUB": "L (abscisa_final − abscisa_inicial)",
    }.get(codigo, "")


def calcular_cantidades_y_descuentos(
    seccion: dict,
    cartera: dict,
    *,
    descuentos_manuales: Optional[list[dict]] = None,
) -> dict[str, Any]:
    tipo = seccion["tipo"]
    tot = cartera.get("totales") or {}
    L = float(tot.get("longitud_m") or 0.0)
    B = float(seccion["ancho_excavacion_m"])
    a1 = float(seccion["area_1_m2"])
    a2 = float(seccion["area_2_m2"])
    h_exc = float(tot.get("prom_altura_excavacion") or 0.0)
    h_rel = max(float(tot.get("prom_altura_relleno") or 0.0), 0.0)
    ancho_geo = float(tot.get("prom_ancho_geotextil") or 0.0)

    vols = {
        "EXC": B * h_exc * L,
        "TRI": a1 * L,
        "REL": max(B * h_rel * L, a2 * L) if tipo == "FILTRO" else B * h_rel * L,
        "GEO": ancho_geo * L,
        "TUB": L,
    }
    cantidades = [
        {**it, "cantidad": round(vols[it["codigo"]], 4), "formula": _formula(it["codigo"], tipo)}
        for it in ITEMS_CANTIDADES
    ]

    catalogo = ITEMS_DESCUENTOS_FILTRO if tipo == "FILTRO" else ITEMS_DESCUENTOS_ALCANTARILLA
    manual = {
        str(d.get("codigo")): _f(d.get("cantidad"))
        for d in (descuentos_manuales or [])
        if d.get("codigo")
    }
    descuentos = []
    for it in catalogo:
        cod = it["codigo"]
        if cod == "DESC_TUB":
            cant = a2 * L
        elif cod in manual and manual[cod] is not None:
            cant = float(manual[cod])
        else:
            cant = 0.0
        descuentos.append({**it, "cantidad": round(float(cant), 4)})

    netos = []
    for c in cantidades:
        resta = sum(d["cantidad"] for d in descuentos if d.get("item_cant_codigo") == c["codigo"])
        netos.append({
            "codigo": c["codigo"],
            "nombre": c["nombre"],
            "unidad": c["unidad"],
            "bruto": c["cantidad"],
            "descuentos": round(resta, 4),
            "neto": round(c["cantidad"] - resta, 4),
        })
    return {"cantidades": cantidades, "descuentos": descuentos, "netos": netos}


def perfil_longitudinal(cartera: dict, seccion: dict) -> dict[str, Any]:
    series = {
        "abscisas": [],
        "terreno_natural": [],
        "nivel_referencia": [],
        "cota_fondo_excavacion": [],
        "etiqueta_nivel": "Terminado filtro" if seccion["tipo"] == "FILTRO" else "Subrasante vía",
    }
    for f in cartera.get("filas") or []:
        if f.get("vacio"):
            continue
        series["abscisas"].append(f.get("abscisa"))
        series["terreno_natural"].append(f.get("terreno_natural"))
        series["nivel_referencia"].append(f.get("nivel_referencia"))
        series["cota_fondo_excavacion"].append(f.get("cota_fondo_excavacion"))
    return series


def seccion_tipica_params(seccion: dict, cartera: dict) -> dict[str, Any]:
    tot = cartera.get("totales") or {}
    return {
        "tipo": seccion["tipo"],
        "diametro_externo_m": seccion["diametro_externo_m"],
        "ancho_excavacion_m": seccion["ancho_excavacion_m"],
        "altura_relleno_m": seccion["altura_relleno_m"],
        "area_1_m2": seccion["area_1_m2"],
        "area_2_m2": seccion["area_2_m2"],
        "prom_altura_excavacion": tot.get("prom_altura_excavacion"),
        "prom_altura_triturado": tot.get("prom_altura_triturado"),
        "prom_altura_relleno": tot.get("prom_altura_relleno"),
        "prom_ancho_geotextil": tot.get("prom_ancho_geotextil"),
        "relacion_atraque": seccion["relacion_atraque"],
    }


def calcular_planilla_completa(
    *,
    tipo: str,
    diametro_m: float,
    espesor_m: float,
    ancho_excavacion_m: float,
    relacion_atraque: str,
    filas_campo: list[dict],
    descuentos_manuales: Optional[list[dict]] = None,
) -> dict[str, Any]:
    seccion = calcular_seccion(
        tipo=tipo,
        diametro_m=diametro_m,
        espesor_m=espesor_m,
        ancho_excavacion_m=ancho_excavacion_m,
        relacion_atraque=relacion_atraque,
    )
    cartera = calcular_cartera(filas_campo, seccion)
    cant = calcular_cantidades_y_descuentos(
        seccion, cartera, descuentos_manuales=descuentos_manuales
    )
    return {
        "seccion": seccion,
        "cartera": cartera,
        "cantidades": cant["cantidades"],
        "descuentos": cant["descuentos"],
        "netos": cant["netos"],
        "perfil": perfil_longitudinal(cartera, seccion),
        "seccion_tipica": seccion_tipica_params(seccion, cartera),
    }


def construir_fila_consolidado(planilla: dict, calculo: dict) -> dict[str, Any]:
    """22 columnas del consolidado de tramo."""
    cab = planilla or {}
    sec = calculo.get("seccion") or {}
    tot = (calculo.get("cartera") or {}).get("totales") or {}
    netos = {n["codigo"]: n for n in (calculo.get("netos") or [])}
    return {
        "c01_planilla_id": cab.get("id"),
        "c02_tipo": sec.get("tipo") or cab.get("tipo"),
        "c03_pk_id": cab.get("pk_id"),
        "c04_nombre": cab.get("nombre"),
        "c05_costado": cab.get("costado"),
        "c06_abscisa_inicial": tot.get("abscisa_inicial"),
        "c07_abscisa_final": tot.get("abscisa_final"),
        "c08_longitud_m": tot.get("longitud_m"),
        "c09_diametro_m": sec.get("diametro_m"),
        "c10_espesor_m": sec.get("espesor_m"),
        "c11_relacion_atraque": sec.get("relacion_atraque"),
        "c12_ancho_excavacion_m": sec.get("ancho_excavacion_m"),
        "c13_vol_excavacion_m3": (netos.get("EXC") or {}).get("neto"),
        "c14_vol_triturado_m3": (netos.get("TRI") or {}).get("neto"),
        "c15_vol_relleno_m3": (netos.get("REL") or {}).get("neto"),
        "c16_area_geotextil_m2": (netos.get("GEO") or {}).get("neto"),
        "c17_long_tuberia_m": (netos.get("TUB") or {}).get("neto"),
        "c18_norte_ref": cab.get("norte_ref"),
        "c19_este_ref": cab.get("este_ref"),
        "c20_estado": cab.get("estado"),
        "c21_cerrado_at": cab.get("cerrado_at"),
        "c22_contrato_id": cab.get("contrato_id"),
    }


def validar_fila_campo(fila: dict, tipo: str) -> list[dict]:
    avisos: list[dict] = []
    tipo_u = (tipo or "ALCANTARILLA").upper()
    abscisa = _f(fila.get("abscisa"))
    tn = _f(fila.get("terreno_natural"))
    cfe = _f(fila.get("cota_fondo_excavacion"))
    nivel = _nivel_ref(fila, tipo_u)
    if all(v is None for v in (abscisa, tn, cfe, nivel)):
        return avisos
    if abscisa is None:
        avisos.append({"severity": "error", "campo": "abscisa", "msg": "Abscisa requerida",
                       "detalle": "Toda fila con datos de cota debe tener abscisa."})
    if tn is None:
        avisos.append({"severity": "error", "campo": "terreno_natural", "msg": "TN requerido",
                       "detalle": "Indique cota de terreno natural."})
    if cfe is None:
        avisos.append({"severity": "error", "campo": "cota_fondo_excavacion", "msg": "CFE requerida",
                       "detalle": "Indique cota fondo de excavación."})
    if nivel is None:
        label = "Terminado filtro" if tipo_u == "FILTRO" else "Subrasante"
        avisos.append({"severity": "info", "campo": "nivel_referencia", "msg": f"{label} vacío",
                       "detalle": f"Sin {label} no se calcula altura de relleno ni geotextil completo."})
    if tn is not None and cfe is not None and cfe > tn:
        avisos.append({"severity": "error", "campo": "cota_fondo_excavacion", "msg": "CFE > TN",
                       "detalle": "La cota fondo no puede superar el terreno natural."})
    if tn is not None and nivel is not None and nivel > tn + 0.05:
        avisos.append({"severity": "info", "campo": "nivel_referencia", "msg": "Nivel sobre TN",
                       "detalle": "El nivel de referencia está >5 cm sobre el terreno natural."})
    if nivel is not None and cfe is not None and nivel < cfe:
        avisos.append({"severity": "error", "campo": "nivel_referencia", "msg": "Nivel < CFE",
                       "detalle": "El nivel de referencia debe quedar sobre el fondo de excavación."})
    return avisos


def validar_cartera_campo(filas: list[dict], tipo: str) -> dict[str, Any]:
    errores: list[dict] = []
    infos: list[dict] = []
    for i, f in enumerate(filas or []):
        for a in validar_fila_campo(f, tipo):
            item = {**a, "orden": f.get("orden", i + 1), "fila_idx": i}
            (errores if a["severity"] == "error" else infos).append(item)
    prev = None
    for i, f in enumerate(filas or []):
        ab = _f(f.get("abscisa"))
        tn = _f(f.get("terreno_natural"))
        cfe = _f(f.get("cota_fondo_excavacion"))
        if ab is None and tn is None and cfe is None:
            continue
        if ab is not None and prev is not None and ab < prev:
            errores.append({
                "severity": "error", "campo": "abscisa", "msg": "Abscisa no creciente",
                "detalle": f"La abscisa {ab} es menor que la anterior {prev}.",
                "orden": f.get("orden", i + 1), "fila_idx": i,
            })
        if ab is not None:
            prev = ab
    return {"ok": len(errores) == 0, "errores": errores, "infos": infos}


# Aliases estables para rutas / tests
calcular_seccion_planilla = calcular_seccion
altura_relleno_m = altura_relleno_atraque_m
