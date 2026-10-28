"""Export informe: CIV enriquecido desde maestro pk_ids para memorias Excel."""
from __future__ import annotations

import ast
from pathlib import Path


def test_pk_ids_ubicacion_incluye_civ_en_fuente():
    """_pk_ids_ubicacion_por_codigo debe mapear civ (además de tramo/infra)."""
    src = (Path(__file__).resolve().parents[1] / "main.py").read_text(encoding="utf-8")
    marker = "def _pk_ids_ubicacion_por_codigo"
    start = src.index(marker)
    chunk = src[start : start + 800]
    assert '"civ"' in chunk or "'civ'" in chunk
    assert "infraestructura" in chunk


def test_registros_informe_incluyen_civ_en_fuente():
    src = (Path(__file__).resolve().parents[1] / "main.py").read_text(encoding="utf-8")
    # El append de registros del informe debe exponer civ (no solo pk_id).
    assert '"civ": str(r.get("civ") or "").strip()' in src or '"civ":' in src
    assert "CIV para memorias Excel" in src or "columna CIV" in src
