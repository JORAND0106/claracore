"""Títulos institucionales de tema (fallback local)."""

from seguimiento_service import _limpiar_titulo_tema, titulo_tema_desde_texto


def test_titulo_tema_desde_texto_toma_primera_frase():
    t = titulo_tema_desde_texto(
        "Se requiere reforzar el drenaje perimetral del acceso norte. "
        "Además se pedirá inspección."
    )
    assert "drenaje" in t.lower()
    assert "Además" not in t
    assert len(t) <= 80


def test_limpiar_titulo_quita_prefijo_tema():
    assert _limpiar_titulo_tema('Tema 1: Avance de obra') == 'Avance de obra'
    assert _limpiar_titulo_tema('"Control de calidad"') == 'Control de calidad'
