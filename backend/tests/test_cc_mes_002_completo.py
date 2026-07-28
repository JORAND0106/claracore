"""CC-MES-002 «todos los ítems»: fetch único, agrupación y PDF por lotes."""
from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch

from ccd_conciliacion import (
    _is_transient_supabase_disconnect,
    group_registros_memoria_por_item,
)


def test_group_registros_memoria_por_item_preserves_order_and_rows():
    regs = [
        {"item_numero": "2.01", "numero_registro": 1},
        {"item_numero": "1.10", "numero_registro": 2},
        {"item_numero": "2.01", "numero_registro": 3},
        {"item_numero": "  ", "numero_registro": 4},
        {"item_numero": "1.10", "numero_registro": 5},
    ]
    grouped = group_registros_memoria_por_item(regs)
    assert [k for k, _ in grouped] == ["2.01", "1.10"]
    assert [r["numero_registro"] for r in grouped[0][1]] == [1, 3]
    assert [r["numero_registro"] for r in grouped[1][1]] == [2, 5]


def test_is_transient_supabase_disconnect_detects_remote_protocol():
    class RemoteProtocolError(Exception):
        pass

    assert _is_transient_supabase_disconnect(RemoteProtocolError("Server disconnected")) is True
    assert _is_transient_supabase_disconnect(ValueError("dato inválido")) is False


def test_leer_paginado_retries_on_server_disconnected():
    from ccd_conciliacion import _leer_paginado

    class RemoteProtocolError(Exception):
        pass

    calls = {"n": 0}

    class _Q:
        def range(self, *_a, **_k):
            return self

        def execute(self):
            calls["n"] += 1
            if calls["n"] < 3:
                raise RemoteProtocolError("Server disconnected")
            return type("R", (), {"data": [{"id": 1}]})()

    rows = _leer_paginado(lambda: _Q())
    assert rows == [{"id": 1}]
    assert calls["n"] == 3


class _FakeQuery:
    """Cadena PostgREST mínima: `.not_.is_(...)` es propiedad, no método."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    @property
    def not_(self):
        return self

    def is_(self, *_a, **_k):
        return self

    def neq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def execute(self):
        return SimpleNamespace(data=list(self._rows))


class _FakeSb:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _FakeQuery(self._rows)


def test_fetch_registros_memoria_cc_mes_acta_todos_one_matriz_call():
    """El consolidado debe llamar matriz_params una sola vez (no N veces por ítem)."""
    from ccd_conciliacion import fetch_registros_memoria_cc_mes_acta_todos

    rows_data = [
        {
            "item_numero": "1.01",
            "item_descripcion": "A",
            "unidad": "m",
            "numero_registro": 1,
            "cantidad_total": 1,
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Aprobado",
            "capitulo": "1",
        },
        {
            "item_numero": "2.01",
            "item_descripcion": "B",
            "unidad": "m2",
            "numero_registro": 2,
            "cantidad_total": 2,
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Aprobado",
            "capitulo": "2",
        },
    ]
    matriz_calls = {"n": 0}

    def fake_matriz(_sb, _cid):
        matriz_calls["n"] += 1
        return "nivel3_estado", [1, 2, 3]

    with patch("ccd_conciliacion.matriz_params_contrato", side_effect=fake_matriz), patch(
        "ccd_conciliacion._estados_aprob_sql", return_value=["Aprobado"]
    ):
        rows = fetch_registros_memoria_cc_mes_acta_todos(_FakeSb(rows_data), 2, 99)

    assert matriz_calls["n"] == 1
    assert len(rows) == 2
    assert {r["item_numero"] for r in rows} == {"1.01", "2.01"}


def _import_informes_with_stubs():
    """Evita arrancar main/mail al probar helpers de PDF consolidado."""
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

    # Dependencias pesadas / opcionales que main no necesita aquí
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


def test_cc_mes_002_pdf_completo_bytes_batch_when_volume_high():
    inf = _import_informes_with_stubs()
    fake_pdfs = [b"%PDF-1", b"%PDF-2", b"%PDF-3", b"%PDF-4", b"%PDF-5"]
    calls: list[str] = []

    def fake_to_pdf(html: str) -> bytes:
        calls.append("item" if "ITEM_MARK" in html else "joined")
        return fake_pdfs[len(calls) - 1]

    ctx = {
        "n_items": 5,
        "n_regs": 500,
        "html_joined": "<html>JOINED</html>",
        "item_htmls": [f"<html>ITEM_MARK {i}</html>" for i in range(5)],
    }
    with patch.object(inf, "_to_pdf", side_effect=fake_to_pdf), patch.object(
        inf, "_merge_pdf_bytes_tree", side_effect=lambda parts: b"".join(parts)
    ):
        out = inf._cc_mes_002_pdf_completo_bytes(ctx)
    assert out == b"".join(fake_pdfs)
    assert len(calls) == 5
    assert all(c == "item" for c in calls)


def test_cc_mes_002_pdf_completo_bytes_single_pass_when_small():
    inf = _import_informes_with_stubs()
    calls: list[str] = []

    def fake_to_pdf(html: str) -> bytes:
        calls.append(html)
        return b"%PDF-JOINED"

    ctx = {
        "n_items": 2,
        "n_regs": 10,
        "html_joined": "<html>JOINED_OK</html>",
        "item_htmls": ["<html>a</html>", "<html>b</html>"],
    }
    with patch.object(inf, "_to_pdf", side_effect=fake_to_pdf):
        out = inf._cc_mes_002_pdf_completo_bytes(ctx)
    assert out == b"%PDF-JOINED"
    assert calls == ["<html>JOINED_OK</html>"]


def test_cc_mes_002_disk_cache_put_get_and_reuse(tmp_path, monkeypatch):
    """Tras vista previa, el sello debe reutilizar el PDF en disco (sin regenerar)."""
    inf = _import_informes_with_stubs()
    monkeypatch.setattr(inf, "_CCD_MES_002_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(inf, "_CCD_MES_002_CACHE_TTL_SEC", 1800)

    pdf = b"%PDF-1.4 cache-body"
    key = inf._cc_mes_002_cache_put(
        7,
        55,
        pdf,
        nrpo="RPO-9",
        fname="CC-MES-002_acta_RPO-9_todos-items.pdf",
        contrato_numero="IDU-1",
        n_items=40,
        n_regs=900,
    )
    assert key
    hit = inf._cc_mes_002_cache_get(7, 55)
    assert hit is not None
    data, meta = hit
    assert data == pdf
    assert meta["nrpo"] == "RPO-9"
    assert meta["n_items"] == 40

    with patch.object(inf, "_cc_mes_002_acta_completo_ctx") as mock_ctx:
        out, info = inf._cc_mes_002_pdf_completo_bytes_cached(7, 55, {"sub": "1"})
    assert out == pdf
    assert info["from_cache"] is True
    assert info["fname"].endswith(".pdf")
    mock_ctx.assert_not_called()
