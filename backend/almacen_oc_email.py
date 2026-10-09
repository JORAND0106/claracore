"""
Envío del PDF de la orden de compra al correo de la cotización elegida.

Si no hay correo o el envío falla, la OC ya generada queda pendiente de envío.
Cada intento se registra con fecha, destinatario, quién lo disparó y el resultado.
"""
from __future__ import annotations

import logging
import os
import re
import smtplib
from email.message import EmailMessage
from typing import Dict, List, Optional

_log = logging.getLogger("claracore.almacen.oc_email")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def correo_valido(value) -> Optional[str]:
    s = str(value or "").strip()
    if not s or not _EMAIL_RE.match(s):
        return None
    return s


def correo_de_cotizacion(detalle: List[dict], item: dict) -> Optional[str]:
    """
    Correo de la cotización elegida en la línea.
    Si no hay elección, el de la cotización ganadora.
    Si la cotización elegida no tiene correo, no se sustituye por otra.
    """
    filas = [c for c in (detalle or []) if isinstance(c, dict) and (c.get("tipo") or "insumo") == "insumo"]
    if not filas:
        return None
    pid = item.get("proveedor_seleccionado_id")
    numero = str(item.get("cotizacion_numero_seleccionada") or "").strip()
    nombre = str(item.get("proveedor_seleccionado_nombre") or "").strip().casefold()
    hay_eleccion = pid not in (None, "") or bool(numero) or bool(nombre)

    def _score(c: dict) -> int:
        s = 0
        if numero and str(c.get("numero") or "").strip() == numero:
            s += 4
        cpid = c.get("proveedor_id")
        if pid not in (None, ""):
            try:
                if cpid not in (None, "") and int(cpid) == int(pid):
                    s += 2
            except (TypeError, ValueError):
                pass
        if nombre and str(c.get("proveedor") or "").strip().casefold() == nombre:
            s += 1
        return s

    if hay_eleccion:
        ranked = sorted(filas, key=_score, reverse=True)
        if _score(ranked[0]) <= 0:
            return None
        return correo_valido(ranked[0].get("contacto_email"))
    for c in filas:
        if c.get("es_ganadora"):
            return correo_valido(c.get("contacto_email"))
    return correo_valido(filas[0].get("contacto_email"))


def correos_de_lineas(detalle_por_insumo: Dict[int, List[dict]], items: List[dict]) -> List[str]:
    """Correos distintos de las cotizaciones de las líneas de una OC."""
    vistos = []
    for it in items or []:
        iid = it.get("insumo_id")
        detalle: List[dict] = []
        if iid not in (None, ""):
            try:
                detalle = detalle_por_insumo.get(int(iid)) or []
            except (TypeError, ValueError):
                detalle = []
        correo = correo_de_cotizacion(detalle, it)
        if correo and correo.casefold() not in {c.casefold() for c in vistos}:
            vistos.append(correo)
    return vistos


def enviar_pdf_correo(
    destinatario: str,
    subject: str,
    body: str,
    pdf_bytes: bytes,
    pdf_nombre: str,
) -> None:
    """Envía el PDF. Lanza si SMTP no está configurado o el envío falla."""
    host = (os.getenv("CCD_NOTIFY_SMTP_HOST") or "").strip()
    if not host:
        raise RuntimeError("El correo de la plataforma no está configurado.")
    to_addr = correo_valido(destinatario)
    if not to_addr:
        raise RuntimeError("El correo del destinatario no es válido.")
    port = int(os.getenv("CCD_NOTIFY_SMTP_PORT") or "587")
    user = (os.getenv("CCD_NOTIFY_SMTP_USER") or "").strip()
    password = (os.getenv("CCD_NOTIFY_SMTP_PASSWORD") or "").strip()
    from_email = (os.getenv("CCD_NOTIFY_FROM_EMAIL") or user or "").strip()
    if not from_email:
        raise RuntimeError("El correo de la plataforma no está configurado.")
    from_name = (os.getenv("CCD_NOTIFY_FROM_NAME") or "ClaraCore").strip()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_addr
    msg.set_content(body)
    nombre = (pdf_nombre or "orden-de-compra.pdf").strip() or "orden-de-compra.pdf"
    msg.add_attachment(pdf_bytes or b"", maintype="application", subtype="pdf", filename=nombre)
    use_tls = (os.getenv("CCD_NOTIFY_SMTP_TLS", "1").strip().lower() not in ("0", "false", "no"))
    with smtplib.SMTP(host, port, timeout=45) as smtp:
        smtp.ehlo()
        if use_tls:
            smtp.starttls()
            smtp.ehlo()
        if user and password:
            smtp.login(user, password)
        smtp.send_message(msg)


