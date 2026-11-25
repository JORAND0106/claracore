"""Informes consolidados de asistencia de personal y presencia de maquinaria.

Grilla día×fila con «X» / vacío + PDF/Word landscape (sin firmas).
Reutiliza diarios del rango, paleta/logos HE y festivos CO del calendario.
"""
from __future__ import annotations

import html
import io
import logging
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from bitacora_export_rango import list_diarios_rango
from bitacora_horas_extra_export import (
    EMPRESA_SIN_NOMBRE,
    EMPRESA_TODAS_KEY,
    EMPRESA_TODAS_LABEL,
    _key_empresa,
    _nombre_empresa_asistencia,
    empresas_con_opcion_todas,
    es_empresa_todas,
)
from bitacora_pdf import _palette
from bitacora_service import contrato_meta_bitacora
from prog_obra_calendar import festivos_colombia_año
from topografia_utils import to_pdf_bytes

_log = logging.getLogger("claracore.bitacora.presencia")

CODIGO_ASISTENCIA = "CC-BIT-ASI-001"
TITULO_ASISTENCIA = "INFORME DE ASISTENCIA DE PERSONAL"
VERSION_ASISTENCIA = "1.0"

CODIGO_MAQUINARIA = "CC-BIT-MAQ-001"
TITULO_MAQUINARIA = "INFORME DE PRESENCIA DE MAQUINARIA"
VERSION_MAQUINARIA = "1.0"

# Letter landscape ≈ 28–31 días caben con fuente pequeña + cols fijas.
DIAS_POR_BLOQUE = 28

_INICIAL_WD = ("L", "M", "X", "J", "V", "S", "D")  # lun=0 … dom=6


def _texto_unicode(s: Any) -> str:
    return unicodedata.normalize("NFC", str(s if s is not None else ""))


def _esc(s: Any) -> str:
    return html.escape(_texto_unicode(s), quote=True)


def _parse_rango(fecha_desde: str, fecha_hasta: str) -> Tuple[date, date]:
    d0 = date.fromisoformat(str(fecha_desde)[:10])
    d1 = date.fromisoformat(str(fecha_hasta)[:10])
    if d1 < d0:
        raise ValueError("La fecha fin debe ser posterior o igual a la fecha inicio.")
    if (d1 - d0).days > 366:
        raise ValueError("El periodo no puede superar un año.")
    return d0, d1


def _fechas_periodo(d0: date, d1: date) -> List[date]:
    out: List[date] = []
    cur = d0
    while cur <= d1:
        out.append(cur)
        cur += timedelta(days=1)
    return out


def _es_especial(d: date) -> bool:
    if d.weekday() == 6:
        return True
    return d in festivos_colombia_año(d.year)


def meta_dias(fechas: List[date]) -> List[dict]:
    out = []
    for d in fechas:
        out.append({
            "iso": d.isoformat(),
            "dia": d.day,
            "inicial": _INICIAL_WD[d.weekday()],
            "label": f"{d.day}{_INICIAL_WD[d.weekday()]}",
            "especial": _es_especial(d),
        })
    return out


def _fmt_fecha_es(iso: str) -> str:
    s = str(iso or "").strip()[:10]
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if not m:
        return s or "—"
    return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"


def _persona_key(row: dict) -> str:
    try:
        rid = row.get("rrhh_trabajador_id")
        if rid is not None and str(rid).strip() != "":
            return f"rrhh:{int(rid)}"
    except (TypeError, ValueError):
        pass
    doc = re.sub(r"\D+", "", str(row.get("documento_numero") or ""))
    if doc:
        return f"doc:{doc}"
    nom = str(row.get("nombre") or "").strip().lower()
    return f"nom:{nom}" if nom else ""


def _nombre_completo_rrhh(t: dict) -> str:
    return f"{t.get('nombres') or ''} {t.get('apellidos') or ''}".strip()


def _bloques(dias: List[dict], size: int = DIAS_POR_BLOQUE) -> List[List[dict]]:
    if not dias:
        return [[]]
    return [dias[i:i + size] for i in range(0, len(dias), size)]


# ── Personal ──────────────────────────────────────────────────────────────────

def _empresas_desde_asistencia(diarios: List[dict]) -> Dict[str, str]:
    seen: Dict[str, str] = {}
    for d in diarios or []:
        for a in d.get("asistencia_colaboradores") or []:
            if not isinstance(a, dict):
                continue
            if not str(a.get("nombre") or "").strip():
                continue
            nombre = _nombre_empresa_asistencia(a)
            key = _key_empresa(nombre)
            if key not in seen:
                seen[key] = nombre
    return seen


def _empresas_desde_rrhh(trabajadores: List[dict]) -> Dict[str, str]:
    seen: Dict[str, str] = {}
    for t in trabajadores or []:
        if not isinstance(t, dict):
            continue
        nombre = str(t.get("empresa_nombre") or "").strip() or EMPRESA_SIN_NOMBRE
        key = _key_empresa(nombre)
        if key not in seen:
            seen[key] = nombre
    return seen


