"""Filtro de contrato activo para el buzón de notificaciones (lógica pura)."""


def _contrato_id_efectivo_buzon(contrato_id, current_user, lookup_usuario_contrato):
    """Espejo de main._contrato_id_efectivo_buzon sin importar main."""
    if contrato_id is not None:
        try:
            return int(contrato_id)
        except (TypeError, ValueError):
            return None
    try:
        uid = int(current_user.get("sub", 0))
    except (TypeError, ValueError):
        return None
    if not uid:
        return None
    return lookup_usuario_contrato(uid)


def test_contrato_id_efectivo_usa_query():
    assert _contrato_id_efectivo_buzon(7, {"sub": "1"}, lambda _u: 99) == 7
    assert _contrato_id_efectivo_buzon("12", {"sub": "1"}, lambda _u: 99) == 12


def test_contrato_id_efectivo_fallback_usuario_activo():
    seen = []

    def lookup(uid):
        seen.append(uid)
        return 3

    assert _contrato_id_efectivo_buzon(None, {"sub": "99"}, lookup) == 3
    assert seen == [99]


def test_contrato_id_efectivo_sin_contrato_devuelve_none():
    assert _contrato_id_efectivo_buzon(None, {"sub": "1"}, lambda _u: None) is None
    assert _contrato_id_efectivo_buzon(None, {}, lambda _u: 5) is None
