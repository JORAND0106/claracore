"""
Esquema de medición varilla (Kg) — NTC 2289 pesos por metro lineal.

Tabla fija de plataforma (no editable por usuarios).
Cant Total varilla = longitud × peso_kg_m × cantidad (mismo redondeo dinámico SICOE).
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from sicoe_cantidad_redondeo import redondear_cantidad_total_dinamico, redondear_dimension

# Diámetro canónico (pulgadas) → peso kg/m (2 decimales), NTC 2289.
SICOE_VARILLA_PESOS_KG_M: Dict[str, float] = {
    "1/4": 0.25,
    "3/8": 0.56,
    "1/2": 0.99,
    "5/8": 1.55,
    "3/4": 2.24,
    "7/8": 3.04,
    "1": 3.97,
    "1 1/8": 5.06,
    "1 1/4": 6.40,
    "1 3/8": 7.91,
    "1 3/4": 11.38,
    "2 1/4": 20.24,
}

SICOE_VARILLA_DIAMETROS_ORDEN: List[str] = [
    "1/4",
    "3/8",
    "1/2",
    "5/8",
    "3/4",
    "7/8",
    "1",
    "1 1/8",
    "1 1/4",
    "1 3/8",
    "1 3/4",
    "2 1/4",
]

_DIAM_ALIASES: Dict[str, str] = {
    "0.25": "1/4",
    "0,25": "1/4",
    "1/4\"": "1/4",
    "3/8\"": "3/8",
    "1/2\"": "1/2",
    "5/8\"": "5/8",
    "3/4\"": "3/4",
    "7/8\"": "7/8",
    "1\"": "1",
    "1-1/8": "1 1/8",
    "1-1/4": "1 1/4",
    "1-3/8": "1 3/8",
    "1-3/4": "1 3/4",
    "2-1/4": "2 1/4",
}


def sicoe_unidad_es_kg(unidad: Any) -> bool:
    u = re.sub(r"\s+", "", str(unidad or "").strip().lower())
    return u in {"kg", "kilo", "kilos", "kilogramo", "kilogramos"}


def sicoe_normalizar_diametro_varilla(raw: Any) -> Optional[str]:
    """Devuelve clave canónica de la tabla o None si no es válida."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = s.replace("Ø", "").replace("ø", "").replace("⌀", "")
    s = s.replace("''", "").replace('"', "").strip()
    s = re.sub(r"\s+", " ", s)
    s = s.replace("−", "-").replace("–", "-")
    key = s.lower() if False else s  # keep digits/slash
    # Normalize hyphenated mixed numbers: 1-1/4 → 1 1/4
    m = re.match(r"^(\d+)\s*[-/]\s*(\d+)\s*/\s*(\d+)$", s)
    if m:
        s = f"{m.group(1)} {m.group(2)}/{m.group(3)}"
    if s in SICOE_VARILLA_PESOS_KG_M:
        return s
    if s in _DIAM_ALIASES:
        return _DIAM_ALIASES[s]
    # Try without spaces
    compact = s.replace(" ", "")
    for canon in SICOE_VARILLA_DIAMETROS_ORDEN:
        if canon.replace(" ", "") == compact:
            return canon
    return None


def sicoe_peso_kg_m_por_diametro(diametro: Any) -> Optional[float]:
    canon = sicoe_normalizar_diametro_varilla(diametro)
    if canon is None:
        return None
    return float(SICOE_VARILLA_PESOS_KG_M[canon])


def sicoe_diametros_validos_msg() -> str:
    return ", ".join(SICOE_VARILLA_DIAMETROS_ORDEN)


def sicoe_es_varilla_registro(row: Optional[dict]) -> bool:
    if not row:
        return False
    return row.get("es_varilla") is True


def sicoe_kg_pendiente_recaptura(row: Optional[dict]) -> bool:
    """Kg sin elección Varilla/No varilla (legacy o incompleto)."""
    if not row:
        return False
    if not sicoe_unidad_es_kg(row.get("unidad")):
        return False
    return row.get("es_varilla") is None


def sicoe_calcular_cantidad_varilla(
    longitud: Any = None,
    peso_kg_m: Any = None,
    cantidad: Any = None,
) -> float:
    """Longitud × Peso × Cantidad; vacíos=1; todos vacíos→0; redondeo dinámico."""
    def _empty(v: Any) -> bool:
        return v is None or v == ""

    if _empty(longitud) and _empty(peso_kg_m) and _empty(cantidad):
        return 0.0

    def _f(v: Any) -> float:
        if _empty(v):
            return 1.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return float("nan")

    lv, pv, cv = _f(longitud), _f(peso_kg_m), _f(cantidad)
    if any(x != x for x in (lv, pv, cv)):
        return 0.0
    return redondear_cantidad_total_dinamico(lv * pv * cv)


