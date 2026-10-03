"""
Motor único de auditoría de traslapos / vacíos / no-auditable (SicoeObra).

Misma semántica que el frontend (`sicoeAuditoriaTraslapos.js`):
- Lineal: mismo ítem + tramo + infraestructura + costado; abscisas.
  Si ambos tienen sector y difiere → no se considera traslapo entre ellos.
- Puntual: mismo ítem + mismo pk_id_id.
- Tolerancia (m) para traslapos y vacíos lineales; default 0,50; mínimo 0,10.
- No bloquea: solo produce hallazgos + semáforo.
- Ambiente de Auditoría: `analizar_contrato` deduplica por fingerprint.
"""
from __future__ import annotations

import hashlib
import math
from typing import Any, Dict, List, Optional, Tuple

SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M = 0.50
SICOE_AUDITORIA_TOLERANCIA_MIN_M = 0.10

SICOE_AUDITORIA_JUSTIFICACIONES = (
    "Sector diferente",
    "Capa o nivel diferente",
    "Elemento paralelo en el mismo sitio",
    "Reposición o reproceso",
    "Complemento de un cobro parcial",
)

SICOE_AUDITORIA_JUSTIFICACIONES_VACIO = (
    "No ejecutado aún",
    "El ítem no aplica en ese tramo",
    "Ejecutado, pendiente de reportar",
    "Cobrado en otro ítem",
)

SICOE_AUDITORIA_ESTADOS = ("pendiente", "justificado", "corregido")

SICOE_AUDITORIA_ACCION_LOG = "AUDITORIA_TRASLAPO"
SICOE_AUDITORIA_HALLAZGO_ACCION_LOG = "AUDITORIA_HALLAZGO"


def normalizar_tolerancia_m(raw: Any) -> float:
    if raw is None or raw == "":
        return SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M
    if not math.isfinite(v):
        return SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M
    return max(SICOE_AUDITORIA_TOLERANCIA_MIN_M, v)


def parse_abs_num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def _txt(v: Any) -> str:
    return str(v or "").strip()


def costado_de(reg: dict) -> str:
    """Costado: calzada (Excel) o margen (legado)."""
    return _txt(reg.get("calzada") or reg.get("margen")).casefold()


def sector_de(reg: dict) -> str:
    return _txt(reg.get("sector")).casefold()


def modo_comparacion(reg: dict) -> str:
    a0 = parse_abs_num(reg.get("abs_inicio"))
    a1 = parse_abs_num(reg.get("abs_final"))
    if a0 is not None and a1 is not None:
        return "lineal"
    if reg.get("pk_id_id") is not None and str(reg.get("pk_id_id")).strip() != "":
        return "puntual"
    return "no_auditable"


def clave_grupo_lineal(reg: dict) -> str:
    return "\u0001".join(
        [
            _txt(reg.get("item_numero")),
            _txt(reg.get("tramo")).casefold(),
            _txt(reg.get("infraestructura")).casefold(),
            costado_de(reg),
        ]
    )


def clave_grupo_puntual(reg: dict) -> str:
    return "\u0001".join([_txt(reg.get("item_numero")), str(reg.get("pk_id_id"))])


def _intervalo(a0: float, a1: float) -> Tuple[float, float]:
    return (min(a0, a1), max(a0, a1))


def medida_traslapo(a0: float, a1: float, b0: float, b1: float) -> float:
    lo_a, hi_a = _intervalo(a0, a1)
    lo_b, hi_b = _intervalo(b0, b1)
    return max(0.0, min(hi_a, hi_b) - max(lo_a, lo_b))


def sectores_separan(a: dict, b: dict) -> bool:
    sa, sb = sector_de(a), sector_de(b)
    return bool(sa and sb and sa != sb)


def costo_directo_parcial(cantidad_total: Any, vlr_unitario: Any, fraccion: float) -> float:
    try:
        q = float(cantidad_total or 0)
        vu = float(vlr_unitario or 0)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(q) or not math.isfinite(vu) or q == 0 or vu == 0:
        return 0.0
    try:
        frac = float(fraccion or 0)
    except (TypeError, ValueError):
        frac = 0.0
    frac = max(0.0, min(1.0, frac))
    q_red = round(q * 100) / 100
    return float(round(q_red * frac * vu, 0))


