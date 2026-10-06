"""Ítem de cobro, enlace y sincronización planilla ↔ reporte de cantidades."""
from __future__ import annotations

import unittest
from pathlib import Path

from topografia_planilla_sicoe_enlace import (
    ESTADO_REPORTE_CON_ITEM,
    aplicar_dims_enlace,
    campos_item_en_registro,
    construir_enlace,
    contar_planillas_con_alerta_sync,
    detalle_sync_log,
    diff_campos_sync,
    fusionar_meta_cliente,
    item_de_linea,
    lineas_sin_item,
    mensaje_faltan_items,
    origen_padre_item,
    override_desde_registro,
    payload_sellado_registro,
    planilla_tiene_alerta_sync,
    puede_asignar_item_cobro,
    puede_reabrir_para_editar,
    registro_esta_enlazado,
    registro_esta_sellado,
    snapshots_de_diff,
)
from topografia_planilla_tuberia import (
    calcular_planilla_completa,
    lineas_planilla_a_registros_sicoe,
)


def _filas():
    return [
        {
            "orden": 1, "abscisa": 0, "terreno_natural": 100,
            "subrasante_via": 99.5, "cota_fondo_excavacion": 98,
        },
        {
            "orden": 2, "abscisa": 10, "terreno_natural": 100.2,
            "subrasante_via": 99.7, "cota_fondo_excavacion": 98.1,
        },
    ]


def _lineas():
    calc = calcular_planilla_completa(
        tipo="ALCANTARILLA",
        diametro_m=0.9,
        espesor_m=0.05,
        ancho_excavacion_m=1.5,
        relacion_atraque="1:3",
        filas_campo=_filas(),
    )
    return lineas_planilla_a_registros_sicoe(calc, tipo="ALCANTARILLA", tramo="T1")


def _items():
    return {
        "cantidades:EXC": {
            "item_listado_id": 10,
            "item_numero": "1.01",
            "descripcion": "Excavación",
            "precio_unitario": 1000,
            "capitulo": "Alcantarillado",
        },
        "cantidades:TRI": {
            "item_listado_id": 11,
            "item_numero": "1.02",
            "descripcion": "Triturado",
            "precio_unitario": 2000,
            "capitulo": "Alcantarillado",
        },
        "cantidades:REL": {
            "item_listado_id": 12,
            "item_numero": "1.03",
            "descripcion": "Relleno",
            "precio_unitario": 800,
            "capitulo": "Alcantarillado",
        },
        "cantidades:TUB": {
            "item_listado_id": 13,
            "item_numero": "1.04",
            "descripcion": "Tubería",
            "precio_unitario": 500,
            "capitulo": "Alcantarillado",
        },
        "cantidades:EXC_ROC": {
            "item_listado_id": 14,
            "item_numero": "1.05",
            "descripcion": "Roca",
            "precio_unitario": 1500,
            "capitulo": "Alcantarillado",
        },
        "cantidades:GEO": {
            "item_listado_id": 15,
            "item_numero": "1.06",
            "descripcion": "Geotextil",
            "precio_unitario": 100,
            "capitulo": "Alcantarillado",
        },
    }


class TestAsignacionYHerencia(unittest.TestCase):
    def test_descuento_hereda_el_item_de_la_linea(self):
        lineas = _lineas()
        a1 = next(x for x in lineas if x.get("_origen_codigo") == "DESC_A1")
        self.assertEqual(a1.get("_item_cant_codigo"), "TRI")
        self.assertEqual(origen_padre_item(a1, "ALCANTARILLA"), "cantidades:TRI")
        item = item_de_linea(a1, _items(), "ALCANTARILLA")
        self.assertEqual(item["item_numero"], "1.02")
        self.assertEqual(item["item_listado_id"], 11)
        vol = next((x for x in lineas if str(x.get("_origen_codigo") or "").startswith("DESC_VOL_")), None)
        if vol:
            self.assertTrue(vol.get("_item_cant_codigo"))
            padre = f"cantidades:{vol['_item_cant_codigo']}"
            if padre in _items():
                self.assertEqual(
                    item_de_linea(vol, _items(), "ALCANTARILLA")["item_listado_id"],
                    _items()[padre]["item_listado_id"],
                )

    def test_linea_con_cantidad_sin_item_bloquea_el_reporte(self):
        lineas = _lineas()
        incompletos = dict(_items())
        incompletos.pop("cantidades:EXC")
        faltan = lineas_sin_item(lineas, incompletos, "ALCANTARILLA")
        origenes = {f["origen"] for f in faltan}
        self.assertIn("cantidades:EXC", origenes)
        self.assertIn("Asigne el ítem de cobro", mensaje_faltan_items(faltan))
        self.assertEqual(lineas_sin_item(lineas, _items(), "ALCANTARILLA"), [])

    def test_registro_llega_con_item_y_costo_y_estado_de_item_registros(self):
        lineas = _lineas()
        exc = next(x for x in lineas if x.get("_origen_codigo") == "EXC")
        self.assertIsNone(exc.get("item_numero"))
        campos = campos_item_en_registro(exc, _items()["cantidades:EXC"])
        self.assertEqual(campos["item_numero"], "1.01")
        self.assertEqual(campos["item_descripcion"], "Excavación")
        self.assertEqual(campos["vlr_unitario"], 1000)
        self.assertEqual(
            campos["costo_directo"],
            round(float(exc["cantidad_total"]) * 1000, 0),
        )
        self.assertEqual(ESTADO_REPORTE_CON_ITEM, "No Revisados")

    def test_solo_crea_o_edita_el_reporte_de_cantidades(self):
        self.assertFalse(puede_asignar_item_cobro())
        self.assertTrue(puede_asignar_item_cobro(puede_crear=True))
        self.assertTrue(puede_asignar_item_cobro(puede_editar=True))
        self.assertTrue(puede_asignar_item_cobro(es_desarrollador=True))


