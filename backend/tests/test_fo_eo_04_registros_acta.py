"""FO-IDU-EO-04-V2: sellado matriz y deduplicación de registros por acta."""
from ccd_conciliacion import _registro_aprobado_matriz_panel


def _fo_eo_04_es_acta_rpo(acta_row):
    return (str(acta_row.get("tipo_grupo") or "").strip().upper()) == "RPO"


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


def test_fo_eo_04_solo_actas_rpo():
    assert _fo_eo_04_es_acta_rpo({"tipo_grupo": "RPO"}) is True
    assert _fo_eo_04_es_acta_rpo({"tipo_grupo": "rpo"}) is True
    assert _fo_eo_04_es_acta_rpo({"tipo_grupo": "ADMIN"}) is False
    assert _fo_eo_04_es_acta_rpo({}) is False
