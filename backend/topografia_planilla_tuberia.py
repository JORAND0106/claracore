"""
Motor de cálculo — Planillas de Tubería (ALCANTARILLA / FILTRO).

Fórmulas alineadas al inventario literal de Planilla_Tuberia_original.xlsm
(docs/topografia/planillas_tuberia/). Frontend y exportaciones consumen
estos resultados; no recalculan.
"""
from __future__ import annotations

import math
from typing import Any, Optional

TIPOS_PLANILLA = ("ALCANTARILLA", "FILTRO")
# Filas mínimas al crear planilla / plantilla PDF vacía (UI + export).
FILAS_INICIALES_CARTERA = 2
RELACIONES_ATRAQUE = ("1:1", "1:2", "1:3", "1:4", "1:6")

# Rótulos literales del XLSM (sharedStrings / planilla)
TITULO_ALCANTARILLA = "PLANILLA DE INSTALACIÓN DE TUBERÍA ALCANTARILLAS"
TITULO_FILTRO = "PLANILLA DE INSTALACIÓN DE FILTROS"
CODIGO_DOCUMENTO = "INF-ING - TOP - 001 - V0"

# Orden UI: fijos primero; Excavación Roca y Otros al final (editables).
ITEMS_CANTIDADES = (
    {"codigo": "EXC", "nombre": "Excavación Varias", "unidad": "m³"},
    {"codigo": "TUB", "nombre": "Long Tubería", "unidad": "ml"},
    {"codigo": "TRI", "nombre": "Triturado / Atraque", "unidad": "m³"},
    {"codigo": "REL", "nombre": "Relleno Gran.", "unidad": "m³"},
    {"codigo": "GEO", "nombre": "Geotextil", "unidad": "m²"},
    {"codigo": "EXC_ROC", "nombre": "Excavación Roca", "unidad": "m³", "editable_dims": True},
    {
        "codigo": "OTROS",
        "nombre": "Otros: ____",
        "unidad": "m³",
        "editable_dims": True,
        "editable_nombre": True,
    },
)

# Códigos de Resumen de Cantidades con Long/Ancho/Espesor editables por el usuario.
# OTROS admite múltiples líneas: OTROS, OTROS_1, OTROS_2, …
CODIGOS_CANTIDADES_EDITABLES = frozenset({"EXC_ROC", "OTROS"})

# Campos de cartera (promedios) de los que se puede descontar altura/espesor.
CAMPOS_DESCUENTO_ALTURA = (
    ("prom_altura_excavacion", "Altura Excavación"),
    ("prom_altura_triturado", "Altura Triturado"),
    ("prom_altura_relleno", "Altura Relleno"),
)
CAMPOS_DESCUENTO_ALTURA_SET = frozenset(c for c, _ in CAMPOS_DESCUENTO_ALTURA)


def es_codigo_otros(codigo: Any) -> bool:
    cod = str(codigo or "").strip().upper()
    return cod == "OTROS" or cod.startswith("OTROS_")


def es_codigo_cantidad_editable(codigo: Any) -> bool:
    cod = str(codigo or "").strip().upper()
    return cod == "EXC_ROC" or es_codigo_otros(cod)

# Descuentos específicos (I43:N50). Vinculados por codigo de ítem de cantidad.
ITEMS_DESCUENTOS_ALCANTARILLA = (
    {"codigo": "DESC_A1", "nombre": "Area 1", "unidad": "m³", "item_cant_codigo": "TRI"},
    {"codigo": "DESC_A2", "nombre": "Area 2", "unidad": "m³", "item_cant_codigo": "REL"},
    {"codigo": "DESC_OTROS", "nombre": "Otros", "unidad": "m³", "item_cant_codigo": "EXC"},
)

ITEMS_DESCUENTOS_FILTRO = (
    {"codigo": "DESC_TUB_FILT", "nombre": "Tubería Filtro", "unidad": "m³", "item_cant_codigo": "TRI"},
    {"codigo": "DESC_OTROS", "nombre": "Otros", "unidad": "m³", "item_cant_codigo": "EXC"},
)

# Compat: tests / rutas antiguas esperaban DESC_TUB / DESC_POZO / DESC_FILT
ITEMS_DESCUENTOS_ALCANTARILLA_LEGACY_ALIAS = {
    "DESC_TUB": "DESC_A2",
    "DESC_POZO": "DESC_OTROS",
}
ITEMS_DESCUENTOS_FILTRO_LEGACY_ALIAS = {
    "DESC_TUB": "DESC_TUB_FILT",
    "DESC_FILT": "DESC_OTROS",
}

ESPESOR_ROCA_M = 0.05  # F46 literal del XLSM


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


def _r3(v: Optional[float]) -> Optional[float]:
    return round(v, 3) if v is not None else None


def _r2(v: Optional[float]) -> Optional[float]:
    return round(v, 2) if v is not None else None


def _r4(v: Optional[float]) -> Optional[float]:
    return round(v, 4) if v is not None else None


def _avg(vals: list[Optional[float]]) -> Optional[float]:
    xs = [v for v in vals if v is not None]
    return (sum(xs) / len(xs)) if xs else None


def _product(vals: list[Optional[float]]) -> Optional[float]:
    """PRODUCT de Excel: ignora vacíos; si no queda ningún factor → None."""
    xs = [float(v) for v in vals if v is not None]
    if not xs:
        return None
    p = 1.0
    for x in xs:
        p *= x
    return p


def parse_denominador_relacion(relacion: str) -> int:
    rel = (relacion or "").strip()
    if rel not in RELACIONES_ATRAQUE:
        raise ValueError(f"Relación de atraque inválida: {relacion!r}. Use {RELACIONES_ATRAQUE}.")
    return int(rel.split(":")[1])


def diametro_externo_m(theta_m: float, espesor_m: float) -> float:
    """Diámetro externo = θ + 2·esp (equiv. 2·(θ/2+esp))."""
    return float(theta_m) + 2.0 * float(espesor_m)


