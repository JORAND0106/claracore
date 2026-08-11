"""Lógica de prefijos del_ al restaurar desde Papelera (sin importar main/supabase)."""


def _prefijo_del(nombre: str) -> str:
    if not nombre:
        return nombre
    s = str(nombre).strip()
    return s if s.startswith("del_") else f"del_{s}"


def _quitar_del(nombre: str) -> str:
    s = str(nombre or "").strip()
    return s[4:] if s.startswith("del_") else s


def test_layer_prefijo_del_no_duplica():
    assert _prefijo_del("CAPA") == "del_CAPA"
    assert _prefijo_del("del_CAPA") == "del_CAPA"
    assert _prefijo_del("") == ""


def test_restaurar_quita_prefijo_del():
    assert _quitar_del("del_ENT") == "ENT"
    assert _quitar_del("del_TXT") == "TXT"
    assert _quitar_del("ENT") == "ENT"
    assert _quitar_del("") == ""