class TestEnlaceYSync(unittest.TestCase):
    def test_enlace_es_por_item_y_el_registro_manual_no_entra(self):
        lineas = _lineas()
        exc = next(x for x in lineas if x.get("_origen_codigo") == "EXC")
        tri = next(x for x in lineas if x.get("_origen_codigo") == "TRI")
        en_exc = construir_enlace(exc, _items()["cantidades:EXC"], registro_id=501, numero_registro=8)
        en_tri = construir_enlace(tri, _items()["cantidades:TRI"], registro_id=502, numero_registro=9)
        self.assertEqual(en_exc["item_listado_id"], 10)
        self.assertEqual(en_exc["origen"], "cantidades:EXC")
        self.assertNotEqual(en_exc["origen"], en_tri["origen"])
        self.assertNotIn("posicion", en_exc)
        enlaces = [en_exc, en_tri]
        self.assertTrue(registro_esta_enlazado(enlaces, 501))
        self.assertFalse(registro_esta_enlazado(enlaces, 999))

    def test_diff_campo_anterior_nuevo_y_origen(self):
        cambios = diff_campos_sync(
            {"longitud": 10.0, "ancho": 1.5, "espesor": 1.0, "cantidad_total": 15.0},
            {"longitud": 12.0, "ancho": 1.5, "espesor": 1.0, "cantidad_total": 18.0},
        )
        self.assertEqual([c["campo"] for c in cambios], ["longitud", "cantidad_total"])
        self.assertEqual(cambios[0]["anterior"], 10.0)
        self.assertEqual(cambios[0]["nuevo"], 12.0)
        antes, despues = snapshots_de_diff(cambios)
        self.assertEqual(antes["longitud"], 10.0)
        self.assertEqual(despues["cantidad_total"], 18.0)
        det = detalle_sync_log(cambios, origen_cambio="planilla", registro_id=501, item_numero="1.01")
        self.assertEqual(det["origen_cambio"], "planilla")
        self.assertEqual(det["campos_modificados"], cambios)
        self.assertEqual(
            diff_campos_sync(
                {"longitud": 1, "cantidad_total": 2},
                {"longitud": 1.0, "cantidad_total": 2.0},
            ),
            [],
        )

    def test_override_del_reporte_cae_si_la_planilla_cambia_la_base(self):
        calc = {
            "netos": [{
                "codigo": "EXC", "long": 10, "ancho": 1.5, "espesor": 1, "bruto": 15, "neto": 15,
            }],
            "descuentos": [],
            "descuentos_volumen_detalle": [],
        }
        dims = {
            "cantidades:EXC": {
                "long": 12, "ancho": 1.5, "espesor": 1, "cantidad": 18,
                "base": {"long": 10, "ancho": 1.5, "espesor": 1, "cantidad": 15},
            },
        }
        aplicado = aplicar_dims_enlace(calc, dims)
        self.assertEqual(aplicado["netos"][0]["bruto"], 18)
        self.assertEqual(aplicado["netos"][0]["long"], 12)
        calc_nueva = {
            "netos": [{
                "codigo": "EXC", "long": 20, "ancho": 1.5, "espesor": 1, "bruto": 30, "neto": 30,
            }],
            "descuentos": [],
            "descuentos_volumen_detalle": [],
        }
        intacto = aplicar_dims_enlace(calc_nueva, dims)
        self.assertEqual(intacto["netos"][0]["bruto"], 30)
        self.assertEqual(intacto["netos"][0]["long"], 20)
        vacio = aplicar_dims_enlace(calc, {})
        self.assertEqual(vacio["netos"][0]["bruto"], 15)

    def test_override_desde_registro_guarda_la_base(self):
        ov = override_desde_registro(
            {"longitud": 12, "ancho": 1.2, "espesor": 0.8, "cantidad_total": -4.5},
            signo=-1,
            natural={"long": 10, "ancho": 1.2, "espesor": 0.8, "cantidad": 3},
        )
        self.assertEqual(ov["cantidad"], 4.5)
        self.assertEqual(ov["base"]["cantidad"], 3)
        self.assertEqual(ov["long"], 12)