def construir_matriz_asistencia(
    sb,
    contrato_id: int,
    *,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: Optional[str] = None,
) -> dict:
    d0, d1 = _parse_rango(fecha_desde, fecha_hasta)
    fechas = _fechas_periodo(d0, d1)
    dias = meta_dias(fechas)
    diarios = list_diarios_rango(sb, contrato_id, fecha_desde, fecha_hasta)

    from rrhh_service import list_trabajadores

    try:
        trabs = list_trabajadores(sb, int(contrato_id)) or []
    except Exception as exc:
        _log.warning("rrhh trabajadores presencia: %s", exc)
        trabs = []

    emp_asist = _empresas_desde_asistencia(diarios)
    emp_rrhh = _empresas_desde_rrhh(trabs)
    merged = {**emp_rrhh, **emp_asist}
    empresas = [
        {"key": k, "nombre": n}
        for k, n in sorted(
            merged.items(),
            key=lambda x: (x[1] == EMPRESA_SIN_NOMBRE, x[1].lower()),
        )
    ]

    todas = es_empresa_todas(empresa_key)
    emp_filtro = None
    if not todas and empresa_key:
        emp_filtro = _key_empresa(empresa_key)
        if emp_filtro == "__sin_empresa__" and not str(empresa_key or "").strip():
            emp_filtro = None

    # Asistencia por día → set de persona_key (filtrada por empresa)
    asist_por_dia: Dict[str, set] = {d.isoformat(): set() for d in fechas}
    # Datos de personas vistas en asistencia
    personas_asist: Dict[str, dict] = {}

    for d in diarios or []:
        fecha = str(d.get("fecha") or "")[:10]
        if fecha not in asist_por_dia:
            continue
        for a in d.get("asistencia_colaboradores") or []:
            if not isinstance(a, dict):
                continue
            nombre = str(a.get("nombre") or "").strip()
            if not nombre:
                continue
            emp_n = _nombre_empresa_asistencia(a)
            if emp_filtro and _key_empresa(emp_n) != emp_filtro:
                continue
            pk = _persona_key(a)
            if not pk:
                continue
            asist_por_dia[fecha].add(pk)
            if pk not in personas_asist:
                personas_asist[pk] = {
                    "key": pk,
                    "nombre": nombre,
                    "documento": re.sub(r"\D+", "", str(a.get("documento_numero") or "")) or "—",
                    "cargo": str(a.get("cargo") or "").strip() or "—",
                    "empresa": emp_n,
                    "empresa_key": _key_empresa(emp_n),
                }

    # Activos RRHH de la empresa
    filas_map: Dict[str, dict] = {}
    for t in trabs:
        if not isinstance(t, dict):
            continue
        if str(t.get("estado") or "").lower() != "activo":
            continue
        emp_n = str(t.get("empresa_nombre") or "").strip() or EMPRESA_SIN_NOMBRE
        if emp_filtro and _key_empresa(emp_n) != emp_filtro:
            continue
        nombre = _nombre_completo_rrhh(t)
        if not nombre:
            continue
        pk = f"rrhh:{int(t['id'])}" if t.get("id") is not None else _persona_key({
            "documento_numero": t.get("numero_documento"),
            "nombre": nombre,
        })
        filas_map[pk] = {
            "key": pk,
            "nombre": nombre,
            "documento": re.sub(r"\D+", "", str(t.get("numero_documento") or "")) or "—",
            "cargo": str(t.get("cargo_aspira") or "").strip() or "—",
            "empresa": emp_n,
            "empresa_key": _key_empresa(emp_n),
        }

    # Agregar quienes asistieron aunque no estén activos
    for pk, info in personas_asist.items():
        if pk not in filas_map:
            doc = info["documento"]
            merged_pk = None
            if doc and doc != "—":
                for k, v in filas_map.items():
                    if v.get("documento") == doc:
                        merged_pk = k
                        break
            if merged_pk:
                for fecha, s in asist_por_dia.items():
                    if pk in s:
                        s.discard(pk)
                        s.add(merged_pk)
            else:
                filas_map[pk] = info

    if not emp_filtro and not todas:
        return {
            "empresas": empresas,
            "dias": dias,
            "filas": [],
            "fecha_desde": d0.isoformat(),
            "fecha_hasta": d1.isoformat(),
        }

    ordered = sorted(
        filas_map.values(),
        key=lambda r: (
            (str(r.get("empresa") or "") == EMPRESA_SIN_NOMBRE) if todas else False,
            str(r.get("empresa") or "").lower() if todas else "",
            str(r.get("cargo") or "").lower(),
            str(r.get("nombre") or "").lower(),
        ),
    )

    filas_out: List[dict] = []
    if not todas:
        for i, r in enumerate(ordered, 1):
            pk = r["key"]
            marcas = []
            total = 0
            for meta in dias:
                ok = pk in asist_por_dia.get(meta["iso"], set())
                marcas.append("X" if ok else "")
                if ok:
                    total += 1
            filas_out.append({
                "tipo": "detalle",
                "no": i,
                "nombre": r["nombre"],
                "documento": r["documento"],
                "cargo": r["cargo"],
                "marcas": marcas,
                "total": total,
                "empresa": r.get("empresa"),
            })
    else:
        no = 0
        tot_dia = [0] * len(dias)
        tot_asist = 0
        i = 0
        while i < len(ordered):
            emp_n = ordered[i].get("empresa") or EMPRESA_SIN_NOMBRE
            emp_k = ordered[i].get("empresa_key") or _key_empresa(emp_n)
            filas_out.append({
                "tipo": "empresa",
                "no": "",
                "nombre": emp_n,
                "documento": "",
                "cargo": "",
                "marcas": [""] * len(dias),
                "total": "",
                "empresa": emp_n,
            })
            emp_dia = [0] * len(dias)
            emp_asist = 0
            while i < len(ordered) and (
                ordered[i].get("empresa_key") or _key_empresa(ordered[i].get("empresa"))
            ) == emp_k:
                r = ordered[i]
                pk = r["key"]
                marcas = []
                total = 0
                for di, meta in enumerate(dias):
                    ok = pk in asist_por_dia.get(meta["iso"], set())
                    marcas.append("X" if ok else "")
                    if ok:
                        total += 1
                        emp_dia[di] += 1
                        tot_dia[di] += 1
                emp_asist += total
                tot_asist += total
                no += 1
                filas_out.append({
                    "tipo": "detalle",
                    "no": no,
                    "nombre": r["nombre"],
                    "documento": r["documento"],
                    "cargo": r["cargo"],
                    "marcas": marcas,
                    "total": total,
                    "empresa": emp_n,
                })
                i += 1
            filas_out.append({
                "tipo": "subtotal_empresa",
                "no": "",
                "nombre": emp_n,
                "documento": "",
                "cargo": "",
                "marcas": [str(c) if c else "" for c in emp_dia],
                "total": emp_asist,
                "empresa": emp_n,
            })
        filas_out.append({
            "tipo": "total",
            "no": "",
            "nombre": "Total general",
            "documento": "",
            "cargo": "",
            "marcas": [str(c) if c else "" for c in tot_dia],
            "total": tot_asist,
        })

    return {
        "empresas": empresas,
        "dias": dias,
        "filas": filas_out,
        "fecha_desde": d0.isoformat(),
        "fecha_hasta": d1.isoformat(),
        "empresa": EMPRESA_TODAS_LABEL if todas else next(
            (e["nombre"] for e in empresas if e["key"] == emp_filtro), empresa_key
        ),
        "empresa_key": EMPRESA_TODAS_KEY if todas else emp_filtro,
    }


