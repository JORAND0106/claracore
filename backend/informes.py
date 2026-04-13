# backend/informes.py
# ── Módulo de Informes y Memorias ──

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from xhtml2pdf import pisa
import io
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()

router = APIRouter()

# Los endpoints se agregarán aquí
