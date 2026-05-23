"""
Fuentes para /frase-del-dia, todo en español:
- Anthropic (si hay API key): reflexión, dato del día o consejo práctico.
- Red: versículo aleatorio RVR (esBiblia).
- Pool: citas de autores (traducidas o en español) + aforismos de obra (frases_pools).
"""
from __future__ import annotations

import json
import os
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


TIPOS_CONTENIDO_DIA = ("reflexion", "biblica", "motivadora", "dato", "consejo")

_PROMPTS_ANTHROPIC = {
    "reflexion": (
        "Genera UNA reflexión filosófica breve (máximo 2 oraciones) de un pensador, filósofo "
        "o escritor reconocido, relevante para personas que trabajan en obra, gestión o liderazgo. "
        "Incluye un autor real. "
        'Responde ÚNICAMENTE JSON válido: {"frase":"texto","autor":"Nombre del autor"}'
    ),
    "motivadora": (
        "Genera UNA frase motivadora célebre (máximo 2 oraciones) de un personaje histórico, "
        "científico, deportista, líder o pensador reconocido. La frase debe ser auténtica y "
        "atribuible a alguien real. "
        'Responde ÚNICAMENTE JSON válido: {"frase":"texto","autor":"Nombre del autor"}'
    ),
    "dato": (
        "Genera UN dato curioso, sorprendente o poco conocido sobre ingeniería civil, "
        "construcción, obra pública, urbanismo o infraestructura (Colombia o el mundo). "
        "Máximo 2-3 líneas, sin comillas envolventes en el texto. "
        'Responde ÚNICAMENTE JSON válido: {"frase":"texto del dato"}'
    ),
    "consejo": (
        "Genera UN consejo práctico y concreto para equipos de obra, interventoría o "
        "gestión de contratos de construcción en Colombia. Máximo 2-3 líneas. "
        'Responde ÚNICAMENTE JSON válido: {"frase":"texto del consejo"}'
    ),
}


def _parse_json_frase(texto: str) -> Optional[Dict[str, Any]]:
    if not texto:
        return None
    t = texto.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    try:
        j = json.loads(t)
        if isinstance(j, dict) and j.get("frase"):
            return j
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[^{}]*\"frase\"\s*:\s*\"[^\"]+\"[^{}]*\}", t, re.DOTALL)
    if m:
        try:
            j = json.loads(m.group(0))
            if j.get("frase"):
                return j
        except json.JSONDecodeError:
            pass
    return None


def frase_desde_anthropic(tipo: str) -> Optional[Dict[str, Any]]:
    """Contenido del día según tipo: reflexion | biblica | motivadora | dato | consejo."""
    if tipo not in TIPOS_CONTENIDO_DIA:
        return None

    # Citas bíblicas se obtienen de esBiblia, no de Anthropic
    if tipo == "biblica":
        return _esbiblia_random_verse()

    if tipo not in _PROMPTS_ANTHROPIC:
        return None

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    prompt = _PROMPTS_ANTHROPIC[tipo]
    try:
        res = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5",
                "max_tokens": 280,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=35.0,
        )
        data = res.json()
        if res.status_code >= 400:
            return None
        blocks = data.get("content") or []
        raw = (blocks[0].get("text") if blocks else "") or ""
        parsed = _parse_json_frase(raw)
        if not parsed or not parsed.get("frase"):
            return None
        out: Dict[str, Any] = {
            "frase": re.sub(r"\s+", " ", str(parsed["frase"]).strip()),
            "tipo": tipo,
        }
        if tipo in ("reflexion", "motivadora"):
            out["autor"] = str(parsed["autor"]).strip()[:120] if parsed.get("autor") else "Anónimo"
        else:
            out["autor"] = ""
        return out
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

    estrategia = random.choice(["biblia", "autor", "autor", "biblia", "autor"])
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
