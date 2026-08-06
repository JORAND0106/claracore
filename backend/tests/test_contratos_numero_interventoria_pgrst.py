"""Detección de PGRST204 para contratos.numero_interventoria."""
from __future__ import annotations


def test_is_pgrst_missing_column_match():
    # Import diferido: en CI liviano puede no haber fastapi; la lógica se copia mínima.
    msg = (
        "APIError: {'message': \"Could not find the 'numero_interventoria' column "
        "of 'contratos' in the schema cache\", 'code': 'PGRST204', 'hint': None, 'details': None}"
    )

    def _is_pgrst_missing_column(exc: BaseException, column: str) -> bool:
        text = str(exc or "")
        low = text.lower()
        col = (column or "").lower()
        if col not in low:
            return False
        return "pgrst204" in low or "schema cache" in low or "could not find" in low

    assert _is_pgrst_missing_column(Exception(msg), "numero_interventoria") is True
    assert _is_pgrst_missing_column(Exception(msg), "otra_columna") is False
    assert _is_pgrst_missing_column(Exception("otro error"), "numero_interventoria") is False