def fmt_abscisa_k(v: Any) -> str:
    n = parse_abs_num(v)
    if n is None:
        return "—"
    km = int(math.trunc(n / 1000))
    m = abs(n - km * 1000)
    m_r = round(m * 100) / 100
    if abs(m_r - round(m_r)) < 1e-9:
        m_str = str(int(round(m_r)))
    else:
        m_str = f"{m_r:.2f}".rstrip("0").rstrip(".").replace(".", ",")
    return f"K{km}+{m_str}"


def fmt_medida_m(v: float) -> str:
    r = round(float(v) * 100) / 100
    if abs(r - round(r)) < 1e-9:
        return f"{int(round(r))}"
    return f"{r:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def fmt_valor_cop(v: float) -> str:
    n = int(round(float(v or 0)))
    s = f"{n:,}".replace(",", ".")
    return f"${s}"


def _numero_reg(reg: dict) -> Any:
    return reg.get("numero_registro") if reg.get("numero_registro") is not None else reg.get("id")


def _texto_hallazgo(
    tipo: str,
    medida: Optional[float],
    abs_desde: Optional[float],
    abs_hasta: Optional[float],
    regs_involucrados: List[dict],
    valor: float,
) -> str:
    partes = []
    if tipo == "traslapo":
        partes.append(f"Traslapo {fmt_medida_m(medida or 0)} m")
    elif tipo == "vacio":
        partes.append(f"Vacío {fmt_medida_m(medida or 0)} m")
    else:
        partes.append("No auditable")

    if abs_desde is not None and abs_hasta is not None:
        partes.append(f"{fmt_abscisa_k(abs_desde)} a {fmt_abscisa_k(abs_hasta)}")

    nums = []
    for r in regs_involucrados:
        n = _numero_reg(r)
        if n is not None and n != "":
            nums.append(str(n))
    if nums:
        partes.append("Reg. " + ", ".join(nums))

    if tipo == "traslapo" and valor:
        partes.append(fmt_valor_cop(valor))
    elif tipo == "no_auditable":
        partes.append("faltan datos de ubicación")

    return " · ".join(partes)


def _hallazgo(
    tipo: str,
    medida: Optional[float],
    abs_desde: Optional[float],
    abs_hasta: Optional[float],
    candidato: dict,
    otros: List[dict],
    valor: float,
) -> dict:
    involucrados = [candidato] + list(otros)
    return {
        "tipo": tipo,
        "medida_m": None if medida is None else round(float(medida), 4),
        "abs_desde": abs_desde,
        "abs_hasta": abs_hasta,
        "valor_en_juego": float(valor or 0),
        "texto": _texto_hallazgo(tipo, medida, abs_desde, abs_hasta, involucrados[1:] or involucrados, valor),
        "registros_involucrados": [
            _snapshot_involucrado(r)
            for r in involucrados
            if r is not None
        ],
    }


def _snapshot_involucrado(r: dict) -> dict:
    """Campos comparables del registro para detalle de hallazgo."""
    if not r:
        return {}
    cant = r.get("cantidad_total")
    try:
        cant_n = float(cant) if cant is not None else None
    except (TypeError, ValueError):
        cant_n = None
    vu = r.get("vlr_unitario")
    try:
        vu_n = float(vu) if vu is not None else None
    except (TypeError, ValueError):
        vu_n = None
    valor = None
    if cant_n is not None and vu_n is not None:
        valor = round(cant_n * vu_n, 2)
    return {
        "id": r.get("id"),
        "numero_registro": r.get("numero_registro"),
        "reporte_id": r.get("reporte_id"),
        "numero_reporte": r.get("numero_reporte"),
        "item_numero": r.get("item_numero"),
        "tramo": r.get("tramo"),
        "infraestructura": r.get("infraestructura"),
        "costado": _txt(r.get("calzada") or r.get("margen") or r.get("costado")),
        "pk_id_id": r.get("pk_id_id"),
        "abs_inicio": r.get("abs_inicio"),
        "abs_final": r.get("abs_final"),
        "cantidad_total": cant_n,
        "vlr_unitario": vu_n,
        "valor": valor if valor is not None else r.get("valor"),
        "usuario_nombre": r.get("usuario_nombre") or r.get("creado_por_nombre"),
        "fecha": r.get("fecha") or r.get("created_at") or r.get("fecha_registro"),
    }


