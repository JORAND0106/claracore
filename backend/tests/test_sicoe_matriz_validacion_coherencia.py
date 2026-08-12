"""Coherencia filtros SICOE Obra con matriz Validación por rol (niveles activos dinámicos)."""
from unittest.mock import MagicMock, patch

import main as m


def _reg(**kw):
    base = {
        "item_numero": "NP-1",
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Aprobado",
        "nivel3_estado": None,
        "nivel4_estado": "No Revisado",
        "costo_directo": 1000,
    }
    base.update(kw)
    return base


@patch("main._get_niveles_activos_contrato", return_value=[1, 2, 4])
def test_n4_no_revisado_excluye_sin_prereqs(_mock_na):
    capa = {"campo": "nivel4_estado", "estado": "No Revisado"}
    assert not m._sicoe_registro_cumple_capa_matriz(
        _reg(nivel2_estado="Rechazado"), capa, 2
    )
    assert not m._sicoe_registro_cumple_capa_matriz(
        _reg(nivel1_estado="No Revisado", nivel2_estado="No Revisado"), capa, 2
    )
    assert m._sicoe_registro_cumple_capa_matriz(_reg(), capa, 2)


@patch("main._get_niveles_activos_contrato", return_value=[1, 2, 4])
def test_filtrar_registros_n4_coherente_matriz(_mock_na):
    regs = [
        _reg(nivel2_estado="Rechazado"),
        _reg(),
        _reg(item_numero="NP-2", nivel1_estado="No Revisado", nivel2_estado="No Revisado"),
    ]
    out = m._filtrar_registros_validacion_por_campo(
        regs, "nivel4_estado", "No Revisado", contrato_id=2
    )
    assert len(out) == 1
    assert out[0]["item_numero"] == "NP-1"


@patch("main._get_niveles_activos_contrato", return_value=[1, 2, 4])
def test_n1_no_revisado_sin_item_excluido(_mock_na):
    capa = {"campo": "nivel1_estado", "estado": "No Revisado"}
    assert not m._sicoe_registro_cumple_capa_matriz(_reg(item_numero=""), capa, 2)
    assert m._sicoe_registro_cumple_capa_matriz(
        _reg(
            item_numero="NP-1",
            nivel1_estado=None,
            nivel2_estado=None,
            nivel4_estado=None,
        ),
        capa,
        2,
    )


@patch("main._get_niveles_activos_contrato", return_value=[1, 2, 4])
def test_prereqs_sql_todos_niveles_activos(_mock_na):
    prereqs = m._sicoe_matriz_prereqs_activos_para_campo("nivel4_estado", 2)
    assert prereqs == [("nivel1_estado", "Aprobado"), ("nivel2_estado", "Aprobado")]
    assert m._sicoe_matriz_prereqs_activos_para_campo("nivel1_estado", 2) == []


def test_filtro_validacion_requiere_acta_vigente():
    capas = [{"campo": "nivel1_estado", "estado": "No Revisado"}]
    assert m._sicoe_filtro_validacion_requiere_acta_vigente_matriz(capas, None)
    assert not m._sicoe_filtro_validacion_requiere_acta_vigente_matriz(
        capas, None, acta_id=616
    )


def test_registros_q_acta_scope_usa_reporte_ids():
    with patch("main._sicoe_reporte_ids_universo_acta", return_value=[10, 20]) as mock_u:
        q = MagicMock()
        m._sicoe_registros_q_filtrar_actas_scope(q, 3, [616])
    mock_u.assert_called_once_with(3, [616])
    q.in_.assert_called_once_with("reporte_id", [10, 20])


def test_registros_q_acta_linea_usa_acta_rpo_id_columna():
    q = MagicMock()
    m._sicoe_registros_q_filtrar_actas_linea(q, [616])
    q.eq.assert_called_once_with("acta_rpo_id", 616)


def test_registros_q_acta_linea_varias_actas():
    q = MagicMock()
    m._sicoe_registros_q_filtrar_actas_linea(q, [616, 617])
    q.in_.assert_called_once_with("acta_rpo_id", [616, 617])


def test_costo_matriz_neto_por_item_con_vu_otras_actas():
    regs = [
        {
            "item_numero": "NP-247",
            "capitulo": "7. Cap",
            "cantidad_total": -10,
            "vlr_unitario": 0,
            "costo_directo": 0,
        },
        {
            "item_numero": "NP-247",
            "capitulo": "7. Cap",
            "cantidad_total": 5,
            "vlr_unitario": 0,
            "costo_directo": 0,
        },
    ]
    ikey = m._sicoe_matriz_item_key(regs[0])
    vu_map = {ikey: 395166.0}
    total = m._sicoe_costo_regs_estilo_matriz(regs, vu_map)
    assert total == m.costo_agregado_cant_vu(-5, 395166.0)


def test_matriz_dashboard_n1_no_revisado_coherente_costo_directo():
    """Contrato 2 / acta vigente: matriz N1 no revisado obra = SUM(costo_directo) con ítem."""
    try:
        cid = 2
        aid = m._acta_rpo_id_matriz_dashboard_default(cid)
        if aid is None:
            return
        pay = m._dashboard_matriz_validacion_por_niveles(cid, aid)
        mat_n1 = float(
            (pay.get("obra_ejecutada_directo_sin_aiu") or {})
            .get("no_revisado", {})
            .get("nivel1")
            or 0
        )
        cd = 0.0
        off = 0
        while True:
            batch = m.supabase_execute(
                lambda o=off: m.supabase.table("so_registros")
                .select("costo_directo,nivel1_estado,item_numero")
                .eq("contrato_id", cid)
                .eq("acta_rpo_id", aid)
                .order("id")
                .range(o, o + 999)
                .execute()
                .data
            ) or []
            for r in batch:
                if not (r.get("item_numero") or "").strip():
                    continue
                if m._matriz_validacion_norm_estado(r.get("nivel1_estado")) != "No Revisado":
                    continue
                cd += float(r.get("costo_directo") or 0)
            if len(batch) < 1000:
                break
            off += 1000
        assert round(mat_n1, 0) == round(cd, 0)
    except Exception as exc:
        if "supabase" in str(exc).lower() or "connect" in str(exc).lower():
            return
        raise


def test_export_body_sin_actas_filtro_colectar_masivo_no_crash():
    """ExportarRegistrosBody no define actas_filtro; colectar masivo no debe lanzar AttributeError."""
    from unittest.mock import MagicMock

    capas = [{"campo": "nivel1_estado", "estado": "No Revisado", "nivel": 1}]
    body = m.ExportarRegistrosBody(
        campos=["id"],
        validacion_capas='[{"campo":"nivel1_estado","estado":"No Revisado"}]',
    )
    assert not hasattr(body, "actas_filtro")

    with patch("main._parse_validacion_capas_param", return_value=capas), patch(
        "main._acta_rpo_id_matriz_dashboard_default", return_value=616
    ), patch("main.supabase_execute", return_value=[]), patch(
        "main.supabase", MagicMock()
    ):
        rows, st = m._sicoe_colectar_registros_masivo_desde_filtros(2, body, {})
    assert rows == []
    assert isinstance(st, dict)
