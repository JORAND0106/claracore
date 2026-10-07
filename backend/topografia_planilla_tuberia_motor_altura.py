"""
Motor legacy: descuento Roca/Otros por altura promedio de cartera (pre PR #784).

Solo se usa para reconstruir en memoria el cálculo de planillas selladas
cuando falta o está incompleto calculo_snapshot. No escribe a base de datos.
"""
from __future__ import annotations

from typing import Any, Optional

from topografia_planilla_tuberia import (
    ESPESOR_ROCA_M,
    ITEMS_DESCUENTOS_ALCANTARILLA,
    ITEMS_DESCUENTOS_FILTRO,
    _dim_resumen_2,
    _f,
    _label_desc_otros,
    _meta_item_cantidad,
    _meta_item_descuento,
    _normalize_descuentos_otros_manuales,
    _normalize_manual_descuentos,
    _product,
    _product_resumen,
    _r2,
    _r3,
    calcular_cartera,
    calcular_seccion,
    es_codigo_otros,
    es_codigo_desc_otros,
    es_codigo_cantidad_editable,
    perfil_longitudinal,
    seccion_tipica_params,
)

# Destino altura ← códigos de línea volumen (compat si meta ya normalizó a EXC|TRI|REL).
LINEA_A_CAMPO_ALTURA = {
    "EXC": "prom_altura_excavacion",
    "TRI": "prom_altura_triturado",
    "REL": "prom_altura_relleno",
}

CAMPOS_DESCUENTO_ALTURA = (
    ("prom_altura_excavacion", "Altura Excavación"),
    ("prom_altura_triturado", "Altura Triturado"),
    ("prom_altura_relleno", "Altura Relleno"),
)
CAMPOS_DESCUENTO_ALTURA_SET = frozenset(c for c, _ in CAMPOS_DESCUENTO_ALTURA)
# Campo de cartera → código de Resumen de Cantidades que absorbe el descuento de altura.
CAMPO_DESCUENTO_ALTURA_A_CANTIDAD = {
    "prom_altura_excavacion": "EXC",
    "prom_altura_triturado": "TRI",
    "prom_altura_relleno": "REL",
}
CAMPOS_DESCUENTO_ALTURA_LABEL = dict(CAMPOS_DESCUENTO_ALTURA)


