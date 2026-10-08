"""
Cálculo único de valor SicoeObra / Informes + control de integridad vs listado.

Regla canónica (única fuente):
  1. Registros al nivel de filtro aplicado.
  2. Por (capítulo, ítem): cant = ROUND(Σ cantidad_total, 2).
  3. valor = ROUND(cant × VU_listado(mismo cap+ítem), 0).
  4. Total = Σ valores por ítem (nunca Σ costo_directo almacenado).

Integridad (no modifica datos; solo detecta):
  - sin_capitulo / sin_item
  - cap_item_ausente_en_listado
  - vu_guardado_distinto_listado
  - cd_guardado_distinto_cant_x_vu
"""
from __future__ import annotations

import math
import re
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

CapItemKey = Tuple[str, str]

TIPOS_INCONSISTENCIA = (
    "sin_capitulo",
    "sin_item",
    "cap_item_ausente_en_listado",
    "vu_guardado_distinto_listado",
    "cd_guardado_distinto_cant_x_vu",
)

# Afectan totales canónicos (no hay VU listado / no se puede cruzar).
TIPOS_AFECTAN_TOTALES = frozenset(
    {
        "sin_capitulo",
        "sin_item",
        "cap_item_ausente_en_listado",
    }
)
# Valores stamp desactualizados: la plataforma ya recalcula con listado; no cambian el total canónico.
TIPOS_VALOR_GUARDADO_DESACTUALIZADO = frozenset(
    {
        "vu_guardado_distinto_listado",
        "cd_guardado_distinto_cant_x_vu",
    }
)

CASO_AFECTA_TOTALES = "afecta_totales"
CASO_VALOR_GUARDADO = "valor_guardado_desactualizado"


def _sf(n: Any, default: float = 0.0) -> float:
    if n is None or n == "":
        return float(default)
    try:
        x = float(n)
        if math.isnan(x) or math.isinf(x):
            return float(default)
        return x
    except (TypeError, ValueError):
        try:
            return float(str(n).replace(",", "").replace(" ", "").strip())
        except Exception:
            return float(default)


def round_cant(n: Any) -> float:
    return float(round(_sf(n), 2))


def round_valor(n: Any) -> float:
    return float(round(_sf(n), 0))


def valor_cant_vu(cantidad: Any, vlr_unitario: Any) -> float:
    """ROUND0(ROUND(cant, 2) × VU) — regla única plataforma / PDF / Excel."""
    return round_valor(round_cant(cantidad) * _sf(vlr_unitario))


def norm_item(s: Any) -> str:
    """Alinea so_registros.item_numero ↔ listado_precios.item_numero (p. ej. '4.22.' → '4.22')."""
    t = str(s if s is not None else "").strip()
    if not t:
        return ""
    # Quitar sufijos basura frecuentes: puntos finales y '._'
    t = re.sub(r"\._+$", "", t)
    t = re.sub(r"\.+$", "", t)
    return t.strip()


def norm_capitulo(s: Any) -> str:
    """Normaliza capítulo para cruce listado (colapsa espacios; alinea '1. CAP' vs '1.  CAP')."""
    t = str(s if s is not None else "").strip()
    if not t:
        return ""
    t = re.sub(r"\s+", " ", t)
    # Igual que dashboard: '1.  TEXTO' → '1.TEXTO' tras el número
    t = re.sub(r"^(\d+\.)\s+", r"\1", t)
    return t


def cap_item_key(capitulo: Any, item_numero: Any) -> CapItemKey:
    return (norm_capitulo(capitulo), norm_item(item_numero))


def load_listado_vu_by_cap_item(sb, contrato_id: int) -> Dict[CapItemKey, dict]:
    """
    Índice (capítulo_norm, ítem_norm) → {vlr_unitario, capitulo, item_numero, ...}.
    Duplicados: gana mayor id.
    """
    rows: List[dict] = []
    try:
        offset = 0
        while True:
            batch = (
                sb.table("listado_precios")
                .select(
                    "id, capitulo, item_numero, precio_unitario, unidad, descripcion, competencia, especificacion_tecnica"
                )
                .eq("contrato_id", int(contrato_id))
                .order("id")
                .range(offset, offset + 999)
                .execute()
                .data
            ) or []
            rows.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
    except Exception:
        return {}

    idx: Dict[CapItemKey, dict] = {}
    for r in rows:
        k = cap_item_key(r.get("capitulo"), r.get("item_numero"))
        if not k[1]:
            continue
        meta = {
            "id": r.get("id"),
            "capitulo": str(r.get("capitulo") or "").strip(),
            "item_numero": str(r.get("item_numero") or "").strip(),
            "vlr_unitario": _sf(r.get("precio_unitario")),
            "unidad": str(r.get("unidad") or "").strip(),
            "descripcion": str(r.get("descripcion") or "").strip(),
            "competencia": str(r.get("competencia") or "").strip(),
            "especificacion_tecnica": str(r.get("especificacion_tecnica") or "").strip(),
        }
        prev = idx.get(k)
        if prev is None or int(meta.get("id") or 0) >= int(prev.get("id") or 0):
            idx[k] = meta
    return idx