def radio_externo_m(theta_m: float, espesor_m: float) -> float:
    """r = I13/2 + J13."""
    return float(theta_m) / 2.0 + float(espesor_m)


def area_tuberia_m2(theta_m: float, espesor_m: float) -> float:
    """K13: =ROUND(PI()*((I13/2)+J13)^2, 3)."""
    r = radio_externo_m(theta_m, espesor_m)
    return round(math.pi * r * r, 3)


def altura_relleno_atraque_m(theta_m: float, espesor_m: float, relacion: str) -> float:
    """E15: =ROUND(2*(I13/2+J13)/N, 3) donde N = denominador de D15."""
    den = parse_denominador_relacion(relacion)
    return round(2.0 * radio_externo_m(theta_m, espesor_m) / den, 3)


def area_1_m2(
    theta_m: float,
    espesor_m: float,
    ancho_excavacion_m: float = 0.0,  # no usado (compat firma); segmento circular
    relacion: str = "1:3",
    *,
    altura_relleno_m: Optional[float] = None,
) -> float:
    """
    B15 (segmento circular):
    r=I13/2+J13; h=E15;
    ROUND(r²·ACOS((r−h)/r) − (r−h)·√(2rh−h²), 3)
    """
    r = radio_externo_m(theta_m, espesor_m)
    h = float(altura_relleno_m) if altura_relleno_m is not None else altura_relleno_atraque_m(
        theta_m, espesor_m, relacion
    )
    if r <= 0 or h <= 0:
        return 0.0
    if h >= 2.0 * r:
        return area_tuberia_m2(theta_m, espesor_m)
    h = min(h, 2.0 * r)
    # Evitar dominio inválido de acos
    arg = max(-1.0, min(1.0, (r - h) / r))
    seg = r * r * math.acos(arg) - (r - h) * math.sqrt(max(0.0, 2.0 * r * h - h * h))
    return max(0.0, round(seg, 3))


def area_2_m2(
    theta_m: float,
    espesor_m: float,
    relacion: str = "1:3",
    *,
    area_1: Optional[float] = None,
) -> float:
    """C15: =IFERROR(ROUND(K13−B15, 3), \"\")."""
    a_tub = area_tuberia_m2(theta_m, espesor_m)
    a1 = float(area_1) if area_1 is not None else area_1_m2(theta_m, espesor_m, 0.0, relacion)
    return max(0.0, round(a_tub - a1, 3))


def calcular_seccion(
    *,
    tipo: str,
    diametro_m: float,
    espesor_m: float,
    ancho_excavacion_m: float,
    relacion_atraque: str,
    cama_triturado_m: float = 0.0,
) -> dict[str, Any]:
    tipo_u = (tipo or "ALCANTARILLA").upper()
    if tipo_u not in TIPOS_PLANILLA:
        raise ValueError(f"Tipo de planilla inválido: {tipo}")
    theta = float(diametro_m)
    esp = float(espesor_m)
    b = float(ancho_excavacion_m)
    cama = float(cama_triturado_m or 0.0)
    if theta <= 0 or esp < 0 or b <= 0:
        raise ValueError("Diámetro > 0, espesor ≥ 0 y ancho excavación > 0.")
    if cama < 0:
        raise ValueError("Cama triturado ≥ 0.")
    h = altura_relleno_atraque_m(theta, esp, relacion_atraque)
    a_tub = area_tuberia_m2(theta, esp)
    a1 = area_1_m2(theta, esp, b, relacion_atraque, altura_relleno_m=h)
    a2 = area_2_m2(theta, esp, relacion_atraque, area_1=a1)
    return {
        "tipo": tipo_u,
        "titulo": TITULO_FILTRO if tipo_u == "FILTRO" else TITULO_ALCANTARILLA,
        "codigo_documento": CODIGO_DOCUMENTO,
        "tipo_red": "FILTRO" if tipo_u == "FILTRO" else "ALCANTARILLA",
        "diametro_m": theta,
        "espesor_m": esp,
        "diametro_externo_m": diametro_externo_m(theta, esp),
        "radio_externo_m": round(radio_externo_m(theta, esp), 6),
        "ancho_excavacion_m": b,
        "relacion_atraque": relacion_atraque,
        "denominador_atraque": parse_denominador_relacion(relacion_atraque),
        "altura_relleno_m": h,
        "cama_triturado_m": round(cama, 6) if tipo_u == "ALCANTARILLA" else 0.0,
        "etiqueta_cama": "Cama Triturado" if tipo_u == "ALCANTARILLA" else "",
        "area_tuberia_m2": a_tub,
        "area_1_m2": a1,
        "area_2_m2": a2,
    }


def _nivel_ref(fila: dict, tipo: str) -> Optional[float]:
    """Nivel de referencia según tipo, con fallback cruzado al cambiar de tipo.

    ALCANTARILLA: subrasante_via → nivel_referencia → terminado_filtro
    FILTRO: terminado_filtro → nivel_referencia → subrasante_via
    """
    if tipo == "FILTRO":
        for key in ("terminado_filtro", "nivel_referencia", "subrasante_via"):
            v = fila.get(key)
            if v not in (None, ""):
                return _f(v)
        return None
    for key in ("subrasante_via", "nivel_referencia", "terminado_filtro"):
        v = fila.get(key)
        if v not in (None, ""):
            return _f(v)
    return None


def migrar_filas_campo_al_cambiar_tipo(
    filas: list[dict], tipo_nuevo: str
) -> list[dict]:
    """Copia el nivel entre subrasante_via ↔ terminado_filtro al cambiar de tipo.

    Evita que queden cotas huérfanas del tipo anterior tras un cambio de selección.
    """
    tipo_u = (tipo_nuevo or "ALCANTARILLA").upper()
    out: list[dict] = []
    for f in filas or []:
        row = dict(f)
        sub = row.get("subrasante_via")
        term = row.get("terminado_filtro")
        if tipo_u == "FILTRO":
            if term in (None, "") and sub not in (None, ""):
                row["terminado_filtro"] = sub
            # No borrar subrasante: el motor ya prioriza terminado_filtro en FILTRO
        else:
            if sub in (None, "") and term not in (None, ""):
                row["subrasante_via"] = term
        out.append(row)
    return out


