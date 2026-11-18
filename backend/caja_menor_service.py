"""
Caja Menor por contrato.

No lee ni escribe tablas de Contabilidad. Cada consulta filtra por contrato_id.
El valor que sale de la caja es el neto. Un rechazo lo devuelve al disponible.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from caja_menor_calc import (
    alcanza_80,
    buscar_duplicado,
    dinero,
    documento_valido,
    es_rol_administrador_gerencia,
    fecha_no_futura,
    gastos_que_cuentan,
    hoy_colombia,
    indicadores,
    mensaje_duplicado,
    normalizar_documento,
    puede_cargar,
    puede_validar_estado,
    saldo_a_trasladar,
    siguiente_consecutivo,
    siguiente_numero,
    sugerir_documento,
    todos_validados,
    valor_neto,
)
from caja_menor_email import enlace_caja, enviar_alerta_80
from caja_menor_export import build_excel, build_pdf, bytes_imagen_url, enlace_gasto, fmt_cop
from caja_menor_permissions import es_desarrollador_usuario, require_permiso_caja_menor, tiene_permiso_caja_menor
from caja_menor_texto import formatear_descripcion

_log = logging.getLogger("claracore.caja_menor")

_MSG_API_NO_VE_TABLAS = (
    "Caja Menor no está visible para el API. En Supabase ejecute "
    "backend/sql/caja_menor_grants.sql y vuelva a abrir el módulo."
)
_MSG_FALTA_OBSERVACIONES = (
    "Falta la columna de observaciones del gasto. En Supabase ejecute "
    "backend/migrations/20261118161000_caja_menor_gasto_observaciones.sql "
    "y vuelva a abrir el módulo."
)


def mensaje_falla_datos(exc: Exception) -> str:
    """Traduce el Not Found de PostgREST cuando el rol del API no ve las tablas."""
    partes = [str(exc or "")]
    for attr in ("message", "details", "hint", "code"):
        val = getattr(exc, attr, None)
        if val:
            partes.append(str(val))
    blob = " ".join(partes).lower()
    if "observaciones" in blob and "could not find" in blob:
        return _MSG_FALTA_OBSERVACIONES
    if any(k in blob for k in (
        "pgrst205",
        "schema cache",
        "could not find the table",
        "could not find the ",
        "42p01",
        "does not exist",
        "permission denied",
        "not found",
    )):
        return _MSG_API_NO_VE_TABLAS
    return "No se pudo completar la operación de Caja Menor."

_GASTO_CAMPOS = (
    "fecha",
    "tercero_razon_social",
    "tercero_documento",
    "descripcion",
    "documento_no",
    "centro_costos",
    "valor_bruto",
    "iva",
    "retenciones",
    "impuesto_consumo",
    "otros_deducibles",
    "observaciones",
)


def _rows(res):
    data = getattr(res, "data", None) if res is not None else None
    return list(data or [])


def _first(res):
    rows = _rows(res)
    return rows[0] if rows else None


def _uid(user) -> int:
    try:
        return int(user.get("sub") or user.get("id"))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("Sesión no válida.") from exc


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _path_soporte(contrato_id: int, caja_id: int, kind: str, nombre: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe = re.sub(r"[^\w.\-]", "_", (nombre or "soporte").strip())[:80] or "soporte"
    return f"caja-menor/{int(contrato_id)}/{int(caja_id)}/{kind}/{ts}_{safe}"


class AzureStorage:
    def save(self, contrato_id, caja_id, kind, data, mime, nombre) -> str:
        from azure_blob_storage import upload_blob_private

        path = _path_soporte(contrato_id, caja_id, kind, nombre)
        upload_blob_private(
            path,
            data,
            content_type=mime or "image/jpeg",
            contrato_id=int(contrato_id),
            overwrite=True,
        )
        return path

    def read(self, path: str) -> bytes:
        from azure_blob_storage import download_blob_bytes_private

        return download_blob_bytes_private(path)


def _storage(storage):
    return storage or AzureStorage()


def _contrato(sb, contrato_id: int) -> dict:
    row = _first(
        sb.table("contratos")
        .select("id, numero, contratista, nit, logo_contratista")
        .eq("id", int(contrato_id))
        .limit(1)
        .execute()
    )
    if not row:
        raise ValueError("Contrato no encontrado.")
    return {
        "id": int(row["id"]),
        "numero": str(row.get("numero") or "").strip(),
        "contratista": str(row.get("contratista") or "").strip(),
        "nit": str(row.get("nit") or "").strip(),
        "logo_contratista": str(row.get("logo_contratista") or "").strip(),
    }


def _usuarios_contrato(sb, contrato_id: int) -> list:
    direct = _rows(
        sb.table("usuarios")
        .select("id, nombre, email, rol_id, contrato_id")
        .eq("contrato_id", int(contrato_id))
        .execute()
    )
    ids = {int(r["id"]) for r in direct if r.get("id") is not None}
    extra = []
    try:
        links = _rows(
            sb.table("usuario_contratos")
            .select("usuario_id")
            .eq("contrato_id", int(contrato_id))
            .execute()
        )
    except Exception:
        links = []
    faltan = [
        int(x["usuario_id"])
        for x in links
        if x.get("usuario_id") is not None and int(x["usuario_id"]) not in ids
    ]
    if faltan:
        extra = _rows(
            sb.table("usuarios")
            .select("id, nombre, email, rol_id, contrato_id")
            .in_("id", faltan)
            .execute()
        )
    rol_ids = sorted({int(p["rol_id"]) for p in (direct + extra) if p.get("rol_id") is not None})
    roles = {}
    if rol_ids:
        for r in _rows(sb.table("roles").select("id, nombre").in_("id", rol_ids).execute()):
            roles[int(r["id"])] = r.get("nombre") or ""
    out = []
    vistos = set()
    for p in direct + extra:
        if p.get("id") is None:
            continue
        pid = int(p["id"])
        if pid in vistos:
            continue
        vistos.add(pid)
        out.append({
            "id": pid,
            "nombre": str(p.get("nombre") or "").strip() or "Sin nombre",
            "email": str(p.get("email") or "").strip(),
            "rol": roles.get(int(p["rol_id"])) if p.get("rol_id") is not None else "",
        })
    out.sort(key=lambda x: x["nombre"].lower())
    return out


def _nombre(usuarios: list, usuario_id) -> str:
    for u in usuarios:
        if int(u["id"]) == int(usuario_id):
            return u["nombre"]
    return "Sin nombre"


def _cajas(sb, contrato_id: int) -> list:
    return _rows(
        sb.table("caja_menor").select("*").eq("contrato_id", int(contrato_id)).execute()
    )


def _caja(sb, contrato_id: int, caja_id: int) -> dict:
    row = _first(
        sb.table("caja_menor")
        .select("*")
        .eq("id", int(caja_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
    )
    if not row:
        raise ValueError("Caja no encontrada.")
    return row


def _uid_seguro(user):
    try:
        return _uid(user)
    except Exception:
        return None


def _es_desarrollador_token(user, rol: str, cargo: str) -> bool:
    from caja_menor_permissions import _norm

    if _norm(rol) == "desarrollador" or _norm(cargo) == "desarrollador":
        return True
    if user.get("es_desarrollador") is True or user.get("acceso_total") is True:
        return True
    try:
        return int(user.get("rol_id") or 0) == 1
    except (TypeError, ValueError):
        return False


def _rol_amplio_en_bd(sb, user) -> bool:
    from caja_menor_permissions import _norm

    uid = _uid_seguro(user)
    if uid is None:
        return False
    persona = _first(
        sb.table("usuarios").select("rol_id").eq("id", int(uid)).limit(1).execute()
    )
    if not persona or persona.get("rol_id") is None:
        return False
    role = _first(
        sb.table("roles").select("nombre").eq("id", int(persona["rol_id"])).limit(1).execute()
    )
    nombre = str((role or {}).get("nombre") or "")
    return es_rol_administrador_gerencia(nombre) or _norm(nombre) == "desarrollador"


def _ve_todas_las_cajas(sb, user) -> bool:
    """Administrador y Desarrollador ven las cajas del contrato. Los demás, solo la suya."""
    user = user or {}
    rol = str(user.get("rol_nombre") or user.get("rol") or "")
    cargo = str(user.get("cargo_nombre") or user.get("cargo") or "")
    if es_rol_administrador_gerencia(rol) or _es_desarrollador_token(user, rol, cargo):
        return True
    if _rol_amplio_en_bd(sb, user):
        return True
    if not rol and not cargo:
        return es_desarrollador_usuario(user)
    return False


def _filtro_cajas(sb, user, contrato_id: int):
    if _ve_todas_las_cajas(sb, user):
        return None
    uid = _uid_seguro(user)
    return {
        int(c["id"]) for c in _cajas(sb, contrato_id)
        if uid is not None and int(c.get("responsable_id") or 0) == int(uid)
    }


def _caja_visible(sb, user, contrato_id: int, caja_id: int) -> dict:
    caja = _caja(sb, contrato_id, caja_id)
    if _ve_todas_las_cajas(sb, user):
        return caja
    uid = _uid_seguro(user)
    try:
        propia = uid is not None and int(caja.get("responsable_id")) == int(uid)
    except (TypeError, ValueError):
        propia = False
    if not propia:
        raise ValueError("Caja no encontrada.")
    return caja


def _ingresos(sb, contrato_id: int, caja_id: Optional[int] = None) -> list:
    q = sb.table("caja_menor_ingreso").select("*").eq("contrato_id", int(contrato_id))
    if caja_id is not None:
        q = q.eq("caja_id", int(caja_id))
    return _rows(q.execute())


def _gastos(sb, contrato_id: int, caja_id: Optional[int] = None) -> list:
    q = sb.table("caja_menor_gasto").select("*").eq("contrato_id", int(contrato_id))
    if caja_id is not None:
        q = q.eq("caja_id", int(caja_id))
    return _rows(q.execute())


def _pendientes(sb, contrato_id: int, responsable_id: int) -> list:
    rows = _rows(
        sb.table("caja_menor_saldo_pendiente")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("responsable_id", int(responsable_id))
        .execute()
    )
    return [r for r in rows if not r.get("aplicado_en_caja_id")]


def _acceso(user, contrato_id: int) -> dict:
    from caja_menor_permissions import acceso_caja_menor

    return acceso_caja_menor(user, contrato_id)


def _public_caja(caja: dict, nombre: str, ingresos: list, gastos: list) -> dict:
    ind = indicadores(caja.get("saldo_trasladado"), ingresos, gastos)
    out = dict(caja)
    out["responsable_nombre"] = nombre
    out["indicadores"] = ind
    out["saldo_trasladado"] = ind["saldo_trasladado"]
    return out


def listar_cajas(sb, user, contrato_id: int) -> dict:
    require_permiso_caja_menor(user, "ver", contrato_id)
    contrato = _contrato(sb, contrato_id)
    personas = _usuarios_contrato(sb, contrato_id)
    ingresos = _ingresos(sb, contrato_id)
    gastos = _gastos(sb, contrato_id)
    cajas = []
    propias = _cajas(sb, contrato_id)
    if not _ve_todas_las_cajas(sb, user):
        uid = _uid_seguro(user)
        propias = [
            c for c in propias
            if uid is not None and int(c.get("responsable_id") or 0) == int(uid)
        ]
    for caja in propias:
        cid = int(caja["id"])
        ing = [i for i in ingresos if int(i["caja_id"]) == cid]
        gas = [g for g in gastos if int(g["caja_id"]) == cid]
        cajas.append(_public_caja(caja, _nombre(personas, caja["responsable_id"]), ing, gas))
    cajas.sort(key=lambda c: (str(c.get("responsable_nombre") or ""), int(c.get("numero") or 0)))
    return {"contrato": contrato, "cajas": cajas, "acceso": _acceso(user, contrato_id)}


def listar_responsables(sb, user, contrato_id: int) -> list:
    require_permiso_caja_menor(user, "ver", contrato_id)
    abiertas = {
        int(c["responsable_id"])
        for c in _cajas(sb, contrato_id)
        if c.get("estado") == "abierta"
    }
    todas = _ve_todas_las_cajas(sb, user)
    uid = _uid_seguro(user)
    out = []
    for u in _usuarios_contrato(sb, contrato_id):
        if not todas and int(u["id"]) != int(uid or 0):
            continue
        out.append({**u, "tiene_abierta": u["id"] in abiertas})
    return out


def buscar_tercero(sb, user, contrato_id: int, documento: str) -> dict:
    require_permiso_caja_menor(user, "ver", contrato_id)
    norm = normalizar_documento(documento)
    if not documento_valido(norm):
        return {"encontrado": False}
    row = _first(
        sb.table("caja_menor_tercero")
        .select("documento_display, razon_social")
        .eq("documento_norm", norm)
        .limit(1)
        .execute()
    )
    if not row:
        return {"encontrado": False}
    return {
        "encontrado": True,
        "documento": row.get("documento_display") or documento,
        "razon_social": row.get("razon_social") or "",
    }


def _detalle(sb, user, contrato_id: int, caja_id: int) -> dict:
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    personas = _usuarios_contrato(sb, contrato_id)
    ingresos = sorted(
        [i for i in _ingresos(sb, contrato_id, caja_id)],
        key=lambda r: (str(r.get("fecha") or ""), int(r.get("id") or 0)),
    )
    gastos = sorted(
        [g for g in _gastos(sb, contrato_id, caja_id)],
        key=lambda r: int(r.get("consecutivo") or 0),
    )
    nombre = _nombre(personas, caja["responsable_id"])
    pub = _public_caja(caja, nombre, ingresos, gastos)
    siguiente = siguiente_consecutivo(int(g.get("consecutivo") or 0) for g in gastos)
    for g in gastos:
        g.pop("soporte_blob", None)
    for i in ingresos:
        i.pop("soporte_blob", None)
    return {
        "contrato": _contrato(sb, contrato_id),
        "caja": pub,
        "ingresos": ingresos,
        "gastos": gastos,
        "indicadores": pub["indicadores"],
        "siguiente_consecutivo": siguiente,
        "documento_sugerido": sugerir_documento(int(caja["numero"]), siguiente),
        "acceso": _acceso(user, contrato_id),
        "enlace": enlace_caja(contrato_id, caja_id),
    }


def obtener_caja(sb, user, contrato_id: int, caja_id: int) -> dict:
    require_permiso_caja_menor(user, "ver", contrato_id)
    return _detalle(sb, user, contrato_id, caja_id)


def _usuario_en_contrato(personas, responsable_id: int) -> dict:
    for u in personas:
        if int(u["id"]) == int(responsable_id):
            return u
    raise ValueError("El responsable no pertenece a este contrato.")


def crear_caja(sb, user, contrato_id: int, responsable_id: int) -> dict:
    require_permiso_caja_menor(user, "crear", contrato_id)
    if not _ve_todas_las_cajas(sb, user) and _uid_seguro(user) != int(responsable_id):
        raise ValueError("Solo puede abrir su propia caja menor.")
    personas = _usuarios_contrato(sb, contrato_id)
    responsable = _usuario_en_contrato(personas, responsable_id)
    propias = [
        c for c in _cajas(sb, contrato_id) if int(c["responsable_id"]) == int(responsable_id)
    ]
    if any(c.get("estado") == "abierta" for c in propias):
        raise ValueError("Este responsable ya tiene una caja abierta.")
    numero = siguiente_numero(int(c.get("numero") or 0) for c in propias)
    pendientes = _pendientes(sb, contrato_id, responsable_id)
    saldo = sum(dinero(p.get("saldo")) for p in pendientes)
    ahora = _ahora()
    row = {
        "contrato_id": int(contrato_id),
        "responsable_id": int(responsable_id),
        "numero": numero,
        "estado": "abierta",
        "saldo_trasladado": saldo,
        "alerta_80_enviada": False,
        "observaciones": "",
        "control": "",
        "firma_elaboro": responsable["nombre"],
        "firma_reviso": "",
        "firma_aprobo": "",
        "created_at": ahora,
        "created_by": _uid(user),
    }
    creada = _first(sb.table("caja_menor").insert(row).execute())
    if not creada:
        raise ValueError("No se pudo abrir la caja.")
    for p in pendientes:
        sb.table("caja_menor_saldo_pendiente").update({
            "aplicado_en_caja_id": int(creada["id"]),
            "aplicado_en": ahora,
        }).eq("id", int(p["id"])).execute()
    return _detalle(sb, user, contrato_id, int(creada["id"]))


_META = ("observaciones", "control", "firma_elaboro", "firma_reviso", "firma_aprobo")


def actualizar_caja(sb, user, contrato_id: int, caja_id: int, campos: dict) -> dict:
    require_permiso_caja_menor(user, "editar", contrato_id)
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    if caja.get("estado") == "legalizada":
        raise ValueError("La caja legalizada está bloqueada.")
    patch = {}
    for clave in _META:
        if clave in (campos or {}):
            patch[clave] = str(campos.get(clave) or "").strip()[:2000]
    if not patch:
        return _detalle(sb, user, contrato_id, caja_id)
    patch["updated_at"] = _ahora()
    patch["updated_by"] = _uid(user)
    sb.table("caja_menor").update(patch).eq("id", int(caja_id)).eq("contrato_id", int(contrato_id)).execute()
    return _detalle(sb, user, contrato_id, caja_id)


def _puede_cerrar(user, caja, contrato_id: int) -> bool:
    if es_desarrollador_usuario(user) or tiene_permiso_caja_menor(user, "editar", contrato_id):
        return True
    try:
        return int(user.get("sub")) == int(caja.get("responsable_id"))
    except (TypeError, ValueError):
        return False


def solicitar_cierre(sb, user, contrato_id: int, caja_id: int) -> dict:
    require_permiso_caja_menor(user, "ver", contrato_id)
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    if not _puede_cerrar(user, caja, contrato_id):
        raise ValueError("Solo el responsable o quien edita puede solicitar el cierre.")
    if caja.get("estado") != "abierta":
        raise ValueError("La caja no está abierta.")
    hoy = hoy_colombia().isoformat()
    sb.table("caja_menor").update({
        "estado": "en_legalizacion",
        "periodo_hasta": caja.get("periodo_hasta") or hoy,
        "solicitada_cierre_en": _ahora(),
        "updated_at": _ahora(),
        "updated_by": _uid(user),
    }).eq("id", int(caja_id)).eq("contrato_id", int(contrato_id)).execute()
    gastos = _gastos(sb, contrato_id, caja_id)
    if todos_validados(gastos):
        _legalizar(sb, user, contrato_id, caja_id)
    return _detalle(sb, user, contrato_id, caja_id)


def eliminar_caja(sb, user, contrato_id: int, caja_id: int) -> dict:
    require_permiso_caja_menor(user, "eliminar", contrato_id)
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    if caja.get("estado") != "abierta":
        raise ValueError("Solo se elimina una caja abierta y sin movimientos.")
    if _ingresos(sb, contrato_id, caja_id) or _gastos(sb, contrato_id, caja_id):
        raise ValueError("La caja tiene movimientos.")
    sb.table("caja_menor_saldo_pendiente").update({
        "aplicado_en_caja_id": None,
        "aplicado_en": None,
    }).eq("aplicado_en_caja_id", int(caja_id)).execute()
    sb.table("caja_menor").delete().eq("id", int(caja_id)).eq("contrato_id", int(contrato_id)).execute()
    return {"ok": True}


def _exigir_abierta(caja: dict) -> None:
    if not puede_cargar(caja.get("estado")):
        raise ValueError("La caja no admite cargas.")


def _leer_archivo(archivo) -> tuple:
    if not archivo:
        raise ValueError("Falta la imagen del soporte.")
    data, mime, nombre = archivo
    if not data:
        raise ValueError("Falta la imagen del soporte.")
    mime = (mime or "image/jpeg").split(";")[0].strip().lower()
    if mime not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise ValueError("La imagen debe ser JPG, PNG o WebP.")
    if len(data) > 8_000_000:
        raise ValueError("La imagen supera el tamaño permitido.")
    return data, mime, nombre or "soporte.jpg"


def _periodo_desde(ingresos: list):
    fechas = sorted(str(i.get("fecha"))[:10] for i in ingresos if i.get("fecha"))
    return fechas[0] if fechas else None


def _touch_periodo(sb, contrato_id: int, caja_id: int) -> None:
    desde = _periodo_desde(_ingresos(sb, contrato_id, caja_id))
    sb.table("caja_menor").update({
        "periodo_desde": desde,
        "updated_at": _ahora(),
    }).eq("id", int(caja_id)).eq("contrato_id", int(contrato_id)).execute()


def crear_ingreso(sb, user, contrato_id, caja_id, fecha, valor, archivo, *, storage=None, mailer=None) -> dict:
    require_permiso_caja_menor(user, "crear", contrato_id)
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    _exigir_abierta(caja)
    dia = fecha_no_futura(fecha)
    monto = dinero(valor)
    if monto <= 0:
        raise ValueError("El valor de la consignación debe ser mayor que cero.")
    data, mime, nombre = _leer_archivo(archivo)
    path = _storage(storage).save(contrato_id, caja_id, "ingresos", data, mime, nombre)
    sb.table("caja_menor_ingreso").insert({
        "contrato_id": int(contrato_id),
        "caja_id": int(caja_id),
        "fecha": dia.isoformat(),
        "valor": monto,
        "soporte_blob": path,
        "soporte_nombre": nombre,
        "soporte_mime": mime,
        "created_at": _ahora(),
        "created_by": _uid(user),
    }).execute()
    _touch_periodo(sb, contrato_id, caja_id)
    _revisar_80(sb, user, contrato_id, caja_id, mailer=mailer)
    return _detalle(sb, user, contrato_id, caja_id)


def eliminar_ingreso(sb, user, contrato_id, caja_id, ingreso_id, *, mailer=None) -> dict:
    require_permiso_caja_menor(user, "eliminar", contrato_id)
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    _exigir_abierta(caja)
    row = _first(
        sb.table("caja_menor_ingreso")
        .select("id")
        .eq("id", int(ingreso_id))
        .eq("caja_id", int(caja_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
    )
    if not row:
        raise ValueError("Consignación no encontrada.")
    sb.table("caja_menor_ingreso").delete().eq("id", int(ingreso_id)).eq("contrato_id", int(contrato_id)).execute()
    _touch_periodo(sb, contrato_id, caja_id)
    _revisar_80(sb, user, contrato_id, caja_id, mailer=mailer)
    return _detalle(sb, user, contrato_id, caja_id)


def _upsert_tercero(sb, user, documento: str, razon: str) -> int:
    norm = normalizar_documento(documento)
    if not documento_valido(norm):
        raise ValueError("Indique el NIT o la cédula.")
    razon = str(razon or "").strip()
    if not razon:
        raise ValueError("Indique la razón social.")
    display = str(documento or "").strip()[:40]
    previo = _first(
        sb.table("caja_menor_tercero").select("*").eq("documento_norm", norm).limit(1).execute()
    )
    if previo:
        if str(previo.get("razon_social") or "").strip() != razon or previo.get("documento_display") != display:
            sb.table("caja_menor_tercero").update({
                "razon_social": razon[:200],
                "documento_display": display,
                "updated_at": _ahora(),
                "updated_by": _uid(user),
            }).eq("id", int(previo["id"])).execute()
        return int(previo["id"])
    creado = _first(sb.table("caja_menor_tercero").insert({
        "documento_norm": norm,
        "documento_display": display,
        "razon_social": razon[:200],
        "created_at": _ahora(),
        "created_by": _uid(user),
    }).execute())
    if not creado:
        raise ValueError("No se pudo guardar el tercero.")
    return int(creado["id"])


def _vacio(valor) -> bool:
    return valor is None or (isinstance(valor, str) and not str(valor).strip())


def _armar_gasto(campos: dict, *, centro_defecto: str, numero_caja: int, consecutivo: int) -> dict:
    campos = dict(campos or {})
    if _vacio(campos.get("documento_no")):
        campos["documento_no"] = sugerir_documento(numero_caja, consecutivo)
    if _vacio(campos.get("centro_costos")):
        campos["centro_costos"] = centro_defecto
    texto = ("fecha", "tercero_razon_social", "tercero_documento", "descripcion", "documento_no", "centro_costos")
    for clave in ("iva", "retenciones", "impuesto_consumo", "otros_deducibles"):
        if _vacio(campos.get(clave)):
            campos[clave] = 0
    if any(_vacio(campos.get(c)) for c in texto) or _vacio(campos.get("valor_bruto")):
        raise ValueError("Todos los campos del gasto son obligatorios.")
    if not documento_valido(campos.get("tercero_documento")):
        raise ValueError("Indique el NIT o la cédula.")
    dia = fecha_no_futura(campos.get("fecha"))
    for clave in ("valor_bruto", "iva", "retenciones", "impuesto_consumo", "otros_deducibles"):
        if dinero(campos.get(clave)) < 0:
            raise ValueError("Los valores no pueden ser negativos.")
    neto = valor_neto(
        campos.get("valor_bruto"),
        campos.get("iva"),
        campos.get("retenciones"),
        campos.get("impuesto_consumo"),
        campos.get("otros_deducibles"),
    )
    documento = str(campos.get("documento_no") or "").strip()[:80]
    centro = str(campos.get("centro_costos") or "").strip()[:80]
    return {
        "fecha": dia.isoformat(),
        "tercero_razon_social": str(campos.get("tercero_razon_social") or "").strip()[:200],
        "tercero_documento": str(campos.get("tercero_documento") or "").strip()[:40],
        "documento_norm": normalizar_documento(campos.get("tercero_documento")),
        "descripcion": formatear_descripcion(campos.get("descripcion")),
        "documento_no": documento,
        "centro_costos": centro,
        "valor_bruto": dinero(campos.get("valor_bruto")),
        "iva": dinero(campos.get("iva")),
        "retenciones": dinero(campos.get("retenciones")),
        "impuesto_consumo": dinero(campos.get("impuesto_consumo")),
        "otros_deducibles": dinero(campos.get("otros_deducibles")),
        "valor_neto": neto,
        "observaciones": str(campos.get("observaciones") or "").strip()[:1000],
    }


def _alerta_si_duplicado(sb, contrato_id, campos_gasto, *, excluir_id=None, confirmar=False, cajas_visibles=None):
    if confirmar:
        return None
    existentes = _gastos(sb, contrato_id)
    if cajas_visibles is not None:
        existentes = [g for g in existentes if int(g.get("caja_id") or 0) in cajas_visibles]
    dup = buscar_duplicado(
        existentes,
        campos_gasto["documento_norm"],
        campos_gasto["documento_no"],
        excluir_id=excluir_id,
    )
    if not dup:
        return None
    caja = _first(
        sb.table("caja_menor").select("numero").eq("id", int(dup["caja_id"])).limit(1).execute()
    )
    numero = (caja or {}).get("numero")
    raise DuplicadoCajaMenor(mensaje_duplicado(numero))


class DuplicadoCajaMenor(ValueError):
    """Alerta que no bloquea: el cliente puede reenviar con confirmar_duplicado."""


def crear_gasto(
    sb, user, contrato_id, caja_id, campos, archivo, *,
    confirmar_duplicado=False, storage=None, mailer=None,
) -> dict:
    require_permiso_caja_menor(user, "crear", contrato_id)
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    _exigir_abierta(caja)
    contrato = _contrato(sb, contrato_id)
    gastos = _gastos(sb, contrato_id, caja_id)
    consecutivo = siguiente_consecutivo(int(g.get("consecutivo") or 0) for g in gastos)
    payload = _armar_gasto(
        campos,
        centro_defecto=contrato["numero"],
        numero_caja=int(caja["numero"]),
        consecutivo=consecutivo,
    )
    _alerta_si_duplicado(
        sb, contrato_id, payload, confirmar=confirmar_duplicado,
        cajas_visibles=_filtro_cajas(sb, user, contrato_id),
    )
    data, mime, nombre = _leer_archivo(archivo)
    path = _storage(storage).save(contrato_id, caja_id, "gastos", data, mime, nombre)
    tercero_id = _upsert_tercero(sb, user, payload["tercero_documento"], payload["tercero_razon_social"])
    sb.table("caja_menor_gasto").insert({
        **payload,
        "contrato_id": int(contrato_id),
        "caja_id": int(caja_id),
        "consecutivo": consecutivo,
        "tercero_id": tercero_id,
        "estado_validacion": "pendiente",
        "soporte_blob": path,
        "soporte_nombre": nombre,
        "soporte_mime": mime,
        "created_at": _ahora(),
        "created_by": _uid(user),
    }).execute()
    _revisar_80(sb, user, contrato_id, caja_id, mailer=mailer)
    return _detalle(sb, user, contrato_id, caja_id)


def actualizar_gasto(
    sb, user, contrato_id, caja_id, gasto_id, campos, archivo=None, *,
    confirmar_duplicado=False, storage=None, mailer=None,
) -> dict:
    require_permiso_caja_menor(user, "editar", contrato_id)
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    _exigir_abierta(caja)
    previo = _first(
        sb.table("caja_menor_gasto")
        .select("*")
        .eq("id", int(gasto_id))
        .eq("caja_id", int(caja_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
    )
    if not previo:
        raise ValueError("Gasto no encontrado.")
    if previo.get("estado_validacion") != "pendiente":
        raise ValueError("El gasto ya fue validado.")
    contrato = _contrato(sb, contrato_id)
    base = {k: previo.get(k) for k in _GASTO_CAMPOS}
    base.update({k: v for k, v in (campos or {}).items() if k in _GASTO_CAMPOS and v is not None})
    payload = _armar_gasto(
        base,
        centro_defecto=contrato["numero"],
        numero_caja=int(caja["numero"]),
        consecutivo=int(previo["consecutivo"]),
    )
    _alerta_si_duplicado(
        sb, contrato_id, payload, excluir_id=gasto_id, confirmar=confirmar_duplicado,
        cajas_visibles=_filtro_cajas(sb, user, contrato_id),
    )
    patch = dict(payload)
    patch["tercero_id"] = _upsert_tercero(sb, user, payload["tercero_documento"], payload["tercero_razon_social"])
    patch["updated_at"] = _ahora()
    patch["updated_by"] = _uid(user)
    if archivo:
        data, mime, nombre = _leer_archivo(archivo)
        patch["soporte_blob"] = _storage(storage).save(contrato_id, caja_id, "gastos", data, mime, nombre)
        patch["soporte_nombre"] = nombre
        patch["soporte_mime"] = mime
    sb.table("caja_menor_gasto").update(patch).eq("id", int(gasto_id)).eq("contrato_id", int(contrato_id)).execute()
    _revisar_80(sb, user, contrato_id, caja_id, mailer=mailer)
    return _detalle(sb, user, contrato_id, caja_id)


def eliminar_gasto(sb, user, contrato_id, caja_id, gasto_id, *, mailer=None) -> dict:
    require_permiso_caja_menor(user, "eliminar", contrato_id)
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    _exigir_abierta(caja)
    row = _first(
        sb.table("caja_menor_gasto")
        .select("id, estado_validacion")
        .eq("id", int(gasto_id))
        .eq("caja_id", int(caja_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
    )
    if not row:
        raise ValueError("Gasto no encontrado.")
    sb.table("caja_menor_gasto").delete().eq("id", int(gasto_id)).eq("contrato_id", int(contrato_id)).execute()
    _revisar_80(sb, user, contrato_id, caja_id, mailer=mailer)
    return _detalle(sb, user, contrato_id, caja_id)


def _sin_auditoria_automatica():
    try:
        from auditoria_datos import _en_auditoria

        return _en_auditoria.set(True)
    except Exception:
        return None


def _restaurar_auditoria(token) -> None:
    if token is None:
        return
    try:
        from auditoria_datos import _en_auditoria

        _en_auditoria.reset(token)
    except Exception:
        pass


def _log_validacion(user, contrato, caja, gasto, decision: str, observacion: str) -> None:
    accion = "VALIDAR" if decision == "aprobado" else "RECHAZAR"
    nuevo = "Aprobado" if decision == "aprobado" else "Rechazado"
    campos = [{
        "campo": "estado_validacion",
        "etiqueta": "Validación",
        "anterior": "Pendiente",
        "nuevo": nuevo,
    }]
    if decision == "rechazado":
        campos.append({
            "campo": "observacion_validacion",
            "etiqueta": "Observación",
            "anterior": "—",
            "nuevo": observacion,
        })
    campos.append({
        "campo": "valor_neto",
        "etiqueta": "Valor neto",
        "anterior": str(dinero(gasto.get("valor_neto"))),
        "nuevo": "0" if decision == "rechazado" else str(dinero(gasto.get("valor_neto"))),
    })
    registro = f"Gasto {gasto.get('consecutivo')} · Caja No. {caja.get('numero')}"
    actor = dict(user or {})
    actor["contrato_id"] = int(contrato["id"])
    actor["contrato_numero"] = contrato.get("numero")
    try:
        from main import registrar_log

        registrar_log(
            actor,
            accion,
            "Caja Menor",
            "caja_menor_gasto",
            str(gasto.get("id")),
            {
                "tipo": "modificacion_datos",
                "registro": registro,
                "operacion": accion,
                "campos": campos,
            },
            categoria="datos",
            valor_anterior={c["etiqueta"]: c["anterior"] for c in campos},
            valor_nuevo={c["etiqueta"]: c["nuevo"] for c in campos},
        )
    except Exception:
        _log.debug("log validación caja menor", exc_info=True)


def validar_gasto(
    sb, user, contrato_id, caja_id, gasto_id, decision: str, observacion: str = "",
) -> dict:
    require_permiso_caja_menor(user, "validar", contrato_id)
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    if not puede_validar_estado(caja.get("estado")):
        raise ValueError("La caja no está en legalización.")
    gasto = _first(
        sb.table("caja_menor_gasto")
        .select("*")
        .eq("id", int(gasto_id))
        .eq("caja_id", int(caja_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
    )
    if not gasto:
        raise ValueError("Gasto no encontrado.")
    if gasto.get("estado_validacion") != "pendiente":
        raise ValueError("El gasto ya fue validado.")
    decision = (decision or "").strip().lower()
    if decision not in ("aprobado", "rechazado"):
        raise ValueError("Indique si aprueba o rechaza.")
    nota = str(observacion or "").strip()
    if decision == "rechazado" and not nota:
        raise ValueError("Indique la observación del rechazo.")
    token = _sin_auditoria_automatica()
    try:
        sb.table("caja_menor_gasto").update({
            "estado_validacion": decision,
            "observacion_validacion": nota if decision == "rechazado" else "",
            "validado_por": _uid(user),
            "validado_en": _ahora(),
            "updated_at": _ahora(),
            "updated_by": _uid(user),
        }).eq("id", int(gasto_id)).eq("contrato_id", int(contrato_id)).execute()
    finally:
        _restaurar_auditoria(token)
    contrato = _contrato(sb, contrato_id)
    _log_validacion(user, contrato, caja, gasto, decision, nota)
    gastos = _gastos(sb, contrato_id, caja_id)
    if todos_validados(gastos):
        _legalizar(sb, user, contrato_id, caja_id)
    return _detalle(sb, user, contrato_id, caja_id)


def _legalizar(sb, user, contrato_id: int, caja_id: int) -> None:
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    if caja.get("estado") == "legalizada":
        return
    ingresos = _ingresos(sb, contrato_id, caja_id)
    gastos = _gastos(sb, contrato_id, caja_id)
    ind = indicadores(caja.get("saldo_trasladado"), ingresos, gastos)
    saldo = saldo_a_trasladar(ind)
    ahora = _ahora()
    sb.table("caja_menor").update({
        "estado": "legalizada",
        "legalizada_en": ahora,
        "periodo_hasta": caja.get("periodo_hasta") or hoy_colombia().isoformat(),
        "updated_at": ahora,
        "updated_by": _uid(user),
    }).eq("id", int(caja_id)).eq("contrato_id", int(contrato_id)).execute()
    abierta = [
        c for c in _cajas(sb, contrato_id)
        if int(c["responsable_id"]) == int(caja["responsable_id"])
        and c.get("estado") == "abierta"
        and int(c["id"]) != int(caja_id)
    ]
    if abierta:
        destino = abierta[0]
        sb.table("caja_menor").update({
            "saldo_trasladado": dinero(destino.get("saldo_trasladado")) + saldo,
            "updated_at": ahora,
        }).eq("id", int(destino["id"])).eq("contrato_id", int(contrato_id)).execute()
        sb.table("caja_menor_saldo_pendiente").insert({
            "contrato_id": int(contrato_id),
            "responsable_id": int(caja["responsable_id"]),
            "caja_origen_id": int(caja_id),
            "saldo": saldo,
            "aplicado_en_caja_id": int(destino["id"]),
            "aplicado_en": ahora,
            "created_at": ahora,
        }).execute()
        return
    if saldo != 0:
        sb.table("caja_menor_saldo_pendiente").insert({
            "contrato_id": int(contrato_id),
            "responsable_id": int(caja["responsable_id"]),
            "caja_origen_id": int(caja_id),
            "saldo": saldo,
            "created_at": ahora,
        }).execute()


def _revisar_80(sb, user, contrato_id, caja_id, *, mailer=None) -> None:
    caja = _caja_visible(sb, user, contrato_id, caja_id)
    ingresos = _ingresos(sb, contrato_id, caja_id)
    gastos = _gastos(sb, contrato_id, caja_id)
    ind = indicadores(caja.get("saldo_trasladado"), ingresos, gastos)
    gastados = sum(dinero(g.get("valor_neto")) for g in gastos_que_cuentan(gastos))
    if not alcanza_80(ind["fondo_establecido"], gastados, bool(caja.get("alerta_80_enviada"))):
        return
    personas = _usuarios_contrato(sb, contrato_id)
    admins = [p for p in personas if es_rol_administrador_gerencia(p.get("rol"))]
    responsable = _nombre(personas, caja["responsable_id"])
    enviar = mailer or enviar_alerta_80
    try:
        resultado = enviar(
            [p.get("email") for p in admins],
            responsable=responsable,
            disponible=fmt_cop(ind["disponible"]),
            enlace=enlace_caja(contrato_id, caja_id),
            numero=int(caja.get("numero") or 0),
        )
    except Exception as exc:
        _log.warning("alerta 80 caja %s: %s", caja_id, exc)
        return
    if resultado.get("enviados") or resultado.get("motivo") == "sin_destinatarios":
        sb.table("caja_menor").update({
            "alerta_80_enviada": True,
            "updated_at": _ahora(),
        }).eq("id", int(caja_id)).eq("contrato_id", int(contrato_id)).execute()


def leer_soporte(sb, user, contrato_id, caja_id, kind: str, item_id: int, *, storage=None):
    require_permiso_caja_menor(user, "ver", contrato_id)
    _caja_visible(sb, user, contrato_id, caja_id)
    tabla = "caja_menor_gasto" if kind == "gastos" else "caja_menor_ingreso"
    if kind not in ("gastos", "ingresos"):
        raise ValueError("Soporte no encontrado.")
    row = _first(
        sb.table(tabla)
        .select("soporte_blob, soporte_mime, soporte_nombre")
        .eq("id", int(item_id))
        .eq("caja_id", int(caja_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
    )
    if not row or not row.get("soporte_blob"):
        raise ValueError("Soporte no encontrado.")
    data = _storage(storage).read(row["soporte_blob"])
    return data, row.get("soporte_mime") or "image/jpeg", row.get("soporte_nombre") or "soporte"


def exportar_excel(sb, user, contrato_id, caja_id) -> tuple:
    require_permiso_caja_menor(user, "exportar", contrato_id)
    det = _detalle(sb, user, contrato_id, caja_id)
    enlaces = {
        int(g["id"]): enlace_gasto(contrato_id, caja_id, int(g["id"]))
        for g in det["gastos"]
    }
    # El detalle oculta el blob; los gastos de export se vuelven a leer para el id.
    gastos = sorted(_gastos(sb, contrato_id, caja_id), key=lambda g: int(g.get("consecutivo") or 0))
    data = build_excel(
        caja=det["caja"],
        contrato=det["contrato"],
        ingresos=_ingresos(sb, contrato_id, caja_id),
        gastos=gastos,
        enlace_por_gasto=enlaces,
        logo=bytes_imagen_url(det["contrato"].get("logo_contratista")),
    )
    nombre = f"CajaMenor_{int(det['caja']['numero']):03d}.xlsx"
    return data, nombre


def exportar_pdf(sb, user, contrato_id, caja_id, *, storage=None) -> tuple:
    require_permiso_caja_menor(user, "exportar", contrato_id)
    det = _detalle(sb, user, contrato_id, caja_id)
    gastos = sorted(_gastos(sb, contrato_id, caja_id), key=lambda g: int(g.get("consecutivo") or 0))
    store = _storage(storage)
    preparados = []
    for g in gastos:
        item = dict(g)
        imagen = None
        if g.get("soporte_blob"):
            try:
                imagen = store.read(g["soporte_blob"])
            except Exception:
                imagen = None
        item["imagen"] = imagen
        preparados.append(item)
    data = build_pdf(
        caja=det["caja"],
        contrato=det["contrato"],
        ingresos=_ingresos(sb, contrato_id, caja_id),
        gastos=preparados,
        logo=bytes_imagen_url(det["contrato"].get("logo_contratista")),
    )
    nombre = f"CajaMenor_{int(det['caja']['numero']):03d}_recibos.pdf"
    return data, nombre
