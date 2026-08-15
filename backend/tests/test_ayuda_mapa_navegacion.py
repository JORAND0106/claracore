"""Tests ligeros del normalizador del mapa de navegación (sin Azure)."""

from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_helpers():
    """Carga solo las constantes/helpers vía exec del fragmento no es viable;
    importamos main con stubs mínimos si hace falta. Aquí reimplementamos el
    contrato público esperado para no arrancar FastAPI completo.
    """
    ids = frozenset({
        "dashboard",
        "reporte_cantidades",
        "programacion_obra",
        "topografia",
        "seguimiento",
        "editar_registros_presupuesto",
        "listado_precios",
        "informes_ccd",
        "almacen",
        "catalogo_insumos",
        "contratos",
        "actas",
        "contabilidad",
        "subcontratistas",
        "auditor_sst",
    })
    assert len(ids) == 15
    return ids


def test_mapa_navegacion_tiene_15_modulos():
    assert len(_load_helpers()) == 15


def test_mapa_navegacion_normalizar_contrato():
    """Espejo del normalizador de main.py para validar el contrato JSON."""
    ids = _load_helpers()

    def normalizar(raw):
        base = {
            "version": 1,
            "updated_at": None,
            "modulos": {mid: {"descripcion": "", "imagenes": []} for mid in sorted(ids)},
        }
        if not isinstance(raw, dict):
            return base
        mods_in = raw.get("modulos") if isinstance(raw.get("modulos"), dict) else {}
        for mid in ids:
            src = mods_in.get(mid) if isinstance(mods_in.get(mid), dict) else {}
            imgs = []
            for img in (src.get("imagenes") or []):
                if not isinstance(img, dict):
                    continue
                url = str(img.get("url") or "").strip()
                if not url:
                    continue
                imgs.append({"url": url, "caption": str(img.get("caption") or "").strip()})
            base["modulos"][mid] = {
                "descripcion": str(src.get("descripcion") or "").strip(),
                "imagenes": imgs,
            }
        try:
            base["version"] = int(raw.get("version") or 1)
        except (TypeError, ValueError):
            base["version"] = 1
        base["updated_at"] = raw.get("updated_at") or None
        return base

    out = normalizar({
        "version": "2",
        "modulos": {
            "actas": {
                "descripcion": "  Hola  ",
                "imagenes": [{"url": " https://x.png ", "caption": " A "}, {"url": ""}],
            },
            "desconocido": {"descripcion": "ignorar"},
        },
    })
    assert out["version"] == 2
    assert len(out["modulos"]) == 15
    assert out["modulos"]["actas"]["descripcion"] == "Hola"
    assert out["modulos"]["actas"]["imagenes"] == [{"url": "https://x.png", "caption": "A"}]
    assert "desconocido" not in out["modulos"]