def codigos_descuento_validos(tipo: str) -> set[str]:
    cat = ITEMS_DESCUENTOS_FILTRO if (tipo or "").upper() == "FILTRO" else ITEMS_DESCUENTOS_ALCANTARILLA
    return {it["codigo"] for it in cat}


def filtrar_descuentos_manuales_por_tipo(
    tipo: str, descuentos_manuales: Optional[list[dict]]
) -> list[dict]:
    """Conserva solo códigos válidos para el tipo (p.ej. DESC_OTROS); descarta residuos."""
    valid = codigos_descuento_validos(tipo)
    alias = (
        ITEMS_DESCUENTOS_FILTRO_LEGACY_ALIAS
        if (tipo or "").upper() == "FILTRO"
        else ITEMS_DESCUENTOS_ALCANTARILLA_LEGACY_ALIAS
    )
    out: list[dict] = []
    for d in descuentos_manuales or []:
        cod = str(d.get("codigo") or "")
        cod = alias.get(cod, cod)
        if cod in valid:
            out.append({**d, "codigo": cod})
    return out


def _cota_lomo_o_terminado(fila: dict, tipo: str) -> Optional[float]:
    """Columna E: Cota Lomo (ALC) o Terminado Filtro (FIL)."""
    if tipo == "FILTRO":
        return _nivel_ref(fila, tipo)
    v = fila.get("cota_lomo")
    if v in (None, ""):
        v = fila.get("terminado_filtro")
    return _f(v)


