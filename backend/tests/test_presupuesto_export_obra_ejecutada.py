"""Export Obra Ejecutada: completar ítems solo cobrados en SICOE Obra."""
from unittest.mock import MagicMock, patch

import main as m
from presupuesto_export_obra_ejecutada import (
    ORIGEN_SICOE_OBRA,
    covered_item_keys,
    fill_item_keys_from_sicoe_agg,
    map_sicoe_registro_a_fila_export,
)


def _norm_cap(s):
    return m._dash_norm_capitulo_key_py(s)


def _norm_item(s):
    return m._dash_norm_item_key_py(s)


def test_covered_item_keys_ignora_filas_sin_cap_item():
    rows = [
        {"capitulo": "1. CAP", "item": "1.1"},
        {"capitulo": "1. CAP", "item": "1.1."},  # misma clave de ítem normalizada
        {"capitulo": "", "item": "2.1"},
        {"capitulo": "2. CAP", "item": ""},
    ]
    keys = covered_item_keys(rows, norm_cap=_norm_cap, norm_item=_norm_item)
    assert keys == {(_norm_cap("1. CAP"), _norm_item("1.1"))}


def test_fill_keys_excluye_cubiertos_y_cobrado_cero():
    covered = {("1", "1.1")}
    sicoe_by = {
        ("1", "1.1"): {"ap_c": 1000},  # cubierto → no fill
        ("1", "1.2"): {"ap_c": 500},  # fill
        ("1", "1.3"): {"ap_c": 0},  # sin cobrado → no
        ("2", "2.1"): {"ap_c": -200},  # cobrado negativo → sí (neteado)
    }
    keys = fill_item_keys_from_sicoe_agg(sicoe_by, covered)
    assert keys == [("1", "1.2"), ("2", "2.1")]


def test_map_sicoe_usa_cantidad_total_y_longitud_no_cantidad():
    reg = {
        "id": 99,
        "numero_registro": 42,
        "capitulo": "3. DEMO",
        "item_numero": "3.5",
        "item_descripcion": "Demolición",
        "unidad": "M3",
        "competencia": "IDU",
        "longitud": 1.2,
        "ancho": 1.2,
        "espesor": 2.0,
        "cantidad": 40,  # unidades repetidas — NO usar como cant_total
        "cantidad_total": 115.2,
        "vlr_unitario": 10,
        "tramo": "T1",
        "abs_inicio": "0+000",
        "abs_final": "0+100",
        "nodo_ini": "N1",
        "nodo_fin": "N2",
        "observacion": "cobro directo",
        "pk_ids": {"pk_id": "PK-9", "infraestructura": "Calle 1"},
    }
    row = map_sicoe_registro_a_fila_export(reg, listado_meta={"precio_unitario": 1000})
    assert row["cant_total"] == 115.2
    assert row["area_long_nod"] == 1.2
    assert row["id_pol"] == "42"
    assert row["pk_id"] == "PK-9"
    assert row["infraestructura"] == "Calle 1"
    assert row["tipo_entidad"] == ""
    assert row["competencia"] == "IDU"
    assert row["no_inicio"] == "N1"
    assert row["no_final"] == "N2"
    assert row["abs_inicio"] == "0+000"
    assert row["_origen_export"] == ORIGEN_SICOE_OBRA
    assert row["costo_directo"] == 115200.0  # round(115.2 * 1000)
    assert row["vlr_unitario"] == 1000.0


def test_competencia_desde_so_registros_columna_competencia():
    """Nombre real en so_registros: competencia (texto)."""
    from presupuesto_export_obra_ejecutada import competencia_desde_sicoe_reg

    assert competencia_desde_sicoe_reg({"competencia": "  IDU  "}) == "IDU"
    assert competencia_desde_sicoe_reg({"competencia": ""}) == ""
    assert competencia_desde_sicoe_reg({}) == ""


def test_competencia_fallback_listado_cuando_so_registros_vacia():
    """Si la fila cobrada no trae competencia, usar listado_precios.competencia."""
    from presupuesto_export_obra_ejecutada import competencia_desde_sicoe_reg

    assert (
        competencia_desde_sicoe_reg(
            {"competencia": None, "item_numero": "1.9"},
            listado_meta={"competencia": "ETB", "precio_unitario": 10},
        )
        == "ETB"
    )
    # so_registros prima sobre listado
    assert (
        competencia_desde_sicoe_reg(
            {"competencia": "IDU"},
            listado_meta={"competencia": "ETB"},
        )
        == "IDU"
    )


