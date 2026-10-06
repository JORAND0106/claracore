"""
Motor de cálculo — Planillas de Tubería (ALCANTARILLA / FILTRO).

Fórmulas alineadas al inventario literal de Planilla_Tuberia_original.xlsm
(docs/topografia/planillas_tuberia/). Frontend y exportaciones consumen
estos resultados; no recalculan.
"""
from __future__ import annotations

import html
import math
import re
from datetime import date, datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

TIPOS_PLANILLA = ("ALCANTARILLA", "FILTRO")
# Filas mínimas al crear planilla / plantilla PDF vacía (UI + export).
FILAS_INICIALES_CARTERA = 2
RELACIONES_ATRAQUE = ("1:1", "1:2", "1:3", "1:4", "1:6")

# Rótulos literales del XLSM (sharedStrings / planilla)
TITULO_ALCANTARILLA = "PLANILLA DE INSTALACIÓN DE TUBERÍA ALCANTARILLAS"
TITULO_FILTRO = "PLANILLA DE INSTALACIÓN DE FILTROS"
CODIGO_DOCUMENTO = "INF-ING - TOP - 001 - V0"

# Orden UI: fijos primero; Excavación Roca y Otros al final (editables).
# TRI: el `codigo` es estable (vínculo descuentos); el nombre visible depende del tipo.
NOMBRE_TRI_ALCANTARILLA = "Atraque mat. filtrante"
NOMBRE_TRI_FILTRO = "Mat. Granular Filtrante"

