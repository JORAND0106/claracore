"""Pruebas de carpeta de esquema, tokens temporales y aislamiento por contrato."""
from __future__ import annotations

import time

import esquema_assets_service as svc


def test_folder_prefix_legible():
    p = svc.folder_prefix(
        42,
        "Bitácora",
        reporte_id=7,
        reporte_nombre="Entrada",
        registro_id=15,
        registro_nombre="Excavación",
    )
    assert p.startswith("esquemas/42/")
    assert "7-" in p or p.endswith("/7") or "/7-" in p
    assert "15" in p


def test_assert_path_in_contrato_aisla():
    ok = svc.assert_path_in_contrato("esquemas/10/bitacora/doc/reg/a.png", 10)
    assert ok.endswith("a.png")
    try:
        svc.assert_path_in_contrato("esquemas/99/bitacora/doc/reg/a.png", 10)
        assert False, "debía rechazar otro contrato"
    except PermissionError:
        pass


def test_temp_token_vence_y_firma():
    path = "esquemas/5/sicoe/1/2/esquema_1.png"
    minted = svc.mint_temp_token(path, 5, ttl_seconds=120)
    assert svc.verify_temp_token(path, 5, minted["token"]) is True
    # Otro contrato → rechazo
    assert svc.verify_temp_token(path, 9, minted["token"]) is False
    # Token manipulado
    assert svc.verify_temp_token(path, 5, minted["token"] + "x") is False
    # Vencido
    expired = f"{int(time.time()) - 10}.{minted['token'].split('.', 1)[1]}"
    assert svc.verify_temp_token(path, 5, expired) is False


def test_file_name_kinds():
    assert svc.file_name("pdf", "Muro", 1).endswith(".pdf")
    assert svc.file_name("dxf", "Muro", 1).endswith(".dxf")
    assert svc.file_name("scene", "Muro", 1).endswith(".scene.json")
