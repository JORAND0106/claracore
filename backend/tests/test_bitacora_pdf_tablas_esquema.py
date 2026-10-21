"""Tablas de esquema (memoria/despiece/gráfico) a ancho útil en PDF Bitácora."""
from __future__ import annotations

import bitacora_pdf as pdf


def test_detecta_tablas_esquema():
    assert pdf._is_esquema_tabla_img({"kind": "memoria-calculo"}) is True
    assert pdf._is_esquema_tabla_img({"kind": "despiece-acero"}) is True
    assert pdf._is_esquema_tabla_img({"origen": "esquema"}) is True
    assert pdf._is_esquema_tabla_img({"nombre": "memoria_calculo_Poceta.png"}) is True
    assert pdf._is_esquema_tabla_img({"nombre": "obra.jpg", "kind": ""}) is False


def test_split_fotos_y_tablas():
    fotos, tablas = pdf._split_fotos_y_tablas([
        {"nombre": "foto.jpg"},
        {"kind": "memoria-calculo", "nombre": "m.png", "pie": "Memoria"},
        {"kind": "despiece-acero", "nombre": "d.png"},
        {"origen": "esquema", "nombre": "g.png"},
    ])
    assert len(fotos) == 1
    assert len(tablas) == 3


def test_caja_tabla_mucho_mayor_que_foto():
    assert pdf._TABLA_BOX_W >= 600
    assert pdf._TABLA_BOX_W > pdf._FOTO_BOX_W * 3
    assert pdf._TABLA_BOX_H > pdf._FOTO_BOX_H * 3
    assert pdf._TABLA_MAX_PX_W > pdf._FOTO_MAX_PX_W


def test_html_registro_pone_tablas_a_ancho_completo():
    pal = pdf._palette({})
    html = pdf._html_registro_fotografico(
        [
            {"nombre": "foto.jpg", "data_uri": ""},
            {
                "kind": "memoria-calculo",
                "nombre": "memoria_calculo_X.png",
                "pie": "Memoria de cálculo",
                "data_uri": "",
            },
        ],
        contrato_id=1,
        pal=pal,
        max_n=4,
        prepared_map={},
    )
    assert "Registro Fotográfico" in html
    assert f"max-width:{pdf._TABLA_BOX_W}pt" in html
    assert "Memoria de cálculo" in html or "Esquema" in html


if __name__ == "__main__":
    test_detecta_tablas_esquema()
    test_split_fotos_y_tablas()
    test_caja_tabla_mucho_mayor_que_foto()
    test_html_registro_pone_tablas_a_ancho_completo()
    print("ok")
