"""Conversión de valores monetarios (COP) a letras — contratos legales en español."""

from __future__ import annotations

_UNIDADES = (
    "",
    "UN",
    "DOS",
    "TRES",
    "CUATRO",
    "CINCO",
    "SEIS",
    "SIETE",
    "OCHO",
    "NUEVE",
    "DIEZ",
    "ONCE",
    "DOCE",
    "TRECE",
    "CATORCE",
    "QUINCE",
    "DIECISÉIS",
    "DIECISIETE",
    "DIECIOCHO",
    "DIECINUEVE",
)
_DECENAS = (
    "",
    "",
    "VEINTE",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
)
_CENTENAS = (
    "",
    "CIENTO",
    "DOSCIENTOS",
    "TRESCIENTOS",
    "CUATROCIENTOS",
    "QUINIENTOS",
    "SEISCIENTOS",
    "SETECIENTOS",
    "OCHOCIENTOS",
    "NOVECIENTOS",
)


def _letras_hasta_99(n: int) -> str:
    if n < 20:
        return _UNIDADES[n]
    if n < 30:
        if n == 20:
            return "VEINTE"
        return f"VEINTI{_UNIDADES[n - 20].lower()}" if n != 21 else "VEINTIÚN"
    d, u = divmod(n, 10)
    base = _DECENAS[d]
    if u == 0:
        return base
    if d == 2:
        return f"VEINTI{_UNIDADES[u].lower()}" if u != 1 else "VEINTIÚN"
    return f"{base} Y {_UNIDADES[u]}"


def _letras_hasta_999(n: int) -> str:
    if n == 0:
        return ""
    if n == 100:
        return "CIEN"
    c, r = divmod(n, 100)
    partes = []
    if c:
        partes.append(_CENTENAS[c] if r else ("CIEN" if c == 1 else _CENTENAS[c]))
    if r:
        partes.append(_letras_hasta_99(r))
    return " ".join(partes)


def _letras_grupo(n: int, singular: str, plural: str) -> str:
    if n == 0:
        return ""
    if n == 1:
        return f"UN {singular}"
    return f"{_letras_hasta_999(n)} {plural}"


def entero_en_letras(n: int) -> str:
    """Entero positivo en letras (mayúsculas, estilo legal colombiano)."""
    if n < 0:
        raise ValueError("Solo valores positivos")
    if n == 0:
        return "CERO"
    if n >= 1_000_000_000:
        raise ValueError("Valor fuera de rango para conversión a letras")

    millones, resto_m = divmod(n, 1_000_000)
    miles, resto = divmod(resto_m, 1_000)

    partes = []
    if millones:
        if millones == 1:
            partes.append("UN MILLÓN")
        else:
            partes.append(f"{_letras_hasta_999(millones)} MILLONES")
    if miles:
        if miles == 1:
            partes.append("MIL")
        else:
            partes.append(f"{_letras_hasta_999(miles)} MIL")
    if resto:
        partes.append(_letras_hasta_999(resto))
    return " ".join(partes)


def valor_pesos_en_letras(valor) -> str:
    """Valor mensual COP en letras para cláusula contractual."""
    if valor is None or valor == "":
        return "CERO PESOS"
    try:
        n = int(round(float(valor)))
    except (TypeError, ValueError):
        return "CERO PESOS"
    if n == 0:
        return "CERO PESOS"
    return f"{entero_en_letras(n)} PESOS"


def formato_pesos_cop(valor) -> str:
    """Formato numérico colombiano sin símbolo ($): 1.234.567"""
    if valor is None or valor == "":
        return "0"
    try:
        n = int(round(float(valor)))
    except (TypeError, ValueError):
        return "0"
    s = f"{n:,}".replace(",", ".")
    return s
