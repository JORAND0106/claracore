"""Capítulos SICOE desde listado_precios (helpers puros)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sicoe_catalogo import (  # noqa: E402
    capitulos_distinct_desde_filas,
    capitulos_payload,
    orden_capitulo_key,
)


def test_capitulos_distinct_ordena_por_numero_inicial():
    rows = [
        {"capitulo": "10. Z"},
        {"capitulo": "2. B"},
        {"capitulo": "01. A"},
        {"capitulo": None},
        {"capitulo": "  "},
        {"capitulo": "01. A"},
    ]
    caps = capitulos_distinct_desde_filas(rows)
    assert caps == ["01. A", "2. B", "10. Z"]
    assert capitulos_payload(caps) == [
        {"capitulo": "01. A"},
        {"capitulo": "2. B"},
        {"capitulo": "10. Z"},
    ]


def test_orden_capitulo_sin_numero_al_final():
    assert orden_capitulo_key("ABC")[0] == 9999
    assert orden_capitulo_key("03. X")[0] == 3
