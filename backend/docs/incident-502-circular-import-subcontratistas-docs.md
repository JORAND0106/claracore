# Causa raíz — caída backend 502/503 tras merge PR #426 (2026-09-08)
# ==================================================================
#
# Síntoma
#   Tras el banner de actualización y redeploy, login fallaba con
#   "Sin conexión con el servidor ClaraCore". healthz devolvía 503.
#   El workflow "Deploy backend on push" terminó en verde (ZIP Deploy OK);
#   el proceso Python no arrancaba.
#
# Causa raíz
#   Import circular al cargar `main:app`:
#     main.py incluía `subcontratistas_docs_routes` cerca de la línea ~2924
#     (junto a otros routers), pero ese módulo hacía
#       from main import _fetch_subcontratista_row, ...
#     y esos helpers se definen mucho más abajo (~17600+, sección
#     SUBCONTRATISTAS). Python falla con:
#       ImportError: cannot import name '_fetch_subcontratista_row'
#       from partially initialized module 'main' (circular import)
#   Uvicorn no llega a escuchar → Azure App Service responde 502/503.
#
# No fue
#   - Pérdida de variables de entorno / secretos
#   - Incompatibilidad del SQL de pólizas/documentos (el arranque
#     ni siquiera alcanzaba a consultar Supabase)
#   - Fallo del workflow de deploy (el paquete sí se publicó)
#
# Corrección
#   1. Registrar `subcontratistas_docs_router` DESPUÉS de definir los
#      helpers de subcontratistas en main.py.
#   2. En `subcontratistas_docs_routes.py`, acceder a esos helpers vía
#      import lazy (`import main` dentro de wrappers) para que un
#      include_router prematuro no vuelva a tumbar el arranque.
#   3. Smoke test `tests/test_main_import_startup.py` que falla si el
#      import de main rompe por circularidad.
#
# Prevención
#   - No importar desde `main` símbolos definidos tarde en el mismo
#     archivo al nivel de módulo de un router incluido temprano.
#   - Preferir lazy import o mover helpers a un módulo propio.
#   - Mantener el smoke test de import en CI/pytest.
#
# Verificación post-fix
#   curl https://claracore-backend.azurewebsites.net/healthz  → 200
#   Login de la plataforma responde (no 502).
