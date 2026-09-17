"""
Lógica pura del ciclo laboral RRHH (sin I/O).

Alertas de vencimiento / período de prueba, reingreso por cédula,
visibilidad salarial y agrupación por empresa contratante.
"""
from __future__ import annotations

import unicodedata
from datetime import date, datetime, timedelta
from typing import Any, Iterable, Optional

ALERTA_VENCIMIENTO_35_DIAS = 35
ALERTA_VENCIMIENTO_10_DIAS = 10
ALERTA_PERIODO_PRUEBA_DIAS = 5

ESTADOS_REINGRESO = frozenset({"retirado", "contrato_finalizado"})
ESTADO_ACTIVO = "activo"

CARGOS_SALARIO = frozenset({"administrativo", "desarrollador", "administrador"})

DOCUMENTOS_NUEVO_CICLO = (
    "contrato",
    "examen_medico",
    "cert_eps",
    "cert_pension",
    "cert_arl",
)

PERIODICIDAD_MESES = (1, 2, 3, 6, 12)

CLAUSULA_LEY_1581 = (
    "Asimismo, el colaborador autoriza el tratamiento de sus datos personales "
    "conforme a la Ley 1581 de 2012 y su reglamentación (Decreto 1377 de 2013 y "
    "normas que la complementen, modifiquen o sustituyan), para los fines propios "
    "de la relación laboral y las obligaciones legales derivadas de la misma."
)

LIST_SELECT_COLS = (
    "id, nombres, apellidos, tipo_documento, numero_documento, cargo_aspira, "
    "estado, empresa_tipo, empresa_nombre, empresa_subcontratista_id, empresa_nit, "
    "fecha_ingreso, fecha_retiro, salario, tipo_contrato, requiere_renovacion, "
    "periodicidad_renovacion_meses, periodo_prueba_dias, fecha_fin_periodo_prueba, "
    "fecha_fin_contrato, renovacion_otrosi_at, ciclo_documental, foto_blob_path"
)

RESUMEN_SELECT_COLS = (
    "id, cargo_aspira, estado, empresa_tipo, empresa_nombre, "
    "empresa_subcontratista_id, salario"
)


def _norm_txt(txt: Any) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip().replace("_", " ").replace("  ", " ")


def es_termino_fijo(tipo_contrato: Any) -> bool:
    n = _norm_txt(tipo_contrato)
    if not n:
        return False
    if n in {"termino fijo", "contrato a termino fijo", "fijo"}:
        return True
    return "termino fijo" in n


def _as_date(value: Any) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()[:10]
    try:
        y, m, d = text.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def fecha_fin_periodo_prueba(fecha_inicio: Any, dias: Any) -> Optional[date]:
    ini = _as_date(fecha_inicio)
    try:
        n = int(dias)
    except (TypeError, ValueError):
        return None
    if ini is None or n <= 0:
        return None
    return ini + timedelta(days=n)


def dias_restantes(hasta: Any, hoy: Optional[date] = None) -> Optional[int]:
    fin = _as_date(hasta)
    if fin is None:
        return None
    ref = hoy or date.today()
    return (fin - ref).days


def debe_alertar_vencimiento_35(
    *,
    tipo_contrato: str,
    fecha_fin: Any,
    ya_enviada: bool,
    hoy: Optional[date] = None,
) -> bool:
    if ya_enviada or not es_termino_fijo(tipo_contrato):
        return False
    rest = dias_restantes(fecha_fin, hoy)
    if rest is None:
        return False
    return 0 < rest <= ALERTA_VENCIMIENTO_35_DIAS


def debe_alertar_vencimiento_10(
    *,
    tipo_contrato: str,
    fecha_fin: Any,
    tiene_renovacion_u_otrosi: bool,
    ya_enviada: bool,
    hoy: Optional[date] = None,
) -> bool:
    if ya_enviada or tiene_renovacion_u_otrosi or not es_termino_fijo(tipo_contrato):
        return False
    rest = dias_restantes(fecha_fin, hoy)
    if rest is None:
        return False
    return 0 < rest <= ALERTA_VENCIMIENTO_10_DIAS


def debe_alertar_periodo_prueba(
    *,
    fecha_fin_prueba: Any,
    ya_enviada: bool,
    hoy: Optional[date] = None,
) -> bool:
    if ya_enviada:
        return False
    rest = dias_restantes(fecha_fin_prueba, hoy)
    if rest is None:
        return False
    return 0 < rest <= ALERTA_PERIODO_PRUEBA_DIAS


def mensaje_alerta_35(nombre: str, fecha_fin: Any) -> tuple[str, str]:
    fin = _as_date(fecha_fin)
    fin_txt = fin.isoformat() if fin else "—"
    asunto = "Vencimiento de contrato a término fijo (35 días)"
    mensaje = (
        f"El contrato laboral a término fijo de {nombre} vence el {fin_txt}. "
        "Deben gestionarse la cancelación si así se requiere, o preparar la "
        "renovación / otrosí correspondiente."
    )
    return asunto, mensaje


def mensaje_alerta_10(nombre: str, fecha_fin: Any) -> tuple[str, str]:
    fin = _as_date(fecha_fin)
    fin_txt = fin.isoformat() if fin else "—"
    asunto = "Renovación / otrosí de contrato (10 días)"
    mensaje = (
        f"El contrato laboral a término fijo de {nombre} vence el {fin_txt} "
        "y no se ha registrado renovación u otrosí. Debe generarse dicha "
        "renovación/otrosí para el contrato."
    )
    return asunto, mensaje


