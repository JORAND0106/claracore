"""Regresión: rechazo/guardado de usuario con rol/cargo/contrato nulos no debe
generar 22P02 (invalid input syntax for type integer: 'None')."""

from __future__ import annotations

import types
import unittest
from unittest.mock import MagicMock

import main as m


class TestAdminUsuarioFkNone(unittest.TestCase):
    def test_fk_int_o_none_acepta_enteros(self):
        fn = m._admin_usuario_fk_int_o_none
        self.assertEqual(fn(7), 7)
        self.assertEqual(fn("12"), 12)
        self.assertEqual(fn(3.0), 3)

    def test_fk_int_o_none_normaliza_vacios_y_none_string(self):
        fn = m._admin_usuario_fk_int_o_none
        for v in (None, "", "  ", "None", "none", "NULL", "undefined", "NaN", float("nan"), True, False, "abc"):
            self.assertIsNone(fn(v), msg=repr(v))

    def test_enriquecer_detalle_con_rol_none_no_consulta_supabase(self):
        fake_sb = MagicMock()
        original = m.supabase
        m.supabase = fake_sb
        try:
            out = m._admin_usuario_enriquecer_detalle_log(
                {
                    "estado": "rechazado",
                    "activo": False,
                    "cargo_id": None,
                    "rol_id": None,
                    "contrato_id": None,
                    "subcontratista_id": None,
                }
            )
            self.assertEqual(out.get("estado"), "rechazado")
            self.assertIsNone(out.get("cargo"))
            self.assertIsNone(out.get("rol"))
            self.assertIsNone(out.get("contrato"))
            self.assertNotIn("cargo_id", out)
            self.assertNotIn("rol_id", out)
            self.assertNotIn("contrato_id", out)
            fake_sb.table.assert_not_called()
        finally:
            m.supabase = original

    def test_enriquecer_detalle_con_rol_valido_consulta_roles(self):
        fake_table = MagicMock()
        fake_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = types.SimpleNamespace(
            data=[{"nombre": "Interventoría"}]
        )
        fake_sb = MagicMock()
        fake_sb.table.return_value = fake_table
        original = m.supabase
        m.supabase = fake_sb
        try:
            out = m._admin_usuario_enriquecer_detalle_log({"rol_id": 4, "estado": "aprobado"})
            self.assertEqual(out.get("rol"), "Interventoría")
            self.assertNotIn("rol_id", out)
            fake_sb.table.assert_called_with("roles")
            fake_table.select.return_value.eq.assert_called_with("id", 4)
        finally:
            m.supabase = original


if __name__ == "__main__":
    unittest.main()
