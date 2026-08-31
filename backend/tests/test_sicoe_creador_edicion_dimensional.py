"""Helpers: reset/alerta de cantidad SicoeObra (creador / Cantidad Total)."""
from __future__ import annotations


def _nivel_max_aprobado(row: dict, activos: list[int]) -> int | None:
    max_n = None
    for n in sorted(activos):
        if (row.get(f"nivel{n}_estado") or "").strip() == "Aprobado":
            max_n = n
    return max_n


def _reset_hasta_max(row: dict, activos: list[int]) -> tuple[list[int], int | None]:
    max_prev = _nivel_max_aprobado(row, activos)
    if max_prev is None:
        return [], None
    reiniciados = []
    update = {}
    for n in activos:
        st = (row.get(f"nivel{n}_estado") or "").strip()
        if n <= max_prev or st == "Aprobado":
            update[f"nivel{n}_estado"] = "No Revisado"
            reiniciados.append(n)
    return reiniciados, max_prev


def _alerta_visible(max_prev: int | None, max_aprobado_ahora: int | None) -> bool:
    if max_prev is None:
        return False
    if max_aprobado_ahora is not None and max_aprobado_ahora >= max_prev:
        return False
    return True


def test_reset_solo_hasta_nivel_max_previo():
    row = {
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Aprobado",
        "nivel3_estado": "No Revisado",
    }
    reiniciados, max_prev = _reset_hasta_max(row, [1, 2, 3])
    assert max_prev == 2
    assert reiniciados == [1, 2]
    assert 3 not in reiniciados


def test_sin_aprobados_no_reset_ni_alerta():
    row = {"nivel1_estado": "No Revisado", "nivel2_estado": "Pendiente"}
    reiniciados, max_prev = _reset_hasta_max(row, [1, 2, 3])
    assert max_prev is None
    assert reiniciados == []
    assert _alerta_visible(None, None) is False


def test_alerta_se_apaga_al_reaprobar_max_prev():
    assert _alerta_visible(2, None) is True
    assert _alerta_visible(2, 1) is True
    assert _alerta_visible(2, 2) is False
    assert _alerta_visible(2, 3) is False
