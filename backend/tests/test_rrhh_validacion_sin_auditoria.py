"""Aprobación sin auditoría + faltantes obligatorios + flag."""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

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
sys.modules.pop("rrhh_docs_service", None)
sys.modules.pop("rrhh_documentacion_service", None)
sys.modules.pop("rrhh_feature_flags", None)

from rrhh_docs_obligatoriedad import (  # noqa: E402
    docs_obligatorios_esperados,
    docs_obligatorios_faltantes,
)
from rrhh_feature_flags import auditoria_documental_activa  # noqa: E402
from rrhh_documentacion_service import (  # noqa: E402
    _mensaje_faltantes,
    consolidar_documentacion,
)


def test_auditoria_flag_off_por_defecto():
    assert auditoria_documental_activa() is False


def test_faltantes_opcionales_no_cuentan():
    trab = {"tipo_contrato": "Término fijo"}
    faltan = docs_obligatorios_faltantes(
        trab,
        {("soporte", "cedula"), ("ingreso", "induccion")},
        tiene_contrato=True,
    )
    tipos = {(f["categoria"], f["tipo"]) for f in faltan}
    assert ("soporte", "hoja_vida") not in tipos
    assert ("soporte", "certificados") not in tipos
    assert ("afiliacion", "cert_caja") not in tipos
    assert ("afiliacion", "cert_eps") in tipos
    assert ("contrato_laboral", "contrato_laboral") not in tipos
    assert ("soporte", "cedula") not in tipos


def test_faltantes_prestacion_exige_planilla():
    trab = {"tipo_contrato": "Prestación de servicios"}
    esperados = docs_obligatorios_esperados(trab)
    tipos = {(e["categoria"], e["tipo"]) for e in esperados}
    assert ("afiliacion", "planilla_pago") in tipos
    assert ("afiliacion", "cert_eps") not in tipos
    faltan = docs_obligatorios_faltantes(trab, set(), tiene_contrato=False)
    assert any(f["tipo"] == "planilla_pago" for f in faltan)
    assert not any(f["tipo"] == "cert_eps" for f in faltan)


def test_mensaje_faltantes():
    msg = _mensaje_faltantes([
        {"label": "Cédula / Documento de identidad", "tipo": "cedula"},
        {"label": "Contrato laboral", "tipo": "contrato_laboral"},
    ])
    assert "Cédula" in msg
    assert "Contrato laboral" in msg


def test_consolidar_bloqueado_con_flag_off():
    try:
        consolidar_documentacion(None, 1, 1)
        assert False, "debía fallar"
    except ValueError as exc:
        assert "deshabilitada" in str(exc).lower()
