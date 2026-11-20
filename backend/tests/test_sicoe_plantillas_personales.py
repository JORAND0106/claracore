"""Alcance personal de plantillas de reporte SicoeObra."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sicoe_plantillas_personales import (  # noqa: E402
    plantilla_creador_identificable,
    plantilla_es_del_usuario,
    resumir_plantillas_sin_creador,
    usuario_id_desde_token,
)


def test_usuario_id_token():
    assert usuario_id_desde_token({"sub": "42"}) == 42
    assert usuario_id_desde_token({"id": 7}) == 7
    assert usuario_id_desde_token({"sub": "0"}) is None
    assert usuario_id_desde_token({}) is None


def test_creador_identificable():
    assert plantilla_creador_identificable({"creado_por": 3}) is True
    assert plantilla_creador_identificable({"creado_por": None}) is False
    assert plantilla_creador_identificable({"creado_por": 0}) is False
    assert plantilla_creador_identificable({"creado_por": ""}) is False


def test_es_del_usuario():
    assert plantilla_es_del_usuario({"creado_por": 9}, 9) is True
    assert plantilla_es_del_usuario({"creado_por": "9"}, 9) is True
    assert plantilla_es_del_usuario({"creado_por": 8}, 9) is False


def test_resumir_huerfanas():
    out = resumir_plantillas_sin_creador(
        [
            {"id": 1, "nombre": "A", "contrato_id": 1, "capitulo": "1", "creado_por": 5},
            {"id": 2, "nombre": "B", "contrato_id": 1, "capitulo": "1", "creado_por": None},
            {"id": 3, "nombre": "C", "contrato_id": 1, "capitulo": "2", "creado_por": 0},
        ]
    )
    assert out["count"] == 2
    assert [p["id"] for p in out["plantillas"]] == [2, 3]
