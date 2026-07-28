"""FO-EO-04: umbral single-pass vs batch y política de volumen."""
from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


def _import_informes_with_stubs():
    """Misma estrategia que test_cc_mes_002_completo (evita arrancar main/mail)."""
    if "informes" in sys.modules:
        return sys.modules["informes"]

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


def test_fo_eo_04_single_pass_preferred_volume_gate(monkeypatch):
    inf = _import_informes_with_stubs()
    monkeypatch.delenv("FO_EO04_PDF_SINGLE_PASS", raising=False)
    monkeypatch.setenv("FO_EO04_PDF_SINGLE_PASS_MAX_PAGES", "24")

    assert inf._fo_eo_04_pdf_single_pass_preferred(10) is True
    assert inf._fo_eo_04_pdf_single_pass_preferred(24) is True
    assert inf._fo_eo_04_pdf_single_pass_preferred(25) is False
    assert inf._fo_eo_04_pdf_single_pass_preferred(335) is False


def test_fo_eo_04_single_pass_force_and_off(monkeypatch):
    inf = _import_informes_with_stubs()
    monkeypatch.setenv("FO_EO04_PDF_SINGLE_PASS", "0")
    assert inf._fo_eo_04_pdf_single_pass_preferred(5) is False

    monkeypatch.setenv("FO_EO04_PDF_SINGLE_PASS", "force")
    assert inf._fo_eo_04_pdf_single_pass_preferred(335) is True


def test_fo_eo_04_pdf_from_pages_uses_batch_when_volume_high(monkeypatch):
    """Alto volumen no debe pasar por un único _to_pdf monolítico."""
    inf = _import_informes_with_stubs()
    monkeypatch.delenv("FO_EO04_PDF_SINGLE_PASS", raising=False)
    monkeypatch.setenv("FO_EO04_PDF_SINGLE_PASS_MAX_PAGES", "4")
    monkeypatch.setenv("FO_EO04_PDF_USE_PROCESSES", "0")

    pages = [f"<html>P{i}</html>" for i in range(6)]
    calls: list[str] = []

    def fake_unlocked(html: str) -> bytes:
        calls.append(html)
        return f"%PDF-{len(calls)}".encode()

    with patch.object(inf, "_to_pdf_unlocked", side_effect=fake_unlocked), patch.object(
        inf, "_merge_pdf_bytes_tree", side_effect=lambda parts: b"".join(parts)
    ), patch.object(inf, "_to_pdf") as mock_to_pdf:
        out = inf._fo_eo_04_pdf_from_pages(pages)
    assert out == b"".join(f"%PDF-{i}".encode() for i in range(1, 7))
    assert len(calls) == 6
    mock_to_pdf.assert_not_called()


def test_fo_eo_04_pdf_from_pages_single_pass_when_small(monkeypatch):
    inf = _import_informes_with_stubs()
    monkeypatch.delenv("FO_EO04_PDF_SINGLE_PASS", raising=False)
    monkeypatch.setenv("FO_EO04_PDF_SINGLE_PASS_MAX_PAGES", "24")

    pages = ["<html>A</html>", "<html>B</html>"]

    with patch.object(inf, "_combine_html_pages", return_value="<html>JOIN</html>") as mock_join, patch.object(
        inf, "_to_pdf", return_value=b"%PDF-JOIN"
    ) as mock_to_pdf:
        out = inf._fo_eo_04_pdf_from_pages(pages)
    assert out == b"%PDF-JOIN"
    mock_join.assert_called_once_with(pages)
    mock_to_pdf.assert_called_once_with("<html>JOIN</html>")