def analizar_candidato_contra_pares(
    candidato: dict,
    pares: List[dict],
    *,
    tolerancia_m: float = SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M,
) -> dict:
    """
    Analiza un registro (candidato, con el ítem que se está asignando)
    contra pares del mismo ítem en el contrato.
    """
    tol = normalizar_tolerancia_m(tolerancia_m)
    cand_id = candidato.get("id")
    item = _txt(candidato.get("item_numero"))
    if not item:
        return {
            "semaforo": "amarillo",
            "hallazgos": [
                _hallazgo("no_auditable", None, None, None, candidato, [], 0),
            ],
            "modo": "no_auditable",
        }

    modo = modo_comparacion(candidato)
    if modo == "no_auditable":
        return {
            "semaforo": "amarillo",
            "hallazgos": [_hallazgo("no_auditable", None, None, None, candidato, [], 0)],
            "modo": modo,
        }

    peers = [
        p
        for p in (pares or [])
        if p is not None
        and _txt(p.get("item_numero")) == item
        and (cand_id is None or str(p.get("id")) != str(cand_id))
    ]

    hallazgos: List[dict] = []

    if modo == "puntual":
        pk = candidato.get("pk_id_id")
        mismos = [p for p in peers if str(p.get("pk_id_id")) == str(pk) and modo_comparacion(p) == "puntual"]
        for p in mismos:
            hallazgos.append(
                _hallazgo(
                    "traslapo",
                    None,
                    None,
                    None,
                    candidato,
                    [p],
                    costo_directo_parcial(
                        candidato.get("cantidad_total"),
                        candidato.get("vlr_unitario"),
                        1.0,
                    ),
                )
            )
            # texto puntual: sin abscisas
            hallazgos[-1]["texto"] = (
                f"Traslapo puntual · mismo PK · Reg. {_numero_reg(p)}"
                + (
                    f" · {fmt_valor_cop(hallazgos[-1]['valor_en_juego'])}"
                    if hallazgos[-1]["valor_en_juego"]
                    else ""
                )
            )
    else:
        # lineal
        a0 = parse_abs_num(candidato.get("abs_inicio"))
        a1 = parse_abs_num(candidato.get("abs_final"))
        assert a0 is not None and a1 is not None
        lo_c, hi_c = _intervalo(a0, a1)
        long_c = hi_c - lo_c

        grupo_c = clave_grupo_lineal(candidato)
        del_grupo = []
        for p in peers:
            if modo_comparacion(p) != "lineal":
                continue
            if clave_grupo_lineal(p) != grupo_c:
                continue
            if sectores_separan(candidato, p):
                continue
            b0 = parse_abs_num(p.get("abs_inicio"))
            b1 = parse_abs_num(p.get("abs_final"))
            if b0 is None or b1 is None:
                continue
            del_grupo.append(p)

            ov = medida_traslapo(a0, a1, b0, b1)
            if ov >= tol:
                frac = (ov / long_c) if long_c > 1e-9 else 1.0
                valor = costo_directo_parcial(
                    candidato.get("cantidad_total"),
                    candidato.get("vlr_unitario"),
                    frac,
                )
                lo_o = max(lo_c, min(b0, b1))
                hi_o = min(hi_c, max(b0, b1))
                hallazgos.append(
                    _hallazgo("traslapo", ov, lo_o, hi_o, candidato, [p], valor)
                )

        # Vacíos: huecos entre tramos ya reportados del mismo grupo (incluye candidato)
        segs = []
        for p in del_grupo + [candidato]:
            x0 = parse_abs_num(p.get("abs_inicio"))
            x1 = parse_abs_num(p.get("abs_final"))
            if x0 is None or x1 is None:
                continue
            lo, hi = _intervalo(x0, x1)
            segs.append({"lo": lo, "hi": hi, "reg": p})
        segs.sort(key=lambda s: (s["lo"], s["hi"], str(s["reg"].get("id") or "")))

        # Fusionar solapes para detectar huecos reales entre cubierta
        covered: List[Tuple[float, float, dict]] = []
        for s in segs:
            if not covered:
                covered.append((s["lo"], s["hi"], s["reg"]))
                continue
            plo, phi, preg = covered[-1]
            if s["lo"] <= phi + 1e-12:
                # solape o contiguo: extender
                if s["hi"] > phi:
                    covered[-1] = (plo, s["hi"], s["reg"])
            else:
                gap = s["lo"] - phi
                if gap >= tol:
                    # vacío entre phi y s["lo"]; involucra el seg anterior y el actual
                    hallazgos.append(
                        _hallazgo(
                            "vacio",
                            gap,
                            phi,
                            s["lo"],
                            candidato,
                            [preg, s["reg"]],
                            0.0,
                        )
                    )
                covered.append((s["lo"], s["hi"], s["reg"]))

    tiene_rojo = any(h["tipo"] == "traslapo" for h in hallazgos)
    tiene_amarillo = any(h["tipo"] in ("vacio", "no_auditable") for h in hallazgos)
    if tiene_rojo:
        semaforo = "rojo"
    elif tiene_amarillo:
        semaforo = "amarillo"
    else:
        semaforo = "verde"

    return {
        "semaforo": semaforo,
        "hallazgos": hallazgos,
        "modo": modo,
        "tolerancia_m": tol,
        "item_numero": item,
        "registro_id": cand_id,
        "numero_registro": candidato.get("numero_registro"),
    }


