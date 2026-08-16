"""Tests unitarios — cuota de almacenamiento por contrato."""
from storage_quota_service import (
    TIPO_DOCUMENTOS,
    TIPO_FOTOS,
    TIPO_OTROS,
    aggregate_blob_usage,
    build_quota_detail,
    classify_storage_tipo,
    contract_blob_prefixes,
    format_bytes,
    infer_contrato_id_from_path,
    resolve_limite_bytes,
)


def test_format_bytes():
    assert format_bytes(0) == "0 B"
    assert format_bytes(1024) == "1.00 KB"
    assert "GB" in format_bytes(5 * 1024**3)


def test_classify_fotos_por_path_y_mime():
    assert classify_storage_tipo(blob_path="12/fotos/foto_1.jpg") == TIPO_FOTOS
    assert classify_storage_tipo(blob_path="12/graficos/grafico_2.jpg") == TIPO_FOTOS
    assert classify_storage_tipo(content_type="image/jpeg") == TIPO_FOTOS
    assert classify_storage_tipo(hint="fotos") == TIPO_FOTOS


def test_classify_documentos():
    assert (
        classify_storage_tipo(blob_path="contratos-documentos/9/firmados/v001.pdf")
        == TIPO_DOCUMENTOS
    )
    assert classify_storage_tipo(content_type="application/pdf") == TIPO_DOCUMENTOS
    assert (
        classify_storage_tipo(blob_path="almacen-soportes/5/oc/1/factura.pdf")
        == TIPO_DOCUMENTOS
    )


def test_classify_otros_y_hint():
    assert classify_storage_tipo(blob_path="algo/raro.bin") == TIPO_OTROS
    assert classify_storage_tipo(hint="documentos", content_type="image/png") == TIPO_DOCUMENTOS


def test_infer_contrato_id():
    assert infer_contrato_id_from_path("42/fotos/foto_1.jpg") == 42
    assert infer_contrato_id_from_path("contratos-ordenes-pago/7/corte-0001/orden.pdf") == 7
    assert infer_contrato_id_from_path("almacen-soportes/99/oc/1/x.pdf") == 99
    assert infer_contrato_id_from_path("perfiles/3.jpg") is None
    assert infer_contrato_id_from_path("contabilidad-soportes/1/a.pdf") is None


def test_resolve_limite_prioridad():
    assert resolve_limite_bytes(umbral_gratuito_bytes=5_000) == 5_000
    assert (
        resolve_limite_bytes(umbral_gratuito_bytes=5_000, tarifa_capacidad_bytes=100_000)
        == 100_000
    )
    assert (
        resolve_limite_bytes(
            umbral_gratuito_bytes=5_000,
            tarifa_capacidad_bytes=100_000,
            limite_override_bytes=50_000,
        )
        == 50_000
    )


def test_build_quota_detail_code():
    d = build_quota_detail(
        contrato_id=1,
        used_bytes=100,
        limit_bytes=100,
        needed_bytes=10,
        bytes_fotos=60,
        bytes_documentos=40,
    )
    assert d["code"] == "storage_quota_exceeded"
    assert d["remaining_bytes"] == 0
    assert "límite" in d["message"].lower() or "limite" in d["message"].lower()


def test_aggregate_blob_usage_por_contrato_y_tipo():
    entries = [
        ("12/fotos/foto_1.jpg", 1000, "image/jpeg"),
        ("12/graficos/grafico_1.jpg", 500, "image/jpeg"),
        ("contratos-documentos/12/firmados/v001.pdf", 2000, "application/pdf"),
        ("almacen-soportes/9/oc/1/factura.pdf", 300, "application/pdf"),
        ("perfiles/1.jpg", 9999, "image/jpeg"),  # global → omitido
        ("12/fotos/vacio.jpg", 0, "image/jpeg"),  # tamaño 0 → omitido
        ("algo/raro.bin", 50, "application/octet-stream"),  # sin contrato
    ]
    totals = aggregate_blob_usage(entries)
    assert set(totals.keys()) == {12, 9}
    assert totals[12]["bytes_fotos"] == 1500
    assert totals[12]["bytes_documentos"] == 2000
    assert totals[12]["bytes_otros"] == 0
    assert totals[12]["bytes_total"] == 3500
    assert totals[12]["blob_count"] == 3
    assert totals[9]["bytes_documentos"] == 300
    assert totals[9]["blob_count"] == 1


def test_contract_blob_prefixes():
    prefs = contract_blob_prefixes(42)
    assert "42/" in prefs
    assert "contratos-documentos/42/" in prefs
    assert "almacen-soportes/42/" in prefs
