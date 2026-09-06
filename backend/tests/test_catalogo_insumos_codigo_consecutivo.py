from catalogo_insumos_codigo_lib import (
    codigo_liberado_para_baja,
    compute_next_codigo_insumo,
)


def test_compute_next_vacio_inicia_en_001():
    assert compute_next_codigo_insumo([], "160") == "CC-160-001"
    assert compute_next_codigo_insumo([None, "", "x"], "160") == "CC-160-001"


def test_compute_next_ultimo_mas_uno_sin_rellenar_huecos():
    codigos = ["CC-160-001", "CC-160-003"]
    assert compute_next_codigo_insumo(codigos, "160") == "CC-160-004"


def test_compute_next_ignora_codigos_liberados_o_ajenos():
    codigos = [
        "CC-160-001",
        "CC-160-005~D99",
        "CC-999-010",
        "OTRO-001",
    ]
    assert compute_next_codigo_insumo(codigos, "160") == "CC-160-002"


def test_compute_next_padding_tres_digitos_y_mas():
    assert compute_next_codigo_insumo(["CC-7-099"], "7") == "CC-7-100"
    assert compute_next_codigo_insumo(["cc-7-100"], "7") == "CC-7-101"


def test_codigo_liberado_para_baja():
    assert codigo_liberado_para_baja({"id": 12, "codigo": "CC-160-001"}) == "CC-160-001~D12"
    assert codigo_liberado_para_baja({"id": 12, "codigo": "CC-160-001~D12"}) == "CC-160-001~D12"
