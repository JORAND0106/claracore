"""Utilidades diseño geométrico de vía — plantilla CSV, importación y cotas por capa."""
from __future__ import annotations

import csv
import io
import re
import unicodedata
from typing import Any

PLANTILLA_CSV_DISENO = (
    "TRAMO,ABSCISA,IZQUIERDA,EJE,DERECHA,ANCHO\r\n"
    "Tramo 1,0,801.50,801.55,801.52,7.0\r\n"
    "Tramo 1,20,801.48,801.53,801.50,7.0\r\n"
    "Tramo 1,40,801.45,801.50,801.47,7.0\r\n"
)

_COL_ALIASES: dict[str, tuple[str, ...]] = {
    "tramo": ("tramo", "sector"),
    "abscisa": ("abscisa", "pk", "progresiva", "estacion"),
    "cota_izquierda": ("izquierda", "izq", "left", "cota_izquierda", "cota izquierda"),
    "cota_eje": ("eje", "centro", "cota_eje", "cota eje"),
    "cota_derecha": ("derecha", "der", "right", "cota_derecha", "cota derecha"),
    "ancho": ("ancho", "width", "ancho_calzada", "ancho calzada"),
}


def _norm_header(h: str) -> str:
    s = unicodedata.normalize("NFKD", (h or "").strip().lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


# Orden: cotas transversales antes que tramo (evita ambigüedad en headers).
_HEADER_FIELD_ORDER = (
    "cota_izquierda",
    "cota_eje",
    "cota_derecha",
    "abscisa",
    "ancho",
    "tramo",
)


def _map_headers(headers: list[str]) -> dict[int, str]:
    mapped: dict[int, str] = {}
    for i, raw in enumerate(headers):
        nh = _norm_header(raw)
        for field in _HEADER_FIELD_ORDER:
            aliases = _COL_ALIASES[field]
            if nh in aliases or nh == field:
                mapped[i] = field
                break
    return mapped


def _parse_float(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_fila(mapped: dict[int, str], row: list[Any]) -> dict[str, Any] | None:
    data: dict[str, Any] = {}
    for i, field in mapped.items():
        if i >= len(row):
            continue
        raw = row[i]
        if field == "tramo":
            t = str(raw).strip() if raw is not None and str(raw).strip() else None
            data["tramo"] = t
        elif field == "abscisa":
            v = _parse_float(raw)
            if v is not None:
                data["abscisa"] = v
        else:
            v = _parse_float(raw)
            if v is not None:
                data[field] = v
    if "abscisa" not in data:
        return None
    return data


def parse_csv_diseno_rasante(contenido: str) -> list[dict[str, Any]]:
    """Parsea CSV con columnas TRAMO|ABSCISA|IZQUIERDA|EJE|DERECHA|ANCHO."""
    if not (contenido or "").strip():
        raise ValueError("El archivo está vacío.")
    sample = contenido[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(contenido), dialect)
    rows = list(reader)
    if not rows:
        raise ValueError("No hay filas en el archivo.")
    mapped = _map_headers(rows[0])
    if "abscisa" not in mapped.values():
        raise ValueError(
            "Faltan columnas obligatorias. Use la plantilla: TRAMO, ABSCISA, IZQUIERDA, EJE, DERECHA, ANCHO."
        )
    out: list[dict[str, Any]] = []
    for row in rows[1:]:
        if not any(str(c).strip() for c in row):
            continue
        fila = _parse_fila(mapped, row)
        if fila:
            out.append(fila)
    if not out:
        raise ValueError("No se encontraron filas de datos válidas (revise ABSCISA numérica).")
    out.sort(key=lambda r: (r.get("tramo") or "", r["abscisa"]))
    return out


def parse_filas_diseno_rasante(filas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normaliza filas ya parseadas (p. ej. desde Excel en frontend)."""
    out: list[dict[str, Any]] = []
    for raw in filas:
        abscisa = _parse_float(raw.get("abscisa"))
        if abscisa is None:
            continue
        out.append({
            "tramo": (str(raw.get("tramo")).strip() if raw.get("tramo") else None) or None,
            "abscisa": abscisa,
            "cota_izquierda": _parse_float(raw.get("cota_izquierda") or raw.get("izquierda")),
            "cota_eje": _parse_float(raw.get("cota_eje") or raw.get("eje")),
            "cota_derecha": _parse_float(raw.get("cota_derecha") or raw.get("derecha")),
            "ancho": _parse_float(raw.get("ancho")),
        })
    if not out:
        raise ValueError("No hay filas válidas con ABSCISA.")
    out.sort(key=lambda r: (r.get("tramo") or "", r["abscisa"]))
    return out


def espesor_acumulado_hasta_capa(capas: list[dict[str, Any]], indice_capa: int) -> float:
    """Suma espesores de capas anteriores a indice_capa (0 = capa terminada / rasante)."""
    if indice_capa <= 0:
        return 0.0
    total = 0.0
    for i in range(min(indice_capa, len(capas))):
        total += float(capas[i].get("espesor_m") or 0)
    return total


def espesor_acumulado_incluyendo_capa(capas: list[dict[str, Any]], indice_capa: int) -> float:
    """Suma espesores desde la rasante hasta el fondo de indice_capa (inclusive)."""
    if indice_capa < 0 or indice_capa >= len(capas):
        return espesor_acumulado_hasta_capa(capas, len(capas))
    return espesor_acumulado_hasta_capa(capas, indice_capa) + float(capas[indice_capa].get("espesor_m") or 0)


def cota_fondo_capa(cota_rasante: float, capas: list[dict[str, Any]], indice_capa: int) -> float:
    """Cota inferior de la capa (superficie de contacto con la capa de referencia inferior)."""
    return float(cota_rasante) - espesor_acumulado_incluyendo_capa(capas, indice_capa)


def ancho_via_capa(eje: dict[str, Any], capas: list[dict[str, Any]], indice_capa: int | None) -> float:
    """Ancho transversal efectivo = ancho de vía + sobre-ancho de la capa."""
    base = float(eje.get("ancho_via_m") or 0)
    if indice_capa is not None and 0 <= int(indice_capa) < len(capas):
        base += float(capas[int(indice_capa)].get("sobre_ancho_m") or 0)
    return base


def indice_entrega_referencia_capa(capas: list[dict[str, Any]], indice_capa: int) -> int:
    """Índice de entrega DG de la capa inferior usada como referencia de espesor."""
    ref_idx = referencia_analisis_indice(capas, indice_capa)
    if ref_idx is not None:
        return ref_idx
    return len(capas)


def capa_usa_cota_inferior_diseno(capas: list[dict[str, Any]], indice_capa: int) -> bool:
    """True si la capa se verifica en su cara inferior (ref. espesor = terreno natural)."""
    return referencia_analisis_indice(capas, indice_capa) is None


def cota_diseno_capa(cota_rasante: float, capas: list[dict[str, Any]], indice_capa: int) -> float:
    """Cota inferior verificable de la capa en entrega DG.

    Rasante − espesores acumulados desde la superficie terminada hasta el fondo
    de la capa seleccionada (inclusive).
    """
    return cota_fondo_capa(cota_rasante, capas, indice_capa)


def cota_diseno_superior_capa(cota_rasante: float, capas: list[dict[str, Any]], indice_capa: int) -> float:
    """Cota de la cara superior de la capa (para espesor y comparación con campo en capa inferior)."""
    return cota_rasante - espesor_acumulado_hasta_capa(capas, indice_capa)


def cota_fondo_estructura(cota_rasante: float, capas: list[dict[str, Any]]) -> float:
    """Cota del fondo de la estructura (contacto con terreno natural de diseño)."""
    total = sum(float(c.get("espesor_m") or 0) for c in capas)
    return float(cota_rasante) - total


def indice_capa_por_orden(capas: list[dict[str, Any]], orden: int) -> int | None:
    for i, c in enumerate(capas):
        if int(c.get("orden") or (i + 1)) == int(orden):
            return i
    return None


def referencia_analisis_indice(capas: list[dict[str, Any]], indice_capa: int) -> int | None:
    """Índice de la capa inferior usada para verificar espesor en entrega."""
    if indice_capa < 0 or indice_capa >= len(capas):
        return None
    capa = capas[indice_capa]
    ref_ord = capa.get("referencia_analisis_orden")
    if ref_ord is not None:
        if int(ref_ord) == 0:
            return None
        idx = indice_capa_por_orden(capas, int(ref_ord))
        if idx is not None and idx > indice_capa:
            return idx
    if indice_capa + 1 < len(capas):
        return indice_capa + 1
    return None


def capa_referencia_analisis(capas: list[dict[str, Any]], indice_capa: int) -> dict[str, Any] | None:
    idx = referencia_analisis_indice(capas, indice_capa)
    if idx is None:
        return None
    return capas[idx]


SECCION_TIPOS: dict[str, dict[str, Any]] = {
    "A": {
        "titulo": "Simétrica centrada",
        "descripcion": "Izquierda (−W/2) · Eje (0) · Derecha (+W/2)",
        "etiquetas": ("izquierda", "eje", "derecha"),
    },
    "B": {
        "titulo": "Eje a la derecha",
        "descripcion": "Borde izq (−W) · Media izq (−W/2) · Eje (0)",
        "etiquetas": ("borde_izquierdo", "media_izquierda", "eje"),
    },
    "C": {
        "titulo": "Eje a la izquierda",
        "descripcion": "Eje (0) · Media der (+W/2) · Borde der (+W)",
        "etiquetas": ("eje", "media_derecha", "borde_derecho"),
    },
}


def ordenadas_referencia_seccion(tipo: str, ancho_via: float) -> list[tuple[str, float]]:
    """Ordenadas (m) de los 3 puntos de referencia según tipo A/B/C."""
    w = float(ancho_via)
    if tipo == "B":
        return [("col_izquierda", -w), ("col_eje", -w / 2), ("col_derecha", 0.0)]
    if tipo == "C":
        return [("col_izquierda", 0.0), ("col_eje", w / 2), ("col_derecha", w)]
    return [("col_izquierda", -w / 2), ("col_eje", 0.0), ("col_derecha", w / 2)]


def _interp_lineal(pts: list[tuple[float, float]], ordenada: float) -> float | None:
    """Interpola cota en ordenada dada a partir de puntos (ord, cota) ordenados."""
    if not pts:
        return None
    pts = sorted(pts, key=lambda p: p[0])
    if ordenada <= pts[0][0]:
        return pts[0][1]
    if ordenada >= pts[-1][0]:
        return pts[-1][1]
    for i in range(len(pts) - 1):
        o1, c1 = pts[i]
        o2, c2 = pts[i + 1]
        if o1 <= ordenada <= o2:
            if abs(o2 - o1) < 1e-12:
                return c1
            t = (ordenada - o1) / (o2 - o1)
            return c1 + t * (c2 - c1)
    return None


def _ordenes_hacia(o_ini: float, o_fin: float, paso: float) -> list[float]:
    """Ordenadas desde o_ini hacia o_fin a paso fijo; si el resto al borde es menor que paso, cierra en o_fin."""
    if paso <= 0 or abs(o_fin - o_ini) < 1e-12:
        return [round(o_ini, 4)]
    sign = 1.0 if o_fin > o_ini else -1.0
    end = float(o_fin)
    pts = [round(o_ini, 4)]
    o = float(o_ini)
    while True:
        next_o = o + sign * paso
        if sign > 0 and next_o >= end - 1e-9:
            break
        if sign < 0 and next_o <= end + 1e-9:
            break
        if abs(next_o - end) < paso - 1e-9:
            break
        pts.append(round(next_o, 4))
        o = next_o
    last = round(end, 4)
    if pts[-1] != last:
        pts.append(last)
    return pts


def ordenadas_intermedias_seccion(
    o_izq: float,
    o_eje: float,
    o_der: float,
    paso: float,
) -> list[float]:
    """
    Ordenadas transversales con intermedias entre borde y punto central (columna EJE).
    A (eje en 0): desde eje hacia cada borde. B/C: izq→eje y eje→der.
    """
    if paso <= 0:
        return sorted({round(o_izq, 4), round(o_eje, 4), round(o_der, 4)})
    if abs(o_eje) < 1e-9:
        left = _ordenes_hacia(o_eje, o_izq, paso)
        right = _ordenes_hacia(o_eje, o_der, paso)
    else:
        left = _ordenes_hacia(o_izq, o_eje, paso)
        right = _ordenes_hacia(o_eje, o_der, paso)
    return sorted(set(left + right))


def generar_puntos_perfil_fila(
    fila: dict[str, Any],
    tipo_seccion: str,
    ancho_via: float,
    calcular_intermedias: bool,
    paso_intermedias: float | None,
) -> list[dict[str, Any]]:
    """Genera puntos transversales (ordenada, cota) para una fila del CSV."""
    refs = ordenadas_referencia_seccion(tipo_seccion, ancho_via)
    cotas_cols = [
        fila.get("cota_izquierda"),
        fila.get("cota_eje"),
        fila.get("cota_derecha"),
    ]
    ref_pts: list[tuple[float, float]] = []
    out: list[dict[str, Any]] = []
    ref_ordenes = [ord_ref for _, ord_ref in refs]
    o_izq, o_eje_ord, o_der = ref_ordenes[0], ref_ordenes[1], ref_ordenes[2]
    ref_orden_set = {round(o, 4) for o in ref_ordenes}
    for (_key, ord_ref), cota in zip(refs, cotas_cols):
        if cota is None:
            continue
        ref_pts.append((ord_ref, float(cota)))
        out.append({
            "tramo": fila.get("tramo"),
            "abscisa": fila["abscisa"],
            "ordenada": ord_ref,
            "cota": float(cota),
            "es_referencia": True,
        })
    if len(ref_pts) < 2:
        return out
    if calcular_intermedias and paso_intermedias and paso_intermedias > 0:
        existing = {round(p["ordenada"], 4) for p in out}
        for ord_t in ordenadas_intermedias_seccion(o_izq, o_eje_ord, o_der, float(paso_intermedias)):
            ornd = round(ord_t, 4)
            if ornd in existing:
                continue
            c = _interp_lineal(ref_pts, ord_t)
            if c is not None:
                out.append({
                    "tramo": fila.get("tramo"),
                    "abscisa": fila["abscisa"],
                    "ordenada": ornd,
                    "cota": c,
                    "es_referencia": ornd in ref_orden_set,
                })
                existing.add(ornd)
    out.sort(key=lambda p: p["ordenada"])
    return out


def generar_perfil_desde_filas(
    filas: list[dict[str, Any]],
    tipo_seccion: str,
    ancho_via: float,
    calcular_intermedias: bool = False,
    paso_intermedias: float | None = None,
) -> list[dict[str, Any]]:
    puntos: list[dict[str, Any]] = []
    for fila in filas:
        puntos.extend(
            generar_puntos_perfil_fila(
                fila, tipo_seccion, ancho_via, calcular_intermedias, paso_intermedias
            )
        )
    return puntos
