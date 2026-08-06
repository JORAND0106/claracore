"""FO-IDU-EO-04: logos contratista/interventoría mismo tamaño; entidad a la derecha."""

from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace


def _import_informes_with_stubs():
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


def test_html_logo_memoria_caja_mismo_tamano_con_y_sin_url():
    inf = _import_informes_with_stubs()
    con = inf._html_logo_memoria_caja("data:image/png;base64,xx", placeholder="Logo\nA")
    sin = inf._html_logo_memoria_caja(None, placeholder="Logo\nB")
    assert f"max-height:{inf._FO_EO04_LOGO_PAR_MAX_H}" in con
    assert f"max-width:{inf._FO_EO04_LOGO_PAR_MAX_W}" in con
    assert f"min-height:{inf._FO_EO04_LOGO_PAR_MAX_H}" in sin
    assert f"min-width:{inf._FO_EO04_LOGO_PAR_MAX_W}" in sin
    assert "object-fit:contain" in con


def test_fo_eo_04_encabezado_tres_logos_distribucion():
    inf = _import_informes_with_stubs()
    html = inf._html_idu_fo_eo_04_v2_plantilla_vacia(
        logo_contratista_html='<div id="logo-c">C</div>',
        logo_interventoria_html='<div id="logo-i">I</div>',
        logo_entidad_html='<div id="logo-e">E</div>',
    )
    assert 'id="logo-c"' in html
    assert 'id="logo-i"' in html
    assert 'id="logo-e"' in html
    pos_c = html.index('id="logo-c"')
    pos_i = html.index('id="logo-i"')
    pos_fmt = html.index("FORMATO")
    pos_e = html.index('id="logo-e"')
    assert pos_c < pos_fmt
    assert pos_i < pos_fmt
    assert pos_e > pos_fmt
    assert pos_c < pos_i


def test_fo_eo_04_placeholders_par_usan_caja_igual():
    inf = _import_informes_with_stubs()
    html = inf._html_idu_fo_eo_04_v2_plantilla_vacia()
    assert html.count(f"min-width:{inf._FO_EO04_LOGO_PAR_MAX_W}") >= 2
    assert "MEMORIA DE C&#193;LCULO" in html
