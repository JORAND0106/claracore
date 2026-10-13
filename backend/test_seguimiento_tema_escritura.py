"""Política de escritura por expositor en temas de acta."""
from __future__ import annotations

import unittest

from seguimiento_tema_escritura import (
    acta_usa_escritura_expositor,
    filtrar_ideas_para_sync,
    puede_editar_tema,
    usuario_puede_guardar_algun_tema,
)


class TestEscrituraExpositor(unittest.TestCase):
    def test_flag_v2(self):
        self.assertFalse(acta_usa_escritura_expositor({"flujo_tabs": {"v": 1}}))
        self.assertTrue(acta_usa_escritura_expositor({"flujo_tabs": {"v": 2}}))
        self.assertTrue(acta_usa_escritura_expositor({
            "flujo_tabs": {"v": 1, "temas_escritura_expositor": True},
        }))
        self.assertFalse(acta_usa_escritura_expositor({"flujo_tabs": {}}))

    def test_elaborador_siempre(self):
        acta = {
            "elaborador_id": 10,
            "flujo_tabs": {"v": 2, "temas_escritura_expositor": True},
            "orden_del_dia": [{"texto": "Punto A", "expositor_usuario_id": 20}],
        }
        idea = {"titulo": "Punto A", "expositor_usuario_id": 20}
        self.assertTrue(puede_editar_tema(acta, idea, 10))
        self.assertTrue(puede_editar_tema(acta, idea, 20))
        self.assertFalse(puede_editar_tema(acta, idea, 99))

    def test_expositor_externo_solo_elaborador(self):
        acta = {
            "elaborador_id": 10,
            "flujo_tabs": {"v": 2},
            "orden_del_dia": [{"texto": "Punto B", "expositor_nombre": "Externo SA"}],
        }
        idea = {"titulo": "Punto B", "quien_dijo": "Externo SA"}
        self.assertTrue(puede_editar_tema(acta, idea, 10))
        self.assertFalse(puede_editar_tema(acta, idea, 20))

    def test_legacy_solo_elaborador(self):
        acta = {"elaborador_id": 10, "flujo_tabs": {"v": 1}}
        idea = {"titulo": "X", "expositor_usuario_id": 20}
        self.assertTrue(puede_editar_tema(acta, idea, 10))
        self.assertFalse(puede_editar_tema(acta, idea, 20))

    def test_dev_bypass(self):
        acta = {"elaborador_id": 10, "flujo_tabs": {"v": 2}}
        idea = {"titulo": "X", "expositor_usuario_id": 20}
        self.assertTrue(puede_editar_tema(acta, idea, 99, es_desarrollador=True))

    def test_filtrar_sync_expositor(self):
        acta = {
            "elaborador_id": 10,
            "flujo_tabs": {"v": 2},
        }
        existentes = [
            {"id": 1, "titulo": "A", "expositor_usuario_id": 20, "texto": "viejo A"},
            {"id": 2, "titulo": "B", "expositor_usuario_id": 30, "texto": "viejo B"},
        ]
        payload = [
            {"id": 1, "titulo": "A", "expositor_usuario_id": 20, "texto": "nuevo A"},
            {"id": 2, "titulo": "B", "expositor_usuario_id": 30, "texto": "hack B"},
            {"titulo": "Nuevo", "texto": "no"},
        ]
        f = filtrar_ideas_para_sync(acta, payload, existentes, 20)
        self.assertTrue(f["expositor_only"])
        self.assertTrue(f["skip_deletes"])
        self.assertEqual(len(f["ideas"]), 1)
        self.assertEqual(f["ideas"][0]["id"], 1)

    def test_usuario_puede_guardar(self):
        acta = {"elaborador_id": 10, "flujo_tabs": {"v": 2}}
        ideas = [{"id": 1, "expositor_usuario_id": 20}]
        self.assertTrue(usuario_puede_guardar_algun_tema(acta, ideas, 20))
        self.assertFalse(usuario_puede_guardar_algun_tema(acta, ideas, 99))


if __name__ == "__main__":
    unittest.main()
