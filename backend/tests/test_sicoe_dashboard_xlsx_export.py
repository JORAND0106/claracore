"""Export SICOE dashboard: columnas so_registros con FKs resueltos."""
import main


def test_xlsx_sin_ids_internos_resuelve_pk_id_desde_pk_id_id(monkeypatch):
    raw = [{
        "id": 99901,
        "contrato_id": 1,
        "reporte_id": 500,
        "numero_registro": 42,
        "pk_id_id": 888,
        "capitulo": "4. ESPACIO",
    }]

    def fake_enrich(rows):
        r = dict(rows[0])
        r["reporte_numero"] = 77
        r["pk_id_valor"] = "120367"
        return [r]

    monkeypatch.setattr(main, "_sicoe_enriquecer_registros_export", fake_enrich)
    out = main._sicoe_registros_xlsx_sin_ids_internos(raw)

    assert "pk_id_id" not in out[0]
    assert out[0]["pk_id"] == "120367"


def test_xlsx_sin_ids_internos_conserva_pk_id_y_reemplaza_fks(monkeypatch):
    raw = [{
        "id": 99901,
        "contrato_id": 1,
        "reporte_id": 500,
        "numero_registro": 42,
        "semana_id": 10,
        "acta_rpo_id": 20,
        "subcontratista_id": 30,
        "inspector_id": 40,
        "pk_id_id": 888,
        "pk_id": "120367",
        "capitulo": "4. ESPACIO",
        "item_numero": "4.01.",
        "costo_directo": 1000,
    }]

    def fake_enrich(rows):
        r = dict(rows[0])
        r["reporte_numero"] = 77
        r["semana_numero"] = 12
        r["acta_rpo_numero"] = 65
        r["subcontratista_nombre"] = "SUB TEST"
        r["inspector_nombre"] = "INSPECTOR TEST"
        r["pk_id_valor"] = r.get("pk_id")
        return [r]

    monkeypatch.setattr(main, "_sicoe_enriquecer_registros_export", fake_enrich)
    out = main._sicoe_registros_xlsx_sin_ids_internos(raw)

    assert len(out) == 1
    row = out[0]
    assert "id" not in row
    assert "contrato_id" not in row
    assert "pk_id_id" not in row
    assert row["pk_id"] == "120367"
    assert row["numero_registro"] == 42
    assert row["reporte_id"] == 77
    assert row["semana_id"] == 12
    assert row["acta_rpo_id"] == 65
    assert row["subcontratista_id"] == "SUB TEST"
    assert row["inspector_id"] == "INSPECTOR TEST"
