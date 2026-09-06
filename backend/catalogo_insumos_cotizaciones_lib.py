"""
Helpers puros de cotizaciones del catálogo (sin dependencias de Azure/Supabase).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional


def _norm_text(text: Any) -> str:
    s = unicodedata.normalize("NFD", str(text or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s.lower().strip())
    return s


def norm_numero_cotizacion(numero: Any) -> str:
    return re.sub(r"\s+", " ", str(numero or "").strip().upper())


def norm_proveedor_key(nombre: Any, nit: Any = None) -> str:
    base = _norm_text(nombre)
    nit_n = re.sub(r"\D+", "", str(nit or ""))
    return f"{base}|{nit_n}" if nit_n else base


def apply_auto_ganadora_detalle(detalle: List[dict]) -> List[dict]:
    """Marca como ganadora la cotización tipo insumo de menor valor (absoluto)."""
    rows = list(detalle or [])
    if not rows:
        return rows
    candidatos = [
        (i, r)
        for i, r in enumerate(rows)
        if (r.get("tipo") or "insumo") == "insumo" and r.get("valor") is not None
    ]
    for r in rows:
        r["es_ganadora"] = False
    if not candidatos:
        for r in rows:
            if (r.get("tipo") or "insumo") == "insumo":
                r["es_ganadora"] = True
                break
        return rows
    min_val = min(float(r.get("valor") or 0) for _, r in candidatos)
    win_i = next(i for i, r in candidatos if float(r.get("valor") or 0) == min_val)
    rows[win_i]["es_ganadora"] = True
    return rows


def build_biblioteca_cotizaciones(refs: List[dict]) -> List[dict]:
    """Agrupa por proveedor → cotizaciones (número), con valor total y acumulado."""
    by_prov: Dict[str, dict] = {}
    for ref in refs or []:
        nombre = (ref.get("proveedor") or "").strip() or "Sin proveedor"
        key = norm_proveedor_key(nombre, ref.get("nit"))
        if key not in by_prov:
            by_prov[key] = {
                "proveedor_key": key,
                "proveedor_id": ref.get("proveedor_id"),
                "razon_social": nombre,
                "nit": ref.get("nit"),
                "cotizaciones": {},
                "total_acumulado": 0.0,
            }
        bucket = by_prov[key]
        if ref.get("proveedor_id") and not bucket.get("proveedor_id"):
            bucket["proveedor_id"] = ref.get("proveedor_id")
        if ref.get("nit") and not bucket.get("nit"):
            bucket["nit"] = ref.get("nit")
        num = ref["numero"]
        cots = bucket["cotizaciones"]
        if num not in cots:
            cots[num] = {
                "numero": num,
                "fecha": ref.get("fecha"),
                "vigencia": ref.get("vigencia"),
                "valor_total": 0.0,
                "items": [],
            }
        cot = cots[num]
        if ref.get("fecha") and not cot.get("fecha"):
            cot["fecha"] = ref.get("fecha")
        if ref.get("vigencia") and not cot.get("vigencia"):
            cot["vigencia"] = ref.get("vigencia")
        valor = float(ref.get("valor") or 0)
        cot["valor_total"] = float(round(cot["valor_total"] + valor))
        cot["items"].append({
            "insumo_id": ref.get("insumo_id"),
            "codigo": ref.get("codigo"),
            "descripcion": ref.get("descripcion"),
            "valor": ref.get("valor"),
            "tipo": ref.get("tipo") or "insumo",
            "es_ganadora": bool(ref.get("es_ganadora")),
        })

    out = []
    for bucket in by_prov.values():
        cot_list = sorted(bucket["cotizaciones"].values(), key=lambda c: c["numero"])
        total = float(round(sum(c["valor_total"] for c in cot_list)))
        out.append({
            "proveedor_key": bucket.get("proveedor_key"),
            "proveedor_id": bucket.get("proveedor_id"),
            "razon_social": bucket.get("razon_social"),
            "nit": bucket.get("nit"),
            "total_acumulado": total,
            "cotizaciones": cot_list,
            "n_cotizaciones": len(cot_list),
        })
    out.sort(key=lambda p: (p.get("razon_social") or "").lower())
    return out


def find_incongruencia_numero_cotizacion(
    refs: List[dict],
    numero: str,
    *,
    proveedor_id: Any = None,
    razon_social: str = "",
    nit: str = "",
    exclude_insumo_id: Any = None,
) -> Optional[dict]:
    """Si el número ya existe asociado a otro proveedor, retorna el conflicto."""
    num = norm_numero_cotizacion(numero)
    if not num:
        return None
    want_pid = int(proveedor_id) if proveedor_id not in (None, "") else None
    want_key = norm_proveedor_key(razon_social, nit)
    excl = int(exclude_insumo_id) if exclude_insumo_id not in (None, "") else None
    for ref in refs or []:
        if norm_numero_cotizacion(ref.get("numero")) != num:
            continue
        if excl is not None and ref.get("insumo_id") is not None and int(ref["insumo_id"]) == excl:
            continue
        ref_pid = int(ref["proveedor_id"]) if ref.get("proveedor_id") not in (None, "") else None
        ref_key = norm_proveedor_key(ref.get("proveedor"), ref.get("nit"))
        same = False
        if want_pid and ref_pid and want_pid == ref_pid:
            same = True
        elif want_key and ref_key and want_key == ref_key:
            same = True
        elif want_key and ref_key and _norm_text(razon_social) and _norm_text(ref.get("proveedor")) == _norm_text(razon_social):
            same = True
        if same:
            continue
        if ref_pid or (ref.get("proveedor") or "").strip():
            if want_pid or (razon_social or "").strip():
                return {
                    "numero": num,
                    "proveedor_registrado": ref.get("proveedor"),
                    "proveedor_id_registrado": ref_pid,
                    "nit_registrado": ref.get("nit"),
                    "insumo_id": ref.get("insumo_id"),
                    "codigo": ref.get("codigo"),
                    "descripcion": ref.get("descripcion"),
                }
    return None
