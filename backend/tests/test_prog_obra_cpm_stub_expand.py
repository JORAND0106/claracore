"""CPM: stubs de dependencias replicados a todos los PK de la versión."""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import NodoCPM, cpm_node_key
from prog_obra_service import _cpm_expand_stub_nodos_todos_pks


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def _add_dh(_cid, fi, dur, _cache):
    from datetime import timedelta
    return fi + timedelta(days=max(1, dur))


def test_expand_stub_crea_nodo_faltante_en_segundo_pk():
    ver_ini = date(2026, 6, 9)
    nodos = [
        NodoCPM("PK-A", "2. CAP", 5, ver_ini, date(2026, 6, 13), agrupador_id="16", es_ancla=False),
    ]
    raw_ags = [{"pk_id": "PK-A"}, {"pk_id": "PK-B"}]
    deps = [
        {
            "pk_id_origen": "PK-A",
            "capitulo_origen": "2. CAP",
            "agrupador_id_origen": 16,
            "pk_id_destino": "PK-A",
            "capitulo_destino": "4. CAP",
            "agrupador_id_destino": 21,
            "tipo": "FS",
            "lag_dias": 3,
        },
    ]
    _cpm_expand_stub_nodos_todos_pks(
        nodos, deps, raw_ags, ver_ini, 1, _cache(), _add_dh,
    )
    keys = {n.key for n in nodos}
    assert cpm_node_key("PK-B", "4. CAP", "21") in keys
    assert len([n for n in nodos if n.pk_id == "PK-B"]) >= 1
