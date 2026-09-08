"""
Smoke test de arranque: importar main no debe fallar por import circular.

Reproduce el fallo de producción (502/503) tras PR #426, donde
`subcontratistas_docs_routes` se incluía antes de definir
`_fetch_subcontratista_row` y helpers afines en main.py.
"""
from __future__ import annotations

import importlib
import os
import sys


def test_main_module_imports_without_circular_error():
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    os.environ.setdefault("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.x")
    os.environ.setdefault("SECRET_KEY", "test-secret")
    os.environ.setdefault("ALGORITHM", "HS256")

    # Evitar módulos contaminados por stubs de otros tests en la misma sesión
    for name in list(sys.modules):
        if (
            name == "main"
            or name.startswith("subcontratistas_docs")
            or name == "azure_blob_storage"
            or name.startswith("azure.")
            or name == "azure"
        ):
            sys.modules.pop(name, None)

    try:
        main = importlib.import_module("main")
    except ImportError as e:
        msg = str(e)
        if "circular" in msg.lower() or "partially initialized" in msg.lower():
            raise AssertionError(f"Import circular al cargar main: {e}") from e
        raise

    assert main is not None
    assert hasattr(main, "app"), "main.app debe existir tras el import"
    # Helpers tardíos deben estar disponibles (eran la causa del circular)
    assert callable(getattr(main, "_fetch_subcontratista_row", None))
    assert callable(getattr(main, "_puede_gestionar_subcontratistas_admin", None))
    assert callable(getattr(main, "_require_acceso_cortes_subcontratista", None))
    # Router de docs debe haber podido importarse
    assert "subcontratistas_docs_routes" in sys.modules
