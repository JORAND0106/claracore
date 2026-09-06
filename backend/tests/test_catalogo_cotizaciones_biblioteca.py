from catalogo_insumos_cotizaciones_lib import (
    apply_auto_ganadora_detalle,
    build_biblioteca_cotizaciones,
    find_incongruencia_numero_cotizacion,
    pick_best_cotizacion_ref,
)


def test_apply_auto_ganadora_detalle_elige_menor():
    detalle = [
        {"tipo": "insumo", "numero": "A", "valor": 500, "es_ganadora": True},
        {"tipo": "insumo", "numero": "B", "valor": 200, "es_ganadora": False},
        {"tipo": "no_previsto", "numero": "A-NP", "valor": 50, "es_ganadora": True},
    ]
    out = apply_auto_ganadora_detalle(detalle)
    gan = [r for r in out if r.get("es_ganadora")]
    assert len(gan) == 1
    assert gan[0]["numero"] == "B"


def test_build_biblioteca_acumula_por_proveedor_y_numero():
    refs = [
        {"numero": "BO-1", "proveedor": "PAVCO", "valor": 100, "cantidad_negociada": 2, "insumo_id": 1, "codigo": "I1"},
        {"numero": "BO-1", "proveedor": "PAVCO", "valor": 50, "cantidad_negociada": 1, "insumo_id": 2, "codigo": "I2"},
        {"numero": "BO-2", "proveedor": "PAVCO", "valor": 30, "cantidad_negociada": 3, "insumo_id": 3, "codigo": "I3"},
        {"numero": "BO-1", "proveedor": "GEOMATRIX", "valor": 80, "cantidad_negociada": 2, "insumo_id": 4, "codigo": "I4"},
    ]
    bib = build_biblioteca_cotizaciones(refs)
    assert len(bib) == 2
    pavco = next(p for p in bib if p["razon_social"] == "PAVCO")
    # BO-1: 100*2 + 50*1 = 250; BO-2: 30*3 = 90 → total 340
    assert pavco["total_acumulado"] == 340
    cot = next(c for c in pavco["cotizaciones"] if c["numero"] == "BO-1")
    assert cot["valor_total"] == 250
    assert len(cot["items"]) == 2
    assert cot["items"][0]["valor_linea"] == 200
    geo = next(p for p in bib if p["razon_social"] == "GEOMATRIX")
    assert geo["total_acumulado"] == 160


def test_build_biblioteca_sin_cantidad_negociada_no_usa_solo_unitario():
    refs = [
        {"numero": "X-1", "proveedor": "ACME", "valor": 500, "insumo_id": 1, "codigo": "A"},
        {"numero": "X-1", "proveedor": "ACME", "valor": 100, "cantidad_negociada": 0, "insumo_id": 2, "codigo": "B"},
    ]
    bib = build_biblioteca_cotizaciones(refs)
    acme = bib[0]
    assert acme["total_acumulado"] == 0
    assert acme["cotizaciones"][0]["valor_total"] == 0


def test_find_incongruencia_numero_entre_proveedores():
    refs = [
        {"numero": "BO-160-2026", "proveedor": "PAVCO", "proveedor_id": 1, "insumo_id": 10, "codigo": "X"},
    ]
    ok = find_incongruencia_numero_cotizacion(
        refs, "BO-160-2026", proveedor_id=1, razon_social="PAVCO",
    )
    assert ok is None
    bad = find_incongruencia_numero_cotizacion(
        refs, "BO-160-2026", proveedor_id=2, razon_social="GEOMATRIX",
    )
    assert bad is not None
    assert bad["proveedor_registrado"] == "PAVCO"


def test_same_proveedor_ref_por_id_o_nombre():
    from catalogo_insumos_cotizaciones_lib import same_proveedor_ref
    ref = {"proveedor": "Pavco S.A.", "proveedor_id": 7, "nit": "900"}
    assert same_proveedor_ref(ref, proveedor_id=7, razon_social="")
    assert same_proveedor_ref(ref, proveedor_id=None, razon_social="PAVCO S.A.")
    assert same_proveedor_ref(ref, proveedor_id=99, razon_social="pavco s.a.")
    assert not same_proveedor_ref(ref, proveedor_id=99, razon_social="GEOMATRIX")


def test_pick_best_cotizacion_ref_prefiere_tipo_y_pdf():
    refs = [
        {
            "numero": "COT-9",
            "proveedor": "ACME",
            "proveedor_id": 1,
            "tipo": "insumo",
            "fecha": "2026-01-01",
            "vigencia": "30 días",
            "insumo_id": 1,
        },
        {
            "numero": "COT-9",
            "proveedor": "ACME",
            "proveedor_id": 1,
            "tipo": "no_previsto",
            "fecha": "2026-02-01",
            "vigencia": "10 días",
            "pdf_nombre": "np.pdf",
            "insumo_id": 2,
        },
        {
            "numero": "COT-9",
            "proveedor": "ACME",
            "proveedor_id": 1,
            "tipo": "insumo",
            "fecha": "2026-03-01",
            "vigencia": "15 días",
            "has_pdf_ganadora": True,
            "pdf_nombre": "gan.pdf",
            "insumo_id": 3,
        },
    ]
    best_ins = pick_best_cotizacion_ref(
        refs, "cot-9", proveedor_id=1, razon_social="ACME", tipo="insumo",
    )
    assert best_ins["insumo_id"] == 3
    assert best_ins["pdf_nombre"] == "gan.pdf"
    best_np = pick_best_cotizacion_ref(
        refs, "COT-9", proveedor_id=1, tipo="no_previsto",
    )
    assert best_np["insumo_id"] == 2
    assert best_np["tipo"] == "no_previsto"
    none = pick_best_cotizacion_ref(refs, "COT-9", proveedor_id=99, razon_social="OTRO")
    assert none is None