def vu_listado_para_registro(
    reg: dict,
    listado_idx: Optional[Dict[CapItemKey, dict]],
) -> Optional[float]:
    if not listado_idx:
        return None
    k = cap_item_key(reg.get("capitulo"), reg.get("item_numero"))
    meta = listado_idx.get(k)
    if not meta:
        return None
    vu = _sf(meta.get("vlr_unitario"))
    if vu <= 0:
        vu = _sf(meta.get("precio_unitario"))
    return vu if vu > 0 else None


def valor_linea_canonico(
    reg: Optional[dict],
    listado_idx: Optional[Dict[CapItemKey, dict]] = None,
) -> float:
    """
    Valor de un registro según regla única.
    Si no hay VU en listado para (cap, ítem) → 0 (no usa costo_directo guardado).
    """
    if not reg:
        return 0.0
    vu = vu_listado_para_registro(reg, listado_idx)
    if vu is None or vu <= 0:
        return 0.0
    return valor_cant_vu(reg.get("cantidad_total"), vu)


def agregar_cant_por_cap_item(
    regs: Iterable[dict],
    *,
    include: Optional[Callable[[dict], bool]] = None,
) -> Dict[CapItemKey, dict]:
    """Σ cantidad_total por (cap, ítem); cant redondeada a 2 dp al cerrar."""
    acc: Dict[CapItemKey, dict] = {}
    for reg in regs or []:
        if not isinstance(reg, dict):
            continue
        if include is not None and not include(reg):
            continue
        k = cap_item_key(reg.get("capitulo"), reg.get("item_numero"))
        if not k[1]:
            continue
        slot = acc.get(k)
        if slot is None:
            slot = {
                "capitulo": norm_capitulo(reg.get("capitulo")),
                "item_numero": norm_item(reg.get("item_numero")),
                "cant_sum": 0.0,
                "n_regs": 0,
                "registro_ids": [],
            }
            acc[k] = slot
        slot["cant_sum"] += _sf(reg.get("cantidad_total"))
        slot["n_regs"] += 1
        rid = reg.get("id")
        if rid is not None:
            slot["registro_ids"].append(rid)
    for slot in acc.values():
        slot["cant"] = round_cant(slot["cant_sum"])
    return acc


def valores_por_cap_item(
    regs: Iterable[dict],
    listado_idx: Dict[CapItemKey, dict],
    *,
    include: Optional[Callable[[dict], bool]] = None,
) -> Dict[CapItemKey, dict]:
    """Por (cap, ítem): cant 2dp, VU listado, valor Round0; flags sin listado."""
    aggs = agregar_cant_por_cap_item(regs, include=include)
    out: Dict[CapItemKey, dict] = {}
    for k, slot in aggs.items():
        meta = listado_idx.get(k) or {}
        vu = _sf(meta.get("vlr_unitario"))
        if vu <= 0:
            vu = _sf(meta.get("precio_unitario"))
        sin_listado = vu <= 0 or k not in listado_idx
        valor = 0.0 if sin_listado else valor_cant_vu(slot["cant"], vu)
        out[k] = {
            **slot,
            "vlr_unitario": vu if not sin_listado else None,
            "valor": valor,
            "sin_listado": sin_listado,
        }
    return out


def sum_valor_canonico(
    regs: Iterable[dict],
    listado_idx: Dict[CapItemKey, dict],
    *,
    include: Optional[Callable[[dict], bool]] = None,
) -> float:
    """Total = Σ valores por ítem (regla única). Ítems sin listado aportan 0 (avisar vía integridad)."""
    vals = valores_por_cap_item(regs, listado_idx, include=include)
    return round_valor(sum(_sf(v.get("valor")) for v in vals.values()))


