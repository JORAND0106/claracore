"""CPM: segundo cálculo no debe reutilizar fechas del write-back previo."""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import DependenciaCPM, NodoCPM, calcular_cpm
from prog_obra_service import (
    _consolidar_fila_agrupador_cpm_entrada,
    _duraciones_agrupador_para_cpm,
    _nodo_cpm_desde_agrupador,
    _reset_cpm_entrada_version,
    _resolve_duracion_cpm_nodo,
)
from prog_obra_calendar import add_dias_habiles


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_consolidar_entrada_cpm_elimina_fechas_writeback():
    from prog_obra_service import _consolidar_fila_agrupador_cpm_entrada

    rows = [
        {
            "item": "4.A",
            "codigo_wbs": "4.A",
            "duracion_dias_habiles": 12,
            "fecha_inicio": "2026-08-25",
            "fecha_fin_calculada": "2026-08-25",
            "override_manual": False,
        },
    ]
    out = _consolidar_fila_agrupador_cpm_entrada(rows)
    assert out["duracion_dias_habiles"] == 12
    assert out.get("fecha_inicio") is None
    assert out.get("fecha_fin_calculada") is None


def test_forward_pass_no_deriva_duracion_de_fechas_base():
    cache = _cache()
    ver_ini = date(2026, 6, 9)
    # Nodo con fechas base de 1 día pero duracion explícita 12
    n = NodoCPM(
        "PK1", "4. CAP", 12, ver_ini, ver_ini, agrupador_id="401",
    )
    res = calcular_cpm([n], [], 1, cache, fecha_inicio_proyecto=ver_ini)
    assert res.ok
    out = res.nodos[0]
    assert out.duracion == 12
    assert (out.fecha_fin_temprana - out.fecha_inicio_temprana).days >= 11


def test_resolve_duracion_cpm_no_usa_span_fechas_writeback():
    cache = _cache()
    row = {
        "duracion_dias_habiles": None,
        "fecha_inicio": "2026-08-25",
        "fecha_fin_calculada": "2026-08-25",
        "override_manual": False,
    }
    acts = [
        {"pk_id": "PK1", "capitulo": "4. ESTRUCTURA", "agrupador_id": 401, "duracion_dias_habiles": 12},
    ]
    assert _resolve_duracion_cpm_nodo(row, acts, "4. ESTRUCTURA", 401, "PK1", 1, cache, for_cpm=True) == 12
    # Sin duración almacenada: for_cpm ignora span de fechas write-back; UI merge sí lo usa.
    acts_sin_dur = [{"pk_id": "PK1", "capitulo": "4. ESTRUCTURA", "agrupador_id": 401, "duracion_dias_habiles": None}]
    assert _resolve_duracion_cpm_nodo(row, acts_sin_dur, "4. ESTRUCTURA", 401, "PK1", 1, cache, for_cpm=True) == 1
    assert _resolve_duracion_cpm_nodo(row, acts_sin_dur, "4. ESTRUCTURA", 401, "PK1", 1, cache, for_cpm=False) == 1


def test_duraciones_agrupador_para_cpm_solo_columna_almacenada():
    acts = [
        {
            "pk_id": "PK1",
            "capitulo": "4. ESTRUCTURA",
            "agrupador_id": 401,
            "duracion_dias_habiles": 10,
            "fecha_inicio": "2026-08-25",
            "fecha_fin_calculada": "2026-08-25",
        },
        {
            "pk_id": "PK2",
            "capitulo": "4. ESTRUCTURA",
            "agrupador_id": 401,
            "duracion_dias_habiles": None,
            "fecha_inicio": "2026-08-25",
            "fecha_fin_calculada": "2026-08-25",
        },
    ]
    out = _duraciones_agrupador_para_cpm(acts)
    assert out[("PK2", "4. ESTRUCTURA", "401")] == 10


def test_reset_cpm_entrada_version_borra_resultados_y_fechas():
    sb = MagicMock()
    delete_chain = MagicMock()
    delete_chain.eq.return_value = delete_chain
    delete_chain.execute.return_value = MagicMock(data=[])

    update_chain = MagicMock()
    update_chain.eq.return_value = update_chain
    update_chain.not_.is_.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[])

    table_mock = MagicMock()
    table_mock.delete.return_value = delete_chain
    table_mock.update.return_value = update_chain
    sb.table.return_value = table_mock

    _reset_cpm_entrada_version(sb, "vid-1")

    table_mock.delete.assert_called_once()
    delete_chain.eq.assert_called_with("version_id", "vid-1")
    table_mock.update.assert_called_once()
    payload = table_mock.update.call_args[0][0]
    assert payload["fecha_inicio"] is None
    assert payload["fecha_fin_calculada"] is None
    assert payload["fecha_inicio_temprana"] is None
    assert payload["fecha_fin_temprana"] is None


def test_segundo_calculo_usa_duracion_actual_no_fechas_previas():
    cache = _cache()
    ver_ini = date(2026, 6, 9)
    add_dh = add_dias_habiles

    row_writeback = _consolidar_fila_agrupador_cpm_entrada([{
        "pk_id": "PK1",
        "capitulo": "4. ESTRUCTURA",
        "agrupador_id": "401",
        "item": "4.A",
        "codigo_wbs": "4.A",
        "fecha_inicio": "2026-08-25",
        "fecha_fin_calculada": "2026-08-25",
        "duracion_dias_habiles": 12,
        "override_manual": False,
    }])
    row_writeback["pk_id"] = "PK1"
    row_writeback["capitulo"] = "4. ESTRUCTURA"
    row_writeback["agrupador_id"] = "401"
    acts = [row_writeback]
    dur = _resolve_duracion_cpm_nodo(row_writeback, acts, "4. ESTRUCTURA", 401, "PK1", 1, cache, for_cpm=True)
    assert dur == 12

    n1 = _nodo_cpm_desde_agrupador(row_writeback, ver_ini, 1, cache, add_dh, duracion_resuelta=dur)
    n2 = NodoCPM(
        "PK1", "1. CAP", 5, ver_ini, add_dh(1, ver_ini, 5, cache), agrupador_id="101",
    )
    deps = [
        DependenciaCPM("PK1", "1. CAP", "PK1", "4. ESTRUCTURA", "FS", 0, "101", "401"),
    ]
    res = calcular_cpm([n2, n1], deps, 1, cache, fecha_inicio_proyecto=ver_ini)
    assert res.ok
    dest = next(n for n in res.nodos if n.agrupador_id == "401")
    assert dest.duracion == 12
    assert dest.fecha_fin_temprana > dest.fecha_inicio_temprana
