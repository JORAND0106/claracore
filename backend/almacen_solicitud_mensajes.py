"""Buzón de mensajes de una solicitud de Almacén.

Ver exige Almacén · ver. Enviar exige Almacén · crear.
No hay edición ni borrado: cada envío queda en el log de modificaciones.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Dict, List, Optional

_log = logging.getLogger("claracore.almacen.mensajes")

_MONEY_RE = re.compile(
    r"(?:"
    r"\$\s*\d[\d.,]*"
    r"|(?:cop|usd|eur)\s*\d[\d.,]*"
    r"|(?:costo|cobro|utilidad|rentabilidad|precio|valor\s+unitario|vlr\.?\s*unitario)"
    r"(?:\s+\w+){0,4}\s*[:=]?\s*\$?\s*\d[\d.,]*\s*%?"
    r")",
    re.IGNORECASE,
)

_FLAGS = ("ver", "crear", "editar", "eliminar", "validar", "exportar")


def redactar_valores_economicos(texto: str) -> str:
    """Oculta importes en el texto que ve quien no tiene visibilidad económica."""
    if not texto:
        return ""
    return _MONEY_RE.sub("[valor oculto]", str(texto))


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def _ausente(exc: BaseException) -> bool:
    text = str(exc).lower()
    return (
        "pgrst205" in text
        or "42p01" in text
        or "does not exist" in text
        or "schema cache" in text
        or "could not find the table" in text
        or "could not find the" in text and "column" not in text
    )


def _sb():
    from almacen_service import _sb as sb
    return sb()


def _now():
    from almacen_service import _now_iso
    return _now_iso()


def candidatos_almacen(contrato_id: int) -> List[dict]:
    """Usuarios con algún permiso de Almacén en el contrato. Sin interventoría ni supervisión externa."""
    from almacen_permissions import rol_excluido_almacen

    sb = _sb()
    funcs = sb.table("funciones").select("id, nombre").execute().data or []
    fid = None
    for f in funcs:
        if _norm(f.get("nombre") or "") in ("almacen", "almacén"):
            fid = f["id"]
            break
    cargo_ids = set()
    if fid is not None:
        perms = (
            sb.table("permisos")
            .select("cargo_id, contrato_id, ver, crear, editar, eliminar, validar, exportar")
            .eq("funcion_id", fid)
            .execute()
            .data
            or []
        )
        for p in perms:
            pc = p.get("contrato_id")
            if pc is not None and int(pc) != int(contrato_id):
                continue
            if not any(p.get(flag) for flag in _FLAGS):
                continue
            if p.get("cargo_id") is not None:
                cargo_ids.add(int(p["cargo_id"]))

    cargos = sb.table("cargos").select("id, nombre").execute().data or []
    cargo_nombre: Dict[int, str] = {}
    for c in cargos:
        cid = int(c["id"])
        cargo_nombre[cid] = c.get("nombre") or ""
        if _norm(c.get("nombre") or "") == "director de obra":
            cargo_ids.add(cid)
    if not cargo_ids:
        return []

    usuarios = (
        sb.table("usuarios")
        .select("id, nombre, apellidos, cargo_id, rol_id, contrato_id, activo")
        .eq("activo", True)
        .in_("cargo_id", list(cargo_ids))
        .execute()
        .data
        or []
    )
    direct: List[dict] = []
    otros: List[dict] = []
    for u in usuarios:
        uc = u.get("contrato_id")
        if uc is None or int(uc) == int(contrato_id):
            direct.append(u)
        else:
            otros.append(u)
    linked = set()
    if otros:
        ids = [int(u["id"]) for u in otros if u.get("id") is not None]
        for i in range(0, len(ids), 80):
            chunk = ids[i:i + 80]
            rows = (
                sb.table("usuario_contratos")
                .select("usuario_id")
                .eq("contrato_id", int(contrato_id))
                .in_("usuario_id", chunk)
                .execute()
                .data
                or []
            )
            linked.update(int(r["usuario_id"]) for r in rows if r.get("usuario_id") is not None)
    chosen = direct + [u for u in otros if int(u["id"]) in linked]

    rol_ids = sorted({int(u["rol_id"]) for u in chosen if u.get("rol_id") is not None})
    rol_nombre: Dict[int, str] = {}
    if rol_ids:
        for r in (
            sb.table("roles").select("id, nombre").in_("id", rol_ids).execute().data or []
        ):
            rol_nombre[int(r["id"])] = r.get("nombre") or ""

    out: List[dict] = []
    seen = set()
    for u in chosen:
        uid = int(u["id"])
        if uid in seen:
            continue
        rol = rol_nombre.get(int(u["rol_id"])) if u.get("rol_id") is not None else ""
        if rol_excluido_almacen({"rol_nombre": rol}):
            continue
        seen.add(uid)
        nom = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip() or f"Usuario #{uid}"
        cargo = cargo_nombre.get(int(u["cargo_id"])) if u.get("cargo_id") is not None else ""
        out.append({"id": uid, "nombre": nom, "cargo": cargo or ""})
    out.sort(key=lambda x: (_norm(x["nombre"]), _norm(x["cargo"])))
    return out


def buscar_destinatarios_almacen(contrato_id: int, q: str = "", limit: int = 40) -> List[dict]:
    qn = _norm(q)
    items = candidatos_almacen(contrato_id)
    if qn:
        items = [
            u for u in items
            if qn in _norm(u["nombre"]) or qn in _norm(u.get("cargo") or "")
        ]
    return items[: max(1, min(int(limit or 40), 80))]


def contar_mensajes_no_leidos(
    contrato_id: int,
    solicitud_ids: List[int],
    user_id: int,
) -> Dict[int, int]:
    ids = [int(i) for i in solicitud_ids if i]
    if not ids or not user_id:
        return {}
    sb = _sb()
    try:
        rows = (
            sb.table("almacen_solicitud_mensaje_destinatario")
            .select("solicitud_id")
            .eq("contrato_id", int(contrato_id))
            .eq("destinatario_id", int(user_id))
            .is_("leido_at", "null")
            .in_("solicitud_id", ids)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if not _ausente(exc):
            _log.warning("conteo de mensajes no leídos: %s", exc)
        return {}
    out: Dict[int, int] = {}
    for r in rows:
        sid = int(r.get("solicitud_id") or 0)
        if sid:
            out[sid] = out.get(sid, 0) + 1
    return out


def _solicitud_head(sb, contrato_id: int, solicitud_id: int) -> dict:
    rows = (
        sb.table("almacen_solicitud")
        .select("id, contrato_id, consecutivo, estado")
        .eq("id", int(solicitud_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Solicitud no encontrada.")
    return rows[0]


def _etiqueta_linea(it: dict) -> tuple:
    desc = (it.get("descripcion_solicitada") or it.get("material_descripcion") or "").strip()
    numero = it.get("numero_linea")
    if numero and desc:
        etiqueta = f"Línea {numero}: {desc}"
    elif desc:
        etiqueta = desc
    elif numero:
        etiqueta = f"Línea {numero}"
    else:
        etiqueta = "Línea"
    return numero, etiqueta[:180]


def listar_mensajes_solicitud(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    *,
    ver_economicos: bool = True,
) -> dict:
    sb = _sb()
    _solicitud_head(sb, contrato_id, solicitud_id)
    try:
        mensajes = (
            sb.table("almacen_solicitud_mensaje")
            .select("*")
            .eq("solicitud_id", int(solicitud_id))
            .eq("contrato_id", int(contrato_id))
            .order("created_at")
            .order("id")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if _ausente(exc):
            return {"items": [], "mensajes_no_leidos": 0, "disponible": False}
        raise
    if not mensajes:
        return {"items": [], "mensajes_no_leidos": 0, "disponible": True}

    mids = [int(m["id"]) for m in mensajes if m.get("id")]
    dest_rows = (
        sb.table("almacen_solicitud_mensaje_destinatario")
        .select("*")
        .in_("mensaje_id", mids)
        .execute()
        .data
        or []
    )
    por_mensaje: Dict[int, List[dict]] = {}
    marcar = []
    leido_antes: Dict[int, Optional[str]] = {}
    for d in dest_rows:
        mid = int(d["mensaje_id"])
        por_mensaje.setdefault(mid, []).append(d)
        if int(d.get("destinatario_id") or 0) == int(user_id):
            leido_antes[mid] = d.get("leido_at")
            if not d.get("leido_at"):
                marcar.append(mid)
    if marcar:
        try:
            sb.table("almacen_solicitud_mensaje_destinatario").update({
                "leido_at": _now(),
            }).eq("destinatario_id", int(user_id)).in_("mensaje_id", marcar).execute()
        except Exception as exc:
            _log.warning("no se pudieron marcar mensajes leídos: %s", exc)

    items = []
    for m in mensajes:
        mid = int(m["id"])
        dests = por_mensaje.get(mid) or []
        es_dest = mid in leido_antes
        texto = m.get("texto") or ""
        etiqueta = m.get("linea_etiqueta") or ""
        if not ver_economicos:
            texto = redactar_valores_economicos(texto)
            etiqueta = redactar_valores_economicos(etiqueta)
        items.append({
            "id": mid,
            "remitente_id": m.get("remitente_id"),
            "remitente_nombre": m.get("remitente_nombre") or "Usuario",
            "texto": texto,
            "created_at": m.get("created_at"),
            "solicitud_item_id": m.get("solicitud_item_id"),
            "linea_numero": m.get("linea_numero"),
            "linea_etiqueta": etiqueta or None,
            "es_destinatario": es_dest,
            "leido_para_mi": (not es_dest) or bool(leido_antes.get(mid)),
            "destinatarios": [
                {
                    "id": int(d["destinatario_id"]),
                    "nombre": d.get("destinatario_nombre") or f"Usuario #{d.get('destinatario_id')}",
                    "leido": bool(d.get("leido_at")) or (
                        int(d.get("destinatario_id") or 0) == int(user_id) and mid in marcar
                    ),
                }
                for d in dests
            ],
        })
    return {"items": items, "mensajes_no_leidos": 0, "disponible": True}


def _notificar_mensaje(sb, contrato_id, solicitud_id, consecutivo, remitente_id, remitente_nombre, dest_ids) -> None:
    rows = []
    for did in dest_ids:
        if int(did) == int(remitente_id):
            continue
        rows.append({
            "remitente_id": int(remitente_id),
            "remitente_nombre": remitente_nombre or "ClaraCore",
            "destinatario_id": int(did),
            "asunto": f"Mensaje nuevo en solicitud #{consecutivo}",
            "mensaje": (
                f"{remitente_nombre or 'Un usuario'} le escribió en la solicitud de materiales "
                f"#{consecutivo}. Ábrala en Almacén para leer el mensaje."
            ),
            "tipo": "MENSAJE_DIRECTO",
            "modulo": "ALMACEN",
            "contrato_id": int(contrato_id),
            "entidad_tipo": "solicitud",
            "entidad_id": str(solicitud_id),
            "leido": False,
            "oculto_destinatario": False,
            "oculto_remitente": False,
        })
    if not rows:
        return
    try:
        sb.table("notificaciones").insert(rows).execute()
    except Exception as exc:
        _log.warning("aviso de mensaje solicitud %s: %s", solicitud_id, exc)


def enviar_mensaje_solicitud(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    body: dict,
) -> dict:
    sb = _sb()
    sol = _solicitud_head(sb, contrato_id, solicitud_id)
    texto = (body.get("texto") or "").strip()
    if not texto:
        raise ValueError("Escriba el mensaje.")
    if len(texto) > 4000:
        raise ValueError("El mensaje supera el máximo de 4000 caracteres.")
    dest_ids: List[int] = []
    for raw in body.get("destinatario_ids") or []:
        try:
            dest_ids.append(int(raw))
        except (TypeError, ValueError):
            continue
    dest_ids = list(dict.fromkeys(dest_ids))
    if not dest_ids:
        raise ValueError("Elija al menos un destinatario.")

    permitidos = {u["id"]: u for u in candidatos_almacen(contrato_id)}
    invalidos = [i for i in dest_ids if i not in permitidos]
    if invalidos:
        raise ValueError("Uno o más destinatarios no tienen acceso a Almacén en este contrato.")

    from almacen_service import _map_usuario_nombres
    nombres = _map_usuario_nombres(sb, [user_id])
    remitente_nombre = nombres.get(int(user_id)) or permitidos.get(int(user_id), {}).get("nombre") or f"Usuario #{user_id}"

    asunto = (body.get("asunto") or "").strip()
    if asunto and not texto.lower().startswith(asunto.lower()):
        texto = f"{asunto}\n\n{texto}"
        if len(texto) > 4000:
            texto = texto[:4000]

    linea_numero = None
    linea_etiqueta = None
    item_id = body.get("solicitud_item_id")
    if item_id not in (None, "", 0):
        rows = (
            sb.table("almacen_solicitud_item")
            .select("id, solicitud_id, numero_linea, descripcion_solicitada, material_descripcion")
            .eq("id", int(item_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows or int(rows[0].get("solicitud_id") or 0) != int(solicitud_id):
            raise ValueError("La línea no pertenece a esta solicitud.")
        linea_numero, linea_etiqueta = _etiqueta_linea(rows[0])
        item_id = int(item_id)
    else:
        item_id = None
        etiqueta_libre = (body.get("linea_etiqueta") or "").strip()
        if etiqueta_libre:
            linea_etiqueta = etiqueta_libre[:180]

    payload = {
        "contrato_id": int(contrato_id),
        "solicitud_id": int(solicitud_id),
        "solicitud_item_id": item_id,
        "linea_numero": linea_numero,
        "linea_etiqueta": linea_etiqueta,
        "remitente_id": int(user_id),
        "remitente_nombre": remitente_nombre,
        "texto": texto,
    }
    try:
        ins = sb.table("almacen_solicitud_mensaje").insert(payload).execute().data or []
    except Exception as exc:
        if _ausente(exc):
            raise ValueError(
                "El buzón de la solicitud aún no está disponible. Falta aplicar el esquema de mensajes."
            ) from exc
        raise
    if not ins:
        raise ValueError("No se pudo enviar el mensaje.")
    mensaje = ins[0]
    mid = int(mensaje["id"])
    dest_rows = []
    for did in dest_ids:
        u = permitidos[did]
        dest_rows.append({
            "mensaje_id": mid,
            "contrato_id": int(contrato_id),
            "solicitud_id": int(solicitud_id),
            "destinatario_id": did,
            "destinatario_nombre": u["nombre"],
            "leido_at": _now() if did == int(user_id) else None,
        })
    sb.table("almacen_solicitud_mensaje_destinatario").insert(dest_rows).execute()
    _notificar_mensaje(
        sb, contrato_id, solicitud_id, sol.get("consecutivo") or solicitud_id,
        user_id, remitente_nombre, dest_ids,
    )
    return {
        "id": mid,
        "solicitud_id": int(solicitud_id),
        "remitente_id": int(user_id),
        "remitente_nombre": remitente_nombre,
        "texto": texto,
        "created_at": mensaje.get("created_at"),
        "solicitud_item_id": item_id,
        "linea_numero": linea_numero,
        "linea_etiqueta": linea_etiqueta,
        "destinatario_ids": dest_ids,
        "consecutivo": sol.get("consecutivo"),
    }
