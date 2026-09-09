"""Tests — ítems de cobro / hoja de precios unificada."""
from __future__ import annotations

import unittest

from subcontratistas_items_cobro import (
    aggregate_presupuesto_cant_map,
    build_items_cobro_asignados,
    build_precios_sheet,
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
        ]
        precios = {101: {"id": 7, "precio_unitario_sub": 800}}
        rows = build_items_cobro_asignados(listado, cant_map, precios)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["origen"], "presupuesto")
        self.assertFalse(rows[0]["cantidad_editable"])

    def test_sheet_merges_manual(self):
        cant_map = {("4", "A", "4.6"): 10}
        listado = [
            {
                "id": 101, "capitulo": "4", "competencia": "A", "item_numero": "4.6",
                "descripcion": "A", "unidad": "M2", "precio_unitario": 100,
            },
            {
                "id": 202, "capitulo": "9", "competencia": "", "item_numero": "9.1",
                "descripcion": "EXTRA", "unidad": "UND", "precio_unitario": 50,
            },
        ]
        precios = [
            {"id": 1, "listado_precio_id": 101, "precio_unitario_sub": 80, "origen": "presupuesto"},
            {"id": 2, "listado_precio_id": 202, "precio_unitario_sub": 40, "origen": "manual", "cantidad_manual": 3},
        ]
        sheet = build_precios_sheet(listado, cant_map, precios)
        self.assertEqual(len(sheet), 2)
        self.assertEqual(sheet[0]["origen"], "presupuesto")
        self.assertEqual(sheet[0]["cantidad"], 10)
        self.assertEqual(sheet[1]["origen"], "manual")
        self.assertEqual(sheet[1]["cantidad"], 3)
        self.assertTrue(sheet[1]["cantidad_editable"])

    def test_bulk_payload_manual_requires_cantidad(self):
        out = normalize_bulk_precios_payload([
            {"listado_precio_id": 1, "precio_unitario_sub": 10, "origen": "presupuesto"},
            {
                "listado_precio_id": 2,
                "precio_unitario_sub": 5,
                "origen": "manual",
                "cantidad_manual": 2.5,
            },
        ])
        self.assertEqual(len(out), 2)
        self.assertIsNone(out[0]["cantidad_manual"])
        self.assertEqual(out[1]["cantidad_manual"], 2.5)
        with self.assertRaises(ValueError):
            normalize_bulk_precios_payload([
                {"listado_precio_id": 3, "precio_unitario_sub": 1, "origen": "manual"},
            ])


if __name__ == "__main__":
    unittest.main()