# ── Maquinaria ────────────────────────────────────────────────────────────────

def _equipo_key(uso: dict) -> str:
    try:
        eid = uso.get("equipo_id")
        if eid is not None and str(eid).strip() != "":
            return f"eq:{int(eid)}"
    except (TypeError, ValueError):
        pass
    nom = str(uso.get("equipo_nombre") or uso.get("nombre") or "").strip().lower()
    return f"nom:{nom}" if nom else ""


def _empresa_de_operador(uso: dict, rrhh_by_id: Dict[int, dict], rrhh_by_nom: Dict[str, dict]) -> str:
    try:
        oid = uso.get("operador_rrhh_id")
        if oid is not None and str(oid).strip() != "":
            t = rrhh_by_id.get(int(oid))
            if t:
                return str(t.get("empresa_nombre") or "").strip() or EMPRESA_SIN_NOMBRE
    except (TypeError, ValueError):
        pass
    op = str(uso.get("operador") or "").strip().lower()
    if op and op in rrhh_by_nom:
        t = rrhh_by_nom[op]
        return str(t.get("empresa_nombre") or "").strip() or EMPRESA_SIN_NOMBRE
    return EMPRESA_SIN_NOMBRE


def construir_matriz_maquinaria(
    sb,
    contrato_id: int,
    *,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: Optional[str] = None,
) -> dict:
    d0, d1 = _parse_rango(fecha_desde, fecha_hasta)
    fechas = _fechas_periodo(d0, d1)
    dias = meta_dias(fechas)
    diarios = list_diarios_rango(sb, contrato_id, fecha_desde, fecha_hasta)

    from rrhh_service import list_trabajadores

    try:
        trabs = list_trabajadores(sb, int(contrato_id)) or []
    except Exception as exc:
        _log.warning("rrhh maquinaria presencia: %s", exc)
        trabs = []
    rrhh_by_id: Dict[int, dict] = {}
    rrhh_by_nom: Dict[str, dict] = {}
    for t in trabs:
        if not isinstance(t, dict) or t.get("id") is None:
            continue
        try:
            rrhh_by_id[int(t["id"])] = t
        except (TypeError, ValueError):
            continue
        nom = _nombre_completo_rrhh(t).lower()
        if nom:
            rrhh_by_nom[nom] = t

    # equipos_uso → presencia por día + meta + empresas
    presencia: Dict[str, set] = {}  # eq_key → set iso
    meta_eq: Dict[str, dict] = {}
    emp_por_eq: Dict[str, set] = {}  # eq_key → set empresa keys vistas
    empresas_seen: Dict[str, str] = {}

    for d in diarios or []:
        fecha = str(d.get("fecha") or "")[:10]
        if fecha not in {x.isoformat() for x in fechas}:
            continue
        for u in d.get("equipos_uso") or []:
            if not isinstance(u, dict):
                continue
            nombre = str(u.get("equipo_nombre") or u.get("nombre") or "").strip()
            if not nombre:
                continue
            ek = _equipo_key(u)
            if not ek:
                continue
            emp_n = _empresa_de_operador(u, rrhh_by_id, rrhh_by_nom)
            emp_k = _key_empresa(emp_n)
            empresas_seen.setdefault(emp_k, emp_n)
            presencia.setdefault(ek, set()).add(fecha)
            emp_por_eq.setdefault(ek, set()).add(emp_k)
            if ek not in meta_eq:
                ident = ""
                try:
                    if u.get("equipo_id") is not None:
                        ident = str(int(u["equipo_id"]))
                except (TypeError, ValueError):
                    ident = str(u.get("equipo_id") or "").strip()
                meta_eq[ek] = {
                    "key": ek,
                    "nombre": nombre,
                    "identificacion": ident or "—",
                    "tipo": str(u.get("tipo") or "equipo").strip() or "equipo",
                }

    empresas = [
        {"key": k, "nombre": n}
        for k, n in sorted(
            empresas_seen.items(),
            key=lambda x: (x[1] == EMPRESA_SIN_NOMBRE, x[1].lower()),
        )
    ]

    todas = es_empresa_todas(empresa_key)
    emp_filtro = None
    if not todas and empresa_key:
        emp_filtro = _key_empresa(empresa_key)
        if emp_filtro == "__sin_empresa__" and not str(empresa_key or "").strip():
            emp_filtro = None

    if not emp_filtro and not todas:
        return {
            "empresas": empresas,
            "dias": dias,
            "filas": [],
            "fecha_desde": d0.isoformat(),
            "fecha_hasta": d1.isoformat(),
        }

    # Asignar cada equipo a una empresa primaria (primera clave ordenada)
    filas_src = []  # (emp_key, emp_nombre, meta, dias_ok)
    for ek, meta in meta_eq.items():
        emps_eq = sorted(emp_por_eq.get(ek) or [])
        if not emps_eq:
            continue
        dias_ok = presencia.get(ek) or set()
        if not dias_ok:
            continue
        if todas:
            # Una empresa primaria por equipo (evita doble conteo en totales)
            ek_emp = emps_eq[0]
            filas_src.append((
                ek_emp,
                empresas_seen.get(ek_emp, EMPRESA_SIN_NOMBRE),
                meta,
                dias_ok,
            ))
        else:
            if emp_filtro not in emps_eq:
                continue
            filas_src.append((
                emp_filtro,
                empresas_seen.get(emp_filtro, EMPRESA_SIN_NOMBRE),
                meta,
                dias_ok,
            ))

    filas_src.sort(key=lambda x: (
        x[1] == EMPRESA_SIN_NOMBRE,
        x[1].lower(),
        str(x[2].get("tipo") or "").lower(),
        str(x[2].get("nombre") or "").lower(),
    ))

    filas_out: List[dict] = []
    if not todas:
        for i, (_ek, _en, meta, dias_ok) in enumerate(filas_src, 1):
            marcas = []
            total = 0
            for md in dias:
                ok = md["iso"] in dias_ok
                marcas.append("X" if ok else "")
                if ok:
                    total += 1
            # `tipo` = tipo de equipo (compat FE/PDF existentes)
            filas_out.append({
                "no": i,
                "nombre": meta["nombre"],
                "identificacion": meta["identificacion"],
                "tipo": meta["tipo"],
                "tipo_equipo": meta["tipo"],
                "marcas": marcas,
                "total": total,
            })
    else:
        no = 0
        tot_dia = [0] * len(dias)
        tot_pres = 0
        i = 0
        while i < len(filas_src):
            emp_k, emp_n = filas_src[i][0], filas_src[i][1]
            filas_out.append({
                "tipo": "empresa",
                "no": "",
                "nombre": emp_n,
                "identificacion": "",
                "tipo_equipo": "",
                "marcas": [""] * len(dias),
                "total": "",
                "empresa": emp_n,
            })
            emp_dia = [0] * len(dias)
            emp_pres = 0
            while i < len(filas_src) and filas_src[i][0] == emp_k:
                _ek, _en, meta, dias_ok = filas_src[i]
                marcas = []
                total = 0
                for di, md in enumerate(dias):
                    ok = md["iso"] in dias_ok
                    marcas.append("X" if ok else "")
                    if ok:
                        total += 1
                        emp_dia[di] += 1
                        tot_dia[di] += 1
                emp_pres += total
                tot_pres += total
                no += 1
                filas_out.append({
                    "tipo": "detalle",
                    "no": no,
                    "nombre": meta["nombre"],
                    "identificacion": meta["identificacion"],
                    "tipo_equipo": meta["tipo"],
                    "marcas": marcas,
                    "total": total,
                    "empresa": emp_n,
                })
                i += 1
            filas_out.append({
                "tipo": "subtotal_empresa",
                "no": "",
                "nombre": emp_n,
                "identificacion": "",
                "tipo_equipo": "",
                "marcas": [str(c) if c else "" for c in emp_dia],
                "total": emp_pres,
                "empresa": emp_n,
            })
        filas_out.append({
            "tipo": "total",
            "no": "",
            "nombre": "Total general",
            "identificacion": "",
            "tipo_equipo": "",
            "marcas": [str(c) if c else "" for c in tot_dia],
            "total": tot_pres,
        })

    return {
        "empresas": empresas,
        "dias": dias,
        "filas": filas_out,
        "fecha_desde": d0.isoformat(),
        "fecha_hasta": d1.isoformat(),
        "empresa": EMPRESA_TODAS_LABEL if todas else next(
            (e["nombre"] for e in empresas if e["key"] == emp_filtro), empresa_key
        ),
        "empresa_key": EMPRESA_TODAS_KEY if todas else emp_filtro,
    }


