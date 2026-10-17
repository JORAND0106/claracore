"""Tests — avance documental 4 grupos para grilla RRHH."""
from __future__ import annotations

from unittest.mock import MagicMock

from rrhh_docs_fill import (
    _fill_for_trabajador,
    attach_docs_fill,
    empty_docs_fill,
)
from rrhh_docs_obligatoriedad import (
    es_doc_opcional,
    iniciales_empresa,
    nombre_corto_colaborador,
)


def test_empty_docs_fill():
    e = empty_docs_fill()
    assert set(e.keys()) == {"contrato", "soporte", "ingreso", "afiliacion"}
    assert e["contrato"]["ratio"] == 0.0


def test_opcionales_definidos():
    assert es_doc_opcional("soporte", "hoja_vida")
    assert es_doc_opcional("soporte", "certificados")
    assert es_doc_opcional("afiliacion", "cert_caja")
    assert not es_doc_opcional("soporte", "cedula")
    assert not es_doc_opcional("afiliacion", "cert_eps")
    assert not es_doc_opcional("afiliacion", "cert_arl")


def test_fill_excluye_opcionales_vacios_del_denominador():
    """Hoja de vida / certificados / caja vacíos no restan avance."""
    trab = {"id": 1, "doc_validacion_estado": "pendiente"}
    docs = [
        ("soporte", "cedula"),
        # sin hoja_vida ni certificados
        ("ingreso", "induccion"),
        ("ingreso", "reglamento"),
        ("ingreso", "examen_medico"),
        ("afiliacion", "cert_eps"),
        ("afiliacion", "cert_pension"),
        ("afiliacion", "cert_arl"),
        ("afiliacion", "cert_cesantias"),
        # sin caja
    ]
    custom = {"soporte": set(), "ingreso": set()}
    fill = _fill_for_trabajador(trab, docs, tiene_contrato=True, custom=custom)
    assert fill["contrato"]["ratio"] == 1.0
    # soporte: solo cédula cuenta (1/1); hv y certificados opcionales vacíos fuera
    assert fill["soporte"] == {"filled": 1, "total": 1, "ratio": 1.0}
    assert fill["ingreso"]["ratio"] == 1.0
    # afiliacion: 4 obligatorias cargadas; caja opcional vacía no resta
    assert fill["afiliacion"] == {"filled": 4, "total": 4, "ratio": 1.0}


def test_afiliacion_obligatorias_siempre_en_denominador():
    """EPS/ARL/Pensión/Cesantías faltantes restan aunque no haya entidad."""
    trab = {"id": 1, "doc_validacion_estado": "pendiente", "eps": "", "pension": ""}
    fill = _fill_for_trabajador(
        trab, [], tiene_contrato=False, custom={"soporte": set(), "ingreso": set()},
    )
    assert fill["afiliacion"]["total"] == 4
    assert fill["afiliacion"]["filled"] == 0
    assert fill["afiliacion"]["ratio"] == 0.0


def test_fill_prestacion_servicios_mide_planilla():
    """4.º segmento: planilla de pago en lugar de certificaciones."""
    trab = {
        "id": 3,
        "doc_validacion_estado": "pendiente",
        "tipo_contrato": "Prestación de servicios",
    }
    fill_vacio = _fill_for_trabajador(
        trab, [], tiene_contrato=True, custom={"soporte": set(), "ingreso": set()},
    )
    assert fill_vacio["afiliacion"] == {"filled": 0, "total": 1, "ratio": 0.0}

    fill_ok = _fill_for_trabajador(
        trab,
        [("afiliacion", "planilla_pago"), ("afiliacion", "cert_eps")],
        tiene_contrato=True,
        custom={"soporte": set(), "ingreso": set()},
    )
    # Solo planilla cuenta; cert_* cargada no afecta el denominador.
    assert fill_ok["afiliacion"] == {"filled": 1, "total": 1, "ratio": 1.0}


def test_opcional_cargado_suma_al_avance():
    trab = {"id": 1, "doc_validacion_estado": "pendiente"}
    docs = [
        ("soporte", "cedula"),
        ("soporte", "hoja_vida"),
    ]
    fill = _fill_for_trabajador(
        trab, docs, tiene_contrato=False, custom={"soporte": set(), "ingreso": set()},
    )
    # cédula + hoja_vida cargada
    assert fill["soporte"] == {"filled": 2, "total": 2, "ratio": 1.0}


def test_aprobado_llena_todo():
    trab = {"id": 2, "doc_validacion_estado": "aprobado"}
    fill = _fill_for_trabajador(trab, [], tiene_contrato=False, custom={"soporte": set(), "ingreso": set()})
    for g in ("contrato", "soporte", "ingreso", "afiliacion"):
        assert fill[g]["ratio"] == 1.0


def test_nombre_corto_e_iniciales():
    assert nombre_corto_colaborador("María Fernanda", "López Gómez") == "María López"
    assert nombre_corto_colaborador("Ana", "Díaz") == "Ana Díaz"
    assert iniciales_empresa("OC Ingenieria y Consultoria SAS") == "OIC"
    assert iniciales_empresa("") == "—"


def test_attach_docs_fill_batch(monkeypatch):
    items = [
        {"id": 10, "doc_validacion_estado": "pendiente", "eps": ""},
        {"id": 11, "doc_validacion_estado": "aprobado"},
    ]
    sb = MagicMock()

    def fake_custom(_sb, _cid):
        return {"soporte": set(), "ingreso": set()}

    def fake_docs(_sb, _cid, ids):
        return {
            10: [("soporte", "cedula")],  # opcionales vacíos no restan
            11: [],
        }

    def fake_contratos(_sb, _cid, ids):
        return {10}

    monkeypatch.setattr("rrhh_docs_fill._custom_tipos_por_categoria", fake_custom)
    monkeypatch.setattr("rrhh_docs_fill._fetch_docs_batch", fake_docs)
    monkeypatch.setattr("rrhh_docs_fill._fetch_contratos_batch", fake_contratos)

    out = attach_docs_fill(sb, 1, items)
    assert out[0]["docs_fill"]["contrato"]["ratio"] == 1.0
    assert out[0]["docs_fill"]["soporte"]["ratio"] == 1.0
    assert out[1]["docs_fill"]["soporte"]["ratio"] == 1.0  # aprobado
