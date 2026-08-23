"""Rutas HTTP Topografia — montadas en main con prefijo `/topografia`."""
from __future__ import annotations

import base64
import html
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from main import _require_contract_access, get_current_user, supabase, supabase_execute
from topografia_permissions import (
    lado_validacion_topo_usuario,
    require_permiso_topografia,
    require_topo_puede_validar_nivel,
    tiene_permiso_topografia,
)
from topografia_diseno_utils import (
    PLANTILLA_CSV_DISENO,
    SECCION_TIPOS,
    cota_diseno_capa,
    capa_referencia_analisis,
    generar_perfil_desde_filas,
    parse_csv_diseno_rasante,
    parse_filas_diseno_rasante,
    indice_entrega_referencia_capa,
    referencia_analisis_indice,
)
from topografia_entrega_utils import (
    abscisas_referencia_en_rango,
    altura_instrumento_desde_bloque,
    bloque_aplicable_abscisa,
    calcular_lectura_entrega,
    cota_campo_ref_interp,
    diseno_fila_abscisa,
    diseno_fila_por_ordenadas,
    filas_matriz_entrega,
    filtrar_rasante_rango,
    grilla_diseno_entrega,
    grilla_entrega_capa,
    grilla_fondo_terreno_entrega,
    grilla_terreno_natural_entrega,
    es_entrega_terreno_natural,
    capa_nombre_vigente_entrega,
    info_sector_rango,
    mapa_cota_campo_lecturas,
    ordenadas_referencia_izq_eje_der,
    ordenadas_transversales,
    resumen_sectores_entrega,
)
from topografia_utils import (
    area_por_coordenadas,
    azimut_desde_deltas,
    calcular_verificacion_estacion_total,
    calcular_verificacion_nivel,
    decimal_a_gms_numero,
    decimal_to_gms,
    ajustar_poligonal_armadas,
    enriquecer_estaciones_poligonal,
    fusionar_estaciones_vista,
    gms_to_decimal,
    html_documento_poligonal_pdf,
    html_documento_newpoint_pdf,
    html_documento_nivelacion_pdf,
    html_encabezado_pdf,
    html_pie_pdf,
    calcular_cierre_poligonal,
    newpoint_por_angulo_distancias,
    faltantes_campo_newpoint,
    calcular_nivelacion_geometrica,
    distancia_taquimetrica_nivelacion,
    enriquecer_nivelacion_pdf,
    faltantes_campo_nivelacion,
    _resolver_bms_nivelacion_pdf,
    _agrupar_lecturas_por_fila,
    _grupo_es_cierre,
    lectura_efectiva_nivelacion,
    media_hilos_nivelacion,
    validar_lecturas_nivelacion,
    perimetro_por_coordenadas,
    radiar_armadas,
    segundos_arco_a_texto,
    svg_interseccion,
    svg_newpoint_opciones,
    svg_poligono,
    to_pdf_bytes,
)

router = APIRouter(tags=["topografia"])

NIVEL_MAX = 2
ESTADOS_VALIDACION = frozenset({"Aprobado", "Pendiente", "Rechazado"})


class ValidarPoligonalBody(BaseModel):
    estado: Literal["Aprobado", "Pendiente", "Rechazado"]
    comentario_data: Optional[dict] = None


def _perm(current_user, accion: str) -> None:
    require_permiso_topografia(current_user, accion)


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")