@dataclass
class InconsistenciaRegistro:
    registro_id: Any
    numero_registro: Any
    capitulo: str
    item_numero: str
    tipo: str
    detalle: str
    cantidad_total: float = 0.0
    vu_guardado: Optional[float] = None
    vu_listado: Optional[float] = None
    cd_guardado: Optional[float] = None
    cd_esperado: Optional[float] = None
    impacto_plata: float = 0.0
    reporte_id: Any = None
    numero_reporte: Any = None

    def to_dict(self) -> dict:
        return asdict(self)


def auditar_integridad_registros(
    regs: Iterable[dict],
    listado_idx: Dict[CapItemKey, dict],
) -> List[InconsistenciaRegistro]:
    """
    Detecta inconsistencias registro ↔ listado. No excluye registros; solo reporta.
    impacto_plata = |cd_guardado − valor_canonico| o |vu_guardado − vu_listado|×cant, etc.
    """
    out: List[InconsistenciaRegistro] = []
    for reg in regs or []:
        if not isinstance(reg, dict):
            continue
        rid = reg.get("id")
        nro = reg.get("numero_registro")
        reporte_id = reg.get("reporte_id")
        numero_reporte = reg.get("numero_reporte")
        cap = norm_capitulo(reg.get("capitulo"))
        item = norm_item(reg.get("item_numero"))
        cant = _sf(reg.get("cantidad_total"))
        vu_g = reg.get("vlr_unitario")
        vu_g_f = _sf(vu_g) if vu_g is not None and str(vu_g).strip() != "" else None
        cd_g = reg.get("costo_directo")
        cd_g_f = _sf(cd_g) if cd_g is not None and str(cd_g).strip() != "" else None

        if not item:
            out.append(
                InconsistenciaRegistro(
                    registro_id=rid,
                    numero_registro=nro,
                    capitulo=cap,
                    item_numero=item,
                    tipo="sin_item",
                    detalle="Registro sin código de ítem",
                    cantidad_total=cant,
                    vu_guardado=vu_g_f,
                    cd_guardado=cd_g_f,
                    impacto_plata=abs(cd_g_f or 0.0),
                    reporte_id=reporte_id,
                    numero_reporte=numero_reporte,
                )
            )
            continue

        if not cap:
            out.append(
                InconsistenciaRegistro(
                    registro_id=rid,
                    numero_registro=nro,
                    capitulo=cap,
                    item_numero=item,
                    tipo="sin_capitulo",
                    detalle="Registro sin capítulo",
                    cantidad_total=cant,
                    vu_guardado=vu_g_f,
                    cd_guardado=cd_g_f,
                    impacto_plata=abs(cd_g_f or 0.0),
                    reporte_id=reporte_id,
                    numero_reporte=numero_reporte,
                )
            )

        k = cap_item_key(cap, item)
        meta = listado_idx.get(k) if cap else None
        if not cap or meta is None:
            # Si ya marcamos sin_capitulo, también marcar ausencia de cruce
            if cap:  # tiene cap pero no está en listado
                out.append(
                    InconsistenciaRegistro(
                        registro_id=rid,
                        numero_registro=nro,
                        capitulo=cap,
                        item_numero=item,
                        tipo="cap_item_ausente_en_listado",
                        detalle=f"({cap!r}, {item!r}) no existe en listado_precios del contrato",
                        cantidad_total=cant,
                        vu_guardado=vu_g_f,
                        cd_guardado=cd_g_f,
                        impacto_plata=abs(cd_g_f or 0.0),
                        reporte_id=reporte_id,
                        numero_reporte=numero_reporte,
                    )
                )
            elif not any(
                x.registro_id == rid and x.tipo == "sin_capitulo" for x in out[-3:]
            ):
                pass
            continue

        vu_l = _sf(meta.get("vlr_unitario"))
        if vu_l <= 0:
            vu_l = _sf(meta.get("precio_unitario"))
        cd_esp = valor_cant_vu(cant, vu_l) if vu_l > 0 else 0.0

        if vu_g_f is not None and vu_l > 0 and abs(vu_g_f - vu_l) > 0.005:
            impacto = abs(valor_cant_vu(cant, vu_g_f) - cd_esp)
            out.append(
                InconsistenciaRegistro(
                    registro_id=rid,
                    numero_registro=nro,
                    capitulo=cap,
                    item_numero=item,
                    tipo="vu_guardado_distinto_listado",
                    detalle=f"VU guardado {vu_g_f:g} ≠ listado {vu_l:g}",
                    cantidad_total=cant,
                    vu_guardado=vu_g_f,
                    vu_listado=vu_l,
                    cd_guardado=cd_g_f,
                    cd_esperado=cd_esp,
                    impacto_plata=impacto,
                    reporte_id=reporte_id,
                    numero_reporte=numero_reporte,
                )
            )

        if cd_g_f is not None and vu_l > 0 and abs(cd_g_f - cd_esp) > 0.5:
            out.append(
                InconsistenciaRegistro(
                    registro_id=rid,
                    numero_registro=nro,
                    capitulo=cap,
                    item_numero=item,
                    tipo="cd_guardado_distinto_cant_x_vu",
                    detalle=f"CD guardado {cd_g_f:g} ≠ ROUND0(ROUND(cant,2)×VU_listado)={cd_esp:g}",
                    cantidad_total=cant,
                    vu_guardado=vu_g_f,
                    vu_listado=vu_l,
                    cd_guardado=cd_g_f,
                    cd_esperado=cd_esp,
                    impacto_plata=abs(cd_g_f - cd_esp),
                    reporte_id=reporte_id,
                    numero_reporte=numero_reporte,
                )
            )

    return out


