"""Checklist «Documentación adjunta» del certificado consolidado."""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

# azure SDK no está en el entorno mínimo de tests unitarios
for _name in (
    "azure",
    "azure.core",
    "azure.core.exceptions",
    "azure.storage",
    "azure.storage.blob",
):
    sys.modules.setdefault(_name, MagicMock())

_fake_abs = types.ModuleType("azure_blob_storage")


def _noop(*_a, **_k):
    return None


def _path(*parts):
    return "/".join(str(p) for p in parts)


_fake_abs.delete_blob_private = _noop
_fake_abs.download_blob_bytes_private = lambda *_a, **_k: b""
_fake_abs.upload_blob_private = _noop
_fake_abs.path_rrhh_doc_consolidado = _path
_fake_abs.path_rrhh_contrato_laboral = _path
_fake_abs.path_rrhh_trabajador_documento = _path
sys.modules["azure_blob_storage"] = _fake_abs
# Forzar reimport limpio si otro test ya cargó el módulo real a medias
sys.modules.pop("rrhh_docs_service", None)
sys.modules.pop("rrhh_documentacion_service", None)

from rrhh_documentacion_service import (  # noqa: E402
    _checklist_items,
    _estado_documento_checklist,
)


def test_estado_cargado_es_adjunto_aunque_auditoria_falle():
    """La tabla no usa auditoría: cargado → ADJUNTO siempre."""
    assert _estado_documento_checklist(
        aplica=True, adjunto=True, auditoria_ok=False, opcional=False,
    ) == "ADJUNTO"
    assert _estado_documento_checklist(
        aplica=True, adjunto=True, auditoria_ok=True, opcional=False,
    ) == "ADJUNTO"
    assert _estado_documento_checklist(
        aplica=True, adjunto=True, auditoria_ok=None, opcional=True,
    ) == "ADJUNTO"


def test_estado_obligatorio_sin_cargar_es_no_adjunto():
    assert _estado_documento_checklist(
        aplica=True, adjunto=False, opcional=False,
    ) == "NO ADJUNTO"


def test_estado_opcional_sin_cargar_es_no_aplica():
    assert _estado_documento_checklist(
        aplica=True, adjunto=False, opcional=True,
    ) == "NO APLICA"


def test_estado_no_aplica_cuando_no_aplica():
    assert _estado_documento_checklist(
        aplica=False, adjunto=False, opcional=False,
    ) == "NO APLICA"


def _docs(*pairs):
    """pairs: (categoria, tipo) → docs vigentes."""
    out = []
    for i, (cat, tipo) in enumerate(pairs, start=1):
        out.append({
            "id": i,
            "categoria": cat,
            "tipo": tipo,
            "vigente": True,
            "eliminado_en": None,
        })
    return out


def test_checklist_refleja_solo_presencia_ignora_auditoria():
    trab = {
        "id": 1,
        "doc_auditoria_ok": False,
        "eps": "Sura",
        "arl": "Sura",
        "pension": "Porvenir",
        "cesantias": "Porvenir",
    }
    docs = _docs(
        ("soporte", "cedula"),
        ("soporte", "hoja_vida"),
        ("afiliacion", "cert_eps"),
        ("afiliacion", "cert_caja"),
    )
    items = _checklist_items(trab, docs, tiene_contrato=True)
    by = {(i["categoria"], i["tipo"]): i["estado"] for i in items}

    assert by[("contrato_laboral", "contrato_laboral")] == "ADJUNTO"
    assert by[("soporte", "cedula")] == "ADJUNTO"
    assert by[("soporte", "hoja_vida")] == "ADJUNTO"
    assert by[("afiliacion", "cert_eps")] == "ADJUNTO"
    assert by[("afiliacion", "cert_caja")] == "ADJUNTO"
    # Obligatorios faltantes
    assert by[("ingreso", "induccion")] == "NO ADJUNTO"
    assert by[("afiliacion", "cert_arl")] == "NO ADJUNTO"
    # Opcionales vacíos → NO APLICA (nunca NO ADJUNTO)
    assert by[("soporte", "certificados")] == "NO APLICA"