def analizar_varios(
    candidatos: List[dict],
    pares_por_item: Dict[str, List[dict]],
    *,
    tolerancia_m: float = SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M,
) -> dict:
    resultados = []
    cont = {"verde": 0, "amarillo": 0, "rojo": 0, "traslapo": 0, "vacio": 0, "no_auditable": 0}
    for c in candidatos or []:
        item = _txt(c.get("item_numero"))
        pares = pares_por_item.get(item) or []
        # Incluir otros candidatos del mismo ítem como pares (asignación en lote)
        otros_cand = [
            x
            for x in (candidatos or [])
            if x is not c and _txt(x.get("item_numero")) == item
        ]
        r = analizar_candidato_contra_pares(
            c, list(pares) + otros_cand, tolerancia_m=tolerancia_m
        )
        resultados.append(r)
        cont[r["semaforo"]] = cont.get(r["semaforo"], 0) + 1
        for h in r.get("hallazgos") or []:
            t = h.get("tipo")
            if t in cont:
                cont[t] += 1
    if cont["rojo"]:
        semaforo_global = "rojo"
    elif cont["amarillo"]:
        semaforo_global = "amarillo"
    else:
        semaforo_global = "verde"
    return {
        "semaforo": semaforo_global,
        "resumen": cont,
        "resultados": resultados,
        "tolerancia_m": normalizar_tolerancia_m(tolerancia_m),
    }


def usuario_ve_auditoria_traslapos(current_user: Optional[dict]) -> bool:
    """Solo roles de contratista (no interventoría). Dev/admin sí ven (operan como contratista)."""
    if not current_user:
        return False
    rn = _txt(current_user.get("rol_nombre") or current_user.get("rol")).casefold()
    rn = " ".join(rn.split())
    if "intervent" in rn:
        return False
    return True


def justificaciones_para_tipo(tipo: str) -> Tuple[str, ...]:
    t = _txt(tipo).casefold()
    if t == "vacio":
        return SICOE_AUDITORIA_JUSTIFICACIONES_VACIO
    if t == "ubicacion_inconsistente":
        from sicoe_eje_franjas import SICOE_AUDITORIA_JUSTIFICACIONES_UBICACION
        return SICOE_AUDITORIA_JUSTIFICACIONES_UBICACION
    if t == "costado_inconsistente":
        from sicoe_eje_franjas import SICOE_AUDITORIA_JUSTIFICACIONES_COSTADO
        return SICOE_AUDITORIA_JUSTIFICACIONES_COSTADO
    if t == "cantidad_mayor_area":
        from sicoe_huellas_espacial import SICOE_AUDITORIA_JUSTIFICACIONES_CANTIDAD_AREA
        return SICOE_AUDITORIA_JUSTIFICACIONES_CANTIDAD_AREA
    if t == "traslapo":
        return SICOE_AUDITORIA_JUSTIFICACIONES
    # no_auditable: permite justificar con lista de traslapo (dato incompleto)
    return SICOE_AUDITORIA_JUSTIFICACIONES