def resumen_integridad(incs: Sequence[InconsistenciaRegistro]) -> dict:
    by_tipo: Dict[str, int] = defaultdict(int)
    impacto = 0.0
    ids = set()
    impacto_afecta = 0.0
    impacto_stale = 0.0
    ids_afecta = set()
    ids_stale = set()
    n_afecta = 0
    n_stale = 0
    for i in incs or []:
        by_tipo[i.tipo] += 1
        impacto += abs(i.impacto_plata or 0.0)
        if i.registro_id is not None:
            ids.add(i.registro_id)
        caso = clasificar_caso_integridad(i.tipo)
        if caso == CASO_AFECTA_TOTALES:
            n_afecta += 1
            impacto_afecta += abs(i.impacto_plata or 0.0)
            if i.registro_id is not None:
                ids_afecta.add(i.registro_id)
        else:
            n_stale += 1
            impacto_stale += abs(i.impacto_plata or 0.0)
            if i.registro_id is not None:
                ids_stale.add(i.registro_id)
    return {
        "n_inconsistencias": len(incs or []),
        "n_registros_afectados": len(ids),
        "impacto_plata": round_valor(impacto),
        "por_tipo": dict(by_tipo),
        "tiene_inconsistencias": bool(incs),
        "afectan_totales": {
            "n_inconsistencias": n_afecta,
            "n_registros": len(ids_afecta),
            "impacto_plata": round_valor(impacto_afecta),
        },
        "valor_guardado_desactualizado": {
            "n_inconsistencias": n_stale,
            "n_registros": len(ids_stale),
            "impacto_plata": round_valor(impacto_stale),
        },
    }


def clasificar_caso_integridad(tipo: str) -> str:
    if tipo in TIPOS_AFECTAN_TOTALES:
        return CASO_AFECTA_TOTALES
    return CASO_VALOR_GUARDADO


def inconsistencia_con_caso(inc: InconsistenciaRegistro) -> dict:
    d = inc.to_dict()
    caso = clasificar_caso_integridad(inc.tipo)
    d["caso"] = caso
    d["caso_label"] = (
        "Sin cruce con listado / sin capítulo o ítem (afecta totales calculados)"
        if caso == CASO_AFECTA_TOTALES
        else "Valor guardado desactualizado (no afecta cifras calculadas con listado)"
    )
    return d


# ── Trazabilidad (estado) ────────────────────────────────────────────────────

TRAZABILIDAD_PRECIOS_STATUS = {
    "existe_historial_campo_a_campo": False,
    "existe_log_eventos": True,
    "detalle": (
        "Hay ``registrar_log`` en acciones CREAR/EDITAR/IMPORTAR/EXPORTAR de "
        "``listado_precios`` (módulo PRECIOS) y recálculo de cobros, pero NO hay "
        "tabla de historial campo-a-campo (valor anterior/nuevo, usuario, fecha) "
        "para precio_unitario ni para costo_directo/vlr_unitario de so_registros. "
        "Pendiente construir si se requiere auditoría forense de cada cambio."
    ),
    "entidades_con_log": [
        "listado_precios (CREAR/IMPORTAR/EXPORTAR/edición meta)",
        "listado_precios_agrupadores",
        "recalcular_cobros_precio (actualiza so_registros.costo_directo)",
    ],
}
