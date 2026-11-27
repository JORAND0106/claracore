"""Desarrollador no sobrescribe firmas Elaboró/Aprobó ya registradas."""
from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from tests.test_planilla_tuberia_validacion import _load_routes_with_stubs


class TestFirmasConservadasDesarrollador(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_routes_with_stubs()
        cls.HTTPException = cls.mod.HTTPException

    def _body(self, estado="Aprobado"):
        return SimpleNamespace(estado=estado, comentario_data=None)

    def test_dev_no_sobrescribe_firma_n1_ya_registrada(self):
        row = {
            "estado": "borrador",
            "nivel1_estado": "Aprobado",
            "nivel1_usuario_id": 42,
            "nivel1_fecha": "2026-01-10T15:00:00+00:00",
            "version": 3,
        }
        fake_sb = MagicMock()
        with patch.object(self.mod, "supabase", fake_sb), \
             patch.object(self.mod, "_es_desarrollador", return_value=True), \
             patch.object(self.mod, "_audit") as audit, \
             patch.object(self.mod, "_detalle", return_value={"planilla": {"id": "p1"}}):
            self.mod._aplicar_validacion_planilla_tuberia(
                1, "p1", row, 1, self._body("Aprobado"), {"sub": 99},
            )
        update = fake_sb.table.return_value.update.call_args[0][0]
        self.assertEqual(update["nivel1_usuario_id"], 42)
        self.assertEqual(update["nivel1_fecha"], "2026-01-10T15:00:00+00:00")
        self.assertEqual(update["nivel1_estado"], "Aprobado")
        self.assertTrue(audit.call_args[0][4].get("firma_conservada"))

    def test_dev_si_registra_firma_cuando_nivel_vacio(self):
        row = {
            "estado": "borrador",
            "nivel1_estado": "No Revisado",
            "nivel1_usuario_id": None,
            "nivel1_fecha": None,
            "version": 1,
        }
        fake_sb = MagicMock()
        with patch.object(self.mod, "supabase", fake_sb), \
             patch.object(self.mod, "_es_desarrollador", return_value=True), \
             patch.object(self.mod, "_audit") as audit, \
             patch.object(self.mod, "_detalle", return_value={"planilla": {"id": "p1"}}):
            self.mod._aplicar_validacion_planilla_tuberia(
                1, "p1", row, 1, self._body("Aprobado"), {"sub": 99},
            )
        update = fake_sb.table.return_value.update.call_args[0][0]
        self.assertEqual(update["nivel1_usuario_id"], 99)
        self.assertIsNotNone(update["nivel1_fecha"])
        self.assertFalse(audit.call_args[0][4].get("firma_conservada"))

    def test_no_dev_sigue_sobrescribiendo_firmante(self):
        row = {
            "estado": "borrador",
            "nivel1_estado": "Aprobado",
            "nivel1_usuario_id": 42,
            "nivel1_fecha": "2026-01-10T15:00:00+00:00",
            "version": 3,
        }
        fake_sb = MagicMock()
        with patch.object(self.mod, "supabase", fake_sb), \
             patch.object(self.mod, "_es_desarrollador", return_value=False), \
             patch.object(self.mod, "_audit"), \
             patch.object(self.mod, "_detalle", return_value={"planilla": {"id": "p1"}}):
            self.mod._aplicar_validacion_planilla_tuberia(
                1, "p1", row, 1, self._body("Aprobado"), {"sub": 7},
            )
        update = fake_sb.table.return_value.update.call_args[0][0]
        self.assertEqual(update["nivel1_usuario_id"], 7)

    def test_dev_no_sobrescribe_firma_n2(self):
        row = {
            "estado": "borrador",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel2_usuario_id": 20,
            "nivel2_fecha": "2026-01-11T18:00:00+00:00",
            "version": 4,
        }
        fake_sb = MagicMock()
        with patch.object(self.mod, "supabase", fake_sb), \
             patch.object(self.mod, "_es_desarrollador", return_value=True), \
             patch.object(self.mod, "_audit"), \
             patch.object(self.mod, "_ejecutar_cierre_planilla_tuberia"), \
             patch.object(self.mod, "_row", return_value={**row, "estado": "validado", "version": 5}), \
             patch.object(self.mod, "_detalle", return_value={"planilla": {"id": "p1"}}):
            self.mod._aplicar_validacion_planilla_tuberia(
                1, "p1", row, 2, self._body("Aprobado"), {"sub": 99},
            )
        update = fake_sb.table.return_value.update.call_args[0][0]
        self.assertEqual(update["nivel2_usuario_id"], 20)
        self.assertEqual(update["nivel2_fecha"], "2026-01-11T18:00:00+00:00")

    def test_reabrir_dev_conserva_firmas(self):
        p = {
            "id": "p1",
            "estado": "validado",
            "version": 5,
            "nivel1_estado": "Aprobado",
            "nivel1_usuario_id": 10,
            "nivel1_fecha": "2026-01-10T15:00:00+00:00",
            "nivel2_estado": "Aprobado",
            "nivel2_usuario_id": 20,
            "nivel2_fecha": "2026-01-11T18:00:00+00:00",
            "comentario_interventoria": "ok",
        }
        fake_sb = MagicMock()
        with patch.object(self.mod, "supabase", fake_sb), \
             patch.object(self.mod, "_es_desarrollador", return_value=True), \
             patch.object(self.mod, "_require_contract_access"), \
             patch.object(self.mod, "_row", return_value=p), \
             patch.object(self.mod, "_audit") as audit, \
             patch.object(self.mod, "_detalle", return_value={"planilla": p}):
            self.mod.reabrir(1, "p1", {"sub": 99})
        update = fake_sb.table.return_value.update.call_args[0][0]
        self.assertEqual(update["estado"], "borrador")
        self.assertNotIn("nivel1_usuario_id", update)
        self.assertNotIn("nivel2_usuario_id", update)
        self.assertNotIn("nivel1_estado", update)
        self.assertTrue(audit.call_args[0][4].get("firmas_conservadas"))

    def test_helpers_en_fuente(self):
        src = Path(self.mod.__file__).read_text(encoding="utf-8")
        self.assertIn("_aplicar_firma_nivel_en_update", src)
        self.assertIn("firmas_conservadas", src)
        self.assertIn("firma_conservada", src)
        # Revocar sigue limpiando firmas (vía explícita).
        bloque = src.split("def revocar(", 1)[1].split("\n@router.", 1)[0]
        self.assertIn('"nivel1_usuario_id": None', bloque)
        self.assertIn('"nivel2_usuario_id": None', bloque)


if __name__ == "__main__":
    unittest.main()
