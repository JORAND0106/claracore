from catalogo_insumos_cotizaciones_lib import (
    apply_auto_ganadora_detalle,
    build_biblioteca_cotizaciones,
    find_incongruencia_numero_cotizacion,
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
        {"numero": "BO-1", "proveedor": "PAVCO", "valor": 100, "insumo_id": 1, "codigo": "I1"},
        {"numero": "BO-1", "proveedor": "PAVCO", "valor": 50, "insumo_id": 2, "codigo": "I2"},
        {"numero": "BO-2", "proveedor": "PAVCO", "valor": 30, "insumo_id": 3, "codigo": "I3"},
        {"numero": "BO-1", "proveedor": "GEOMATRIX", "valor": 80, "insumo_id": 4, "codigo": "I4"},
    ]
    bib = build_biblioteca_cotizaciones(refs)
    assert len(bib) == 2
    pavco = next(p for p in bib if p["razon_social"] == "PAVCO")
    assert pavco["total_acumulado"] == 180
    cot = next(c for c in pavco["cotizaciones"] if c["numero"] == "BO-1")
    assert cot["valor_total"] == 150
    assert len(cot["items"]) == 2


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
