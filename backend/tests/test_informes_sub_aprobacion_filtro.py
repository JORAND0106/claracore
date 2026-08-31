"""Toggle Todo | Aprobado — pruebas sin importar informes.py completo."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "informes.py").read_text(encoding="utf-8")


def test_helper_y_query_en_fuente():
    assert "def _apply_filtro_sub_estado" in SRC
    assert '_SOLO_APROBADOS_SUB_Q = Query(' in SRC
    assert 'solo_aprobados: bool = _SOLO_APROBADOS_SUB_Q' in SRC
    assert 'return q.eq("sub_estado", "Aprobado")' in SRC


def test_items_corte_y_contexto_aceptan_solo_aprobados():
    assert "def inf_items_corte(" in SRC
    assert "solo_aprobados: bool = _SOLO_APROBADOS_SUB_Q" in SRC
    assert "def _contexto_corte_sub(" in SRC
    assert "def _contexto_memoria_item(" in SRC
    assert "solo_aprobados: bool = True" in SRC


def test_pdf_excel_rutas_exponen_query():
    for name in (
        "def pdf_corte_sub(",
        "def pdf_memoria_item(",
        "def pdf_memoria_corte_completo(",
        "def excel_corte_subcontratista(",
        "def excel_memoria_item(",
        "def excel_memoria_corte_completo(",
    ):
        assert name in SRC
    # Todas deben mencionar el query param cerca de la firma (conteo mínimo).
    assert SRC.count("solo_aprobados: bool = _SOLO_APROBADOS_SUB_Q") >= 6