# ── Opciones / export ─────────────────────────────────────────────────────────

def opciones_informe_presencia(
    sb,
    contrato_id: int,
    *,
    tipo: str,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: Optional[str] = None,
) -> dict:
    tipo_l = str(tipo or "").strip().lower()
    if tipo_l not in ("personal", "maquinaria"):
        raise ValueError("Tipo de informe inválido (personal | maquinaria).")
    if tipo_l == "personal":
        data = construir_matriz_asistencia(
            sb, contrato_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            empresa_key=empresa_key,
        )
        fmt = {
            "codigo": CODIGO_ASISTENCIA,
            "version": VERSION_ASISTENCIA,
            "titulo": TITULO_ASISTENCIA,
        }
    else:
        data = construir_matriz_maquinaria(
            sb, contrato_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            empresa_key=empresa_key,
        )
        fmt = {
            "codigo": CODIGO_MAQUINARIA,
            "version": VERSION_MAQUINARIA,
            "titulo": TITULO_MAQUINARIA,
        }
    return {
        "tipo": tipo_l,
        "empresas": empresas_con_opcion_todas(data.get("empresas") or []),
        "dias": data.get("dias") or [],
        "filas": data.get("filas") or [],
        "fecha_desde": data.get("fecha_desde"),
        "fecha_hasta": data.get("fecha_hasta"),
        "empresa": data.get("empresa"),
        "empresa_key": data.get("empresa_key"),
        "empresa_todas_key": EMPRESA_TODAS_KEY,
        "empresa_todas_label": EMPRESA_TODAS_LABEL,
        "formato": fmt,
    }


