"""FO-IDU-EO-04-V2: sellado matriz y deduplicación de registros por acta."""
from ccd_conciliacion import _registro_aprobado_matriz_panel


def test_registro_sellado_cascada_n3_contrato_3_niveles():
    reg = {
        "item_numero": "1.01",
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Aprobado",
        "nivel3_estado": "Aprobado",
    }
    assert _registro_aprobado_matriz_panel(reg, [1, 2, 3], "nivel3_estado") is True


def test_registro_no_sellado_si_nivel3_pendiente():
    reg = {
        "item_numero": "1.01",
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Aprobado",
        "nivel3_estado": "Pendiente",
        "nivel4_estado": "Aprobado",
    }
    assert _registro_aprobado_matriz_panel(reg, [1, 2, 3, 4], "nivel4_estado") is False


def test_registro_sellado_nivel_max_4_requiere_prerequisitos():
    reg = {
        "item_numero": "2.10",
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Aprobado",
        "nivel3_estado": "Aprobado",
        "nivel4_estado": "Aprobado",
    }
    assert _registro_aprobado_matriz_panel(reg, [1, 2, 3, 4], "nivel4_estado") is True
