"""Sync de sico_ultimo_numero_* tras eliminar reportes (reutilizar MAX+1)."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch


class TestSincronizarContadorNumeroReporte(unittest.TestCase):
    def test_upsert_reservado_hasta_igual_al_max(self):
        import main

        fake_sb = MagicMock()
        # so_reportes → max 61
        chain_max = MagicMock()
        chain_max.select.return_value = chain_max
        chain_max.eq.return_value = chain_max
        chain_max.order.return_value = chain_max
        chain_max.limit.return_value = chain_max
        chain_max.execute.return_value = MagicMock(data=[{"numero_reporte": 61}])

        # upsert contador
        chain_up = MagicMock()
        chain_up.upsert.return_value = chain_up
        chain_up.execute.return_value = MagicMock(data=[{"contrato_id": 3, "reservado_hasta": 61}])

        def _table(name):
            if name == "so_reportes":
                return chain_max
            if name == "sico_ultimo_numero_reporte":
                return chain_up
            raise AssertionError(name)

        fake_sb.table.side_effect = _table
        main.supabase = fake_sb

        with patch("main.supabase_execute", side_effect=lambda fn, **kw: fn()):
            out = main._sincronizar_contador_numero_reporte(3)

        self.assertEqual(out, 61)
        chain_up.upsert.assert_called_once_with(
            {"contrato_id": 3, "reservado_hasta": 61},
            on_conflict="contrato_id",
        )

    def test_sin_reportes_reservado_hasta_cero(self):
        import main

        fake_sb = MagicMock()
        chain_max = MagicMock()
        chain_max.select.return_value = chain_max
        chain_max.eq.return_value = chain_max
        chain_max.order.return_value = chain_max
        chain_max.limit.return_value = chain_max
        chain_max.execute.return_value = MagicMock(data=[])

        chain_up = MagicMock()
        chain_up.upsert.return_value = chain_up
        chain_up.execute.return_value = MagicMock(data=[])

        fake_sb.table.side_effect = lambda name: chain_max if name == "so_reportes" else chain_up
        main.supabase = fake_sb

        with patch("main.supabase_execute", side_effect=lambda fn, **kw: fn()):
            out = main._sincronizar_contador_numero_reporte(3)

        self.assertEqual(out, 0)
        chain_up.upsert.assert_called_once_with(
            {"contrato_id": 3, "reservado_hasta": 0},
            on_conflict="contrato_id",
        )


class TestSincronizarContadorNumeroRegistro(unittest.TestCase):
    def test_upsert_max_registro(self):
        import main

        fake_sb = MagicMock()
        chain_max = MagicMock()
        chain_max.select.return_value = chain_max
        chain_max.eq.return_value = chain_max
        chain_max.order.return_value = chain_max
        chain_max.limit.return_value = chain_max
        chain_max.execute.return_value = MagicMock(data=[{"numero_registro": 120}])

        chain_up = MagicMock()
        chain_up.upsert.return_value = chain_up
        chain_up.execute.return_value = MagicMock(data=[])

        fake_sb.table.side_effect = lambda name: (
            chain_max if name == "so_registros" else chain_up
        )
        main.supabase = fake_sb

        with patch("main.supabase_execute", side_effect=lambda fn, **kw: fn()):
            out = main._sincronizar_contador_numero_registro(3)

        self.assertEqual(out, 120)
        chain_up.upsert.assert_called_once_with(
            {"contrato_id": 3, "reservado_hasta": 120},
            on_conflict="contrato_id",
        )


if __name__ == "__main__":
    unittest.main()