def _ausente(exc: BaseException) -> bool:
    text = str(exc).lower()
    return any(tok in text for tok in (
        "pgrst205", "42p01", "42703", "does not exist", "schema cache", "could not find",
    ))


def _sb():
    from almacen_service import _sb as sb
    return sb()


def _now():
    from almacen_service import _now_iso
    return _now_iso()


def listar_envios_oc(sb, oc_id: int) -> List[dict]:
    try:
        rows = (
            sb.table("almacen_orden_compra_envio")
            .select("id, destinatario, disparado_por, disparado_por_nombre, resultado, detalle, created_at")
            .eq("orden_compra_id", int(oc_id))
            .order("created_at")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if not _ausente(exc):
            _log.warning("No se pudo leer el registro de envío de la OC %s: %s", oc_id, exc)
        return []
    return rows


def _registrar_envio(sb, *, oc_id, contrato_id, destinatario, user_id, nombre, resultado, detalle) -> bool:
    row = {
        "orden_compra_id": int(oc_id),
        "contrato_id": int(contrato_id),
        "destinatario": destinatario or None,
        "disparado_por": int(user_id) if user_id else None,
        "disparado_por_nombre": nombre or None,
        "resultado": resultado,
        "detalle": (detalle or "")[:500] or None,
        "created_at": _now(),
    }
    try:
        sb.table("almacen_orden_compra_envio").insert(row).execute()
        return True
    except Exception as exc:
        if not _ausente(exc):
            _log.warning("No se pudo registrar el envío de la OC %s: %s", oc_id, exc)
        return False


def _marcar_estado_oc(sb, oc_id: int, estado: str, correo: Optional[str]) -> bool:
    data = {"envio_estado": estado, "envio_correo": correo or None}
    omitted = set()
    for _ in range(4):
        body = {k: v for k, v in data.items() if k not in omitted}
        if not body:
            return False
        try:
            sb.table("almacen_orden_compra").update(body).eq("id", int(oc_id)).execute()
            return True
        except Exception as exc:
            text = str(exc).lower()
            col = None
            for key in list(body):
                if key in text:
                    col = key
                    break
            if col:
                omitted.add(col)
                continue
            if _ausente(exc):
                return False
            _log.warning("No se pudo marcar el envío de la OC %s: %s", oc_id, exc)
            return False
    return False


def _contacto_generador(sb, user_id: int) -> dict:
    from almacen_service import _map_usuario_nombres

    nombre = _map_usuario_nombres(sb, [user_id]).get(int(user_id)) if user_id else None
    email = ""
    telefono = ""
    selects = (
        "id, nombre, apellidos, email, telefono",
        "id, nombre, apellidos, email",
    )
    for select in selects:
        try:
            rows = (
                sb.table("usuarios")
                .select(select)
                .eq("id", int(user_id))
                .limit(1)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            if _ausente(exc) and "telefono" in select:
                continue
            rows = []
            break
        if rows:
            u = rows[0]
            if not nombre:
                nombre = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()
            email = (u.get("email") or "").strip()
            telefono = (u.get("telefono") or "").strip()
        break
    return {
        "nombre": nombre or (f"Usuario #{user_id}" if user_id else "Usuario"),
        "email": email,
        "telefono": telefono,
    }


def _contrato_breve(sb, contrato_id: int) -> dict:
    try:
        rows = (
            sb.table("contratos")
            .select("id, numero, objeto, contratista")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        rows = []
    return rows[0] if rows else {}


def _detalle_cotizaciones(sb, insumo_ids: List[int]) -> Dict[int, List[dict]]:
    from catalogo_insumos_service import cotizaciones_detalle_from_row

    ids = sorted({int(x) for x in insumo_ids if x})
    if not ids:
        return {}
    selects = (
        "id, cotizaciones_detalle, cotizacion_numero, cotizacion_fecha, cotizacion_vigencia, proveedor_id",
        "id, cotizaciones_detalle, cotizacion_numero, proveedor_id",
        "id, cotizacion_numero, proveedor_id",
    )
    rows: List[dict] = []
    for select in selects:
        try:
            rows = (
                sb.table("almacen_insumo")
                .select(select)
                .in_("id", ids)
                .execute()
                .data
                or []
            )
            break
        except Exception as exc:
            if not _ausente(exc):
                _log.warning("No se pudieron leer las cotizaciones para el correo: %s", exc)
                return {}
    out: Dict[int, List[dict]] = {}
    for row in rows:
        if not row.get("id"):
            continue
        try:
            out[int(row["id"])] = cotizaciones_detalle_from_row(row)
        except Exception:
            _log.exception("Cotización ilegible del insumo %s", row.get("id"))
    return out


def _items_solicitud_de_oc(sb, oc: dict) -> List[dict]:
    ids = [
        int(it["solicitud_item_id"])
        for it in (oc.get("items") or [])
        if it.get("solicitud_item_id")
    ]
    if not ids:
        return []
    selects = (
        "id, insumo_id, proveedor_seleccionado_id, proveedor_seleccionado_nombre, "
        "cotizacion_numero_seleccionada, cotizacion_seleccionada_id",
        "id, insumo_id, cotizacion_seleccionada_id",
        "id, insumo_id",
    )
    for select in selects:
        try:
            rows = (
                sb.table("almacen_solicitud_item")
                .select(select)
                .in_("id", ids)
                .execute()
                .data
                or []
            )
            break
        except Exception as exc:
            rows = []
            if not _ausente(exc):
                _log.warning("No se pudieron leer las líneas para el correo: %s", exc)
                return []
    else:
        rows = []
    try:
        from almacen_service import _hidratar_proveedor_desde_cotizacion
        _hidratar_proveedor_desde_cotizacion(sb, rows)
    except Exception:
        _log.exception("No se pudo hidratar el proveedor para el correo")
    return rows


def _asunto_cuerpo(oc: dict, contrato: dict, contacto: dict) -> tuple[str, str]:
    numero = oc.get("numero_oc") or oc.get("id")
    contrato_txt = (contrato.get("numero") or "").strip() or f"#{contrato.get('id') or ''}"
    contratista = (contrato.get("contratista") or "").strip()
    objeto = (contrato.get("objeto") or "").strip()
    asunto = f"Orden de compra N.° {numero} — contrato {contrato_txt}"
    contacto_bits = [contacto.get("nombre") or ""]
    if contacto.get("email"):
        contacto_bits.append(contacto["email"])
    if contacto.get("telefono"):
        contacto_bits.append(contacto["telefono"])
    lineas = [
        f"Adjuntamos la orden de compra N.° {numero}.",
        f"Contrato: {contrato_txt}" + (f" — {contratista}" if contratista else ""),
    ]
    if objeto:
        lineas.append(f"Objeto: {objeto}")
    lineas.append("Generada por: " + " · ".join(x for x in contacto_bits if x))
    lineas.append("")
    lineas.append("El archivo adjunto es el PDF de esta orden de compra.")
    return asunto, "\n".join(lineas)


def _resumen(oc: dict, *, resultado: str, detalle: str, destinatarios: List[str], persistido: bool) -> dict:
    return {
        "orden_compra_id": oc.get("id"),
        "numero_oc": oc.get("numero_oc"),
        "proveedor_nombre": oc.get("proveedor_nombre"),
        "resultado": resultado,
        "detalle": detalle,
        "destinatarios": destinatarios,
        "envio_estado": "enviado" if resultado == "enviado" else "pendiente",
        "persistido": persistido,
    }


def enviar_oc_por_correo(
    contrato_id: int,
    oc_id: int,
    user_id: int,
    *,
    correo_override: Optional[str] = None,
    pdf_bytes: Optional[bytes] = None,
    pdf_nombre: Optional[str] = None,
) -> dict:
    """Genera (si hace falta) el PDF y lo envía. La OC no se deshace si el correo falla."""
    from almacen_service import generar_y_guardar_pdf_oc, get_orden_compra, get_solicitud

    sb = _sb()
    oc = get_orden_compra(int(contrato_id), int(oc_id), incluir_entradas=False)
    sol_id = oc.get("solicitud_id")
    solicitud = get_solicitud(int(contrato_id), int(sol_id), ligera=True) if sol_id else {}
    if not pdf_bytes:
        try:
            saved = generar_y_guardar_pdf_oc(
                int(contrato_id), int(oc_id), oc, solicitud or {}, int(user_id),
            )
            pdf_bytes = saved.get("pdf_bytes") or b""
            pdf_nombre = saved.get("pdf_nombre") or pdf_nombre
        except Exception as exc:
            _log.warning("PDF de la OC %s no disponible para el correo: %s", oc_id, exc)
            pdf_bytes = b""
    if not pdf_nombre:
        pdf_nombre = oc.get("pdf_nombre") or f"OC-{oc.get('numero_oc') or oc_id}.pdf"
    contacto = _contacto_generador(sb, int(user_id))
    contrato = _contrato_breve(sb, int(contrato_id))
    asunto, cuerpo = _asunto_cuerpo(oc, contrato, contacto)

    override = correo_valido(correo_override) if correo_override else None
    if correo_override and not override:
        detalle = "El correo indicado no es válido. La orden quedó pendiente de envío."
        ok = _registrar_envio(
            sb, oc_id=oc_id, contrato_id=contrato_id, destinatario=str(correo_override).strip(),
            user_id=user_id, nombre=contacto["nombre"], resultado="error", detalle=detalle,
        )
        marcado = _marcar_estado_oc(sb, oc_id, "pendiente", None)
        return _resumen(oc, resultado="error", detalle=detalle, destinatarios=[], persistido=ok and marcado)

    if override:
        destinatarios = [override]
    else:
        lineas = _items_solicitud_de_oc(sb, oc)
        detalle_map = _detalle_cotizaciones(sb, [it.get("insumo_id") for it in lineas])
        destinatarios = correos_de_lineas(detalle_map, lineas)

    if not destinatarios:
        detalle = (
            "La cotización seleccionada no tiene un correo registrado. "
            "La orden quedó pendiente de envío: puede indicar el correo y reintentar."
        )
        ok = _registrar_envio(
            sb, oc_id=oc_id, contrato_id=contrato_id, destinatario=None,
            user_id=user_id, nombre=contacto["nombre"], resultado="pendiente", detalle=detalle,
        )
        marcado = _marcar_estado_oc(sb, oc_id, "pendiente", None)
        return _resumen(oc, resultado="pendiente", detalle=detalle, destinatarios=[], persistido=ok and marcado)

    if not pdf_bytes:
        detalle = "No se pudo adjuntar el PDF. La orden quedó pendiente de envío."
        ok = _registrar_envio(
            sb, oc_id=oc_id, contrato_id=contrato_id, destinatario=", ".join(destinatarios),
            user_id=user_id, nombre=contacto["nombre"], resultado="error", detalle=detalle,
        )
        marcado = _marcar_estado_oc(sb, oc_id, "pendiente", ", ".join(destinatarios))
        return _resumen(
            oc, resultado="error", detalle=detalle, destinatarios=destinatarios, persistido=ok and marcado,
        )

    enviados: List[str] = []
    fallos: List[str] = []
    persistido = True
    for correo in destinatarios:
        try:
            enviar_pdf_correo(correo, asunto, cuerpo, pdf_bytes, pdf_nombre)
            enviados.append(correo)
            persistido = _registrar_envio(
                sb, oc_id=oc_id, contrato_id=contrato_id, destinatario=correo,
                user_id=user_id, nombre=contacto["nombre"], resultado="enviado",
                detalle="PDF enviado.",
            ) and persistido
        except Exception as exc:
            msg = str(exc).strip() or "No se pudo enviar el correo."
            fallos.append(f"{correo}: {msg}")
            persistido = _registrar_envio(
                sb, oc_id=oc_id, contrato_id=contrato_id, destinatario=correo,
                user_id=user_id, nombre=contacto["nombre"], resultado="error", detalle=msg,
            ) and persistido
    if fallos or not enviados:
        detalle = (
            "La orden quedó pendiente de envío. "
            + ("; ".join(fallos) if fallos else "No se pudo enviar el correo.")
        )
        marcado = _marcar_estado_oc(sb, oc_id, "pendiente", ", ".join(destinatarios))
        return _resumen(
            oc, resultado="error", detalle=detalle, destinatarios=enviados,
            persistido=persistido and marcado,
        )
    marcado = _marcar_estado_oc(sb, oc_id, "enviado", ", ".join(enviados))
    return _resumen(
        oc, resultado="enviado", detalle="PDF enviado.",
        destinatarios=enviados, persistido=persistido and marcado,
    )


def publicar_envios_oc(contrato_id: int, solicitud_id: int, user_id: int, ocs: List[dict]) -> List[dict]:
    """Envía el PDF de cada OC recién generada. Un fallo de correo no revierte la orden."""
    out: List[dict] = []
    for oc in ocs or []:
        if not oc.get("id"):
            continue
        try:
            out.append(enviar_oc_por_correo(int(contrato_id), int(oc["id"]), int(user_id)))
        except Exception as exc:
            _log.exception("Envío de la OC %s: %s", oc.get("id"), exc)
            out.append(_resumen(
                oc, resultado="error",
                detalle=f"La orden quedó pendiente de envío. {exc}",
                destinatarios=[], persistido=False,
            ))
    return out
