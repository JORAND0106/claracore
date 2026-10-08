#!/usr/bin/env python3
"""Mide el listado viejo (select * + lectura extra por fila) contra la vista de grilla.

Requiere PostgreSQL local. No toca Supabase.
"""
from __future__ import annotations

import json
import os
import time

import psycopg2


DSN = os.environ.get("GRILLA_BENCH_DSN", "dbname=claracore_grilla user=ubuntu host=/var/run/postgresql")
SQL_PATH = os.path.join(os.path.dirname(__file__), "..", "sql", "catalogo_insumo_grilla_vista.sql")
OUT = os.environ.get("GRILLA_BENCH_OUT", "/opt/cursor/artifacts/grilla_bench.log")


def _quote_blob(n_quotes: int, pad: int) -> str:
    rows = []
    for i in range(n_quotes):
        rows.append({
            "id": f"c-{i}",
            "tipo": "insumo",
            "es_ganadora": i == 0,
            "numero": "COT-001" if i == 0 else f"COT-{i:04d}",
            "fecha": "2026-03-01",
            "valor": 1500 if i == 0 else 900,
            "proveedor": "ACME" if i == 0 else f"Prov {i}",
            "proveedor_id": 1 if i == 0 else None,
            "nota": "N" * pad,
        })
    return json.dumps(rows)


def _ms(fn):
    t0 = time.perf_counter()
    result = fn()
    return (time.perf_counter() - t0) * 1000.0, result


