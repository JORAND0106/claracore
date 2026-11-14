"""Grilla Por reporte: select sin GeoJSON pesado y sin columnas fantasmas."""
import re
from pathlib import Path


def _main_src() -> str:
    return Path(__file__).resolve().parents[1].joinpath("main.py").read_text(encoding="utf-8")


def test_buscar_reportes_usa_select_sin_geojson_ni_valor_total():
    src = _main_src()
    assert "_SICOE_GRILLA_COLS_PARTS" in src
    assert "_sicoe_fetch_so_reportes_grilla" in src
    m = re.search(r"_SICOE_GRILLA_COLS_PARTS\s*=\s*\((.*?)\)\s*\n", src, re.S)
    assert m, "no se encontró _SICOE_GRILLA_COLS_PARTS"
    cols = m.group(1).lower()
    assert "dibujo_geojson" not in cols
    assert "perimetro_geojson" not in cols
    assert "dibujo_escena" not in cols
    assert "valor_total" not in cols  # provocaba PGRST204 → 500 con filtros
    assert "numero_reporte" in cols
    assert "enlace_soporte" in cols


def test_batch_dibujo_prefers_id_only_probe():
    src = _main_src()
    fn = src.split("def _sicoe_batch_reportes_con_dibujo", 1)[1].split("\ndef _sicoe_", 1)[0]
    assert '.select("id")' in fn
    assert "not_.is_" in fn


def test_fetch_grilla_tiene_fallback_pgrst204():
    src = _main_src()
    fn = src.split("def _sicoe_fetch_so_reportes_grilla", 1)[1].split("\ndef _sicoe_", 1)[0]
    assert "PGRST204" in src[src.find("_sicoe_fetch_so_reportes_grilla") - 200 :] or "_logs_pgrst_unknown_column" in fn
    assert '*, subcontratistas(razon_social)' in fn
    assert "_sicoe_strip_reporte_pesado" in fn
