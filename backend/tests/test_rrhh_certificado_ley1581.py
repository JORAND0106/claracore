"""Certificado documental — plantilla incluye Ley 1581 de 2012."""
from __future__ import annotations

import os
import re

_ASSETS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "assets",
    "rrhh_certificado_documental_plantilla.txt",
)


def test_plantilla_incluye_ley_1581():
    assert os.path.isfile(_ASSETS)
    with open(_ASSETS, "r", encoding="utf-8") as fh:
        txt = fh.read()
    assert "Ley 1581 de 2012" in txt
    assert "tratamiento de sus datos personales" in txt
    assert "Decreto 1377" in txt
    assert "relación laboral" in txt
    # Debe aparecer como párrafo propio (separado por línea en blanco) antes de la firma
    assert re.search(
        r"Ley 1581 de 2012[\s\S]+En constancia de lo anterior",
        txt,
    )


def test_plantilla_clausula_coincide_con_constante_frontend():
    """Misma redacción que CLAUSULA_LEY_1581 en rrhhCicloLogic.js."""
    with open(_ASSETS, "r", encoding="utf-8") as fh:
        txt = fh.read()
    expected = (
        "Asimismo, el colaborador autoriza el tratamiento de sus datos personales "
        "conforme a la Ley 1581 de 2012 y su reglamentación (Decreto 1377 de 2013 "
        "y normas que la complementen, modifiquen o sustituyan), para los fines "
        "propios de la relación laboral y las obligaciones legales derivadas de la misma."
    )
    assert expected in txt
