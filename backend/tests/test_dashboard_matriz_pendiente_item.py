"""Matriz validación: fila pendiente_item atada al nivel mínimo activo."""


def _matriz_col_nivel(n: int) -> str:
    return f"nivel{n}"


def _matriz_validacion_empty(na):
    z = {_matriz_col_nivel(n): 0.0 for n in na}
    return {
        "aprobado": dict(z),
        "pendiente": dict(z),
        "pendiente_item": dict(z),
        "no_revisado": dict(z),
        "rechazado": dict(z),
        "habilitado": dict(z),
        "otras_actas": dict(z),
    }


def _matriz_legacy_bloque_a_niveles(bloque, niveles_activos):
    na = sorted({int(x) for x in niveles_activos if 1 <= int(x) <= 6}) or [1, 2, 3]
    if not bloque or not isinstance(bloque, dict):
        return _matriz_validacion_empty(na)
    legacy_map = {1: "inspector", 2: "residente"}
    nmax = max(na)
    out = _matriz_validacion_empty(na)
    for fila in out:
        src = bloque.get(fila) if isinstance(bloque.get(fila), dict) else {}
        use_nivel_keys = any(str(k).startswith("nivel") for k in src.keys())
        for n in na:
            col = _matriz_col_nivel(n)
            if use_nivel_keys:
                out[fila][col] = float(src.get(col) or 0)
            else:
                if n == nmax:
                    leg = "interventoria"
                else:
                    leg = legacy_map.get(n, "interventoria")
                out[fila][col] = float(src.get(leg) or src.get(col) or 0)
    return out


def _norm_estado(v):
    if v is None or not str(v).strip():
        return "No Revisado"
    s = str(v).strip()
    low = s.lower()
    if low == "aprobado":
        return "Aprobado"
    if low == "pendiente":
        return "Pendiente"
    if low == "rechazado":
        return "Rechazado"
    if "no revis" in low:
        return "No Revisado"
    return s


def test_legacy_bloque_pendiente_item_nivel2_no_residente():
    bloque = {
        "aprobado": {"inspector": 1, "residente": 2, "interventoria": 3},
        "pendiente": {"inspector": 10, "residente": 20, "interventoria": 30},
        "pendiente_item": {"nivel2": 5000},
        "no_revisado": {"inspector": 0, "residente": 0, "interventoria": 0},
        "rechazado": {"inspector": 0, "residente": 0, "interventoria": 0},
        "habilitado": {"inspector": 0, "residente": 0, "interventoria": 0},
        "otras_actas": {"inspector": 0, "residente": 0, "interventoria": 0},
    }
    out = _matriz_legacy_bloque_a_niveles(bloque, [2, 4])
    assert out["pendiente_item"]["nivel2"] == 5000
    assert out["pendiente_item"]["nivel4"] == 0
    assert out["aprobado"]["nivel2"] == 2
    assert out["aprobado"]["nivel4"] == 3


def _matriz_enforce_pendiente_item_n_min(bloque, niveles_activos):
    na = sorted({int(x) for x in niveles_activos if 1 <= int(x) <= 6}) or [1, 2, 3]
    n_min = na[0]
    col_min = _matriz_col_nivel(n_min)
    src_pi = bloque.get("pendiente_item") if isinstance(bloque.get("pendiente_item"), dict) else {}
    pi = {_matriz_col_nivel(n): 0.0 for n in na}
    pi[col_min] = float(src_pi.get(col_min) or 0)
    out = dict(bloque)
    out["pendiente_item"] = pi
    return out


def test_enforce_pendiente_item_descarta_legacy_n2():
    na = [1, 2, 4]
    bloque = {
        "pendiente_item": {"nivel1": 0.0, "nivel2": 21177192.0, "nivel4": 0.0},
        "pendiente": {"nivel1": 0.0, "nivel2": 0.0, "nivel4": 40000000.0},
    }
    out = _matriz_enforce_pendiente_item_n_min(bloque, na)
    assert out["pendiente_item"]["nivel2"] == 0.0
    assert out["pendiente_item"]["nivel1"] == 0.0
    reg_pend_n2 = {"nivel2_estado": "Pendiente", "sub_estado": "Pendiente"}
    reg_sub_only = {"nivel2_estado": "Aprobado", "sub_estado": "Pendiente"}
    assert _norm_estado(reg_pend_n2["nivel2_estado"]) == "Pendiente"
    assert _norm_estado(reg_sub_only["nivel2_estado"]) != "Pendiente"
