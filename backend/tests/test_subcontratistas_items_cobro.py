"""Tests — ítems de cobro desde cantidades de Presupuesto."""
from __future__ import annotations

import unittest

from subcontratistas_items_cobro import (
    aggregate_presupuesto_cant_map,
    build_items_cobro_asignados,
    lookup_cant,
    normalize_bulk_precios_payload,
    norm_item_key,
)


class TestItemsCobro(unittest.TestCase):
    def test_norm_item_key_strip_trailing_dot(self):
        self.assertEqual(norm_item_key("3.1."), "3.1")
        self.assertEqual(norm_item_key(" 4.6 "), "4.6")

    def test_aggregate_and_lookup(self):
        cant_map = aggregate_presupuesto_cant_map([
            {"capitulo": "4", "competencia": "A", "item": "4.6.", "cant_total": 10},
            {"capitulo": "4", "competencia": "A", "item": "4.6", "cant_total": 5},
            {"capitulo": "4", "competencia": "B", "item": "4.6", "cant_total": 2},
            {"capitulo": "4", "competencia": "A", "item": "4.7", "cant_total": 0},
        ])
        self.assertEqual(lookup_cant(cant_map, "4", "A", "4.6"), 15)
        self.assertEqual(lookup_cant(cant_map, "4", "", "4.6"), 17)
        self.assertEqual(lookup_cant(cant_map, "4", "A", "4.7"), 0)

    def test_build_only_positive_qty(self):
        cant_map = {
            ("4", "A", "4.6"): 12.5,
            ("5", "", "5.1"): 0,
        }
        listado = [
            {
                "id": 101,
                "capitulo": "4",
                "competencia": "A",
                "item_numero": "4.6",
                "descripcion": "MARCA VIAL",
                "unidad": "M2",
                "precio_unitario": 1000,
            },
            {
                "id": 102,
                "capitulo": "5",
                "competencia": "",
                "item_numero": "5.1",
                "descripcion": "SIN CANT",
                "unidad": "UND",
                "precio_unitario": 50,
            },
            {
                "id": 103,
                "capitulo": "9",
                "competencia": "",
                "item_numero": "9.9",
                "descripcion": "SIN ASIGNAR",
                "unidad": "M",
                "precio_unitario": 10,
            },
        ]
        precios = {101: {"id": 7, "precio_unitario_sub": 800}}
        rows = build_items_cobro_asignados(listado, cant_map, precios)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["listado_precio_id"], 101)
        self.assertEqual(rows[0]["cantidad"], 12.5)
        self.assertEqual(rows[0]["vu_cobro"], 1000)
        self.assertEqual(rows[0]["vu_costo_mo"], 800)
        self.assertEqual(rows[0]["precio_id"], 7)
        self.assertEqual(rows[0]["unidad"], "M2")

    def test_bulk_payload(self):
        out = normalize_bulk_precios_payload([
            {"listado_precio_id": 1, "precio_unitario_sub": "10.5"},
            {"listado_precio_id": 1, "precio_unitario_sub": 99},  # dup ignored
            {"listado_precio_id": 2, "precio_unitario_sub": 0},
        ])
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]["precio_unitario_sub"], 10.5)
        with self.assertRaises(ValueError):
            normalize_bulk_precios_payload([])
        with self.assertRaises(ValueError):
            normalize_bulk_precios_payload([{"listado_precio_id": 1, "precio_unitario_sub": -1}])


if __name__ == "__main__":
    unittest.main()
