"""
Generación estructurada de entidades del editor de esquema (Clara / Anthropic).
No produce imágenes: solo JSON de líneas, figuras, nodos, textos y seeds de hatch.
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException

_log = logging.getLogger("claracore.esquema_ia")

PX_PER_METER = 50
MAX_USOS = 20  # generaciones + ajustes por usuario / día (Bogotá)
BOGOTA = ZoneInfo("America/Bogota")
MAX_OBJECTS = 80
MAX_POINTS = 40
COORD_ABS = 20000.0
ALLOWED_AMBITOS = frozenset({
    "sicoe_registro",
    "sicoe_lote",
    "acta_idea",
    "bitacora",
    "ppto_grupo",
    "ppto_grupo_nuevo",
    "ppto_lote",
    "tarea_checklist",
    "compromiso",
    "general",
})
SHAPE_TYPES = frozenset({"linea", "flecha", "rect", "elipse", "triangulo"})
PATH_TYPES = frozenset({"polilinea", "stroke"})

SYSTEM_PROMPT = """Eres Clara, asistente de dibujo técnico 2D de ClaraCore (obra pública).
Tu única salida es un JSON válido, sin markdown, sin explicaciones, sin fences.

Formato exacto:
{"title":"texto corto","objects":[...],"hatches":[{"x":n,"y":n,"kind":0,"color":"#1e293b"}]}

Escala: 1 metro real = 50 unidades internas (world). Origen (0,0) arriba-izquierda; +X derecha; +Y abajo.
Coloca el conjunto cerca de (40,40) con holgura. No uses coordenadas negativas grandes.

Tipos permitidos en objects (nada más):
- linea | flecha: {type,x1,y1,x2,y2,color,width}
- rect | elipse | triangulo: {type,x1,y1,x2,y2,color,width}
  elipse: x1,y1,x2,y2 es el bounding box (el centro es el punto medio).
  triangulo: bounding box del triángulo isósceles.
- polilinea: {type,points:[{x,y},...],color,width}  (mínimo 2 puntos, máximo 40)
- nodo: {type,x,y,nodeNum,desc}
- texto: {type,x,y,w,h,text,color,fontSize}
- NO envíes image, bloque, tabla, hatchRegion ni maskDataUri.

hatches (opcional): semillas de relleno DESPUÉS de dibujar la geometría cerrada.
kind: 0=/ 1=\\ 2=cruz 3=puntos 4=horiz 5=sólido 6=ladrillo 7=césped.
El punto (x,y) debe quedar DENTRO de un recinto cerrado (rect, polilinea cerrada).

Medidas: interpreta 1.2, 1,2, 1.2m, 120cm, 1.2×1.2×2.0. Convierte a world = metros * 50.
Si el usuario da 3 dimensiones (caja/tanque), dibuja PLANTA y ALZADO en 2D (lado a lado), con textos "Planta" y "Alzado" y cotas. PROHIBIDO isométrico o perspectiva.

Cotas: líneas finas (width 1) + texto "1.20 m". Geometría principal width 2. Color líneas #1e293b, textos #0f172a.
Máximo 80 entidades. No inventes datos de obra (PK, ítems, cantidades) que el usuario no pidió.

Si modo=ajuste: parte de "scene" y aplica SOLO el cambio pedido. Devuelve la escena completa resultante (objects+hatches), sin el fondo raster.
Si modo=generacion: genera el esquema pedido. No borres entidades ajenas; solo describe las nuevas.