def test_checklist_opcionales_vacios_nunca_no_adjunto():
    trab = {"id": 2}
    items = _checklist_items(trab, [], tiene_contrato=False)
    by = {(i["categoria"], i["tipo"]): i["estado"] for i in items}
    assert by[("soporte", "hoja_vida")] == "NO APLICA"
    assert by[("soporte", "certificados")] == "NO APLICA"
    assert by[("afiliacion", "cert_caja")] == "NO APLICA"
    assert by[("contrato_laboral", "contrato_laboral")] == "NO ADJUNTO"
    assert by[("soporte", "cedula")] == "NO ADJUNTO"


def test_checklist_incluye_contrato_laboral_primero():
    items = _checklist_items({"id": 3}, [], tiene_contrato=False)
    assert items[0]["categoria"] == "contrato_laboral"
    assert items[0]["tipo"] == "contrato_laboral"
    assert items[0]["label"] == "Contrato laboral"


def test_checklist_prestacion_servicios_planilla_sin_certs():
    trab = {"id": 30, "tipo_contrato": "Prestación de servicios"}
    items = _checklist_items(
        trab,
        _docs(("afiliacion", "planilla_pago"), ("afiliacion", "cert_eps")),
        tiene_contrato=True,
    )
    by = {(i["categoria"], i["tipo"]): i["estado"] for i in items}
    assert ("afiliacion", "cert_eps") not in by
    assert ("afiliacion", "cert_arl") not in by
    assert by[("afiliacion", "planilla_pago")] == "ADJUNTO"


def test_checklist_tres_niveles_documentacion():
    """Tres perfiles: vacío, parcial, completo (opcionales incluidos)."""
    vacio = _checklist_items({"id": 10}, [], tiene_contrato=False)
    estados_vacio = {i["estado"] for i in vacio}
    assert "ADJUNTO" not in estados_vacio
    assert "NO ADJUNTO" in estados_vacio
    assert "NO APLICA" in estados_vacio

    parcial_docs = _docs(
        ("soporte", "cedula"),
        ("ingreso", "induccion"),
        ("afiliacion", "cert_eps"),
    )
    parcial = _checklist_items({"id": 11}, parcial_docs, tiene_contrato=True)
    by_p = {(i["categoria"], i["tipo"]): i["estado"] for i in parcial}
    assert by_p[("contrato_laboral", "contrato_laboral")] == "ADJUNTO"
    assert by_p[("soporte", "cedula")] == "ADJUNTO"
    assert by_p[("soporte", "hoja_vida")] == "NO APLICA"
    assert by_p[("afiliacion", "cert_arl")] == "NO ADJUNTO"

    completo_docs = _docs(
        ("soporte", "cedula"),
        ("soporte", "hoja_vida"),
        ("soporte", "certificados"),
        ("ingreso", "induccion"),
        ("ingreso", "reglamento"),
        ("ingreso", "examen_medico"),
        ("bancario", "certificacion_bancaria"),
        ("afiliacion", "cert_eps"),
        ("afiliacion", "cert_pension"),
        ("afiliacion", "cert_arl"),
        ("afiliacion", "cert_cesantias"),
        ("afiliacion", "cert_caja"),
    )
    completo = _checklist_items({"id": 12}, completo_docs, tiene_contrato=True)
    assert all(i["estado"] == "ADJUNTO" for i in completo if i["tipo"] != "otro")


def test_consistencia_con_celda_informe():
    """Mismo expediente → mismos semáforos que el informe de estado documental."""
    from rrhh_estado_documental_informe import _CELDA_FALTA, _CELDA_OK, _CELDA_OPCIONAL, _celda_doc

    docs = _docs(
        ("soporte", "cedula"),
        ("afiliacion", "cert_eps"),
    )
    items = _checklist_items({"id": 20}, docs, tiene_contrato=True)
    vigentes = {(d["categoria"], d["tipo"]) for d in docs}
    mapeo = {
        "ADJUNTO": _CELDA_OK,
        "NO ADJUNTO": _CELDA_FALTA,
        "NO APLICA": _CELDA_OPCIONAL,
    }
    for it in items:
        cat, tipo = it["categoria"], it["tipo"]
        if cat == "bancario":
            continue  # el informe no incluye bancario
        col = {"categoria": cat, "tipo": tipo}
        celda = _celda_doc(
            {}, col, vigentes=vigentes, tiene_contrato=True, aprobado=False,
        )
        assert celda == mapeo[it["estado"]], f"{cat}/{tipo}: {it['estado']} vs {celda}"
