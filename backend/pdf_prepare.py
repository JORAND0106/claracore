"""
Preparación de PDF al cargar: detección de firma digital certificada y
compresión condicionada.

Orden requerido por negocio:
  1) Detectar firma criptográfica (PAdES / PKCS#7 / campo /Sig)
  2) Si hay firma certificada → no modificar; peso = original
  3) Si no → comprimir imágenes embebidas; peso = resultado
  4) El gate de cuota debe validarse sobre el peso FINAL (después de esto)

No implementa firma digital nativa; solo detecta firmas ya presentes.
"""
from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass
from typing import Optional

_log = logging.getLogger("claracore.pdf_prepare")

# Tope técnico de seguridad (antes y después de preparar). No es la cuota por contrato.
PDF_TECHNICAL_MAX_BYTES = 40 * 1024 * 1024

# Compresión de imágenes embebidas (solo PDFs sin firma certificada)
_JPEG_QUALITY = 58
_MAX_IMAGE_SIDE = 1600


@dataclass(frozen=True)
class PreparedPdf:
    data: bytes
    original_size: int
    final_size: int
    had_certified_signature: bool
    compressed: bool
    note: str = ""


class PdfPrepareError(ValueError):
    """Error de validación/preparación de PDF (mensaje listo para UI)."""


def _is_pdf_magic(data: bytes) -> bool:
    return bool(data) and data[:5] == b"%PDF-"


def pdf_has_certified_signature(data: bytes) -> bool:
    """
    True si el PDF contiene firma digital criptográfica verificable
    (campo de formulario /Sig, diccionario Type/Sig, PAdES/PKCS#7).

    Las firmas-imagen (escaneo o PNG/JPG insertado) NO activan esto.
    """
    if not data:
        return False

    # Señal fuerte en el binario (cubre firmas incrementalmente apendadas)
    sample = data if len(data) <= 8_000_000 else data[:4_000_000] + data[-4_000_000:]
    if re.search(br"/Type\s*/Sig\b", sample):
        return True
    if b"/ByteRange" in sample and b"/Contents" in sample:
        if (
            b"adbe.pkcs7" in sample
            or b"ETSI.CAdES" in sample
            or b"Adobe.PPKLite" in sample
            or b"Adobe.PPKMS" in sample
            or b"/SubFilter" in sample
        ):
            return True

    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data), strict=False)
    except Exception as exc:
        _log.debug("PdfReader no pudo abrir PDF para firmas: %s", exc)
        return False

    try:
        fields = reader.get_fields() or {}
        for field in fields.values():
            if not isinstance(field, dict):
                continue
            ft = field.get("/FT")
            if ft == "/Sig" or str(ft) == "/Sig":
                return True
            # Algunos lectores exponen /V como valor de firma
            v = field.get("/V")
            if v is not None and field.get("/Type") == "/Sig":
                return True
    except Exception as exc:
        _log.debug("get_fields firma: %s", exc)

    try:
        root = reader.trailer["/Root"]
        acro = root.get("/AcroForm")
        if acro is not None:
            acro_obj = acro.get_object() if hasattr(acro, "get_object") else acro
            sig_flags = acro_obj.get("/SigFlags")
            if sig_flags and int(sig_flags) & 1:
                # Bit 0: el documento tiene al menos una firma
                return True
            fields_arr = acro_obj.get("/Fields") or []
            for ref in fields_arr:
                try:
                    obj = ref.get_object() if hasattr(ref, "get_object") else ref
                    if obj.get("/FT") == "/Sig":
                        return True
                except Exception:
                    continue
    except Exception as exc:
        _log.debug("AcroForm firma: %s", exc)

    return False