def _payload_informe(
    sb,
    contrato_id: int,
    *,
    tipo: str,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: str,
) -> dict:
    opts = opciones_informe_presencia(
        sb, contrato_id,
        tipo=tipo,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        empresa_key=empresa_key,
    )
    if not opts.get("filas"):
        raise ValueError(
            "No hay datos para la empresa y el periodo seleccionados."
        )
    contrato = contrato_meta_bitacora(sb, int(contrato_id)) or {}
    return {
        "tipo": opts["tipo"],
        "contrato": contrato,
        "empresa": opts.get("empresa") or empresa_key,
        "fecha_desde": opts["fecha_desde"],
        "fecha_hasta": opts["fecha_hasta"],
        "dias": opts["dias"],
        "filas": opts["filas"],
        "formato": opts["formato"],
    }


def _logo_html(contrato: dict, t1: dict) -> str:
    logo_uri = ""
    try:
        from pdf_institucional import prepare_image_for_pdf
        raw = str(contrato.get("logo_contratista") or "").strip()
        if raw:
            logo_uri = prepare_image_for_pdf(
                raw, max_px_w=120, max_px_h=56, allow_http=True,
            ) or ""
    except Exception as exc:
        _log.debug("logo presencia: %s", exc)
    if logo_uri:
        return (
            f'<img src="{_esc(logo_uri)}" width="90" height="42" '
            f'style="width:90pt;height:42pt;" alt="Logo"/>'
        )
    return (
        f'<div style="font-size:9pt;font-weight:bold;color:{t1["text"]};">'
        f'{_esc(contrato.get("contratista") or "ClaraCore")}</div>'
    )


