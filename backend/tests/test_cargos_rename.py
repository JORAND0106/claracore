"""Tests — validación de nombre de cargo (crear / renombrar)."""
from __future__ import annotations

from cargos_service import normalizar_nombre_cargo, validar_nombre_cargo


def test_normalizar_colapsa_espacios():
    assert normalizar_nombre_cargo("  Residente   de  obra ") == "Residente de obra"


def test_vacio_rechazado():
    nom, err = validar_nombre_cargo("   ", nombres_existentes=["Residente"])
    assert nom is None
    assert "vacío" in (err or "").lower()


def test_duplicado_case_insensitive():
    nom, err = validar_nombre_cargo(
        "residente",
        nombres_existentes=["Residente", "Interventor"],
    )
    assert nom is None
    assert "ya existe" in (err or "").lower()


def test_renombrar_mismo_id_permite_mismo_nombre():
    limpio, err = validar_nombre_cargo(
        "Residente",
        nombres_existentes=[],
        cargo_id_excluir=5,
        existentes_con_id=[(5, "Residente"), (8, "Interventor")],
    )
    assert err is None
    assert limpio == "Residente"


def test_renombrar_a_otro_existente_falla():
    limpio, err = validar_nombre_cargo(
        "Interventor",
        nombres_existentes=[],
        cargo_id_excluir=5,
        existentes_con_id=[(5, "Residente"), (8, "Interventor")],
    )
    assert limpio is None
    assert "ya existe" in (err or "").lower()


def test_renombrar_ok():
    limpio, err = validar_nombre_cargo(
        "Residente de obra",
        nombres_existentes=[],
        cargo_id_excluir=5,
        existentes_con_id=[(5, "Residente"), (8, "Interventor")],
    )
    assert err is None
    assert limpio == "Residente de obra"
