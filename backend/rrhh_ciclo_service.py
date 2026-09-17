"""
Ciclo laboral RRHH: reingreso, resumen por empresa y alertas de vencimiento.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any, Optional

from rrhh_ciclo_logic import (
    LIST_SELECT_COLS,
    RESUMEN_SELECT_COLS,
    agrupar_por_empresa,
    clasificar_documento_existente,
    debe_alertar_periodo_prueba,
    debe_alertar_vencimiento_10,
    debe_alertar_vencimiento_35,
    fecha_fin_periodo_prueba,
    mensaje_alerta_10,
    mensaje_alerta_35,
    mensaje_alerta_prueba,
    payload_listado,
)
from rrhh_service import _now_iso, _TABLE_TRAB, _uid, get_trabajador, trabajador_display_nombre, update_trabajador
from usuarios_notif_elegibilidad import filtrar_usuarios_para_notificaciones_automaticas

_log = logging.getLogger("claracore.rrhh.ciclo")

_TABLE_ALERTA = "rrhh_alerta_log"
_TABLE_DOCS = "rrhh_trabajador_documentos"
_TABLE_CONTRATOS = "rrhh_contratos_generados"

_CARGOS_ALERTA = frozenset({"desarrollador", "administrador", "administrativo"})


class ReingresoRequerido(Exception):
    def __init__(self, trabajador: dict):
        super().__init__("reingreso")
        self.trabajador = trabajador


class DocumentoActivoDuplicado(Exception):
    def __init__(self):
        super().__init__("Ya existe un colaborador activo con ese documento en este contrato.")


def find_trabajador_por_documento(sb, contrato_id: int, tipo_documento: str, numero_documento: str) -> Optional[dict]:
    tipo = (tipo_documento or "CC").strip().lower()
    num = (numero_documento or "").strip().lower()
    if len(num) < 3:
        return None
    rows = (
        sb.table(_TABLE_TRAB)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .execute()
        .data
        or []
    )
    for r in rows:
        if str(r.get("tipo_documento") or "CC").strip().lower() == tipo and str(r.get("numero_documento") or "").strip().lower() == num:
            return r
    return None


def assert_alta_documento(sb, contrato_id: int, tipo_documento: str, numero_documento: str) -> None:
    existente = find_trabajador_por_documento(sb, contrato_id, tipo_documento, numero_documento)
    kind = clasificar_documento_existente(existente)
    if kind == "reingreso":
        raise ReingresoRequerido(existente)
    if kind == "activo":
        raise DocumentoActivoDuplicado()


def list_trabajadores_liviano(
    sb,
    contrato_id: int,
    *,
    q: Optional[str] = None,
    estado: Optional[str] = None,
    empresa_key: Optional[str] = None,
    limit: int = 80,
    offset: int = 0,
    ver_salario: bool = False,
) -> dict:
    query = (
        sb.table(_TABLE_TRAB)
        .select(LIST_SELECT_COLS)
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .order("apellidos")
        .order("nombres")
    )
    if estado:
        query = query.eq("estado", estado.strip().lower())
    rows = query.execute().data or []
    needle = (q or "").strip().lower()
    if needle:
        rows = [
            r
            for r in rows
            if needle in f"{r.get('nombres') or ''} {r.get('apellidos') or ''}".lower()
            or needle in str(r.get("numero_documento") or "").lower()
            or needle in str(r.get("cargo_aspira") or "").lower()
            or needle in str(r.get("empresa_nombre") or "").lower()
        ]
    if empresa_key:
        from rrhh_ciclo_logic import empresa_key as ek

        rows = [r for r in rows if ek(r) == empresa_key]
    total = len(rows)
    lim = max(1, min(int(limit or 80), 200))
    off = max(0, int(offset or 0))
    page = rows[off : off + lim]
    return {
        "items": [payload_listado(r, ver_salario=ver_salario) for r in page],
        "total": total,
        "limit": lim,
        "offset": off,
    }


def resumen_empresas(sb, contrato_id: int, *, ver_salario: bool) -> dict:
    rows = (
        sb.table(_TABLE_TRAB)
        .select(RESUMEN_SELECT_COLS)
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .execute()
        .data
        or []
    )
    return {"grupos": agrupar_por_empresa(rows, ver_salario=ver_salario), "total": len(rows)}


def sanitizar_trabajador(row: dict, *, ver_salario: bool) -> dict:
    from rrhh_ciclo_logic import ocultar_salario_en_fila

    out = dict(row or {})
    out.pop("firma_blob_path", None)
    if not ver_salario:
        out = ocultar_salario_en_fila(out, False)
    return out


def _marcar_docs_ciclo_anterior(sb, contrato_id: int, trabajador_id: int, current_user) -> None:
    docs = (
        sb.table(_TABLE_DOCS)
        .select("id, categoria")
        .eq("contrato_id", int(contrato_id))
        .eq("trabajador_id", int(trabajador_id))
        .eq("vigente", True)
        .is_("eliminado_en", "null")
        .execute()
        .data
        or []
    )
    for d in docs:
        cat = str(d.get("categoria") or "")
        if cat in ("ingreso", "soporte"):
            sb.table(_TABLE_DOCS).update({"vigente": False}).eq("id", d["id"]).execute()
    vigentes = (
        sb.table(_TABLE_CONTRATOS)
        .select("id")
        .eq("trabajador_id", int(trabajador_id))
        .eq("vigente", True)
        .is_("eliminado_en", "null")
        .execute()
        .data
        or []
    )
    for v in vigentes:
        sb.table(_TABLE_CONTRATOS).update({"vigente": False}).eq("id", v["id"]).execute()


def reingresar_trabajador(sb, contrato_id: int, trabajador_id: int, body: dict, current_user) -> dict:
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    kind = clasificar_documento_existente(trab)
    if kind != "reingreso":
        raise ValueError("El colaborador no está retirado; no aplica reingreso.")
    keep_keys = {
        "eps", "pension", "cesantias", "arl", "caja_compensacion",
        "nombres", "apellidos", "tipo_documento", "numero_documento",
        "fecha_nacimiento", "genero", "lugar_expedicion", "direccion",
        "ciudad", "telefono", "email", "emergencia_nombre",
        "emergencia_parentesco", "emergencia_telefono", "tipo_sangre",
    }
    patch = {k: body[k] for k in keep_keys if k in (body or {})}
    for k in (
        "cargo_aspira", "tipo_contrato", "salario", "salario_liquidable",
        "subsidio_transporte", "periodicidad", "arl_nivel_riesgo",
        "fecha_ingreso", "empresa_key", "empresa_tipo",
        "empresa_subcontratista_id", "empresa_nombre", "empresa_nit",
        "banco_entidad", "banco_tipo_cuenta", "banco_numero_cuenta",
        "requiere_renovacion", "periodicidad_renovacion_meses",
        "periodo_prueba_dias",
    ):
        if k in (body or {}):
            patch[k] = body[k]
    patch["estado"] = "activo"
    patch["fecha_retiro"] = None
    ciclo = int(trab.get("ciclo_documental") or 1) + 1
    patch["ciclo_documental"] = ciclo
    patch["doc_bloqueado"] = False
    patch["doc_validacion_estado"] = "pendiente"
    patch["doc_validacion_observacion"] = None
    patch["doc_consolidado_blob_path"] = None
    patch["doc_consolidado_nombre"] = None
    patch["renovacion_otrosi_at"] = None
    patch["fecha_fin_contrato"] = None
    ini = patch.get("fecha_ingreso") or body.get("fecha_ingreso") or trab.get("fecha_ingreso")
    dias = patch.get("periodo_prueba_dias")
    fin_prueba = fecha_fin_periodo_prueba(ini, dias)
    patch["fecha_fin_periodo_prueba"] = fin_prueba.isoformat() if fin_prueba else None
    updated = update_trabajador(sb, contrato_id, trabajador_id, patch, current_user)
    _marcar_docs_ciclo_anterior(sb, contrato_id, trabajador_id, current_user)
    return get_trabajador(sb, contrato_id, trabajador_id) or updated


def aplicar_campos_ciclo(sb, contrato_id: int, trabajador_id: int, body: dict, current_user) -> dict:
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    patch: dict[str, Any] = {}
    if "requiere_renovacion" in body:
        patch["requiere_renovacion"] = bool(body.get("requiere_renovacion"))
        if not patch["requiere_renovacion"]:
            patch["periodicidad_renovacion_meses"] = None
    if "periodicidad_renovacion_meses" in body:
        raw = body.get("periodicidad_renovacion_meses")
        patch["periodicidad_renovacion_meses"] = int(raw) if raw not in (None, "") else None
    if "periodo_prueba_dias" in body:
        raw = body.get("periodo_prueba_dias")
        dias = int(raw) if raw not in (None, "") else None
        patch["periodo_prueba_dias"] = dias
        ini = body.get("fecha_inicio") or body.get("fecha_ingreso") or trab.get("fecha_ingreso")
        fin = fecha_fin_periodo_prueba(ini, dias)
        patch["fecha_fin_periodo_prueba"] = fin.isoformat() if fin else None
    if "fecha_fin_contrato" in body:
        patch["fecha_fin_contrato"] = (str(body.get("fecha_fin_contrato") or "")[:10] or None)
    if "tipo_contrato" in body and body.get("tipo_contrato"):
        patch["tipo_contrato"] = body.get("tipo_contrato")
    if not patch:
        return trab
    return update_trabajador(sb, contrato_id, trabajador_id, patch, current_user)


def marcar_renovacion_otrosi(sb, contrato_id: int, trabajador_id: int, current_user, fecha_fin: Optional[str] = None) -> dict:
    patch = {"renovacion_otrosi_at": _now_iso()}
    if fecha_fin:
        patch["fecha_fin_contrato"] = str(fecha_fin)[:10]
        trab = get_trabajador(sb, contrato_id, trabajador_id)
        meses = trab.get("periodicidad_renovacion_meses")
        if trab.get("requiere_renovacion") and meses:
            try:
                from datetime import timedelta
                from rrhh_ciclo_logic import _as_date

                fin = _as_date(fecha_fin)
                if fin:
                    patch["fecha_fin_contrato"] = (fin + timedelta(days=int(meses) * 30)).isoformat()
            except Exception:
                pass
    return update_trabajador(sb, contrato_id, trabajador_id, patch, current_user)


def _alerta_ya_enviada(sb, trabajador_id: int, tipo: str, fecha_ref: Optional[date]) -> bool:
    q = (
        sb.table(_TABLE_ALERTA)
        .select("id")
        .eq("trabajador_id", int(trabajador_id))
        .eq("tipo", tipo)
        .limit(1)
    )
    if fecha_ref:
        q = q.eq("fecha_ref", fecha_ref.isoformat())
    rows = q.execute().data or []
    return bool(rows)


def _registrar_alerta(sb, contrato_id: int, trabajador_id: int, tipo: str, fecha_ref: Optional[date]) -> None:
    payload = {
        "contrato_id": int(contrato_id),
        "trabajador_id": int(trabajador_id),
        "tipo": tipo,
        "fecha_ref": fecha_ref.isoformat() if fecha_ref else None,
    }
    try:
        sb.table(_TABLE_ALERTA).insert(payload).execute()
    except Exception as exc:
        _log.debug("alerta log dup: %s", exc)


def _destinatarios_alerta(sb, contrato_id: int) -> list[int]:
    cargos = sb.table("cargos").select("id, nombre").execute().data or []
    ids = []
    for c in cargos:
        nom = str(c.get("nombre") or "").strip().lower()
        if nom in _CARGOS_ALERTA and c.get("id") is not None:
            ids.append(int(c["id"]))
    if not ids:
        return []
    users = (
        sb.table("usuarios")
        .select("id, estado, activo, contrato_id, cargo_id")
        .in_("cargo_id", ids)
        .eq("activo", True)
        .eq("estado", "aprobado")
        .execute()
        .data
        or []
    )
    users = filtrar_usuarios_para_notificaciones_automaticas(users)
    dest = set()
    cid = int(contrato_id)
    for u in users:
        try:
            uid = int(u["id"])
        except (TypeError, ValueError, KeyError):
            continue
        nom_cargo = None
        for c in cargos:
            if int(c.get("id") or 0) == int(u.get("cargo_id") or -1):
                nom_cargo = str(c.get("nombre") or "").strip().lower()
                break
        if nom_cargo == "desarrollador":
            dest.add(uid)
            continue
        if u.get("contrato_id") is not None and int(u["contrato_id"]) == cid:
            dest.add(uid)
    try:
        uc = (
            sb.table("usuario_contratos")
            .select("usuario_id")
            .eq("contrato_id", cid)
            .in_("usuario_id", [int(u["id"]) for u in users if u.get("id") is not None])
            .execute()
            .data
            or []
        )
        for row in uc:
            try:
                dest.add(int(row["usuario_id"]))
            except (TypeError, ValueError, KeyError):
                pass
    except Exception:
        pass
    return sorted(dest)


def _insertar_notif(sb, contrato_id: int, dest_ids: list[int], asunto: str, mensaje: str, entidad_id: str) -> int:
    if not dest_ids:
        return 0
    rows = [
        {
            "remitente_id": None,
            "remitente_nombre": "ClaraCore",
            "destinatario_id": did,
            "asunto": asunto,
            "mensaje": mensaje,
            "tipo": "SISTEMA",
            "modulo": "RRHH",
            "contrato_id": int(contrato_id),
            "entidad_tipo": "rrhh_trabajador",
            "entidad_id": str(entidad_id),
            "leido": False,
        }
        for did in dest_ids
    ]
    batch = 50
    n = 0
    for i in range(0, len(rows), batch):
        sb.table("notificaciones").insert(rows[i : i + batch]).execute()
        n += len(rows[i : i + batch])
    return n


def evaluar_alertas(sb, *, hoy: Optional[date] = None) -> dict:
    hoy = hoy or date.today()
    enviadas = {"vencimiento_35": 0, "vencimiento_10": 0, "periodo_prueba": 0}
    rows = (
        sb.table(_TABLE_TRAB)
        .select(
            "id, contrato_id, nombres, apellidos, estado, tipo_contrato, "
            "fecha_fin_contrato, fecha_fin_periodo_prueba, renovacion_otrosi_at"
        )
        .eq("estado", "activo")
        .is_("eliminado_en", "null")
        .execute()
        .data
        or []
    )
    dest_cache: dict[int, list[int]] = {}
    for trab in rows:
        try:
            cid = int(trab["contrato_id"])
            tid = int(trab["id"])
        except (TypeError, ValueError, KeyError):
            continue
        nombre = trabajador_display_nombre(trab) or "Colaborador"
        tipo = trab.get("tipo_contrato") or ""
        fin = trab.get("fecha_fin_contrato")
        fin_prueba = trab.get("fecha_fin_periodo_prueba")
        tiene_renov = bool(trab.get("renovacion_otrosi_at"))
        dest = dest_cache.get(cid)
        if dest is None:
            dest = _destinatarios_alerta(sb, cid)
            dest_cache[cid] = dest

        from rrhh_ciclo_logic import _as_date

        fin_d = _as_date(fin)
        prueba_d = _as_date(fin_prueba)

        if debe_alertar_vencimiento_35(
            tipo_contrato=tipo, fecha_fin=fin, ya_enviada=_alerta_ya_enviada(sb, tid, "vencimiento_35", fin_d), hoy=hoy
        ):
            asunto, msg = mensaje_alerta_35(nombre, fin)
            _insertar_notif(sb, cid, dest, asunto, msg, str(tid))
            _registrar_alerta(sb, cid, tid, "vencimiento_35", fin_d)
            enviadas["vencimiento_35"] += 1

        if debe_alertar_vencimiento_10(
            tipo_contrato=tipo,
            fecha_fin=fin,
            tiene_renovacion_u_otrosi=tiene_renov,
            ya_enviada=_alerta_ya_enviada(sb, tid, "vencimiento_10", fin_d),
            hoy=hoy,
        ):
            asunto, msg = mensaje_alerta_10(nombre, fin)
            _insertar_notif(sb, cid, dest, asunto, msg, str(tid))
            _registrar_alerta(sb, cid, tid, "vencimiento_10", fin_d)
            enviadas["vencimiento_10"] += 1

        if debe_alertar_periodo_prueba(
            fecha_fin_prueba=fin_prueba,
            ya_enviada=_alerta_ya_enviada(sb, tid, "periodo_prueba", prueba_d),
            hoy=hoy,
        ):
            asunto, msg = mensaje_alerta_prueba(nombre, fin_prueba)
            _insertar_notif(sb, cid, dest, asunto, msg, str(tid))
            _registrar_alerta(sb, cid, tid, "periodo_prueba", prueba_d)
            enviadas["periodo_prueba"] += 1
    return {"ok": True, "enviadas": enviadas, "revisados": len(rows)}