def calcular_fila_cartera(
    fila_campo: dict,
    seccion: dict,
    *,
    h_trit_prev: Optional[float] = None,
) -> dict[str, Any]:
    """
    Fórmulas G/H/I/J del XLSM (filas 17–36):
    G = C−F
    H ALC = $E$15+$F$15; FIL = E−F
    I ALC = G−($E$15+$F$15); FIL = 0
    J ALC = \"\"; FIL = AVERAGE(Hprev:H)·2+$G$15·2 (desde 2ª fila con dato)
    """
    tipo = seccion["tipo"]
    abscisa = _f(fila_campo.get("abscisa"))
    tn = _f(fila_campo.get("terreno_natural"))
    cfe = _f(fila_campo.get("cota_fondo_excavacion"))
    sub = _f(fila_campo.get("subrasante_via")) if tipo == "ALCANTARILLA" else None
    term = _cota_lomo_o_terminado(fila_campo, tipo)
    nivel = _nivel_ref(fila_campo, tipo)
    h_atr = float(seccion["altura_relleno_m"])
    cama = float(seccion.get("cama_triturado_m") or 0.0)
    b = float(seccion["ancho_excavacion_m"])

    vacio = all(v is None for v in (abscisa, tn, cfe, nivel, term, sub))

    h_exc = None
    if abscisa is not None and abscisa != 0 and tn is not None and cfe is not None:
        h_exc = tn - cfe
    elif tn is not None and cfe is not None and abscisa is None:
        # fila parcial: aún así TN−CFE si hay cotas
        h_exc = tn - cfe

    h_trit = None
    h_rel = None
    ancho_geo = None

    if h_exc is not None:
        if tipo == "ALCANTARILLA":
            h_trit = h_atr + cama
            h_rel = h_exc - (h_atr + cama)
            ancho_geo = None  # ALC: vacío en Excel
        else:
            # FILTRO: H = E−F; I = 0; J = avg*2 + B*2
            if term is not None and cfe is not None:
                h_trit = term - cfe
            h_rel = 0.0
            if h_trit is not None:
                if h_trit_prev is not None:
                    ancho_geo = ((h_trit_prev + h_trit) / 2.0) * 2.0 + b * 2.0
                else:
                    ancho_geo = None  # J17 vacío en plantilla

    return {
        "orden": int(fila_campo.get("orden") or 0),
        "abscisa": abscisa,
        "terreno_natural": tn,
        "nivel_referencia": nivel,
        "subrasante_via": sub,
        "terminado_filtro": term if tipo == "FILTRO" else None,
        "cota_lomo": term if tipo == "ALCANTARILLA" else None,
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
    filas: list[dict] = []
    h_prev: Optional[float] = None
    for f in filas_campo or []:
        row = calcular_fila_cartera(f, seccion, h_trit_prev=h_prev)
        filas.append(row)
        if row.get("altura_triturado") is not None and not row.get("vacio"):
            h_prev = row["altura_triturado"]
    activas = [f for f in filas if not f.get("vacio")]
    abs_vals = [f["abscisa"] for f in activas if f.get("abscisa") is not None]
    longitud = abs(max(abs_vals) - min(abs_vals)) if len(abs_vals) >= 2 else None
    return {
        "filas": filas,
        "totales": {
            "n_filas": len(activas),
            "longitud_m": _r4(longitud),  # B41 = MAX−MIN
            "prom_altura_excavacion": _r4(_avg([f["altura_excavacion"] for f in activas])),
            "prom_altura_triturado": _r4(_avg([f["altura_triturado"] for f in activas])),
            "prom_altura_relleno": _r4(_avg([f["altura_relleno"] for f in activas])),
            "prom_ancho_geotextil": _r4(_avg([f["ancho_geotextil"] for f in activas])),
            "abscisa_inicial": min(abs_vals) if abs_vals else None,
            "abscisa_final": max(abs_vals) if abs_vals else None,
        },
    }


def _normalize_manual_descuentos(
    tipo: str, descuentos_manuales: Optional[list[dict]]
) -> dict[str, float]:
    alias = (
        ITEMS_DESCUENTOS_FILTRO_LEGACY_ALIAS
        if tipo == "FILTRO"
        else ITEMS_DESCUENTOS_ALCANTARILLA_LEGACY_ALIAS
    )
    out: dict[str, float] = {}
    for d in descuentos_manuales or []:
        cod = str(d.get("codigo") or "")
        cod = alias.get(cod, cod)
        cant = _f(d.get("cantidad"))
        if cod and cant is not None:
            out[cod] = float(cant)
    return out


def _normalize_cantidades_manuales(
    cantidades_manuales: Optional[list[dict]],
) -> list[dict[str, Any]]:
    """Lista de overrides EXC_ROC / OTROS[_n] (dims, nombre, descontar_de)."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for d in cantidades_manuales or []:
        if not isinstance(d, dict):
            continue
        cod = str(d.get("codigo") or "").strip().upper()
        if not es_codigo_cantidad_editable(cod):
            continue
        # Compat: un solo "OTROS" → OTROS_1
        if cod == "OTROS":
            cod = "OTROS_1"
        if cod in seen:
            continue
        seen.add(cod)
        entry: dict[str, Any] = {"codigo": cod}
        for key in ("long", "ancho", "espesor"):
            if key in d and d.get(key) is not None and d.get(key) != "":
                entry[key] = _f(d.get(key))
        if es_codigo_otros(cod) and "nombre" in d:
            entry["nombre"] = str(d.get("nombre") or "").strip()
        desc_de = d.get("descontar_de")
        if desc_de in CAMPOS_DESCUENTO_ALTURA_SET:
            entry["descontar_de"] = desc_de
        out.append(entry)
    # Siempre al menos una línea OTROS_1 (vacía) para UI/export
    if not any(es_codigo_otros(x["codigo"]) for x in out):
        out.append({"codigo": "OTROS_1"})
    # EXC_ROC siempre presente como override vacío si falta
    if not any(x["codigo"] == "EXC_ROC" for x in out):
        out.insert(0, {"codigo": "EXC_ROC"})
    else:
        # Mantener EXC_ROC primero entre editables
        out.sort(key=lambda x: (0 if x["codigo"] == "EXC_ROC" else 1, x["codigo"]))
    return out


def _meta_item_cantidad(codigo: str) -> dict[str, Any]:
    if codigo == "EXC_ROC":
        return next(it for it in ITEMS_CANTIDADES if it["codigo"] == "EXC_ROC")
    if es_codigo_otros(codigo):
        base = next(it for it in ITEMS_CANTIDADES if it["codigo"] == "OTROS")
        return {**base, "codigo": codigo}
    return next(it for it in ITEMS_CANTIDADES if it["codigo"] == codigo)


def calcular_cantidades_y_descuentos(
    seccion: dict,
    cartera: dict,
    *,
    descuentos_manuales: Optional[list[dict]] = None,
    cantidades_manuales: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """
    Resumen de Cantidades + Descuentos Específicos.
    Cantidad = ROUND(PRODUCT(Long,Ancho,Espesor),2) − Desc (solo Triturado).
    EXC_ROC y OTROS[_n] admiten Long/Ancho/Espesor (y nombre en OTROS) por override.
    descontar_de resta el espesor del promedio de cartera indicado.
    """
    tipo = seccion["tipo"]
    tot = cartera.get("totales") or {}
    L = float(tot.get("longitud_m") or 0.0)
    B = float(seccion["ancho_excavacion_m"])
    a1 = float(seccion["area_1_m2"])
    a2 = float(seccion["area_2_m2"])
    a_tub = float(seccion["area_tuberia_m2"])
    h_exc = float(tot.get("prom_altura_excavacion") or 0.0)
    h_trit = float(tot.get("prom_altura_triturado") or 0.0)
    h_rel = float(tot.get("prom_altura_relleno") or 0.0)
    ancho_geo = float(tot.get("prom_ancho_geotextil") or 0.0)

    overrides_list = _normalize_cantidades_manuales(cantidades_manuales)
    # Descuentos de altura cruzados (suma de espesores por campo destino)
    restas = {k: 0.0 for k in CAMPOS_DESCUENTO_ALTURA_SET}
    for ov in overrides_list:
        campo = ov.get("descontar_de")
        esp = ov.get("espesor")
        if campo in restas and esp is not None:
            restas[campo] += float(esp)
    h_exc = max(0.0, h_exc - restas.get("prom_altura_excavacion", 0.0))
    h_trit = max(0.0, h_trit - restas.get("prom_altura_triturado", 0.0))
    h_rel = max(0.0, h_rel - restas.get("prom_altura_relleno", 0.0))

    # Descuentos dimensionales automáticos
    if tipo == "ALCANTARILLA":
        desc_a1 = _r2(_product([L, a1])) or 0.0
        desc_a2 = _r2(_product([L, a2])) or 0.0
        desc_tub_filt = 0.0
        desc_tri = desc_a1
        desc_rel = desc_a2
    else:
        desc_a1 = 0.0
        desc_a2 = 0.0
        desc_tub_filt = _r2(_product([L, a_tub])) or 0.0
        desc_tri = desc_tub_filt
        desc_rel = 0.0

    manual = _normalize_manual_descuentos(tipo, descuentos_manuales)
    desc_otros = float(manual.get("DESC_OTROS") or 0.0)

    def _row(
        codigo: str,
        long: Optional[float],
        ancho: Optional[float],
        espesor: Optional[float],
        desc: float = 0.0,
        restar_desc: bool = False,
        *,
        nombre: Optional[str] = None,
        descontar_de: Optional[str] = None,
    ) -> dict:
        meta = _meta_item_cantidad(codigo)
        prod = _product([long, ancho, espesor])
        bruto = _r2(prod) if prod is not None else 0.0
        if bruto is None:
            bruto = 0.0
        cant = round(bruto - desc, 2) if restar_desc else bruto
        row = {
            **meta,
            "long": _r4(long),
            "ancho": _r4(ancho),
            "espesor": _r4(espesor),
            "desc": round(desc, 2),
            "cantidad": round(cant, 2),
            "bruto": round(bruto, 2),
            "formula": f"ROUND(PRODUCT({long},{ancho},{espesor}),2)"
            + (f"-{desc}" if restar_desc and desc else ""),
        }
        if nombre is not None:
            row["nombre"] = nombre
        if descontar_de:
            row["descontar_de"] = descontar_de
        return row

    ov_by_cod = {o["codigo"]: o for o in overrides_list}
    ov_roc = ov_by_cod.get("EXC_ROC") or {}
    roc_long = ov_roc["long"] if "long" in ov_roc else L
    roc_ancho = ov_roc["ancho"] if "ancho" in ov_roc else B
    roc_esp = ov_roc["espesor"] if "espesor" in ov_roc else ESPESOR_ROCA_M

    cantidades = [
        _row("EXC", L, B, h_exc),
        _row("TUB", L, None, None),
        _row("TRI", L, B, h_trit, desc=desc_tri, restar_desc=True),
        _row("REL", L, B, h_rel, desc=desc_rel, restar_desc=False),
        _row("GEO", L, ancho_geo if ancho_geo else None, None),
        _row(
            "EXC_ROC", roc_long, roc_ancho, roc_esp,
            descontar_de=ov_roc.get("descontar_de"),
        ),
    ]

    for ov in overrides_list:
        if not es_codigo_otros(ov["codigo"]):
            continue
        otr_nombre = ov.get("nombre")
        if otr_nombre:
            otr_label = (
                f"Otros: {otr_nombre}"
                if not str(otr_nombre).lower().startswith("otros")
                else otr_nombre
            )
        else:
            otr_label = "Otros: ____"
        cantidades.append(
            _row(
                ov["codigo"],
                ov.get("long"),
                ov.get("ancho"),
                ov.get("espesor"),
                nombre=otr_label,
                descontar_de=ov.get("descontar_de"),
            )
        )

    catalogo = ITEMS_DESCUENTOS_FILTRO if tipo == "FILTRO" else ITEMS_DESCUENTOS_ALCANTARILLA
    descuentos: list[dict] = []
    for it in catalogo:
        cod = it["codigo"]
        if cod == "DESC_A1":
            cant, long, ancho, esp = desc_a1, L, None, a1
        elif cod == "DESC_A2":
            cant, long, ancho, esp = desc_a2, L, None, a2
        elif cod == "DESC_TUB_FILT":
            cant, long, ancho, esp = desc_tub_filt, L, None, a_tub
        elif cod == "DESC_OTROS":
            cant, long, ancho, esp = desc_otros, None, None, None
        else:
            cant, long, ancho, esp = float(manual.get(cod) or 0.0), None, None, None
        descuentos.append({
            **it,
            "long": _r4(long),
            "ancho": _r4(ancho),
            "espesor": _r4(esp),
            "cantidad": round(float(cant), 2),
        })

    netos = []
    for c in cantidades:
        if c["codigo"] == "TRI":
            descuento = c["desc"]
            bruto = c["bruto"]
            neto = c["cantidad"]
        elif c["codigo"] == "REL":
            descuento = c["desc"]
            bruto = c["cantidad"]
            neto = c["cantidad"]
        elif c["codigo"] == "EXC":
            descuento = desc_otros
            bruto = c["cantidad"]
            neto = round(bruto - descuento, 2)
        else:
            descuento = 0.0
            bruto = c["cantidad"]
            neto = c["cantidad"]
        netos.append({
            "codigo": c["codigo"],
            "nombre": c["nombre"],
            "unidad": c["unidad"],
            "long": c.get("long"),
            "ancho": c.get("ancho"),
            "espesor": c.get("espesor"),
            "bruto": bruto,
            "descuentos": round(descuento, 2),
            "neto": round(neto, 2),
            "editable_dims": bool(c.get("editable_dims")),
            "editable_nombre": bool(c.get("editable_nombre")),
            "descontar_de": c.get("descontar_de"),
        })
    return {
        "cantidades": cantidades,
        "descuentos": descuentos,
        "netos": netos,
        "descuentos_altura": {
            k: round(v, 4) for k, v in restas.items() if v
        },
    }



def perfil_longitudinal(cartera: dict, seccion: dict) -> dict[str, Any]:
    """Series del ScatterChart: TN [/ Subrasante] / Terminado|Cota Lomo / Cota Fondo."""
    tipo = seccion["tipo"]
    etiqueta = "Terminado Filtro" if tipo == "FILTRO" else "Cota Lomo"
    series: dict[str, Any] = {
        "abscisas": [],
        "terreno_natural": [],
        "nivel_referencia": [],
        "cota_fondo_excavacion": [],
        "etiqueta_nivel": etiqueta,
        "titulo_grafico": "Perfil Longitudinal de Tubería",
        "eje_x": "longitud de tramo",
        "eje_y": "cota",
    }
    if tipo == "ALCANTARILLA":
        series["subrasante_via"] = []
        series["cota_lomo"] = []
        series["etiqueta_subrasante"] = "Subrasante de Vía"
    for f in cartera.get("filas") or []:
        if f.get("vacio"):
            continue
        series["abscisas"].append(f.get("abscisa"))
        series["terreno_natural"].append(f.get("terreno_natural"))
        if tipo == "FILTRO":
            series["nivel_referencia"].append(f.get("terminado_filtro") or f.get("nivel_referencia"))
        else:
            cota_lomo = f.get("cota_lomo")
            sub = f.get("subrasante_via") or f.get("nivel_referencia")
            series["subrasante_via"].append(sub)
            series["cota_lomo"].append(cota_lomo)
            # Compat: nivel_referencia = Cota Lomo (serie principal del XLSM)
            series["nivel_referencia"].append(cota_lomo if cota_lomo is not None else sub)
        series["cota_fondo_excavacion"].append(f.get("cota_fondo_excavacion"))
    return series


def seccion_tipica_params(seccion: dict, cartera: dict) -> dict[str, Any]:
    tot = cartera.get("totales") or {}
    return {
        "tipo": seccion["tipo"],
        "diametro_externo_m": seccion["diametro_externo_m"],
        "ancho_excavacion_m": seccion["ancho_excavacion_m"],
        "altura_relleno_m": seccion["altura_relleno_m"],
        "cama_triturado_m": seccion.get("cama_triturado_m"),
        "area_tuberia_m2": seccion.get("area_tuberia_m2"),
        "area_1_m2": seccion["area_1_m2"],
        "area_2_m2": seccion["area_2_m2"],
        "prom_altura_excavacion": tot.get("prom_altura_excavacion"),
        "prom_altura_triturado": tot.get("prom_altura_triturado"),
        "prom_altura_relleno": tot.get("prom_altura_relleno"),
        "prom_ancho_geotextil": tot.get("prom_ancho_geotextil"),
        "relacion_atraque": seccion["relacion_atraque"],
        "titulo_panel": "GRAFICO",
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
    cantidades_manuales: Optional[list[dict]] = None,
    cama_triturado_m: float = 0.0,
) -> dict[str, Any]:
    seccion = calcular_seccion(
        tipo=tipo,
        diametro_m=diametro_m,
        espesor_m=espesor_m,
        ancho_excavacion_m=ancho_excavacion_m,
        relacion_atraque=relacion_atraque,
        cama_triturado_m=cama_triturado_m,
    )
    cartera = calcular_cartera(filas_campo, seccion)
    cant = calcular_cantidades_y_descuentos(
        seccion,
        cartera,
        descuentos_manuales=descuentos_manuales,
        cantidades_manuales=cantidades_manuales,
    )
    return {
        "seccion": seccion,
        "cartera": cartera,
        "cantidades": cant["cantidades"],
        "descuentos": cant["descuentos"],
        "netos": cant["netos"],
        "descuentos_altura": cant.get("descuentos_altura") or {},
        "perfil": perfil_longitudinal(cartera, seccion),
        "seccion_tipica": seccion_tipica_params(seccion, cartera),
    }


def construir_fila_consolidado(planilla: dict, calculo: dict) -> dict[str, Any]:
    """22 columnas del consolidado de tramo."""
    cab = planilla or {}
    sec = calculo.get("seccion") or {}
    tot = (calculo.get("cartera") or {}).get("totales") or {}
    netos = {n["codigo"]: n for n in (calculo.get("netos") or [])}
    vol_exc = (netos.get("EXC") or {}).get("neto") or 0.0
    vol_roc = (netos.get("EXC_ROC") or {}).get("neto") or 0.0
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
        "c13_vol_excavacion_m3": round(float(vol_exc) + float(vol_roc), 4),
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
        avisos.append({"prioridad": "error", "campo": "abscisa", "msg": "Abscisa requerida",
                       "detalle": "Toda fila con datos de cota debe tener abscisa.",
                       "abscisa": None, "diferencia": None})
    if tn is None:
        avisos.append({"prioridad": "error", "campo": "terreno_natural", "msg": "TN requerido",
                       "detalle": "Indique cota de terreno natural.",
                       "abscisa": abscisa, "diferencia": None})
    if cfe is None:
        avisos.append({"prioridad": "error", "campo": "cota_fondo_excavacion", "msg": "CFE requerida",
                       "detalle": "Indique cota fondo de excavación.",
                       "abscisa": abscisa, "diferencia": None})
    if nivel is None and tipo_u == "FILTRO":
        avisos.append({"prioridad": "info", "campo": "nivel_referencia", "msg": "Terminado Filtro vacío",
                       "detalle": "Sin Terminado Filtro no se calcula Altura Triturado (E−F).",
                       "abscisa": abscisa, "diferencia": None})
    if tn is not None and cfe is not None and cfe > tn:
        avisos.append({"prioridad": "error", "campo": "cota_fondo_excavacion", "msg": "CFE > TN",
                       "detalle": "La cota fondo no puede superar el terreno natural.",
                       "abscisa": abscisa, "diferencia": _r4(cfe - tn)})
    if tn is not None and nivel is not None and nivel > tn + 0.05:
        avisos.append({"prioridad": "info", "campo": "nivel_referencia", "msg": "Nivel sobre TN",
                       "detalle": "El nivel de referencia está >5 cm sobre el terreno natural.",
                       "abscisa": abscisa, "diferencia": _r4(nivel - tn)})
    if nivel is not None and cfe is not None and nivel < cfe:
        avisos.append({"prioridad": "error", "campo": "nivel_referencia", "msg": "Nivel < CFE",
                       "detalle": "El nivel de referencia debe quedar sobre el fondo de excavación.",
                       "abscisa": abscisa, "diferencia": _r4(cfe - nivel)})
    return avisos


def validar_cartera_campo(filas: list[dict], tipo: str) -> dict[str, Any]:
    errores: list[dict] = []
    infos: list[dict] = []
    for i, f in enumerate(filas or []):
        for a in validar_fila_campo(f, tipo):
            item = {**a, "orden": f.get("orden", i + 1), "fila_idx": i}
            (errores if a.get("prioridad") == "error" else infos).append(item)
    prev = None
    for i, f in enumerate(filas or []):
        ab = _f(f.get("abscisa"))
        tn = _f(f.get("terreno_natural"))
        cfe = _f(f.get("cota_fondo_excavacion"))
        if ab is None and tn is None and cfe is None:
            continue
        if ab is not None and prev is not None and ab < prev:
            errores.append({
                "prioridad": "error", "campo": "abscisa", "msg": "Abscisa no creciente",
                "detalle": f"La abscisa {ab} es menor que la anterior {prev}.",
                "orden": f.get("orden", i + 1), "fila_idx": i,
                "abscisa": ab, "diferencia": _r4(prev - ab) if prev is not None else None,
            })
        if ab is not None:
            prev = ab
    return {"ok": len(errores) == 0, "errores": errores, "infos": infos}


# --- Evidencias fotográficas por línea de cantidad / descuento ---------------

SCOPES_EVIDENCIA = ("cantidades", "descuentos")
MAX_FOTOS_POR_LINEA = 4
_EPS_CANTIDAD_FOTO = 1e-9


def _cantidad_no_cero(v: Any) -> bool:
    try:
        if v is None or v == "":
            return False
        return abs(float(v)) > _EPS_CANTIDAD_FOTO
    except (TypeError, ValueError):
        return False


def normalizar_evidencias_fotograficas(raw: Any) -> dict[str, dict[str, list[dict]]]:
    """Estructura estable: { cantidades: {codigo: [foto…]}, descuentos: {…} }."""
    out: dict[str, dict[str, list[dict]]] = {s: {} for s in SCOPES_EVIDENCIA}
    if not isinstance(raw, dict):
        return out
    for scope in SCOPES_EVIDENCIA:
        bucket = raw.get(scope)
        if not isinstance(bucket, dict):
            continue
        for codigo, fotos in bucket.items():
            cod = str(codigo or "").strip()
            if not cod or not isinstance(fotos, list):
                continue
            limpios: list[dict] = []
            for f in fotos:
                if not isinstance(f, dict):
                    continue
                if not (f.get("blob_path") or f.get("data_uri") or f.get("url")):
                    continue
                limpios.append(dict(f))
            if limpios:
                out[scope][cod] = limpios
    return out


def lineas_con_cantidad_calculada(calculo: Optional[dict]) -> list[dict[str, Any]]:
    """Líneas de Resumen/Descuentos con cantidad ≠ 0 que exigen foto."""
    if not isinstance(calculo, dict):
        return []
    lineas: list[dict[str, Any]] = []
    for n in calculo.get("netos") or []:
        if not isinstance(n, dict):
            continue
        codigo = str(n.get("codigo") or "").strip()
        if not codigo:
            continue
        cant = n.get("neto")
        if cant is None:
            cant = n.get("cantidad")
        if not _cantidad_no_cero(cant):
            continue
        lineas.append({
            "scope": "cantidades",
            "codigo": codigo,
            "nombre": n.get("nombre") or codigo,
            "cantidad": cant,
        })
    for d in calculo.get("descuentos") or []:
        if not isinstance(d, dict):
            continue
        if not d.get("nombre"):
            continue
        codigo = str(d.get("codigo") or "").strip()
        if not codigo:
            continue
        cant = d.get("cantidad")
        if not _cantidad_no_cero(cant):
            continue
        lineas.append({
            "scope": "descuentos",
            "codigo": codigo,
            "nombre": d.get("nombre") or codigo,
            "cantidad": cant,
        })
    return lineas


def validar_evidencias_fotograficas(
    calculo: Optional[dict],
    evidencias: Any,
) -> dict[str, Any]:
    """
    Restrictivo: toda línea con cantidad calculada ≠ 0 debe tener ≥1 foto.
    """
    ev = normalizar_evidencias_fotograficas(evidencias)
    faltantes: list[dict[str, Any]] = []
    for linea in lineas_con_cantidad_calculada(calculo):
        fotos = (ev.get(linea["scope"]) or {}).get(linea["codigo"]) or []
        if not fotos:
            faltantes.append(linea)
    return {
        "ok": len(faltantes) == 0,
        "faltantes": faltantes,
        "requeridas": lineas_con_cantidad_calculada(calculo),
    }


def mensaje_faltan_evidencias(faltantes: list[dict]) -> str:
    if not faltantes:
        return "Falta registro fotográfico en una o más líneas de cantidad."
    partes = []
    for f in faltantes:
        scope_lbl = "Resumen de Cantidades" if f.get("scope") == "cantidades" else "Descuentos Específicos"
        partes.append(f"{f.get('nombre') or f.get('codigo')} ({scope_lbl})")
    return (
        "No se puede guardar la cartera: falta registro fotográfico en: "
        + "; ".join(partes)
        + "."
    )


# --- Puente Planilla Tubería → SICOE Obra (so_reportes / so_registros) --------

_EPS_CANTIDAD_SICOE = 1e-9

# Catálogo de so_reportes.margen (constraint so_reportes_margen_check).
SO_MARGEN_CANONICOS = ("Izquierda", "Central", "Derecha", "Única")
_SO_MARGEN_ALIAS = {
    "derecho": "Derecha",
    "derecha": "Derecha",
    "der": "Derecha",
    "izquierdo": "Izquierda",
    "izquierda": "Izquierda",
    "izq": "Izquierda",
    "central": "Central",
    "centro": "Central",
    "unico": "Única",
    "unica": "Única",
    "única": "Única",
}


def _norm_margen_key(txt: Any) -> str:
    return (
        str(txt or "")
        .strip()
        .lower()
        .replace("ú", "u")
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
    )


def normalizar_margen_sicoe(valor: Any) -> Optional[str]:
    """
    Normaliza costado/calzada de planilla → margen de so_reportes.
    Evita 23514 so_reportes_margen_check (p. ej. 'Derecho' → 'Derecha').
    Valores desconocidos se envuelven como «Otro: …».
    """
    s = str(valor or "").strip()
    if not s:
        return None
    if s.lower().startswith("otro:"):
        resto = s.split(":", 1)[1].strip()
        return f"Otro: {resto}" if resto else None
    key = _norm_margen_key(s)
    if key in _SO_MARGEN_ALIAS:
        return _SO_MARGEN_ALIAS[key]
    for c in SO_MARGEN_CANONICOS:
        if _norm_margen_key(c) == key:
            return c
    return f"Otro: {s}"


def filtrar_capitulos_por_tipo_planilla(
    capitulos: list[Any], tipo_planilla: Any
) -> list[str]:
    """
    Filtra capítulos SICOE según tipo de planilla (ALCANTARILLA / FILTRO).
    Si no hay coincidencias, devuelve la lista original (no deja el dropdown vacío).
    """
    caps = [
        (x if isinstance(x, str) else str(x.get("capitulo") or x.get("nombre") or "")).strip()
        for x in (capitulos or [])
    ]
    caps = [c for c in caps if c]
    tipo = str(tipo_planilla or "").strip().upper()
    if tipo == "FILTRO":
        keys = ("filtro", "filtros")
    elif tipo == "ALCANTARILLA":
        keys = ("alcantarilla", "alcantarillado", "obras de arte")
    else:
        return caps
    matched = [c for c in caps if any(k in c.lower() for k in keys)]
    return matched if matched else caps


def _cantidad_sicoe_no_cero(v: Any) -> bool:
    try:
        if v is None or v == "":
            return False
        return abs(float(v)) > _EPS_CANTIDAD_SICOE
    except (TypeError, ValueError):
        return False


def abscisas_extremos_cartera(
    calculo: Optional[dict], filas_campo: Optional[list[dict]] = None
) -> tuple[Optional[float], Optional[float]]:
    """Mínimo / máximo de abscisa (totales del cálculo o filas crudas)."""
    tot = ((calculo or {}).get("cartera") or {}).get("totales") or {}
    a0 = _f(tot.get("abscisa_inicial"))
    a1 = _f(tot.get("abscisa_final"))
    if a0 is not None and a1 is not None:
        return a0, a1
    vals: list[float] = []
    for f in filas_campo or []:
        if not isinstance(f, dict):
            continue
        v = _f(f.get("abscisa"))
        if v is not None:
            vals.append(v)
    if not vals:
        return None, None
    return min(vals), max(vals)


def lineas_planilla_a_registros_sicoe(calculo: Optional[dict]) -> list[dict[str, Any]]:
    """
    Cada línea de Resumen de Cantidades y Descuentos Específicos con cantidad ≠ 0
    → payload de so_registros (sin ítem; texto Item → observacion/descripcion).
    """
    if not isinstance(calculo, dict):
        return []
    out: list[dict[str, Any]] = []

    def _push(
        nombre: Any, unidad: Any, long: Any, ancho: Any, espesor: Any, cant: Any,
        *, origen: str, codigo: str,
    ) -> None:
        if not _cantidad_sicoe_no_cero(cant):
            return
        txt = str(nombre or codigo or "").strip() or codigo
        c = float(cant)
        out.append({
            "nombre": txt,
            "descripcion": txt,
            "observacion": txt,
            "unidad": (str(unidad).strip() if unidad not in (None, "") else None),
            "longitud": _r4(long) if long is not None else None,
            "ancho": _r4(ancho) if ancho is not None else None,
            "espesor": _r4(espesor) if espesor is not None else None,
            "cantidad": _r2(c),
            "cantidad_total": _r2(c),
            "item_numero": None,
            "item_descripcion": None,
            "_origen_codigo": codigo,
            "_origen_tabla": origen,
        })

    for n in calculo.get("netos") or []:
        if not isinstance(n, dict):
            continue
        codigo = str(n.get("codigo") or "").strip()
        if not codigo:
            continue
        cant = n.get("neto")
        if cant is None:
            cant = n.get("cantidad")
        _push(
            n.get("nombre") or codigo, n.get("unidad"),
            n.get("long"), n.get("ancho"), n.get("espesor"), cant,
            origen="cantidades", codigo=codigo,
        )
    for d in calculo.get("descuentos") or []:
        if not isinstance(d, dict) or not d.get("nombre"):
            continue
        codigo = str(d.get("codigo") or "").strip()
        if not codigo:
            continue
        _push(
            d.get("nombre") or codigo, d.get("unidad") or "m³",
            d.get("long"), d.get("ancho"), d.get("espesor"), d.get("cantidad"),
            origen="descuentos", codigo=codigo,
        )
    return out


def patch_so_registro_desde_linea_planilla(linea: dict[str, Any]) -> dict[str, Any]:
    """Campos dimensionales a sincronizar en un so_registro existente."""
    return {
        "nombre": linea.get("nombre"),
        "descripcion": linea.get("descripcion"),
        "observacion": linea.get("observacion"),
        "unidad": linea.get("unidad"),
        "longitud": linea.get("longitud"),
        "ancho": linea.get("ancho"),
        "espesor": linea.get("espesor"),
        "cantidad": linea.get("cantidad"),
        "cantidad_total": linea.get("cantidad_total"),
    }


def mapa_lineas_sicoe_por_origen(calculo: Optional[dict]) -> dict[str, dict[str, Any]]:
    """clave «scope:codigo» → línea (incluye las que quedaron en 0 para poder bajar cantidad)."""
    out: dict[str, dict[str, Any]] = {}
    if not isinstance(calculo, dict):
        return out
    for n in calculo.get("netos") or []:
        if not isinstance(n, dict):
            continue
        codigo = str(n.get("codigo") or "").strip()
        if not codigo:
            continue
        cant = n.get("neto")
        if cant is None:
            cant = n.get("cantidad")
        try:
            c = float(cant) if cant is not None and cant != "" else 0.0
        except (TypeError, ValueError):
            c = 0.0
        key = f"cantidades:{codigo}"
        out[key] = {
            "nombre": n.get("nombre") or codigo,
            "descripcion": n.get("nombre") or codigo,
            "observacion": n.get("nombre") or codigo,
            "unidad": n.get("unidad"),
            "longitud": n.get("long"),
            "ancho": n.get("ancho"),
            "espesor": n.get("espesor"),
            "cantidad": round(c, 2),
            "cantidad_total": round(c, 2),
            "_origen_tabla": "cantidades",
            "_origen_codigo": codigo,
        }
    for d in calculo.get("descuentos") or []:
        if not isinstance(d, dict) or not d.get("nombre"):
            continue
        codigo = str(d.get("codigo") or "").strip()
        if not codigo:
            continue
        try:
            c = float(d.get("cantidad") or 0)
        except (TypeError, ValueError):
            c = 0.0
        key = f"descuentos:{codigo}"
        out[key] = {
            "nombre": d.get("nombre") or codigo,
            "descripcion": d.get("nombre") or codigo,
            "observacion": d.get("nombre") or codigo,
            "unidad": d.get("unidad") or "m³",
            "longitud": d.get("long"),
            "ancho": d.get("ancho"),
            "espesor": d.get("espesor"),
            "cantidad": round(c, 2),
            "cantidad_total": round(c, 2),
            "_origen_tabla": "descuentos",
            "_origen_codigo": codigo,
        }
    return out


# Aliases estables para rutas / tests
calcular_seccion_planilla = calcular_seccion
altura_relleno_m = altura_relleno_atraque_m
