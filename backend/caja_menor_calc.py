"""
Reglas de Caja Menor. Sin base de datos y sin Contabilidad.

Valor neto = bruto + IVA + impuesto al consumo − retenciones − otros deducibles.
Ese neto es lo que sale del disponible. Un gasto rechazado no se descuenta.
Fondo establecido = saldo trasladado + consignaciones.
Gasto actual = gastos del periodo / fondo, y no se divide si el fondo es cero.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

try:
    import pytz
except ImportError:  # pragma: no cover
    pytz = None

TZ_COLOMBIA = "America/Bogota"
ESTADOS_CAJA = ("abierta", "en_legalizacion", "legalizada")
ESTADOS_GASTO = ("pendiente", "aprobado", "rechazado")

FORMATO_CALIDAD = {
    "codigo": "CC-CM-001",
    "version": "1.0",
    "nombre": "Control de gastos por caja menor",
    "nombre_mayus": "CONTROL DE GASTOS POR CAJA MENOR",
}


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())


def es_cargo_administrador(nombre: str) -> bool:
    """Cargo Administrador: gerencia del contrato.

    Coincide sin importar mayúsculas, tildes ni espacios de más.
    No incluye Administrativo ni Residente Administrativo.
    """
    return _norm(nombre) == "administrador"


def dinero(valor) -> int:
    """Pesos enteros. COP de la plataforma no guarda centavos."""
    if valor is None or valor == "":
        return 0
    try:
        return int(Decimal(str(valor)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except Exception as exc:
        raise ValueError("Valor no válido.") from exc


def normalizar_documento(raw: str) -> str:
    return re.sub(r"\D", "", str(raw or ""))


def documento_valido(raw: str) -> bool:
    n = normalizar_documento(raw)
    return 5 <= len(n) <= 15


def hoy_colombia(now: Optional[datetime] = None) -> date:
    if pytz is None:
        base = now or datetime.utcnow()
        return base.date()
    tz = pytz.timezone(TZ_COLOMBIA)
    if now is None:
        return datetime.now(tz).date()
    if now.tzinfo is None:
        now = pytz.utc.localize(now)
    return now.astimezone(tz).date()


def parse_fecha(raw) -> date:
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    texto = str(raw or "").strip()[:10]
    try:
        return datetime.strptime(texto, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("Fecha no válida.") from exc


def fecha_no_futura(raw, *, hoy: Optional[date] = None) -> date:
    dia = parse_fecha(raw)
    limite = hoy or hoy_colombia()
    if dia > limite:
        raise ValueError("La fecha no puede ser futura.")
    return dia


def valor_neto(bruto, iva, retenciones, impuesto_consumo, otros_deducibles) -> int:
    neto = (
        dinero(bruto)
        + dinero(iva)
        + dinero(impuesto_consumo)
        - dinero(retenciones)
        - dinero(otros_deducibles)
    )
    if neto <= 0:
        raise ValueError("El valor neto debe ser mayor que cero.")
    return neto


def gastos_que_cuentan(gastos: Iterable[dict]) -> list:
    return [g for g in (gastos or []) if (g.get("estado_validacion") or "pendiente") != "rechazado"]


def indicadores(saldo_trasladado, ingresos: Iterable[dict], gastos: Iterable[dict]) -> dict:
    saldo = dinero(saldo_trasladado)
    consignaciones = sum(dinero(i.get("valor")) for i in (ingresos or []))
    fondo = saldo + consignaciones
    gastados = sum(dinero(g.get("valor_neto")) for g in gastos_que_cuentan(gastos))
    pct = None
    if fondo != 0:
        pct = round(gastados * 1000 / fondo) / 10
    return {
        "saldo_trasladado": saldo,
        "consignaciones": consignaciones,
        "fondo_establecido": fondo,
        "gastos_periodo": gastados,
        "gasto_actual": pct,
        "disponible": fondo - gastados,
    }


def alcanza_80(fondo: int, gastados: int, ya_enviada: bool) -> bool:
    """True cuando el gasto actual llega al 80 % y el aviso aún no se envió."""
    if ya_enviada or fondo <= 0:
        return False
    return gastados * 100 >= fondo * 80


def sugerir_documento(numero_caja: int, consecutivo: int) -> str:
    return f"CM-{int(numero_caja):03d}-{int(consecutivo):03d}"


def siguiente_numero(numeros: Iterable[int]) -> int:
    vals = [int(n) for n in numeros if n is not None]
    return (max(vals) if vals else 0) + 1


def siguiente_consecutivo(consecutivos: Iterable[int]) -> int:
    return siguiente_numero(consecutivos)


def puede_cargar(estado: str) -> bool:
    return (estado or "") == "abierta"


def puede_validar_estado(estado: str) -> bool:
    return (estado or "") == "en_legalizacion"


def todos_validados(gastos: Iterable[dict]) -> bool:
    filas = list(gastos or [])
    return all((g.get("estado_validacion") or "") in ("aprobado", "rechazado") for g in filas)


def saldo_a_trasladar(ind: dict) -> int:
    """Disponible al legalizar: positivo es activo, negativo es pasivo."""
    return int(ind["disponible"])


def sumar_saldos_pendientes(filas: Iterable[dict]) -> int:
    return sum(dinero(f.get("saldo")) for f in (filas or []) if not f.get("aplicado_en_caja_id"))


def buscar_duplicado(gastos: Iterable[dict], documento_norm: str, documento_no: str, *, excluir_id=None) -> Optional[dict]:
    """Misma caja o cualquier otra del mismo contrato. No cruza contratos."""
    doc = (documento_no or "").strip().lower()
    norm = normalizar_documento(documento_norm)
    if not doc or not norm:
        return None
    for g in gastos or []:
        if excluir_id is not None and str(g.get("id")) == str(excluir_id):
            continue
        if normalizar_documento(g.get("documento_norm") or g.get("tercero_documento")) != norm:
            continue
        if str(g.get("documento_no") or "").strip().lower() != doc:
            continue
        return g
    return None


def mensaje_duplicado(caja_numero) -> str:
    num = caja_numero if caja_numero not in (None, "") else "—"
    return (
        f"Posible duplicado. Este NIT y documento ya están en la caja No. {num}. "
        "Puede continuar."
    )


def etiqueta_estado(estado: str) -> str:
    return {
        "abierta": "Abierta",
        "en_legalizacion": "En legalización",
        "legalizada": "Legalizada",
        "pendiente": "Pendiente",
        "aprobado": "Aprobado",
        "rechazado": "Rechazado",
    }.get(estado or "", estado or "—")


def fmt_fecha_co(raw) -> str:
    if not raw:
        return ""
    try:
        return parse_fecha(raw).strftime("%d/%m/%Y")
    except ValueError:
        return str(raw)[:10]


def fmt_pct(pct) -> str:
    if pct is None:
        return "—"
    texto = f"{pct:.1f}".rstrip("0").rstrip(".")
    return f"{texto} %"
