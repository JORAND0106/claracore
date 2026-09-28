"""Presupuesto de compresión FO-EO-04: gráficos > fotos (tabla de coordenadas).

No importa el módulo completo `informes` (dependencias pesadas). Valida:
1) Constantes en fuente (presupuesto gráfico > foto).
2) Comportamiento de compresión con la misma lógica PIL que usa el PDF.
"""
from __future__ import annotations

import io
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
INFORMES_SRC = (ROOT / "informes.py").read_text(encoding="utf-8")


def _env_default(name: str) -> int:
    # Acepta asignación en una línea o int(_os.getenv(...)) multilínea.
    m = re.search(
        rf'{re.escape(name)}\s*=\s*int\(\s*_os\.getenv\(\s*"{re.escape(name)}"\s*,\s*"(\d+)"',
        INFORMES_SRC,
        flags=re.DOTALL,
    )
    assert m, f"no se encontró default de {name} en informes.py"
    return int(m.group(1))


def test_presupuesto_grafico_mayor_que_foto_en_fuente():
    foto_px = _env_default("FO_EO04_IMG_MAX_PX")
    foto_q = _env_default("FO_EO04_IMG_JPEG_Q")
    foto_b = _env_default("FO_EO04_IMG_MAX_BYTES")
    graf_px = _env_default("FO_EO04_GRAFICO_IMG_MAX_PX")
    graf_q = _env_default("FO_EO04_GRAFICO_IMG_JPEG_Q")
    graf_b = _env_default("FO_EO04_GRAFICO_IMG_MAX_BYTES")
    assert graf_px >= 1400
    assert graf_px > foto_px
    assert graf_q >= 85
    assert graf_q > foto_q
    assert graf_b >= 250_000
    assert graf_b > foto_b
    assert 'kind: str = "foto"' in INFORMES_SRC
    assert 'kind_norm in ("grafico", "esquema", "plano")' in INFORMES_SRC
    assert 'url_kind[gu] = "grafico"' in INFORMES_SRC


def _comprimir_como_informes(
    img_bytes: bytes,
    *,
    max_px: int,
    jpeg_q: int,
    max_bytes: int,
    min_px: int = 200,
    min_q: int = 38,
):
    """Réplica mínima de _comprimir_img_bytes_para_pdf (force_jpeg=True)."""
    from PIL import Image

    img = Image.open(io.BytesIO(img_bytes))
    img.load()

    def _encode(cur_img, cur_px: int, cur_q: int):
        w, h = cur_img.size
        if max(w, h) > cur_px:
            scale = cur_px / float(max(w, h))
            cur_img = cur_img.resize(
                (max(1, int(w * scale)), max(1, int(h * scale))),
                Image.Resampling.LANCZOS,
            )
        if cur_img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", cur_img.size, (255, 255, 255))
            if cur_img.mode == "P":
                cur_img = cur_img.convert("RGBA")
            if cur_img.mode in ("RGBA", "LA"):
                bg.paste(cur_img, mask=cur_img.split()[-1])
            else:
                bg.paste(cur_img)
            cur_img = bg
        else:
            cur_img = cur_img.convert("RGB")
        buf = io.BytesIO()
        cur_img.save(buf, format="JPEG", quality=cur_q, optimize=True)
        return buf.getvalue()

    cur_px, cur_q = int(max_px), int(jpeg_q)
    best = None
    for _ in range(14):
        out = _encode(img, cur_px, cur_q)
        best = out
        if len(out) <= max_bytes:
            return best
        if cur_q > min_q:
            cur_q = max(min_q, cur_q - 7)
        elif cur_px > min_px:
            cur_px = max(min_px, int(cur_px * 0.82))
            cur_q = int(jpeg_q)
        else:
            break
    return best


def _png_bytes(w: int = 2000, h: int = 1400) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (w, h), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 28)
    except Exception:
        font = ImageFont.load_default()
    draw.rectangle([40, 40, w - 40, 220], outline=(0, 119, 182), width=2)
    draw.text((60, 70), "Tabla de coordenadas", fill=(15, 23, 42), font=font)
    draw.text((60, 120), "N°  Norte        Este         Cota", fill=(0, 119, 182), font=font)
    draw.text((60, 160), "1   1045234.12  987654.32   2560.5", fill=(15, 23, 42), font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_comprimir_grafico_conserva_mas_resolucion_que_foto():
    pytest.importorskip("PIL")
    from PIL import Image

    raw = _png_bytes(2000, 1400)
    foto = _comprimir_como_informes(
        raw,
        max_px=_env_default("FO_EO04_IMG_MAX_PX"),
        jpeg_q=_env_default("FO_EO04_IMG_JPEG_Q"),
        max_bytes=_env_default("FO_EO04_IMG_MAX_BYTES"),
    )
    graf = _comprimir_como_informes(
        raw,
        max_px=_env_default("FO_EO04_GRAFICO_IMG_MAX_PX"),
        jpeg_q=_env_default("FO_EO04_GRAFICO_IMG_JPEG_Q"),
        max_bytes=_env_default("FO_EO04_GRAFICO_IMG_MAX_BYTES"),
        min_px=480,
        min_q=72,
    )
    assert foto and graf
    foto_img = Image.open(io.BytesIO(foto))
    graf_img = Image.open(io.BytesIO(graf))
    assert max(graf_img.size) > max(foto_img.size)
    assert max(graf_img.size) >= 1400
    assert len(graf) > len(foto)
