"""Tests del generador de contraseña temporal PRO."""
from password_reset_email import generar_password_temporal, enlace_reset_app


def test_generar_password_longitud_y_clases():
    pwd = generar_password_temporal(14)
    assert len(pwd) >= 12
    assert any(c.isupper() for c in pwd)
    assert any(c.islower() for c in pwd)
    assert any(c.isdigit() for c in pwd)
    assert any(c in "!@#$%&*+-=" for c in pwd)


def test_generar_password_unicidad():
    a = generar_password_temporal()
    b = generar_password_temporal()
    assert a != b


def test_enlace_reset_incluye_email():
    url = enlace_reset_app("user@example.com")
    assert "reset=1" in url
    assert "user%40example.com" in url or "user@example.com" in url
