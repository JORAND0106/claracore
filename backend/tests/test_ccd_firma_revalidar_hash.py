"""Re-firma tras invalidación: el hash del snapshot debe actualizarse."""
from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException


def _import_informes_with_stubs():
    if "informes" in sys.modules:
        del sys.modules["informes"]
    stubs = {
        "main": SimpleNamespace(
            get_current_user=lambda: None,
            get_current_user_optional=lambda: None,
        ),
        "mail_smtp": SimpleNamespace(try_send_text_email=lambda *a, **k: None),
    }
    saved = {}
    for name, mod in stubs.items():
        saved[name] = sys.modules.get(name)
        fake = ModuleType(name)
        for k, v in vars(mod).items():
            if not k.startswith("_"):
                setattr(fake, k, v)
        sys.modules[name] = fake
    for extra in ("passlib", "passlib.context", "jose", "python_jose"):
        if extra not in sys.modules:
            sys.modules[extra] = ModuleType(extra)
    try:
        import informes as inf  # noqa: WPS433
    finally:
        for name, prev in saved.items():
            if prev is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = prev
    return inf


def test_resolver_slots_reabre_todos_si_contenido_modificado():
    inf = _import_informes_with_stubs()
    cfg = {
        "elaboro_usuario_id": 11,
        "elaboro_nombre": "Ana",
        "reviso_usuario_id": 11,
        "reviso_nombre": "Ana",
        "aprobo_usuario_id": 33,
        "aprobo_nombre": "Pedro",
    }
    ana = {"sub": "11", "nombre": "Ana", "apellidos": "Pérez"}
    # Sin invalidación: solo pendientes (ninguno → 409).
    with pytest.raises(HTTPException) as ya:
        inf._resolver_slots_registrar_firma(
            "CC-MES-001", cfg, 11, ana, {"elaboro", "reviso"}, contenido_modificado=False
        )
    assert ya.value.status_code == 409
    # Con invalidación: reabre Elaboró y Revisó en un solo acto.
    slots = inf._resolver_slots_registrar_firma(
        "CC-MES-001", cfg, 11, ana, {"elaboro", "reviso"}, contenido_modificado=True
    )
    assert slots == ["elaboro", "reviso"]
    # Primera firma multi-rol: ambos vacíos → ambos.
    slots2 = inf._resolver_slots_registrar_firma(
        "CC-MES-001", cfg, 11, ana, set(), contenido_modificado=False
    )
    assert slots2 == ["elaboro", "reviso"]
    # Un ocupado: solo el pendiente.
    slots3 = inf._resolver_slots_registrar_firma(
        "CC-MES-001", cfg, 11, ana, {"elaboro"}, contenido_modificado=False
    )
    assert slots3 == ["reviso"]
    # Ajeno.
    with pytest.raises(HTTPException) as ajeno:
        inf._resolver_slots_registrar_firma(
            "CC-MES-001", cfg, 44, {"sub": "44", "nombre": "X", "apellidos": "Y"}, set()
        )
    assert ajeno.value.status_code == 400


def test_asegurar_snapshot_actualiza_hash_si_ya_existe():
    inf = _import_informes_with_stubs()
    updates: list = []

    class _Q:
        def __init__(self):
            self._ops = []

        def update(self, row):
            self._ops.append(("update", row))
            return self

        def eq(self, *a, **k):
            self._ops.append(("eq", a, k))
            return self

        def execute(self):
            updates.append(list(self._ops))
            return SimpleNamespace(data=[])

        def insert(self, row):
            raise AssertionError("no debe insertar si el snapshot ya existe")

    def fake_table(name):
        assert name == "ccd_documento_firma_snapshot"
        return _Q()

    # Snapshot ya existe → solo update de hash.
    inf._snapshot_key_corte = lambda *a, **k: {"contenido_hash": "OLD"}  # type: ignore
    inf._sb = SimpleNamespace(table=fake_table)  # type: ignore
    inf._asegurar_snapshot_con_hash_actual(
        1,
        "CC-MES-001",
        {"elaboro_nombre": "A"},
        corte_id=9,
        contenido_hash="NEWHASH",
    )
    assert updates, "debió actualizar contenido_hash"
    assert any(
        op[0] == "update" and op[1].get("contenido_hash") == "NEWHASH"
        for batch in updates
        for op in batch
        if op[0] == "update"
    )


def test_slot_pendiente_con_contenido_modificado():
    inf = _import_informes_with_stubs()
    cfg = {
        "elaboro_usuario_id": 11,
        "elaboro_nombre": "Ana",
        "reviso_usuario_id": 22,
        "reviso_nombre": "Luis",
    }
    ana = {"sub": "11", "nombre": "Ana", "apellidos": "X"}
    assert (
        inf._slot_firma_pendiente(cfg, 11, ana, "CC-MES-001", {"elaboro"}, contenido_modificado=False)
        is None
    )
    assert (
        inf._slot_firma_pendiente(cfg, 11, ana, "CC-MES-001", {"elaboro"}, contenido_modificado=True)
        == "elaboro"
    )


def test_firma_contenido_modificado_false_sin_hash():
    inf = _import_informes_with_stubs()
    inf._contenido_hash_guardado = lambda *a, **k: None  # type: ignore
    assert (
        inf._firma_contenido_modificado(1, "CC-MES-001", corte_id=1) is False
    )


def test_ciclo_invalidacion_y_revalidacion_por_hash():
    """Causa raíz: si el hash del snapshot no se refresca, el PDF sigue invalidado."""
    from ccd_firma_integridad import FIRMA_INVALIDADA_MARKER

    inf = _import_informes_with_stubs()
    estado = {"hash": "HASH_V1"}

    inf._contenido_hash_guardado = lambda *a, **k: estado["hash"]  # type: ignore
    inf._calcular_contenido_hash_documento = (  # type: ignore
        lambda *a, **k: estado.get("actual", "HASH_V1")
    )
    # Tras cambio de cantidades: hash actual ≠ guardado → invalidado.
    estado["actual"] = "HASH_V2"
    assert inf._firma_contenido_modificado(1, "CC-MES-001", corte_id=7) is True

    # Simula registro vigente pero contenido drift → marcador.
    inf._ccd_firma_registro_get = lambda *a, **k: {  # type: ignore
        "firma_imagen_url": "https://cdn.example/f.png"
    }
    uri = inf._firma_data_uri_para_slot_corte(
        1, 7, "CC-MES-001", "elaboro", 11, "Ana", {"sub": "11"}
    )
    assert uri == FIRMA_INVALIDADA_MARKER

    # Re-firma: actualizar hash del snapshot al actual.
    estado["hash"] = "HASH_V2"
    assert inf._firma_contenido_modificado(1, "CC-MES-001", corte_id=7) is False
    inf._fetch_img_data_uri = lambda url: "data:image/png;base64,XX"  # type: ignore
    uri2 = inf._firma_data_uri_para_slot_corte(
        1, 7, "CC-MES-001", "elaboro", 11, "Ana", {"sub": "11"}
    )
    assert uri2 == "data:image/png;base64,XX"
    assert uri2 != FIRMA_INVALIDADA_MARKER
