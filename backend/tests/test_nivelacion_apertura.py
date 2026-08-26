"""Validación de apertura vs circuito en curso (nivelación)."""
from topografia_utils import (
    modo_apertura_nivelacion,
    primera_vuelta_completa_nivelacion,
    validar_lecturas_nivelacion,
)


def _lect(orden, nombre, tipo_lectura, h_med, *, tipo_punto="estacion", desc="tramo"):
    return {
        "orden": orden,
        "nombre_punto": nombre,
        "tipo_punto": tipo_punto,
        "tipo_lectura": tipo_lectura,
        "abscisa": "0",
        "descripcion_punto": desc,
        "hilo_medio": h_med,
        "lectura": h_med,
    }


def test_modo_apertura_sin_flag():
    assert modo_apertura_nivelacion({}, [], "electronico") is True
    assert modo_apertura_nivelacion({"circuito_abierto_at": None}, [], "electronico") is True


def test_primera_vuelta_y_modo():
    lecturas = [
        _lect(1, "BM1", "V+", 1.0, tipo_punto="BM", desc="amarre"),
        _lect(2, "P2", "V-", 0.9),
    ]
    assert primera_vuelta_completa_nivelacion(lecturas, "electronico") is True
    assert modo_apertura_nivelacion({"circuito_abierto_at": "2026-01-01"}, lecturas, "electronico") is False
    assert modo_apertura_nivelacion({"circuito_abierto_at": "2026-01-01"}, lecturas[:1], "electronico") is True


def test_validar_apertura_permite_vplus_bm_y_vminus_otro():
    lecturas = [
        _lect(1, "BM1", "V+", 1.0, tipo_punto="BM", desc="amarre"),
        _lect(2, "P2", "V-", 0.9),
    ]
    assert validar_lecturas_nivelacion(lecturas, "electronico", "BM1", modo_apertura=True) == []


def test_validar_en_curso_bloquea_vplus_sin_vista_ultima():
    lecturas = [
        _lect(1, "BM1", "V+", 1.0, tipo_punto="BM", desc="amarre"),
        _lect(2, "P2", "V+", 0.8),
    ]
    err = validar_lecturas_nivelacion(lecturas, "electronico", "BM1", modo_apertura=False)
    assert any("V+" in e and "Vi" in e for e in err)


def test_validar_bm_sola_con_vplus_en_curso():
    """Única fila BM con V+: no se bloquea (amarre de apertura)."""
    lecturas = [_lect(1, "BM1", "V+", 1.0, tipo_punto="BM", desc="amarre")]
    assert validar_lecturas_nivelacion(lecturas, "electronico", "BM1", modo_apertura=False) == []