class TestSelloYReapertura(unittest.TestCase):
    def test_sellado_pone_niveles_activos_en_aprobado_y_bloqueado(self):
        payload = payload_sellado_registro([1, 2, 4], uid=7, now="2026-10-06T21:00:00+00:00")
        self.assertEqual(payload["nivel1_estado"], "Aprobado")
        self.assertEqual(payload["nivel2_estado"], "Aprobado")
        self.assertEqual(payload["nivel4_estado"], "Aprobado")
        self.assertNotIn("nivel3_estado", payload)
        self.assertTrue(payload["bloqueado"])
        self.assertEqual(payload["nivel4_usuario_id"], 7)
        sellado = {"nivel4_estado": "Aprobado", "bloqueado": True}
        self.assertTrue(registro_esta_sellado(sellado, "nivel4_estado"))
        self.assertFalse(registro_esta_sellado({"nivel4_estado": "No Revisado"}, "nivel4_estado"))

    def test_reabrir_solo_si_la_doble_llave_ya_reverso(self):
        campo = "nivel3_estado"
        ok, _msg = puede_reabrir_para_editar(
            [{"nivel3_estado": "No Revisado", "bloqueado": False}],
            campo,
        )
        self.assertTrue(ok)
        ok2, msg2 = puede_reabrir_para_editar(
            [{"nivel3_estado": "Aprobado", "bloqueado": True}],
            campo,
        )
        self.assertFalse(ok2)
        self.assertIn("doble llave", msg2)

    def test_reabrir_desarrollador_no_escribe_registros(self):
        src = Path(__file__).resolve().parents[1].joinpath(
            "topografia_planilla_tuberia_routes.py",
        ).read_text(encoding="utf-8")
        inicio = src.index("def reabrir(")
        fin = src.index("def revocar(", inicio)
        cuerpo = src[inicio:fin]
        self.assertNotIn("so_registros", cuerpo)
        self.assertIn("Solo Desarrollador puede reabrir planillas.", cuerpo)
        self.assertIn("puede_reabrir_para_editar", cuerpo)

    def test_reporte_manual_no_queda_enlazado_ni_cambia_su_alta(self):
        main = Path(__file__).resolve().parents[1].joinpath("main.py").read_text(encoding="utf-8")
        alta = main.index("def crear_registro(")
        siguiente = main.index("\ndef ", alta + 10)
        cuerpo_alta = main[alta:siguiente]
        self.assertNotIn("sincronizar_planilla_desde_registro_sicoe", cuerpo_alta)
        self.assertNotIn("sicoe_items_por_linea", cuerpo_alta)
        put = main.index("def actualizar_registro(")
        put_fin = main.index("\ndef ", put + 10)
        self.assertIn("sincronizar_planilla_desde_registro_sicoe", main[put:put_fin])


class TestAlertaYMeta(unittest.TestCase):
    def test_alerta_cuenta_planillas_y_el_guardado_no_pisa_el_enlace(self):
        planilla = {
            "meta_cabecera": {
                "sicoe_reportes": [{"reporte_id": 1, "alerta_sync_at": "2026-10-06T00:00:00+00:00"}],
            },
        }
        self.assertTrue(planilla_tiene_alerta_sync(planilla))
        self.assertEqual(contar_planillas_con_alerta_sync([planilla, {"meta_cabecera": {}}]), 1)
        fusion = fusionar_meta_cliente(
            {
                "sicoe_reportes": [{"reporte_id": 9, "enlaces": [{"registro_id": 1}]}],
                "sicoe_dims_por_linea": {"cantidades:EXC": {"long": 4}},
                "sicoe_items_por_linea": {},
            },
            {
                "sicoe_reportes": [],
                "sicoe_dims_por_linea": {},
                "sicoe_items_por_linea": {
                    "cantidades:exc": {"item_numero": "1.01", "id": 10, "descripcion": "Excavación"},
                },
                "cama_triturado_m": 0.1,
            },
        )
        self.assertEqual(fusion["sicoe_reportes"][0]["reporte_id"], 9)
        self.assertEqual(fusion["sicoe_dims_por_linea"]["cantidades:EXC"]["long"], 4)
        self.assertEqual(fusion["sicoe_items_por_linea"]["cantidades:EXC"]["item_listado_id"], 10)
        self.assertEqual(fusion["cama_triturado_m"], 0.1)


if __name__ == "__main__":
    unittest.main()
