#!/usr/bin/env python3
"""Prueba real: tabla preacta_obra del Excel integral CC-MES.

Contrato ICCU-CTO-1614-2025, Acta RPO 1.

Comprueba que el libro integral trae la tabla preacta_obra (una fila por ítem,
sin subtotales, Clave única) y que sus valores, calculados desde las fórmulas
hacia la pestaña del informe, coinciden con el contexto del PDF CC-MES-001.

Uso (desde backend/):
  PYTHONPATH=. python3 scripts/qa_preacta_obra_iccu_1614.py

Lee VITE_SUPABASE_* de frontend/.env.development si no hay SUPABASE_URL/KEY.
No modifica datos.
"""
from __future__ import annotations

import json
import os
import sys
import time
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))


def _prime_env() -> None:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    key = (
        os.environ.get("SUPABASE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or ""
    )
    if not url or not key:
        env_path = ROOT / "frontend" / ".env.development"
        if env_path.is_file():
            for line in env_path.read_text().splitlines():
                if line.startswith("VITE_SUPABASE_URL=") and not url:
                    url = line.split("=", 1)[1].strip().strip('"')
                elif line.startswith("VITE_SUPABASE_ANON_KEY=") and not key:
                    key = line.split("=", 1)[1].strip().strip('"')
    if not url or not key:
        raise SystemExit("Faltan SUPABASE_URL / SUPABASE_KEY")
    os.environ["SUPABASE_URL"] = url
    os.environ["SUPABASE_KEY"] = key


_prime_env()

from corte_sub_conciliacion import valor_por_cantidad_vu  # noqa: E402
from excel_formula_eval import FormulaBook  # noqa: E402
from informes import (  # noqa: E402
    _PREACTA_OBRA_HEADERS,
    _cc_mes_integral_excel_bytes,
    _contexto_acta_mes_conciliacion,
    _fm_informe,
    _fn_cant_informe,
    _html_cc_mes_001_v1,
    _sb,
    matriz_params_contrato,
)
from openpyxl import load_workbook  # noqa: E402

CONTRATO_NUMERO = "ICCU-CTO-1614-2025"
HEADERS = _PREACTA_OBRA_HEADERS


def _acta_rpo_1(contrato_id: int) -> dict:
    rows = (
        _sb.table("actas")
        .select("id,numero_rpo,consecutivo,tipo_grupo")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    rpo = [r for r in rows if str(r.get("tipo_grupo") or "").strip().upper() == "RPO"]
    pool = rpo or rows

    def _es_uno(r: dict) -> bool:
        nro = str(r.get("numero_rpo") or "").strip()
        cons = str(r.get("consecutivo") or "").strip()
        return nro in {"1", "01", "RPO 1", "RPO-1"} or cons == "1" and nro in {"", "1", "01"}

    elegidos = [r for r in pool if _es_uno(r)]
    if not elegidos:
        # Respaldo documentado en otros QA: acta_rpo_id 620.
        elegidos = [r for r in pool if int(r.get("id") or 0) == 620]
    if len(elegidos) != 1:
        resumen = [
            {
                "id": r.get("id"),
                "numero_rpo": r.get("numero_rpo"),
                "consecutivo": r.get("consecutivo"),
                "tipo_grupo": r.get("tipo_grupo"),
            }
            for r in pool[:30]
        ]
        raise SystemExit(f"No hay un único Acta RPO 1. Candidatos: {resumen}")
    return elegidos[0]


def _casi(a, b, tol=1e-6) -> bool:
    try:
        return abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError):
        return a == b


def main() -> int:
    t0 = time.time()
    contratos = (
        _sb.table("contratos")
        .select("id,numero")
        .eq("numero", CONTRATO_NUMERO)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not contratos:
        raise SystemExit(f"Contrato {CONTRATO_NUMERO} no encontrado")
    contrato_id = int(contratos[0]["id"])
    acta = _acta_rpo_1(contrato_id)
    acta_id = int(acta["id"])
    _campo, niveles = matriz_params_contrato(_sb, contrato_id)
    nivel = max(niveles) if niveles else None
    print(
        f"contrato_id={contrato_id} acta_id={acta_id} "
        f"numero_rpo={acta.get('numero_rpo')} consecutivo={acta.get('consecutivo')} "
        f"nivel={nivel} activos={niveles}",
        flush=True,
    )

    user = {"nombre": "QA", "apellidos": "Preacta", "cargo_nombre": "Verificación"}
    ctx = _contexto_acta_mes_conciliacion(
        contrato_id, acta_id, user, nivel_aprobacion=nivel
    )
    items = list(ctx.get("items") or [])
    print(f"items informe={len(items)} en {time.time() - t0:.1f}s", flush=True)

    html = _html_cc_mes_001_v1(
        ctx["contrato"],
        ctx["acta"],
        items,
        float(ctx.get("total_costo") or 0),
        ctx.get("usuario_nombre") or "QA",
        ctx.get("usuario_cargo") or "—",
        {},
        resumen_4cols=ctx.get("resumen_4cols"),
        otros_conceptos=ctx.get("otros_conceptos") or [],
        c3_label="ACTA RPO",
        c3_value=str((ctx.get("acta") or {}).get("numero_rpo") or acta_id),
        c4_label="CONSECUTIVO",
        c4_value=str((ctx.get("acta") or {}).get("consecutivo") or "—"),
    )

    print("generando Excel integral…", flush=True)
    t1 = time.time()
    raw = _cc_mes_integral_excel_bytes(
        contrato_id, acta_id, user, nivel_aprobacion=nivel
    )
    print(f"excel bytes={len(raw)} en {time.time() - t1:.1f}s", flush=True)
    wb = load_workbook(BytesIO(raw))
    errores = []
    if "preacta_obra" not in wb.sheetnames:
        errores.append("falta la pestaña preacta_obra")
    if wb.sheetnames[0] != "CC-MES-001":
        errores.append(f"la primera hoja es {wb.sheetnames[0]!r}")
    hoja = wb["preacta_obra"] if "preacta_obra" in wb.sheetnames else None
    tabla = None
    if hoja is not None:
        tabla = hoja.tables.get("preacta_obra")
        if tabla is None:
            errores.append("la pestaña no contiene la tabla preacta_obra")
        else:
            if tabla.displayName != "preacta_obra":
                errores.append(f"displayName={tabla.displayName!r}")
            if tuple(tabla.column_names) != tuple(HEADERS):
                errores.append(f"encabezados={list(tabla.column_names)}")
            if tabla.totalsRowCount:
                errores.append("la tabla tiene fila de totales")

    informe = wb["CC-MES-001"]
    subtotales = [
        r
        for r in range(1, informe.max_row + 1)
        if isinstance(informe.cell(r, 1).value, str)
        and str(informe.cell(r, 1).value).startswith("Subtotal")
    ]
    book = FormulaBook(wb) if hoja is not None else None
    filas = []
    claves = []
    if hoja is not None and book is not None:
        # Datos desde la fila 2 hasta la última con fórmula en Clave.
        row = 2
        while hoja.cell(row, 1).value not in (None, ""):
            got = {}
            for col, header in enumerate(HEADERS, start=1):
                raw_f = hoja.cell(row, col).value
                if not (isinstance(raw_f, str) and raw_f.startswith("=")):
                    errores.append(f"fila {row} col {header} no es fórmula: {raw_f!r}")
                    got[header] = raw_f
                    continue
                if "CC-MES-001" not in raw_f and header not in ("Clave", "Capitulo"):
                    # AnteriorValor también cita CC-MES-001.
                    errores.append(f"fila {row} {header} no referencia el informe")
                try:
                    got[header] = book.eval_cell("preacta_obra", row, col)
                except Exception as exc:  # noqa: BLE001
                    errores.append(f"fila {row} {header}: {exc}")
                    got[header] = None
            clave = got.get("Clave")
            claves.append(clave)
            if isinstance(clave, str) and clave.startswith("Subtotal"):
                errores.append(f"fila de subtotal dentro de la tabla: {clave}")
            if got.get("Item") in (None, ""):
                errores.append(f"fila {row} sin ítem")
            filas.append(got)
            row += 1
            if row > len(items) + 5:
                break

    if len(filas) != len(items):
        errores.append(f"filas tabla={len(filas)} ítems informe={len(items)}")
    if len(claves) != len(set(claves)):
        dup = [c for c in claves if claves.count(c) > 1]
        errores.append(f"Clave repetida: {sorted(set(dup))[:8]}")

    desfaces = []
    for i, it in enumerate(items):
        if i >= len(filas):
            break
        got = filas[i]
        vu = it.get("vlr_unitario_sub") or it.get("vlr_unitario") or 0
        esperado = {
            "Clave": f"{str(it.get('capitulo') or '').strip() or '—'}|{it.get('item_numero')}",
            "Capitulo": str(it.get("capitulo") or "").strip() or "—",
            "Item": it.get("item_numero"),
            "ActualizadaCant": it.get("cant_actualizadas"),
            "ActualizadaValor": it.get("valor_actualizadas"),
            "AnteriorCant": it.get("cant_acum_anterior"),
            "AnteriorValor": valor_por_cantidad_vu(it.get("cant_acum_anterior"), vu),
            "PresenteCant": it.get("cant_presente"),
            "PresenteValor": it.get("valor_presente"),
            "AcumuladoCant": it.get("cant_acumulado"),
            "AcumuladoValor": it.get("valor_acumulado"),
            "SaldoCant": it.get("cant_saldo"),
            "SaldoValor": it.get("valor_saldo"),
        }
        for campo, exp in esperado.items():
            val = got.get(campo)
            ok = val == exp if isinstance(exp, str) else _casi(val, exp)
            if not ok:
                desfaces.append(
                    {
                        "fila": i + 2,
                        "item": it.get("item_numero"),
                        "capitulo": it.get("capitulo"),
                        "campo": campo,
                        "tabla": val,
                        "informe_pdf": exp,
                    }
                )
        desc = str(it.get("item_descripcion") or "").lower()
        if desc and desc not in html:
            desfaces.append({"fila": i + 2, "campo": "Descripcion", "pdf": "ausente", "texto": desc[:80]})
        for campo_pdf, valor in (
            ("ActualizadaCant", it.get("cant_actualizadas")),
            ("PresenteCant", it.get("cant_presente")),
            ("AcumuladoCant", it.get("cant_acumulado")),
            ("SaldoCant", it.get("cant_saldo")),
        ):
            txt = _fn_cant_informe(valor)
            if txt and txt not in html:
                desfaces.append({"fila": i + 2, "campo": campo_pdf, "pdf": "ausente", "texto": txt})
        for campo_pdf, valor in (
            ("ActualizadaValor", it.get("valor_actualizadas")),
            ("PresenteValor", it.get("valor_presente")),
            ("AcumuladoValor", it.get("valor_acumulado")),
            ("SaldoValor", it.get("valor_saldo")),
        ):
            txt = _fm_informe(valor)
            if txt and txt not in html:
                desfaces.append({"fila": i + 2, "campo": campo_pdf, "pdf": "ausente", "texto": txt})

    if len(desfaces) > 12:
        errores.append(f"{len(desfaces)} desfaces tabla/PDF (se listan 12)")
    elif desfaces:
        errores.append(f"{len(desfaces)} desfaces tabla/PDF")

    resumen = {
        "contrato": CONTRATO_NUMERO,
        "contrato_id": contrato_id,
        "acta_id": acta_id,
        "numero_rpo": acta.get("numero_rpo"),
        "consecutivo": acta.get("consecutivo"),
        "nivel_aprobacion": nivel,
        "items": len(items),
        "filas_tabla": len(filas),
        "subtotales_informe": len(subtotales),
        "claves_unicas": len(set(claves)),
        "hojas": len(wb.sheetnames),
        "excel_bytes": len(raw),
        "tabla": tabla.displayName if tabla is not None else None,
        "ref": tabla.ref if tabla is not None else None,
        "encabezados": list(tabla.column_names) if tabla is not None else [],
        "muestra_claves": claves[:8],
        "desfaces": desfaces[:12],
        "errores": errores,
        "segundos": round(time.time() - t0, 1),
        "ok": not errores and not desfaces,
    }
    out = Path("/opt/cursor/artifacts/preacta_obra_iccu_1614.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(resumen, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: resumen[k] for k in ("ok", "items", "filas_tabla", "claves_unicas", "subtotales_informe", "errores", "desfaces", "muestra_claves", "segundos")}, ensure_ascii=False, indent=2, default=str))
    return 0 if resumen["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