def _abs_key(v: Any) -> str:
    n = parse_abs_num(v)
    if n is None:
        return ""
    return f"{round(n, 3):.3f}"


def fingerprint_hallazgo(h: dict) -> str:
    """Huella estable para persistir / sincronizar hallazgos del contrato."""
    tipo = _txt(h.get("tipo")).casefold()
    ids = sorted(
        {
            str(r.get("id"))
            for r in (h.get("registros_involucrados") or [])
            if r is not None and r.get("id") is not None and str(r.get("id")).strip() != ""
        }
    )
    raw = "|".join(
        [
            tipo,
            ",".join(ids),
            _abs_key(h.get("abs_desde")),
            _abs_key(h.get("abs_hasta")),
            _txt(h.get("item_numero")),
            _txt(h.get("pk_id_id")),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def _dedupe_involucrados(regs: List[dict]) -> List[dict]:
    seen = set()
    out: List[dict] = []
    for r in regs or []:
        if r is None:
            continue
        rid = r.get("id")
        key = str(rid) if rid is not None else f"tmp:{id(r)}"
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    out.sort(key=lambda x: (str(x.get("id") or ""), str(x.get("numero_registro") or "")))
    return out


def canonizar_hallazgo(h: dict, regs_by_id: Optional[Dict[Any, dict]] = None) -> dict:
    """Normaliza involucrados y rellena columnas de informe (ítem, tramo, etc.)."""
    inv = _dedupe_involucrados(list(h.get("registros_involucrados") or []))
    base = dict(h)
    enriched_inv = []
    for r in inv:
        src = dict(r or {})
        rid = src.get("id")
        if regs_by_id and rid is not None:
            full = regs_by_id.get(rid) or regs_by_id.get(str(rid))
            if full:
                merged = dict(full)
                # Campos ya enriquecidos en el snapshot (reporte/usuario/fecha) prevalecen
                for k in ("numero_reporte", "usuario_nombre", "fecha", "creado_por_nombre"):
                    if src.get(k) is not None:
                        merged[k] = src[k]
                src = merged
        enriched_inv.append(_snapshot_involucrado(src))
    base["registros_involucrados"] = enriched_inv

    meta_src = None
    if regs_by_id:
        for r in inv:
            rid = r.get("id")
            if rid is not None and rid in regs_by_id:
                meta_src = regs_by_id[rid]
                break
            if rid is not None and str(rid) in regs_by_id:
                meta_src = regs_by_id[str(rid)]
                break
    if meta_src is None and inv:
        meta_src = inv[0]

    if meta_src:
        base.setdefault("item_numero", _txt(meta_src.get("item_numero")))
        base.setdefault("tramo", _txt(meta_src.get("tramo")))
        base.setdefault("infraestructura", _txt(meta_src.get("infraestructura")))
        base.setdefault(
            "costado",
            _txt(meta_src.get("calzada") or meta_src.get("margen")),
        )
        if meta_src.get("pk_id_id") is not None:
            base.setdefault("pk_id_id", meta_src.get("pk_id_id"))

    abs_d = base.get("abs_desde")
    abs_h = base.get("abs_hasta")
    if abs_d is not None and abs_h is not None:
        base["ubicacion"] = f"{fmt_abscisa_k(abs_d)} – {fmt_abscisa_k(abs_h)}"
    elif base.get("pk_id_id") is not None and str(base.get("pk_id_id")).strip() != "":
        base["ubicacion"] = f"PK {base.get('pk_id_id')}"
    else:
        base["ubicacion"] = "—"

    base["fingerprint"] = fingerprint_hallazgo(base)
    return base


def analizar_contrato(
    registros: List[dict],
    *,
    tolerancia_m: float = SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M,
) -> dict:
    """
    Análisis de todos los registros del contrato con el mismo motor de asignación.
    Deduplica hallazgos por fingerprint (evita contar A↔B dos veces).
    """
    tol = normalizar_tolerancia_m(tolerancia_m)
    by_item: Dict[str, List[dict]] = {}
    regs_by_id: Dict[Any, dict] = {}
    for r in registros or []:
        if r is None:
            continue
        rid = r.get("id")
        if rid is not None:
            regs_by_id[rid] = r
            regs_by_id[str(rid)] = r
        item = _txt(r.get("item_numero"))
        if not item:
            continue
        by_item.setdefault(item, []).append(r)

    hall_map: Dict[str, dict] = {}
    for item, regs in by_item.items():
        for cand in regs:
            res = analizar_candidato_contra_pares(cand, regs, tolerancia_m=tol)
            for h in res.get("hallazgos") or []:
                canon = canonizar_hallazgo(h, regs_by_id)
                # Asegura item_numero del candidato
                if not canon.get("item_numero"):
                    canon["item_numero"] = item
                fp = canon["fingerprint"]
                prev = hall_map.get(fp)
                if prev is None:
                    hall_map[fp] = canon
                else:
                    # Conserva el mayor valor en juego (mismo hallazgo visto desde otro registro)
                    if float(canon.get("valor_en_juego") or 0) > float(prev.get("valor_en_juego") or 0):
                        prev["valor_en_juego"] = canon["valor_en_juego"]
                        prev["texto"] = canon.get("texto") or prev.get("texto")
                    # Une metadatos de ubicación de registros
                    prev_ids = {str(x.get("id")) for x in (prev.get("registros_involucrados") or [])}
                    for r in canon.get("registros_involucrados") or []:
                        if str(r.get("id")) not in prev_ids:
                            prev["registros_involucrados"].append(r)
                            prev_ids.add(str(r.get("id")))

    hallazgos = list(hall_map.values())
    hallazgos.sort(
        key=lambda h: (
            -float(h.get("valor_en_juego") or 0),
            _txt(h.get("tipo")),
            _txt(h.get("item_numero")),
            float(h.get("abs_desde") or 0),
        )
    )

    resumen = {
        "traslapo": 0,
        "vacio": 0,
        "no_auditable": 0,
        "valor_traslapo": 0.0,
        "valor_vacio": 0.0,
        "valor_no_auditable": 0.0,
        "total": len(hallazgos),
    }
    for h in hallazgos:
        t = h.get("tipo")
        v = float(h.get("valor_en_juego") or 0)
        if t in resumen:
            resumen[t] += 1
            resumen[f"valor_{t}"] = float(resumen.get(f"valor_{t}") or 0) + v

    if resumen["traslapo"]:
        semaforo = "rojo"
    elif resumen["vacio"] or resumen["no_auditable"]:
        semaforo = "amarillo"
    else:
        semaforo = "verde"

    return {
        "semaforo": semaforo,
        "hallazgos": hallazgos,
        "resumen": resumen,
        "tolerancia_m": tol,
    }


def resumen_ambiente_desde_filas(filas: List[dict]) -> dict:
    """
    Resumen del ambiente: traslapos/vacíos sin justificar, no auditables,
    inconsistencias de ubicación/costado y justificados.
    """
    out = {
        "traslapos_sin_justificar": {"cantidad": 0, "valor": 0.0},
        "vacios_sin_justificar": {"cantidad": 0, "valor": 0.0},
        "no_auditables": {"cantidad": 0, "valor": 0.0},
        "inconsistencias": {"cantidad": 0, "valor": 0.0},
        "justificados": {"cantidad": 0, "valor": 0.0},
    }
    for f in filas or []:
        estado = _txt(f.get("estado")).casefold() or "pendiente"
        if estado == "corregido":
            continue
        tipo = _txt(f.get("tipo")).casefold()
        valor = float(f.get("valor_en_juego") or 0)
        if estado == "justificado":
            out["justificados"]["cantidad"] += 1
            out["justificados"]["valor"] += valor
            continue
        if tipo == "traslapo":
            out["traslapos_sin_justificar"]["cantidad"] += 1
            out["traslapos_sin_justificar"]["valor"] += valor
        elif tipo == "vacio":
            out["vacios_sin_justificar"]["cantidad"] += 1
            out["vacios_sin_justificar"]["valor"] += valor
        elif tipo == "no_auditable":
            out["no_auditables"]["cantidad"] += 1
            out["no_auditables"]["valor"] += valor
        elif tipo in ("ubicacion_inconsistente", "costado_inconsistente", "cantidad_mayor_area"):
            out["inconsistencias"]["cantidad"] += 1
            out["inconsistencias"]["valor"] += valor
    return out