def sicoe_calcular_cantidad_registro(
    *,
    es_varilla: Any = None,
    longitud: Any = None,
    ancho: Any = None,
    espesor: Any = None,
    cantidad: Any = None,
    peso_kg_m: Any = None,
    diametro_varilla: Any = None,
) -> float:
    from sicoe_cantidad_redondeo import calcular_cantidad_con_redondeo

    if es_varilla is True:
        peso = peso_kg_m
        if peso is None or peso == "":
            peso = sicoe_peso_kg_m_por_diametro(diametro_varilla)
        return sicoe_calcular_cantidad_varilla(longitud, peso, cantidad)
    return calcular_cantidad_con_redondeo(longitud, ancho, espesor, cantidad)


def sicoe_validar_y_preparar_medicion_varilla(
    data: dict,
    *,
    unidad: Any = None,
    prev: Optional[dict] = None,
) -> Tuple[dict, Optional[str]]:
    """
    Normaliza campos de medición varilla en `data` (mutación in-place del dict de update).
    Retorna (data, error_detail|None).
    """
    prev = prev or {}
    uni = unidad if unidad is not None else data.get("unidad", prev.get("unidad"))
    es_var = data["es_varilla"] if "es_varilla" in data else prev.get("es_varilla")

    if not sicoe_unidad_es_kg(uni):
        # Fuera de Kg: no forzar esquema varilla.
        if "es_varilla" in data and data["es_varilla"] is True:
            return data, "El esquema Varilla solo aplica cuando la unidad es Kg."
        if "es_varilla" in data:
            data["es_varilla"] = None
        if "diametro_varilla" in data:
            data["diametro_varilla"] = None
        if "peso_kg_m" in data:
            data["peso_kg_m"] = None
        return data, None

    if es_var is True:
        diam_raw = data["diametro_varilla"] if "diametro_varilla" in data else prev.get("diametro_varilla")
        canon = sicoe_normalizar_diametro_varilla(diam_raw)
        if canon is None:
            return data, (
                "Diámetro de varilla no válido. "
                f"Diámetros aceptados (pulgadas): {sicoe_diametros_validos_msg()}."
            )
        peso = sicoe_peso_kg_m_por_diametro(canon)
        data["es_varilla"] = True
        data["diametro_varilla"] = canon
        data["peso_kg_m"] = peso
        # Ancho/espesor no aplican al esquema varilla.
        data["ancho"] = None
        data["espesor"] = None
        long_v = data["longitud"] if "longitud" in data else prev.get("longitud")
        cant_v = data["cantidad"] if "cantidad" in data else prev.get("cantidad")
        if long_v is not None:
            data["longitud"] = redondear_dimension(long_v)
        if cant_v is not None:
            data["cantidad"] = redondear_dimension(cant_v)
        data["cantidad_total"] = sicoe_calcular_cantidad_varilla(
            data.get("longitud", long_v), peso, data.get("cantidad", cant_v)
        )
        return data, None

    if es_var is False:
        data["es_varilla"] = False
        data["diametro_varilla"] = None
        data["peso_kg_m"] = None
        return data, None

    # es_varilla NULL: pendiente — no recalcular con esquema varilla.
    return data, None


def sicoe_fmt_diametro_display(diametro: Any) -> str:
    canon = sicoe_normalizar_diametro_varilla(diametro)
    if canon is None:
        s = str(diametro or "").strip()
        return f"Ø {s}" if s else "—"
    return f"Ø {canon}"


def sicoe_headers_medicion_para_regs(regs: List[dict]) -> Dict[str, str]:
    """
    Encabezados para una vista/tabla según los registros visibles.
    Si hay varilla (o mixto): LONG + ANCHO/Ø + ESP/kg/m.
    """
    tiene_varilla = any(sicoe_es_varilla_registro(r) for r in (regs or []))
    if not tiene_varilla:
        return {
            "long": "LONG",
            "col2": "ANCHO",
            "col3": "ESP",
            "cant": "CANT",
            "cant_tot": "CANT TOT",
            "modo": "estandar",
        }
    solo_varilla = all(sicoe_es_varilla_registro(r) for r in (regs or []) if r)
    if solo_varilla:
        return {
            "long": "LONG",
            "col2": "Ø",
            "col3": "kg/m",
            "cant": "CANT",
            "cant_tot": "CANT TOT",
            "modo": "varilla",
        }
    return {
        "long": "LONG",
        "col2": "ANCHO/Ø",
        "col3": "ESP/kg/m",
        "cant": "CANT",
        "cant_tot": "CANT TOT",
        "modo": "mixto",
    }