def _compress_pdf_pymupdf(data: bytes) -> bytes:
    import fitz  # pymupdf
    from PIL import Image

    doc = fitz.open(stream=data, filetype="pdf")
    try:
        for page in doc:
            for img in page.get_images(full=True):
                xref = int(img[0])
                try:
                    pix = fitz.Pixmap(doc, xref)
                except Exception:
                    continue
                try:
                    if pix.width < 2 or pix.height < 2:
                        continue
                    if pix.n - pix.alpha >= 4:  # CMYK / etc.
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    mode = "RGBA" if pix.alpha else "RGB"
                    im = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
                    if im.mode == "RGBA":
                        bg = Image.new("RGB", im.size, (255, 255, 255))
                        bg.paste(im, mask=im.split()[-1])
                        im = bg
                    elif im.mode != "RGB":
                        im = im.convert("RGB")

                    w, h = im.size
                    longest = max(w, h)
                    if longest > _MAX_IMAGE_SIDE:
                        scale = _MAX_IMAGE_SIDE / float(longest)
                        im = im.resize(
                            (max(1, int(w * scale)), max(1, int(h * scale))),
                            Image.Resampling.LANCZOS,
                        )

                    buf = io.BytesIO()
                    im.save(buf, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
                    jpeg_bytes = buf.getvalue()
                    # Evitar agrandar una imagen ya pequeña/optimizada
                    try:
                        raw_len = len(pix.tobytes())
                    except Exception:
                        raw_len = w * h * 3
                    if len(jpeg_bytes) >= raw_len * 0.95 and longest <= _MAX_IMAGE_SIDE:
                        continue
                    try:
                        page.replace_image(xref, stream=jpeg_bytes)
                    except Exception:
                        try:
                            doc.update_stream(xref, jpeg_bytes)
                        except Exception:
                            continue
                finally:
                    pix = None  # noqa: F841 — liberar cuanto antes
        out = io.BytesIO()
        doc.save(
            out,
            garbage=4,
            deflate=True,
            clean=True,
            pretty=False,
            no_new_id=True,
        )
        return out.getvalue()
    finally:
        doc.close()


def _compress_pdf_pypdf_fallback(data: bytes) -> bytes:
    """Reescritura con deflate/garbage; poco agresiva pero sin deps extra."""
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(data), strict=False)
    writer = PdfWriter()
    for page in reader.pages:
        try:
            page.compress_content_streams()
        except Exception:
            pass
        writer.add_page(page)
    try:
        writer.compress_identical_objects(
            remove_duplicates=True, remove_unreferenced=True
        )
    except TypeError:
        try:
            writer.compress_identical_objects(
                remove_identicals=True, remove_orphans=True
            )
        except Exception:
            pass
    except Exception:
        pass
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def compress_pdf_images(data: bytes) -> tuple[bytes, str]:
    """
    Comprime imágenes embebidas preservando texto/vectores.
    Devuelve (bytes, motor_usado). Si no logra reducir, devuelve el original.
    """
    engines = []
    try:
        import fitz  # noqa: F401

        engines.append(("pymupdf", _compress_pdf_pymupdf))
    except Exception:
        pass
    engines.append(("pypdf", _compress_pdf_pypdf_fallback))

    best = data
    used = "none"
    for name, fn in engines:
        try:
            candidate = fn(data)
            if candidate and len(candidate) < len(best):
                best = candidate
                used = name
                # pymupdf suele bastar; si ya redujo, no hace falta el fallback
                if name == "pymupdf":
                    break
        except Exception as exc:
            _log.warning("compresión PDF con %s falló: %s", name, exc)
    return best, used


def prepare_pdf_for_storage(
    data: bytes,
    *,
    technical_max_bytes: int = PDF_TECHNICAL_MAX_BYTES,
) -> PreparedPdf:
    """
    Pipeline completo previo al gate de cuota / upload.

    Raises PdfPrepareError si el archivo no es PDF válido o supera el tope técnico.
    """
    if not data:
        raise PdfPrepareError("El PDF está vacío.")
    if not _is_pdf_magic(data):
        raise PdfPrepareError("El archivo no parece un PDF válido.")
    original = len(data)
    if original > int(technical_max_bytes):
        mb = int(technical_max_bytes) // (1024 * 1024)
        raise PdfPrepareError(
            f"El PDF supera el máximo técnico permitido ({mb} MB)."
        )

    signed = pdf_has_certified_signature(data)
    if signed:
        return PreparedPdf(
            data=data,
            original_size=original,
            final_size=original,
            had_certified_signature=True,
            compressed=False,
            note="firma_certificada_intacta",
        )

    compressed_data, engine = compress_pdf_images(data)
    if not compressed_data or not _is_pdf_magic(compressed_data):
        compressed_data = data
        engine = "none"
    # Nunca devolver algo más grande que el original
    if len(compressed_data) >= original:
        compressed_data = data
        did = False
        note = f"sin_reduccion({engine})"
    else:
        did = compressed_data is not data and len(compressed_data) < original
        note = f"comprimido:{engine}"

    final = compressed_data
    if len(final) > int(technical_max_bytes):
        mb = int(technical_max_bytes) // (1024 * 1024)
        raise PdfPrepareError(
            f"El PDF sigue superando el máximo técnico ({mb} MB) tras la preparación."
        )

    return PreparedPdf(
        data=final,
        original_size=original,
        final_size=len(final),
        had_certified_signature=False,
        compressed=did,
        note=note,
    )


def prepare_pdf_bytes_or_raise(data: bytes) -> bytes:
    """Atajo: devuelve solo los bytes finales o lanza PdfPrepareError."""
    return prepare_pdf_for_storage(data).data
