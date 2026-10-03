"""
Motor único de auditoría de traslapos / vacíos / no-auditable (SicoeObra).

Misma semántica que el frontend (`sicoeAuditoriaTraslapos.js`):
- Lineal: mismo ítem + tramo + infraestructura + costado; abscisas.
  Si ambos tienen sector y difiere → no se considera traslapo entre ellos.
- Puntual: mismo ítem + mismo pk_id_id.
- Tolerancia (m) para traslapos y vacíos lineales; default 0,50; mínimo 0,10.
- No bloquea: solo produce hallazgos + semáforo.
"""
from __future__ import annotations

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

SICOE_AUDITORIA_ACCION_LOG = "AUDITORIA_TRASLAPO"


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
            {
                "id": r.get("id"),
                "numero_registro": r.get("numero_registro"),
                "reporte_id": r.get("reporte_id"),
                "item_numero": r.get("item_numero"),
            }
            for r in involucrados
            if r is not None
        ],
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