def mensaje_alerta_prueba(nombre: str, fecha_fin_prueba: Any) -> tuple[str, str]:
    fin = _as_date(fecha_fin_prueba)
    fin_txt = fin.isoformat() if fin else "—"
    asunto = "Vencimiento del período de prueba (5 días)"
    mensaje = (
        f"El período de prueba de {nombre} se cumple el {fin_txt}. "
        "Revise la continuidad o terminación del contrato dentro del período de prueba."
    )
    return asunto, mensaje


def clasificar_documento_existente(existente: Optional[dict]) -> Optional[str]:
    """
    None = no hay registro previo.
    'activo' = ya está vinculado y no se puede duplicar.
    'reingreso' = retirado / contrato finalizado → actualizar, no crear.
    """
    if not existente:
        return None
    estado = str(existente.get("estado") or "").strip().lower()
    if estado in ESTADOS_REINGRESO:
        return "reingreso"
    return "activo"


def _norm_cargo(txt: Any) -> str:
    return _norm_txt(txt).replace(" ", "")


def puede_ver_salario(usuario: Optional[dict]) -> bool:
    if not usuario:
        return False
    cargo = _norm_txt(usuario.get("cargo_nombre") or usuario.get("cargo"))
    rol = _norm_txt(usuario.get("rol_nombre") or usuario.get("rol"))
    return cargo in CARGOS_SALARIO or rol in CARGOS_SALARIO


def ocultar_salario_en_fila(fila: dict, ver_salario: bool) -> dict:
    out = dict(fila or {})
    if ver_salario:
        return out
    for k in (
        "salario",
        "salario_basico",
        "salario_liquidable",
        "valor_nomina",
        "total_nomina",
        "neto",
        "devengos",
        "deducciones",
        "valor_liquidacion",
    ):
        out.pop(k, None)
    out["salario_oculto"] = True
    return out


def empresa_key(colaborador: dict) -> str:
    tipo = str(colaborador.get("empresa_tipo") or "consorcio").strip().lower()
    if tipo == "subcontratista":
        sid = colaborador.get("empresa_subcontratista_id")
        if sid is not None:
            return f"sub:{sid}"
        nombre = (colaborador.get("empresa_nombre") or "").strip().lower()
        return f"subnombre:{nombre or 'sin_asignar'}"
    return "consorcio"


def agrupar_por_empresa(colaboradores: Iterable[dict], *, ver_salario: bool = True) -> list[dict]:
    grupos: dict[str, dict] = {}
    for row in colaboradores:
        key = empresa_key(row)
        g = grupos.get(key)
        if not g:
            g = {
                "empresa_key": key,
                "empresa_tipo": str(row.get("empresa_tipo") or "consorcio").strip().lower() or "consorcio",
                "nombre": (row.get("empresa_nombre") or "Consorcio").strip() or "Consorcio",
                "empresa_nit": row.get("empresa_nit"),
                "subcontratista_id": row.get("empresa_subcontratista_id"),
                "activos": 0,
                "total": 0,
                "total_nomina": 0.0,
                "por_cargo": {},
            }
            grupos[key] = g
        g["total"] += 1
        if str(row.get("estado") or "").lower() == ESTADO_ACTIVO:
            g["activos"] += 1
        cargo = (row.get("cargo_aspira") or "Sin cargo").strip() or "Sin cargo"
        item = g["por_cargo"].get(cargo)
        if not item:
            item = {"cargo": cargo, "cantidad": 0, "total_nomina": 0.0}
            g["por_cargo"][cargo] = item
        item["cantidad"] += 1
        try:
            sal = float(row.get("salario") or 0)
        except (TypeError, ValueError):
            sal = 0.0
        g["total_nomina"] += sal
        item["total_nomina"] += sal
    out = []
    for g in grupos.values():
        cargos = list(g.pop("por_cargo").values())
        cargos.sort(key=lambda x: (-x["cantidad"], x["cargo"].lower()))
        if not ver_salario:
            g["total_nomina"] = None
            for c in cargos:
                c["total_nomina"] = None
        g["por_cargo"] = cargos
        out.append(g)
    out.sort(key=lambda x: (0 if x["empresa_key"] == "consorcio" else 1, x["nombre"].lower()))
    return out


def payload_listado(row: dict, *, ver_salario: bool) -> dict:
    """Fila liviana para grilla: sin foto, firma ni JSON de auditoría."""
    base = {
        "id": row.get("id"),
        "nombres": row.get("nombres"),
        "apellidos": row.get("apellidos"),
        "numero_documento": row.get("numero_documento"),
        "tipo_documento": row.get("tipo_documento"),
        "cargo_aspira": row.get("cargo_aspira"),
        "estado": row.get("estado"),
        "empresa_tipo": row.get("empresa_tipo"),
        "empresa_nombre": row.get("empresa_nombre"),
        "empresa_subcontratista_id": row.get("empresa_subcontratista_id"),
        "empresa_nit": row.get("empresa_nit"),
        "fecha_ingreso": row.get("fecha_ingreso"),
        "fecha_retiro": row.get("fecha_retiro"),
        "tipo_contrato": row.get("tipo_contrato"),
        "ciclo_documental": row.get("ciclo_documental") or 1,
        "tiene_foto": bool(row.get("foto_blob_path")),
    }
    if ver_salario:
        base["salario"] = row.get("salario")
    else:
        base["salario_oculto"] = True
    return base


def documentos_faltantes_ciclo(tipos_cargados: Iterable[str]) -> list[str]:
    loaded = {str(t or "").strip().lower() for t in tipos_cargados}
    return [t for t in DOCUMENTOS_NUEVO_CICLO if t not in loaded]
