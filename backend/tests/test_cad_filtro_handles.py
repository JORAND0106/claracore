"""Filtro inverso: handles del plano → ids de presupuesto."""
from cad_filtro_handles import (
    MSG_SIN_COINCIDENCIAS,
    MSG_SIN_SELECCION,
    MSG_SIN_VISIBLES,
    buscar_ids_por_handles,
    consulta_or_handles,
    elegir_filtro_pendiente,
    ids_a_cerrar,
    ids_desde_payload,
    mensaje_filtro,
    normalizar_handles,
    payload_filtro_activo,
    resolver_usuario_filtro,
    trozos_handles,
)


def test_normalizar_handles_dedup_y_texto():
    assert normalizar_handles([" 3e377 ", "3E377", "{3E378}", "handle:3e379", "", None, "NO-ES"]) == [
        "3E377",
        "3E378",
        "3E379",
    ]


def test_buscar_por_entidad_o_texto_sin_duplicar_baja():
    rows = [
        {"id": 31886, "contrato_id": 7, "ent_handle": "3e377", "txt_handle": "3E378", "dado_de_baja": False},
        {"id": 31887, "contrato_id": 7, "ent_handle": "AA01", "txt_handle": "3E379", "dado_de_baja": False},
        {"id": 31888, "contrato_id": 7, "ent_handle": "BB02", "txt_handle": "", "dado_de_baja": True},
        {"id": 99999, "contrato_id": 8, "ent_handle": "3E377", "txt_handle": "", "dado_de_baja": False},
        {"id": 1, "contrato_id": 7, "ent_handle": "CC03", "txt_handle": "DD04", "dado_de_baja": False},
    ]
    # Geometría y texto del mismo registro + texto de otro. La baja y otro contrato no entran.
    ids = buscar_ids_por_handles(rows, ["3E377", "3E378", "3e379", "BB02"], contrato_id=7)
    assert ids == [31886, 31887]


def test_sin_coincidencias():
    rows = [{"id": 1, "contrato_id": 7, "ent_handle": "AAA", "txt_handle": "BBB", "dado_de_baja": False}]
    assert buscar_ids_por_handles(rows, ["3E377"], contrato_id=7) == []
    assert mensaje_filtro([], 2) == MSG_SIN_COINCIDENCIAS
    assert mensaje_filtro([], 0) == MSG_SIN_SELECCION
    assert mensaje_filtro([], 2, sin_visibles=True) == MSG_SIN_VISIBLES
    assert mensaje_filtro([10], 1) is None


def test_payload_y_cola_por_usuario():
    payload = payload_filtro_activo([31886, 31887], 15, 3)
    assert payload["ids"] == [31886, 31887]
    assert payload["usuario_id"] == 15
    assert payload["sin_coincidencias"] is False
    assert ids_desde_payload(payload) == [31886, 31887]
    assert ids_desde_payload({"ids": []}) == []

    rows = [
        {"id": 1, "tipo": "filtro_activo", "estado": "pendiente", "payload": {"ids": [1], "usuario_id": 15}},
        {"id": 2, "tipo": "zoom_pkid", "estado": "pendiente", "payload": {"usuario_id": 15}},
        {"id": 4, "tipo": "filtro_activo", "estado": "pendiente", "payload": {"ids": [9], "usuario_id": 15}},
        {"id": 3, "tipo": "filtro_activo", "estado": "pendiente", "usuario_id": 99, "payload": {"ids": [8], "usuario_id": 99}},
        {"id": 5, "tipo": "filtro_activo", "estado": "procesado", "payload": {"ids": [7], "usuario_id": 15}},
    ]
    elegido = elegir_filtro_pendiente(rows, 15)
    assert elegido["id"] == 4
    assert ids_a_cerrar(rows, 15) == [1, 4]
    assert elegir_filtro_pendiente(rows, 99)["id"] == 3
    assert elegir_filtro_pendiente(rows, 1) is None


def test_resolver_usuario_prioriza_jwt():
    assert resolver_usuario_filtro({"sub": "12"}, 99, 5) == 12
    assert resolver_usuario_filtro(None, 15, 0) == 15
    assert resolver_usuario_filtro(None, None, "8") == 8
    assert resolver_usuario_filtro(None, 0, 0) == 0


def test_consulta_or_en_trozos():
    handles = [f"{i:X}" for i in range(1, 46)]
    partes = trozos_handles(handles, 40)
    assert len(partes) == 2
    assert len(partes[0]) == 40
    expr = consulta_or_handles(["3E377"])
    assert expr == "ent_handle.ilike.3E377,txt_handle.ilike.3E377"