def _piezas_presencia(payload: dict) -> dict:
    contrato = payload.get("contrato") or {}
    pal = _palette(contrato)
    t1 = pal.get("titulo_1") or {"bg": "#0077B6", "text": "#FFFFFF"}
    t2 = pal.get("titulo_2") or {"bg": "#E5F4FA", "text": "#1F4E70"}
    fmt = payload.get("formato") or {}
    dias: List[dict] = payload.get("dias") or []
    filas: List[dict] = payload.get("filas") or []
    tipo = str(payload.get("tipo") or "personal")
    fest_bg = "#FED7AA"

    fijas_personal = tipo == "personal"
    logo_html = _logo_html(contrato, t1)

    bloques = _bloques(dias)
    sections: List[dict] = []
    for bi, bloque in enumerate(bloques):
        th_dias = ""
        for md in bloque:
            bg = fest_bg if md.get("especial") else (t2.get("bg") or "#E5F4FA")
            th_dias += (
                f'<th class="d" style="background:{bg};width:2.2%;">'
                f'{_esc(md.get("label"))}</th>'
            )
        if fijas_personal:
            thead = (
                "<thead><tr>"
                '<th style="width:3%;">No</th>'
                '<th style="width:16%;">Nombre</th>'
                '<th style="width:9%;">Documento</th>'
                '<th style="width:10%;">Cargo</th>'
                f"{th_dias}"
                '<th style="width:5%;">Total</th>'
                "</tr></thead>"
            )
        else:
            thead = (
                "<thead><tr>"
                '<th style="width:3%;">No</th>'
                '<th style="width:16%;">Equipo o máquina</th>'
                '<th style="width:9%;">Placa o identificación</th>'
                '<th style="width:8%;">Tipo</th>'
                f"{th_dias}"
                '<th style="width:5%;">Total</th>'
                "</tr></thead>"
            )

        start = bi * DIAS_POR_BLOQUE
        end = start + len(bloque)
        ncols = 4 + len(bloque) + 1
        body_rows = []
        for ri, r in enumerate(filas):
            kind = str(r.get("tipo") or "detalle")
            if kind not in ("empresa", "subtotal_empresa", "total", "detalle"):
                kind = "detalle"  # tipo de equipo en maquinaria simple
            marcas = list(r.get("marcas") or [])
            slice_m = marcas[start:end]
            while len(slice_m) < len(bloque):
                slice_m.append("")

            if kind == "empresa":
                bg, fg = t1.get("bg") or "#0077B6", t1.get("text") or "#FFFFFF"
                body_rows.append(
                    f'<tr class="empresa" style="background:{bg};color:{fg};font-weight:bold;'
                    f'page-break-after:avoid;-pdf-keep-with-next:true;">'
                    f'<td colspan="{ncols}">{_esc(r.get("nombre") or EMPRESA_SIN_NOMBRE)}</td>'
                    f"</tr>"
                )
                continue

            if kind == "subtotal_empresa":
                bg = t2.get("bg") or "#E5F4FA"
                tds_dias = ""
                for mi, md in enumerate(bloque):
                    cell_bg = fest_bg if md.get("especial") else bg
                    tds_dias += (
                        f'<td class="d" style="background:{cell_bg};text-align:center;'
                        f'font-weight:bold;">{_esc(slice_m[mi])}</td>'
                    )
                label = f"Subtotal empresa · {_esc(r.get('nombre') or '')}"
                body_rows.append(
                    f'<tr class="subtotal-empresa" style="background:{bg};font-weight:bold;'
                    f'page-break-before:avoid;">'
                    f'<td></td><td colspan="3">{label}</td>'
                    f"{tds_dias}"
                    f'<td style="text-align:center;">{_esc(r.get("total"))}</td>'
                    f"</tr>"
                )
                continue

            if kind == "total":
                bg, fg = t1.get("bg") or "#0077B6", t1.get("text") or "#FFFFFF"
                tds_dias = "".join(
                    f'<td class="d" style="background:{bg};color:{fg};text-align:center;'
                    f'font-weight:bold;">{_esc(slice_m[mi])}</td>'
                    for mi in range(len(bloque))
                )
                body_rows.append(
                    f'<tr class="total" style="background:{bg};color:{fg};font-weight:bold;">'
                    f'<td></td><td colspan="3">Total general</td>'
                    f"{tds_dias}"
                    f'<td style="text-align:center;">{_esc(r.get("total"))}</td>'
                    f"</tr>"
                )
                continue

            bg = "#FFFFFF" if ri % 2 == 0 else "#F8FAFC"
            tds_dias = ""
            for mi, md in enumerate(bloque):
                cell_bg = fest_bg if md.get("especial") else bg
                tds_dias += (
                    f'<td class="d" style="background:{cell_bg};text-align:center;'
                    f'font-weight:bold;">{_esc(slice_m[mi])}</td>'
                )
            if fijas_personal:
                body_rows.append(
                    f'<tr style="background:{bg};">'
                    f'<td style="text-align:center;">{_esc(r.get("no"))}</td>'
                    f'<td>{_esc(r.get("nombre"))}</td>'
                    f'<td style="text-align:center;">{_esc(r.get("documento"))}</td>'
                    f'<td>{_esc(r.get("cargo"))}</td>'
                    f"{tds_dias}"
                    f'<td style="text-align:center;font-weight:bold;">{_esc(r.get("total"))}</td>'
                    f"</tr>"
                )
            else:
                tipo_eq = r.get("tipo_equipo") if r.get("tipo_equipo") is not None else r.get("tipo")
                body_rows.append(
                    f'<tr style="background:{bg};">'
                    f'<td style="text-align:center;">{_esc(r.get("no"))}</td>'
                    f'<td>{_esc(r.get("nombre"))}</td>'
                    f'<td style="text-align:center;">{_esc(r.get("identificacion"))}</td>'
                    f'<td>{_esc(tipo_eq)}</td>'
                    f"{tds_dias}"
                    f'<td style="text-align:center;font-weight:bold;">{_esc(r.get("total"))}</td>'
                    f"</tr>"
                )

        bloque_lbl = ""
        if len(bloques) > 1:
            bloque_lbl = (
                f'<div style="font-size:7pt;margin:0 0 2pt 0;color:{t2["text"]};">'
                f'Días {_esc(bloque[0].get("iso"))} – {_esc(bloque[-1].get("iso"))}'
                f' (bloque {bi + 1}/{len(bloques)})</div>'
            )
        sections.append({
            "bloque_lbl": bloque_lbl,
            "thead": thead,
            "body_rows": body_rows,
        })

    emp_lbl = "Empresa" if tipo == "personal" else "Empresa (operador)"
    css = f"""
  @page {{ size: letter landscape; margin: 2mm; }}
  html, body {{
    margin: 0; padding: 0;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 6.5pt; color: #0F2942;
  }}
  .hdr {{ width: 100%; margin: 0 0 3pt 0; }}
  .hdr td {{
    border: 1pt solid {t1["bg"]}; background: {t1["bg"]}; color: {t1["text"]};
    padding: 6pt; vertical-align: middle;
  }}
  .hdr .logo {{ width: 18%; text-align: center; background: #FFFFFF; }}
  .hdr .title {{ width: 52%; text-align: center; font-size: 11pt; font-weight: bold; }}
  .hdr .calidad {{ width: 30%; text-align: center; font-size: 7.5pt; white-space: pre-line; }}
  .meta {{ width: 100%; margin: 0 0 3pt 0; font-size: 7.5pt; }}
  .meta td {{ border: 0.6pt solid #94A3B8; padding: 3pt 5pt; }}
  .meta .lbl {{ font-weight: bold; background: {t2["bg"]}; color: {t2["text"]}; width: 16%; }}
  table.grid {{ width: 100%; font-size: 5.5pt; margin: 0; border-collapse: collapse; }}
  table.grid th, table.grid td {{
    border: 0.5pt solid #64748B; padding: 1pt 1.5pt;
    vertical-align: middle; line-height: 1.05;
  }}
  table.grid th {{
    background: {t2["bg"]}; color: {t2["text"]};
    font-size: 5pt; font-weight: bold; text-align: center;
  }}
  table.grid th.d, table.grid td.d {{ text-align: center; }}
"""
    hdr_meta = f"""
<table class="hdr"><tr>
  <td class="logo">{logo_html}</td>
  <td class="title">{_esc(fmt.get("titulo"))}</td>
  <td class="calidad">{_esc(fmt.get("codigo"))}
Versión {_esc(fmt.get("version"))}
{_esc(_fmt_fecha_es(payload.get("fecha_hasta")))}</td>
</tr></table>
<table class="meta">
<tr>
  <td class="lbl">Contrato</td>
  <td>{_esc(contrato.get("numero") or "—")}</td>
  <td class="lbl">Objeto</td>
  <td colspan="3">{_esc(contrato.get("objeto") or "—")}</td>
</tr>
<tr>
  <td class="lbl">{_esc(emp_lbl)}</td>
  <td>{_esc(payload.get("empresa") or "—")}</td>
  <td class="lbl">Periodo</td>
  <td colspan="3">{_esc(_fmt_fecha_es(payload.get("fecha_desde")))} – {_esc(_fmt_fecha_es(payload.get("fecha_hasta")))}</td>
</tr>
</table>
"""
    return {"css": css, "hdr_meta": hdr_meta, "sections": sections}


