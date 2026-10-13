"""Resolución de clave/modelo Anthropic para actas."""
from __future__ import annotations

import logging
import unittest
from unittest.mock import patch

from acta_anthropic import (
    ACTA_ANTHROPIC_DEFAULT_MODEL,
    resolve_acta_anthropic_key,
    resolve_acta_anthropic_model,
    reset_fallback_log_flag_for_tests,
)


class TestActaAnthropic(unittest.TestCase):
    def setUp(self):
        reset_fallback_log_flag_for_tests()

    def test_prefiere_clave_acta(self):
        with patch.dict(
            "os.environ",
            {
                "ACTA_ANTHROPIC_API_KEY": "sk-acta-test",
                "ANTHROPIC_API_KEY": "sk-general-test",
            },
            clear=False,
        ):
            key, source = resolve_acta_anthropic_key()
        self.assertEqual(key, "sk-acta-test")
        self.assertEqual(source, "ACTA_ANTHROPIC_API_KEY")

    def test_respaldo_a_clave_general_con_log(self):
        with patch.dict(
            "os.environ",
            {"ACTA_ANTHROPIC_API_KEY": "", "ANTHROPIC_API_KEY": "sk-general-test"},
            clear=False,
        ):
            with self.assertLogs("claracore.acta_anthropic", level="WARNING") as cm:
                key, source = resolve_acta_anthropic_key()
        self.assertEqual(key, "sk-general-test")
        self.assertEqual(source, "ANTHROPIC_API_KEY")
        joined = " ".join(cm.output)
        self.assertIn("ACTA_ANTHROPIC_API_KEY no configurada", joined)
        self.assertNotIn("sk-general-test", joined)
        self.assertNotIn("sk-acta", joined)

    def test_sin_claves(self):
        with patch.dict(
            "os.environ",
            {"ACTA_ANTHROPIC_API_KEY": "", "ANTHROPIC_API_KEY": ""},
            clear=False,
        ):
            key, source = resolve_acta_anthropic_key()
        self.assertEqual(key, "")
        self.assertEqual(source, "")

    def test_modelo_default_haiku_5_5(self):
        with patch.dict(
            "os.environ",
            {"ACTA_GRABACION_IA_MODEL": "", "ANTHROPIC_MODEL": ""},
            clear=False,
        ):
            self.assertEqual(resolve_acta_anthropic_model(), ACTA_ANTHROPIC_DEFAULT_MODEL)
            self.assertEqual(ACTA_ANTHROPIC_DEFAULT_MODEL, "claude-haiku-5-5")

    def test_modelo_opcional_acta_grabacion(self):
        with patch.dict(
            "os.environ",
            {
                "ACTA_GRABACION_IA_MODEL": "claude-haiku-5-5",
                "ANTHROPIC_MODEL": "claude-sonnet-4-6",
            },
            clear=False,
        ):
            self.assertEqual(resolve_acta_anthropic_model(), "claude-haiku-5-5")

    def test_modelo_respaldo_anthropic_model(self):
        with patch.dict(
            "os.environ",
            {"ACTA_GRABACION_IA_MODEL": "", "ANTHROPIC_MODEL": "claude-haiku-4-5"},
            clear=False,
        ):
            self.assertEqual(resolve_acta_anthropic_model(), "claude-haiku-4-5")


if __name__ == "__main__":
    unittest.main()
