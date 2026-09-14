"""Tests ligeros del contrato del mapa de funcionalidades (sin Azure)."""

from __future__ import annotations

IDS = frozenset({
    # Dashboard
    "dash_obra_ejecutada_presupuesto",
    "dash_resumen_desviaciones",
    "dash_aprobacion_sicoe_ppto",
    "dash_obra_acta_capitulo_rol",
    # Presupuesto
    "ppto_crear_obra_ejecutada",
    "ppto_nueva_version_versiones",
    "ppto_descargar_excel",
    "ppto_analisis_datos",
    "ppto_filtros",
    "ppto_panel_dinamico",
    "ppto_edicion_individual_masiva",
    "ppto_consulta_registro",
    "ppto_conexion_autocad",
    "ppto_graficos_bibliotecas",
    "ppto_cierre_financiero",
    # SICOE Obra
    "sicoe_viz_reportes_cantidades",
    "sicoe_filtros",
    "sicoe_panel_dinamico",
    "sicoe_crear_reporte_registros",
    "sicoe_consulta_registros",
    "sicoe_validacion_cantidades_masiva",
    "sicoe_descarga_plantillas",
    # Informes
    "informes_biblioteca",
    "informes_firmas_formatos",
    "informes_tipos_descarga",
    "informes_firma_documentos",
    # Almacén
    "almacen_crear_insumo",
    "almacen_plantillas",
    "almacen_solicitud_borrador_aprobacion",
    "almacen_aprobacion_oc",
    "almacen_entradas",
    "almacen_despachador",
    "almacen_devoluciones",
    "almacen_salidas",
    "almacen_inventario",
    # Seguimiento
    "seg_calendario",
    "seg_nueva_tarea",
    "seg_nueva_acta",
    "seg_bitacora",
    "seg_libro_digital",
    # Topografía
    "topo_biblioteca_puntos",
    "topo_crear_poligonal",
    "topo_crear_punto",
    "topo_circuito_nivelacion",
    "topo_estructura_diseno",
    "topo_carteras_via",
})

LEGACY = {
    "reporte_cantidades": "sicoe_crear_reporte_registros",
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


def test_mapa_navegacion_tiene_46_subtemas():
    assert len(IDS) == 46


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
    assert len(out["modulos"]) == 46
    assert out["modulos"]["sicoe_crear_reporte_registros"]["descripcion"] == "Crear reporte"
    assert out["modulos"]["sicoe_crear_reporte_registros"]["imagenes"] == [
        {"url": "https://x.png", "caption": "A"},
    ]
    assert out["modulos"]["sicoe_crear_reporte_registros"]["videoUrl"] == "https://video.example/rc.mp4"
    assert "desconocido" not in out["modulos"]


def test_mapa_navegacion_migra_legacy_reporte_cantidades():
    out = normalizar({
        "modulos": {
            "reporte_cantidades": {
                "descripcion": "Legacy RC",
                "imagenes": [{"url": "https://old.png"}],
            },
        },
    })
    dest = out["modulos"]["sicoe_crear_reporte_registros"]
    assert dest["descripcion"] == "Legacy RC"
    assert dest["imagenes"] == [{"url": "https://old.png", "caption": ""}]