ITEMS_CANTIDADES = (
    {"codigo": "EXC", "nombre": "Excavación Varias", "unidad": "m³"},
    {"codigo": "TUB", "nombre": "Long Tubería", "unidad": "ml"},
    {"codigo": "TRI", "nombre": NOMBRE_TRI_ALCANTARILLA, "unidad": "m³"},
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


def nombre_triturado_por_tipo(tipo: Optional[str]) -> str:
    """Etiqueta visible del ítem TRI según tipo de planilla (codigo TRI sin cambio)."""
    tipo_u = str(tipo or "ALCANTARILLA").strip().upper()
    return NOMBRE_TRI_FILTRO if tipo_u == "FILTRO" else NOMBRE_TRI_ALCANTARILLA

# Códigos de Resumen de Cantidades con Long/Ancho/Espesor editables por el usuario.
# OTROS admite múltiples líneas: OTROS, OTROS_1, OTROS_2, …
CODIGOS_CANTIDADES_EDITABLES = frozenset({"EXC_ROC", "OTROS"})

# Líneas del Resumen de Cantidades de las que se puede descontar volumen (m³).
LINEAS_DESCUENTO_VOLUMEN = (
    ("EXC", "Excavación Varias"),
    ("TRI", "Atraque / Mat. filtrante"),
    ("REL", "Relleno Gran."),
)
LINEAS_DESCUENTO_VOLUMEN_SET = frozenset(c for c, _ in LINEAS_DESCUENTO_VOLUMEN)
LINEAS_DESCUENTO_VOLUMEN_LABEL = dict(LINEAS_DESCUENTO_VOLUMEN)
# Compat: valores legacy del descuento por altura promedio → línea de volumen.
LEGACY_DESCUENTO_ALTURA_A_LINEA = {
    "prom_altura_excavacion": "EXC",
    "prom_altura_triturado": "TRI",
    "prom_altura_relleno": "REL",
}


def resolver_linea_descuento_volumen(descontar_de: Any) -> Optional[str]:
    """Normaliza descontar_de a EXC|TRI|REL (acepta claves legacy de altura)."""
    raw = str(descontar_de or "").strip()
    if not raw:
        return None
    if raw in LEGACY_DESCUENTO_ALTURA_A_LINEA:
        return LEGACY_DESCUENTO_ALTURA_A_LINEA[raw]
    cod = raw.upper()
    return cod if cod in LINEAS_DESCUENTO_VOLUMEN_SET else None


def label_linea_descuento_volumen(codigo: Any, tipo: Optional[str] = None) -> str:
    cod = str(codigo or "").strip().upper()
    if cod == "TRI":
        return nombre_triturado_por_tipo(tipo)
    return LINEAS_DESCUENTO_VOLUMEN_LABEL.get(cod, cod or "—")


def es_codigo_otros(codigo: Any) -> bool:
    cod = str(codigo or "").strip().upper()
    return cod == "OTROS" or cod.startswith("OTROS_")


def es_codigo_desc_otros(codigo: Any) -> bool:
    """Descuentos Específicos: DESC_OTROS / DESC_OTROS_n (multi-línea)."""
    cod = str(codigo or "").strip().upper()
    return cod == "DESC_OTROS" or cod.startswith("DESC_OTROS_")


def es_codigo_cantidad_editable(codigo: Any) -> bool:
    cod = str(codigo or "").strip().upper()
    return cod == "EXC_ROC" or es_codigo_otros(cod)


def _nombre_actividad_descuento_volumen(codigo: Any, nombre: Any) -> str:
    """Texto de actividad para notas: sin prefijo «Otros:»."""
    cod = str(codigo or "").strip().upper()
    raw = str(nombre or "").strip()
    if es_codigo_otros(cod):
        if raw.lower().startswith("otros:"):
            raw = raw[6:].strip()
        elif raw.lower().startswith("otros"):
            raw = raw[5:].lstrip(":").strip()
        return raw or "Otros"
    if cod == "EXC_ROC":
        return raw or "Excavación Roca"
    return raw or cod or "—"


# Alias compat tests/imports antiguos.
_nombre_actividad_descuento_altura = _nombre_actividad_descuento_volumen


def formatear_nota_descuento_volumen(
    *,
    actividad: str,
    linea_label: str,
    volumen_original: float,
    volumen_descontado: float,
    volumen_final: float,
) -> str:
    """Nota breve: «Actividad: Vol Excavación Varias 100 − 12 = 88 m³»."""
    act = str(actividad or "").strip() or "—"
    lbl = str(linea_label or "").strip() or "Volumen"
    return (
        f"{act}: Vol {lbl} {_r2(volumen_original)} − {_r2(volumen_descontado)} "
        f"= {_r2(volumen_final)} m³"
    )


def formatear_nota_descuento_altura(
    *,
    actividad: str,
    campo_label: str,
    altura_original: float,
    valor_descontado: float,
    altura_final: float,
) -> str:
    """Compat: redirige al formato de volumen (misma firma antigua)."""
    return formatear_nota_descuento_volumen(
        actividad=actividad,
        linea_label=campo_label,
        volumen_original=altura_original,
        volumen_descontado=valor_descontado,
        volumen_final=altura_final,
    )


def _dims_volumen_override(
    ov: dict,
    *,
    default_long: float,
    default_ancho: float,
) -> tuple[Optional[float], Optional[float], Optional[float], float]:
    """Long/Ancho/Espesor del override y volumen ROUND(PRODUCT(dims,2),2)."""
    long_v = ov["long"] if "long" in ov and ov.get("long") is not None else default_long
    ancho_v = ov["ancho"] if "ancho" in ov and ov.get("ancho") is not None else default_ancho
    esp_v = ov.get("espesor")
    if esp_v is None:
        return None, None, None, 0.0
    try:
        esp_f = float(esp_v)
        long_f = float(long_v) if long_v is not None else None
        ancho_f = float(ancho_v) if ancho_v is not None else None
    except (TypeError, ValueError):
        return None, None, None, 0.0
    if abs(esp_f) <= 1e-12:
        return long_f, ancho_f, esp_f, 0.0
    vol = _r2(_product_resumen([long_f, ancho_f, esp_f])) or 0.0
    return long_f, ancho_f, esp_f, float(vol)


def _construir_descuentos_volumen_detalle(
    overrides_list: list[dict],
    *,
    default_long: float,
    default_ancho: float,
    volumenes_orig: dict[str, float],
    volumenes_final: dict[str, float],
    tipo: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Una fila por override EXC_ROC/OTROS con descontar_de → línea EXC|TRI|REL.
    Volumen descontado = Long×Ancho×Espesor propios de la línea (no el tramo completo).
    """
    out: list[dict[str, Any]] = []
    for ov in overrides_list:
        dest = resolver_linea_descuento_volumen(ov.get("descontar_de"))
        if not dest:
            continue
        long_f, ancho_f, esp_f, vol = _dims_volumen_override(
            ov, default_long=default_long, default_ancho=default_ancho,
        )
        if esp_f is None or abs(vol) <= 1e-12:
            continue
        codigo_origen = str(ov.get("codigo") or "").strip().upper()
        if not codigo_origen:
            continue
        actividad = _nombre_actividad_descuento_volumen(codigo_origen, ov.get("nombre"))
        label = label_linea_descuento_volumen(dest, tipo)
        v_orig = float(volumenes_orig.get(dest) or 0.0)
        v_fin = float(volumenes_final.get(dest) or 0.0)
        nota = formatear_nota_descuento_volumen(
            actividad=actividad,
            linea_label=label,
            volumen_original=v_orig,
            volumen_descontado=vol,
            volumen_final=v_fin,
        )
        out.append({
            "codigo": f"DESC_VOL_{codigo_origen}",
            "origen_codigo": codigo_origen,
            "nombre": f"Desc. volumen ({actividad})",
            "actividad": actividad,
            "item_cant_codigo": dest,
            "linea_label": label,
            "volumen_original": _r2(v_orig),
            "volumen_descontado": _r2(vol),
            "volumen_final": _r2(v_fin),
            # Compat claves antiguas leídas por Excel/UI.
            "campo": dest,
            "campo_label": label,
            "altura_original": _r2(v_orig),
            "valor_descontado": _r2(vol),
            "altura_final": _r2(v_fin),
            "long": _dim_resumen_2(long_f),
            "ancho": _dim_resumen_2(ancho_f),
            "espesor": _dim_resumen_2(esp_f),
            "cantidad": round(float(vol), 2),
            "unidad": "m³",
            "nota": nota,
        })
    return out


# Alias compat.
_construir_descuentos_altura_detalle = _construir_descuentos_volumen_detalle


# Descuentos específicos (I43:N50). Vinculados por codigo de ítem de cantidad.
# DESC_OTROS admite múltiples líneas: DESC_OTROS, DESC_OTROS_1, DESC_OTROS_2, …
ITEMS_DESCUENTOS_ALCANTARILLA = (
    {"codigo": "DESC_A1", "nombre": "Area 1", "unidad": "m³", "item_cant_codigo": "TRI"},
    {"codigo": "DESC_A2", "nombre": "Area 2", "unidad": "m³", "item_cant_codigo": "REL"},
    {
        "codigo": "DESC_OTROS",
        "nombre": "Otros: ____",
        "unidad": "m³",
        "item_cant_codigo": "EXC",
        "editable_dims": True,
        "editable_nombre": True,
    },
)

ITEMS_DESCUENTOS_FILTRO = (
    {"codigo": "DESC_TUB_FILT", "nombre": "Tubería Filtro", "unidad": "m³", "item_cant_codigo": "TRI"},
    {
        "codigo": "DESC_OTROS",
        "nombre": "Otros: ____",
        "unidad": "m³",
        "item_cant_codigo": "EXC",
        "editable_dims": True,
        "editable_nombre": True,
    },
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


# Decimales de Long/Ancho/Espesor/Desc. en Resumen y Descuentos (entrada del PRODUCT).
# Coherente con la presentación UI/PDF/Excel; distinto del payload SICOE (dims 3).
DECIMALES_RESUMEN_CANTIDADES = 2


def _dim_resumen_2(v: Optional[float]) -> Optional[float]:
    """Factor de dimensión para PRODUCT de Resumen/Descuentos (2 dec)."""
    if v is None:
        return None
    return round(float(v), DECIMALES_RESUMEN_CANTIDADES)


def _product_resumen(vals: list[Optional[float]]) -> Optional[float]:
    """PRODUCT redondeando cada factor a 2 dec (valor visto = valor usado)."""
    return _product([_dim_resumen_2(v) for v in vals])


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
    traslapo_m: float = 0.0,
) -> dict[str, Any]:
    tipo_u = (tipo or "ALCANTARILLA").upper()
    if tipo_u not in TIPOS_PLANILLA:
        raise ValueError(f"Tipo de planilla inválido: {tipo}")
    theta = float(diametro_m)
    esp = float(espesor_m)
    b = float(ancho_excavacion_m)
    cama = float(cama_triturado_m or 0.0)
    traslapo = float(traslapo_m or 0.0)
    if theta <= 0 or esp < 0 or b <= 0:
        raise ValueError("Diámetro > 0, espesor ≥ 0 y ancho excavación > 0.")
    if cama < 0:
        raise ValueError("Cama triturado ≥ 0.")
    if traslapo < 0:
        raise ValueError("Traslapo ≥ 0.")
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
        # Traslapo solo aplica a FILTRO (suma al ancho promedio de geotextil → GEO).
        "traslapo_m": round(traslapo, 6) if tipo_u == "FILTRO" else 0.0,
        "etiqueta_traslapo": "Traslapo" if tipo_u == "FILTRO" else "",
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


def _codigo_descuento_aceptado(tipo: str, codigo: str) -> bool:
    """Códigos fijos del catálogo + DESC_OTROS[_n] (multi-línea)."""
    cod = str(codigo or "").strip().upper()
    if not cod:
        return False
    if es_codigo_desc_otros(cod):
        return True
    return cod in codigos_descuento_validos(tipo)


def filtrar_descuentos_manuales_por_tipo(
    tipo: str, descuentos_manuales: Optional[list[dict]]
) -> list[dict]:
    """Conserva solo códigos válidos para el tipo (p.ej. DESC_OTROS[_n]); descarta residuos."""
    alias = (
        ITEMS_DESCUENTOS_FILTRO_LEGACY_ALIAS
        if (tipo or "").upper() == "FILTRO"
        else ITEMS_DESCUENTOS_ALCANTARILLA_LEGACY_ALIAS
    )
    out: list[dict] = []
    for d in descuentos_manuales or []:
        cod = str(d.get("codigo") or "")
        cod = alias.get(cod, cod)
        if _codigo_descuento_aceptado(tipo, cod):
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
    # Abscisa 0 es válida (PK inicial); solo se exige TN y CFE para H.Exc.
    if tn is not None and cfe is not None:
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


def _cantidad_desde_dims(
    long: Any, ancho: Any, espesor: Any, cantidad_fallback: Any = None
) -> float:
    """PRODUCT(L,A,E) con cada dim a 2 dec, luego ROUND 2; si no hay dims, fallback."""
    dims = []
    for v in (long, ancho, espesor):
        fv = _f(v)
        if fv is not None:
            dims.append(_dim_resumen_2(fv))
    if dims:
        prod = 1.0
        for x in dims:
            prod *= float(x)
        return float(_r2(prod) or 0.0)
    fb = _f(cantidad_fallback)
    return float(fb) if fb is not None else 0.0


def _label_desc_otros(nombre: Any) -> str:
    raw = str(nombre or "").strip()
    if not raw:
        return "Otros: ____"
    if raw.lower().startswith("otros"):
        return raw
    return f"Otros: {raw}"


def _normalize_descuentos_otros_manuales(
    descuentos_manuales: Optional[list[dict]],
) -> list[dict[str, Any]]:
    """
    Overrides DESC_OTROS[_n]: long/ancho/espesor/nombre/cantidad.
    Compat: DESC_OTROS → DESC_OTROS_1. Siempre ≥1 línea DESC_OTROS_1.
    """
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for d in descuentos_manuales or []:
        if not isinstance(d, dict):
            continue
        cod = str(d.get("codigo") or "").strip().upper()
        if not es_codigo_desc_otros(cod):
            continue
        if cod == "DESC_OTROS":
            cod = "DESC_OTROS_1"
        if cod in seen:
            continue
        seen.add(cod)
        entry: dict[str, Any] = {"codigo": cod}
        for key in ("long", "ancho", "espesor"):
            if key in d and d.get(key) is not None and d.get(key) != "":
                entry[key] = _f(d.get(key))
        if "nombre" in d:
            entry["nombre"] = str(d.get("nombre") or "").strip()
        elif d.get("nota") not in (None, ""):
            # Persistencia legacy: nota de la tabla descuentos = observación/nombre.
            entry["nombre"] = str(d.get("nota") or "").strip()
        cant = _cantidad_desde_dims(
            entry.get("long"), entry.get("ancho"), entry.get("espesor"), d.get("cantidad")
        )
        entry["cantidad"] = cant
        out.append(entry)
    if not any(es_codigo_desc_otros(x["codigo"]) for x in out):
        out.append({"codigo": "DESC_OTROS_1", "cantidad": 0.0})
    out.sort(key=lambda x: x["codigo"])
    return out


def _normalize_manual_descuentos(
    tipo: str, descuentos_manuales: Optional[list[dict]]
) -> dict[str, float]:
    """Mapa codigo→cantidad para descuentos fijos (no multi-Otros)."""
    alias = (
        ITEMS_DESCUENTOS_FILTRO_LEGACY_ALIAS
        if tipo == "FILTRO"
        else ITEMS_DESCUENTOS_ALCANTARILLA_LEGACY_ALIAS
    )
    out: dict[str, float] = {}
    for d in descuentos_manuales or []:
        cod = str(d.get("codigo") or "")
        cod = alias.get(cod, cod)
        if es_codigo_desc_otros(cod):
            continue  # se manejan en _normalize_descuentos_otros_manuales
        cant = _f(d.get("cantidad"))
        if cod and cant is not None:
            out[cod] = float(cant)
    return out


def _meta_item_descuento(codigo: str, tipo: str) -> dict[str, Any]:
    catalogo = ITEMS_DESCUENTOS_FILTRO if tipo == "FILTRO" else ITEMS_DESCUENTOS_ALCANTARILLA
    if es_codigo_desc_otros(codigo):
        base = next(it for it in catalogo if it["codigo"] == "DESC_OTROS")
        return {**base, "codigo": codigo}
    for it in catalogo:
        if it["codigo"] == codigo:
            return dict(it)
    return {"codigo": codigo, "nombre": codigo, "unidad": "m³", "item_cant_codigo": "EXC"}


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
        desc_de = resolver_linea_descuento_volumen(d.get("descontar_de"))
        if desc_de:
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


def _meta_item_cantidad(codigo: str, tipo: Optional[str] = None) -> dict[str, Any]:
    if codigo == "EXC_ROC":
        return dict(next(it for it in ITEMS_CANTIDADES if it["codigo"] == "EXC_ROC"))
    if es_codigo_otros(codigo):
        base = next(it for it in ITEMS_CANTIDADES if it["codigo"] == "OTROS")
        return {**base, "codigo": codigo}
    meta = dict(next(it for it in ITEMS_CANTIDADES if it["codigo"] == codigo))
    if codigo == "TRI":
        meta["nombre"] = nombre_triturado_por_tipo(tipo)
    return meta


def calcular_cantidades_y_descuentos(
    seccion: dict,
    cartera: dict,
    *,
    descuentos_manuales: Optional[list[dict]] = None,
    cantidades_manuales: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """
    Resumen de Cantidades + Descuentos Específicos.
    Cantidad = ROUND(PRODUCT(ROUND(Long,2),ROUND(Ancho,2),ROUND(Espesor,2)),2)
    − Desc (solo Triturado). Cada dimensión se redondea a 2 dec antes del producto
    para que el resultado coincida con los valores mostrados en UI/PDF/Excel.
    EXC_ROC y OTROS[_n] admiten Long/Ancho/Espesor (y nombre en OTROS) por override.
    descontar_de (EXC|TRI|REL) resta el volumen L×A×E de la línea editable
    del volumen de la línea de Resumen seleccionada.
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
    # FILTRO: Geotextil = L × (prom ancho geotextil + traslapo).
    # ALCANTARILLA: no se calcula → cantidad 0 (PRODUCT vacíos dejaría solo L).
    ancho_geo_prom = float(tot.get("prom_ancho_geotextil") or 0.0)
    traslapo = float(seccion.get("traslapo_m") or 0.0) if tipo == "FILTRO" else 0.0
    ancho_geo = (ancho_geo_prom + traslapo) if tipo == "FILTRO" else None

    overrides_list = _normalize_cantidades_manuales(cantidades_manuales)
    # Descuentos de volumen cruzados: EXC_ROC/Otros → línea EXC|TRI|REL (sin tocar alturas).
    restas_vol = {k: 0.0 for k in LINEAS_DESCUENTO_VOLUMEN_SET}
    for ov in overrides_list:
        dest = resolver_linea_descuento_volumen(ov.get("descontar_de"))
        if not dest:
            continue
        _l, _a, _e, vol = _dims_volumen_override(ov, default_long=L, default_ancho=B)
        if abs(vol) > 1e-12:
            restas_vol[dest] += float(vol)

    # Descuentos dimensionales automáticos (dims a 2 dec antes del PRODUCT)
    if tipo == "ALCANTARILLA":
        desc_a1 = _r2(_product_resumen([L, a1])) or 0.0
        desc_a2 = _r2(_product_resumen([L, a2])) or 0.0
        desc_tub_filt = 0.0
        desc_tri = desc_a1
        desc_rel = desc_a2
    else:
        desc_a1 = 0.0
        desc_a2 = 0.0
        desc_tub_filt = _r2(_product_resumen([L, a_tub])) or 0.0
        desc_tri = desc_tub_filt
        desc_rel = 0.0

    manual = _normalize_manual_descuentos(tipo, descuentos_manuales)
    otros_desc = _normalize_descuentos_otros_manuales(descuentos_manuales)
    desc_otros = round(sum(float(o.get("cantidad") or 0.0) for o in otros_desc), 2)

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
        meta = _meta_item_cantidad(codigo, tipo)
        long2, ancho2, esp2 = _dim_resumen_2(long), _dim_resumen_2(ancho), _dim_resumen_2(espesor)
        prod = _product([long2, ancho2, esp2])
        bruto = _r2(prod) if prod is not None else 0.0
        if bruto is None:
            bruto = 0.0
        cant = round(bruto - desc, 2) if restar_desc else bruto
        row = {
            **meta,
            "long": long2,
            "ancho": ancho2,
            "espesor": esp2,
            "desc": round(desc, 2),
            "cantidad": round(cant, 2),
            "bruto": round(bruto, 2),
            "formula": f"ROUND(PRODUCT({long2},{ancho2},{esp2}),2)"
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

    # GEO solo en FILTRO; en ALC dims vacías → cantidad 0 (no PRODUCT(L, vacío)).
    if tipo == "FILTRO":
        geo_row = _row("GEO", L, ancho_geo if ancho_geo else None, None)
    else:
        geo_row = _row("GEO", None, None, None)

    cantidades = [
        _row("EXC", L, B, h_exc),
        _row("TUB", L, None, None),
        _row("TRI", L, B, h_trit, desc=desc_tri, restar_desc=True),
        _row("REL", L, B, h_rel, desc=desc_rel, restar_desc=False),
        geo_row,
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
        if es_codigo_desc_otros(cod):
            continue  # se agregan abajo como multi-línea
        if cod == "DESC_A1":
            cant, long, ancho, esp = desc_a1, L, None, a1
        elif cod == "DESC_A2":
            cant, long, ancho, esp = desc_a2, L, None, a2
        elif cod == "DESC_TUB_FILT":
            cant, long, ancho, esp = desc_tub_filt, L, None, a_tub
        else:
            cant, long, ancho, esp = float(manual.get(cod) or 0.0), None, None, None
        descuentos.append({
            **it,
            "long": _dim_resumen_2(long),
            "ancho": _dim_resumen_2(ancho),
            "espesor": _dim_resumen_2(esp),
            "cantidad": round(float(cant), 2),
        })

    for ov in otros_desc:
        meta = _meta_item_descuento(ov["codigo"], tipo)
        descuentos.append({
            **meta,
            "nombre": _label_desc_otros(ov.get("nombre")),
            "long": _dim_resumen_2(ov.get("long")),
            "ancho": _dim_resumen_2(ov.get("ancho")),
            "espesor": _dim_resumen_2(ov.get("espesor")),
            "cantidad": round(float(ov.get("cantidad") or 0.0), 2),
            "editable_dims": True,
            "editable_nombre": True,
        })

    # Volúmenes brutos de líneas destino (antes de descuentos de volumen Roca/Otros).
    vol_bruto_linea = {
        "EXC": _r2(_product_resumen([L, B, h_exc])) or 0.0,
        "TRI": _r2(_product_resumen([L, B, h_trit])) or 0.0,
        "REL": _r2(_product_resumen([L, B, h_rel])) or 0.0,
    }
    vol_final_linea = {
        k: max(0.0, round(float(vol_bruto_linea[k]) - float(restas_vol.get(k) or 0.0), 2))
        for k in LINEAS_DESCUENTO_VOLUMEN_SET
    }
    descuentos_volumen_detalle = _construir_descuentos_volumen_detalle(
        overrides_list,
        default_long=L,
        default_ancho=B,
        volumenes_orig=vol_bruto_linea,
        volumenes_final=vol_final_linea,
        tipo=tipo,
    )
    notas_descuento_volumen = [
        d["nota"] for d in descuentos_volumen_detalle if d.get("nota")
    ]

    netos = []
    for c in cantidades:
        codigo = c["codigo"]
        vol_extra = float(restas_vol.get(codigo) or 0.0)
        if codigo == "TRI":
            descuento = round(float(c["desc"]) + vol_extra, 2)
            bruto = c["bruto"]
            neto = round(float(bruto) - descuento, 2)
        elif codigo == "REL":
            # Area 2 se reporta en Descuentos Específicos; el volumen Roca/Otros sí baja el neto.
            descuento = round(float(c["desc"]) + vol_extra, 2)
            bruto = c["cantidad"]
            neto = round(float(bruto) - vol_extra, 2)
        elif codigo == "EXC":
            descuento = round(float(desc_otros) + vol_extra, 2)
            bruto = c["cantidad"]
            neto = round(float(bruto) - descuento, 2)
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
        "descuentos_volumen": {
            k: round(v, 2) for k, v in restas_vol.items() if v
        },
        "descuentos_volumen_detalle": descuentos_volumen_detalle,
        "notas_descuento_volumen": notas_descuento_volumen,
        # Alias compat (Excel/UI/tests antiguos).
        "descuentos_altura": {
            k: round(v, 2) for k, v in restas_vol.items() if v
        },
        "descuentos_altura_detalle": descuentos_volumen_detalle,
        "notas_descuento_altura": notas_descuento_volumen,
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
        "traslapo_m": seccion.get("traslapo_m"),
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
    traslapo_m: float = 0.0,
) -> dict[str, Any]:
    seccion = calcular_seccion(
        tipo=tipo,
        diametro_m=diametro_m,
        espesor_m=espesor_m,
        ancho_excavacion_m=ancho_excavacion_m,
        relacion_atraque=relacion_atraque,
        cama_triturado_m=cama_triturado_m,
        traslapo_m=traslapo_m,
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
        "descuentos_volumen": cant.get("descuentos_volumen") or {},
        "descuentos_volumen_detalle": cant.get("descuentos_volumen_detalle") or [],
        "notas_descuento_volumen": cant.get("notas_descuento_volumen") or [],
        "descuentos_altura": cant.get("descuentos_altura") or cant.get("descuentos_volumen") or {},
        "descuentos_altura_detalle": cant.get("descuentos_altura_detalle") or cant.get("descuentos_volumen_detalle") or [],
        "notas_descuento_altura": cant.get("notas_descuento_altura") or cant.get("notas_descuento_volumen") or [],
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
    """Misma semántica que Excel (`_excel_cantidad_no_cero`): |cant| > eps."""
    try:
        if v is None or v == "":
            return False
        return abs(float(v)) > _EPS_CANTIDAD_SICOE
    except (TypeError, ValueError):
        return False


def formatear_observacion_registro_sicoe(
    nombre_item: Any,
    tipo_red: Any,
    tramo: Any,
) -> str:
    """
    Observación SICOE (Resumen): «{Ítem} para {ALCANTARILLA|FILTRO} para {Tramo}».
    """
    nombre = str(nombre_item or "").strip() or "Ítem"
    tipo = str(tipo_red or "").strip().upper() or "—"
    tramo_txt = str(tramo or "").strip() or "—"
    return f"{nombre} para {tipo} para {tramo_txt}"


def formatear_observacion_descuento_sicoe(
    codigo: Any,
    nombre: Any,
    tipo_red: Any,
    tramo: Any,
) -> str:
    """
    Observación de registro negativo de Descuentos Específicos:
    indica que es descuento y cómo se obtuvo el área (Area 1 / Area 2 / Tubería Filtro).
    """
    cod = str(codigo or "").strip().upper()
    nombre_txt = str(nombre or cod or "Descuento").strip()
    explicaciones = {
        "DESC_A1": (
            "Descuento Area 1 (área descontada = Longitud × Area 1 m²; "
            "resta volumen de Triturado/Atraque)"
        ),
        "DESC_A2": (
            "Descuento Area 2 (área descontada = Longitud × Area 2 m²; "
            "resta volumen de Relleno)"
        ),
        "DESC_TUB_FILT": (
            "Descuento Tubería Filtro (área descontada = Longitud × área de tubería m²; "
            "resta volumen de material filtrante)"
        ),
        "DESC_OTROS": "Descuento Otros (resta volumen de Excavación)",
    }
    if cod.startswith("DESC_VOL_") or cod.startswith("DESC_ALT_"):
        base = f"Descuento volumen ({nombre_txt})"
    elif es_codigo_desc_otros(cod):
        base = explicaciones["DESC_OTROS"]
        if nombre_txt and nombre_txt.lower() not in ("otros", "otros: ____", "descuento otros"):
            base = f"{base} — {nombre_txt}"
    else:
        base = explicaciones.get(cod) or f"Descuento {nombre_txt}"
    tipo = str(tipo_red or "").strip().upper() or "—"
    tramo_txt = str(tramo or "").strip() or "—"
    return f"{base} para {tipo} para {tramo_txt}"


def formatear_observacion_descuento_volumen_sicoe(
    detalle: dict,
    tipo_red: Any,
    tramo: Any,
) -> str:
    """Obs. negativa de descuento de volumen (EXC_ROC / Otros → línea Resumen)."""
    nota = str((detalle or {}).get("nota") or "").strip()
    actividad = str((detalle or {}).get("actividad") or "").strip() or "—"
    base = nota or f"Descuento volumen ({actividad})"
    if not base.lower().startswith("descuento"):
        base = f"Descuento volumen — {base}"
    tipo = str(tipo_red or "").strip().upper() or "—"
    tramo_txt = str(tramo or "").strip() or "—"
    return f"{base} para {tipo} para {tramo_txt}"


# Alias compat.
formatear_observacion_descuento_altura_sicoe = formatear_observacion_descuento_volumen_sicoe


def _dim_sicoe_3(v: Any) -> Optional[float]:
    """Longitud / Ancho / Espesor → 3 decimales (None si vacío)."""
    if v is None or v == "":
        return None
    try:
        return _r3(float(v))
    except (TypeError, ValueError):
        return None


def _cantidad_total_desde_resumen(v: Any) -> Optional[float]:
    """Cantidad del Resumen de Cantidades → 2 decimales (sin recalcular L×A×E)."""
    if v is None or v == "":
        return None
    try:
        return _r2(float(v))
    except (TypeError, ValueError):
        return None


def redondear_costo_directo_sicoe(v: Any) -> Optional[float]:
    """Costo directo → 0 decimales."""
    if v is None or v == "":
        return None
    try:
        return float(round(float(v), 0))
    except (TypeError, ValueError):
        return None


def dims_y_cantidad_registro_sicoe(
    long: Any,
    ancho: Any,
    espesor: Any,
    cantidad_resumen: Any,
) -> dict[str, Any]:
    """
    Payload dimensional para so_registros desde planilla:
      - solo Longitud / Ancho / Espesor (3 dec);
      - cantidad_total = valor del resumen (2 dec), sin PRODUCT independiente;
      - el factor `cantidad` queda vacío (no es una 4ª dimensión).
    """
    return {
        "longitud": _dim_sicoe_3(long),
        "ancho": _dim_sicoe_3(ancho),
        "espesor": _dim_sicoe_3(espesor),
        "cantidad": None,
        "cantidad_total": _cantidad_total_desde_resumen(cantidad_resumen),
    }


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


def lineas_planilla_a_registros_sicoe(
    calculo: Optional[dict],
    *,
    tipo: Optional[str] = None,
    tramo: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Resumen de Cantidades (positivo = bruto) + Descuentos Específicos
    y descuentos de volumen (registro independiente en negativo) con cantidad ≠ 0 → so_registros.
    Criterio de cero: mismo eps que la exportación Excel.

    Descuento de volumen (EXC_ROC/Otros → línea EXC|TRI|REL): el bruto del ítem afectado
    permanece completo y se emite un registro negativo aparte, igual que Area 1 / Area 2 /
    Tubería Filtro.
    """
    if not isinstance(calculo, dict):
        return []
    out: list[dict[str, Any]] = []
    detalle_vol = [
        d for d in (
            calculo.get("descuentos_volumen_detalle")
            or calculo.get("descuentos_altura_detalle")
            or []
        )
        if isinstance(d, dict)
    ]

    def _push(
        nombre: Any, unidad: Any, long: Any, ancho: Any, espesor: Any, cant: Any,
        *, origen: str, codigo: str, observacion: str,
        item_cant_codigo: Optional[str] = None,
    ) -> None:
        if not _cantidad_sicoe_no_cero(cant):
            return
        txt = str(nombre or codigo or "").strip() or codigo
        dims = dims_y_cantidad_registro_sicoe(long, ancho, espesor, cant)
        padre = str(item_cant_codigo or codigo or "").strip().upper() or None
        out.append({
            "nombre": txt,
            "descripcion": txt,
            "observacion": observacion,
            "unidad": (str(unidad).strip() if unidad not in (None, "") else None),
            **dims,
            "item_numero": None,
            "item_descripcion": None,
            "_origen_codigo": codigo,
            "_origen_tabla": origen,
            # Línea de Resumen de la que hereda el ítem de cobro (descuento → padre).
            "_item_cant_codigo": padre,
        })

    # Positivos: bruto del resumen (descuentos de volumen/área van aparte en negativo).
    for n in calculo.get("netos") or []:
        if not isinstance(n, dict):
            continue
        codigo = str(n.get("codigo") or "").strip()
        if not codigo:
            continue
        cant = n.get("bruto")
        if cant is None:
            cant = n.get("neto")
        if cant is None:
            cant = n.get("cantidad")
        try:
            cant_f = float(cant) if cant is not None else 0.0
        except (TypeError, ValueError):
            continue
        nombre = n.get("nombre") or codigo
        _push(
            nombre, n.get("unidad"),
            n.get("long"), n.get("ancho"), n.get("espesor"), cant_f,
            origen="cantidades", codigo=codigo,
            observacion=formatear_observacion_registro_sicoe(nombre, tipo, tramo),
            item_cant_codigo=codigo,
        )

    # Negativos: Descuentos Específicos ≠ 0
    for d in calculo.get("descuentos") or []:
        if not isinstance(d, dict) or not d.get("nombre"):
            continue
        codigo = str(d.get("codigo") or "").strip()
        if not codigo:
            continue
        try:
            cant_abs = float(d.get("cantidad") or 0)
        except (TypeError, ValueError):
            continue
        if not _cantidad_sicoe_no_cero(cant_abs):
            continue
        cant_neg = -abs(cant_abs)
        nombre = d.get("nombre") or codigo
        padre_desc = d.get("item_cant_codigo")
        if not padre_desc:
            padre_desc = (_meta_item_descuento(codigo, str(tipo or "")) or {}).get("item_cant_codigo")
        _push(
            nombre, d.get("unidad") or "m³",
            d.get("long"), d.get("ancho"), d.get("espesor"), cant_neg,
            origen="descuentos", codigo=codigo,
            observacion=formatear_observacion_descuento_sicoe(codigo, nombre, tipo, tramo),
            item_cant_codigo=padre_desc,
        )

    # Negativos: descuentos de volumen (EXC_ROC / Otros → línea Resumen)
    for d in detalle_vol:
        codigo = str(d.get("codigo") or "").strip()
        if not codigo:
            continue
        try:
            cant_abs = float(d.get("cantidad") or 0)
        except (TypeError, ValueError):
            continue
        if not _cantidad_sicoe_no_cero(cant_abs):
            continue
        cant_neg = -abs(cant_abs)
        nombre = d.get("nombre") or codigo
        _push(
            nombre, d.get("unidad") or "m³",
            d.get("long"), d.get("ancho"), d.get("espesor"), cant_neg,
            origen="descuentos", codigo=codigo,
            observacion=formatear_observacion_descuento_volumen_sicoe(d, tipo, tramo),
            item_cant_codigo=d.get("item_cant_codigo") or d.get("campo"),
        )
    return out


def patch_so_registro_desde_linea_planilla(linea: dict[str, Any]) -> dict[str, Any]:
    """Campos dimensionales a sincronizar en un so_registro existente."""
    patch = {
        "nombre": linea.get("nombre"),
        "descripcion": linea.get("descripcion"),
        "observacion": linea.get("observacion"),
        "unidad": linea.get("unidad"),
        "longitud": linea.get("longitud"),
        "ancho": linea.get("ancho"),
        "espesor": linea.get("espesor"),
        "cantidad": None,
        "cantidad_total": linea.get("cantidad_total"),
    }
    if "costo_directo" in linea:
        patch["costo_directo"] = redondear_costo_directo_sicoe(linea.get("costo_directo"))
    return patch


def mapa_lineas_sicoe_por_origen(
    calculo: Optional[dict],
    *,
    tipo: Optional[str] = None,
    tramo: Optional[str] = None,
) -> dict[str, dict[str, Any]]:
    """clave «scope:codigo» → línea (incluye las que quedaron en 0 para poder bajar cantidad)."""
    out: dict[str, dict[str, Any]] = {}
    if not isinstance(calculo, dict):
        return out
    # Reutilizar el mismo mapeo que la creación (bruto + neg. altura / específicos).
    for line in lineas_planilla_a_registros_sicoe(calculo, tipo=tipo, tramo=tramo):
        key = origen_key_linea_sicoe(line)
        if not key:
            continue
        out[key] = {
            "nombre": line.get("nombre"),
            "descripcion": line.get("descripcion"),
            "observacion": line.get("observacion"),
            "unidad": line.get("unidad"),
            "longitud": line.get("longitud"),
            "ancho": line.get("ancho"),
            "espesor": line.get("espesor"),
            "cantidad": None,
            "cantidad_total": line.get("cantidad_total"),
            "_origen_tabla": line.get("_origen_tabla"),
            "_origen_codigo": line.get("_origen_codigo"),
            "_item_cant_codigo": line.get("_item_cant_codigo"),
        }
    # Incluir ceros del catálogo de descuentos específicos (para poder bajar a 0 en sync).
    for d in calculo.get("descuentos") or []:
        if not isinstance(d, dict) or not d.get("nombre"):
            continue
        codigo = str(d.get("codigo") or "").strip()
        if not codigo:
            continue
        key = f"descuentos:{codigo}"
        if key in out:
            continue
        try:
            cant_abs = float(d.get("cantidad") or 0)
        except (TypeError, ValueError):
            cant_abs = 0.0
        cant_signed = -abs(cant_abs) if cant_abs else 0.0
        nombre = d.get("nombre") or codigo
        dims = dims_y_cantidad_registro_sicoe(
            d.get("long"), d.get("ancho"), d.get("espesor"), cant_signed,
        )
        out[key] = {
            "nombre": nombre,
            "descripcion": nombre,
            "observacion": formatear_observacion_descuento_sicoe(codigo, nombre, tipo, tramo),
            "unidad": d.get("unidad") or "m³",
            **dims,
            "_origen_tabla": "descuentos",
            "_origen_codigo": codigo,
        }
    return out


def _float_or_none(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n != n:  # NaN
        return None
    return n


def puntos_topograficos_desde_planilla(planilla: Optional[dict]) -> list[dict[str, Any]]:
    """
    Pares Norte/Este Inicio y Fin → filas para so_puntos_topograficos.
    Fuente: columnas norte_ref/este_ref + meta_cabecera Abs Inicial/Final.
    """
    if not isinstance(planilla, dict):
        return []
    meta = planilla.get("meta_cabecera") if isinstance(planilla.get("meta_cabecera"), dict) else {}

    def _lookup(keys: tuple) -> Optional[float]:
        for k in keys:
            if k in planilla and planilla.get(k) is not None and planilla.get(k) != "":
                v = _float_or_none(planilla.get(k))
                if v is not None:
                    return v
            if k in meta and meta.get(k) is not None and meta.get(k) != "":
                v = _float_or_none(meta.get(k))
                if v is not None:
                    return v
        return None

    def _par(norte_keys: tuple, este_keys: tuple, punto: str, desc: str) -> Optional[dict]:
        norte = _lookup(norte_keys)
        este = _lookup(este_keys)
        if norte is None and este is None:
            return None
        return {
            "punto": punto,
            "norte": norte,
            "este": este,
            "cota": None,
            "descripcion": desc,
        }

    out: list[dict[str, Any]] = []
    ini = _par(
        ("norte_ref", "norte_abs_inicial"),
        ("este_ref", "este_abs_inicial"),
        "Inicio",
        "Inicio tramo — planilla de tubería",
    )
    if ini:
        out.append(ini)
    fin = _par(
        ("norte_abs_final",),
        ("este_abs_final",),
        "Fin",
        "Fin tramo — planilla de tubería",
    )
    if fin:
        out.append(fin)
    return out


def origen_key_linea_sicoe(linea: dict) -> str:
    """Clave estable cantidades:CODIGO / descuentos:CODIGO (código en mayúsculas)."""
    tabla = str(linea.get("_origen_tabla") or "").strip().lower() or "cantidades"
    codigo = str(linea.get("_origen_codigo") or "").strip().upper()
    return f"{tabla}:{codigo}"


def normalizar_origen_key_sicoe(raw: Any) -> str:
    """Normaliza «scope:codigo» (case-insensitive) a forma canónica."""
    txt = str(raw or "").strip()
    if not txt:
        return ""
    if ":" in txt:
        tabla, _, codigo = txt.partition(":")
        tabla = tabla.strip().lower() or "cantidades"
        codigo = codigo.strip().upper()
        return f"{tabla}:{codigo}" if codigo else ""
    # Solo código → cantidades:CODIGO
    return f"cantidades:{txt.upper()}"


def resolver_lineas_por_origenes_seleccionados(
    lineas: list[dict[str, Any]],
    origenes_seleccionados: Optional[list[Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Filtra líneas de planilla según orígenes marcados en el UI.
    Retorna (lineas_a_crear, origenes_no_encontrados).
    Matching case-insensitive; preserva orden de selección.
    """
    sel_raw = [normalizar_origen_key_sicoe(x) for x in (origenes_seleccionados or [])]
    sel_ordered = [k for k in sel_raw if k]
    if not sel_ordered:
        return [], []
    by_key: dict[str, dict[str, Any]] = {}
    for ln in lineas or []:
        if not isinstance(ln, dict):
            continue
        key = normalizar_origen_key_sicoe(origen_key_linea_sicoe(ln))
        if key and key not in by_key:
            by_key[key] = ln
    found: list[dict[str, Any]] = []
    missing: list[str] = []
    seen: set[str] = set()
    for key in sel_ordered:
        if key in seen:
            continue
        seen.add(key)
        ln = by_key.get(key)
        if ln:
            found.append(ln)
        else:
            missing.append(key)
    return found, missing


# Aliases estables para rutas / tests
calcular_seccion_planilla = calcular_seccion
altura_relleno_m = altura_relleno_atraque_m

_TZ_BOGOTA = ZoneInfo("America/Bogota")
_TZ_UTC = timezone.utc
_ESTADO_FIRMA_APROBADO = "Aprobado"
_RE_TOKEN_ARCHIVO = re.compile(r"[^0-9A-Za-z._-]+")
_RE_ZONA_FINAL = re.compile(
    r"\s+(?:UTC|GMT|COT|EST|EDT|America/Bogota)$",
    re.IGNORECASE,
)
_RE_PARECE_FECHA = re.compile(r"\d{4}|\d{1,2}[/.-]\d{1,2}")
# Mismo instante de sello N2 si `nivel2_fecha` no vino en la fila.
_FECHAS_SELLO_NIVEL2 = ("validado_at", "comentario_interventoria_at")


def _limpiar_marca_temporal(raw: str) -> str:
    """Deja un ISO que `fromisoformat` pueda leer (offset corto, Z, zona escrita)."""
    s = str(raw or "").strip().replace("\u00a0", " ")
    if not s:
        return ""
    s = re.sub(r"\[[^\]]*\]\s*$", "", s).strip()
    s = _RE_ZONA_FINAL.sub("", s).strip()
    s = re.sub(r"([+-]\d{2}:?\d{2}(?::\d{2})?)[Zz]$", r"\1", s)
    if s.endswith("Z") or s.endswith("z"):
        s = s[:-1] + "+00:00"
    if re.match(r"\d{4}-\d{2}-\d{2} ", s) and "T" not in s.upper():
        s = s.replace(" ", "T", 1)
    return s


def _a_colombia_sin_segundos(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_TZ_UTC)
    return dt.astimezone(_TZ_BOGOTA).strftime("%d/%m/%Y %H:%M")


def fecha_hora_colombia_sin_segundos(raw: Any) -> str:
    """dd/mm/aaaa HH:MM en America/Bogota. Sin segundos ni fracciones.

    Las marcas de validación se guardan en UTC. Un valor sin zona se trata como UTC.
    """
    if raw is None or isinstance(raw, bool):
        return ""
    try:
        if isinstance(raw, datetime):
            return _a_colombia_sin_segundos(raw)
        if isinstance(raw, date):
            return _a_colombia_sin_segundos(datetime(raw.year, raw.month, raw.day, tzinfo=_TZ_UTC))
        if isinstance(raw, (int, float)):
            n = float(raw)
            if n > 10_000_000_000:
                n /= 1000.0
            return _a_colombia_sin_segundos(datetime.fromtimestamp(n, tz=_TZ_UTC))
        s = _limpiar_marca_temporal(str(raw))
        if not s:
            return ""
        return _a_colombia_sin_segundos(datetime.fromisoformat(s))
    except (TypeError, ValueError, OSError, OverflowError):
        s = _limpiar_marca_temporal(str(raw))
        if not s or not _RE_PARECE_FECHA.search(s):
            return ""
        try:
            from dateutil import parser as date_parser

            return _a_colombia_sin_segundos(date_parser.parse(s))
        except (TypeError, ValueError, OverflowError, OSError):
            return ""


def texto_pie_firma_validacion(estado: Any, nombre: Any, fecha: Any) -> str:
    """Nombre y marca de un nivel Aprobado. Vacío si el nivel no está aprobado."""
    if str(estado or "").strip() != _ESTADO_FIRMA_APROBADO:
        return ""
    nom = " ".join(str(nombre or "").split())
    marca = fecha_hora_colombia_sin_segundos(fecha)
    if nom and marca:
        return f"{nom} · {marca}"
    return nom or marca


def _marca_aprobacion_nivel(planilla: dict, nivel: int) -> str:
    """Hora de la aprobación, del mismo registro que `nivel{n}_usuario_id`.

    La fuente es `nivel{n}_fecha` (se escribe en el mismo update que el usuario).
    En interventoría, si esa columna no trae una hora legible, se usa el sello
    de la misma aprobación (`validado_at` o el comentario de interventoría).
    """
    candidatos = [planilla.get(f"nivel{nivel}_fecha")]
    if nivel == 2:
        candidatos.extend(planilla.get(k) for k in _FECHAS_SELLO_NIVEL2)
    for raw in candidatos:
        marca = fecha_hora_colombia_sin_segundos(raw)
        if marca:
            return marca
    return ""


def _nombre_validador(nombres_por_id: dict, usuario_id: Any) -> str:
    if usuario_id is None or str(usuario_id).strip() == "":
        return ""
    try:
        uid = int(usuario_id)
    except (TypeError, ValueError):
        return ""
    raw = nombres_por_id.get(uid)
    if raw is None:
        raw = nombres_por_id.get(str(uid))
    return " ".join(str(raw or "").split())


def textos_pie_firmas_validacion(
    planilla: Optional[dict],
    nombres_por_id: Optional[dict] = None,
) -> tuple[str, str]:
    """(Elaboró = contratista N1, Aprobó = interventoría N2)."""
    p = planilla if isinstance(planilla, dict) else {}
    nombres = nombres_por_id if isinstance(nombres_por_id, dict) else {}
    def _linea(nivel: int) -> str:
        if str(p.get(f"nivel{nivel}_estado") or "").strip() != _ESTADO_FIRMA_APROBADO:
            return ""
        nom = _nombre_validador(nombres, p.get(f"nivel{nivel}_usuario_id"))
        # `nivel{n}_fecha` vive en el mismo registro que `nivel{n}_usuario_id`.
        marca = _marca_aprobacion_nivel(p, nivel)
        if nom and marca:
            return f"{nom} · {marca}"
        return nom or marca

    return _linea(1), _linea(2)


def aplicar_firmas_validacion_export(
    planilla: Optional[dict],
    nombres_por_id: Optional[dict] = None,
) -> dict:
    """Copia de la planilla cuyo pie Elaboró/Aprobó es solo la validación aprobada.

    No persiste. Un nivel que no está Aprobado deja el nombre en blanco,
    aunque la planilla tenga un nombre configurado en `firmas`.
    """
    base = dict(planilla or {})
    elaboro, aprobo = textos_pie_firmas_validacion(base, nombres_por_id)
    firmas = dict(base.get("firmas") or {}) if isinstance(base.get("firmas"), dict) else {}
    firmas["elaboro_nombre"] = elaboro
    firmas["elaboro"] = elaboro
    firmas["aprobo_nombre"] = aprobo
    firmas["aprobo"] = aprobo
    base["firmas"] = firmas
    return base


def conservar_links_sicoe_vigentes(links: Any, filas_so_reportes: Any) -> list[dict]:
    """Deja solo reporte_id que existen hoy y refresca numero_reporte desde la fila viva.

    Misma regla que la sección «Reportes SICOE» de la planilla.
    """
    by_id: dict[int, dict] = {}
    for row in filas_so_reportes or []:
        if not isinstance(row, dict):
            continue
        try:
            by_id[int(row["id"])] = row
        except (TypeError, ValueError, KeyError):
            continue
    kept: list[dict] = []
    for item in links or []:
        if not isinstance(item, dict):
            continue
        try:
            rid = int(item["reporte_id"])
        except (TypeError, ValueError, KeyError):
            continue
        if rid not in by_id:
            continue
        out = dict(item)
        nr = by_id[rid].get("numero_reporte")
        if nr is not None:
            out["numero_reporte"] = nr
        kept.append(out)
    return kept


def links_sicoe_meta_planilla(planilla: Any) -> list[dict]:
    """Links guardados en meta_cabecera.sicoe_reportes (aún sin filtrar vigencia)."""
    if not isinstance(planilla, dict):
        return []
    meta = planilla.get("meta_cabecera")
    if not isinstance(meta, dict):
        return []
    raw = meta.get("sicoe_reportes")
    if not isinstance(raw, list):
        return []
    return [dict(item) for item in raw if isinstance(item, dict) and item.get("reporte_id") is not None]


def planilla_sin_reporte_vigente(planilla: Any, filas_so_reportes: Any) -> bool:
    """True si la planilla no tiene ningún reporte que exista hoy en so_reportes."""
    links = links_sicoe_meta_planilla(planilla)
    return len(conservar_links_sicoe_vigentes(links, filas_so_reportes)) == 0


def contar_planillas_sin_reporte_vigente(planillas: Any, filas_so_reportes: Any) -> int:
    """Cuántas planillas del contrato quedan sin reporte vigente asociado."""
    total = 0
    for planilla in planillas or []:
        if isinstance(planilla, dict) and planilla_sin_reporte_vigente(planilla, filas_so_reportes):
            total += 1
    return total


def _token_numero_reporte_archivo(raw: Any) -> str:
    if raw is None or isinstance(raw, bool):
        return ""
    if isinstance(raw, int):
        txt = str(raw)
    elif isinstance(raw, float):
        txt = str(int(raw)) if raw.is_integer() else str(raw).strip()
    else:
        txt = str(raw).strip()
    return _RE_TOKEN_ARCHIVO.sub("", txt)


def numeros_reporte_para_archivo(links: Any) -> list[str]:
    """Números de reporte, en orden, sin repetir y seguros para un nombre de archivo."""
    nums: list[str] = []
    seen: set[str] = set()
    for item in links or []:
        if not isinstance(item, dict):
            continue
        token = _token_numero_reporte_archivo(item.get("numero_reporte"))
        if not token or token in seen:
            continue
        seen.add(token)
        nums.append(token)
    return nums


def _html_celda_firma(titulo: str, texto: str, rol: str) -> str:
    """Nombre y, debajo, la hora. La celda derecha recorta el final de una sola línea."""
    partes = str(texto or "").split(" · ", 1)
    nom = html.escape(partes[0], quote=True)
    marca = html.escape(partes[1], quote=True) if len(partes) > 1 else ""
    marca_html = f"{marca}<br/>" if marca else ""
    return (
        '<td width="50%">'
        f"<b>{titulo}</b><br/>"
        f"{nom}<br/>"
        f"{marca_html}"
        f'<span class="meta">{rol}</span>'
        "</td>"
    )


def html_pie_firmas_planilla(elaboro: str, aprobo: str) -> str:
    """Pie Elaboró / Aprobó del PDF. El texto ya resuelto se escapa aquí."""
    return (
        '<table class="firmas" width="100%"><tr>'
        + _html_celda_firma("Elaboró", elaboro, "Topografo de Obra (Contratista)")
        + _html_celda_firma("Aprobó:", aprobo, "Topografo Interventoria")
        + "</tr></table>"
    )


def nombre_archivo_planilla_tuberia(
    links: Any,
    *,
    extension: str,
    plantilla: bool = False,
) -> str:
    """planilla_tuberia[_plantilla][_12_15].ext — el número vigente cierra el nombre."""
    ext = str(extension or "pdf").strip().lstrip(".") or "pdf"
    base = "planilla_tuberia"
    if plantilla:
        base += "_plantilla"
    nums = numeros_reporte_para_archivo(links)
    if nums:
        base += "_" + "_".join(nums)
    return f"{base}.{ext}"
