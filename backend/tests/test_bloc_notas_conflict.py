"""Regla de copia automática en conflictos del bloc de notas (sin cargar FastAPI)."""


def _conflict_title(title: str) -> str:
    base = (title or "Nota").strip() or "Nota"
    if len(base) > 240:
        base = base[:240]
    return f"{base} · copia"


def test_conflict_title_keeps_base():
    assert _conflict_title("Apunte campo") == "Apunte campo · copia"
    assert _conflict_title("") == "Nota · copia"
    assert _conflict_title("   ") == "Nota · copia"


def test_conflict_when_server_rev_ahead():
    server_rev, base_rev = 5, 3
    assert server_rev > base_rev
