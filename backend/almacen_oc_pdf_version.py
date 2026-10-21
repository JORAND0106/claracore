"""
Regenerar el PDF de una OC ya emitida.

No cambia el número, el proveedor, las cantidades ni los valores. Archiva el PDF
anterior y solo reemplaza el vigente si el total y las cantidades cuadran.
"""
from __future__ import annotations

import logging
from typing import List, Optional

_log = logging.getLogger("claracore.almacen.oc_pdf")


def ruta_pdf_version(contrato_id: int, oc_id: int, nombre: str, version: int) -> str:
    from almacen_service import _safe_filename

    safe = _safe_filename(nombre or f"OC-{oc_id}.pdf")
    return f"almacen-soportes/{int(contrato_id)}/oc-pdf/{int(oc_id)}/v{int(version)}/{safe}"


def campos_pdf_oc(*, blob: str, nombre: str, version: int, proveedor_desactualizado: bool) -> dict:
    """Solo campos de presentación. No toca número, proveedor, cantidades ni valores."""
    return {
        "pdf_blob_path": blob,
        "pdf_nombre": nombre,
        "pdf_version": int(version),
        "pdf_proveedor_desactualizado": bool(proveedor_desactualizado),
    }


def oc_ya_enviada(oc: dict) -> tuple[bool, List[str]]:
    """Documento de sistema no se considera enviado a un proveedor."""
    if oc.get("documento_sistema"):
        return False, []
    dest: List[str] = []
    vistos = set()
    for env in oc.get("envios") or []:
        if (env.get("resultado") or "") != "enviado":
            continue
        correo = (env.get("destinatario") or "").strip()
        if correo and correo not in vistos:
            vistos.add(correo)
            dest.append(correo)
    estado = (oc.get("envio_estado") or "").strip().lower()
    if estado == "enviado":
        for parte in str(oc.get("envio_correo") or "").split(","):
            correo = parte.strip()
            if correo and correo not in vistos:
                vistos.add(correo)
                dest.append(correo)
    return bool(estado == "enviado" or dest), dest


def planificar_version(oc: dict, versiones: List[dict]) -> dict:
    """La versión nueva nunca reutiliza la ruta del PDF que ya está vigente."""
    numeros: List[int] = []
    for fila in versiones or []:
        try:
            numeros.append(int(fila.get("version")))
        except (TypeError, ValueError):
            continue
    blob = (oc.get("pdf_blob_path") or "").strip()
    conocidos = {
        (fila.get("blob_path") or "").strip()
        for fila in (versiones or [])
        if (fila.get("blob_path") or "").strip()
    }
    archivar = None
    if blob and blob not in conocidos:
        n_arch = (max(numeros) + 1) if numeros else 1
        archivar = {
            "version": n_arch,
            "blob_path": blob,
            "nombre": oc.get("pdf_nombre") or "",
        }
        numeros.append(n_arch)
    anterior = max(numeros) if numeros else None
    nueva = (anterior + 1) if anterior else 1
    return {
        "version_anterior": anterior,
        "version_nueva": nueva,
        "archivar": archivar,
    }


def versiones_publicas(filas: List[dict]) -> List[dict]:
    """Sin ruta de almacenamiento ni cifras."""
    out = []
    for fila in filas or []:
        out.append({
            "version": fila.get("version"),
            "vigente": bool(fila.get("vigente")),
            "nombre": fila.get("nombre"),
            "created_at": fila.get("created_at"),
            "reenviado": bool(fila.get("reenviado")),
            "reemplaza_version": fila.get("reemplaza_version"),
        })
    return out


def _registrar(current_user, accion: str, entidad_id, detalle: dict) -> None:
    from almacen_audit import log_almacen

    log_almacen(current_user, accion, "orden_compra", entidad_id, detalle)


def _user_id(current_user) -> Optional[int]:
    try:
        return int((current_user or {}).get("sub") or (current_user or {}).get("id"))
    except (TypeError, ValueError):
        return None


