"""Grilla Por reporte: select sin GeoJSON pesado."""
import re
from pathlib import Path


def test_buscar_reportes_usa_select_sin_geojson():
    src = Path(__file__).resolve().parents[1].joinpath("main.py").read_text(encoding="utf-8")
    assert "_GRILLA_COLS" in src
    m = re.search(r"_GRILLA_COLS\s*=\s*\((.*?)\)\s*\n\s*cols\s*=", src, re.S)
    assert m, "no se encontró _GRILLA_COLS"
    cols = m.group(1).lower()
    assert "dibujo_geojson" not in cols
    assert "perimetro_geojson" not in cols
    assert "dibujo_escena" not in cols
    assert "numero_reporte" in cols
    assert "enlace_soporte" in cols


def test_batch_dibujo_prefers_id_only_probe():
    src = Path(__file__).resolve().parents[1].joinpath("main.py").read_text(encoding="utf-8")
    fn = src.split("def _sicoe_batch_reportes_con_dibujo", 1)[1].split("\ndef _sicoe_", 1)[0]
    assert '.select("id")' in fn
    assert "not_.is_" in fn