def _normalize_cantidades_manuales_altura(
    cantidades_manuales: Optional[list[dict]],
) -> list[dict[str, Any]]:
    """Overrides EXC_ROC/OTROS; conserva prom_altura_* o mapea EXC|TRI|REL → campo altura."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for d in cantidades_manuales or []:
        if not isinstance(d, dict):
            continue
        cod = str(d.get("codigo") or "").strip().upper()
        if not es_codigo_cantidad_editable(cod):
            continue
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
        raw = str(d.get("descontar_de") or "").strip()
        if raw in CAMPOS_DESCUENTO_ALTURA_SET:
            entry["descontar_de"] = raw
        elif raw.upper() in LINEA_A_CAMPO_ALTURA:
            entry["descontar_de"] = LINEA_A_CAMPO_ALTURA[raw.upper()]
        out.append(entry)
    if not any(es_codigo_otros(x["codigo"]) for x in out):
        out.append({"codigo": "OTROS_1"})
    if not any(x["codigo"] == "EXC_ROC" for x in out):
        out.insert(0, {"codigo": "EXC_ROC"})
    else:
        out.sort(key=lambda x: (0 if x["codigo"] == "EXC_ROC" else 1, x["codigo"]))
    return out

def _nombre_actividad_descuento_altura(codigo: Any, nombre: Any) -> str:
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


def formatear_nota_descuento_altura(
    *,
    actividad: str,
    campo_label: str,
    altura_original: float,
    valor_descontado: float,
    altura_final: float,
) -> str:
    """Nota breve: «Actividad: Altura Exc. 1.005 − 0.100 = 0.905 m»."""
    act = str(actividad or "").strip() or "—"
    lbl = str(campo_label or "").strip() or "Altura"
    return (
        f"{act}: {lbl} {_r3(altura_original)} − {_r3(valor_descontado)} "
        f"= {_r3(altura_final)} m"
    )


def _construir_descuentos_altura_detalle(
    overrides_list: list[dict],
    *,
    long_m: float,
    ancho_m: float,
    alturas_orig: dict[str, float],
    alturas_final: dict[str, float],
) -> list[dict[str, Any]]:
    """
    Una fila por override EXC_ROC/OTROS con descontar_de + espesor.
    Volumen = Long × Ancho excavación × espesor descontado (m³).
    """
    out: list[dict[str, Any]] = []
    for ov in overrides_list:
        campo = ov.get("descontar_de")
        if campo not in CAMPOS_DESCUENTO_ALTURA_SET:
            continue
        esp = ov.get("espesor")
        if esp is None:
            continue
        try:
            esp_f = float(esp)
        except (TypeError, ValueError):
            continue
        if abs(esp_f) <= 1e-12:
            continue
        codigo_origen = str(ov.get("codigo") or "").strip().upper()
        if not codigo_origen:
            continue
        actividad = _nombre_actividad_descuento_altura(codigo_origen, ov.get("nombre"))
        label = CAMPOS_DESCUENTO_ALTURA_LABEL.get(campo, campo)
        h_orig = float(alturas_orig.get(campo) or 0.0)
        h_fin = float(alturas_final.get(campo) or 0.0)
        vol = _r2(_product_resumen([long_m, ancho_m, esp_f])) or 0.0
        nota = formatear_nota_descuento_altura(
            actividad=actividad,
            campo_label=label,
            altura_original=h_orig,
            valor_descontado=esp_f,
            altura_final=h_fin,
        )
        out.append({
            "codigo": f"DESC_ALT_{codigo_origen}",
            "origen_codigo": codigo_origen,
            "nombre": f"Desc. altura ({actividad})",
            "actividad": actividad,
            "campo": campo,
            "campo_label": label,
            "item_cant_codigo": CAMPO_DESCUENTO_ALTURA_A_CANTIDAD.get(campo),
            "altura_original": _r3(h_orig),
            "valor_descontado": _r3(esp_f),
            "altura_final": _r3(h_fin),
            "long": _dim_resumen_2(long_m),
            "ancho": _dim_resumen_2(ancho_m),
            "espesor": _dim_resumen_2(esp_f),
            "cantidad": round(float(vol), 2),
            "unidad": "m³",
            "nota": nota,
        })
    return out


def calcular_cantidades_y_descuentos_altura(
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
    # FILTRO: Geotextil = L × (prom ancho geotextil + traslapo).
    # ALCANTARILLA: no se calcula → cantidad 0 (PRODUCT vacíos dejaría solo L).
    ancho_geo_prom = float(tot.get("prom_ancho_geotextil") or 0.0)
    traslapo = float(seccion.get("traslapo_m") or 0.0) if tipo == "FILTRO" else 0.0
    ancho_geo = (ancho_geo_prom + traslapo) if tipo == "FILTRO" else None

    overrides_list = _normalize_cantidades_manuales_altura(cantidades_manuales)
    # Descuentos de altura cruzados (suma de espesores por campo destino)
    h_exc_orig, h_trit_orig, h_rel_orig = h_exc, h_trit, h_rel
    restas = {k: 0.0 for k in CAMPOS_DESCUENTO_ALTURA_SET}
    for ov in overrides_list:
        campo = ov.get("descontar_de")
        esp = ov.get("espesor")
        if campo in restas and esp is not None:
            restas[campo] += float(esp)
    h_exc = max(0.0, h_exc - restas.get("prom_altura_excavacion", 0.0))
    h_trit = max(0.0, h_trit - restas.get("prom_altura_triturado", 0.0))
    h_rel = max(0.0, h_rel - restas.get("prom_altura_relleno", 0.0))
    alturas_orig = {
        "prom_altura_excavacion": h_exc_orig,
        "prom_altura_triturado": h_trit_orig,
        "prom_altura_relleno": h_rel_orig,
    }
    alturas_final = {
        "prom_altura_excavacion": h_exc,
        "prom_altura_triturado": h_trit,
        "prom_altura_relleno": h_rel,
    }
    descuentos_altura_detalle = _construir_descuentos_altura_detalle(
        overrides_list,
        long_m=L,
        ancho_m=B,
        alturas_orig=alturas_orig,
        alturas_final=alturas_final,
    )
    notas_descuento_altura = [
        d["nota"] for d in descuentos_altura_detalle if d.get("nota")
    ]

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
        "descuentos_altura_detalle": descuentos_altura_detalle,
        "notas_descuento_altura": notas_descuento_altura,
    }



def calcular_planilla_completa_altura(
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
    """Igual que calcular_planilla_completa pero con descuento por altura (pre #784)."""
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
    cant = calcular_cantidades_y_descuentos_altura(
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
        "descuentos_altura_detalle": cant.get("descuentos_altura_detalle") or [],
        "notas_descuento_altura": cant.get("notas_descuento_altura") or [],
        "descuentos_volumen": {},
        "descuentos_volumen_detalle": [],
        "notas_descuento_volumen": [],
        "perfil": perfil_longitudinal(cartera, seccion),
        "seccion_tipica": seccion_tipica_params(seccion, cartera),
        "motor_calculo_version": "altura_v1",
    }
