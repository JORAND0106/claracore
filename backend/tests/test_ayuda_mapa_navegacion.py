"""Tests ligeros del contrato del mapa de funcionalidades (sin Azure)."""

from __future__ import annotations

IDS = frozenset({
    "dash_leer_indicadores",
    "ppto_arranca_versiona",
    "ppto_analiza_datos",
    "ppto_edita_consulta",
    "ppto_autocad_graficos",
    "ppto_exporta_cierra",
    "sicoe_crear_reporte_registros",
    "sicoe_visualiza_filtra",
    "sicoe_consulta_valida",
    "sicoe_descarga_plantillas",
    "informes_biblioteca_formatos",
    "informes_firmas_personalizacion",
    "almacen_catalogo_insumos",
    "almacen_solicita_aprueba",
    "almacen_mueve_obra",
    "almacen_consulta_inventario",
    "seg_tareas_calendario",
    "seg_constancia_digital",
    "topo_administra_puntos",
    "topo_poligonales_nivelacion",
    "topo_diseno_entrega",
})

LEGACY = {
    "reporte_cantidades": "sicoe_crear_reporte_registros",
    "dash_resumen_desviaciones": "dash_leer_indicadores",
}


def _entrada_vacia():
    return {"descripcion": "", "imagenes": [], "videoUrl": ""}


def _normalizar_entrada(src):
    if not isinstance(src, dict):
        return _entrada_vacia()
    imgs = []
    for img in (src.get("imagenes") or []):
        if not isinstance(img, dict):
            continue
        url = str(img.get("url") or "").strip()
        if not url:
            continue
        imgs.append({"url": url, "caption": str(img.get("caption") or "").strip()})
    return {
        "descripcion": str(src.get("descripcion") or "").strip(),
        "imagenes": imgs,
        "videoUrl": str(src.get("videoUrl") or src.get("video_url") or "").strip(),
    }


def _pendiente(entrada):
    return (
        not str(entrada.get("descripcion") or "").strip()
        and not (entrada.get("imagenes") or [])
        and not str(entrada.get("videoUrl") or "").strip()
    )


def normalizar(raw):
    base = {
        "version": 1,
        "updated_at": None,
        "modulos": {mid: _entrada_vacia() for mid in sorted(IDS)},
    }
    if not isinstance(raw, dict):
        return base
    mods_in = dict(raw.get("modulos") if isinstance(raw.get("modulos"), dict) else {})
    for legacy_id, nuevo_id in LEGACY.items():
        if legacy_id not in mods_in or nuevo_id not in IDS:
            continue
        legacy = _normalizar_entrada(mods_in.get(legacy_id))
        actual = _normalizar_entrada(mods_in.get(nuevo_id))
        if _pendiente(actual) and not _pendiente(legacy):
            mods_in[nuevo_id] = legacy
    for mid in IDS:
        base["modulos"][mid] = _normalizar_entrada(mods_in.get(mid))
    try:
        base["version"] = int(raw.get("version") or 1)
    except (TypeError, ValueError):
        base["version"] = 1
    base["updated_at"] = raw.get("updated_at") or None
    return base


def test_mapa_navegacion_tiene_21_temas():
    assert len(IDS) == 21


def test_mapa_navegacion_normalizar_contrato():
    out = normalizar({
        "version": "2",
        "modulos": {
            "sicoe_crear_reporte_registros": {
                "descripcion": "  Crear reporte  ",
                "imagenes": [{"url": " https://x.png ", "caption": " A "}, {"url": ""}],
                "videoUrl": " https://video.example/rc.mp4 ",
            },
            "desconocido": {"descripcion": "ignorar"},
        },
    })
    assert out["version"] == 2
    assert len(out["modulos"]) == 21
    assert out["modulos"]["sicoe_crear_reporte_registros"]["descripcion"] == "Crear reporte"
    assert out["modulos"]["sicoe_crear_reporte_registros"]["imagenes"] == [
        {"url": "https://x.png", "caption": "A"},
    ]
    assert out["modulos"]["sicoe_crear_reporte_registros"]["videoUrl"] == "https://video.example/rc.mp4"
    assert "desconocido" not in out["modulos"]


def test_mapa_navegacion_migra_legacy_a_grupos():
    out = normalizar({
        "modulos": {
            "reporte_cantidades": {
                "descripcion": "Legacy RC",
                "imagenes": [{"url": "https://old.png"}],
            },
            "dash_resumen_desviaciones": {
                "descripcion": "Legacy dash",
            },
        },
    })
    assert out["modulos"]["sicoe_crear_reporte_registros"]["descripcion"] == "Legacy RC"
    assert out["modulos"]["dash_leer_indicadores"]["descripcion"] == "Legacy dash"