def _html_hoja_presencia(
    piezas: dict,
    sec: dict,
    *,
    filas_slice: List[str],
    con_encabezado: bool,
) -> str:
    hdr = piezas["hdr_meta"] if con_encabezado else ""
    lbl = sec.get("bloque_lbl") or ""
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>{piezas["css"]}</style></head><body>
{hdr}{lbl}
<table class="grid">{sec["thead"]}<tbody>{"".join(filas_slice)}</tbody></table>
</body></html>"""


def _html_hojas_presencia(payload: dict) -> List[str]:
    """Empaque vertical por hoja; cada bloque de días abre sección nueva."""
    from pdf_paginar_hojas import (
        PRES_BLOQUE_LBL_PT,
        PRES_HDR_META_PT,
        PRES_ROW_PT,
        PRES_THEAD_PT,
        empacar_filas,
    )

    piezas = _piezas_presencia(payload)
    hojas: List[str] = []
    for sec in piezas["sections"]:
        rows: List[str] = list(sec["body_rows"])
        lbl_pt = PRES_BLOQUE_LBL_PT if sec.get("bloque_lbl") else 0.0
        primera_doc = len(hojas) == 0
        empaque = empacar_filas(
            len(rows),
            overhead_primera_pt=(
                (PRES_HDR_META_PT if primera_doc else 0.0) + lbl_pt + PRES_THEAD_PT
            ),
            overhead_cont_pt=lbl_pt + PRES_THEAD_PT,
            fila_pt=PRES_ROW_PT,
            cierre_pt=0.0,
        )
        for hi, h in enumerate(empaque):
            hojas.append(
                _html_hoja_presencia(
                    piezas,
                    sec,
                    filas_slice=rows[h.inicio : h.fin],
                    con_encabezado=(primera_doc and hi == 0),
                )
            )
    if not hojas:
        return [
            f"""<!DOCTYPE html><html><head><meta charset="utf-8"/><style>{piezas["css"]}</style></head>