Si la instrucción es vacía o imposible, responde {"title":"Esquema","objects":[],"hatches":[]}.
"""


def _num(v: Any, default: float = 0.0) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    if n != n or abs(n) == float("inf"):  # noqa: PLR0124
        return default
    return max(-COORD_ABS, min(COORD_ABS, n))


def _int(v: Any, default: int = 0, lo: int = 0, hi: int = 99) -> int:
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        n = default
    return max(lo, min(hi, n))


def _color(v: Any, default: str = "#1e293b") -> str:
    s = str(v or "").strip()
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", s):
        return s.lower()
    return default


def _text(v: Any, maxlen: int = 160) -> str:
    return str(v or "").replace("\x00", "").strip()[:maxlen]


def sanitize_objects(raw: Any) -> list[dict]:
    out: list[dict] = []
    if not isinstance(raw, list):
        return out
    for item in raw[:MAX_OBJECTS]:
        if not isinstance(item, dict):
            continue
        t = str(item.get("type") or "").strip().lower()
        color = _color(item.get("color"))
        width = _num(item.get("width"), 2)
        width = max(0.5, min(16, width or 2))
        if t in SHAPE_TYPES:
            out.append({
                "type": t,
                "x1": _num(item.get("x1")),
                "y1": _num(item.get("y1")),
                "x2": _num(item.get("x2"), 40),
                "y2": _num(item.get("y2"), 40),
                "color": color,
                "width": width,
                "rotation": 0,
                "hatch": None,
            })
        elif t in PATH_TYPES:
            pts = item.get("points") if isinstance(item.get("points"), list) else []
            points = []
            for p in pts[:MAX_POINTS]:
                if not isinstance(p, dict):
                    continue
                points.append({"x": _num(p.get("x")), "y": _num(p.get("y"))})
            if len(points) < 2:
                continue
            out.append({
                "type": "polilinea" if t == "polilinea" else "stroke",
                "points": points,
                "color": color,
                "width": width,
            })
        elif t == "nodo":
            out.append({
                "type": "nodo",
                "x": _num(item.get("x")),
                "y": _num(item.get("y")),
                "nodeNum": str(item.get("nodeNum") or len(out) + 1)[:8],
                "desc": _text(item.get("desc"), 80),
                "color": color,
            })
        elif t == "texto":
            txt = _text(item.get("text"), 200)
            if not txt:
                continue
            out.append({
                "type": "texto",
                "x": _num(item.get("x")),
                "y": _num(item.get("y")),
                "w": max(40.0, _num(item.get("w"), 160)),
                "h": max(24.0, _num(item.get("h"), 40)),
                "text": txt,
                "color": _color(item.get("color"), "#0f172a"),
                "fontSize": max(10, min(28, _int(item.get("fontSize"), 14, 10, 28))),
                "rotation": 0,
            })
    return out


def sanitize_hatches(raw: Any) -> list[dict]:
    out: list[dict] = []
    if not isinstance(raw, list):
        return out
    for item in raw[:20]:
        if not isinstance(item, dict):
            continue
        out.append({
            "x": _num(item.get("x")),
            "y": _num(item.get("y")),
            "kind": _int(item.get("kind"), 0, 0, 7),
            "color": _color(item.get("color")),
        })
    return out


def parse_clara_json(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("Clara no devolvió JSON de entidades")
    data = json.loads(text[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("JSON de entidades inválido")
    objects = sanitize_objects(data.get("objects"))
    hatches = sanitize_hatches(data.get("hatches"))
    title = _text(data.get("title"), 80) or "Esquema"
    return {"title": title, "objects": objects, "hatches": hatches}


def compact_scene(scene: Any) -> list[dict]:
    """Reduce la escena enviada a Claude (sin rasters)."""
    out: list[dict] = []
    if not isinstance(scene, list):
        return out
    for item in scene[:MAX_OBJECTS]:
        if not isinstance(item, dict):
            continue
        t = str(item.get("type") or "")
        if t in ("image", "bloque"):
            continue
        if t == "hatchRegion":
            out.append({
                "type": "hatchRegion",
                "x": _num(item.get("x")),
                "y": _num(item.get("y")),
                "w": _num(item.get("w")),
                "h": _num(item.get("h")),
                "hatch": _int(item.get("hatch"), 0, 0, 7),
            })
            continue
        cleaned = sanitize_objects([item])
        out.extend(cleaned)
    return out


def fecha_bogota(ahora: Optional[datetime] = None) -> date:
    """Día calendario en America/Bogota (mismo criterio que bitácora y órdenes de pago)."""
    now = ahora or datetime.now(BOGOTA)
    if now.tzinfo is None:
        now = now.replace(tzinfo=BOGOTA)
    return now.astimezone(BOGOTA).date()


def remaining_hoy(usos: int) -> int:
    return max(0, MAX_USOS - max(0, int(usos or 0)))


def _cupo_payload(usos: int, fecha: Optional[date] = None) -> dict:
    u = max(0, int(usos or 0))
    return {
        "usos": u,
        "remaining": remaining_hoy(u),
        "blocked": u >= MAX_USOS,
        "max_usos": MAX_USOS,
        "fecha": str(fecha or fecha_bogota()),
    }


def normalize_ambito(raw: str) -> str:
    a = str(raw or "general").strip().lower()[:40]
    if a not in ALLOWED_AMBITOS:
        raise HTTPException(status_code=422, detail="Ámbito de documento no válido")
    return a


def normalize_doc_key(raw: str) -> str:
    key = re.sub(r"\s+", "-", str(raw or "").strip())[:120]
    if len(key) < 2:
        raise HTTPException(status_code=422, detail="Falta el documento/registro")
    return key


def _uso_row(sb, usuario_id: int, fecha: date) -> dict:
    rows = (
        sb.table("esquema_ia_uso_diario")
        .select("conteo")
        .eq("usuario_id", usuario_id)
        .eq("fecha", str(fecha))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else {"conteo": 0}


def leer_uso(sb, usuario_id: int) -> dict:
    fecha = fecha_bogota()
    try:
        row = _uso_row(sb, usuario_id, fecha)
    except Exception as exc:
        _log.warning("esquema_ia_uso_diario SELECT: %s", exc)
        row = {"conteo": 0}
    return _cupo_payload(int(row.get("conteo") or 0), fecha)


def registrar_uso(sb, usuario_id: int) -> dict:
    fecha = fecha_bogota()
    fecha_s = str(fecha)
    try:
        row = _uso_row(sb, usuario_id, fecha)
    except Exception as exc:
        _log.warning("esquema_ia_uso_diario SELECT: %s", exc)
        row = {"conteo": 0}
    usos = int(row.get("conteo") or 0)
    if usos >= MAX_USOS:
        raise HTTPException(
            status_code=429,
            detail="Hoy ya usó las 20 consultas de Dibujar con IA. Podrá volver a usarlo mañana.",
        )
    nuevo = usos + 1
    try:
        if usos > 0:
            sb.table("esquema_ia_uso_diario").update(
                {"conteo": nuevo, "updated_at": datetime.now(BOGOTA).isoformat()}
            ).eq("usuario_id", usuario_id).eq("fecha", fecha_s).execute()
        else:
            sb.table("esquema_ia_uso_diario").insert({
                "usuario_id": usuario_id,
                "fecha": fecha_s,
                "conteo": nuevo,
            }).execute()
    except Exception as exc:
        _log.error("esquema_ia_uso_diario WRITE: %s", exc)
    return _cupo_payload(nuevo, fecha)


async def generar_esquema_ia(
    *,
    instruccion: str,
    modo: str,
    scene: Optional[list] = None,
) -> dict:
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY no está configurada en el servidor.")
    try:
        import anthropic
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="Instale anthropic en el backend") from exc

    modo_n = "ajuste" if str(modo or "").strip().lower() == "ajuste" else "generacion"
    inst = (instruccion or "").strip()[:800]
    if not inst:
        raise HTTPException(status_code=422, detail="Escriba qué desea dibujar")

    user_parts = [f"modo={modo_n}", f"instruccion={inst}"]
    compact = compact_scene(scene)
    if compact:
        user_parts.append("scene=" + json.dumps(compact, ensure_ascii=False, separators=(",", ":")))
    user_msg = "\n".join(user_parts)

    model = (os.getenv("ESQUEMA_IA_MODEL") or os.getenv("ANTHROPIC_MODEL") or "claude-haiku-4-5").strip()
    client = anthropic.AsyncAnthropic(api_key=api_key)
    try:
        resp = await client.messages.create(
            model=model,
            max_tokens=4096,
            temperature=0,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as exc:
        low = str(exc).lower()
        _log.error("esquema IA Anthropic: %s", exc)
        if "credit" in low or "billing" in low:
            raise HTTPException(status_code=502, detail="Clara no tiene saldo de IA en este momento.") from exc
        raise HTTPException(status_code=502, detail="Clara no pudo generar el esquema. Intente de nuevo.") from exc

    raw = resp.content[0].text if resp.content else ""
    try:
        parsed = parse_clara_json(raw)
    except Exception as exc:
        _log.warning("esquema IA JSON: %s | raw=%s", exc, (raw or "")[:400])
        raise HTTPException(status_code=502, detail="Clara no devolvió un esquema válido. Reformule la instrucción.") from exc
    return parsed
