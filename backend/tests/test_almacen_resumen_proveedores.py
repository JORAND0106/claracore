"""Vista Resumen: clasifica por proveedor y no mueve la línea."""
from almacen_resumen import (
    armar_resumen,
    cubeta_linea,
    solicitudes_con_lineas_movidas,
)


def test_cubetas():
    assert cubeta_linea("aprobado") == "aprobado"
    assert cubeta_linea("rechazado") == "rechazado"
    assert cubeta_linea(None) == "enviado"
    assert cubeta_linea("pendiente") == "enviado"


def test_arma_lineas_con_insumo_y_omite_el_dinero_sin_permiso():
    filas = [
        {
            "id": 743,
            "solicitud_id": 40,
            "numero_linea": 1,
            "insumo_id": 93,
            "cantidad": 10,
            "unidad": "KG",
            "capitulo": "3",
            "item": "OBRAS",
            "material_descripcion": "VARILLA",
            "observacion_residente": "Acero",
            "estado_validacion": "aprobado",
            "valor_compra_unitario": 4298,
            "proveedor_seleccionado_id": 27,
            "proveedor_seleccionado_nombre": "SERVIPERFILES",
            "solicitado_por": None,
        },
        {
            "id": 800,
            "solicitud_id": 41,
            "insumo_id": None,
            "cantidad": 1,
        },
    ]
    solicitudes = {40: {"id": 40, "consecutivo": 19, "titulo": "Sol", "estado": "aprobada", "created_by": 3}}
    con = armar_resumen(
        filas, solicitudes, {}, {743: {"id": 9, "numero_oc": 2}}, {93: "CC-1614-064"},
        [{"proveedor_id": 27, "nombre": "SERVIPERFILES CYS"}],
        ver_economicos=True, sin_insumo=1, movidas={"solicitudes": 0, "lineas": 0, "disponible": True},
    )
    assert con["sin_insumo"] == 1
    assert len(con["lineas"]) == 1
    assert con["lineas"][0]["solicitud_id"] == 40
    assert con["lineas"][0]["numero_oc"] == 2
    assert con["lineas"][0]["valor"] == 42980
    sin = armar_resumen(
        filas, solicitudes, {}, {}, {}, [],
        ver_economicos=False, sin_insumo=1, movidas={"solicitudes": 0, "lineas": 0, "disponible": True},
    )
    assert "valor" not in sin["lineas"][0]
    assert "valor_compra_unitario" not in sin["lineas"][0]


def test_cuenta_solicitudes_movidas_sin_corregir():
    filas = [
        {"id": 1, "solicitud_id": 40},
        {"id": 2, "solicitud_id": 40},
        {"id": 3, "solicitud_id": 41},
    ]
    logs = [
        {"entidad_id": "1", "valor_anterior": {"solicitud_id": 12}},
        {"entidad_id": "2", "valor_anterior": {"solicitud_id": 40}},
        {"entidad_id": "3", "valor_anterior": {"solicitud_id": 7}},
    ]
    cuenta = solicitudes_con_lineas_movidas(filas, logs)
    assert cuenta["solicitudes"] == 2
    assert cuenta["lineas"] == 2
    assert cuenta["disponible"] is True
