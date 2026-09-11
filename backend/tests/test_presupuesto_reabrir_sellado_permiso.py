"""Permiso y reglas de reapertura de registros sellados en presupuesto."""
import os

os.environ.setdefault("SUPABASE_URL", "https://xxxx.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")


def test_puede_reabrir_desarrollador(monkeypatch):
    import main

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: True)
    monkeypatch.setattr(main, "_cargo_permiso_editar_registros_presupuesto", lambda *_a, **_k: False)
    assert main._puede_reabrir_presupuesto_sellado({"sub": "1"}, 2) is True


def test_puede_reabrir_con_permiso_editar(monkeypatch):
    import main

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: False)
    monkeypatch.setattr(main, "_cargo_permiso_editar_registros_presupuesto", lambda *_a, **_k: True)
    assert main._puede_reabrir_presupuesto_sellado({"sub": "9", "rol_nombre": "Interventoría"}, 2) is True


def test_puede_reabrir_sin_permiso(monkeypatch):
    import main

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: False)
    monkeypatch.setattr(main, "_cargo_permiso_editar_registros_presupuesto", lambda *_a, **_k: False)
    assert main._puede_reabrir_presupuesto_sellado({"sub": "9", "rol_nombre": "Interventoría"}, 2) is False


def test_puede_reabrir_no_exige_rol_contratista(monkeypatch):
    import main

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: False)
    monkeypatch.setattr(main, "_cargo_permiso_editar_registros_presupuesto", lambda *_a, **_k: True)
    monkeypatch.setattr(main, "_es_rol_contratista_ppto", lambda _u: False)
    assert main._puede_reabrir_presupuesto_sellado({"sub": "3", "rol_nombre": "Residente Interventoría"}, 5) is True


def test_competencia_no_es_campo_sustantivo_ni_reapertura():
    """Competencia es clasificación: no debe exigir motivo ni contar como reapertura."""
    import main

    assert "competencia" not in main._PPTO_CT_SUBSTANTIVE
    assert "competencia" not in main._PPTO_REABRIR_CAMPOS
    prev = {"competencia": "IDU", "revisado": "Aprobado", "capitulo": "1", "item": "1.1"}
    assert main._ppto_substantive_contractor_fields_changed(prev, {"competencia": "ETB"}) is False
    assert main._ppto_substantive_contractor_fields_changed(prev, {"capitulo": "2"}) is True