<body>{piezas["hdr_meta"]}<p>Sin datos</p></body></html>"""
        ]
    return hojas


def _html_informe(payload: dict) -> str:
    """Compat: HTML de la primera hoja (asserts / depuración)."""
    return _html_hojas_presencia(payload)[0]


def generar_pdf_presencia(payload: dict) -> bytes:
    from pdf_paginar_hojas import (
        PRES_BLOQUE_LBL_PT,
        PRES_HDR_META_PT,
        PRES_ROW_PT,
        PRES_THEAD_PT,
        merge_pdf_bytes,
        render_hojas_sin_desborde,
    )

    piezas = _piezas_presencia(payload)
    partes_all: List[bytes] = []
    for sec in piezas["sections"]:
        rows: List[str] = list(sec["body_rows"])
        lbl_pt = PRES_BLOQUE_LBL_PT if sec.get("bloque_lbl") else 0.0
        primera_doc = len(partes_all) == 0

        def _armar(inicio, fin, con_encabezado, con_cierre, _sec=sec, _rows=rows, _pd=primera_doc):
            # con_encabezado del empaque solo aplica en la 1ª hoja del doc
            return _html_hoja_presencia(
                piezas,
                _sec,
                filas_slice=_rows[inicio:fin],
                con_encabezado=(_pd and con_encabezado),
            )

        partes_all.extend(
            render_hojas_sin_desborde(
                _armar,
                len(rows),
                render_pdf=lambda html: to_pdf_bytes(html, landscape=True),
                overhead_primera_pt=(
                    (PRES_HDR_META_PT if primera_doc else 0.0) + lbl_pt + PRES_THEAD_PT
                ),
                overhead_cont_pt=lbl_pt + PRES_THEAD_PT,
                fila_pt=PRES_ROW_PT,
                cierre_pt=0.0,
            )
        )
    if not partes_all:
        html = _html_informe(payload)
        return to_pdf_bytes(html, landscape=True)
    return merge_pdf_bytes(partes_all)


def generar_docx_presencia(payload: dict) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Pt, RGBColor

    doc = Document()
    section = doc.sections[0]
    section.page_width = Pt(792)   # landscape letter
    section.page_height = Pt(612)
    section.left_margin = Pt(14)
    section.right_margin = Pt(14)
    section.top_margin = Pt(14)
    section.bottom_margin = Pt(14)

    fmt = payload.get("formato") or {}
    contrato = payload.get("contrato") or {}
    tipo = str(payload.get("tipo") or "personal")
    dias = payload.get("dias") or []
    filas = payload.get("filas") or []
    fijas_personal = tipo == "personal"

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(_texto_unicode(fmt.get("titulo") or ""))
    run.bold = True
    run.font.size = Pt(12)

    meta = doc.add_paragraph()
    meta.add_run(
        f"Código: {fmt.get('codigo')}  ·  Versión: {fmt.get('version')}"
    ).font.size = Pt(8)

    for label, value in (
        ("Contrato", contrato.get("numero") or "—"),
        ("Objeto", contrato.get("objeto") or "—"),
        ("Empresa", payload.get("empresa") or "—"),
        (
            "Periodo",
            f"{_fmt_fecha_es(payload.get('fecha_desde'))} – {_fmt_fecha_es(payload.get('fecha_hasta'))}",
        ),
    ):
        p = doc.add_paragraph()
        r = p.add_run(f"{label}: ")
        r.bold = True
        r.font.size = Pt(8)
        p.add_run(_texto_unicode(value)).font.size = Pt(8)

    def _shade(cell, fill: str):
        try:
            tc_pr = cell._tc.get_or_add_tcPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:fill"), fill)
            shd.set(qn("w:val"), "clear")
            tc_pr.append(shd)
        except Exception:
            pass

    bloques = _bloques(dias)
    for bi, bloque in enumerate(bloques):
        if bi > 0:
            doc.add_page_break()
            p = doc.add_paragraph()
            p.add_run(
                f"Días {bloque[0].get('iso')} – {bloque[-1].get('iso')} "
                f"(bloque {bi + 1}/{len(bloques)})"
            ).font.size = Pt(8)

        if fijas_personal:
            headers = ["No", "Nombre", "Documento", "Cargo"]
        else:
            headers = ["No", "Equipo o máquina", "Placa o identificación", "Tipo"]
        headers += [str(md.get("label") or "") for md in bloque]
        headers.append("Total")

        start = bi * DIAS_POR_BLOQUE
        end = start + len(bloque)
        table = doc.add_table(rows=1 + len(filas), cols=len(headers))
        table.style = "Table Grid"
        for i, h in enumerate(headers):
            cell = table.rows[0].cells[i]
            cell.text = h
            fill = "FED7AA" if (i >= 4 and i < 4 + len(bloque) and bloque[i - 4].get("especial")) else "E5F4FA"
            _shade(cell, fill)
            for p in cell.paragraphs:
                for run in p.runs:
                    run.bold = True
                    run.font.size = Pt(5)

        for ri, r in enumerate(filas):
            kind = str(r.get("tipo") or "detalle")
            if kind not in ("empresa", "subtotal_empresa", "total", "detalle"):
                kind = "detalle"
            marcas = list(r.get("marcas") or [])[start:end]
            while len(marcas) < len(bloque):
                marcas.append("")
            row = table.rows[ri + 1]

            if kind == "empresa":
                try:
                    row.cells[0].merge(row.cells[len(headers) - 1])
                except Exception:
                    pass
                cell = row.cells[0]
                cell.text = _texto_unicode(r.get("nombre") or EMPRESA_SIN_NOMBRE)
                _shade(cell, "0077B6")
                for p in cell.paragraphs:
                    for run in p.runs:
                        run.bold = True
                        run.font.size = Pt(6)
                        run.font.color.rgb = None
                continue

            if kind == "subtotal_empresa":
                vals = [
                    "",
                    f"Subtotal empresa · {r.get('nombre') or ''}",
                    "",
                    "",
                    *marcas,
                    str(r.get("total") or 0),
                ]
                for ci, val in enumerate(vals):
                    cell = row.cells[ci]
                    cell.text = _texto_unicode(val)
                    fill = (
                        "FED7AA"
                        if (ci >= 4 and ci < 4 + len(bloque) and bloque[ci - 4].get("especial"))
                        else "E5F4FA"
                    )
                    _shade(cell, fill)
                    for p in cell.paragraphs:
                        for run in p.runs:
                            run.bold = True
                            run.font.size = Pt(5)
                continue

            if kind == "total":
                vals = ["", "Total general", "", "", *marcas, str(r.get("total") or 0)]
                for ci, val in enumerate(vals):
                    cell = row.cells[ci]
                    cell.text = _texto_unicode(val)
                    _shade(cell, "0077B6")
                    for p in cell.paragraphs:
                        for run in p.runs:
                            run.bold = True
                            run.font.size = Pt(5)
                continue

            if fijas_personal:
                vals = [
                    str(r.get("no") or ""),
                    r.get("nombre") or "",
                    r.get("documento") or "",
                    r.get("cargo") or "",
                    *marcas,
                    str(r.get("total") or 0),
                ]
            else:
                tipo_eq = r.get("tipo_equipo") if r.get("tipo_equipo") is not None else r.get("tipo")
                vals = [
                    str(r.get("no") or ""),
                    r.get("nombre") or "",
                    r.get("identificacion") or "",
                    tipo_eq or "",
                    *marcas,
                    str(r.get("total") or 0),
                ]
            for ci, val in enumerate(vals):
                cell = row.cells[ci]
                cell.text = _texto_unicode(val)
                if ci >= 4 and ci < 4 + len(bloque) and bloque[ci - 4].get("especial"):
                    _shade(cell, "FED7AA")
                for p in cell.paragraphs:
                    for run in p.runs:
                        run.font.size = Pt(5)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def exportar_informe_presencia(
    sb,
    contrato_id: int,
    *,
    tipo: str,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: str,
    formato: str = "pdf",
) -> Tuple[bytes, str, str]:
    import time as _time

    t0 = _time.perf_counter()
    payload = _payload_informe(
        sb, contrato_id,
        tipo=tipo,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        empresa_key=empresa_key,
    )
    fmt = str(formato or "pdf").lower().strip()
    tipo_l = str(tipo or "personal").lower()
    slug = "asistencia" if tipo_l == "personal" else "maquinaria"
    d0 = str(fecha_desde)[:10]
    d1 = str(fecha_hasta)[:10]
    if fmt == "docx":
        data = generar_docx_presencia(payload)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        fname = f"{slug}_{d0}_{d1}.docx"
    else:
        data = generar_pdf_presencia(payload)
        media = "application/pdf"
        fname = f"{slug}_{d0}_{d1}.pdf"
    ms = (_time.perf_counter() - t0) * 1000
    _log.info(
        "informe presencia %s cto=%s filas=%s dias=%s ms=%.0f",
        tipo_l, contrato_id, len(payload.get("filas") or []),
        len(payload.get("dias") or []), ms,
    )
    if ms > 10000:
        _log.warning("informe presencia lento: %.0f ms", ms)
    return data, media, fname