def _leer_versiones(sb, oc_id: int, *, obligatorio: bool) -> List[dict]:
    try:
        rows = (
            sb.table("almacen_orden_compra_pdf")
            .select("id, version, vigente, blob_path, nombre, created_at, reemplaza_version, reenviado")
            .eq("orden_compra_id", int(oc_id))
            .order("version")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if obligatorio:
            _log.warning("No se pudieron leer las versiones del PDF de la OC %s: %s", oc_id, exc)
            raise ValueError(
                "No se pudo consultar las versiones del PDF. No se reemplazó nada."
            ) from exc
        return []
    return rows


def _borrar_version(sb, oc_id: int, version: int) -> None:
    try:
        (
            sb.table("almacen_orden_compra_pdf")
            .delete()
            .eq("orden_compra_id", int(oc_id))
            .eq("version", int(version))
            .execute()
        )
    except Exception:
        _log.warning("No se pudo retirar la versión %s de la OC %s", version, oc_id)


def _guardar_versiones(sb, oc: dict, plan: dict, blob_nuevo: str, nombre: str, user_id, contrato_id: int) -> None:
    tabla = sb.table("almacen_orden_compra_pdf")
    if plan.get("archivar"):
        arch = plan["archivar"]
        tabla.insert({
            "orden_compra_id": int(oc["id"]),
            "contrato_id": int(contrato_id),
            "version": int(arch["version"]),
            "vigente": False,
            "blob_path": arch["blob_path"],
            "nombre": arch.get("nombre") or None,
            "creado_por": user_id,
            "reemplaza_version": None,
            "reenviado": False,
        }).execute()
    sb.table("almacen_orden_compra_pdf").update({"vigente": False}).eq(
        "orden_compra_id", int(oc["id"]),
    ).execute()
    sb.table("almacen_orden_compra_pdf").insert({
        "orden_compra_id": int(oc["id"]),
        "contrato_id": int(contrato_id),
        "version": int(plan["version_nueva"]),
        "vigente": True,
        "blob_path": blob_nuevo,
        "nombre": nombre,
        "creado_por": user_id,
        "reemplaza_version": plan.get("version_anterior"),
        "reenviado": False,
    }).execute()


def _resultado(oc: dict, **extra) -> dict:
    base = {
        "orden_compra_id": oc.get("id"),
        "numero_oc": oc.get("numero_oc"),
        "proveedor_nombre": oc.get("proveedor_nombre"),
        "documento_sistema": bool(oc.get("documento_sistema")),
        "ok": False,
        "motivo": "",
        "version_anterior": None,
        "version_vigente": None,
        "ya_enviada": False,
        "destinatarios": [],
        "proveedor_desactualizado": False,
    }
    base.update(extra)
    return base


def _regenerar_una(contrato_id: int, oc_id: int, current_user) -> dict:
    from almacen_orden_compra_pdf import cuadrar_presentacion_oc
    from almacen_service import (
        _armar_pdf_oc,
        _sb,
        delete_blob_private,
        get_orden_compra,
        get_solicitud,
        upload_blob_private,
    )

    sb = _sb()
    oc = get_orden_compra(int(contrato_id), int(oc_id), incluir_entradas=False)
    sol_id = oc.get("solicitud_id")
    solicitud = get_solicitud(int(contrato_id), int(sol_id), ligera=True) if sol_id else {}
    armado = _armar_pdf_oc(int(contrato_id), int(oc_id), oc, solicitud or {}, _user_id(current_user) or 0)
    cuadre = cuadrar_presentacion_oc(
        oc.get("items") or [],
        armado.get("sol_items") or {},
        armado.get("insumo_map") or {},
    )
    if not cuadre.get("ok"):
        return _resultado(oc, ok=False, motivo=cuadre.get("motivo") or "")
    pdf_bytes = armado.get("pdf_bytes") or b""
    if not pdf_bytes:
        raise ValueError("No se pudo generar el PDF. No se reemplazó nada.")
    versiones = _leer_versiones(sb, oc_id, obligatorio=True)
    plan = planificar_version(oc, versiones)
    nombre = armado.get("nombre") or f"OC-{oc.get('numero_oc') or oc_id}.pdf"
    blob_nuevo = ruta_pdf_version(contrato_id, oc_id, nombre, plan["version_nueva"])
    if blob_nuevo == (oc.get("pdf_blob_path") or ""):
        raise ValueError("No se pudo separar la versión nueva de la anterior. No se reemplazó nada.")
    upload_blob_private(blob_nuevo, pdf_bytes, "application/pdf", overwrite=False)
    enviada, dest = oc_ya_enviada(oc)
    desactualizado = bool(enviada)
    user_id = _user_id(current_user)
    try:
        _guardar_versiones(sb, oc, plan, blob_nuevo, nombre, user_id, int(contrato_id))
        sb.table("almacen_orden_compra").update(campos_pdf_oc(
            blob=blob_nuevo,
            nombre=nombre,
            version=plan["version_nueva"],
            proveedor_desactualizado=desactualizado,
        )).eq("id", int(oc_id)).execute()
    except Exception as exc:
        _log.warning("No se pudo publicar la versión nueva de la OC %s: %s", oc_id, exc)
        try:
            delete_blob_private(blob_nuevo)
        except Exception:
            pass
        _borrar_version(sb, oc_id, plan["version_nueva"])
        if plan.get("archivar"):
            _borrar_version(sb, oc_id, plan["archivar"]["version"])
        raise ValueError(
            "No se pudo guardar la versión del PDF. No se reemplazó el documento vigente."
        ) from exc
    _registrar(
        current_user,
        "REGENERAR_PDF_OC",
        oc_id,
        {
            "numero_oc": oc.get("numero_oc"),
            "version_reemplazada": plan.get("version_anterior"),
            "version_vigente": plan.get("version_nueva"),
            "reenviado": False,
            "documento_sistema": bool(oc.get("documento_sistema")),
        },
    )
    return _resultado(
        oc,
        ok=True,
        version_anterior=plan.get("version_anterior"),
        version_vigente=plan.get("version_nueva"),
        ya_enviada=enviada,
        destinatarios=dest,
        proveedor_desactualizado=desactualizado,
    )


def regenerar_pdfs_solicitud(contrato_id: int, solicitud_id: int, oc_ids: List[int], current_user) -> dict:
    from almacen_service import _fetch_ocs_de_solicitud, _sb

    sb = _sb()
    heads = _fetch_ocs_de_solicitud(sb, int(contrato_id), int(solicitud_id))
    propios = {int(h["id"]) for h in heads if h.get("id")}
    vistos = set()
    resultados = []
    for raw in oc_ids or []:
        try:
            oc_id = int(raw)
        except (TypeError, ValueError):
            continue
        if oc_id in vistos:
            continue
        vistos.add(oc_id)
        if oc_id not in propios:
            resultados.append({
                "orden_compra_id": oc_id,
                "ok": False,
                "motivo": "Esa orden no pertenece a esta solicitud. No se reemplazó nada.",
                "ya_enviada": False,
                "documento_sistema": False,
                "destinatarios": [],
                "proveedor_desactualizado": False,
            })
            continue
        try:
            resultados.append(_regenerar_una(int(contrato_id), oc_id, current_user))
        except ValueError as exc:
            resultados.append({
                "orden_compra_id": oc_id,
                "ok": False,
                "motivo": str(exc),
                "ya_enviada": False,
                "documento_sistema": False,
                "destinatarios": [],
                "proveedor_desactualizado": False,
            })
    return {"resultados": resultados}


def listar_versiones_pdf(contrato_id: int, oc_id: int) -> dict:
    from almacen_service import _sb, get_orden_compra

    oc = get_orden_compra(int(contrato_id), int(oc_id), incluir_entradas=False)
    filas = _leer_versiones(_sb(), int(oc_id), obligatorio=False)
    return {
        "orden_compra_id": oc.get("id"),
        "numero_oc": oc.get("numero_oc"),
        "versiones": versiones_publicas(filas),
    }


def descargar_version_pdf(contrato_id: int, oc_id: int, version: int) -> tuple[bytes, str]:
    from almacen_service import _sb, download_soporte, get_orden_compra

    oc = get_orden_compra(int(contrato_id), int(oc_id), incluir_entradas=False)
    filas = _leer_versiones(_sb(), int(oc_id), obligatorio=True)
    match = None
    for fila in filas:
        try:
            if int(fila.get("version")) == int(version):
                match = fila
                break
        except (TypeError, ValueError):
            continue
    if not match or not match.get("blob_path"):
        raise ValueError("Esa versión del PDF no está disponible.")
    data, _mime = download_soporte(match.get("blob_path"))
    if not data:
        raise ValueError("Esa versión del PDF no está disponible.")
    nombre = (match.get("nombre") or f"OC-{oc.get('numero_oc') or oc_id}.pdf").strip()
    if not nombre.lower().endswith(".pdf"):
        nombre = f"{nombre}.pdf"
    if not match.get("vigente"):
        base = nombre[:-4]
        nombre = f"{base}-v{int(version)}.pdf"
    return data, nombre


def _marcar_desactualizado(sb, oc_id: int, valor: bool) -> None:
    try:
        sb.table("almacen_orden_compra").update({
            "pdf_proveedor_desactualizado": bool(valor),
        }).eq("id", int(oc_id)).execute()
    except Exception as exc:
        _log.warning("No se pudo marcar el PDF desactualizado de la OC %s: %s", oc_id, exc)


def _marcar_version_reenviada(sb, oc_id: int) -> None:
    try:
        sb.table("almacen_orden_compra_pdf").update({"reenviado": True}).eq(
            "orden_compra_id", int(oc_id),
        ).eq("vigente", True).execute()
    except Exception as exc:
        _log.warning("No se pudo marcar el reenvío de la versión vigente de la OC %s: %s", oc_id, exc)


def resolver_reenvio_pdf(
    contrato_id: int,
    oc_id: int,
    current_user,
    *,
    reenviar: bool,
    correo: Optional[str] = None,
) -> dict:
    from almacen_service import _sb, download_soporte, get_orden_compra

    sb = _sb()
    oc = get_orden_compra(int(contrato_id), int(oc_id), incluir_entradas=False)
    enviada, dest = oc_ya_enviada(oc)
    if oc.get("documento_sistema"):
        _registrar(
            current_user, "REGENERAR_PDF_OC_REENVIO", oc_id,
            {
                "numero_oc": oc.get("numero_oc"),
                "version_vigente": oc.get("pdf_version"),
                "reenviado": False,
                "resultado": "sistema",
                "documento_sistema": True,
            },
        )
        return {
            "ok": True,
            "reenviado": False,
            "documento_sistema": True,
            "resultado": "sistema",
            "detalle": "Esta orden es un documento de sistema. No se envía a nadie.",
            "destinatarios": [],
            "numero_oc": oc.get("numero_oc"),
            "proveedor_nombre": oc.get("proveedor_nombre"),
            "proveedor_desactualizado": False,
        }
    if not reenviar:
        queda = bool(enviada or oc.get("pdf_proveedor_desactualizado"))
        if queda:
            _marcar_desactualizado(sb, oc_id, True)
        _registrar(
            current_user, "REGENERAR_PDF_OC_REENVIO", oc_id,
            {
                "numero_oc": oc.get("numero_oc"),
                "version_vigente": oc.get("pdf_version"),
                "reenviado": False,
                "resultado": "omitido",
                "documento_sistema": False,
            },
        )
        detalle = (
            "No se reenvió. El proveedor sigue con la versión anterior del PDF."
            if queda else "No se reenvió."
        )
        return {
            "ok": True,
            "reenviado": False,
            "documento_sistema": False,
            "resultado": "omitido",
            "detalle": detalle,
            "destinatarios": dest,
            "numero_oc": oc.get("numero_oc"),
            "proveedor_nombre": oc.get("proveedor_nombre"),
            "proveedor_desactualizado": queda,
        }
    if not oc.get("pdf_blob_path"):
        return {
            "ok": False,
            "reenviado": False,
            "documento_sistema": False,
            "resultado": "error",
            "detalle": "No hay un PDF vigente para reenviar.",
            "destinatarios": dest,
            "numero_oc": oc.get("numero_oc"),
            "proveedor_nombre": oc.get("proveedor_nombre"),
            "proveedor_desactualizado": True,
        }
    try:
        pdf_bytes, _mime = download_soporte(oc.get("pdf_blob_path"))
    except Exception:
        pdf_bytes = b""
    if not pdf_bytes:
        return {
            "ok": False,
            "reenviado": False,
            "documento_sistema": False,
            "resultado": "error",
            "detalle": "No se pudo leer el PDF vigente. No se reenvió nada.",
            "destinatarios": dest,
            "numero_oc": oc.get("numero_oc"),
            "proveedor_nombre": oc.get("proveedor_nombre"),
            "proveedor_desactualizado": True,
        }
    from almacen_oc_email import enviar_oc_por_correo

    result = enviar_oc_por_correo(
        int(contrato_id),
        int(oc_id),
        _user_id(current_user) or 0,
        correo_override=(correo or "").strip() or None,
        pdf_bytes=pdf_bytes,
        pdf_nombre=oc.get("pdf_nombre"),
    )
    enviado = (result or {}).get("resultado") == "enviado"
    _marcar_desactualizado(sb, oc_id, not enviado)
    if enviado:
        _marcar_version_reenviada(sb, oc_id)
    destinatarios = list((result or {}).get("destinatarios") or [])
    _registrar(
        current_user, "REGENERAR_PDF_OC_REENVIO", oc_id,
        {
            "numero_oc": oc.get("numero_oc"),
            "version_vigente": oc.get("pdf_version"),
            "reenviado": enviado,
            "resultado": (result or {}).get("resultado"),
            "destinatario": ", ".join(destinatarios),
            "documento_sistema": False,
        },
    )
    return {
        "ok": enviado,
        "reenviado": enviado,
        "documento_sistema": False,
        "resultado": (result or {}).get("resultado"),
        "detalle": (result or {}).get("detalle") or "",
        "destinatarios": destinatarios,
        "numero_oc": oc.get("numero_oc"),
        "proveedor_nombre": oc.get("proveedor_nombre"),
        "proveedor_desactualizado": not enviado,
    }
