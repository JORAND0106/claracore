#!/usr/bin/env python3
"""
Evidencia en vivo — cálculo único + integridad ICCU-CTO-1614-2025 Acta RPO 1.

Uso:
  cd backend && PYTHONPATH=. python3 scripts/qa_valor_canonico_integridad_live.py

Compara por nivel de validación (Acta RPO 1):
  - valor canónico (Σ ROUND0(ROUND(Σcant,2)×VU_listado) por cap+ítem)
  - SUM(costo_directo) almacenado (legado plataforma)
  - listado de inconsistencias con impacto

No modifica datos.
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sicoe_costo_aprobado_nivel import (  # noqa: E402
    registro_aprobado_nivel_max,
    sum_costo_aprobado_nivel_max,
)
from sicoe_valor_canonico import (  # noqa: E402
    TRAZABILIDAD_PRECIOS_STATUS,
    auditar_integridad_registros,
    load_listado_vu_by_cap_item,
    resumen_integridad,
    sum_valor_canonico,
)


def _load_env() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    key = (
        os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or ""
    )
    if url and key:
        return url.rstrip("/"), key
    env_path = ROOT / "frontend" / ".env.development"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            if line.startswith("VITE_SUPABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("VITE_SUPABASE_ANON_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')
    if not url or not key:
        raise SystemExit("Faltan SUPABASE_URL / SUPABASE_ANON_KEY")
    return url.rstrip("/"), key


class _SbRest:
    """Cliente mínimo compatible con load_listado_vu_by_cap_item (table().select()...)."""

    def __init__(self, url: str, key: str):
        self.url = url
        self.key = key

    def table(self, name: str):
        return _Table(self, name)


class _Table:
    def __init__(self, sb: _SbRest, name: str):
        self.sb = sb
        self.name = name
        self._params: List[str] = []
        self._sel = "*"
        self._order: Optional[str] = None
        self._range: Optional[tuple] = None

    def select(self, cols: str):
        self._sel = cols
        return self

    def eq(self, col: str, val: Any):
        self._params.append(f"{col}=eq.{val}")
        return self

    def order(self, col: str):
        self._order = col
        return self

    def range(self, a: int, b: int):
        self._range = (a, b)
        return self

    def execute(self):
        import urllib.parse
        import urllib.request

        qs = [f"select={urllib.parse.quote(self._sel, safe=',')}"]
        qs.extend(self._params)
        if self._order:
            qs.append(f"order={self._order}")
        url = f"{self.sb.url}/rest/v1/{self.name}?{'&'.join(qs)}"
        headers = {
            "apikey": self.sb.key,
            "Authorization": f"Bearer {self.sb.key}",
        }
        if self._range:
            headers["Range"] = f"{self._range[0]}-{self._range[1]}"
            headers["Prefer"] = "count=exact"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode())
        return type("R", (), {"data": data})()


def fetch_regs(sb: _SbRest, contrato_id: int, acta_id: int) -> List[dict]:
    cols = (
        "id,numero_registro,item_numero,capitulo,cantidad_total,vlr_unitario,costo_directo,"
        "acta_rpo_id,nivel1_estado,nivel2_estado,nivel3_estado,nivel4_estado,"
        "nivel5_estado,nivel6_estado"
    )
    rows: List[dict] = []
    off = 0
    while True:
        batch = (
            sb.table("so_registros")
            .select(cols)
            .eq("contrato_id", contrato_id)
            .eq("acta_rpo_id", acta_id)
            .order("id")
            .range(off, off + 999)
            .execute()
            .data
        ) or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        off += 1000
    return rows


def fetch_contrato_id(sb: _SbRest, numero: str) -> Optional[int]:
    rows = (
        sb.table("contratos")
        .select("id,numero")
        .eq("numero", numero)
        .range(0, 5)
        .execute()
        .data
    ) or []
    if not rows:
        # fallback contains
        import urllib.parse
        import urllib.request

        q = urllib.parse.quote(f"*{numero}*")
        url = f"{sb.url}/rest/v1/contratos?select=id,numero&numero=ilike.{q}&limit=5"
        req = urllib.request.Request(
            url,
            headers={"apikey": sb.key, "Authorization": f"Bearer {sb.key}"},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            rows = json.loads(resp.read().decode())
    return int(rows[0]["id"]) if rows else None


def fetch_acta_rpo1(sb: _SbRest, contrato_id: int) -> Optional[dict]:
    rows = (
        sb.table("actas")
        .select("id,numero_rpo,consecutivo,contrato_id")
        .eq("contrato_id", contrato_id)
        .eq("numero_rpo", 1)
        .range(0, 5)
        .execute()
        .data
    ) or []
    if rows:
        return rows[0]
    rows = (
        sb.table("actas")
        .select("id,numero_rpo,consecutivo,contrato_id")
        .eq("contrato_id", contrato_id)
        .eq("consecutivo", 1)
        .range(0, 5)
        .execute()
        .data
    ) or []
    return rows[0] if rows else None


def _norm_estado(v: Any) -> str:
    s = str(v or "").strip().lower()
    if s == "aprobado":
        return "Aprobado"
    if s == "pendiente":
        return "Pendiente"
    if s == "rechazado":
        return "Rechazado"
    return "No Revisado"


def valor_por_nivel(regs: List[dict], listado, na: List[int]) -> Dict[str, dict]:
    """Para cada nivel activo: valor canónico de registros con ese nivel en Aprobado (+prereqs)."""
    out = {}
    for n in na:
        def _ok(r, nivel=n):
            if not str(r.get("item_numero") or "").strip():
                return False
            for p in na:
                if p >= nivel:
                    break
                if _norm_estado(r.get(f"nivel{p}_estado")) != "Aprobado":
                    return False
            return _norm_estado(r.get(f"nivel{nivel}_estado")) == "Aprobado"

        filtered = [r for r in regs if _ok(r)]
        canon = sum_valor_canonico(filtered, listado)
        sum_cd = round(sum(float(r.get("costo_directo") or 0) for r in filtered), 0)
        out[f"N{n}_Aprobado"] = {
            "n_regs": len(filtered),
            "valor_canonico": canon,
            "sum_cd_guardado": sum_cd,
            "delta_cd_vs_canon": round(sum_cd - canon, 0),
        }
    # Nivel máx. con regla canónica completa
    nmax = max(na)
    filtered_max = [r for r in regs if registro_aprobado_nivel_max(r, na)]
    out[f"N{nmax}_Aprobado_canon_fn"] = {
        "n_regs": len(filtered_max),
        "valor_canonico": sum_costo_aprobado_nivel_max(regs, na, listado_idx=listado),
        "sum_cd_guardado": round(
            sum(float(r.get("costo_directo") or 0) for r in filtered_max), 0
        ),
    }
    return out


def main() -> None:
    url, key = _load_env()
    sb = _SbRest(url, key)
    numero = os.environ.get("CONTRATO_NUMERO", "ICCU-CTO-1614-2025")
    cid = int(os.environ.get("CONTRATO_ID", "0") or 0) or fetch_contrato_id(sb, numero)
    if not cid:
        # Fallback histórico documentado
        cid = 3
        print(f"AVISO: contratos no legible por RLS; usando contrato_id={cid} ({numero})")
    acta_id_env = int(os.environ.get("ACTA_ID", "0") or 0)
    if acta_id_env:
        acta = {"id": acta_id_env, "numero_rpo": 1}
    else:
        acta = fetch_acta_rpo1(sb, cid)
    if not acta:
        # Fallback Acta RPO 1 ICCU (acta_rpo_id=620)
        if cid == 3:
            acta = {"id": 620, "numero_rpo": 1}
            print("AVISO: actas no legible por RLS; usando acta_id=620 (RPO 1 ICCU)")
        else:
            raise SystemExit(f"Acta RPO 1 no encontrada para contrato_id={cid}")
    acta_id = int(acta["id"])
    na = [1, 2, 3, 4]

    print(f"Contrato {numero} id={cid} Acta RPO 1 id={acta_id}")
    regs = fetch_regs(sb, cid, acta_id)
    listado = load_listado_vu_by_cap_item(sb, cid)
    listado_fuente = "listado_precios"
    if not listado:
        # Anon RLS suele bloquear listado_precios; proxy desde presupuesto para evidencia QA.
        from sicoe_valor_canonico import cap_item_key

        proxy = {}
        off = 0
        while True:
            batch = (
                sb.table("presupuesto")
                .select("id, capitulo, item, vlr_unitario")
                .eq("contrato_id", cid)
                .order("id")
                .range(off, off + 999)
                .execute()
                .data
            ) or []
            for r in batch:
                k = cap_item_key(r.get("capitulo"), r.get("item"))
                if not k[1]:
                    continue
                try:
                    vu = float(r.get("vlr_unitario") or 0)
                except (TypeError, ValueError):
                    vu = 0.0
                if vu <= 0:
                    continue
                proxy[k] = {
                    "id": r.get("id"),
                    "capitulo": k[0],
                    "item_numero": k[1],
                    "vlr_unitario": vu,
                    "precio_unitario": vu,
                }
            if len(batch) < 1000:
                break
            off += 1000
        listado = proxy
        listado_fuente = "presupuesto_proxy_por_rls_listado"
        print(f"AVISO: listado_precios vacío (RLS). Proxy presupuesto: {len(listado)} (cap,ítem)")
    print(f"Registros acta: {len(regs)} | ítems fuente VU ({listado_fuente}): {len(listado)}")

    total_canon = sum_valor_canonico(regs, listado)
    total_cd = round(sum(float(r.get("costo_directo") or 0) for r in regs), 0)
    print(f"\nTotal acta (todos los regs): canon={total_canon:,.0f}  SUM(CD)={total_cd:,.0f}")

    niveles = valor_por_nivel(regs, listado, na)
    print("\n=== Cuadro por nivel (Acta RPO 1) — valor canónico ===")
    print(f"{'Nivel':<28} {'n':>6} {'Canon':>16} {'SUM(CD)':>16} {'Δ':>12}")
    for k, v in niveles.items():
        print(
            f"{k:<28} {v['n_regs']:>6} {v['valor_canonico']:>16,.0f} "
            f"{v['sum_cd_guardado']:>16,.0f} {v.get('delta_cd_vs_canon', v['sum_cd_guardado']-v['valor_canonico']):>12,.0f}"
        )

    incs = auditar_integridad_registros(regs, listado)
    resum = resumen_integridad(incs)
    print("\n=== Integridad (Acta RPO 1) ===")
    print(json.dumps(resum, indent=2, ensure_ascii=False))
    print(f"\nTrazabilidad: {json.dumps(TRAZABILIDAD_PRECIOS_STATUS, ensure_ascii=False, indent=2)}")

    out_path = Path(__file__).resolve().parent / "qa_valor_canonico_integridad_live_out.json"
    payload = {
        "contrato": numero,
        "contrato_id": cid,
        "acta_rpo": 1,
        "acta_id": acta_id,
        "n_regs": len(regs),
        "n_listado_cap_item": len(listado),
        "fuente_vu": listado_fuente,
        "total_acta_canonico": total_canon,
        "total_acta_sum_cd": total_cd,
        "por_nivel": niveles,
        "integridad_resumen": resum,
        "inconsistencias": [i.to_dict() for i in incs],
        "trazabilidad_precios": TRAZABILIDAD_PRECIOS_STATUS,
        "nota": (
            "Plataforma / PDF / Excel deben mostrar valor_canonico. "
            "SUM(CD) es legado y diverge cuando hay inconsistencias. "
            f"Fuente VU de esta corrida: {listado_fuente}."
        ),
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
    print(f"\nEscrito: {out_path}")

    # Listado compacto para el usuario
    print("\n=== Inconsistencias (compacto) ===")
    by_tipo = defaultdict(list)
    for i in incs:
        by_tipo[i.tipo].append(i)
    for tipo, items in sorted(by_tipo.items()):
        print(f"\n[{tipo}] ({len(items)})")
        for i in items[:50]:
            print(
                f"  reg#{i.numero_registro} id={i.registro_id} "
                f"item={i.item_numero!r} cap={i.capitulo!r} "
                f"impacto={i.impacto_plata:,.0f} | {i.detalle}"
            )
        if len(items) > 50:
            print(f"  … +{len(items)-50} más")


if __name__ == "__main__":
    main()
