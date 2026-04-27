"""
Fuentes para /frase-del-dia, todo en español:
- Red: versículo aleatorio RVR (esBiblia).
- Pool: citas de autores (traducidas o en español) + aforismos de obra (frases_pools).
"""
from __future__ import annotations

import random
import re
from typing import Any, Dict, Optional

import httpx

UA = {"User-Agent": "ClaraCore/1.0", "Accept": "application/json"}
_TIMEOUT = 10.0


def _esbiblia_random_verse() -> Optional[Dict[str, Any]]:
    """RVR (Reina Valera) en español — esbiblia.net/api"""
    try:
        r = httpx.get(
            "https://esbiblia.net/api/random/?v=rvr",
            headers=UA,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        j = r.json()
        ve = j.get("verses") or j.get("verse") or [None]
        if isinstance(ve, dict):
            v0 = ve
        else:
            if not ve or not ve[0]:
                return None
            v0 = ve[0]
        txt = (v0.get("text") or "").strip()
        if not txt:
            return None
        lib = (v0.get("book_name") or v0.get("book_id") or "Biblia")[:64]
        ch = v0.get("chapter")
        vs = v0.get("verse")
        ref = f"{lib} {ch}:{vs} (RVR)" if ch is not None and vs is not None else f"{lib} (RVR)"
        return {
            "frase": re.sub(r"\s+", " ", txt),
            "autor": ref,
            "tipo": "bíblica",
        }
    except Exception:
        return None


def frase_dia_espanol() -> Dict[str, Any]:
    """
    Una frase del día 100% en español: mezcla versículo (red, si responde),
    cita de autor o aforismo de obra (pools locales).
    """
    from frases_pools import (  # type: ignore
        elige_aleatoria,
        elige_cita_autor,
    )

    estrategia = random.choice(["biblia", "autor", "general"])
    if estrategia == "biblia":
        f = _esbiblia_random_verse()
        if f and f.get("frase"):
            return f
        return elige_cita_autor() if random.random() < 0.6 else elige_aleatoria()
    if estrategia == "autor":
        return elige_cita_autor()
    return elige_aleatoria()


# Compat: nombre antiguo
def frase_desde_internet() -> Optional[Dict[str, Any]]:
    f = _esbiblia_random_verse()
    return f if f and f.get("frase") else None


def _pool_local_aleatoria() -> Optional[Dict[str, Any]]:
    from frases_pools import elige_cualquiera_espanol  # type: ignore

    return elige_cualquiera_espanol()