def main() -> None:
    lines = []

    def log(msg: str) -> None:
        print(msg)
        lines.append(msg)

    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    cur = conn.cursor()
    for role in ("anon", "authenticated", "service_role"):
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,))
        if cur.fetchone() is None:
            cur.execute(f"CREATE ROLE {role} NOLOGIN")

    cur.execute("""
        DROP VIEW IF EXISTS public.v_catalogo_insumo_grilla;
        DROP TABLE IF EXISTS public.almacen_solicitud_item;
        DROP TABLE IF EXISTS public.almacen_solicitud;
        DROP TABLE IF EXISTS public.almacen_insumo;
        DROP TABLE IF EXISTS public.almacen_proveedor;
        DROP TABLE IF EXISTS public.contratos;
        CREATE TABLE public.contratos (id integer PRIMARY KEY);
        INSERT INTO public.contratos (id) VALUES (1);
        CREATE TABLE public.almacen_proveedor (
          id bigserial PRIMARY KEY,
          contrato_id integer NOT NULL,
          razon_social text NOT NULL,
          nit text,
          activo boolean NOT NULL DEFAULT true
        );
        INSERT INTO public.almacen_proveedor (id, contrato_id, razon_social, nit)
        VALUES (1, 1, 'ACME', '900');
        CREATE TABLE public.almacen_insumo (
          id bigserial PRIMARY KEY,
          contrato_id integer NOT NULL,
          codigo text NOT NULL,
          descripcion text NOT NULL,
          unidad text NOT NULL DEFAULT 'UND',
          rendimiento numeric(18, 4),
          valor_compra_referencia numeric(18, 2) NOT NULL DEFAULT 0,
          activo boolean NOT NULL DEFAULT true,
          proveedor_id bigint,
          costo_base numeric(18, 2),
          tipo_impuesto text,
          impuesto_porcentaje numeric(8, 4),
          tributos jsonb,
          cantidad_negociada numeric(18, 4),
          cotizacion_numero text,
          cotizacion_fecha date,
          cotizaciones_detalle jsonb NOT NULL DEFAULT '[]'::jsonb
        );
        CREATE TABLE public.almacen_solicitud (
          id bigserial PRIMARY KEY,
          contrato_id integer NOT NULL,
          estado text
        );
        CREATE TABLE public.almacen_solicitud_item (
          id bigserial PRIMARY KEY,
          insumo_id bigint,
          solicitud_id bigint,
          cantidad numeric
        );
        INSERT INTO public.almacen_solicitud (id, contrato_id, estado) VALUES (1, 1, 'aprobada');
    """)

    fat = _quote_blob(4, 120_000)
    log(f"detalle_por_insumo_bytes={len(fat)} cotizaciones=4")
    for i in range(30):
        cur.execute(
            """
            INSERT INTO public.almacen_insumo (
              contrato_id, codigo, descripcion, unidad, rendimiento, proveedor_id,
              costo_base, valor_compra_referencia, tipo_impuesto, impuesto_porcentaje,
              tributos, cantidad_negociada, cotizacion_numero, cotizacion_fecha,
              cotizaciones_detalle
            ) VALUES (
              1, %s, %s, 'KG', 1.25, 1,
              1000, 1190, 'iva', 19,
              '{"iva":{"porcentaje":19}}'::jsonb, 20, 'COT-001', '2026-03-01',
              %s::jsonb
            )
            """,
            (f"INS-{i:05d}", f"Insumo real {i}", fat),
        )
        cur.execute(
            "INSERT INTO public.almacen_solicitud_item (insumo_id, solicitud_id, cantidad) VALUES (%s, 1, 2)",
            (i + 1,),
        )

    def old_list():
        cur.execute(
            """
            SELECT * FROM public.almacen_insumo
            WHERE contrato_id = 1 AND activo IS TRUE
            ORDER BY codigo
            LIMIT 100
            """
        )
        rows = cur.fetchall()
        # El listado actual vuelve a leer cada insumo (get_insumo) y sus solicitudes
        # cuando hay cantidad negociada.
        extra = 0
        for row in rows:
            cur.execute("SELECT * FROM public.almacen_insumo WHERE id = %s AND contrato_id = 1", (row[0],))
            cur.fetchall()
            cur.execute(
                "SELECT cantidad, solicitud_id FROM public.almacen_solicitud_item WHERE insumo_id = %s",
                (row[0],),
            )
            cur.fetchall()
            extra += 1
        return len(rows), extra

    ms, (n, extra) = _ms(old_list)
    log(f"ANTES catalogo_30 select_estrella_y_n+1 ms={ms:.1f} filas={n} lecturas_extra={extra}")

    def old_payload():
        cur.execute(
            """
            SELECT cotizaciones_detalle::text
            FROM public.almacen_insumo
            WHERE contrato_id = 1 AND activo
            ORDER BY codigo
            LIMIT 100
            """
        )
        blobs = cur.fetchall()
        return sum(len(b[0] or "") for b in blobs)

    ms_payload, nbytes = _ms(old_payload)
    log(f"ANTES payload_json_30 bytes={nbytes} ms_solo_json={ms_payload:.1f}")

    sql = open(SQL_PATH, encoding="utf-8").read()
    # El NOTIFY no hace falta en el banco local.
    cur.execute(sql.replace("NOTIFY pgrst, 'reload schema';", ""))

    def new_page(limit=50, q=""):
        if q:
            cur.execute(
                """
                SELECT id, proveedor_nombre, codigo, descripcion, unidad, rendimiento,
                       tipo_impuesto, tributos, cantidad_negociada, cotizacion_numero,
                       cotizacion_fecha, costo_base, valor_compra_referencia
                FROM public.v_catalogo_insumo_grilla
                WHERE contrato_id = 1
                  AND (codigo ILIKE %s OR descripcion ILIKE %s)
                ORDER BY codigo
                LIMIT %s
                """,
                (f"%{q}%", f"%{q}%", limit),
            )
        else:
            cur.execute(
                """
                SELECT id, proveedor_nombre, codigo, descripcion, unidad, rendimiento,
                       tipo_impuesto, tributos, cantidad_negociada, cotizacion_numero,
                       cotizacion_fecha, costo_base, valor_compra_referencia
                FROM public.v_catalogo_insumo_grilla
                WHERE contrato_id = 1
                ORDER BY codigo
                LIMIT %s
                """,
                (limit,),
            )
        rows = cur.fetchall()
        cur.execute(
            "SELECT count(*) FROM public.v_catalogo_insumo_grilla WHERE contrato_id = 1"
        )
        total = cur.fetchone()[0]
        return len(rows), total, rows[0][1] if rows else None

    ms, (n, total, nombre) = _ms(lambda: new_page(50))
    log(f"DESPUES vista_30 primera_pagina ms={ms:.1f} filas={n} total={total} proveedor={nombre}")

    slim = _quote_blob(4, 400)
    log(f"detalle_sintetico_bytes={len(slim)} cotizaciones=4")
    batch = []
    for i in range(30, 10000):
        batch.append((
            f"INS-{i:05d}",
            f"Insumo sintetico {i} cemento",
            slim,
        ))
        if len(batch) == 500:
            cur.executemany(
                """
                INSERT INTO public.almacen_insumo (
                  contrato_id, codigo, descripcion, unidad, rendimiento, proveedor_id,
                  costo_base, valor_compra_referencia, tipo_impuesto, impuesto_porcentaje,
                  tributos, cantidad_negociada, cotizacion_numero, cotizacion_fecha,
                  cotizaciones_detalle
                ) VALUES (
                  1, %s, %s, 'UND', 2, 1,
                  800, 952, 'iva', 19,
                  '{"iva":{"porcentaje":19}}'::jsonb, 5, 'COT-001', '2026-04-01',
                  %s::jsonb
                )
                """,
                batch,
            )
            batch = []
    if batch:
        cur.executemany(
            """
            INSERT INTO public.almacen_insumo (
              contrato_id, codigo, descripcion, unidad, rendimiento, proveedor_id,
              costo_base, valor_compra_referencia, tipo_impuesto, impuesto_porcentaje,
              tributos, cantidad_negociada, cotizacion_numero, cotizacion_fecha,
              cotizaciones_detalle
            ) VALUES (
              1, %s, %s, 'UND', 2, 1,
              800, 952, 'iva', 19,
              '{"iva":{"porcentaje":19}}'::jsonb, 5, 'COT-001', '2026-04-01',
              %s::jsonb
            )
            """,
            batch,
        )
    cur.execute("SELECT count(*) FROM public.almacen_insumo WHERE contrato_id = 1 AND activo")
    log(f"catalogo_total={cur.fetchone()[0]}")

    ms, (n, total, nombre) = _ms(lambda: new_page(50))
    log(f"DESPUES vista_10000 primera_pagina ms={ms:.1f} filas={n} total={total} proveedor={nombre}")

    ms, (n, total, _nombre) = _ms(lambda: new_page(50, "sintetico 9999"))
    log(f"DESPUES busqueda_codigo_o_desc_10000 ms={ms:.1f} filas={n} total_catalogo={total}")

    def old_page_10k():
        cur.execute(
            """
            SELECT id, cotizaciones_detalle::text
            FROM public.almacen_insumo
            WHERE contrato_id = 1 AND activo
            ORDER BY codigo
            LIMIT 50
            """
        )
        rows = cur.fetchall()
        return len(rows), sum(len(r[1] or "") for r in rows)

    ms, (n, nbytes) = _ms(old_page_10k)
    log(f"ANTES_FORMA select_detalle_primera_pagina_de_10000 ms={ms:.1f} filas={n} bytes={nbytes}")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
