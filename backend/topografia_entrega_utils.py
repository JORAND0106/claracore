"""Entrega DG Obra — grilla de diseño por capa y resumen de sectores."""
from __future__ import annotations

from typing import Any

from topografia_diseno_utils import cota_diseno_capa, generar_perfil_desde_filas, _interp_lineal


def filtrar_rasante_rango(
    rasante: list[dict[str, Any]],
    abscisa_desde: float | None,
    abscisa_hasta: float | None,
) -> list[dict[str, Any]]:
    if abscisa_desde is None and abscisa_hasta is None:
        return list(rasante)
    out = []
    for r in rasante:
        a = float(r["abscisa"])
        if abscisa_desde is not None and a < float(abscisa_desde) - 1e-9:
            continue
        if abscisa_hasta is not None and a > float(abscisa_hasta) + 1e-9:
            continue
        out.append(r)
    return out


def ordenadas_referencia_izq_eje_der(grilla: list[dict[str, Any]]) -> dict[str, float]:
    refs = [g for g in grilla if g.get("es_referencia")]
    if not refs:
        ords = sorted({round(float(g["ordenada"]), 4) for g in grilla})
        if len(ords) >= 3:
            return {"izq": ords[0], "eje": ords[len(ords) // 2], "der": ords[-1]}
        return {}
    by_abscisa: dict[float, list[dict]] = {}
    for g in refs:
        pk = round(float(g["abscisa"]), 6)
        by_abscisa.setdefault(pk, []).append(g)
    sample = sorted(by_abscisa.values(), key=lambda x: float(x[0]["abscisa"]))[0]
    sample.sort(key=lambda g: float(g["ordenada"]))
    if len(sample) < 3:
        return {}
    return {
        "izq": float(sample[0]["ordenada"]),
        "eje": float(sample[1]["ordenada"]),
        "der": float(sample[2]["ordenada"]),
    }


def grilla_diseno_entrega(
    rasante: list[dict[str, Any]],
    eje: dict[str, Any],
    capas: list[dict[str, Any]],
    indice_capa: int,
    solo_referencia: bool = False,
) -> list[dict[str, Any]]:
    """Puntos de diseño (abscisa × ordenada) con cota rasante y cota inferior de la capa."""
    from topografia_diseno_utils import ancho_via_capa, cota_diseno_capa, cota_fondo_capa

    if not rasante or not capas or indice_capa < 0 or indice_capa >= len(capas):
        return []
    tipo = eje.get("tipo_seccion") or "A"
    ancho = ancho_via_capa(eje, capas, indice_capa)
    if ancho <= 0:
        return []
    perfil = generar_perfil_desde_filas(
        rasante,
        tipo,
        ancho,
        bool(eje.get("calcular_intermedias")),
        float(eje["paso_intermedias_m"]) if eje.get("paso_intermedias_m") else None,
    )
    esp_dis = float(capas[indice_capa].get("espesor_m") or 0)
    out: list[dict[str, Any]] = []
    for p in perfil:
        cota_ras = float(p["cota"])
        row = {
            "tramo": p.get("tramo"),
            "abscisa": p["abscisa"],
            "ordenada": p["ordenada"],
            "cota_rasante": cota_ras,
            "cota_diseno": cota_diseno_capa(cota_ras, capas, indice_capa),
            "cota_fondo_diseno": cota_fondo_capa(cota_ras, capas, indice_capa),
            "espesor_diseno_m": esp_dis,
            "es_referencia": bool(p.get("es_referencia")),
        }
        if solo_referencia and not row["es_referencia"]:
            continue
        out.append(row)
    return out


def grilla_terreno_natural_entrega(
    rasante: list[dict[str, Any]],
    eje: dict[str, Any],
    solo_referencia: bool = False,
) -> list[dict[str, Any]]:
    """Terreno natural en entrega: cota de diseño = rasante importada, sin descontar estructura."""
    if not rasante:
        return []
    tipo = eje.get("tipo_seccion") or "A"
    ancho = float(eje.get("ancho_via_m") or 0)
    if ancho <= 0:
        return []
    perfil = generar_perfil_desde_filas(
        rasante,
        tipo,
        ancho,
        bool(eje.get("calcular_intermedias")),
        float(eje["paso_intermedias_m"]) if eje.get("paso_intermedias_m") else None,
    )
    out: list[dict[str, Any]] = []
    for p in perfil:
        cota_ras = float(p["cota"])
        row = {
            "tramo": p.get("tramo"),
            "abscisa": p["abscisa"],
            "ordenada": p["ordenada"],
            "cota_rasante": cota_ras,
            "cota_diseno": cota_ras,
            "espesor_diseno_m": None,
            "es_referencia": bool(p.get("es_referencia")),
        }
        if solo_referencia and not row["es_referencia"]:
            continue
        out.append(row)
    return out


def grilla_fondo_terreno_entrega(
    rasante: list[dict[str, Any]],
    eje: dict[str, Any],
    capas: list[dict[str, Any]],
    solo_referencia: bool = False,
) -> list[dict[str, Any]]:
    """Grilla con cota de fondo de estructura (terreno natural de diseño) por punto."""
    from topografia_diseno_utils import cota_fondo_estructura

    if not rasante or not capas:
        return []
    tipo = eje.get("tipo_seccion") or "A"
    ancho = float(eje.get("ancho_via_m") or 0)
    if ancho <= 0:
        return []
    perfil = generar_perfil_desde_filas(
        rasante,
        tipo,
        ancho,
        bool(eje.get("calcular_intermedias")),
        float(eje["paso_intermedias_m"]) if eje.get("paso_intermedias_m") else None,
    )
    out: list[dict[str, Any]] = []
    for p in perfil:
        cota_ras = float(p["cota"])
        row = {
            "tramo": p.get("tramo"),
            "abscisa": p["abscisa"],
            "ordenada": p["ordenada"],
            "cota_rasante": cota_ras,
            "cota_diseno": cota_fondo_estructura(cota_ras, capas),
            "espesor_diseno_m": None,
            "es_referencia": bool(p.get("es_referencia")),
        }
        if solo_referencia and not row["es_referencia"]:
            continue
        out.append(row)
    return out


def es_entrega_terreno_natural(indice_capa: int, n_capas: int) -> bool:
    """Índice virtual len(capas) = verificación de terreno natural de diseño."""
    return int(indice_capa) == int(n_capas)


def capa_nombre_vigente_entrega(capas: list[dict[str, Any]], indice_capa: int) -> str:
    """Nombre actual de la capa según configuración DG (no el snapshot al crear la entrega)."""
    n = len(capas)
    idx = int(indice_capa)
    if es_entrega_terreno_natural(idx, n):
        return "Terreno natural"
    if 0 <= idx < n:
        return str(capas[idx].get("nombre") or "Capa").strip() or "Capa"
    return "Capa"


def referencia_es_terreno_natural_capa(
    capas: list[dict[str, Any]],
    indice_capa: int,
) -> bool:
    """True si la capa usa Terreno natural como referencia de espesor."""
    from topografia_diseno_utils import indice_entrega_referencia_capa
    return indice_entrega_referencia_capa(capas, int(indice_capa)) == len(capas)


def grilla_entrega_capa(
    rasante: list[dict[str, Any]],
    eje: dict[str, Any],
    capas: list[dict[str, Any]],
    indice_capa: int,
    solo_referencia: bool = False,
) -> list[dict[str, Any]]:
    if es_entrega_terreno_natural(indice_capa, len(capas)):
        return grilla_terreno_natural_entrega(rasante, eje, solo_referencia=solo_referencia)
    return grilla_diseno_entrega(
        rasante, eje, capas, indice_capa, solo_referencia=solo_referencia,
    )


def ordenadas_transversales(grilla: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Columnas transversales (referencia + intermedias) ordenadas de izq a der."""
    vistos: set[float] = set()
    out: list[dict[str, Any]] = []
    for g in sorted(grilla, key=lambda x: (float(x["abscisa"]), float(x["ordenada"]))):
        ord_v = round(float(g["ordenada"]), 4)
        if ord_v in vistos:
            continue
        vistos.add(ord_v)
        label = "Eje" if abs(ord_v) < 1e-9 else f"{ord_v:+.2f}"
        out.append({
            "ordenada": ord_v,
            "key": _ordenada_key(ord_v),
            "label": label,
        })
    return out


def _ordenada_key(ordenada: float) -> str:
    return str(round(float(ordenada), 4))


def diseno_fila_por_ordenadas(grilla: list[dict], abscisa: float) -> dict[str, Any]:
    """Cotas de diseño por ordenada en una abscisa."""
    tramo = None
    dis: dict[str, float | None] = {}
    for g in grilla:
        if abs(float(g["abscisa"]) - float(abscisa)) > 1e-6:
            continue
        tramo = g.get("tramo") or tramo
        dis[_ordenada_key(g["ordenada"])] = g.get("cota_diseno")
    if not dis:
        return {"tramo": None, "diseno": {}}
    return {"tramo": tramo, "diseno": dis}


def diseno_fila_abscisa(
    grilla: list[dict],
    abscisa: float,
    ordenadas: dict[str, float],
) -> dict[str, Any] | None:
    """Cotas de diseño Izq/Eje/Der para una abscisa (legacy)."""
    tramo = None
    dis: dict[str, float | None] = {}
    for col, ord_v in ordenadas.items():
        ref = _lookup_diseno(grilla, abscisa, ord_v)
        if ref:
            tramo = ref.get("tramo")
            dis[col] = ref.get("cota_diseno")
    if not dis:
        return None
    return {"tramo": tramo, "abscisa": abscisa, "diseno": dis}


def _lookup_diseno(grilla: list[dict], abscisa: float, ordenada: float) -> dict | None:
    for g in grilla:
        if abs(g["abscisa"] - abscisa) < 1e-6 and abs(g["ordenada"] - ordenada) < 1e-4:
            return g
    return None


def calcular_lectura_entrega(
    grilla: list[dict],
    abscisa: float,
    ordenada: float,
    altura_instrumento: float | None,
    lectura_mira: float | None,
    tolerancia_m: float,
    cota_diseno_manual: float | None = None,
    capas: list[dict[str, Any]] | None = None,
    indice_capa: int | None = None,
    grilla_ref: list[dict] | None = None,
    cota_ref_campo: float | None = None,
) -> dict[str, Any]:
    ref = _lookup_diseno(grilla, abscisa, ordenada)
    cota_diseno = cota_diseno_manual
    cota_rasante = None
    espesor_diseno = None
    tramo = None
    if ref:
        cota_diseno = cota_diseno if cota_diseno is not None else ref.get("cota_diseno")
        cota_rasante = ref.get("cota_rasante")
        espesor_diseno = ref.get("espesor_diseno_m")
        tramo = ref.get("tramo")
    cota_campo = None
    if altura_instrumento is not None and lectura_mira is not None:
        cota_campo = float(altura_instrumento) - float(lectura_mira)

    modo_terreno = (
        capas is not None
        and indice_capa is not None
        and es_entrega_terreno_natural(int(indice_capa), len(capas))
    )
    if modo_terreno:
        delta = None
        if cota_campo is not None and cota_diseno is not None:
            delta = cota_campo - float(cota_diseno)
        return {
            "tramo": tramo,
            "abscisa": abscisa,
            "ordenada": ordenada,
            "cota_campo": cota_campo,
            "cota_diseno": cota_diseno,
            "cota_rasante": cota_rasante,
            "espesor_diseno_m": None,
            "espesor_real_m": None,
            "cota_referencia": None,
            "referencia_capa_indice": None,
            "delta": delta,
            "dentro_tolerancia": None,
        }

    cota_ref = cota_ref_campo
    ref_idx = None
    if capas is not None and indice_capa is not None:
        from topografia_diseno_utils import referencia_analisis_indice, cota_fondo_estructura
        ref_idx = referencia_analisis_indice(capas, indice_capa)
        espesor_diseno = float(capas[indice_capa].get("espesor_m") or espesor_diseno or 0)
        if cota_ref is None and ref_idx is not None and grilla_ref:
            ref_g = _lookup_diseno(grilla_ref, abscisa, ordenada)
            if ref_g:
                cota_ref = ref_g.get("cota_diseno")
        elif cota_ref is None and ref_idx is None and grilla_ref:
            ref_g = _lookup_diseno(grilla_ref, abscisa, ordenada)
            if ref_g:
                cota_ref = ref_g.get("cota_diseno")

    delta = None
    espesor_real = None
    dentro = None
    ref_es_terreno = (
        capas is not None
        and indice_capa is not None
        and referencia_es_terreno_natural_capa(capas, int(indice_capa))
    )
    cota_objetivo = float(cota_diseno) if cota_diseno is not None else None

    if ref_es_terreno:
        if cota_ref_campo is not None and cota_diseno is not None:
            delta = float(cota_ref_campo) - float(cota_diseno)
            espesor_real = abs(delta)
        elif cota_campo is not None and cota_diseno is not None:
            delta = float(cota_campo) - float(cota_diseno)
            espesor_real = abs(delta)
            dentro = abs(delta) <= float(tolerancia_m)
        elif cota_diseno is not None and cota_ref is not None:
            delta = float(cota_diseno) - float(cota_ref)
            dentro = abs(delta) <= float(tolerancia_m)
    elif cota_diseno is not None and cota_ref is not None and espesor_diseno is not None:
        espesor_real = abs(float(cota_diseno) - float(cota_ref))
        delta = espesor_real - float(espesor_diseno)
        dentro = abs(delta) <= float(tolerancia_m)
    elif cota_campo is not None and cota_objetivo is not None:
        delta = float(cota_campo) - cota_objetivo
        dentro = abs(delta) <= float(tolerancia_m)

    return {
        "tramo": tramo,
        "abscisa": abscisa,
        "ordenada": ordenada,
        "cota_campo": cota_campo,
        "cota_diseno": cota_diseno,
        "cota_rasante": cota_rasante,
        "espesor_diseno_m": espesor_diseno,
        "espesor_real_m": espesor_real,
        "cota_referencia": cota_ref,
        "referencia_capa_indice": ref_idx,
        "referencia_es_terreno_natural": ref_es_terreno,
        "delta": delta,
        "dentro_tolerancia": dentro,
    }


def resumen_sectores_entrega(
    rasante: list[dict[str, Any]],
    grilla: list[dict[str, Any]],
    lecturas: list[dict[str, Any]],
    ordenadas_ref: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Resumen por tramo y abscisa: pendiente / parcial / entregado."""
    ordenadas_por_abscisa: dict[float, set[float]] = {}
    for g in grilla:
        pk = round(float(g["abscisa"]), 6)
        ordenadas_por_abscisa.setdefault(pk, set()).add(round(float(g["ordenada"]), 4))
    if ordenadas_ref and not ordenadas_por_abscisa:
        ref_set = {round(float(v), 4) for v in ordenadas_ref.values()}
        for g in grilla:
            pk = round(float(g["abscisa"]), 6)
            ordenadas_por_abscisa.setdefault(pk, set()).update(ref_set)

    lecturas_por_abscisa: dict[float, list[dict]] = {}
    for l in lecturas:
        pk = round(float(l["abscisa"]), 6)
        lecturas_por_abscisa.setdefault(pk, []).append(l)

    tramos: dict[str, dict[str, Any]] = {}
    abscisas_detalle: list[dict[str, Any]] = []

    for r in rasante:
        pk = round(float(r["abscisa"]), 6)
        tramo = (r.get("tramo") or "Sin tramo").strip() or "Sin tramo"
        if tramo not in tramos:
            tramos[tramo] = {
                "tramo": tramo,
                "abscisas_total": 0,
                "abscisas_medidas": 0,
                "abscisas_completas": 0,
                "abscisas_pendientes": 0,
            }
        tramos[tramo]["abscisas_total"] += 1

        target = ordenadas_por_abscisa.get(pk, set())
        lec = lecturas_por_abscisa.get(pk, [])
        n_medidas = len(lec)
        n_ok = sum(
            1 for x in lec
            if x.get("dentro_tolerancia") is True
            or (x.get("dentro_tolerancia") is None and x.get("cota_campo") is not None)
        )
        ordenadas_medidas = {round(float(x["ordenada"]), 4) for x in lec}
        completa = bool(target) and target.issubset(ordenadas_medidas) and n_ok == len(lec) and len(lec) == len(target)

        if n_medidas == 0:
            estado = "pendiente"
            tramos[tramo]["abscisas_pendientes"] += 1
        elif completa:
            estado = "entregado"
            tramos[tramo]["abscisas_completas"] += 1
            tramos[tramo]["abscisas_medidas"] += 1
        else:
            estado = "parcial"
            tramos[tramo]["abscisas_medidas"] += 1

        abscisas_detalle.append({
            "tramo": tramo,
            "abscisa": r["abscisa"],
            "estado": estado,
            "puntos_diseno": len(target),
            "puntos_medidos": n_medidas,
            "puntos_ok": n_ok,
        })

    lista_tramos = list(tramos.values())
    tot = sum(t["abscisas_total"] for t in lista_tramos)
    completas = sum(t["abscisas_completas"] for t in lista_tramos)
    pendientes = sum(t["abscisas_pendientes"] for t in lista_tramos)
    parciales = tot - completas - pendientes

    return {
        "tramos": lista_tramos,
        "abscisas": abscisas_detalle,
        "totales": {
            "abscisas": tot,
            "entregadas": completas,
            "parciales": parciales,
            "pendientes": pendientes,
            "avance_pct": round(100.0 * completas / tot, 1) if tot else 0.0,
        },
    }


def info_sector_rango(
    rasante: list[dict[str, Any]],
    abscisa_desde: float | None,
    abscisa_hasta: float | None,
) -> dict[str, Any]:
    """Tramos y abscisas que intersectan el rango indicado."""
    filtrado = filtrar_rasante_rango(rasante, abscisa_desde, abscisa_hasta)
    tramos: dict[str, dict[str, Any]] = {}
    for r in filtrado:
        tr = (r.get("tramo") or "Sin tramo").strip() or "Sin tramo"
        pk = float(r["abscisa"])
        if tr not in tramos:
            tramos[tr] = {"tramo": tr, "abscisa_min": pk, "abscisa_max": pk, "abscisas": 0}
        t = tramos[tr]
        t["abscisa_min"] = min(t["abscisa_min"], pk)
        t["abscisa_max"] = max(t["abscisa_max"], pk)
        t["abscisas"] += 1
    return {
        "tramos": list(tramos.values()),
        "abscisas_en_rango": len(filtrado),
        "abscisa_desde_efectiva": filtrado[0]["abscisa"] if filtrado else abscisa_desde,
        "abscisa_hasta_efectiva": filtrado[-1]["abscisa"] if filtrado else abscisa_hasta,
    }


def abscisas_referencia_en_rango(
    grilla: list[dict[str, Any]],
    abscisa_desde: float | None = None,
    abscisa_hasta: float | None = None,
) -> list[float]:
    """Abscisas únicas (solo puntos de referencia) dentro del rango."""
    seen: set[float] = set()
    out: list[float] = []
    for g in grilla:
        if not g.get("es_referencia"):
            continue
        pk = float(g["abscisa"])
        if abscisa_desde is not None and pk < float(abscisa_desde) - 1e-9:
            continue
        if abscisa_hasta is not None and pk > float(abscisa_hasta) + 1e-9:
            continue
        key = round(pk, 6)
        if key in seen:
            continue
        seen.add(key)
        out.append(pk)
    out.sort()
    return out


def bloque_aplicable_abscisa(bloques: list[dict[str, Any]], abscisa: float) -> dict[str, Any] | None:
    """Bloque de instrumento vigente en la abscisa (último con abscisa_inicio <= abscisa)."""
    if not bloques:
        return None
    ordenados = sorted(
        bloques,
        key=lambda b: (
            float(b["abscisa_inicio"]) if b.get("abscisa_inicio") is not None else -1e18,
            int(b.get("orden") or 0),
        ),
    )
    aplicable = None
    for b in ordenados:
        inicio = b.get("abscisa_inicio")
        if inicio is None or float(inicio) <= float(abscisa) + 1e-9:
            aplicable = b
    return aplicable


def altura_instrumento_desde_bloque(bloque: dict[str, Any] | None) -> float | None:
    """HI persistida o derivada de cota de punto + V+."""
    if not bloque:
        return None
    hi = bloque.get("altura_instrumento")
    if hi is not None:
        return float(hi)
    cota = bloque.get("cota_punto")
    v_mas = bloque.get("v_mas")
    if cota is not None and v_mas is not None:
        return float(cota) + float(v_mas)
    return None


def es_inicio_bloque(bloque: dict[str, Any] | None, abscisa: float) -> bool:
    if not bloque:
        return False
    inicio = bloque.get("abscisa_inicio")
    if inicio is None:
        return int(bloque.get("orden") or 1) == 1
    return abs(float(inicio) - float(abscisa)) < 1e-6


def mapa_cota_campo_lecturas(lecturas: list[dict[str, Any]]) -> dict[tuple[float, float], float]:
    """Mapa (abscisa, ordenada) → cota de campo."""
    out: dict[tuple[float, float], float] = {}
    for l in lecturas:
        if l.get("cota_campo") is None:
            continue
        key = (round(float(l["abscisa"]), 6), round(float(l["ordenada"]), 4))
        out[key] = float(l["cota_campo"])
    return out


def cota_campo_ref_interp(
    lecturas_map: dict[tuple[float, float], float],
    abscisa: float,
    ordenada: float,
) -> float | None:
    """Cota de referencia de campo; interpola en ordenada si no hay lectura exacta."""
    pk = round(float(abscisa), 6)
    lk = round(float(ordenada), 4)
    direct = lecturas_map.get((pk, lk))
    if direct is not None:
        return direct
    pts: list[tuple[float, float]] = []
    for (a, o), c in lecturas_map.items():
        if a == pk:
            pts.append((float(o), float(c)))
    return _interp_lineal(pts, float(ordenada))


def cota_diseno_interp_grilla(
    grilla: list[dict[str, Any]] | None,
    abscisa: float,
    ordenada: float,
) -> float | None:
    """Cota de diseño en abscisa/ordenada; interpola si la grilla no tiene ese offset."""
    if not grilla:
        return None
    pk = round(float(abscisa), 6)
    lk = round(float(ordenada), 4)
    for g in grilla:
        if round(float(g["abscisa"]), 6) == pk and round(float(g["ordenada"]), 4) == lk:
            v = g.get("cota_diseno")
            return float(v) if v is not None else None
    pts: list[tuple[float, float]] = []
    for g in grilla:
        if round(float(g["abscisa"]), 6) != pk:
            continue
        v = g.get("cota_diseno")
        if v is not None:
            pts.append((float(g["ordenada"]), float(v)))
    return _interp_lineal(pts, float(ordenada))


def filas_matriz_entrega(
    grilla: list[dict[str, Any]],
    lecturas: list[dict[str, Any]],
    ordenadas_ref: dict[str, float],
    abscisa_desde: float | None = None,
    abscisa_hasta: float | None = None,
    bloques: list[dict[str, Any]] | None = None,
    grilla_ref: list[dict[str, Any]] | None = None,
    lecturas_ref_campo: dict[tuple[float, float], float] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Filas de matriz por abscisa y columnas transversales (incluye intermedias)."""
    ordenadas_cols = ordenadas_transversales(grilla)
    abscisas = abscisas_referencia_en_rango(grilla, abscisa_desde, abscisa_hasta)
    lect_por_abscisa: dict[float, list[dict]] = {}
    for l in lecturas:
        pk = round(float(l["abscisa"]), 6)
        lect_por_abscisa.setdefault(pk, []).append(l)

    filas: list[dict[str, Any]] = []
    for ab in abscisas:
        pk = round(ab, 6)
        dis = diseno_fila_por_ordenadas(grilla, ab)
        dis_ref = diseno_fila_por_ordenadas(grilla_ref, ab) if grilla_ref else {"diseno": {}}
        lec = lect_por_abscisa.get(pk, [])
        by_ord: dict[float, dict] = {round(float(x["ordenada"]), 4): x for x in lec}
        terreno: dict[str, Any] = {}
        diff: dict[str, Any] = {}
        diseno: dict[str, Any] = dis.get("diseno") or {}
        fondo_diseno: dict[str, Any] = {}
        ref_campo: dict[str, Any] = {}
        referencia: dict[str, Any] = {}
        ref_dis_base = dis_ref.get("diseno") or {}
        for col in ordenadas_cols:
            key = col["key"]
            ord_v = col["ordenada"]
            lk = round(float(ord_v), 4)
            ref_g = _lookup_diseno(grilla, ab, ord_v)
            if ref_g and ref_g.get("cota_fondo_diseno") is not None:
                fondo_diseno[key] = ref_g.get("cota_fondo_diseno")
            if lecturas_ref_campo is not None:
                ref_campo[key] = cota_campo_ref_interp(lecturas_ref_campo, ab, ord_v)
            ref_val = ref_dis_base.get(key)
            if ref_val is None and grilla_ref:
                ref_val = cota_diseno_interp_grilla(grilla_ref, ab, ord_v)
            referencia[key] = ref_val
            row = by_ord.get(lk)
            terreno[key] = {
                "ordenada": ord_v,
                "vi": row.get("lectura_mira") if row else None,
                "cota": row.get("cota_campo") if row else None,
                "lectura_id": row.get("id") if row else None,
            }
            diff[key] = row.get("delta") if row else None
        bloque = bloque_aplicable_abscisa(bloques or [], ab) if bloques else None
        hi_bloque = altura_instrumento_desde_bloque(bloque)
        filas.append({
            "tramo": dis.get("tramo"),
            "abscisa": ab,
            "diseno": diseno,
            "fondo_diseno": fondo_diseno,
            "referencia": referencia,
            "referencia_campo": ref_campo,
            "terreno": terreno,
            "diferencia": diff,
            "bloque_id": bloque.get("id") if bloque else (lec[0].get("bloque_id") if lec else None),
            "instrumento": {
                "bloque_id": bloque.get("id") if bloque else None,
                "es_cambio": es_inicio_bloque(bloque, ab),
                "punto_biblioteca_id": bloque.get("punto_biblioteca_id") if bloque else None,
                "nombre_punto": bloque.get("nombre_punto") if bloque else None,
                "v_mas": bloque.get("v_mas") if bloque else None,
                "altura_instrumento": hi_bloque,
                "cota_punto": bloque.get("cota_punto") if bloque else None,
            },
        })
    return filas, ordenadas_cols
