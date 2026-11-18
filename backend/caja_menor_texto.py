"""Formato de la descripción del gasto: primera mayúscula y acentos, sin tocar siglas ni medidas."""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

_SEPARADORES = "·•|;\n"
_MEDIDA = re.compile(
    r"^(?:\d+(?:[.,]\d+)?(?:/\d+(?:[.,]\d+)?)?[\"″']?"
    r"|\d+(?:[.,]\d+)?(?:mm|cm|mt|mts|m|kg|g|ml|l|und|un|pulg|pg))$",
    re.IGNORECASE,
)
_BORDE = re.compile(r"^([,.:()\[\]¿¡]*)(.*?)([,.:()\[\]?!]*)$", re.DOTALL)

# Marcas, siglas y ciudades que el diccionario general no trae con su forma institucional.
_EXTRAS = {
    "pavco": "PAVCO",
    "pvc": "PVC",
    "cemex": "CEMEX",
    "gerfor": "Gerfor",
    "pintuco": "Pintuco",
    "eternit": "Eternit",
    "sika": "Sika",
    "toxement": "Toxement",
    "homecenter": "Homecenter",
    "bogota": "Bogotá",
    "medellin": "Medellín",
    "cali": "Cali",
    "barranquilla": "Barranquilla",
    "cartagena": "Cartagena",
    "bucaramanga": "Bucaramanga",
    "pereira": "Pereira",
    "manizales": "Manizales",
    "cucuta": "Cúcuta",
    "ibague": "Ibagué",
    "villavicencio": "Villavicencio",
    "pasto": "Pasto",
    "monteria": "Montería",
    "neiva": "Neiva",
    "armenia": "Armenia",
    "popayan": "Popayán",
    "sincelejo": "Sincelejo",
    "valledupar": "Valledupar",
    "tunja": "Tunja",
    "soacha": "Soacha",
    "envigado": "Envigado",
    "itagui": "Itagüí",
}


def _fold(texto: str) -> str:
    s = unicodedata.normalize("NFD", str(texto or ""))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


@lru_cache(maxsize=1)
def _preferidos() -> dict:
    ruta = Path(__file__).with_name("caja_menor_lexico.txt")
    mapa = {}
    if ruta.is_file():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            palabra = linea.strip()
            if palabra:
                mapa.setdefault(_fold(palabra), palabra)
    for clave, forma in _EXTRAS.items():
        mapa[clave] = forma
    return mapa


def _capitalizar(palabra: str) -> str:
    if not palabra:
        return palabra
    return palabra[0].upper() + palabra[1:]


def _es_sigla(token: str) -> bool:
    letras = [c for c in token if c.isalpha()]
    return len(letras) >= 2 and all(c.isupper() for c in letras) and not any(c.islower() for c in token)


def _forma(token: str) -> tuple[str, str]:
    if _MEDIDA.match(token) or any(ch.isdigit() for ch in token):
        return token, "medida"
    clave = _fold(token)
    if re.fullmatch(r"[xX]", token):
        return "x", "comun"
    preferido = _preferidos().get(clave)
    if preferido:
        if preferido[:1].isupper() and preferido[1:].lower() == preferido[1:]:
            return preferido, "propio"
        return preferido, "comun"
    if _es_sigla(token):
        return token, "sigla"
    return token.lower(), "comun"


def formatear_descripcion(texto: str) -> str:
    """Primera letra de cada tramo en mayúscula. Siglas, marcas y medidas quedan como son."""
    crudo = str(texto or "").strip()
    if not crudo:
        return ""
    partes = re.split(r"([·•|;\n])", crudo)
    salida = []
    for parte in partes:
        if parte in _SEPARADORES or parte == "":
            salida.append(parte)
            continue
        trozos = re.split(r"(\s+)", parte)
        inicio = True
        armado = []
        for trozo in trozos:
            if trozo == "" or trozo.isspace():
                armado.append(trozo)
                continue
            borde = _BORDE.match(trozo)
            izq, nucleo, der = borde.groups() if borde and borde.group(2) else ("", trozo, "")
            if not nucleo:
                armado.append(trozo)
                continue
            forma, tipo = _forma(nucleo)
            if inicio and tipo == "comun":
                forma = _capitalizar(forma)
            if any(c.isalpha() for c in nucleo):
                inicio = False
            armado.append(f"{izq}{forma}{der}")
        salida.append("".join(armado))
    return "".join(salida)[:500]