def _sanitize_uuid_optional(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return None
    return value


def _dump_model(body: BaseModel, uuid_fields: tuple[str, ...] = (), exclude: Optional[set] = None) -> dict:
    # mode="json" convierte date/datetime a string ISO para que Supabase/JSON no falle.
    data = body.model_dump(mode="json", exclude=exclude or set())
    for field in uuid_fields:
        if field in data:
            data[field] = _sanitize_uuid_optional(data[field])
    return data


def _row(table: str, select: str = "*", **eq) -> Optional[dict]:
    q = supabase.table(table).select(select)
    for k, v in eq.items():
        q = q.eq(k, v)
    rows = q.limit(1).execute().data or []
    return rows[0] if rows else None


def _require_contrato_row(contrato_id: int) -> dict:
    row = _row(
        "contratos",
        "id, numero, objeto, contratista, nit, interventoria, entidad, entidad_otra, "
        "logo_contratista, logo_interventoria, logo_entidad",
        id=contrato_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    return row


def _poligonal_sellada(pol: dict) -> bool:
    """Sellado definitivo: únicamente tras validación interventoría (BO) aprobada."""
    if (pol.get("nivel2_estado") or "") == "Aprobado":
        return True
    if pol.get("biblioteca_at"):
        return True
    return False


def _assert_poligonal_sellada(pol: dict) -> None:
    if _poligonal_sellada(pol):
        raise HTTPException(
            status_code=403,
            detail="Poligonal sellada tras validación de interventoría.",
        )


def _assert_poligonal_libreta_editable(pol: dict) -> None:
    """Libreta editable: no sellada y aún no terminada (estado != cerrado)."""
    _assert_poligonal_sellada(pol)
    if (pol.get("estado") or "").lower() == "cerrado":
        raise HTTPException(status_code=403, detail="Poligonal terminada; la libreta no es editable.")


def _nombre_usuario(uid) -> Optional[str]:
    if uid is None:
        return None
    u = _row("usuarios", select="nombre, apellidos", id=int(uid))
    if not u:
        return None
    return f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip() or None


def _enriquecer_poligonal_vista(pol: dict) -> dict:
    if not pol:
        return pol
    out = dict(pol)
    out["nivel1_usuario_nombre"] = _nombre_usuario(pol.get("nivel1_usuario_id"))
    out["nivel2_usuario_nombre"] = _nombre_usuario(pol.get("nivel2_usuario_id"))
    return out


def _assert_editable(nivel_validacion: int, pol: Optional[dict] = None) -> None:
    if pol and _poligonal_sellada(pol):
        raise HTTPException(status_code=403, detail="Poligonal sellada tras validación de interventoría.")
    if int(nivel_validacion or 0) >= NIVEL_MAX:
        raise HTTPException(status_code=403, detail="Registro sellado; no editable")


def _assert_poligonal_editable(pol: dict) -> None:
    """Alias: edición de amarres / libreta."""
    _assert_poligonal_libreta_editable(pol)


def _cierre_poligonal_vivo(pol: dict, poligonal_id: str) -> dict:
    estaciones = (
        supabase.table("topo_poligonal_estaciones")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    punto_inicial = _row("topo_puntos", id=pol.get("punto_inicial_id")) if pol.get("punto_inicial_id") else None
    punto_final = _row("topo_puntos", id=pol.get("punto_final_id")) if pol.get("punto_final_id") else None
    punto_visado = _row("topo_puntos", id=pol.get("punto_visado_id")) if pol.get("punto_visado_id") else None
    amarres = {}
    for p in (punto_inicial, punto_visado):
        if p and p.get("nombre"):
            amarres[p["nombre"]] = {"norte": p.get("norte"), "este": p.get("este"), "cota": p.get("cota")}
    armadas_enr, _, _ = radiar_armadas(armadas, estaciones, amarres)
    return calcular_cierre_poligonal(
        armadas_enr,
        punto_inicial,
        sentido=pol.get("sentido") or "antihorario",
        tol_relativa=pol.get("tolerancia_relativa") or 25000,
        tol_cota_mm_km=pol.get("tolerancia_cota_mm_km") or 12,
        precision_angular_seg=pol.get("precision_angular_seg") or 10.0,
        longitud_max_delta_m=pol.get("longitud_max_delta_m"),
        punto_final=punto_final,
        tipo_pol=pol.get("tipo") or "cerrada",
    )


def _exigir_poligonal_lista_validar(pol: dict, poligonal_id: str) -> dict:
    if (pol.get("estado") or "") != "cerrado":
        raise HTTPException(
            status_code=422,
            detail="La poligonal debe estar terminada (cerrada) antes de validar.",
        )
    if not pol.get("ajustada_at"):
        raise HTTPException(
            status_code=422,
            detail="Debe ejecutar «Corregir y ajustar» antes de validar.",
        )
    cierre = _cierre_poligonal_vivo(pol, poligonal_id)
    if not cierre.get("cerrado"):
        raise HTTPException(status_code=422, detail="La poligonal no cierra geométricamente.")
    if not cierre.get("admisible_lineal"):
        raise HTTPException(status_code=422, detail="El cierre lineal no cumple tolerancia; no se puede validar.")
    return cierre


def _insertar_comentario_poligonal(
    contrato_id: int,
    poligonal_id: str,
    autor_id: int,
    nivel: int,
    estado: str,
    comentario_data: dict,
    rol_origen: str,
) -> None:
    mensaje = (comentario_data.get("mensaje") or "").strip()
    if not mensaje:
        raise HTTPException(status_code=422, detail="El comentario debe incluir un mensaje.")
    dest = comentario_data.get("destinatarios") or []
    if not dest:
        raise HTTPException(status_code=422, detail="Indique al menos un destinatario del comentario.")
    supabase.table("topo_poligonal_comentarios").insert(
        {
            "poligonal_id": poligonal_id,
            "contrato_id": contrato_id,
            "autor_id": autor_id,
            "nivel": nivel,
            "estado": estado,
            "rol_origen": rol_origen,
            "etiqueta": comentario_data.get("etiqueta"),
            "mensaje": mensaje,
            "destinatarios": dest,
        }
    ).execute()


def _opciones_bd_desde_calc(calc: dict) -> dict:
    opciones = calc.get("opciones") or []
    oa = opciones[0] if len(opciones) > 0 else {}
    ob = opciones[1] if len(opciones) > 1 else {}
    return {
        "opcion_a_norte": oa.get("norte"),
        "opcion_a_este": oa.get("este"),
        "opcion_b_norte": ob.get("norte"),
        "opcion_b_este": ob.get("este"),
    }


def _opciones_vista_desde_row(row: dict, calc: dict | None = None) -> list[dict]:
    if calc and calc.get("opciones"):
        return calc["opciones"]
    opciones: list[dict] = []
    if row.get("opcion_a_norte") is not None and row.get("opcion_a_este") is not None:
        opciones.append({"id": "A", "norte": row["opcion_a_norte"], "este": row["opcion_a_este"]})
    if row.get("opcion_b_norte") is not None and row.get("opcion_b_este") is not None:
        opciones.append({"id": "B", "norte": row["opcion_b_norte"], "este": row["opcion_b_este"]})
    return opciones


def _svg_newpoint(
    row: dict,
    p1: dict,
    p2: dict,
    calc: dict | None = None,
    *,
    verts_named: list[dict] | None = None,
) -> str:
    verts = verts_named if verts_named is not None else _vertices_poligonal_named_para_newpoint(
        row["contrato_id"], row["poligonal_id"]
    )
    opciones = _opciones_vista_desde_row(row, calc)
    return svg_newpoint_opciones(
        verts,
        p1,
        p2,
        opciones,
        opcion_elegida=row.get("opcion_elegida"),
        nombre_nuevo=row.get("nombre_punto_nuevo") or "",
        titulo="NewPoint",
    )


def _enriquecer_newpoint_lista(row: dict, pol_nombres: dict[str, str]) -> dict:
    """Enriquecimiento mínimo para el listado (sin recálculo ni SVG)."""
    out = dict(row)
    out["poligonal_nombre"] = pol_nombres.get(str(row.get("poligonal_id") or ""))
    return out


def _enriquecer_newpoint_vista(
    row: dict,
    *,
    p1: dict | None = None,
    p2: dict | None = None,
    verts: list[tuple[float, float]] | None = None,
) -> dict:
    if not row:
        return row
    out = dict(row)
    out["nivel1_usuario_nombre"] = _nombre_usuario(row.get("nivel1_usuario_id"))
    out["nivel2_usuario_nombre"] = _nombre_usuario(row.get("nivel2_usuario_id"))
    pol = _row("topo_poligonales", id=row.get("poligonal_id"))
    if pol:
        out["poligonal_nombre"] = pol.get("nombre")
    ang = row.get("angulo_observado_gms")
    if ang is not None:
        out["angulo_observado_texto"] = decimal_to_gms(gms_to_decimal(ang))
    if row.get("error_angular_segundos") is not None:
        out["error_angular_gms_texto"] = segundos_arco_a_texto(row["error_angular_segundos"])
    if p1 is None and row.get("punto1_id"):
        p1 = _row("topo_puntos", id=row.get("punto1_id"))
    if p2 is None and row.get("punto2_id"):
        p2 = _row("topo_puntos", id=row.get("punto2_id"))
    if p1:
        out["punto1_nombre"] = p1.get("nombre")
        out["punto1_norte"] = p1.get("norte")
        out["punto1_este"] = p1.get("este")
    if p2:
        out["punto2_nombre"] = p2.get("nombre")
        out["punto2_norte"] = p2.get("norte")
        out["punto2_este"] = p2.get("este")
    if (
        p1 and p2
        and row.get("distancia1") is not None
        and row.get("distancia2") is not None
        and ang is not None
    ):
        try:
            if verts is None:
                verts = _vertices_poligonal_para_newpoint(row["contrato_id"], row["poligonal_id"])
            resumen = newpoint_por_angulo_distancias(
                p1["norte"], p1["este"], row["distancia1"],
                p2["norte"], p2["este"], row["distancia2"],
                ang,
                vertices_poligonal=verts,
            )
            out["opciones"] = resumen.get("opciones") or []
            ref = None
            if row.get("opcion_elegida") and out["opciones"]:
                ref = next((o for o in out["opciones"] if o.get("id") == row["opcion_elegida"]), None)
            if ref is None and out["opciones"]:
                ref = out["opciones"][0]
            if ref:
                out["angulo_calculado_texto"] = ref.get("angulo_calculado_texto")
            out["distancia_p1p2"] = resumen.get("distancia_p1p2")
            out["distancia_triangulo"] = resumen.get("distancia_triangulo")
        except ValueError:
            out["opciones"] = _opciones_vista_desde_row(row)
    else:
        out["opciones"] = _opciones_vista_desde_row(row)
    return out


def _newpoint_sellada(row: dict) -> bool:
    if (row.get("nivel2_estado") or "") == "Aprobado":
        return True
    if row.get("biblioteca_at"):
        return True
    return False


def _assert_newpoint_editable(row: dict) -> None:
    if _newpoint_sellada(row):
        raise HTTPException(status_code=403, detail="NewPoint sellado tras validación de interventoría.")


def _exigir_poligonal_sellada_para_newpoint(pol: dict) -> None:
    if not _poligonal_sellada(pol):
        raise HTTPException(
            status_code=422,
            detail="La poligonal de referencia debe estar sellada (interventoría aprobada y publicada en biblioteca).",
        )


def _punto_biblioteca_de_poligonal(punto_id: str, contrato_id: int, poligonal_id: str) -> dict:
    p = _row("topo_puntos", id=punto_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(status_code=404, detail="Punto no encontrado.")
    if not p.get("verificado"):
        raise HTTPException(status_code=422, detail=f"El punto «{p.get('nombre')}» no está verificado en biblioteca.")
    if (p.get("modulo_origen") or "") != "poligonal" or str(p.get("circuito_id") or "") != str(poligonal_id):
        raise HTTPException(
            status_code=422,
            detail=f"El punto «{p.get('nombre')}» no pertenece a la poligonal seleccionada.",
        )
    if p.get("norte") is None or p.get("este") is None:
        raise HTTPException(status_code=422, detail=f"El punto «{p.get('nombre')}» no tiene coordenadas.")
    return p


def _vertices_poligonal_named_para_newpoint(contrato_id: int, poligonal_id: str) -> list[dict]:
    """Vertices del circuito con nombre (para SVG)."""
    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("orden, estacion_nombre")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    puntos = (
        supabase.table("topo_puntos")
        .select("nombre, norte, este")
        .eq("contrato_id", contrato_id)
        .eq("circuito_id", poligonal_id)
        .eq("modulo_origen", "poligonal")
        .eq("verificado", True)
        .execute()
        .data
        or []
    )
    by_name = {
        p["nombre"]: {"nombre": p["nombre"], "norte": float(p["norte"]), "este": float(p["este"])}
        for p in puntos
        if p.get("nombre") and p.get("norte") is not None and p.get("este") is not None
    }
    vertices: list[dict] = []
    seen: set[str] = set()
    for arm in armadas:
        nm = (arm.get("estacion_nombre") or "").strip()
        if not nm or nm in seen or nm not in by_name:
            continue
        vertices.append(by_name[nm])
        seen.add(nm)
    if len(vertices) >= 3:
        return vertices
    return list(by_name.values())


def _vertices_poligonal_para_newpoint(contrato_id: int, poligonal_id: str) -> list[tuple[float, float]]:
    """Vertices del circuito en orden de estacion (para distinguir solucion espejo)."""
    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("orden, estacion_nombre")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    puntos = (
        supabase.table("topo_puntos")
        .select("nombre, norte, este")
        .eq("contrato_id", contrato_id)
        .eq("circuito_id", poligonal_id)
        .eq("modulo_origen", "poligonal")
        .eq("verificado", True)
        .execute()
        .data
        or []
    )
    by_name = {
        p["nombre"]: (float(p["norte"]), float(p["este"]))
        for p in puntos
        if p.get("nombre") and p.get("norte") is not None and p.get("este") is not None
    }
    vertices: list[tuple[float, float]] = []
    seen: set[str] = set()
    for arm in armadas:
        nm = (arm.get("estacion_nombre") or "").strip()
        if not nm or nm in seen or nm not in by_name:
            continue
        vertices.append(by_name[nm])
        seen.add(nm)
    if len(vertices) >= 3:
        return vertices
    return list(by_name.values())


def _calcular_payload_newpoint(body: NewPointBody, contrato_id: int) -> tuple[dict, dict, dict, dict]:
    pol = _row("topo_poligonales", id=body.poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada.")
    _exigir_poligonal_sellada_para_newpoint(pol)
    if body.punto1_id == body.punto2_id:
        raise HTTPException(status_code=422, detail="Seleccione dos puntos distintos de la misma poligonal.")
    p1 = _punto_biblioteca_de_poligonal(body.punto1_id, contrato_id, body.poligonal_id)
    p2 = _punto_biblioteca_de_poligonal(body.punto2_id, contrato_id, body.poligonal_id)
    if body.distancia1 <= 0 or body.distancia2 <= 0:
        raise HTTPException(status_code=422, detail="Las distancias deben ser mayores que cero.")
    try:
        calc = newpoint_por_angulo_distancias(
            p1["norte"], p1["este"], body.distancia1,
            p2["norte"], p2["este"], body.distancia2,
            body.angulo_observado_gms,
            vertices_poligonal=_vertices_poligonal_para_newpoint(contrato_id, body.poligonal_id),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    admisible = calc["error_lineal"] <= body.tolerancia_lineal and calc["error_angular_segundos"] <= body.tolerancia_angular_seg
    return pol, p1, p2, {**calc, "admisible": admisible}


def _publicar_newpoint_en_biblioteca(contrato_id: int, newpoint_id: str, row: dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    poligonal_id = row.get("poligonal_id")
    payload = {
        "contrato_id": contrato_id,
        "nombre": row.get("nombre_punto_nuevo"),
        "norte": row.get("norte_resultado"),
        "este": row.get("este_resultado"),
        "cota": row.get("cota_resultado"),
        "tipo": row.get("tipo_punto") or "auxiliar",
        "verificado": True,
        "modulo_origen": "newpoint",
        "circuito_id": poligonal_id,
        "fecha_verificacion": now,
        "operador": row.get("operador"),
        "fecha_campo": row.get("fecha") or row.get("fecha_campo"),
    }
    existing = _row("topo_puntos", contrato_id=contrato_id, nombre=row.get("nombre_punto_nuevo"))
    if existing:
        supabase.table("topo_puntos").update(payload).eq("id", existing["id"]).execute()
    else:
        supabase.table("topo_puntos").insert(payload).execute()
    supabase.table("topo_newpoints").update({"biblioteca_at": now}).eq("id", newpoint_id).execute()


def _insertar_comentario_newpoint(
    contrato_id: int,
    newpoint_id: str,
    autor_id: int,
    nivel: int,
    estado: str,
    comentario_data: dict,
    rol_origen: str,
) -> None:
    mensaje = (comentario_data.get("mensaje") or "").strip()
    if not mensaje:
        raise HTTPException(status_code=422, detail="El comentario debe incluir un mensaje.")
    dest = comentario_data.get("destinatarios") or []
    if not dest:
        raise HTTPException(status_code=422, detail="Indique al menos un destinatario del comentario.")
    supabase.table("topo_newpoint_comentarios").insert(
        {
            "newpoint_id": newpoint_id,
            "contrato_id": contrato_id,
            "autor_id": autor_id,
            "nivel": nivel,
            "estado": estado,
            "rol_origen": rol_origen,
            "etiqueta": comentario_data.get("etiqueta"),
            "mensaje": mensaje,
            "destinatarios": dest,
        }
    ).execute()


def _exigir_newpoint_lista_validar(row: dict) -> None:
    if not row.get("admisible"):
        raise HTTPException(status_code=422, detail="El cálculo debe ser admisible antes de validar.")
    if not row.get("opcion_elegida"):
        raise HTTPException(
            status_code=422,
            detail="Debe elegir la opción A o B (posición del puesto) antes de validar.",
        )
    if row.get("norte_resultado") is None or row.get("este_resultado") is None:
        raise HTTPException(status_code=422, detail="Faltan coordenadas del punto elegido.")


def _exigir_newpoint_datos_campo(row: dict) -> None:
    falt = faltantes_campo_newpoint(row)
    if falt:
        raise HTTPException(
            status_code=422,
            detail=f"Complete datos de campo antes de validar (contratista): {', '.join(falt)}.",
        )


def _reset_validacion_newpoint_update() -> dict:
    return {
        "nivel1_estado": "No Revisado",
        "nivel1_usuario_id": None,
        "nivel1_fecha": None,
        "nivel2_estado": "No Revisado",
        "nivel2_usuario_id": None,
        "nivel2_fecha": None,
        "biblioteca_at": None,
    }


def _inputs_geometria_newpoint_iguales(np: dict, body: NewPointBody) -> bool:
    try:
        return (
            np.get("poligonal_id") == body.poligonal_id
            and np.get("punto1_id") == body.punto1_id
            and np.get("punto2_id") == body.punto2_id
            and float(np.get("distancia1") or 0) == float(body.distancia1)
            and float(np.get("distancia2") or 0) == float(body.distancia2)
            and float(np.get("angulo_observado_gms") or 0) == float(body.angulo_observado_gms)
        )
    except (TypeError, ValueError):
        return False


def _meta_campo_newpoint_cambiada(np: dict, body: NewPointBody) -> bool:
    def _s(v) -> str:
        return "" if v is None else str(v).strip()

    return (
        _s(body.operador) != _s(np.get("operador"))
        or _s(body.fecha) != _s(np.get("fecha"))
        or _s(body.equipo_marca) != _s(np.get("equipo_marca"))
        or _s(body.equipo_referencia) != _s(np.get("equipo_referencia"))
        or _s(body.equipo_serial) != _s(np.get("equipo_serial"))
    )


def _aplicar_validacion_newpoint(
    contrato_id: int,
    newpoint_id: str,
    row: dict,
    nivel: int,
    body: ValidarPoligonalBody,
    current_user,
) -> dict:
    require_topo_puede_validar_nivel(current_user, nivel)
    _exigir_newpoint_lista_validar(row)
    if nivel == 1:
        _exigir_newpoint_datos_campo(row)
    if body.estado not in ESTADOS_VALIDACION:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Use: {sorted(ESTADOS_VALIDACION)}")
    if body.estado in ("Pendiente", "Rechazado") and not body.comentario_data:
        raise HTTPException(
            status_code=422,
            detail="Se requiere comentario cuando el estado es Pendiente o Rechazado.",
        )
    if nivel == 2 and (row.get("nivel1_estado") or "No Revisado") != "Aprobado":
        raise HTTPException(
            status_code=422,
            detail="La interventoría solo puede validar cuando la contratista haya aprobado (nivel 1).",
        )
    uid = _uid(current_user)
    now = datetime.now(timezone.utc).isoformat()
    update = {
        f"nivel{nivel}_estado": body.estado,
        f"nivel{nivel}_usuario_id": uid,
        f"nivel{nivel}_fecha": now,
    }
    supabase.table("topo_newpoints").update(update).eq("id", newpoint_id).execute()
    if body.comentario_data:
        _insertar_comentario_newpoint(
            contrato_id,
            newpoint_id,
            uid,
            nivel,
            body.estado,
            body.comentario_data,
            _rol_origen_topo(current_user),
        )
    if nivel == 2 and body.estado == "Aprobado":
        row_upd = _row("topo_newpoints", id=newpoint_id, contrato_id=contrato_id) or row
        _publicar_newpoint_en_biblioteca(contrato_id, newpoint_id, row_upd)
    return {
        "ok": True,
        "nivel": nivel,
        "estado": body.estado,
        "biblioteca": nivel == 2 and body.estado == "Aprobado",
    }


def _rol_origen_topo(current_user) -> str:
    lado = lado_validacion_topo_usuario(current_user)
    if lado == 2:
        return "interventoria"
    try:
        from main import _es_desarrollador

        if _es_desarrollador(current_user) and lado == 0:
            return "desarrollador"
    except Exception:
        pass
    return "contratista"


def _publicar_poligonal_en_biblioteca(contrato_id: int, poligonal_id: str, pol: dict) -> None:
    """Publica coordenadas ajustadas en topo_puntos (solo tras aprobación interventoría)."""
    estaciones = (
        supabase.table("topo_poligonal_estaciones")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    now = datetime.now(timezone.utc).isoformat()
    usar_ajustadas = bool(pol.get("ajustada_at"))

    def coords_est(est: dict):
        if usar_ajustadas and est.get("norte_ajustado") is not None:
            return est.get("norte_ajustado"), est.get("este_ajustado"), est.get("cota_ajustada")
        return est.get("norte"), est.get("este"), est.get("cota")

    meta_bib = {"operador": pol.get("operador"), "fecha_campo": pol.get("fecha_campo")}
    if pol.get("punto_inicial_id"):
        pi = _row("topo_puntos", id=pol["punto_inicial_id"], contrato_id=contrato_id)
        if pi:
            supabase.table("topo_puntos").update(
                {
                    "verificado": True,
                    "modulo_origen": "poligonal",
                    "circuito_id": poligonal_id,
                    "fecha_verificacion": now,
                    **meta_bib,
                }
            ).eq("id", pi["id"]).execute()

    for est in estaciones:
        norte, este, cota = coords_est(est)
        if norte is None or este is None:
            continue
        tipo = "estacion" if (est.get("tipo_punto") or "auxiliar") == "estacion" else "auxiliar"
        nombre = est.get("nombre_punto")
        if not nombre:
            continue
        payload = {
            "contrato_id": contrato_id,
            "nombre": nombre,
            "norte": norte,
            "este": este,
            "cota": cota,
            "tipo": tipo,
            "verificado": True,
            "modulo_origen": "poligonal",
            "circuito_id": poligonal_id,
            "fecha_verificacion": now,
            **meta_bib,
        }
        existing = _row("topo_puntos", contrato_id=contrato_id, nombre=nombre)
        if existing:
            supabase.table("topo_puntos").update(payload).eq("id", existing["id"]).execute()
        else:
            supabase.table("topo_puntos").insert(payload).execute()

    supabase.table("topo_poligonales").update({"biblioteca_at": now}).eq("id", poligonal_id).execute()


def _aplicar_validacion_poligonal(
    contrato_id: int,
    poligonal_id: str,
    pol: dict,
    nivel: int,
    body: ValidarPoligonalBody,
    current_user,
) -> dict:
    require_topo_puede_validar_nivel(current_user, nivel)
    _exigir_poligonal_lista_validar(pol, poligonal_id)
    if body.estado not in ESTADOS_VALIDACION:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Use: {sorted(ESTADOS_VALIDACION)}")
    if body.estado in ("Pendiente", "Rechazado") and not body.comentario_data:
        raise HTTPException(
            status_code=422,
            detail="Se requiere comentario cuando el estado es Pendiente o Rechazado.",
        )

    if nivel == 2:
        if (pol.get("nivel1_estado") or "No Revisado") != "Aprobado":
            raise HTTPException(
                status_code=422,
                detail="La interventoría solo puede validar cuando la contratista haya aprobado (nivel 1).",
            )

    uid = _uid(current_user)
    now = datetime.now(timezone.utc).isoformat()
    campo_est = f"nivel{nivel}_estado"
    campo_u = f"nivel{nivel}_usuario_id"
    campo_f = f"nivel{nivel}_fecha"

    update = {
        campo_est: body.estado,
        campo_u: uid,
        campo_f: now,
    }
    if nivel == 1:
        update["nivel_validacion"] = 1 if body.estado == "Aprobado" else 0
    elif nivel == 2:
        if body.estado == "Aprobado":
            update["nivel_validacion"] = NIVEL_MAX
        elif body.estado in ("Pendiente", "Rechazado"):
            update["nivel_validacion"] = 1

    supabase.table("topo_poligonales").update(update).eq("id", poligonal_id).execute()

    if body.comentario_data:
        _insertar_comentario_poligonal(
            contrato_id,
            poligonal_id,
            uid,
            nivel,
            body.estado,
            body.comentario_data,
            _rol_origen_topo(current_user),
        )

    if nivel == 2 and body.estado == "Aprobado":
        pol_upd = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id) or pol
        _publicar_poligonal_en_biblioteca(contrato_id, poligonal_id, pol_upd)

    return {
        "ok": True,
        "nivel": nivel,
        "estado": body.estado,
        "nivel_validacion": update.get("nivel_validacion", pol.get("nivel_validacion")),
        "biblioteca": nivel == 2 and body.estado == "Aprobado",
    }


def _punto_verificado(punto_id: str, contrato_id: int) -> dict:
    p = _row("topo_puntos", id=punto_id, contrato_id=contrato_id)
    if not p:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    if not p.get("verificado"):
        raise HTTPException(status_code=422, detail="El punto no esta verificado")
    return p


def _punto_nivelacion_biblioteca(punto_id: str, contrato_id: int) -> dict:
    p = _punto_verificado(punto_id, contrato_id)
    if (p.get("modulo_origen") or "") != "nivelacion":
        raise HTTPException(
            status_code=422,
            detail="Solo puntos verificados de biblioteca con origen nivelación.",
        )
    return p


def _crear_punto_amarre(contrato_id: int, amarre: AmarreBody) -> str:
    nombre = (amarre.nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="Indique el nombre del punto de amarre.")
    existing = _row("topo_puntos", contrato_id=contrato_id, nombre=nombre)
    if existing:
        if existing.get("verificado"):
            return existing["id"]
        supabase.table("topo_puntos").update(
            {
                "norte": amarre.norte,
                "este": amarre.este,
                "cota": amarre.cota,
                "tipo": "BM",
            }
        ).eq("id", existing["id"]).execute()
        return existing["id"]
    row = (
        supabase.table("topo_puntos")
        .insert(
            {
                "contrato_id": contrato_id,
                "nombre": nombre,
                "norte": amarre.norte,
                "este": amarre.este,
                "cota": amarre.cota,
                "tipo": "BM",
                "verificado": False,
                "modulo_origen": "poligonal_amarre",
            }
        )
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=500, detail="No se pudo crear el punto de amarre")
    return row[0]["id"]


def _resolver_amarres_poligonal(contrato_id: int, body: PoligonalBody, payload: dict) -> None:
    if payload.get("punto_inicial_id"):
        _punto_verificado(payload["punto_inicial_id"], contrato_id)
    elif body.amarre_inicial:
        payload["punto_inicial_id"] = _crear_punto_amarre(contrato_id, body.amarre_inicial)
    else:
        raise HTTPException(
            status_code=422,
            detail="Indique el punto de amarre inicial (nombre, Norte y Este) o seleccione un BM verificado.",
        )

    if payload["tipo"] == "cerrada":
        payload["punto_final_id"] = payload["punto_inicial_id"]
    elif payload.get("punto_final_id"):
        _punto_verificado(payload["punto_final_id"], contrato_id)
    elif body.amarre_final:
        payload["punto_final_id"] = _crear_punto_amarre(contrato_id, body.amarre_final)
    else:
        raise HTTPException(
            status_code=422,
            detail="Poligonal abierta: indique el punto de llegada (nombre, Norte y Este) o seleccione un BM verificado.",
        )

    # Punto de visado (referencia para el azimut de partida).
    if payload.get("punto_visado_id"):
        _punto_verificado(payload["punto_visado_id"], contrato_id)
    elif body.amarre_visado:
        payload["punto_visado_id"] = _crear_punto_amarre(contrato_id, body.amarre_visado)


_AMARRE_PUNTO_KEYS = {
    "estacion": "punto_inicial_id",
    "visado": "punto_visado_id",
    "llegada": "punto_final_id",
}


def _limpiar_ajuste_poligonal(poligonal_id: str) -> None:
    """Quita correcciones persistidas tras cambiar amarres (recalcular en libreta)."""
    supabase.table("topo_poligonal_estaciones").update(
        {
            "norte": None,
            "este": None,
            "cota": None,
            "angulo_corregido": None,
            "azimut": None,
            "delta_norte": None,
            "delta_este": None,
            "delta_cota": None,
            "correccion_norte": None,
            "correccion_este": None,
            "correccion_cota": None,
            "norte_ajustado": None,
            "este_ajustado": None,
            "cota_ajustada": None,
        }
    ).eq("poligonal_id", poligonal_id).execute()
    supabase.table("topo_poligonales").update(
        {
            "ajustada_at": None,
            "error_cierre_dn": None,
            "error_cierre_de": None,
            "error_cierre_dz": None,
            "error_lineal": None,
            "precision_relativa": None,
            "suma_angular_obs": None,
            "suma_angular_teorica": None,
            "error_angular_seg": None,
            "num_vertices": None,
        }
    ).eq("id", poligonal_id).execute()


def _propagar_nombre_amarre_armadas(poligonal_id: str, nombre_viejo: str, nombre_nuevo: str) -> None:
    if not nombre_viejo or nombre_viejo == nombre_nuevo:
        return
    for col in ("estacion_nombre", "visado_nombre"):
        supabase.table("topo_poligonal_armadas").update({col: nombre_nuevo}).eq(
            "poligonal_id", poligonal_id
        ).eq(col, nombre_viejo).execute()


def _actualizar_punto_amarre_poligonal(
    contrato_id: int,
    pol: dict,
    poligonal_id: str,
    rol: str,
    amarre: AmarreBody,
) -> None:
    pid_key = _AMARRE_PUNTO_KEYS.get(rol)
    if not pid_key:
        raise HTTPException(status_code=422, detail=f"Rol de amarre invalido: {rol}")
    punto_id = pol.get(pid_key)
    if not punto_id:
        raise HTTPException(status_code=422, detail=f"No hay punto de amarre ({rol}) en esta poligonal.")
    punto = _row("topo_puntos", id=punto_id, contrato_id=contrato_id)
    if not punto:
        raise HTTPException(status_code=404, detail="Punto de amarre no encontrado")
    circuito = punto.get("circuito_id")
    if circuito and str(circuito) != str(poligonal_id):
        raise HTTPException(status_code=403, detail="El punto ya pertenece a un circuito cerrado; no editable.")

    nombre = (amarre.nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="Indique el nombre del punto de amarre.")
    if amarre.norte is None or amarre.este is None:
        raise HTTPException(status_code=422, detail="Norte y Este son obligatorios.")

    nombre_viejo = punto.get("nombre") or ""
    if nombre != nombre_viejo:
        dup = _row("topo_puntos", contrato_id=contrato_id, nombre=nombre)
        if dup and str(dup["id"]) != str(punto_id):
            raise HTTPException(status_code=422, detail=f"Ya existe otro punto con nombre «{nombre}».")
        _propagar_nombre_amarre_armadas(poligonal_id, nombre_viejo, nombre)

    supabase.table("topo_puntos").update(
        {
            "nombre": nombre,
            "norte": float(amarre.norte),
            "este": float(amarre.este),
            "cota": amarre.cota,
        }
    ).eq("id", punto_id).eq("contrato_id", contrato_id).execute()


def _calcular_base_visado(punto_estacion: Optional[dict], punto_visado: Optional[dict]) -> Optional[dict]:
    """Azimut y distancia de la base estacion -> visado a partir de sus coordenadas."""
    if not punto_estacion or not punto_visado:
        return None
    ne, ee = punto_estacion.get("norte"), punto_estacion.get("este")
    nv, ev = punto_visado.get("norte"), punto_visado.get("este")
    if ne is None or ee is None or nv is None or ev is None:
        return None
    dn = float(nv) - float(ne)
    de = float(ev) - float(ee)
    distancia = (dn ** 2 + de ** 2) ** 0.5
    azimut = azimut_desde_deltas(dn, de)
    return {
        "estacion": punto_estacion.get("nombre"),
        "visado": punto_visado.get("nombre"),
        "delta_norte": round(dn, 3),
        "delta_este": round(de, 3),
        "distancia": round(distancia, 3),
        "azimut_decimal": round(azimut, 6),
        "azimut_gms": decimal_a_gms_numero(azimut),
        "azimut_texto": decimal_to_gms(azimut),
    }


def _firma_imagen_a_data_uri(src: str) -> str:
    """URL o data URI de firma → data:image/...;base64,... (evita cuelgues en PDF)."""
    if not src:
        return ""
    if str(src).startswith("data:image"):
        return str(src)
    try:
        import httpx

        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            r = client.get(str(src))
            r.raise_for_status()
            ct = (r.headers.get("content-type") or "image/png").split(";")[0].strip()
            if not ct.startswith("image/"):
                ct = "image/png"
            b64 = base64.b64encode(r.content).decode("ascii")
            return f"data:{ct};base64,{b64}"
    except Exception:
        return ""


def _firmas_para_pdf(firmas: List[dict]) -> List[dict]:
    out = []
    for f in firmas or []:
        img = f.get("firma_base64") or ""
        if img.startswith("http://") or img.startswith("https://"):
            img = _firma_imagen_a_data_uri(img)
        out.append({**f, "firma_base64": img})
    return out


def _guardar_firma(modulo: str, referencia_id: str, body: "FirmaBody", uid: int) -> dict:
    row = (
        supabase.table("topo_firmas")
        .insert(
            {
                "modulo": modulo,
                "referencia_id": referencia_id,
                "tipo_firmante": body.tipo_firmante,
                "nombre_firmante": body.nombre_firmante,
                "cargo_firmante": body.cargo_firmante,
                "matricula": body.matricula,
                "firma_base64": body.firma_base64,
            }
        )
        .execute()
        .data
    )
    return row[0] if row else {}


def _firmas_referencia(referencia_id: str) -> List[dict]:
    return (
        supabase.table("topo_firmas")
        .select("*")
        .eq("referencia_id", referencia_id)
        .order("fecha_firma")
        .execute()
        .data
        or []
    )


class PuntoBody(BaseModel):
    nombre: str
    norte: Optional[float] = None
    este: Optional[float] = None
    cota: Optional[float] = None
    tipo: Literal["BM", "estacion", "auxiliar", "PI", "cambio"] = "BM"
    verificado: bool = False


class AmarreBody(BaseModel):
    nombre: str
    norte: float
    este: float
    cota: Optional[float] = None


class AmarresPoligonalUpdateBody(BaseModel):
    """Actualiza coordenadas de estación, visado y llegada (abierta)."""
    estacion: Optional[AmarreBody] = None
    visado: Optional[AmarreBody] = None
    llegada: Optional[AmarreBody] = None


class PoligonalBody(BaseModel):
    nombre: str
    tipo: Literal["abierta", "cerrada"] = "cerrada"
    sentido: Literal["horario", "antihorario"] = "antihorario"
    punto_inicial_id: Optional[str] = None
    punto_final_id: Optional[str] = None
    punto_visado_id: Optional[str] = None
    amarre_inicial: Optional[AmarreBody] = None
    amarre_final: Optional[AmarreBody] = None
    amarre_visado: Optional[AmarreBody] = None
    tolerancia_relativa: int = 3000
    tolerancia_cota_mm_km: float = 12
    precision_angular_seg: float = 10.0
    longitud_max_delta_m: float = 300.0
    metodo: Literal["trigonometrica"] = "trigonometrica"
    observaciones: Optional[str] = None
    operador: Optional[str] = None
    equipo: Optional[str] = None
    equipo_marca: Optional[str] = None
    equipo_referencia: Optional[str] = None
    equipo_serial: Optional[str] = None
    fecha_campo: Optional[date] = None


class EstacionBody(BaseModel):
    orden: Optional[int] = None
    armada_id: Optional[str] = None
    tipo_punto: Literal["estacion", "auxiliar"] = "auxiliar"
    nombre_punto: str
    angulo_gms: float
    distancia: Optional[float] = None  # opcional: en armadas de cierre puede no medirse
    altura_instrumento: Optional[float] = None  # se hereda de la armada si no viene
    angulo_vertical_gms: Optional[float] = None  # opcional: solo para nivelacion trigonométrica
    altura_objetivo: Optional[float] = 0
    lectura_mira: Optional[float] = None


class EstacionEditBody(BaseModel):
    tipo_punto: Optional[Literal["estacion", "auxiliar"]] = None
    nombre_punto: Optional[str] = None
    angulo_gms: Optional[float] = None
    angulo_vertical_gms: Optional[float] = None
    distancia: Optional[float] = None
    altura_objetivo: Optional[float] = None


class ArmadaBody(BaseModel):
    estacion_nombre: str
    visado_nombre: str
    altura_instrumento: Optional[float] = None


class ArmadaUpdateBody(BaseModel):
    estacion_nombre: Optional[str] = None
    visado_nombre: Optional[str] = None
    altura_instrumento: Optional[float] = None


class NivelacionUpdateBody(BaseModel):
    """Actualización parcial de cabecera (operador, equipo, BMs, etc.)."""
    nombre: Optional[str] = None
    tipo_contranivelacion: Optional[Literal["directa", "circuito"]] = None
    tipo_nivel: Optional[Literal["automatico", "electronico"]] = None
    bm_inicial_id: Optional[str] = None
    bm_final_id: Optional[str] = None
    tolerancia_mm_km: Optional[float] = None
    distancia_max_visual_m: Optional[float] = None
    distancia_max_circuito_km: Optional[float] = None
    observaciones: Optional[str] = None
    operador: Optional[str] = None
    equipo: Optional[str] = None
    equipo_marca: Optional[str] = None
    equipo_referencia: Optional[str] = None
    equipo_serial: Optional[str] = None
    fecha_campo: Optional[date] = None


class NivelacionBody(BaseModel):
    nombre: str
    tipo: Literal["abierta", "cerrada"] = "cerrada"
    tipo_contranivelacion: Literal["directa", "circuito"] = "circuito"
    tipo_nivel: Literal["automatico", "electronico"] = "electronico"
    bm_inicial_id: Optional[str] = None
    bm_final_id: Optional[str] = None
    tolerancia_mm_km: float = 1
    distancia_max_visual_m: float = 50
    distancia_max_circuito_km: float = 1
    observaciones: Optional[str] = None
    operador: Optional[str] = None
    equipo: Optional[str] = None
    equipo_marca: Optional[str] = None
    equipo_referencia: Optional[str] = None
    equipo_serial: Optional[str] = None
    fecha_campo: Optional[date] = None


class LecturaNivelBody(BaseModel):
    orden: int
    nombre_punto: str
    tipo_punto: Literal["BM", "TP", "cambio", "estacion", "auxiliar", ""] = ""
    tipo_lectura: Literal["V+", "V-", "Vi"]
    abscisa: Optional[str] = None
    descripcion_punto: Optional[str] = None
    ubicacion: Optional[str] = None
    punto_biblioteca_id: Optional[str] = None
    hilo_superior: Optional[float] = None
    hilo_medio: Optional[float] = None
    hilo_inferior: Optional[float] = None
    lectura: Optional[float] = None
    distancia_m: Optional[float] = None
    lectura_atras: Optional[float] = None
    lectura_adelante: Optional[float] = None
    distancia_atras: Optional[float] = None
    distancia_adelante: Optional[float] = None


class LecturasNivelSyncBody(BaseModel):
    lecturas: List[LecturaNivelBody]
    tipo_nivel: Optional[Literal["automatico", "electronico"]] = None


class AreaBody(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    puntos: List[dict]
    operador: Optional[str] = None
    fecha: Optional[date] = None


class NewPointBody(BaseModel):
    poligonal_id: str
    nombre_punto_nuevo: str
    descripcion: Optional[str] = None
    punto1_id: str
    distancia1: float
    angulo_observado_gms: float
    punto2_id: str
    distancia2: float
    tolerancia_lineal: float = 0.05
    tolerancia_angular_seg: float = 30
    tipo_punto: Literal["auxiliar", "estacion", "BM", "PI", "cambio"] = "auxiliar"
    operador: Optional[str] = None
    fecha: Optional[date] = None
    equipo_marca: Optional[str] = None
    equipo_referencia: Optional[str] = None
    equipo_serial: Optional[str] = None


class NewPointElegirBody(BaseModel):
    opcion: Literal["A", "B"]


class EquipoBody(BaseModel):
    nombre: str
    tipo: Literal["nivel", "estacion_total", "gps", "otro"]
    marca: Optional[str] = None
    modelo: Optional[str] = None
    serie: Optional[str] = None
    propietario: Optional[str] = None
    activo: bool = True


class VerificacionEquipoBody(BaseModel):
    fecha: date
    tipo_verificacion: Literal["nivel", "estacion_total"]
    operador: Optional[str] = None
    condiciones: Optional[str] = None
    resultados: dict
    observaciones: Optional[str] = None
    proxima_verificacion: Optional[date] = None
    tolerancia_mm: float = 2.0
    tolerancia_seg: float = 30.0


class ViaProyectoBody(BaseModel):
    nombre: str
    abscisa_inicio: Optional[float] = None
    abscisa_fin: Optional[float] = None
    ancho_calzada: Optional[float] = None
    capas: Optional[dict] = None
    cota_subrasante: Optional[dict] = None


class ViaRegistroBody(BaseModel):
    proyecto_id: str
    capa_recibir: Optional[str] = None
    calzada: Optional[str] = None
    bm_referencia_id: Optional[str] = None
    fecha_campo: Optional[date] = None
    operador: Optional[str] = None
    area_intervencion: Optional[dict] = None


class ViaLecturaBody(BaseModel):
    orden: int
    abscisa: float
    punto_tomado: Optional[str] = None
    altura_instrumento: Optional[float] = None
    lectura_mira: Optional[float] = None
    cota_diseno: Optional[float] = None
    tolerancia_m: float = 0.02


class DisenoEjeBody(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)


class DisenoCapaItem(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=80)
    espesor_m: float = Field(..., gt=0)
    referencia_analisis_orden: Optional[int] = Field(None, ge=0)
    sobre_ancho_m: Optional[float] = Field(0, ge=0)


class DisenoEstructuraBody(BaseModel):
    nombre: Optional[str] = None
    capas: List[DisenoCapaItem]


class DisenoImportConfig(BaseModel):
    tipo_seccion: Literal["A", "B", "C"] = "A"
    ancho_via_m: float = Field(..., gt=0)
    calcular_intermedias: bool = False
    paso_intermedias_m: Optional[float] = Field(None, gt=0)
    interpolar_abscisas: bool = False
    paso_abscisas_m: Optional[float] = Field(None, gt=0)


class DisenoImportCsvBody(BaseModel):
    contenido: str
    reemplazar: bool = True
    config: DisenoImportConfig


class DisenoImportFilasBody(BaseModel):
    filas: List[dict]
    reemplazar: bool = True
    config: DisenoImportConfig


class EntregaDgBody(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=120)
    eje_id: str
    indice_capa: int = Field(..., ge=0)
    abscisa_desde: Optional[float] = None
    abscisa_hasta: Optional[float] = None
    bm_referencia_id: Optional[str] = None
    fecha_campo: Optional[date] = None
    operador: Optional[str] = None
    tolerancia_m: float = Field(0.010, gt=0)
    notas: Optional[str] = None


class EntregaDgReordenBody(BaseModel):
    ids: List[str] = Field(..., min_length=1)


class EntregaDgBloqueBody(BaseModel):
    abscisa_inicio: Optional[float] = None
    punto_biblioteca_id: Optional[str] = None
    nombre_punto: Optional[str] = None
    v_mas: Optional[float] = None
    altura_instrumento: Optional[float] = None
    cota_punto: Optional[float] = None


class EntregaDgFilaVi(BaseModel):
    ordenada: float
    vi: Optional[float] = None


class EntregaDgFilaBody(BaseModel):
    abscisa: float
    bloque_id: Optional[str] = None
    lecturas: List[EntregaDgFilaVi] = Field(default_factory=list)
    vi_izq: Optional[float] = None
    vi_eje: Optional[float] = None
    vi_der: Optional[float] = None


class EntregaDgBloquePatch(BaseModel):
    id: str
    punto_biblioteca_id: Optional[str] = None
    v_mas: Optional[float] = None
    altura_instrumento: Optional[float] = None
    cota_punto: Optional[float] = None


class EntregaDgCarteraBody(BaseModel):
    filas: List[EntregaDgFilaBody] = Field(default_factory=list)
    bloques: List[EntregaDgBloquePatch] = Field(default_factory=list)


class EntregaDgLecturaBody(BaseModel):
    orden: int
    abscisa: float
    ordenada: float
    bloque_id: Optional[str] = None
    altura_instrumento: Optional[float] = None
    lectura_mira: Optional[float] = None
    cota_diseno: Optional[float] = None
    espesor_real_m: Optional[float] = None
    notas: Optional[str] = None


class TuberiaBody(BaseModel):
    nombre: str
    diametro_nominal: Optional[str] = None
    material: Optional[str] = None
    cota_diseno_inicio: Optional[float] = None
    cota_diseno_fin: Optional[float] = None
    longitud_total: Optional[float] = None
    pendiente_diseno: Optional[float] = None
    factor_atraque: Optional[float] = None
    ancho_excavacion: Optional[float] = None
    numero_tubos: Optional[int] = None
    tolerancia_cm: float = 2.0
    fecha_inicio: Optional[date] = None


class TuberiaRegistroBody(BaseModel):
    fecha: date
    bm_referencia_id: Optional[str] = None
    altura_instrumento: Optional[float] = None
    operador: Optional[str] = None


class TuberiaTuboBody(BaseModel):
    numero_tubo: int
    abscisa_inicio: float
    abscisa_fin: float
    cota_diseno_inicio: Optional[float] = None
    cota_diseno_fin: Optional[float] = None
    lectura_mira_inicio: Optional[float] = None
    lectura_mira_fin: Optional[float] = None


class FirmaBody(BaseModel):
    tipo_firmante: str = "topografo"
    nombre_firmante: str
    cargo_firmante: Optional[str] = None
    matricula: Optional[str] = None
    firma_base64: str


# ── BIBLIOTECA DE PUNTOS ──────────────────────────────────────────────────────

def _origen_operador_fecha(modulo: str | None, circuito_id: str | None, contrato_id: int, nombre: str) -> tuple[str | None, str | None]:
    """Operador y fecha de campo del circuito que publicó el punto."""
    if not modulo:
        return None, None
    if modulo == "nivelacion" and circuito_id:
        row = _row("topo_nivelaciones", id=circuito_id, contrato_id=contrato_id)
        if row:
            return row.get("operador"), row.get("fecha_campo")
    elif modulo == "poligonal" and circuito_id:
        row = _row("topo_poligonales", id=circuito_id, contrato_id=contrato_id)
        if row:
            return row.get("operador"), row.get("fecha_campo")
    elif modulo == "newpoint":
        rows = (
            supabase.table("topo_newpoints")
            .select("operador,fecha")
            .eq("contrato_id", contrato_id)
            .eq("nombre_punto_nuevo", nombre)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            return rows[0].get("operador"), rows[0].get("fecha")
    return None, None


def _enriquecer_puntos_biblioteca(puntos: list[dict], contrato_id: int) -> list[dict]:
    """Completa operador y fecha_campo desde el circuito origen si faltan en topo_puntos."""
    out: list[dict] = []
    for p in puntos:
        row = dict(p)
        if not row.get("operador") or not row.get("fecha_campo"):
            op, fc = _origen_operador_fecha(
                row.get("modulo_origen"),
                row.get("circuito_id"),
                contrato_id,
                (row.get("nombre") or "").strip(),
            )
            if not row.get("operador") and op:
                row["operador"] = op
            if not row.get("fecha_campo") and fc:
                row["fecha_campo"] = fc
        out.append(row)
    return out


@router.get("/{contrato_id}/puntos")
def listar_puntos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    puntos = (
        supabase.table("topo_puntos")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("nombre")
        .execute()
        .data
        or []
    )
    return _enriquecer_puntos_biblioteca(puntos, contrato_id)


@router.get("/{contrato_id}/puntos/verificados")
def listar_puntos_verificados(
    contrato_id: int,
    modulo_origen: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    q = (
        supabase.table("topo_puntos")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("verificado", True)
    )
    if modulo_origen:
        q = q.eq("modulo_origen", modulo_origen)
    puntos = q.order("nombre").execute().data or []
    return _enriquecer_puntos_biblioteca(puntos, contrato_id)


@router.get("/{contrato_id}/operadores")
def listar_operadores(contrato_id: int, current_user=Depends(get_current_user)):
    """Usuarios activos del contrato cuyo cargo esta relacionado con topografia.

    Coincide por nombre de cargo: 'topograf...' (Topografo, Coordinador de Topografia,
    Auxiliar de Topografia) o 'cadenero'.
    """
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    cargos = {
        c["id"]: (c.get("nombre") or "")
        for c in (supabase.table("cargos").select("id, nombre").execute().data or [])
    }

    def es_topo(cargo_id) -> bool:
        n = (cargos.get(cargo_id) or "").lower()
        return "topograf" in n or "cadenero" in n or "desarrollador" in n

    by_id: Dict[Any, dict] = {}
    directos = (
        supabase.table("usuarios")
        .select("id, nombre, apellidos, cargo_id")
        .eq("activo", True)
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    for r in directos:
        by_id[r["id"]] = r

    vinculos = (
        supabase.table("usuario_contratos")
        .select("usuario_id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    extra_ids = list({v["usuario_id"] for v in vinculos if v.get("usuario_id") is not None} - set(by_id.keys()))
    for i in range(0, len(extra_ids), 120):
        part = extra_ids[i : i + 120]
        if not part:
            continue
        extra = (
            supabase.table("usuarios")
            .select("id, nombre, apellidos, cargo_id")
            .eq("activo", True)
            .in_("id", part)
            .execute()
            .data
            or []
        )
        for r in extra:
            by_id[r["id"]] = r

    out = []
    for r in by_id.values():
        if not es_topo(r.get("cargo_id")):
            continue
        nombre = f"{r.get('nombre', '') or ''} {r.get('apellidos', '') or ''}".strip()
        out.append({"id": r["id"], "nombre": nombre, "cargo": cargos.get(r.get("cargo_id"), "")})
    out.sort(key=lambda x: (x.get("nombre") or "").lower())
    return out


@router.post("/{contrato_id}/puntos")
def crear_punto(contrato_id: int, body: PuntoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if body.verificado and not body.norte and body.tipo != "BM":
        raise HTTPException(status_code=422, detail="Solo BM iniciales pueden crearse verificados manualmente")
    row = (
        supabase.table("topo_puntos")
        .insert(
            {
                "contrato_id": contrato_id,
                "nombre": body.nombre.strip(),
                "norte": body.norte,
                "este": body.este,
                "cota": body.cota,
                "tipo": body.tipo,
                "verificado": body.verificado,
                "fecha_verificacion": datetime.now(timezone.utc).isoformat() if body.verificado else None,
            }
        )
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=500, detail="No se pudo crear el punto")
    return row[0]


@router.put("/{contrato_id}/puntos/{punto_id}")
def actualizar_punto(contrato_id: int, punto_id: str, body: PuntoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    existing = _row("topo_puntos", id=punto_id, contrato_id=contrato_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    if existing.get("verificado") and existing.get("circuito_id"):
        raise HTTPException(status_code=403, detail="Punto verificado por circuito; no editable")
    row = (
        supabase.table("topo_puntos")
        .update(
            {
                "nombre": body.nombre.strip(),
                "norte": body.norte,
                "este": body.este,
                "cota": body.cota,
                "tipo": body.tipo,
            }
        )
        .eq("id", punto_id)
        .eq("contrato_id", contrato_id)
        .execute()
        .data
    )
    return row[0] if row else existing


@router.delete("/{contrato_id}/puntos/{punto_id}")
def eliminar_punto(contrato_id: int, punto_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    existing = _row("topo_puntos", id=punto_id, contrato_id=contrato_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    if existing.get("verificado") and existing.get("circuito_id"):
        raise HTTPException(status_code=403, detail="Punto verificado por circuito; no eliminable")
    supabase.table("topo_puntos").delete().eq("id", punto_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


# ── POLIGONAL ─────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/poligonales")
def listar_poligonales(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return [
        _enriquecer_poligonal_vista(p)
        for p in (
            supabase.table("topo_poligonales")
            .select("*")
            .eq("contrato_id", contrato_id)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
    ]


@router.get("/{contrato_id}/poligonales/selladas")
def listar_poligonales_selladas(contrato_id: int, current_user=Depends(get_current_user)):
    """Poligonales selladas (interventoría aprobada) — referencia para NewPoint."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    rows = (
        supabase.table("topo_poligonales")
        .select("id, nombre, tipo, biblioteca_at, nivel2_estado, created_at")
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_enriquecer_poligonal_vista(p) for p in rows if _poligonal_sellada(p)]


@router.get("/{contrato_id}/poligonales/{poligonal_id}/puntos-biblioteca")
def listar_puntos_biblioteca_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    """Puntos verificados de biblioteca que pertenecen a la poligonal sellada indicada."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _exigir_poligonal_sellada_para_newpoint(pol)
    return (
        supabase.table("topo_puntos")
        .select("id, nombre, norte, este, cota, tipo, verificado, modulo_origen, circuito_id")
        .eq("contrato_id", contrato_id)
        .eq("verificado", True)
        .eq("modulo_origen", "poligonal")
        .eq("circuito_id", poligonal_id)
        .order("nombre")
        .execute()
        .data
        or []
    )


@router.post("/{contrato_id}/poligonales")
def crear_poligonal(contrato_id: int, body: PoligonalBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    payload = body.model_dump(mode="json", exclude={"amarre_inicial", "amarre_final", "amarre_visado"})
    for field in ("punto_inicial_id", "punto_final_id", "punto_visado_id"):
        payload[field] = _sanitize_uuid_optional(payload.get(field))
    if not (payload.get("nombre") or "").strip():
        raise HTTPException(status_code=422, detail="Indique un nombre para la poligonal.")
    _resolver_amarres_poligonal(contrato_id, body, payload)
    row = (
        supabase.table("topo_poligonales")
        .insert({**payload, "contrato_id": contrato_id})
        .execute()
        .data
    )
    if not row:
        return {}
    pol = row[0]
    # Armada 1 automatica: estacion = amarre inicial, visado = punto de visado
    est_nombre = None
    vis_nombre = None
    if pol.get("punto_inicial_id"):
        pi = _row("topo_puntos", id=pol["punto_inicial_id"])
        est_nombre = pi.get("nombre") if pi else None
    if pol.get("punto_visado_id"):
        pv = _row("topo_puntos", id=pol["punto_visado_id"])
        vis_nombre = pv.get("nombre") if pv else None
    supabase.table("topo_poligonal_armadas").insert(
        {
            "poligonal_id": pol["id"],
            "orden": 1,
            "estacion_nombre": est_nombre,
            "visado_nombre": vis_nombre,
            "altura_instrumento": None,
        }
    ).execute()
    return pol


@router.get("/{contrato_id}/poligonales/{poligonal_id}")
def obtener_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    estaciones = (
        supabase.table("topo_poligonal_estaciones")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    punto_inicial = _row("topo_puntos", id=pol.get("punto_inicial_id")) if pol.get("punto_inicial_id") else None
    punto_final = _row("topo_puntos", id=pol.get("punto_final_id")) if pol.get("punto_final_id") else None
    punto_visado = _row("topo_puntos", id=pol.get("punto_visado_id")) if pol.get("punto_visado_id") else None

    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    amarres = {}
    for p in (punto_inicial, punto_visado):
        if p and p.get("nombre"):
            amarres[p["nombre"]] = {"norte": p.get("norte"), "este": p.get("este"), "cota": p.get("cota")}
    armadas_enr, known, estaciones_flat = radiar_armadas(armadas, estaciones, amarres)

    # Puntos disponibles para el selector de cambio de armada
    estacion_names = set()
    if punto_inicial and punto_inicial.get("nombre"):
        estacion_names.add(punto_inicial["nombre"])
    for e in estaciones:
        if (e.get("tipo_punto") or "auxiliar") == "estacion" and e.get("nombre_punto"):
            estacion_names.add(e["nombre_punto"])
    puntos_estacion_disponibles = [
        {"nombre": nom, **known[nom]} for nom in known if nom in estacion_names
    ]
    puntos_visado_disponibles = [{"nombre": nom, **coords} for nom, coords in known.items()]

    cierre = calcular_cierre_poligonal(
        armadas_enr,
        punto_inicial,
        sentido=pol.get("sentido") or "antihorario",
        tol_relativa=pol.get("tolerancia_relativa") or 25000,
        tol_cota_mm_km=pol.get("tolerancia_cota_mm_km") or 12,
        precision_angular_seg=pol.get("precision_angular_seg") or 10.0,
        longitud_max_delta_m=pol.get("longitud_max_delta_m"),
        punto_final=punto_final,
        tipo_pol=pol.get("tipo") or "cerrada",
    )

    estaciones_vista = fusionar_estaciones_vista(estaciones, estaciones_flat)

    return {
        "poligonal": _enriquecer_poligonal_vista(pol),
        "estaciones": estaciones_vista,
        "estaciones_radiadas": estaciones_flat,
        "armadas": armadas_enr,
        "punto_inicial": punto_inicial,
        "punto_final": punto_final,
        "punto_visado": punto_visado,
        "base": _calcular_base_visado(punto_inicial, punto_visado),
        "puntos_estacion_disponibles": puntos_estacion_disponibles,
        "puntos_visado_disponibles": puntos_visado_disponibles,
        "cierre": cierre,
    }


@router.put("/{contrato_id}/poligonales/{poligonal_id}")
def actualizar_poligonal(contrato_id: int, poligonal_id: str, body: PoligonalBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_poligonal_libreta_editable(pol)
    row = (
        supabase.table("topo_poligonales")
        .update(_dump_model(
            body,
            ("punto_inicial_id", "punto_final_id", "punto_visado_id"),
            exclude={"amarre_inicial", "amarre_final", "amarre_visado"},
        ))
        .eq("id", poligonal_id)
        .execute()
        .data
    )
    return row[0] if row else pol


@router.put("/{contrato_id}/poligonales/{poligonal_id}/amarres")
def actualizar_amarres_poligonal(
    contrato_id: int,
    poligonal_id: str,
    body: AmarresPoligonalUpdateBody,
    current_user=Depends(get_current_user),
):
    """Actualiza coordenadas de estación/visado de amarre y recalcula la vista en libreta."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_poligonal_editable(pol)
    if not body.estacion and not body.visado and not body.llegada:
        raise HTTPException(status_code=422, detail="Indique al menos estacion, visado o llegada a actualizar.")

    cambio = False
    if body.estacion:
        _actualizar_punto_amarre_poligonal(contrato_id, pol, poligonal_id, "estacion", body.estacion)
        cambio = True
    if body.visado:
        _actualizar_punto_amarre_poligonal(contrato_id, pol, poligonal_id, "visado", body.visado)
        cambio = True
    if body.llegada:
        if (pol.get("tipo") or "cerrada") != "abierta":
            raise HTTPException(status_code=422, detail="Llegada solo aplica a poligonales abiertas.")
        _actualizar_punto_amarre_poligonal(contrato_id, pol, poligonal_id, "llegada", body.llegada)
        cambio = True

    if cambio:
        _limpiar_ajuste_poligonal(poligonal_id)

    return obtener_poligonal(contrato_id, poligonal_id, current_user)


@router.delete("/{contrato_id}/poligonales/{poligonal_id}")
def eliminar_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    # estaciones y armadas se eliminan en cascada (FK ON DELETE CASCADE).
    # Los puntos de biblioteca generados por el circuito se conservan; solo se
    # desvincula la referencia al circuito eliminado.
    supabase.table("topo_puntos").update({"circuito_id": None}).eq("circuito_id", poligonal_id).execute()
    supabase.table("topo_poligonales").delete().eq("id", poligonal_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/estaciones")
def agregar_estacion(contrato_id: int, poligonal_id: str, body: EstacionBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_poligonal_libreta_editable(pol)
    if not (body.nombre_punto or "").strip():
        raise HTTPException(status_code=422, detail="Indique el nombre del punto observado.")
    if body.distancia is not None and body.distancia < 0:
        raise HTTPException(status_code=422, detail="La distancia no puede ser negativa.")
    # Armada destino: la indicada o la ultima de la poligonal
    armada = None
    if body.armada_id:
        armada = _row("topo_poligonal_armadas", id=body.armada_id, poligonal_id=poligonal_id)
    if not armada:
        ultimas = (
            supabase.table("topo_poligonal_armadas")
            .select("*")
            .eq("poligonal_id", poligonal_id)
            .order("orden", desc=True)
            .limit(1)
            .execute()
            .data
        )
        armada = ultimas[0] if ultimas else None
    if not armada:
        raise HTTPException(status_code=422, detail="No hay armada activa. Defina la armada (estacion y visado) antes de radiar puntos.")
    # HI: el de la armada (o el enviado para inicializarlo)
    hi = armada.get("altura_instrumento")
    if hi is None:
        hi = body.altura_instrumento
        if hi is not None:
            supabase.table("topo_poligonal_armadas").update({"altura_instrumento": hi}).eq("id", armada["id"]).execute()
    ultima = (
        supabase.table("topo_poligonal_estaciones")
        .select("orden")
        .eq("poligonal_id", poligonal_id)
        .order("orden", desc=True)
        .limit(1)
        .execute()
        .data
    )
    next_orden = (ultima[0]["orden"] + 1) if ultima else 1
    row = (
        supabase.table("topo_poligonal_estaciones")
        .insert(
            {
                "poligonal_id": poligonal_id,
                "armada_id": armada["id"],
                "tipo_punto": body.tipo_punto,
                "orden": next_orden,
                "nombre_punto": body.nombre_punto.strip(),
                "angulo_medido": gms_to_decimal(body.angulo_gms),
                "distancia": body.distancia,
                "altura_instrumento": hi,
                "angulo_vertical": gms_to_decimal(body.angulo_vertical_gms) if body.angulo_vertical_gms is not None else None,
                "altura_objetivo": body.altura_objetivo or 0,
                "lectura_mira": body.lectura_mira,
            }
        )
        .execute()
        .data
    )
    return row[0] if row else {}


@router.put("/{contrato_id}/poligonales/{poligonal_id}/estaciones/{estacion_id}")
def editar_estacion(contrato_id: int, poligonal_id: str, estacion_id: str, body: EstacionEditBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_poligonal_libreta_editable(pol)
    est = _row("topo_poligonal_estaciones", id=estacion_id, poligonal_id=poligonal_id)
    if not est:
        raise HTTPException(status_code=404, detail="Punto no encontrado")
    # exclude_unset permite distinguir "no enviado" de "enviado vacio" (limpiar a null).
    enviados = body.model_dump(exclude_unset=True)
    cambios = {}
    if "tipo_punto" in enviados and enviados["tipo_punto"]:
        cambios["tipo_punto"] = enviados["tipo_punto"]
    if "nombre_punto" in enviados:
        if not (enviados["nombre_punto"] or "").strip():
            raise HTTPException(status_code=422, detail="El nombre del punto no puede quedar vacio.")
        cambios["nombre_punto"] = enviados["nombre_punto"].strip()
    if "angulo_gms" in enviados:
        ag = enviados["angulo_gms"]
        cambios["angulo_medido"] = gms_to_decimal(ag) if ag is not None else None
    # Angulo vertical y distancia se pueden limpiar (set a null) en armadas de cierre.
    if "angulo_vertical_gms" in enviados:
        av = enviados["angulo_vertical_gms"]
        cambios["angulo_vertical"] = gms_to_decimal(av) if av is not None else None
    if "angulo_gms" in enviados or "distancia" in enviados:
        cambios["azimut"] = None
        cambios["norte"] = None
        cambios["este"] = None
        cambios["cota"] = None
    if "distancia" in enviados:
        dist = enviados["distancia"]
        if dist is not None and dist < 0:
            raise HTTPException(status_code=422, detail="La distancia no puede ser negativa.")
        cambios["distancia"] = dist
    if "altura_objetivo" in enviados and enviados["altura_objetivo"] is not None:
        cambios["altura_objetivo"] = enviados["altura_objetivo"]
    if not cambios:
        return est
    row = (
        supabase.table("topo_poligonal_estaciones")
        .update(cambios)
        .eq("id", estacion_id)
        .eq("poligonal_id", poligonal_id)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(
            status_code=500,
            detail="No se pudo actualizar el punto (verifique permisos o que la poligonal siga editable).",
        )
    return row[0]


@router.get("/{contrato_id}/poligonales/{poligonal_id}/armadas")
def listar_armadas(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return (
        supabase.table("topo_poligonal_armadas")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )


@router.post("/{contrato_id}/poligonales/{poligonal_id}/armadas")
def crear_armada(contrato_id: int, poligonal_id: str, body: ArmadaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_poligonal_libreta_editable(pol)
    if not (body.estacion_nombre or "").strip() or not (body.visado_nombre or "").strip():
        raise HTTPException(status_code=422, detail="Indique la estacion y el visado de la nueva armada.")
    ultimas = (
        supabase.table("topo_poligonal_armadas")
        .select("orden")
        .eq("poligonal_id", poligonal_id)
        .order("orden", desc=True)
        .limit(1)
        .execute()
        .data
    )
    next_orden = (ultimas[0]["orden"] + 1) if ultimas else 1
    row = (
        supabase.table("topo_poligonal_armadas")
        .insert(
            {
                "poligonal_id": poligonal_id,
                "orden": next_orden,
                "estacion_nombre": body.estacion_nombre.strip(),
                "visado_nombre": body.visado_nombre.strip(),
                "altura_instrumento": body.altura_instrumento,
            }
        )
        .execute()
        .data
    )
    return row[0] if row else {}


@router.put("/{contrato_id}/poligonales/{poligonal_id}/armadas/{armada_id}")
def actualizar_armada(contrato_id: int, poligonal_id: str, armada_id: str, body: ArmadaUpdateBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_poligonal_libreta_editable(pol)
    cambios = {k: v for k, v in body.model_dump().items() if v is not None}
    if not cambios:
        return _row("topo_poligonal_armadas", id=armada_id, poligonal_id=poligonal_id) or {}
    # Si cambia el HI de la armada, propagarlo a sus puntos radiados
    if "altura_instrumento" in cambios:
        supabase.table("topo_poligonal_estaciones").update(
            {"altura_instrumento": cambios["altura_instrumento"]}
        ).eq("armada_id", armada_id).execute()
    row = (
        supabase.table("topo_poligonal_armadas")
        .update(cambios)
        .eq("id", armada_id)
        .eq("poligonal_id", poligonal_id)
        .execute()
        .data
    )
    return row[0] if row else {}


@router.delete("/{contrato_id}/poligonales/{poligonal_id}/armadas/{armada_id}")
def eliminar_armada(contrato_id: int, poligonal_id: str, armada_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_poligonal_libreta_editable(pol)
    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("id, orden")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    if len(armadas) <= 1:
        raise HTTPException(status_code=422, detail="No se puede eliminar la armada inicial.")
    supabase.table("topo_poligonal_armadas").delete().eq("id", armada_id).eq("poligonal_id", poligonal_id).execute()
    return {"ok": True}


class SentidoBody(BaseModel):
    sentido: Literal["horario", "antihorario"]


@router.post("/{contrato_id}/poligonales/{poligonal_id}/sentido")
def set_sentido_poligonal(contrato_id: int, poligonal_id: str, body: SentidoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_poligonal_libreta_editable(pol)
    row = (
        supabase.table("topo_poligonales")
        .update({"sentido": body.sentido})
        .eq("id", poligonal_id)
        .execute()
        .data
    )
    return row[0] if row else pol


@router.delete("/{contrato_id}/poligonales/{poligonal_id}/estaciones/{estacion_id}")
def eliminar_estacion(contrato_id: int, poligonal_id: str, estacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    _assert_poligonal_libreta_editable(pol)
    supabase.table("topo_poligonal_estaciones").delete().eq("id", estacion_id).eq("poligonal_id", poligonal_id).execute()
    # Reordena los puntos restantes para mantener la secuencia 1..n
    restantes = (
        supabase.table("topo_poligonal_estaciones")
        .select("id")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    for idx, est in enumerate(restantes, start=1):
        supabase.table("topo_poligonal_estaciones").update({"orden": idx}).eq("id", est["id"]).execute()
    return {"ok": True}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/calcular")
def calcular_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    """Corregir y ajustar: distribuye error angular y aplica Bowditch (azimuts por armadas)."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    if _poligonal_sellada(pol):
        raise HTTPException(status_code=403, detail="Poligonal sellada tras validación de interventoría.")

    estaciones = (
        supabase.table("topo_poligonal_estaciones")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    armadas = (
        supabase.table("topo_poligonal_armadas")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    punto_inicial = _row("topo_puntos", id=pol.get("punto_inicial_id")) if pol.get("punto_inicial_id") else None
    punto_final = _row("topo_puntos", id=pol.get("punto_final_id")) if pol.get("punto_final_id") else None
    amarres = {}
    for p in (
        punto_inicial,
        _row("topo_puntos", id=pol.get("punto_visado_id")) if pol.get("punto_visado_id") else None,
    ):
        if p and p.get("nombre"):
            amarres[p["nombre"]] = {"norte": p.get("norte"), "este": p.get("este"), "cota": p.get("cota")}

    resultado = ajustar_poligonal_armadas(pol, armadas, estaciones, amarres, punto_inicial, punto_final)
    resumen = resultado["resumen"]
    cierre = resultado["cierre"]

    for upd in resultado["updates"]:
        eid = upd.pop("id")
        supabase.table("topo_poligonal_estaciones").update(upd).eq("id", eid).execute()

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("topo_poligonales").update(
        {
            "error_cierre_dn": resumen["error_dn"],
            "error_cierre_de": resumen["error_de"],
            "error_cierre_dz": resumen["error_dz"],
            "error_lineal": resumen["error_lineal"],
            "precision_relativa": resumen["precision"],
            "suma_angular_obs": cierre.get("suma_observada"),
            "suma_angular_teorica": cierre.get("suma_teorica"),
            "error_angular_seg": cierre.get("error_angular_seg"),
            "num_vertices": cierre.get("num_vertices"),
            "ajustada_at": now,
        }
    ).eq("id", poligonal_id).execute()

    return {"ok": True, "ajustada_at": now, "resumen": resumen, "cierre": cierre}


@router.post("/{contrato_id}/poligonales/{poligonal_id}/cerrar")
def cerrar_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    """Termina la poligonal (libreta cerrada). La biblioteca se publica tras validación interventoría."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    if _poligonal_sellada(pol):
        raise HTTPException(status_code=403, detail="Poligonal sellada tras validación de interventoría.")
    if (pol.get("estado") or "") == "cerrado":
        raise HTTPException(status_code=422, detail="La poligonal ya está terminada.")

    cierre = _cierre_poligonal_vivo(pol, poligonal_id)
    if not cierre.get("cerrado"):
        if (pol.get("tipo") or "cerrada") == "abierta":
            dest = (_row("topo_puntos", id=pol.get("punto_final_id")) or {}).get("nombre") or "llegada"
            raise HTTPException(
                status_code=422,
                detail=f"La poligonal abierta aun no cierra: falta radiar el punto de llegada «{dest}» como estacion.",
            )
        raise HTTPException(
            status_code=422,
            detail="La poligonal aun no cierra: falta la observacion que regresa al punto inicial.",
        )
    if not cierre.get("admisible_lineal"):
        prec = cierre.get("precision")
        raise HTTPException(
            status_code=422,
            detail=f"El cierre lineal es inadmisible (precision 1:{int(prec) if prec else 0}, tolerancia 1:{int(cierre.get('tolerancia_relativa') or 0)}). Revise angulos y distancias antes de terminar.",
        )

    supabase.table("topo_poligonales").update({"estado": "cerrado"}).eq("id", poligonal_id).execute()
    return {"ok": True, "cierre": cierre, "mensaje": "Poligonal terminada. Pendiente validación contratista e interventoría."}


@router.put("/{contrato_id}/poligonales/{poligonal_id}/validar-nivel1")
def validar_poligonal_nivel1(
    contrato_id: int,
    poligonal_id: str,
    body: ValidarPoligonalBody,
    current_user=Depends(get_current_user),
):
    """Validación contratista (topógrafo / operativo contratista)."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    return _aplicar_validacion_poligonal(contrato_id, poligonal_id, pol, 1, body, current_user)


@router.put("/{contrato_id}/poligonales/{poligonal_id}/validar-nivel2")
def validar_poligonal_nivel2(
    contrato_id: int,
    poligonal_id: str,
    body: ValidarPoligonalBody,
    current_user=Depends(get_current_user),
):
    """Validación interventoría. Al aprobar, publica coordenadas ajustadas en la biblioteca."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    return _aplicar_validacion_poligonal(contrato_id, poligonal_id, pol, 2, body, current_user)


@router.get("/{contrato_id}/poligonales/{poligonal_id}/comentarios")
def listar_comentarios_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    if not _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    return (
        supabase.table("topo_poligonal_comentarios")
        .select("*")
        .eq("poligonal_id", poligonal_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


@router.post("/{contrato_id}/poligonales/{poligonal_id}/validar")
def validar_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    """Compatibilidad: incrementa nivel según el lado del usuario (preferir validar-nivel1/2)."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    pol = _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    lado = lado_validacion_topo_usuario(current_user)
    nivel = 2 if lado == 2 else 1
    body = ValidarPoligonalBody(estado="Aprobado")
    return _aplicar_validacion_poligonal(contrato_id, poligonal_id, pol, nivel, body, current_user)


@router.post("/{contrato_id}/poligonales/{poligonal_id}/firma")
def firma_poligonal(contrato_id: int, poligonal_id: str, body: FirmaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    return _guardar_firma("poligonal", poligonal_id, body, _uid(current_user))


@router.post("/{contrato_id}/poligonales/{poligonal_id}/firma-perfil")
def firma_poligonal_desde_perfil(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    """Registra la firma digital del usuario (imagen en perfil) en la poligonal."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_poligonales", id=poligonal_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Poligonal no encontrada")
    uid = _uid(current_user)
    u = _row("usuarios", select="id, nombre, cargo_id, firma_imagen_url", id=uid)
    if not u or not u.get("firma_imagen_url"):
        raise HTTPException(
            status_code=422,
            detail="No tiene imagen de firma en su perfil. Suba la firma en Configuración de usuario.",
        )
    cargo_firmante = None
    if u.get("cargo_id"):
        c = _row("cargos", select="nombre", id=u["cargo_id"])
        cargo_firmante = (c or {}).get("nombre")
    firma_src = _firma_imagen_a_data_uri(u["firma_imagen_url"])
    body = FirmaBody(
        tipo_firmante="topografo",
        nombre_firmante=u.get("nombre") or "Topógrafo",
        cargo_firmante=cargo_firmante,
        firma_base64=firma_src,
    )
    return _guardar_firma("poligonal", poligonal_id, body, uid)


@router.get("/{contrato_id}/poligonales/{poligonal_id}/pdf")
def pdf_poligonal(contrato_id: int, poligonal_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    try:
        data = obtener_poligonal(contrato_id, poligonal_id, current_user)
        contrato = _require_contrato_row(contrato_id)
        pol = data["poligonal"]
        estaciones = data["estaciones"]
        cierre = data.get("cierre")
        firmas = _firmas_para_pdf(_firmas_referencia(poligonal_id))
        html_doc = html_documento_poligonal_pdf(
            contrato,
            pol,
            estaciones,
            cierre,
            firmas,
            data.get("punto_inicial"),
            data.get("punto_final"),
        )
        pdf = to_pdf_bytes(html_doc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {exc}") from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="poligonal_{poligonal_id[:8]}.pdf"'},
    )


# ── NIVELACION ────────────────────────────────────────────────────────────────

def _nivelacion_sellada(niv: dict) -> bool:
    return (niv.get("nivel2_estado") or "No Revisado") == "Aprobado" or bool(niv.get("biblioteca_at"))


def _assert_nivelacion_editable(niv: dict) -> None:
    if _nivelacion_sellada(niv):
        raise HTTPException(status_code=403, detail="Nivelación sellada tras validación de interventoría.")
    if int(niv.get("nivel_validacion") or 0) >= NIVEL_MAX:
        raise HTTPException(status_code=403, detail="Registro sellado; no editable")


def _resolver_bms_nivelacion(niv: dict, contrato_id: int) -> tuple[dict[str, float], str | None, str | None]:
    cotas: dict[str, float] = {}
    bm_ini: str | None = None
    bm_fin: str | None = None
    for field_id, assign in (("bm_inicial_id", "ini"), ("bm_final_id", "fin")):
        pid = niv.get(field_id)
        if not pid:
            continue
        p = _row("topo_puntos", id=pid, contrato_id=contrato_id)
        if not p:
            continue
        nombre = (p.get("nombre") or "").strip()
        if assign == "ini":
            bm_ini = nombre
        else:
            bm_fin = nombre
        if p.get("cota") is not None:
            cotas[nombre] = float(p["cota"])
    puntos = (
        supabase.table("topo_puntos")
        .select("id,nombre,cota")
        .eq("contrato_id", contrato_id)
        .eq("verificado", True)
        .execute()
        .data
        or []
    )
    for p in puntos:
        n = (p.get("nombre") or "").strip()
        if n and p.get("cota") is not None and n not in cotas:
            cotas[n] = float(p["cota"])
    return cotas, bm_ini, bm_fin


def _validar_distancia_lectura_nivel(lect: dict, dist_max: float) -> None:
    dist = lect.get("distancia_m")
    if dist is None:
        return
    try:
        d = float(dist)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Distancia taquimétrica inválida.")
    if d > dist_max:
        raise HTTPException(
            status_code=422,
            detail=f"Distancia {d:.2f} m supera el tope de {dist_max:.0f} m (visual taquimétrica).",
        )


def _payload_lectura_nivel(body: LecturaNivelBody, tipo_nivel: str) -> dict:
    data = body.model_dump(exclude_none=True)
    if body.tipo_punto == "TP":
        data["tipo_punto"] = "estacion"
    desc = (body.descripcion_punto or body.ubicacion or "").strip()
    if desc:
        data["descripcion_punto"] = desc
        data.setdefault("ubicacion", desc)
    if body.hilo_medio is not None and body.lectura is None:
        data["lectura"] = round(float(body.hilo_medio), 4)
    if tipo_nivel == "automatico":
        if body.hilo_medio is not None:
            data["lectura"] = round(float(body.hilo_medio), 4)
        d = distancia_taquimetrica_nivelacion(body.hilo_superior, body.hilo_inferior)
        if d is not None:
            data["distancia_m"] = round(d, 3)
    elif body.hilo_superior is not None and body.hilo_inferior is not None and body.distancia_m is None:
        d = distancia_taquimetrica_nivelacion(body.hilo_superior, body.hilo_inferior)
        if d is not None:
            data["distancia_m"] = round(d, 3)
    return data


def _insertar_comentario_nivelacion(
    contrato_id: int,
    nivelacion_id: str,
    autor_id: int,
    nivel: int,
    estado: str,
    comentario_data: dict,
    rol_origen: str,
) -> None:
    mensaje = (comentario_data.get("mensaje") or "").strip()
    if not mensaje:
        raise HTTPException(status_code=422, detail="El comentario debe incluir un mensaje.")
    dest = comentario_data.get("destinatarios") or []
    if not dest:
        raise HTTPException(status_code=422, detail="Indique al menos un destinatario del comentario.")
    supabase.table("topo_nivelacion_comentarios").insert(
        {
            "nivelacion_id": nivelacion_id,
            "contrato_id": contrato_id,
            "autor_id": autor_id,
            "nivel": nivel,
            "estado": estado,
            "rol_origen": rol_origen,
            "etiqueta": comentario_data.get("etiqueta"),
            "mensaje": mensaje,
            "destinatarios": dest,
        }
    ).execute()


def _ejecutar_calculo_nivelacion(contrato_id: int, nivelacion_id: str) -> dict:
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    lecturas = (
        supabase.table("topo_nivelacion_lecturas")
        .select("*")
        .eq("nivelacion_id", nivelacion_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    cotas, bm_ini, bm_fin = _resolver_bms_nivelacion(niv, contrato_id)
    resultado = calcular_nivelacion_geometrica(niv, lecturas, cotas, bm_ini, bm_fin)
    if resultado.get("errores"):
        raise HTTPException(status_code=422, detail="; ".join(resultado["errores"]))

    for row in resultado.get("lecturas") or []:
        lid = row.get("id")
        if not lid:
            continue
        supabase.table("topo_nivelacion_lecturas").update(
            {
                k: row[k]
                for k in (
                    "altura_instrumento",
                    "cota_calculada",
                    "cota_ajustada",
                    "correccion",
                )
                if k in row and row[k] is not None
            }
        ).eq("id", lid).execute()

    supabase.table("topo_nivelaciones").update(
        {
            "error_cierre": resultado.get("error_cierre"),
            "tolerancia_calculada": resultado.get("tolerancia_calculada"),
            "distancia_total_km": resultado.get("distancia_total_km"),
            "distancia_vplus_km": resultado.get("distancia_vplus_km"),
            "distancia_vminus_km": resultado.get("distancia_vminus_km"),
            "estado": "calculado",
        }
    ).eq("id", nivelacion_id).execute()
    return resultado


def _exigir_nivelacion_lista_validar(row: dict) -> None:
    if row.get("estado") != "cerrado":
        raise HTTPException(status_code=422, detail="Termine la nivelación antes de validar.")
    ec = row.get("error_cierre")
    tol = row.get("tolerancia_calculada")
    if ec is None or tol is None:
        raise HTTPException(status_code=422, detail="Faltan resultados de cierre.")
    if abs(float(ec)) > float(tol):
        raise HTTPException(status_code=422, detail="Error de cierre fuera de tolerancia.")


def _exigir_nivelacion_datos_campo(row: dict) -> None:
    falt = faltantes_campo_nivelacion(row)
    if falt:
        raise HTTPException(
            status_code=422,
            detail=f"Complete datos de campo antes de validar (contratista): {', '.join(falt)}.",
        )


def _reset_validacion_nivelacion_update() -> dict:
    return {
        "nivel1_estado": "No Revisado",
        "nivel1_usuario_id": None,
        "nivel1_fecha": None,
        "nivel2_estado": "No Revisado",
        "nivel2_usuario_id": None,
        "nivel2_fecha": None,
        "biblioteca_at": None,
    }


def _aplicar_validacion_nivelacion(
    contrato_id: int,
    nivelacion_id: str,
    row: dict,
    nivel: int,
    body: ValidarPoligonalBody,
    current_user,
) -> dict:
    require_topo_puede_validar_nivel(current_user, nivel)
    _exigir_nivelacion_lista_validar(row)
    if nivel == 1:
        _exigir_nivelacion_datos_campo(row)
    if body.estado not in ESTADOS_VALIDACION:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Use: {sorted(ESTADOS_VALIDACION)}")
    if body.estado in ("Pendiente", "Rechazado") and not body.comentario_data:
        raise HTTPException(
            status_code=422,
            detail="Se requiere comentario cuando el estado es Pendiente o Rechazado.",
        )
    if nivel == 2 and (row.get("nivel1_estado") or "No Revisado") != "Aprobado":
        raise HTTPException(
            status_code=422,
            detail="La interventoría solo puede validar cuando la contratista haya aprobado (nivel 1).",
        )
    uid = _uid(current_user)
    now = datetime.now(timezone.utc).isoformat()
    update = {
        f"nivel{nivel}_estado": body.estado,
        f"nivel{nivel}_usuario_id": uid,
        f"nivel{nivel}_fecha": now,
    }
    if nivel == 2 and body.estado == "Aprobado":
        update["biblioteca_at"] = now
        update["estado"] = "cerrado"
        _publicar_nivelacion_biblioteca(contrato_id, nivelacion_id)
    supabase.table("topo_nivelaciones").update(update).eq("id", nivelacion_id).execute()
    if body.comentario_data:
        _insertar_comentario_nivelacion(
            contrato_id,
            nivelacion_id,
            uid,
            nivel,
            body.estado,
            body.comentario_data,
            _rol_origen_topo(current_user),
        )
    return {"ok": True, f"nivel{nivel}_estado": body.estado}


def _publicar_nivelacion_biblioteca(contrato_id: int, nivelacion_id: str) -> None:
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id) or {}
    meta_bib = {"operador": niv.get("operador"), "fecha_campo": niv.get("fecha_campo")}
    lecturas = (
        supabase.table("topo_nivelacion_lecturas")
        .select("*")
        .eq("nivelacion_id", nivelacion_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    now = datetime.now(timezone.utc).isoformat()
    tipo_map = {"estacion": "estacion", "auxiliar": "auxiliar", "cambio": "cambio", "TP": "estacion", "BM": "auxiliar"}
    publicados: dict[str, dict] = {}
    for grupo in _agrupar_lecturas_por_fila(lecturas):
        base = grupo[0]
        nombre = (base.get("nombre_punto") or "").strip()
        if not nombre:
            continue
        cota = None
        for lect in grupo:
            c = lect.get("cota_ajustada")
            if c is None:
                c = lect.get("cota_calculada")
            if c is not None:
                cota = c
        if cota is None:
            continue
        publicados[nombre] = {"cota": cota, "tipo_punto": base.get("tipo_punto")}
    for nombre, info in publicados.items():
        cota = info["cota"]
        tipo_pto = info.get("tipo_punto") or "estacion"
        payload = {
            "contrato_id": contrato_id,
            "nombre": nombre,
            "cota": cota,
            "tipo": tipo_map.get(tipo_pto, "estacion"),
            "verificado": True,
            "modulo_origen": "nivelacion",
            "circuito_id": nivelacion_id,
            "fecha_verificacion": now,
            **meta_bib,
        }
        existing = _row("topo_puntos", contrato_id=contrato_id, nombre=nombre)
        if existing:
            upd = dict(payload)
            if existing.get("tipo"):
                upd["tipo"] = existing["tipo"]
            if existing.get("norte") is not None:
                upd["norte"] = existing["norte"]
            if existing.get("este") is not None:
                upd["este"] = existing["este"]
            supabase.table("topo_puntos").update(upd).eq("id", existing["id"]).execute()
        else:
            supabase.table("topo_puntos").insert(payload).execute()


@router.get("/{contrato_id}/nivelaciones")
def listar_nivelaciones(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_nivelaciones").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


@router.post("/{contrato_id}/nivelaciones")
def crear_nivelacion(contrato_id: int, body: NivelacionBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if body.bm_inicial_id:
        _punto_verificado(body.bm_inicial_id, contrato_id)
    if body.bm_final_id:
        _punto_verificado(body.bm_final_id, contrato_id)
    row = supabase.table("topo_nivelaciones").insert({**_dump_model(body, ("bm_inicial_id", "bm_final_id")), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/nivelaciones/{nivelacion_id}")
def obtener_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    lecturas = supabase.table("topo_nivelacion_lecturas").select("*").eq("nivelacion_id", nivelacion_id).order("orden").execute().data or []
    return {"nivelacion": niv, "lecturas": lecturas}


@router.delete("/{contrato_id}/nivelaciones/{nivelacion_id}")
def eliminar_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    if _nivelacion_sellada(niv):
        raise HTTPException(
            status_code=403,
            detail="No se puede eliminar una nivelación sellada tras la validación de interventoría.",
        )
    supabase.table("topo_nivelacion_lecturas").delete().eq("nivelacion_id", nivelacion_id).execute()
    supabase.table("topo_nivelaciones").delete().eq("id", nivelacion_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.put("/{contrato_id}/nivelaciones/{nivelacion_id}")
def actualizar_nivelacion(contrato_id: int, nivelacion_id: str, body: NivelacionUpdateBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_nivelacion_editable(niv)
    if body.bm_inicial_id:
        _punto_verificado(body.bm_inicial_id, contrato_id)
    if body.bm_final_id:
        _punto_verificado(body.bm_final_id, contrato_id)
    payload = _dump_model(body, ("bm_inicial_id", "bm_final_id"))
    payload = {k: v for k, v in payload.items() if v is not None}
    row = supabase.table("topo_nivelaciones").update(payload).eq("id", nivelacion_id).execute().data
    return row[0] if row else niv


@router.put("/{contrato_id}/nivelaciones/{nivelacion_id}/lecturas")
def sincronizar_lecturas_nivelacion(
    contrato_id: int, nivelacion_id: str, body: LecturasNivelSyncBody, current_user=Depends(get_current_user)
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_nivelacion_editable(niv)
    if not body.lecturas:
        raise HTTPException(status_code=422, detail="La cartera no puede quedar vacía.")
    dist_max = float(niv.get("distancia_max_visual_m") or 50)
    tipo_nivel = body.tipo_nivel or niv.get("tipo_nivel") or "electronico"
    if body.tipo_nivel and body.tipo_nivel != niv.get("tipo_nivel"):
        supabase.table("topo_nivelaciones").update({"tipo_nivel": body.tipo_nivel}).eq("id", nivelacion_id).execute()
    for lect in body.lecturas:
        pl = lect.model_dump()
        if lectura_efectiva_nivelacion(_payload_lectura_nivel(lect, tipo_nivel), tipo_nivel) is not None:
            _validar_distancia_lectura_nivel(pl, dist_max)
    bm_ini_nombre = None
    if niv.get("bm_inicial_id"):
        p = _row("topo_puntos", id=niv["bm_inicial_id"], contrato_id=contrato_id)
        if p:
            bm_ini_nombre = (p.get("nombre") or "").strip()
    lect_dicts = [_payload_lectura_nivel(lect, tipo_nivel) for lect in body.lecturas]
    tiene_util = any(
        lectura_efectiva_nivelacion(d, tipo_nivel) is not None or d.get("punto_biblioteca_id")
        for d in lect_dicts
    )
    if not tiene_util:
        raise HTTPException(status_code=422, detail="No hay lecturas ni fila de cierre para guardar.")
    reglas = validar_lecturas_nivelacion(lect_dicts, tipo_nivel, bm_ini_nombre)
    if reglas:
        raise HTTPException(status_code=422, detail="; ".join(reglas))
    previas = (
        supabase.table("topo_nivelacion_lecturas")
        .select("*")
        .eq("nivelacion_id", nivelacion_id)
        .execute()
        .data
        or []
    )
    payloads = [{**_payload_lectura_nivel(lect, tipo_nivel), "nivelacion_id": nivelacion_id} for lect in body.lecturas]
    supabase.table("topo_nivelacion_lecturas").delete().eq("nivelacion_id", nivelacion_id).execute()
    rows: list[dict] = []
    try:
        ins = supabase.table("topo_nivelacion_lecturas").insert(payloads).execute().data or []
        rows = ins
        if len(rows) != len(payloads):
            raise HTTPException(status_code=500, detail="No se guardaron todas las lecturas de la cartera.")
    except HTTPException:
        raise
    except Exception as exc:
        if previas:
            try:
                supabase.table("topo_nivelacion_lecturas").insert(previas).execute()
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Error al guardar lecturas: {exc}") from exc
    supabase.table("topo_nivelaciones").update(
        {**_reset_validacion_nivelacion_update(), "estado": "borrador", "error_cierre": None, "tolerancia_calculada": None}
    ).eq("id", nivelacion_id).execute()
    return {"lecturas": rows, "count": len(rows), "puntos": len({((l.get("orden") or 1) - 1) // 10 if (l.get("orden") or 0) >= 10 else (l.get("orden") or 1) for l in rows})}


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/lecturas")
def agregar_lectura_nivelacion(contrato_id: int, nivelacion_id: str, body: LecturaNivelBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_nivelacion_editable(niv)
    dist_max = float(niv.get("distancia_max_visual_m") or 50)
    _validar_distancia_lectura_nivel(body.model_dump(), dist_max)
    payload = {**_payload_lectura_nivel(body, niv.get("tipo_nivel") or "electronico"), "nivelacion_id": nivelacion_id}
    row = supabase.table("topo_nivelacion_lecturas").insert(payload).execute().data
    return row[0] if row else {}


@router.delete("/{contrato_id}/nivelaciones/{nivelacion_id}/lecturas/{lectura_id}")
def eliminar_lectura_nivelacion(
    contrato_id: int, nivelacion_id: str, lectura_id: str, current_user=Depends(get_current_user)
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_nivelacion_editable(niv)
    supabase.table("topo_nivelacion_lecturas").delete().eq("id", lectura_id).eq("nivelacion_id", nivelacion_id).execute()
    return {"ok": True}


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/calcular")
def calcular_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_nivelacion_editable(niv)
    return _ejecutar_calculo_nivelacion(contrato_id, nivelacion_id)


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/cerrar")
def cerrar_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_nivelacion_editable(niv)
    lecturas = (
        supabase.table("topo_nivelacion_lecturas")
        .select("*")
        .eq("nivelacion_id", nivelacion_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    _, bm_ini, _ = _resolver_bms_nivelacion(niv, contrato_id)
    reglas = validar_lecturas_nivelacion(lecturas, niv.get("tipo_nivel") or "electronico", bm_ini)
    if reglas:
        raise HTTPException(status_code=422, detail="; ".join(reglas))
    calc = _ejecutar_calculo_nivelacion(contrato_id, nivelacion_id)
    if calc.get("errores"):
        raise HTTPException(status_code=422, detail="; ".join(calc["errores"]))
    if not calc.get("admisible"):
        raise HTTPException(status_code=422, detail="Error de cierre fuera de tolerancia")
    if calc.get("error_cierre") is None or calc.get("tolerancia_calculada") is None:
        raise HTTPException(status_code=422, detail="No hay cierre calculado. Verifique BM final y lecturas.")
    supabase.table("topo_nivelaciones").update({"estado": "cerrado"}).eq("id", nivelacion_id).execute()
    return {"ok": True, "resultado": calc}


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/finalizar")
def finalizar_circuito_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    """Calcula cierre, cierra si es admisible y devuelve siempre resultado estructurado (sin 422 silencioso)."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    _assert_nivelacion_editable(niv)
    lecturas = (
        supabase.table("topo_nivelacion_lecturas")
        .select("*")
        .eq("nivelacion_id", nivelacion_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    if not lecturas:
        return {
            "ok": False,
            "fase": "guardar",
            "mensaje": "No hay lecturas guardadas. Pulse «Guardar cartera» primero.",
            "resultado": None,
        }
    _, bm_ini, _ = _resolver_bms_nivelacion(niv, contrato_id)
    reglas = validar_lecturas_nivelacion(lecturas, niv.get("tipo_nivel") or "electronico", bm_ini)
    if reglas:
        return {"ok": False, "fase": "validacion", "mensaje": "; ".join(reglas), "resultado": None}
    try:
        calc = _ejecutar_calculo_nivelacion(contrato_id, nivelacion_id)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return {"ok": False, "fase": "calcular", "mensaje": detail, "resultado": None}
    if calc.get("error_cierre") is None:
        avisos = calc.get("avisos") or []
        msg = "; ".join(avisos) if avisos else (
            "No hay cierre calculado. Use «Ingresar cierre», registre V− en el BM final y guarde la cartera."
        )
        return {"ok": False, "fase": "cierre", "mensaje": msg, "resultado": calc}
    if not calc.get("admisible"):
        ec = float(calc["error_cierre"])
        tol = float(calc["tolerancia_calculada"] or 0)
        return {
            "ok": False,
            "fase": "admisibilidad",
            "mensaje": (
                f"Cierre INADMISIBLE: error {ec * 1000:.2f} mm "
                f"(tolerancia {tol * 1000:.2f} mm)."
            ),
            "resultado": calc,
        }
    supabase.table("topo_nivelaciones").update({"estado": "cerrado"}).eq("id", nivelacion_id).execute()
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    return {
        "ok": True,
        "fase": "terminado",
        "mensaje": "Nivelación terminada. Cierre admisible — valide con contratista e interventoría.",
        "resultado": calc,
        "estado": "cerrado",
        "nivelacion": niv,
    }


@router.put("/{contrato_id}/nivelaciones/{nivelacion_id}/validar-nivel1")
def validar_nivelacion_nivel1(
    contrato_id: int, nivelacion_id: str, body: ValidarPoligonalBody, current_user=Depends(get_current_user)
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    return _aplicar_validacion_nivelacion(contrato_id, nivelacion_id, niv, 1, body, current_user)


@router.put("/{contrato_id}/nivelaciones/{nivelacion_id}/validar-nivel2")
def validar_nivelacion_nivel2(
    contrato_id: int, nivelacion_id: str, body: ValidarPoligonalBody, current_user=Depends(get_current_user)
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    return _aplicar_validacion_nivelacion(contrato_id, nivelacion_id, niv, 2, body, current_user)


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/validar")
def validar_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    niv = _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id)
    if not niv:
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    nuevo = min(int(niv.get("nivel_validacion") or 0) + 1, NIVEL_MAX)
    supabase.table("topo_nivelaciones").update({"nivel_validacion": nuevo}).eq("id", nivelacion_id).execute()
    return {"nivel_validacion": nuevo}


@router.post("/{contrato_id}/nivelaciones/{nivelacion_id}/firma")
def firma_nivelacion(contrato_id: int, nivelacion_id: str, body: FirmaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_nivelaciones", id=nivelacion_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Nivelacion no encontrada")
    return _guardar_firma("nivelacion", nivelacion_id, body, _uid(current_user))


def _enriquecer_nivelacion_pdf(contrato_id: int, niv: dict, lecturas: list[dict]) -> tuple[dict, list[dict]]:
    """Recalcula cierre y BM para PDF (misma lógica que la vista en pantalla)."""
    cotas, bm_ini, bm_fin = _resolver_bms_nivelacion(niv, contrato_id)
    fb_ini, fb_fin = _resolver_bms_nivelacion_pdf(contrato_id, niv, lecturas)
    if not bm_ini:
        bm_ini = fb_ini
    if not bm_fin:
        bm_fin = fb_fin
    return enriquecer_nivelacion_pdf(
        contrato_id,
        niv,
        lecturas,
        cotas_biblioteca=cotas,
        bm_ini=bm_ini,
        bm_fin=bm_fin,
    )


@router.get("/{contrato_id}/nivelaciones/{nivelacion_id}/pdf")
def pdf_nivelacion(contrato_id: int, nivelacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    try:
        data = obtener_nivelacion(contrato_id, nivelacion_id, current_user)
        contrato = _require_contrato_row(contrato_id)
        lecturas = data["lecturas"]
        niv, lecturas = _enriquecer_nivelacion_pdf(contrato_id, dict(data["nivelacion"]), lecturas)
        niv["nivel1_usuario_nombre"] = _nombre_usuario(niv.get("nivel1_usuario_id"))
        niv["nivel2_usuario_nombre"] = _nombre_usuario(niv.get("nivel2_usuario_id"))
        generado = _nombre_usuario(_uid(current_user)) or niv.get("operador") or ""
        html_doc = html_documento_nivelacion_pdf(contrato, niv, lecturas, generado_por=generado or "")
        pdf = to_pdf_bytes(html_doc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {exc}") from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="circuito_nivelacion_{nivelacion_id[:8]}.pdf"'},
    )


# ── AREAS ─────────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/areas")
def listar_areas(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_areas").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


@router.post("/{contrato_id}/areas")
def crear_area(contrato_id: int, body: AreaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if len(body.puntos) < 3:
        raise HTTPException(status_code=422, detail="Se requieren al menos 3 vertices")
    area_m2 = area_por_coordenadas(body.puntos)
    perimetro = perimetro_por_coordenadas(body.puntos)
    row = supabase.table("topo_areas").insert({
        "contrato_id": contrato_id,
        "nombre": body.nombre,
        "descripcion": body.descripcion,
        "puntos": body.puntos,
        "area_m2": area_m2,
        "area_ha": area_m2 / 10000.0,
        "perimetro": perimetro,
        "operador": body.operador,
        "fecha": str(body.fecha) if body.fecha else None,
    }).execute().data
    result = row[0] if row else {}
    result["svg"] = svg_poligono(body.puntos, titulo=body.nombre)
    return result


@router.get("/{contrato_id}/areas/{area_id}")
def obtener_area(contrato_id: int, area_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    area = _row("topo_areas", id=area_id, contrato_id=contrato_id)
    if not area:
        raise HTTPException(status_code=404, detail="Area no encontrada")
    area["svg"] = svg_poligono(area.get("puntos") or [], titulo=area.get("nombre", ""))
    return area


@router.put("/{contrato_id}/areas/{area_id}")
def actualizar_area(contrato_id: int, area_id: str, body: AreaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_areas", id=area_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Area no encontrada")
    area_m2 = area_por_coordenadas(body.puntos)
    perimetro = perimetro_por_coordenadas(body.puntos)
    row = supabase.table("topo_areas").update({
        "nombre": body.nombre,
        "descripcion": body.descripcion,
        "puntos": body.puntos,
        "area_m2": area_m2,
        "area_ha": area_m2 / 10000.0,
        "perimetro": perimetro,
        "operador": body.operador,
        "fecha": str(body.fecha) if body.fecha else None,
    }).eq("id", area_id).execute().data
    result = row[0] if row else {}
    result["svg"] = svg_poligono(body.puntos, titulo=body.nombre)
    return result


@router.delete("/{contrato_id}/areas/{area_id}")
def eliminar_area(contrato_id: int, area_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    supabase.table("topo_areas").delete().eq("id", area_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True}


@router.get("/{contrato_id}/areas/{area_id}/pdf")
def pdf_area(contrato_id: int, area_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    area = obtener_area(contrato_id, area_id, current_user)
    contrato = _require_contrato_row(contrato_id)
    puntos = area.get("puntos") or []
    rows = ""
    for p in puntos:
        rows += f"<tr><td>{html.escape(str(p.get('nombre')))}</td><td>{p.get('norte')}</td><td>{p.get('este')}</td></tr>"
    svg = area.get("svg") or svg_poligono(puntos, titulo=area.get("nombre", ""))
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, f"Area por coordenadas — {area.get('nombre')}")}
    <table width="100%" border="1" cellspacing="0" cellpadding="4">
    <tr style="background:#e2e8f0;"><th>Punto</th><th>Norte</th><th>Este</th></tr>{rows}</table>
    <p>Area: {area.get('area_m2'):.4f} m2 | {area.get('area_ha'):.6f} ha | Perimetro: {area.get('perimetro'):.3f} m</p>
    {svg}{html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="area_{area_id[:8]}.pdf"'})


# ── NEW POINT (resección; reemplaza intersección) ─────────────────────────────

@router.get("/{contrato_id}/newpoints")
def listar_newpoints(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    rows = (
        supabase.table("topo_newpoints")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    if not rows:
        return []
    pol_ids = list({str(r["poligonal_id"]) for r in rows if r.get("poligonal_id")})
    pol_rows = (
        supabase.table("topo_poligonales").select("id, nombre").in_("id", pol_ids).execute().data or []
    )
    pol_nombres = {str(p["id"]): p.get("nombre") for p in pol_rows}
    return [_enriquecer_newpoint_lista(r, pol_nombres) for r in rows]


@router.post("/{contrato_id}/newpoints")
def crear_newpoint(contrato_id: int, body: NewPointBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    pol, p1, p2, calc = _calcular_payload_newpoint(body, contrato_id)
    opc_bd = _opciones_bd_desde_calc(calc)
    row = supabase.table("topo_newpoints").insert({
        "contrato_id": contrato_id,
        "poligonal_id": body.poligonal_id,
        "nombre_punto_nuevo": body.nombre_punto_nuevo.strip(),
        "descripcion": body.descripcion,
        "punto1_id": body.punto1_id,
        "distancia1": body.distancia1,
        "angulo_observado_gms": body.angulo_observado_gms,
        "punto2_id": body.punto2_id,
        "distancia2": body.distancia2,
        **opc_bd,
        "opcion_elegida": None,
        "norte_resultado": None,
        "este_resultado": None,
        "error_lineal": calc["error_lineal"],
        "error_angular_segundos": calc["error_angular_segundos"],
        "tolerancia_lineal": body.tolerancia_lineal,
        "tolerancia_angular_seg": body.tolerancia_angular_seg,
        "admisible": calc["admisible"],
        "tipo_punto": body.tipo_punto or "auxiliar",
        "estado": "calculado",
        "operador": body.operador,
        "fecha": str(body.fecha) if body.fecha else None,
        "equipo_marca": (body.equipo_marca or "").strip() or None,
        "equipo_referencia": (body.equipo_referencia or "").strip() or None,
        "equipo_serial": (body.equipo_serial or "").strip() or None,
    }).execute().data
    result = _enriquecer_newpoint_vista(row[0] if row else {})
    result["calculo"] = calc
    p1_row = p1
    p2_row = p2
    result["svg"] = _svg_newpoint(result, p1_row, p2_row, calc)
    return result


@router.get("/{contrato_id}/newpoints/{newpoint_id}")
def obtener_newpoint(contrato_id: int, newpoint_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    np = _row("topo_newpoints", id=newpoint_id, contrato_id=contrato_id)
    if not np:
        raise HTTPException(status_code=404, detail="NewPoint no encontrado")
    p1 = _row("topo_puntos", id=np.get("punto1_id")) or {}
    p2 = _row("topo_puntos", id=np.get("punto2_id")) or {}
    verts_named = _vertices_poligonal_named_para_newpoint(contrato_id, np.get("poligonal_id"))
    verts = [(v["norte"], v["este"]) for v in verts_named]
    out = _enriquecer_newpoint_vista(np, p1=p1, p2=p2, verts=verts)
    out["vertices_poligonal"] = verts_named
    out["svg"] = _svg_newpoint(out, p1, p2, verts_named=verts_named)
    return out


@router.put("/{contrato_id}/newpoints/{newpoint_id}")
def actualizar_newpoint(contrato_id: int, newpoint_id: str, body: NewPointBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    np = _row("topo_newpoints", id=newpoint_id, contrato_id=contrato_id)
    if not np:
        raise HTTPException(status_code=404, detail="NewPoint no encontrado")
    _assert_newpoint_editable(np)
    pol, p1, p2, calc = _calcular_payload_newpoint(body, contrato_id)
    opc_bd = _opciones_bd_desde_calc(calc)
    geo_igual = _inputs_geometria_newpoint_iguales(np, body)
    update: dict = {
        "poligonal_id": body.poligonal_id,
        "nombre_punto_nuevo": body.nombre_punto_nuevo.strip(),
        "descripcion": body.descripcion,
        "punto1_id": body.punto1_id,
        "distancia1": body.distancia1,
        "angulo_observado_gms": body.angulo_observado_gms,
        "punto2_id": body.punto2_id,
        "distancia2": body.distancia2,
        **opc_bd,
        "error_lineal": calc["error_lineal"],
        "error_angular_segundos": calc["error_angular_segundos"],
        "tolerancia_lineal": body.tolerancia_lineal,
        "tolerancia_angular_seg": body.tolerancia_angular_seg,
        "admisible": calc["admisible"],
        "tipo_punto": body.tipo_punto or "auxiliar",
        "operador": body.operador,
        "fecha": str(body.fecha) if body.fecha else None,
        "equipo_marca": (body.equipo_marca or "").strip() or None,
        "equipo_referencia": (body.equipo_referencia or "").strip() or None,
        "equipo_serial": (body.equipo_serial or "").strip() or None,
    }
    if geo_igual and np.get("opcion_elegida") in ("A", "B") and calc["admisible"]:
        op = np.get("opcion_elegida")
        update["opcion_elegida"] = op
        if op == "A":
            update["norte_resultado"] = opc_bd.get("opcion_a_norte")
            update["este_resultado"] = opc_bd.get("opcion_a_este")
        else:
            update["norte_resultado"] = opc_bd.get("opcion_b_norte")
            update["este_resultado"] = opc_bd.get("opcion_b_este")
    else:
        update["opcion_elegida"] = None
        update["norte_resultado"] = None
        update["este_resultado"] = None
    if not geo_igual or (
        _meta_campo_newpoint_cambiada(np, body)
        and (np.get("nivel1_estado") or "No Revisado") != "No Revisado"
    ):
        update.update(_reset_validacion_newpoint_update())
    supabase.table("topo_newpoints").update(update).eq("id", newpoint_id).execute()
    result = obtener_newpoint(contrato_id, newpoint_id, current_user)
    result["calculo"] = calc
    return result


@router.put("/{contrato_id}/newpoints/{newpoint_id}/elegir-opcion")
def elegir_opcion_newpoint(
    contrato_id: int,
    newpoint_id: str,
    body: NewPointElegirBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    np = _row("topo_newpoints", id=newpoint_id, contrato_id=contrato_id)
    if not np:
        raise HTTPException(status_code=404, detail="NewPoint no encontrado")
    _assert_newpoint_editable(np)
    if body.opcion == "A":
        norte, este = np.get("opcion_a_norte"), np.get("opcion_a_este")
    else:
        norte, este = np.get("opcion_b_norte"), np.get("opcion_b_este")
    if norte is None or este is None:
        raise HTTPException(status_code=422, detail=f"La opción {body.opcion} no está disponible en este cálculo.")
    cambio = (np.get("opcion_elegida") or "") != body.opcion
    update: dict = {
        "opcion_elegida": body.opcion,
        "norte_resultado": norte,
        "este_resultado": este,
    }
    if cambio and (np.get("nivel1_estado") or "No Revisado") != "No Revisado":
        update.update(_reset_validacion_newpoint_update())
    supabase.table("topo_newpoints").update(update).eq("id", newpoint_id).execute()
    return obtener_newpoint(contrato_id, newpoint_id, current_user)


@router.put("/{contrato_id}/newpoints/{newpoint_id}/validar-nivel1")
def validar_newpoint_nivel1(
    contrato_id: int,
    newpoint_id: str,
    body: ValidarPoligonalBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    np = _row("topo_newpoints", id=newpoint_id, contrato_id=contrato_id)
    if not np:
        raise HTTPException(status_code=404, detail="NewPoint no encontrado")
    return _aplicar_validacion_newpoint(contrato_id, newpoint_id, np, 1, body, current_user)


@router.put("/{contrato_id}/newpoints/{newpoint_id}/validar-nivel2")
def validar_newpoint_nivel2(
    contrato_id: int,
    newpoint_id: str,
    body: ValidarPoligonalBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    np = _row("topo_newpoints", id=newpoint_id, contrato_id=contrato_id)
    if not np:
        raise HTTPException(status_code=404, detail="NewPoint no encontrado")
    return _aplicar_validacion_newpoint(contrato_id, newpoint_id, np, 2, body, current_user)


@router.get("/{contrato_id}/newpoints/{newpoint_id}/pdf")
def pdf_newpoint(contrato_id: int, newpoint_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    try:
        np = obtener_newpoint(contrato_id, newpoint_id, current_user)
        contrato = _require_contrato_row(contrato_id)
        p1 = _row("topo_puntos", id=np.get("punto1_id")) or {}
        p2 = _row("topo_puntos", id=np.get("punto2_id")) or {}
        verts = _vertices_poligonal_named_para_newpoint(contrato_id, np.get("poligonal_id"))
        html_doc = html_documento_newpoint_pdf(contrato, np, p1, p2, verts)
        pdf = to_pdf_bytes(html_doc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {exc}") from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="newpoint_{newpoint_id[:8]}.pdf"'},
    )


# ── EQUIPOS ───────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/equipos")
def listar_equipos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_equipos").select("*").eq("contrato_id", contrato_id).order("nombre").execute().data or []


@router.post("/{contrato_id}/equipos")
def crear_equipo(contrato_id: int, body: EquipoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    row = supabase.table("topo_equipos").insert({**body.model_dump(), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/equipos/alertas")
def alertas_equipos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    equipos = listar_equipos(contrato_id, current_user)
    hoy = date.today()
    alertas = {"vencidas": [], "proximas": [], "al_dia": []}
    for eq in equipos:
        if not eq.get("activo"):
            continue
        ver = (
            supabase.table("topo_equipos_verificaciones")
            .select("*")
            .eq("equipo_id", eq["id"])
            .order("fecha", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not ver:
            alertas["vencidas"].append({**eq, "motivo": "Sin verificacion"})
            continue
        prox = ver[0].get("proxima_verificacion")
        if not prox:
            alertas["al_dia"].append(eq)
            continue
        try:
            fprox = date.fromisoformat(str(prox)[:10])
        except ValueError:
            alertas["al_dia"].append(eq)
            continue
        delta = (fprox - hoy).days
        item = {**eq, "proxima_verificacion": prox, "ultima_verificacion": ver[0]}
        if delta < 0:
            alertas["vencidas"].append(item)
        elif delta <= 7:
            alertas["proximas"].append(item)
        else:
            alertas["al_dia"].append(item)
    alertas["total_alertas"] = len(alertas["vencidas"]) + len(alertas["proximas"])
    return alertas


@router.put("/{contrato_id}/equipos/{equipo_id}")
def actualizar_equipo(contrato_id: int, equipo_id: str, body: EquipoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_equipos", id=equipo_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    row = supabase.table("topo_equipos").update(body.model_dump()).eq("id", equipo_id).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/equipos/{equipo_id}/verificaciones")
def listar_verificaciones_equipo(contrato_id: int, equipo_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    if not _row("topo_equipos", id=equipo_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    return supabase.table("topo_equipos_verificaciones").select("*").eq("equipo_id", equipo_id).order("fecha", desc=True).execute().data or []


@router.post("/{contrato_id}/equipos/{equipo_id}/verificaciones")
def crear_verificacion_equipo(contrato_id: int, equipo_id: str, body: VerificacionEquipoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    eq = _row("topo_equipos", id=equipo_id, contrato_id=contrato_id)
    if not eq:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    if body.tipo_verificacion == "nivel":
        calc = calcular_verificacion_nivel(body.resultados, tolerancia_mm=body.tolerancia_mm)
    else:
        calc = calcular_verificacion_estacion_total(body.resultados, tolerancia_seg=body.tolerancia_seg)
    resultados = {**(body.resultados or {}), **calc}
    prox = body.proxima_verificacion
    if not prox:
        from datetime import timedelta
        prox = body.fecha + timedelta(days=30)
    row = supabase.table("topo_equipos_verificaciones").insert({
        "equipo_id": equipo_id,
        "contrato_id": contrato_id,
        "fecha": str(body.fecha),
        "tipo_verificacion": body.tipo_verificacion,
        "operador": body.operador,
        "condiciones": body.condiciones,
        "resultados": resultados,
        "cumple": calc.get("cumple"),
        "observaciones": body.observaciones,
        "proxima_verificacion": str(prox),
    }).execute().data
    return row[0] if row else {}


@router.post("/{contrato_id}/equipos/{equipo_id}/verificaciones/{verificacion_id}/validar")
def validar_verificacion_equipo(contrato_id: int, equipo_id: str, verificacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    ver = _row("topo_equipos_verificaciones", id=verificacion_id, equipo_id=equipo_id, contrato_id=contrato_id)
    if not ver:
        raise HTTPException(status_code=404, detail="Verificacion no encontrada")
    nuevo = min(int(ver.get("nivel_validacion") or 0) + 1, NIVEL_MAX)
    supabase.table("topo_equipos_verificaciones").update({"nivel_validacion": nuevo}).eq("id", verificacion_id).execute()
    return {"nivel_validacion": nuevo}


@router.get("/{contrato_id}/equipos/{equipo_id}/verificaciones/{verificacion_id}/pdf")
def pdf_verificacion_equipo(contrato_id: int, equipo_id: str, verificacion_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    eq = _row("topo_equipos", id=equipo_id, contrato_id=contrato_id)
    ver = _row("topo_equipos_verificaciones", id=verificacion_id, equipo_id=equipo_id)
    if not eq or not ver:
        raise HTTPException(status_code=404, detail="No encontrado")
    contrato = _require_contrato_row(contrato_id)
    res = ver.get("resultados") or {}
    diag = res.get("diagnostico", "NO CUMPLE" if not ver.get("cumple") else "CUMPLE")
    color = "#16a34a" if ver.get("cumple") else "#dc2626"
    advertencia = ""
    if not ver.get("cumple"):
        advertencia = '<p style="background:#fef2f2;border:2px solid #dc2626;padding:8px;color:#991b1b;font-weight:bold;">ADVERTENCIA: Equipo requiere calibracion. Datos tomados con este equipo no son confiables.</p>'
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, f"Verificacion de equipo — {eq.get('nombre')}")}
    <p>Tipo: {eq.get('tipo')} | Marca: {eq.get('marca')} | Modelo: {eq.get('modelo')} | Serie: {eq.get('serie')}</p>
    <p>Fecha: {ver.get('fecha')} | Operador: {html.escape(str(ver.get('operador') or ''))}</p>
    {advertencia}
    <p style="color:{color};font-weight:bold;font-size:12pt;">Diagnostico: {diag}</p>
    <p>Recomendacion: {html.escape(str(res.get('recomendacion') or ''))}</p>
    <p>Proxima verificacion: {ver.get('proxima_verificacion')}</p>
    {html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="verificacion_{verificacion_id[:8]}.pdf"'})


# ── VIAS ──────────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/vias/proyectos")
def listar_vias_proyectos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_vias_proyectos").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


@router.post("/{contrato_id}/vias/proyectos")
def crear_via_proyecto(contrato_id: int, body: ViaProyectoBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    row = supabase.table("topo_vias_proyectos").insert({**body.model_dump(), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/vias/proyectos/{proyecto_id}")
def obtener_via_proyecto(contrato_id: int, proyecto_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    proj = _row("topo_vias_proyectos", id=proyecto_id, contrato_id=contrato_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return proj


@router.post("/{contrato_id}/vias/registros")
def crear_via_registro(contrato_id: int, body: ViaRegistroBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if body.bm_referencia_id:
        _punto_verificado(body.bm_referencia_id, contrato_id)
    row = supabase.table("topo_vias_registros").insert({**body.model_dump(), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/vias/registros/{registro_id}")
def obtener_via_registro(contrato_id: int, registro_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    reg = _row("topo_vias_registros", id=registro_id, contrato_id=contrato_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    lecturas = supabase.table("topo_vias_lecturas").select("*").eq("registro_id", registro_id).order("orden").execute().data or []
    return {"registro": reg, "lecturas": lecturas}


@router.post("/{contrato_id}/vias/registros/{registro_id}/lecturas")
def agregar_via_lectura(contrato_id: int, registro_id: str, body: ViaLecturaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    reg = _row("topo_vias_registros", id=registro_id, contrato_id=contrato_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    _assert_editable(reg.get("nivel_validacion", 0))
    cota_campo = None
    if body.lectura_mira is not None and body.altura_instrumento is not None:
        cota_campo = body.altura_instrumento - body.lectura_mira
    delta = None
    dentro = None
    if cota_campo is not None and body.cota_diseno is not None:
        delta = cota_campo - body.cota_diseno
        dentro = abs(delta) <= body.tolerancia_m
    row = supabase.table("topo_vias_lecturas").insert({
        "registro_id": registro_id,
        "orden": body.orden,
        "abscisa": body.abscisa,
        "punto_tomado": body.punto_tomado,
        "altura_instrumento": body.altura_instrumento,
        "lectura_mira": body.lectura_mira,
        "cota_campo": cota_campo,
        "cota_diseno": body.cota_diseno,
        "delta": delta,
        "dentro_tolerancia": dentro,
    }).execute().data
    return row[0] if row else {}


@router.post("/{contrato_id}/vias/registros/{registro_id}/calcular")
def calcular_via_registro(contrato_id: int, registro_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    lecturas = supabase.table("topo_vias_lecturas").select("*").eq("registro_id", registro_id).execute().data or []
    total = len(lecturas)
    ok = sum(1 for l in lecturas if l.get("dentro_tolerancia"))
    return {"total": total, "dentro_tolerancia": ok, "fuera_tolerancia": total - ok}


@router.post("/{contrato_id}/vias/registros/{registro_id}/validar")
def validar_via_registro(contrato_id: int, registro_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    reg = _row("topo_vias_registros", id=registro_id, contrato_id=contrato_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    nuevo = min(int(reg.get("nivel_validacion") or 0) + 1, NIVEL_MAX)
    supabase.table("topo_vias_registros").update({"nivel_validacion": nuevo}).eq("id", registro_id).execute()
    return {"nivel_validacion": nuevo}


@router.post("/{contrato_id}/vias/registros/{registro_id}/firma")
def firma_via_registro(contrato_id: int, registro_id: str, body: FirmaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_vias_registros", id=registro_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return _guardar_firma("vias", registro_id, body, _uid(current_user))


@router.get("/{contrato_id}/vias/registros/{registro_id}/pdf")
def pdf_via_registro(contrato_id: int, registro_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    data = obtener_via_registro(contrato_id, registro_id, current_user)
    contrato = _require_contrato_row(contrato_id)
    reg = data["registro"]
    lecturas = data["lecturas"]
    rows = ""
    for l in lecturas:
        rows += f"<tr><td>{l.get('abscisa')}</td><td>{l.get('cota_campo')}</td><td>{l.get('cota_diseno')}</td><td>{l.get('delta')}</td><td>{'SI' if l.get('dentro_tolerancia') else 'NO'}</td></tr>"
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, "Verificacion de vias")}
    <table width="100%" border="1" cellspacing="0" cellpadding="4">
    <tr style="background:#e2e8f0;"><th>Abscisa</th><th>Cota campo</th><th>Cota diseno</th><th>Delta</th><th>OK</th></tr>{rows}</table>
    {html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="vias_{registro_id[:8]}.pdf"'})


# ── TUBERIA ───────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/tuberias")
def listar_tuberias(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return supabase.table("topo_tuberias").select("*").eq("contrato_id", contrato_id).order("created_at", desc=True).execute().data or []


@router.post("/{contrato_id}/tuberias")
def crear_tuberia(contrato_id: int, body: TuberiaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    row = supabase.table("topo_tuberias").insert({**body.model_dump(), "contrato_id": contrato_id}).execute().data
    return row[0] if row else {}


@router.get("/{contrato_id}/tuberias/{tuberia_id}")
def obtener_tuberia(contrato_id: int, tuberia_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    tub = _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id)
    if not tub:
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    registros = supabase.table("topo_tuberia_registros").select("*").eq("tuberia_id", tuberia_id).order("fecha").execute().data or []
    return {"tuberia": tub, "registros": registros}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/registros")
def crear_tuberia_registro(contrato_id: int, tuberia_id: str, body: TuberiaRegistroBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    if not _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    if body.bm_referencia_id:
        _punto_verificado(body.bm_referencia_id, contrato_id)
    row = supabase.table("topo_tuberia_registros").insert({**body.model_dump(), "tuberia_id": tuberia_id}).execute().data
    return row[0] if row else {}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/registros/{registro_id}/tubos")
def agregar_tubo(contrato_id: int, tuberia_id: str, registro_id: str, body: TuberiaTuboBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    tub = _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id)
    if not tub:
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    reg = _row("topo_tuberia_registros", id=registro_id, tuberia_id=tuberia_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    registro = _row("topo_tuberia_registros", id=registro_id)
    hi = registro.get("altura_instrumento") if registro else None
    tol = float(tub.get("tolerancia_cm") or 2.0) / 100.0
    cota_ini = hi - body.lectura_mira_inicio if hi is not None and body.lectura_mira_inicio is not None else None
    cota_fin = hi - body.lectura_mira_fin if hi is not None and body.lectura_mira_fin is not None else None
    delta_ini = cota_ini - body.cota_diseno_inicio if cota_ini is not None and body.cota_diseno_inicio is not None else None
    delta_fin = cota_fin - body.cota_diseno_fin if cota_fin is not None and body.cota_diseno_fin is not None else None
    dentro = True
    if delta_ini is not None and abs(delta_ini) > tol:
        dentro = False
    if delta_fin is not None and abs(delta_fin) > tol:
        dentro = False
    row = supabase.table("topo_tuberia_tubos").insert({
        **body.model_dump(),
        "registro_id": registro_id,
        "cota_campo_inicio": cota_ini,
        "cota_campo_fin": cota_fin,
        "delta_inicio": delta_ini,
        "delta_fin": delta_fin,
        "dentro_tolerancia": dentro,
    }).execute().data
    return row[0] if row else {}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/cerrar")
def cerrar_tuberia(contrato_id: int, tuberia_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    supabase.table("topo_tuberias").update({"estado": "cerrado", "fecha_cierre": str(date.today())}).eq("id", tuberia_id).execute()
    return {"ok": True}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/validar")
def validar_tuberia(contrato_id: int, tuberia_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "validar")
    tub = _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id)
    if not tub:
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    nuevo = min(int(tub.get("nivel_validacion") or 0) + 1, NIVEL_MAX)
    supabase.table("topo_tuberias").update({"nivel_validacion": nuevo}).eq("id", tuberia_id).execute()
    return {"nivel_validacion": nuevo}


@router.post("/{contrato_id}/tuberias/{tuberia_id}/firma")
def firma_tuberia(contrato_id: int, tuberia_id: str, body: FirmaBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_tuberias", id=tuberia_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Tuberia no encontrada")
    return _guardar_firma("tuberia", tuberia_id, body, _uid(current_user))


@router.get("/{contrato_id}/tuberias/{tuberia_id}/pdf")
def pdf_tuberia(contrato_id: int, tuberia_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "exportar")
    data = obtener_tuberia(contrato_id, tuberia_id, current_user)
    contrato = _require_contrato_row(contrato_id)
    tub = data["tuberia"]
    html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial;font-size:9pt;">
    {html_encabezado_pdf(contrato, f"Tuberia — {tub.get('nombre')}")}
    <p>Material: {tub.get('material')} | Diametro: {tub.get('diametro_nominal')} | Estado: {tub.get('estado')}</p>
    {html_pie_pdf(contrato)}</body></html>"""
    return Response(content=to_pdf_bytes(html_doc), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="tuberia_{tuberia_id[:8]}.pdf"'})


# ── DISEÑO GEOMÉTRICO (ejes, rasante CSV, estructura de vía) ───────────────────

def _capas_estructura_vigente(eje_id: str) -> list[dict]:
    est = (
        supabase.table("topo_diseno_estructuras")
        .select("id")
        .eq("eje_id", eje_id)
        .eq("vigente", True)
        .limit(1)
        .execute()
        .data
    )
    if not est:
        return (
            supabase.table("topo_diseno_estructura_capas")
            .select("*")
            .eq("eje_id", eje_id)
            .order("orden")
            .execute()
            .data
            or []
        )
    return (
        supabase.table("topo_diseno_estructura_capas")
        .select("*")
        .eq("estructura_id", est[0]["id"])
        .order("orden")
        .execute()
        .data
        or []
    )


def _enriquecer_diseno_eje_resumen(eje: dict) -> dict:
    eid = eje["id"]
    rasante = (
        supabase.table("topo_diseno_rasante")
        .select("abscisa", count="exact")
        .eq("eje_id", eid)
        .execute()
    )
    capas_vig = _capas_estructura_vigente(eid)
    estructuras = (
        supabase.table("topo_diseno_estructuras")
        .select("id", count="exact")
        .eq("eje_id", eid)
        .execute()
    )
    est_vig = (
        supabase.table("topo_diseno_estructuras")
        .select("nombre")
        .eq("eje_id", eid)
        .eq("vigente", True)
        .limit(1)
        .execute()
        .data
    )
    abscisas = (
        supabase.table("topo_diseno_rasante")
        .select("abscisa")
        .eq("eje_id", eid)
        .order("abscisa")
        .execute()
        .data
        or []
    )
    abs_vals = [r["abscisa"] for r in abscisas if r.get("abscisa") is not None]
    return {
        **eje,
        "filas_rasante": rasante.count or 0,
        "num_capas": len(capas_vig),
        "num_estructuras": estructuras.count or 0,
        "estructura_vigente_nombre": est_vig[0]["nombre"] if est_vig else None,
        "abscisa_min": min(abs_vals) if abs_vals else None,
        "abscisa_max": max(abs_vals) if abs_vals else None,
    }


def _listar_estructuras_eje(eje_id: str) -> list[dict]:
    rows = (
        supabase.table("topo_diseno_estructuras")
        .select("*")
        .eq("eje_id", eje_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    out = []
    for est in rows:
        capas = (
            supabase.table("topo_diseno_estructura_capas")
            .select("*")
            .eq("estructura_id", est["id"])
            .order("orden")
            .execute()
            .data
            or []
        )
        esp_total = sum(float(c.get("espesor_m") or 0) for c in capas)
        out.append({**est, "capas": capas, "espesor_total_m": esp_total})
    return out


def _cargar_diseno_eje_detalle(contrato_id: int, eje_id: str) -> dict:
    eje = _row("topo_diseno_ejes", id=eje_id, contrato_id=contrato_id)
    if not eje:
        raise HTTPException(status_code=404, detail="Eje no encontrado")
    rasante = (
        supabase.table("topo_diseno_rasante")
        .select("*")
        .eq("eje_id", eje_id)
        .order("abscisa")
        .execute()
        .data
        or []
    )
    estructuras = _listar_estructuras_eje(eje_id)
    vigente = next((e for e in estructuras if e.get("vigente")), None)
    capas = vigente["capas"] if vigente else _capas_estructura_vigente(eje_id)
    perfil_puntos: list = []
    if eje.get("tipo_seccion") and eje.get("ancho_via_m") and rasante:
        perfil_puntos = generar_perfil_desde_filas(
            rasante,
            eje["tipo_seccion"],
            float(eje["ancho_via_m"]),
            bool(eje.get("calcular_intermedias")),
            float(eje["paso_intermedias_m"]) if eje.get("paso_intermedias_m") else None,
        )
    return {
        "eje": {**_enriquecer_diseno_eje_resumen(eje), "puntos_perfil": len(perfil_puntos)},
        "rasante": rasante,
        "perfil_puntos": perfil_puntos,
        "capas": capas,
        "estructura_vigente": vigente,
        "estructuras": estructuras,
        "tipos_seccion": SECCION_TIPOS,
    }


def _aplicar_config_importacion(eje_id: str, config: DisenoImportConfig) -> None:
    supabase.table("topo_diseno_ejes").update({
        "tipo_seccion": config.tipo_seccion,
        "ancho_via_m": config.ancho_via_m,
        "calcular_intermedias": config.calcular_intermedias,
        "paso_intermedias_m": config.paso_intermedias_m if config.calcular_intermedias else None,
        "interpolar_abscisas": config.interpolar_abscisas,
        "paso_abscisas_m": config.paso_abscisas_m if config.interpolar_abscisas else None,
    }).eq("id", eje_id).execute()


def _eliminar_rasante_eje(eje_id: str) -> None:
    supabase.table("topo_diseno_rasante").delete().eq("eje_id", eje_id).execute()
    supabase.table("topo_diseno_perfil_puntos").delete().eq("eje_id", eje_id).execute()
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("topo_diseno_ejes").update({
        "tipo_seccion": None,
        "ancho_via_m": None,
        "calcular_intermedias": False,
        "paso_intermedias_m": None,
        "interpolar_abscisas": False,
        "paso_abscisas_m": None,
        "updated_at": now,
    }).eq("id", eje_id).execute()


def _insertar_rasante_filas(
    eje_id: str,
    filas: list[dict],
    reemplazar: bool,
    config: DisenoImportConfig | None = None,
) -> int:
    if reemplazar:
        supabase.table("topo_diseno_rasante").delete().eq("eje_id", eje_id).execute()
        supabase.table("topo_diseno_perfil_puntos").delete().eq("eje_id", eje_id).execute()
    payload = []
    for f in filas:
        ancho = f.get("ancho")
        if ancho is None and config:
            ancho = config.ancho_via_m
        payload.append({
            "eje_id": eje_id,
            "tramo": f.get("tramo"),
            "abscisa": f["abscisa"],
            "cota_izquierda": f.get("cota_izquierda"),
            "cota_eje": f.get("cota_eje"),
            "cota_derecha": f.get("cota_derecha"),
            "ancho": ancho,
        })
    for i in range(0, len(payload), 100):
        supabase.table("topo_diseno_rasante").insert(payload[i : i + 100]).execute()
    if config:
        _aplicar_config_importacion(eje_id, config)
        puntos = generar_perfil_desde_filas(
            filas,
            config.tipo_seccion,
            config.ancho_via_m,
            config.calcular_intermedias,
            config.paso_intermedias_m,
        )
        perf_payload = [{**p, "eje_id": eje_id} for p in puntos]
        for i in range(0, len(perf_payload), 100):
            supabase.table("topo_diseno_perfil_puntos").insert(perf_payload[i : i + 100]).execute()
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("topo_diseno_ejes").update({"updated_at": now}).eq("id", eje_id).execute()
    return len(payload)


def _guardar_estructura_capas(
    eje_id: str,
    capas: list[DisenoCapaItem],
    nombre: str | None,
    nueva_version: bool,
) -> dict:
    if not capas:
        raise HTTPException(status_code=422, detail="Defina al menos una capa (capa terminada / rasante).")
    nombres = [c.nombre.strip() for c in capas]
    if len(nombres) != len(set(n.lower() for n in nombres)):
        raise HTTPException(status_code=422, detail="Los nombres de capa deben ser únicos.")
    now = datetime.now(timezone.utc).isoformat()
    if nueva_version:
        supabase.table("topo_diseno_estructuras").update({"vigente": False}).eq("eje_id", eje_id).execute()
        nom = (nombre or "").strip() or f"Estructura {now[:10]}"
        est_row = (
            supabase.table("topo_diseno_estructuras")
            .insert({"eje_id": eje_id, "nombre": nom, "vigente": True})
            .execute()
            .data
        )
        est_id = est_row[0]["id"] if est_row else None
    else:
        est = (
            supabase.table("topo_diseno_estructuras")
            .select("id")
            .eq("eje_id", eje_id)
            .eq("vigente", True)
            .limit(1)
            .execute()
            .data
        )
        if est:
            est_id = est[0]["id"]
            if nombre and nombre.strip():
                supabase.table("topo_diseno_estructuras").update(
                    {"nombre": nombre.strip()}
                ).eq("id", est_id).execute()
            supabase.table("topo_diseno_estructura_capas").delete().eq("estructura_id", est_id).execute()
        else:
            nom = (nombre or "").strip() or "Estructura inicial"
            est_row = (
                supabase.table("topo_diseno_estructuras")
                .insert({"eje_id": eje_id, "nombre": nom, "vigente": True})
                .execute()
                .data
            )
            est_id = est_row[0]["id"] if est_row else None
    if not est_id:
        raise HTTPException(status_code=500, detail="No se pudo crear la estructura.")
    payload = [
        {
            "eje_id": eje_id,
            "estructura_id": est_id,
            "orden": i + 1,
            "nombre": c.nombre.strip(),
            "espesor_m": c.espesor_m,
            "referencia_analisis_orden": c.referencia_analisis_orden,
            "sobre_ancho_m": c.sobre_ancho_m or 0,
        }
        for i, c in enumerate(capas)
    ]
    supabase.table("topo_diseno_estructura_capas").insert(payload).execute()
    supabase.table("topo_diseno_ejes").update({"updated_at": now}).eq("id", eje_id).execute()
    return {"ok": True, "estructura_id": est_id, "capas": len(payload)}


@router.get("/{contrato_id}/diseno-geometrico/tipos-seccion")
def listar_tipos_seccion_diseno(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return SECCION_TIPOS


@router.get("/{contrato_id}/diseno-geometrico/plantilla.csv")
def descargar_plantilla_diseno(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return Response(
        content=PLANTILLA_CSV_DISENO.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="plantilla_diseno_geometrico.csv"'},
    )


@router.get("/{contrato_id}/diseno-geometrico/ejes")
def listar_diseno_ejes(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    rows = (
        supabase.table("topo_diseno_ejes")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_enriquecer_diseno_eje_resumen(r) for r in rows]


@router.post("/{contrato_id}/diseno-geometrico/ejes")
def crear_diseno_eje(contrato_id: int, body: DisenoEjeBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    nombre = body.nombre.strip()
    row = (
        supabase.table("topo_diseno_ejes")
        .insert({"contrato_id": contrato_id, "nombre": nombre})
        .execute()
        .data
    )
    return row[0] if row else {}


@router.get("/{contrato_id}/diseno-geometrico/ejes/{eje_id}")
def obtener_diseno_eje(contrato_id: int, eje_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return _cargar_diseno_eje_detalle(contrato_id, eje_id)


@router.delete("/{contrato_id}/diseno-geometrico/ejes/{eje_id}")
def eliminar_diseno_eje(contrato_id: int, eje_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    if not _row("topo_diseno_ejes", id=eje_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Eje no encontrado")
    supabase.table("topo_diseno_ejes").delete().eq("id", eje_id).execute()
    return {"ok": True}


@router.delete("/{contrato_id}/diseno-geometrico/ejes/{eje_id}/rasante")
def eliminar_diseno_rasante(contrato_id: int, eje_id: str, current_user=Depends(get_current_user)):
    """Elimina rasante importada y puntos de perfil; conserva el eje y la estructura de vía."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_diseno_ejes", id=eje_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Eje no encontrado")
    _eliminar_rasante_eje(eje_id)
    return {"ok": True}


@router.post("/{contrato_id}/diseno-geometrico/ejes/{eje_id}/import-csv")
def importar_diseno_csv(
    contrato_id: int,
    eje_id: str,
    body: DisenoImportCsvBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_diseno_ejes", id=eje_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Eje no encontrado")
    try:
        filas = parse_csv_diseno_rasante(body.contenido)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    n = _insertar_rasante_filas(eje_id, filas, body.reemplazar, body.config)
    return {"ok": True, "filas_importadas": n, "puntos_perfil": True}


@router.post("/{contrato_id}/diseno-geometrico/ejes/{eje_id}/import-filas")
def importar_diseno_filas(
    contrato_id: int,
    eje_id: str,
    body: DisenoImportFilasBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_diseno_ejes", id=eje_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Eje no encontrado")
    try:
        filas = parse_filas_diseno_rasante(body.filas)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    n = _insertar_rasante_filas(eje_id, filas, body.reemplazar, body.config)
    return {"ok": True, "filas_importadas": n, "puntos_perfil": True}


@router.put("/{contrato_id}/diseno-geometrico/ejes/{eje_id}/estructura")
def guardar_diseno_estructura(
    contrato_id: int,
    eje_id: str,
    body: DisenoEstructuraBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_diseno_ejes", id=eje_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Eje no encontrado")
    return _guardar_estructura_capas(eje_id, body.capas, body.nombre, nueva_version=False)


@router.post("/{contrato_id}/diseno-geometrico/ejes/{eje_id}/estructura")
def crear_diseno_estructura(
    contrato_id: int,
    eje_id: str,
    body: DisenoEstructuraBody,
    current_user=Depends(get_current_user),
):
    """Nueva versión de estructura; queda vigente (las anteriores pasan a histórico)."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    if not _row("topo_diseno_ejes", id=eje_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Eje no encontrado")
    if not (body.nombre or "").strip():
        raise HTTPException(status_code=422, detail="Indique un nombre para la nueva estructura.")
    return _guardar_estructura_capas(eje_id, body.capas, body.nombre, nueva_version=True)


@router.get("/{contrato_id}/diseno-geometrico/ejes/{eje_id}/preview-capa/{indice_capa}")
def preview_cota_capa_diseno(
    contrato_id: int,
    eje_id: str,
    indice_capa: int,
    current_user=Depends(get_current_user),
):
    """Vista previa: cotas de diseño por abscisa para la capa (0 = terminada/rasante)."""
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    data = _cargar_diseno_eje_detalle(contrato_id, eje_id)
    capas = data.get("capas") or []
    if not capas:
        raise HTTPException(status_code=422, detail="Defina la estructura de vía primero.")
    if indice_capa < 0 or indice_capa >= len(capas):
        raise HTTPException(status_code=422, detail="Índice de capa inválido.")
    preview = []
    for r in data["rasante"]:
        ref = r.get("cota_eje")
        if ref is None:
            ref = r.get("cota_izquierda") or r.get("cota_derecha")
        if ref is None:
            continue
        preview.append({
            "abscisa": r["abscisa"],
            "tramo": r.get("tramo"),
            "cota_rasante_eje": r.get("cota_eje"),
            "cota_diseno_eje": cota_diseno_capa(float(ref), capas, indice_capa),
            "capa": capas[indice_capa]["nombre"],
        })
    return {"capa": capas[indice_capa], "indice": indice_capa, "filas": preview[:50]}


# ── ENTREGA DG OBRA (seguimiento campo por eje + capa) ────────────────────────


def _contexto_entrega_eje(contrato_id: int, eje_id: str) -> dict:
    data = _cargar_diseno_eje_detalle(contrato_id, eje_id)
    if not data.get("rasante"):
        raise HTTPException(status_code=422, detail="El eje no tiene rasante importada.")
    if not data.get("capas"):
        raise HTTPException(status_code=422, detail="El eje no tiene estructura de vía definida.")
    if not data["eje"].get("tipo_seccion") or not data["eje"].get("ancho_via_m"):
        raise HTTPException(status_code=422, detail="Complete la configuración transversal del eje (importe con esquema A/B/C).")
    return data


def _grilla_entrega(contrato_id: int, entrega: dict, solo_referencia: bool = True) -> list[dict]:
    ctx = _contexto_entrega_eje(contrato_id, entrega["eje_id"])
    ras = filtrar_rasante_rango(
        ctx["rasante"],
        entrega.get("abscisa_desde"),
        entrega.get("abscisa_hasta"),
    )
    return grilla_entrega_capa(
        ras,
        ctx["eje"],
        ctx["capas"],
        int(entrega["indice_capa"]),
        solo_referencia=solo_referencia,
    )


def _lecturas_referencia_campo_entrega(
    contrato_id: int,
    eje_id: str,
    capas: list[dict[str, Any]],
    indice_capa: int,
    excluir_entrega_id: str | None = None,
) -> tuple[dict[tuple[float, float], float], dict[str, Any] | None]:
    """Cotas de campo de la entrega DG de la capa de referencia (misma abscisa/ordenada)."""
    if es_entrega_terreno_natural(indice_capa, len(capas)):
        return {}, None
    idx_ref = indice_entrega_referencia_capa(capas, indice_capa)
    rows = (
        supabase.table("topo_entrega_dg")
        .select("id, nombre, capa_nombre, updated_at")
        .eq("contrato_id", contrato_id)
        .eq("eje_id", eje_id)
        .eq("indice_capa", idx_ref)
        .order("updated_at", desc=True)
        .execute()
        .data
        or []
    )
    if excluir_entrega_id:
        rows = [r for r in rows if r["id"] != excluir_entrega_id]
    if not rows:
        return {}, None
    ref_entrega = rows[0]
    lecturas = (
        supabase.table("topo_entrega_dg_lecturas")
        .select("abscisa, ordenada, cota_campo")
        .eq("entrega_id", ref_entrega["id"])
        .execute()
        .data
        or []
    )
    meta = {
        "entrega_id": ref_entrega["id"],
        "nombre": ref_entrega.get("nombre"),
        "capa_nombre": capa_nombre_vigente_entrega(capas, idx_ref) if idx_ref is not None else None,
        "indice_capa": idx_ref,
    }
    return mapa_cota_campo_lecturas(lecturas), meta


def _meta_analisis_entrega(
    contrato_id: int,
    eje_id: str,
    capas: list[dict[str, Any]],
    idx_capa: int,
    excluir_entrega_id: str | None = None,
) -> tuple[dict | None, dict]:
    """Capa y metadatos de análisis según configuración DG vigente."""
    n = len(capas)
    es_terreno = es_entrega_terreno_natural(idx_capa, n)
    capa_nombre_vigente = capa_nombre_vigente_entrega(capas, idx_capa)
    if es_terreno:
        capa: dict | None = {"nombre": "Terreno natural", "espesor_m": None}
    else:
        capa = {**capas[idx_capa], "nombre": capa_nombre_vigente}
    ref_idx = referencia_analisis_indice(capas, idx_capa) if not es_terreno else None
    ref_capa = capa_referencia_analisis(capas, idx_capa) if not es_terreno else None
    ref_entrega_idx = indice_entrega_referencia_capa(capas, idx_capa) if not es_terreno else None
    ref_es_terreno_natural = not es_terreno and ref_entrega_idx == n
    _, ref_entrega_meta = _lecturas_referencia_campo_entrega(
        contrato_id, eje_id, capas, idx_capa, excluir_entrega_id,
    )
    if ref_entrega_meta and ref_entrega_idx is not None:
        ref_nombre = f"{capa_nombre_vigente_entrega(capas, ref_entrega_idx)} (campo)"
    elif es_terreno:
        ref_nombre = "Diseño geométrico (rasante importada)"
    else:
        ref_nombre = ref_capa.get("nombre") if ref_capa else "Terreno natural (diseño)"
    analisis = {
        "indice_capa": idx_capa,
        "capa_nombre": capa_nombre_vigente,
        "espesor_diseno_m": capa.get("espesor_m") if capa and not es_terreno else None,
        "referencia_indice": ref_idx,
        "referencia_entrega_indice": ref_entrega_idx,
        "referencia_es_terreno_natural": ref_es_terreno_natural,
        "referencia_nombre": ref_nombre,
        "referencia_entrega": ref_entrega_meta,
        "referencia_usa_campo": bool(ref_entrega_meta),
        "referencia_orden": ref_capa.get("orden") if ref_capa else None,
        "modo": "terreno" if es_terreno else "espesor",
    }
    return capa, analisis


def _cargar_entrega_detalle(contrato_id: int, entrega_id: str) -> dict:
    entrega = _row("topo_entrega_dg", id=entrega_id, contrato_id=contrato_id)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    ctx = _contexto_entrega_eje(contrato_id, entrega["eje_id"])
    ras_filtrada = filtrar_rasante_rango(
        ctx["rasante"],
        entrega.get("abscisa_desde"),
        entrega.get("abscisa_hasta"),
    )
    capas = ctx["capas"]
    idx_capa = int(entrega["indice_capa"])
    es_terreno = es_entrega_terreno_natural(idx_capa, len(capas))
    grilla_full = grilla_entrega_capa(
        ras_filtrada,
        ctx["eje"],
        capas,
        idx_capa,
        solo_referencia=False,
    )
    grilla = grilla_entrega_capa(
        ras_filtrada,
        ctx["eje"],
        capas,
        idx_capa,
        solo_referencia=True,
    )
    ordenadas_ref = ordenadas_referencia_izq_eje_der(grilla_full)
    lecturas = (
        supabase.table("topo_entrega_dg_lecturas")
        .select("*")
        .eq("entrega_id", entrega_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    bloques = (
        supabase.table("topo_entrega_dg_bloques")
        .select("*")
        .eq("entrega_id", entrega_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    resumen = resumen_sectores_entrega(ras_filtrada, grilla_full, lecturas, ordenadas_ref)
    sector = info_sector_rango(
        ctx["rasante"],
        entrega.get("abscisa_desde"),
        entrega.get("abscisa_hasta"),
    )
    grilla_ref = None
    ref_idx = None
    ref_capa = None
    if not es_terreno:
        ref_idx = referencia_analisis_indice(capas, idx_capa)
        grilla_ref = (
            grilla_diseno_entrega(ras_filtrada, ctx["eje"], capas, ref_idx, solo_referencia=False)
            if ref_idx is not None
            else grilla_fondo_terreno_entrega(ras_filtrada, ctx["eje"], capas)
        )
        ref_capa = capa_referencia_analisis(capas, idx_capa)
    lecturas_ref_campo, ref_entrega_meta = _lecturas_referencia_campo_entrega(
        contrato_id, entrega["eje_id"], capas, idx_capa, excluir_entrega_id=entrega_id,
    )
    matriz, ordenadas_cols = filas_matriz_entrega(
        grilla_full,
        lecturas,
        ordenadas_ref,
        entrega.get("abscisa_desde"),
        entrega.get("abscisa_hasta"),
        bloques,
        grilla_ref,
        lecturas_ref_campo,
    )
    capa, analisis = _meta_analisis_entrega(
        contrato_id, entrega["eje_id"], capas, idx_capa, excluir_entrega_id=entrega_id,
    )
    capa_nombre_vigente = analisis["capa_nombre"]
    primera_pendiente = next(
        (a for a in resumen.get("abscisas", []) if a.get("estado") == "pendiente"),
        None,
    )
    return {
        "entrega": {**entrega, "capa_nombre": capa_nombre_vigente},
        "eje": ctx["eje"],
        "capa": capa,
        "capas": ctx["capas"],
        "grilla_diseno": grilla_full,
        "ordenadas_ref": ordenadas_ref,
        "ordenadas_cols": ordenadas_cols,
        "lecturas": lecturas,
        "bloques": bloques,
        "matriz": matriz,
        "resumen": resumen,
        "sector": sector,
        "primera_pendiente": primera_pendiente,
        "analisis": analisis,
    }


def _enriquecer_entrega_lista(entrega: dict, contrato_id: int) -> dict:
    eje = _row("topo_diseno_ejes", id=entrega["eje_id"], contrato_id=contrato_id) or {}
    out = {**entrega, "eje_nombre": eje.get("nombre")}
    try:
        ctx = _contexto_entrega_eje(contrato_id, entrega["eje_id"])
        out["capa_nombre"] = capa_nombre_vigente_entrega(ctx["capas"], int(entrega["indice_capa"]))
        ras = filtrar_rasante_rango(
            ctx["rasante"],
            entrega.get("abscisa_desde"),
            entrega.get("abscisa_hasta"),
        )
        grilla_full = grilla_entrega_capa(
            ras, ctx["eje"], ctx["capas"], int(entrega["indice_capa"]), solo_referencia=False,
        )
        grilla = grilla_entrega_capa(
            ras, ctx["eje"], ctx["capas"], int(entrega["indice_capa"]), solo_referencia=True,
        )
        ordenadas_ref = ordenadas_referencia_izq_eje_der(grilla_full)
        lecturas = (
            supabase.table("topo_entrega_dg_lecturas")
            .select("id, abscisa, ordenada, dentro_tolerancia")
            .eq("entrega_id", entrega["id"])
            .execute()
            .data
            or []
        )
        res = resumen_sectores_entrega(ras, grilla_full, lecturas, ordenadas_ref)
        out["avance_pct"] = res["totales"]["avance_pct"]
        out["abscisas_pendientes"] = res["totales"]["pendientes"]
    except HTTPException:
        out["avance_pct"] = 0
        out["abscisas_pendientes"] = None
    return out


def _siguiente_orden_entrega(contrato_id: int) -> int:
    rows = (
        supabase.table("topo_entrega_dg")
        .select("orden")
        .eq("contrato_id", contrato_id)
        .order("orden", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows or rows[0].get("orden") is None:
        return 1
    return int(rows[0]["orden"]) + 1


@router.get("/{contrato_id}/entrega-dg/preview-rango")
def preview_entrega_dg_rango(
    contrato_id: int,
    eje_id: str,
    abscisa_desde: Optional[float] = None,
    abscisa_hasta: Optional[float] = None,
    indice_capa: int = 0,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    ctx = _contexto_entrega_eje(contrato_id, eje_id)
    capas = ctx["capas"]
    idx = int(indice_capa)
    if idx < 0 or idx > len(capas):
        raise HTTPException(status_code=422, detail="Índice de capa inválido.")
    sector = info_sector_rango(ctx["rasante"], abscisa_desde, abscisa_hasta)
    ras = filtrar_rasante_rango(ctx["rasante"], abscisa_desde, abscisa_hasta)
    grilla_full = grilla_entrega_capa(ras, ctx["eje"], capas, idx, solo_referencia=False)
    ordenadas_ref = ordenadas_referencia_izq_eje_der(grilla_full)
    abscisas = abscisas_referencia_en_rango(grilla_full, abscisa_desde, abscisa_hasta)
    capa, analisis = _meta_analisis_entrega(contrato_id, eje_id, capas, idx)
    return {
        "sector": sector,
        "ordenadas_ref": ordenadas_ref,
        "abscisas": abscisas,
        "pk_min": abscisas[0] if abscisas else None,
        "pk_max": abscisas[-1] if abscisas else None,
        "eje": {
            "nombre": ctx["eje"].get("nombre"),
            "ancho_via_m": ctx["eje"].get("ancho_via_m"),
            "tipo_seccion": ctx["eje"].get("tipo_seccion"),
        },
        "capa": capa,
        "analisis": analisis,
    }


@router.get("/{contrato_id}/entrega-dg")
def listar_entregas_dg(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    rows = (
        supabase.table("topo_entrega_dg")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("orden", desc=False)
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )
    return [_enriquecer_entrega_lista(r, contrato_id) for r in rows]


@router.post("/{contrato_id}/entrega-dg/reordenar")
def reordenar_entregas_dg(
    contrato_id: int,
    body: EntregaDgReordenBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    existing = (
        supabase.table("topo_entrega_dg")
        .select("id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    existing_ids = {r["id"] for r in existing}
    if not existing_ids:
        return {"ok": True, "ids": []}
    seen: set[str] = set()
    ordered: list[str] = []
    for eid in body.ids:
        if eid in existing_ids and eid not in seen:
            ordered.append(eid)
            seen.add(eid)
    for eid in sorted(existing_ids):
        if eid not in seen:
            ordered.append(eid)
    now = datetime.now(timezone.utc).isoformat()
    for i, eid in enumerate(ordered, start=1):
        supabase.table("topo_entrega_dg").update({"orden": i, "updated_at": now}).eq("id", eid).execute()
    return {"ok": True, "ids": ordered}


@router.post("/{contrato_id}/entrega-dg")
def crear_entrega_dg(contrato_id: int, body: EntregaDgBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "crear")
    ctx = _contexto_entrega_eje(contrato_id, body.eje_id)
    capas = ctx["capas"]
    n_capas = len(capas)
    if body.indice_capa > n_capas:
        raise HTTPException(status_code=422, detail="Índice de capa inválido.")
    if body.indice_capa == n_capas:
        capa_nombre = "Terreno natural"
    else:
        capa = capas[body.indice_capa]
        capa_nombre = capa.get("nombre")
    if body.abscisa_desde is not None and body.abscisa_hasta is not None:
        if float(body.abscisa_desde) > float(body.abscisa_hasta):
            raise HTTPException(status_code=422, detail="Abscisa desde debe ser menor o igual que abscisa hasta.")
    now = datetime.now(timezone.utc).isoformat()
    orden = _siguiente_orden_entrega(contrato_id)
    row = (
        supabase.table("topo_entrega_dg")
        .insert({
            "contrato_id": contrato_id,
            "eje_id": body.eje_id,
            "nombre": body.nombre.strip(),
            "indice_capa": body.indice_capa,
            "capa_nombre": capa_nombre,
            "abscisa_desde": body.abscisa_desde,
            "abscisa_hasta": body.abscisa_hasta,
            "bm_referencia_id": body.bm_referencia_id,
            "fecha_campo": str(body.fecha_campo) if body.fecha_campo else None,
            "operador": body.operador,
            "tolerancia_m": body.tolerancia_m,
            "notas": body.notas,
            "orden": orden,
            "updated_at": now,
        })
        .execute()
        .data
    )
    entrega = row[0] if row else None
    if entrega:
        supabase.table("topo_entrega_dg_bloques").insert({
            "entrega_id": entrega["id"],
            "orden": 1,
            "abscisa_inicio": body.abscisa_desde,
            "nombre_punto": "P1",
        }).execute()
    return entrega or {}


@router.get("/{contrato_id}/entrega-dg/{entrega_id}")
def obtener_entrega_dg(contrato_id: int, entrega_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "ver")
    return _cargar_entrega_detalle(contrato_id, entrega_id)


@router.delete("/{contrato_id}/entrega-dg/{entrega_id}")
def eliminar_entrega_dg(contrato_id: int, entrega_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "eliminar")
    if not _row("topo_entrega_dg", id=entrega_id, contrato_id=contrato_id):
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    supabase.table("topo_entrega_dg").delete().eq("id", entrega_id).execute()
    return {"ok": True}


@router.post("/{contrato_id}/entrega-dg/{entrega_id}/lecturas")
def agregar_entrega_dg_lectura(
    contrato_id: int,
    entrega_id: str,
    body: EntregaDgLecturaBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    entrega = _row("topo_entrega_dg", id=entrega_id, contrato_id=contrato_id)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    _assert_editable(entrega.get("nivel_validacion", 0))
    grilla = _grilla_entrega(contrato_id, entrega, solo_referencia=False)
    calc = calcular_lectura_entrega(
        grilla,
        body.abscisa,
        body.ordenada,
        body.altura_instrumento,
        body.lectura_mira,
        float(entrega.get("tolerancia_m") or 0.01),
        body.cota_diseno,
    )
    row = (
        supabase.table("topo_entrega_dg_lecturas")
        .insert({
            "entrega_id": entrega_id,
            "orden": body.orden,
            "tramo": calc.get("tramo"),
            "abscisa": body.abscisa,
            "ordenada": body.ordenada,
            "bloque_id": body.bloque_id,
            "altura_instrumento": body.altura_instrumento,
            "lectura_mira": body.lectura_mira,
            "cota_campo": calc.get("cota_campo"),
            "cota_diseno": calc.get("cota_diseno"),
            "cota_rasante": calc.get("cota_rasante"),
            "espesor_diseno_m": calc.get("espesor_diseno_m"),
            "espesor_real_m": body.espesor_real_m,
            "delta": calc.get("delta"),
            "dentro_tolerancia": calc.get("dentro_tolerancia"),
            "notas": body.notas,
        })
        .execute()
        .data
    )
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("topo_entrega_dg").update({"updated_at": now}).eq("id", entrega_id).execute()
    return row[0] if row else {}


@router.delete("/{contrato_id}/entrega-dg/{entrega_id}/lecturas/{lectura_id}")
def eliminar_entrega_dg_lectura(
    contrato_id: int,
    entrega_id: str,
    lectura_id: str,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    entrega = _row("topo_entrega_dg", id=entrega_id, contrato_id=contrato_id)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    _assert_editable(entrega.get("nivel_validacion", 0))
    supabase.table("topo_entrega_dg_lecturas").delete().eq("id", lectura_id).eq("entrega_id", entrega_id).execute()
    return {"ok": True}


@router.post("/{contrato_id}/entrega-dg/{entrega_id}/bloques")
def agregar_entrega_dg_bloque(
    contrato_id: int,
    entrega_id: str,
    body: EntregaDgBloqueBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    entrega = _row("topo_entrega_dg", id=entrega_id, contrato_id=contrato_id)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    _assert_editable(entrega.get("nivel_validacion", 0))
    existentes = (
        supabase.table("topo_entrega_dg_bloques")
        .select("orden")
        .eq("entrega_id", entrega_id)
        .execute()
        .data
        or []
    )
    orden = max((b.get("orden") or 0 for b in existentes), default=0) + 1
    nombre = (body.nombre_punto or "").strip() or f"P{orden}"
    cota_punto = body.cota_punto
    nombre_punto = nombre
    punto_bib_id = body.punto_biblioteca_id
    if punto_bib_id:
        pto = _punto_nivelacion_biblioteca(punto_bib_id, contrato_id)
        nombre_punto = pto.get("nombre") or nombre
        if cota_punto is None and pto.get("cota") is not None:
            cota_punto = float(pto["cota"])
    row = (
        supabase.table("topo_entrega_dg_bloques")
        .insert({
            "entrega_id": entrega_id,
            "orden": orden,
            "abscisa_inicio": body.abscisa_inicio,
            "punto_biblioteca_id": punto_bib_id,
            "nombre_punto": nombre_punto,
            "v_mas": body.v_mas,
            "altura_instrumento": body.altura_instrumento,
            "cota_punto": cota_punto,
        })
        .execute()
        .data
    )
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("topo_entrega_dg").update({"updated_at": now}).eq("id", entrega_id).execute()
    return row[0] if row else {}


@router.patch("/{contrato_id}/entrega-dg/{entrega_id}/bloques/{bloque_id}")
def actualizar_entrega_dg_bloque(
    contrato_id: int,
    entrega_id: str,
    bloque_id: str,
    body: EntregaDgBloqueBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    entrega = _row("topo_entrega_dg", id=entrega_id, contrato_id=contrato_id)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    _assert_editable(entrega.get("nivel_validacion", 0))
    patch: dict[str, Any] = {}
    if body.abscisa_inicio is not None:
        patch["abscisa_inicio"] = body.abscisa_inicio
    if body.punto_biblioteca_id is not None:
        patch["punto_biblioteca_id"] = body.punto_biblioteca_id or None
        if body.punto_biblioteca_id:
            pto = _punto_nivelacion_biblioteca(body.punto_biblioteca_id, contrato_id)
            patch["nombre_punto"] = pto.get("nombre")
            if body.cota_punto is None and pto.get("cota") is not None:
                patch["cota_punto"] = float(pto["cota"])
    if body.nombre_punto is not None:
        patch["nombre_punto"] = body.nombre_punto.strip() or None
    if body.v_mas is not None:
        patch["v_mas"] = body.v_mas
    if body.altura_instrumento is not None:
        patch["altura_instrumento"] = body.altura_instrumento
    if body.cota_punto is not None:
        patch["cota_punto"] = body.cota_punto
    if not patch:
        raise HTTPException(status_code=422, detail="Sin datos para actualizar.")
    row = (
        supabase.table("topo_entrega_dg_bloques")
        .update(patch)
        .eq("id", bloque_id)
        .eq("entrega_id", entrega_id)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Bloque no encontrado")
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("topo_entrega_dg").update({"updated_at": now}).eq("id", entrega_id).execute()
    return row[0]


@router.post("/{contrato_id}/entrega-dg/{entrega_id}/fila-abscisa")
def guardar_entrega_dg_fila_abscisa(
    contrato_id: int,
    entrega_id: str,
    body: EntregaDgFilaBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    _persistir_fila_abscisa_entrega(contrato_id, entrega_id, body)
    return _cargar_entrega_detalle(contrato_id, entrega_id)


@router.post("/{contrato_id}/entrega-dg/{entrega_id}/guardar-cartera")
def guardar_entrega_dg_cartera(
    contrato_id: int,
    entrega_id: str,
    body: EntregaDgCarteraBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    entrega = _row("topo_entrega_dg", id=entrega_id, contrato_id=contrato_id)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    _assert_editable(entrega.get("nivel_validacion", 0))
    for bp in body.bloques:
        patch: dict[str, Any] = {}
        if bp.punto_biblioteca_id is not None:
            patch["punto_biblioteca_id"] = bp.punto_biblioteca_id or None
            if bp.punto_biblioteca_id:
                pto = _punto_nivelacion_biblioteca(bp.punto_biblioteca_id, contrato_id)
                patch["nombre_punto"] = pto.get("nombre")
                if bp.cota_punto is None and pto.get("cota") is not None:
                    patch["cota_punto"] = float(pto["cota"])
        if bp.v_mas is not None:
            patch["v_mas"] = bp.v_mas
        if bp.cota_punto is not None:
            patch["cota_punto"] = bp.cota_punto
        cota_hi = bp.cota_punto if bp.cota_punto is not None else patch.get("cota_punto")
        v_hi = bp.v_mas if bp.v_mas is not None else None
        if bp.altura_instrumento is not None:
            patch["altura_instrumento"] = bp.altura_instrumento
        elif cota_hi is not None and v_hi is not None:
            patch["altura_instrumento"] = float(cota_hi) + float(v_hi)
        if patch:
            supabase.table("topo_entrega_dg_bloques").update(patch).eq("id", bp.id).eq("entrega_id", entrega_id).execute()
    filas_con_datos: list[EntregaDgFilaBody] = []
    for fila in body.filas:
        if not _fila_tiene_lecturas(fila):
            continue
        filas_con_datos.append(fila)
    if filas_con_datos:
        _persistir_cartera_filas_batch(contrato_id, entrega_id, entrega, filas_con_datos)
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("topo_entrega_dg").update({"updated_at": now}).eq("id", entrega_id).execute()
    return _cargar_entrega_detalle(contrato_id, entrega_id)


def _fila_tiene_lecturas(body: EntregaDgFilaBody) -> bool:
    if body.vi_izq is not None or body.vi_eje is not None or body.vi_der is not None:
        return True
    return any(item.vi is not None for item in body.lecturas)


def _grillas_entrega_persistir(
    contrato_id: int,
    entrega: dict,
) -> tuple[Any, ...]:
    ctx = _contexto_entrega_eje(contrato_id, entrega["eje_id"])
    capas = ctx["capas"]
    idx_capa = int(entrega["indice_capa"])
    ras = filtrar_rasante_rango(
        ctx["rasante"],
        entrega.get("abscisa_desde"),
        entrega.get("abscisa_hasta"),
    )
    grilla_full = grilla_entrega_capa(
        ras, ctx["eje"], capas, idx_capa, solo_referencia=False,
    )
    grilla_ref = None
    if not es_entrega_terreno_natural(idx_capa, len(capas)):
        ref_idx = referencia_analisis_indice(capas, idx_capa)
        grilla_ref = (
            grilla_diseno_entrega(ras, ctx["eje"], capas, ref_idx, solo_referencia=False)
            if ref_idx is not None
            else grilla_fondo_terreno_entrega(ras, ctx["eje"], capas)
        )
    return ctx, capas, idx_capa, ras, grilla_full, grilla_ref


def _lecturas_ref_map_persistir(
    contrato_id: int,
    entrega: dict,
    capas: list[dict[str, Any]],
    idx_capa: int,
) -> dict[tuple[float, float], float]:
    m, _ = _lecturas_referencia_campo_entrega(
        contrato_id,
        entrega["eje_id"],
        capas,
        idx_capa,
        excluir_entrega_id=entrega.get("id"),
    )
    return m


def _persistir_cartera_filas_batch(
    contrato_id: int,
    entrega_id: str,
    entrega: dict,
    filas: list[EntregaDgFilaBody],
) -> None:
    _, capas, idx_capa, _, grilla_full, grilla_ref = _grillas_entrega_persistir(contrato_id, entrega)
    lecturas_ref_map = _lecturas_ref_map_persistir(contrato_id, entrega, capas, idx_capa)
    ordenadas_cols = ordenadas_transversales(grilla_full)
    if not ordenadas_cols:
        raise HTTPException(status_code=422, detail="No hay ordenadas transversales en el diseño.")
    bloques = (
        supabase.table("topo_entrega_dg_bloques")
        .select("*")
        .eq("entrega_id", entrega_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    lecturas_actuales = (
        supabase.table("topo_entrega_dg_lecturas")
        .select("id, abscisa, ordenada, orden")
        .eq("entrega_id", entrega_id)
        .execute()
        .data
        or []
    )
    tol = float(entrega.get("tolerancia_m") or 0.01)
    ord_set = {round(float(col["ordenada"]), 4) for col in ordenadas_cols}
    abscisas_pk = {round(float(f.abscisa), 6) for f in filas}

    ids_delete = [
        l["id"]
        for l in lecturas_actuales
        if round(float(l["abscisa"]), 6) in abscisas_pk
        and round(float(l["ordenada"]), 4) in ord_set
    ]
    if ids_delete:
        for i in range(0, len(ids_delete), 100):
            supabase.table("topo_entrega_dg_lecturas").delete().in_("id", ids_delete[i : i + 100]).execute()

    max_orden = max((l.get("orden") or 0 for l in lecturas_actuales), default=0)
    rows_insert: list[dict[str, Any]] = []

    for body in filas:
        bloque = None
        if body.bloque_id:
            bloque = _row("topo_entrega_dg_bloques", id=body.bloque_id, entrega_id=entrega_id)
        if not bloque:
            bloque = bloque_aplicable_abscisa(bloques, body.abscisa) or (bloques[-1] if bloques else None)
        hi = altura_instrumento_desde_bloque(bloque)
        dis = diseno_fila_por_ordenadas(grilla_full, body.abscisa)
        tramo = dis.get("tramo")

        vi_por_ordenada: dict[float, float | None] = {}
        for item in body.lecturas:
            vi_por_ordenada[round(float(item.ordenada), 4)] = item.vi
        if body.vi_izq is not None or body.vi_eje is not None or body.vi_der is not None:
            ordenadas_ref = ordenadas_referencia_izq_eje_der(grilla_full)
            legacy = {"izq": body.vi_izq, "eje": body.vi_eje, "der": body.vi_der}
            for col, vi in legacy.items():
                if vi is None or col not in ordenadas_ref:
                    continue
                vi_por_ordenada[round(float(ordenadas_ref[col]), 4)] = vi

        for col in ordenadas_cols:
            ord_v = col["ordenada"]
            vi = vi_por_ordenada.get(round(float(ord_v), 4))
            if vi is None:
                continue
            max_orden += 1
            pk_ab = round(float(body.abscisa), 6)
            pk_ord = round(float(ord_v), 4)
            cota_ref_campo = cota_campo_ref_interp(lecturas_ref_map, body.abscisa, ord_v)
            calc = calcular_lectura_entrega(
                grilla_full,
                body.abscisa,
                ord_v,
                hi,
                vi,
                tol,
                capas=capas,
                indice_capa=idx_capa,
                grilla_ref=grilla_ref,
                cota_ref_campo=cota_ref_campo,
            )
            rows_insert.append({
                "entrega_id": entrega_id,
                "orden": max_orden,
                "bloque_id": bloque["id"] if bloque else None,
                "tramo": tramo or calc.get("tramo"),
                "abscisa": body.abscisa,
                "ordenada": ord_v,
                "altura_instrumento": hi,
                "lectura_mira": vi,
                "cota_campo": calc.get("cota_campo"),
                "cota_diseno": calc.get("cota_diseno"),
                "cota_rasante": calc.get("cota_rasante"),
                "espesor_diseno_m": calc.get("espesor_diseno_m"),
                "espesor_real_m": calc.get("espesor_real_m"),
                "delta": calc.get("delta"),
                "dentro_tolerancia": calc.get("dentro_tolerancia"),
            })

    if rows_insert:
        for i in range(0, len(rows_insert), 100):
            supabase.table("topo_entrega_dg_lecturas").insert(rows_insert[i : i + 100]).execute()


def _persistir_fila_abscisa_entrega(contrato_id: int, entrega_id: str, body: EntregaDgFilaBody) -> None:
    entrega = _row("topo_entrega_dg", id=entrega_id, contrato_id=contrato_id)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    _assert_editable(entrega.get("nivel_validacion", 0))
    if not _fila_tiene_lecturas(body):
        return
    _persistir_cartera_filas_batch(contrato_id, entrega_id, entrega, [body])
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("topo_entrega_dg").update({"updated_at": now}).eq("id", entrega_id).execute()


@router.post("/{contrato_id}/entrega-dg/{entrega_id}/recalcular")
def recalcular_entrega_dg(contrato_id: int, entrega_id: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    _perm(current_user, "editar")
    entrega = _row("topo_entrega_dg", id=entrega_id, contrato_id=contrato_id)
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")
    _assert_editable(entrega.get("nivel_validacion", 0))
    _, capas, idx_capa, _, grilla_full, grilla_ref = _grillas_entrega_persistir(contrato_id, entrega)
    lecturas_ref_map = _lecturas_ref_map_persistir(contrato_id, entrega, capas, idx_capa)
    tol = float(entrega.get("tolerancia_m") or 0.01)
    bloques = (
        supabase.table("topo_entrega_dg_bloques")
        .select("*")
        .eq("entrega_id", entrega_id)
        .order("orden")
        .execute()
        .data
        or []
    )
    lecturas = (
        supabase.table("topo_entrega_dg_lecturas")
        .select("*")
        .eq("entrega_id", entrega_id)
        .execute()
        .data
        or []
    )
    updates: list[tuple[str, dict]] = []
    for l in lecturas:
        pk_ab = round(float(l["abscisa"]), 6)
        pk_ord = round(float(l["ordenada"]), 4)
        bloque = bloque_aplicable_abscisa(bloques, float(l["abscisa"]))
        hi = altura_instrumento_desde_bloque(bloque)
        if hi is None:
            hi = l.get("altura_instrumento")
        calc = calcular_lectura_entrega(
            grilla_full,
            float(l["abscisa"]),
            float(l["ordenada"]),
            hi,
            l.get("lectura_mira"),
            tol,
            l.get("cota_diseno"),
            capas=capas,
            indice_capa=idx_capa,
            grilla_ref=grilla_ref,
            cota_ref_campo=cota_campo_ref_interp(lecturas_ref_map, float(l["abscisa"]), float(l["ordenada"])),
        )
        updates.append((l["id"], {
            "tramo": calc.get("tramo"),
            "altura_instrumento": hi,
            "cota_campo": calc.get("cota_campo"),
            "cota_diseno": calc.get("cota_diseno"),
            "cota_rasante": calc.get("cota_rasante"),
            "espesor_diseno_m": calc.get("espesor_diseno_m"),
            "espesor_real_m": calc.get("espesor_real_m"),
            "delta": calc.get("delta"),
            "dentro_tolerancia": calc.get("dentro_tolerancia"),
        }))
    for lectura_id, patch in updates:
        supabase.table("topo_entrega_dg_lecturas").update(patch).eq("id", lectura_id).execute()
    return _cargar_entrega_detalle(contrato_id, entrega_id)