def test_map_sicoe_competencia_desde_listado_si_falta_en_registro():
    row = map_sicoe_registro_a_fila_export(
        {
            "id": 1,
            "numero_registro": 3,
            "capitulo": "1. CAP",
            "item_numero": "1.9",
            "cantidad_total": 2,
            "competencia": "",
        },
        listado_meta={"competencia": "Codensa", "precio_unitario": 50, "descripcion": "X", "unidad": "M"},
    )
    assert row["competencia"] == "Codensa"


def test_so_registros_select_usa_columnas_reales_no_ppto():
    """Evita repetir el error PostgREST: no_inicio no existe en so_registros."""
    from presupuesto_export_obra_ejecutada import SO_REGISTROS_EXPORT_SELECT_BASE

    cols = SO_REGISTROS_EXPORT_SELECT_BASE
    # Fantasmas de presupuesto / tipográficos.
    assert "no_inicio" not in cols
    assert "no_final" not in cols
    assert "id_pol" not in cols
    assert "area_long_nod" not in cols
    assert "cant_total" not in cols
    # Columnas reales de so_registros usadas en el mapeo.
    for required in (
        "abs_inicio",
        "abs_final",
        "nodo_ini",
        "nodo_fin",
        "longitud",
        "cantidad_total",
        "numero_registro",
        "tramo",
        "calzada",
        "competencia",
        "ancho",
        "espesor",
    ):
        assert required in cols, required


def test_export_presupuesto_obra_no_llama_merge_sicoe():
    """Toggle Presupuesto de Obra: comportamiento idéntico (sin SICOE)."""
    body = MagicMock()
    body.formato = "informe"
    body.modo = "presupuesto_obra"
    body.tipo_ejecucion = "Presupuesto de Obra"
    body.version_id = None
    body.papelera = False

    rows = [
        {
            "id": 1,
            "capitulo": "1. CAP",
            "item": "1.1",
            "descripcion": "A",
            "und": "M2",
            "vlr_unitario": 10,
            "cant_total": 2,
            "costo_directo": 20,
            "competencia": "IDU",
            "pk_id": "",
            "infraestructura": "",
            "tipo_entidad": "Área",
        },
    ]

    with patch.object(m, "_presupuesto_fetch_export_rows", return_value=rows):
        with patch.object(m, "_overlay_presupuesto_meta_vivo", side_effect=lambda _c, rs: rs):
            with patch.object(m, "_pk_ids_ubicacion_por_codigo", return_value={}):
                with patch.object(m, "_presupuesto_export_merge_sicoe_obra") as merge:
                    with patch(
                        "presupuesto_graficos_routes.attach_graficos_a_items_export",
                        return_value=None,
                    ):
                        out = m.exportar_presupuesto_informe(1, body, current_user={"id": 1})

    merge.assert_not_called()
    assert len(out["resumen"]) == 1
    assert out["resumen"][0]["item"] == "1.1"
    assert out["items"][0].get("origen") == "presupuesto"


