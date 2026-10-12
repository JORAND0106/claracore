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
    "sicoe_asigna_item_cobro",
    "sicoe_visualiza_filtra",
    "sicoe_consulta_valida",
    "sicoe_descarga_plantillas",
    "informes_biblioteca_formatos",
    "informes_firmas_personalizacion",
    "almacen_catalogo_insumos",
    "almacen_solicita_materiales",
    "almacen_asigna_insumo_proveedor",
    "almacen_aprueba_genera_oc",
    "almacen_mueve_obra",
    "almacen_consulta_inventario",
    "seg_tareas_calendario",
    "seg_actas_reunion",
    "seg_bitacora_obra",
    "seg_libro_digital",
    "topo_administra_puntos",
    "topo_poligonales_nivelacion",
    "topo_diseno_entrega",
})

LEGACY = {
    "reporte_cantidades": "sicoe_crear_reporte_registros",
    "dash_resumen_desviaciones": "dash_leer_indicadores",
    "almacen_solicita_aprueba": "almacen_solicita_materiales",
    "seg_constancia_digital": "seg_actas_reunion",
}


def _entrada_vacia():
    return {
        "descripcion": "",
        "imagenes": [],
        "videoUrl": "",
        "videoMusicId": "",
        "videoUpdatedAt": None,
    }


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
        "videoMusicId": str(src.get("videoMusicId") or src.get("video_music_id") or "").strip(),
        "videoUpdatedAt": src.get("videoUpdatedAt") or src.get("video_updated_at") or None,
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


def test_mapa_navegacion_tiene_26_temas():
    assert len(IDS) == 26
    assert "sicoe_asigna_item_cobro" in IDS
    assert "almacen_solicita_materiales" in IDS
    assert "seg_actas_reunion" in IDS
    assert "seg_bitacora_obra" in IDS
    assert "seg_libro_digital" in IDS
    assert "seg_constancia_digital" not in IDS
    assert "almacen_solicita_aprueba" not in IDS


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
    assert len(out["modulos"]) == 26
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
            "almacen_solicita_aprueba": {
                "descripcion": "Legacy solicita/aprueba",
                "videoUrl": "https://cdn/legacy-almacen.mp4",
            },
            "seg_constancia_digital": {
                "descripcion": "Legacy constancia",
                "videoUrl": "https://cdn/legacy-constancia.mp4",
            },
            "seg_tareas_calendario": {
                "videoUrl": "https://cdn/seg-tareas.mp4",
            },
        },
    })
    assert out["modulos"]["sicoe_crear_reporte_registros"]["descripcion"] == "Legacy RC"
    assert out["modulos"]["almacen_solicita_materiales"]["videoUrl"] == "https://cdn/legacy-almacen.mp4"
    assert out["modulos"]["almacen_solicita_materiales"]["descripcion"] == "Legacy solicita/aprueba"
    assert out["modulos"]["almacen_asigna_insumo_proveedor"]["videoUrl"] == ""
    assert out["modulos"]["almacen_aprueba_genera_oc"]["videoUrl"] == ""
    assert out["modulos"]["dash_leer_indicadores"]["descripcion"] == "Legacy dash"
    assert out["modulos"]["seg_actas_reunion"]["videoUrl"] == "https://cdn/legacy-constancia.mp4"
    assert out["modulos"]["seg_actas_reunion"]["descripcion"] == "Legacy constancia"
    assert out["modulos"]["seg_tareas_calendario"]["videoUrl"] == "https://cdn/seg-tareas.mp4"
    assert out["modulos"]["seg_bitacora_obra"]["videoUrl"] == ""
    assert out["modulos"]["seg_libro_digital"]["videoUrl"] == ""
