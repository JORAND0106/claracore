"""
Rutas HTTP de AVI — montadas en main.py con prefijo /avi.

Endpoints:
  POST /avi/chat     — enviar mensaje a Clara (JWT requerido)
  GET  /avi/status   — cupo restante del día sin llamar a Anthropic (JWT requerido)
  POST /avi/feedback — registrar encuesta de satisfacción al cerrar (JWT requerido)
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from main import get_current_user, supabase
from avi_service import (
    _avi_daily_limit,
    llamar_avi,
    registrar_conversacion,
    verificar_y_registrar_uso,
)

_log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/avi", tags=["AVI"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _uid(current_user) -> str:
    """Extrae el sub del JWT como string. Mismo patrón que prog_obra_routes.py."""
    sub = current_user.get("sub")
    if sub is None:
        raise HTTPException(status_code=401, detail="Token inválido")
    return str(sub)


# ── Modelos Pydantic ──────────────────────────────────────────────────────────

class AviChatRequest(BaseModel):
    mensaje: str = Field(..., min_length=1, max_length=2000)
    modulo_actual: str = Field(default="general", max_length=64)
    historial: List[dict] = Field(default_factory=list)
    imagen_base64: Optional[str] = Field(default=None)


class AviChatResponse(BaseModel):
    respuesta: str
    mensajes_restantes_hoy: int


class AviStatusResponse(BaseModel):
    mensajes_restantes_hoy: int
    limite_diario: int
    bienvenida_pendiente: bool


class AviFeedbackRequest(BaseModel):
    util: bool
    comentario: Optional[str] = Field(default=None, max_length=500)
    modulo: str = Field(default="general", max_length=64)


# ── POST /avi/chat ────────────────────────────────────────────────────────────

@router.post("/chat", response_model=AviChatResponse)
async def avi_chat(
    body: AviChatRequest,
    current_user=Depends(get_current_user),
):
    """
    Envía un mensaje a AVI y retorna la respuesta de Claude Haiku.

    Flujo:
      1. Extraer usuario_id del JWT
      2. Verificar límite diario (puede lanzar 429)
      3. Construir mensajes + validar imagen (puede lanzar 400)
      4. Llamar a Anthropic (puede lanzar 502)
      5. Fire-and-forget: registrar conversación con tokens en Supabase
      6. Retornar respuesta + mensajes restantes
    """
    usuario_id = _uid(current_user)

    # 1 · Límite diario — lanza 429 si se agotó
    mensajes_restantes = await verificar_y_registrar_uso(usuario_id, supabase)

    # 2 · Llamada a Anthropic — lanza 400 (imagen inválida) o 502 (API caída)
    respuesta, tiene_imagen, tokens_in, tokens_out = await llamar_avi(
        mensaje=body.mensaje,
        modulo_actual=body.modulo_actual,
        historial=body.historial,
        imagen_base64=body.imagen_base64,
    )

    # 3 · Registrar conversación de forma asíncrona — nunca bloquea la respuesta
    asyncio.create_task(
        registrar_conversacion(
            usuario_id=usuario_id,
            modulo=body.modulo_actual,
            pregunta=body.mensaje,
            respuesta=respuesta,
            tiene_imagen=tiene_imagen,
            tokens_input=tokens_in,
            tokens_output=tokens_out,
            supabase_client=supabase,
        )
    )

    return AviChatResponse(
        respuesta=respuesta,
        mensajes_restantes_hoy=mensajes_restantes,
    )


# ── GET /avi/status ───────────────────────────────────────────────────────────

@router.get("/status", response_model=AviStatusResponse)
async def avi_status(current_user=Depends(get_current_user)):
    """
    Retorna el cupo de mensajes AVI del día para el usuario.

    No realiza ninguna llamada a Anthropic: solo consulta avi_uso_diario.
    Útil para que el frontend muestre el badge antes de que el usuario
    abra el panel (sin gastar tokens).

    bienvenida_pendiente siempre es True desde el backend; el frontend
    decide si ya mostró el mensaje de bienvenida en esta sesión.
    """
    usuario_id = _uid(current_user)
    limit = _avi_daily_limit()
    today = str(date.today())

    try:
        resultado = (
            supabase
            .table("avi_uso_diario")
            .select("conteo")
            .eq("usuario_id", usuario_id)
            .eq("fecha", today)
            .execute()
        )
        conteo_hoy = resultado.data[0]["conteo"] if resultado.data else 0
    except Exception as exc:
        _log.warning("AVI status: no se pudo consultar uso_diario — %s", exc)
        conteo_hoy = 0

    mensajes_restantes = max(0, limit - conteo_hoy)

    return AviStatusResponse(
        mensajes_restantes_hoy=mensajes_restantes,
        limite_diario=limit,
        bienvenida_pendiente=True,
    )


# ── POST /avi/feedback ────────────────────────────────────────────────────────

@router.post("/feedback")
async def avi_feedback(
    body: AviFeedbackRequest,
    current_user=Depends(get_current_user),
):
    """
    Registra la encuesta de satisfacción que aparece al cerrar el panel de Clara.

    Endpoint liviano: solo escribe en avi_feedback, sin llamadas a Anthropic.
    Si el insert falla retorna 502 para que el frontend pueda ignorarlo con gracia.
    """
    usuario_id = _uid(current_user)

    try:
        supabase.table("avi_feedback").insert({
            "usuario_id": usuario_id,
            "util": body.util,
            "comentario": body.comentario,
            "modulo": body.modulo,
        }).execute()
    except Exception as exc:
        _log.warning("AVI feedback: error al insertar — %s", exc)
        raise HTTPException(status_code=502, detail="No se pudo guardar el feedback")

    return {"ok": True}