def test_export_obra_ejecutada_completa_item_solo_sicoe():
    """Ítem con ppto + ítem solo SICOE → ambos en resumen/memorias; sin mezclar."""
    body = MagicMock()
    body.formato = "informe"
    body.modo = "obra_ejecutada"
    body.tipo_ejecucion = "Obra Ejecutada"
    body.version_id = None
    body.papelera = False
    body.capitulo = None
    body.capitulos = None
    body.item = None
    body.items = None
    body.tramo = None
    body.tramos = None
    body.competencia = None
    body.competencias = None
    body.und = None
    body.unds = None

    ppto_rows = [
        {
            "id": 1,
            "capitulo": "1. CAP",
            "item": "1.1",
            "descripcion": "Con plano",
            "und": "M2",
            "vlr_unitario": 10,
            "cant_total": 5,
            "costo_directo": 50,
            "competencia": "IDU",
            "id_pol": "POL-1",
            "pk_id": "PK1",
            "infraestructura": "",
            "tipo_entidad": "Área",
            "area_long_nod": 5,
            "tramo": "T0",
            "abs_inicio": None,
            "abs_final": None,
            "no_inicio": None,
            "no_final": None,
            "ancho": None,
            "espesor": None,
            "pre_interv_por": "",
            "validado_por": "",
            "observacion": "",
            "observacion_externa": "",
        },
    ]

    sicoe_mapped = [
        {
            "id": 88,
            "capitulo": "1. CAP",
            "item": "1.9",
            "descripcion": "Demolición SICOE",
            "und": "M3",
            "vlr_unitario": 100,
            "cant_total": 12.5,
            "costo_directo": 1250,
            "competencia": "IDU",
            "id_pol": "77",
            "pk_id": "PK-S",
            "tramo": "T2",
            "calzada": "",
            "abs_inicio": "1+000",
            "abs_final": "1+050",
            "no_inicio": "",
            "no_final": "",
            "area_long_nod": 2.0,
            "ancho": 1.0,
            "espesor": 0.5,
            "tipo_entidad": "",
            "infraestructura": "Calle X",
            "pre_interv_por": "",
            "validado_por": "",
            "observacion": "cobro",
            "observacion_externa": "",
            "tipo_ejecucion": "Obra Ejecutada",
            "_origen_export": ORIGEN_SICOE_OBRA,
        },
    ]

    def fake_merge(_cid, _body, rows, _user):
        return list(rows) + sicoe_mapped

    with patch.object(m, "_presupuesto_fetch_export_rows", return_value=ppto_rows):
        with patch.object(m, "_overlay_presupuesto_meta_vivo", side_effect=lambda _c, rs: rs):
            with patch.object(m, "_pk_ids_ubicacion_por_codigo", return_value={}):
                with patch.object(m, "_presupuesto_export_merge_sicoe_obra", side_effect=fake_merge):
                    with patch(
                        "presupuesto_graficos_routes.attach_graficos_a_items_export",
                        return_value=None,
                    ):
                        out = m.exportar_presupuesto_informe(3, body, current_user={"id": 1})

    items = {r["item"]: r for r in out["items"]}
    assert set(items) == {"1.1", "1.9"}
    assert items["1.1"]["origen"] == "presupuesto"
    assert items["1.9"]["origen"] == ORIGEN_SICOE_OBRA
    assert items["1.1"]["registros"][0]["id_pol"] == "POL-1"
    assert items["1.9"]["registros"][0]["id_pol"] == "77"
    assert items["1.9"]["registros"][0]["tipo_entidad"] == ""
    assert items["1.9"]["registros"][0]["area_long_nod"] == 2.0
    assert items["1.9"]["registros"][0]["cant_total"] == 12.5

    resumen_items = {(r["item"], r["origen"]) for r in out["resumen"]}
    assert ("1.1", "presupuesto") in resumen_items
    assert ("1.9", ORIGEN_SICOE_OBRA) in resumen_items


def test_merge_no_mezcla_sicoe_si_item_tiene_ppto(monkeypatch):
    """Si el ítem ya tiene ppto, no se añaden filas SICOE aunque exista cobrado."""
    body = MagicMock()
    body.capitulo = None
    body.capitulos = None
    body.item = None
    body.items = None
    body.tramo = None
    body.tramos = None
    body.competencia = None
    body.competencias = None
    body.und = None
    body.unds = None

    ppto = [{"capitulo": "1. CAP", "item": "1.1", "cant_total": 1}]
    sicoe_by = {
        ("1", "1.1"): {"ap_c": 9999, "cap_display": "1. CAP"},
        ("1", "1.2"): {"ap_c": 100, "cap_display": "1. CAP"},
    }

    monkeypatch.setattr(m, "_dashboard_scan_sicoe_by_item", lambda cid: sicoe_by)
    monkeypatch.setattr(
        m,
        "_presupuesto_export_fetch_sicoe_aprobados_items",
        lambda cid, keys: [
            {
                "id": 1,
                "numero_registro": 5,
                "capitulo": "1. CAP",
                "item_numero": "1.2",
                "cantidad_total": 10,
                "longitud": 1,
                "competencia": "IDU",
                "unidad": "M",
                "item_descripcion": "Solo SICOE",
            }
        ],
    )
    monkeypatch.setattr(m, "_overlay_sicoe_meta_vivo", lambda cid, rows: rows)
    monkeypatch.setattr(m, "_listado_precios_vu_by_cap_item", lambda cid: {})
    monkeypatch.setattr(m, "_dash_listado_vu_resolved", lambda *a, **k: 50.0)
    # Normalización: "1. CAP" → depends on _dash_norm_capitulo_key_py
    # Ajustar claves sicoe_by a las reales de norm.
    ck = _norm_cap("1. CAP")
    ik1 = _norm_item("1.1")
    ik2 = _norm_item("1.2")
    monkeypatch.setattr(
        m,
        "_dashboard_scan_sicoe_by_item",
        lambda cid: {
            (ck, ik1): {"ap_c": 9999},
            (ck, ik2): {"ap_c": 100},
        },
    )

    merged = m._presupuesto_export_merge_sicoe_obra(1, body, ppto, {"id": 1})
    # Solo se añade 1.2; 1.1 no se duplica desde SICOE
    items = [r["item"] for r in merged if r.get("_origen_export") == ORIGEN_SICOE_OBRA]
    assert items == ["1.2"]
    assert len(merged) == 2
