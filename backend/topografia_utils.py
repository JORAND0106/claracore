"""Utilidades de calculo y generacion de graficos para el modulo Topografia."""
from __future__ import annotations

import base64
import html
import io
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def gms_to_decimal(gms: float) -> float:
    """Convierte GG.MMSS a grados decimales."""
    grados = int(gms)
    minutos = int(round((gms - grados) * 100))
    segundos = round(((gms - grados) * 100 - minutos) * 100, 4)
    return grados + minutos / 60 + segundos / 3600


def decimal_to_gms(decimal: float) -> str:
    """Convierte grados decimales a formato GG.MMSS legible."""
    grados = int(decimal)
    minutos_dec = (decimal - grados) * 60
    minutos = int(minutos_dec)
    segundos = round((minutos_dec - minutos) * 60, 2)
    return f"{grados}°{minutos:02d}'{segundos:05.2f}\""


def azimut_to_decimal(azimut_gms: float) -> float:
    return gms_to_decimal(azimut_gms)


def angulo_a_radianes(decimal: float) -> float:
    return math.radians(decimal)


def area_por_coordenadas(puntos: list) -> float:
    """Calcula area por formula de Gauss. Retorna area en m2 (positiva siempre)."""
    n = len(puntos)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += puntos[i]["este"] * puntos[j]["norte"]
        area -= puntos[j]["este"] * puntos[i]["norte"]
    return abs(area) / 2.0


def perimetro_por_coordenadas(puntos: list) -> float:
    """Suma distancias entre vertices consecutivos."""
    n = len(puntos)
    if n < 2:
        return 0.0
    total = 0.0
    for i in range(n):
        j = (i + 1) % n
        dn = puntos[j]["norte"] - puntos[i]["norte"]
        de = puntos[j]["este"] - puntos[i]["este"]
        total += math.sqrt(dn * dn + de * de)
    return total


def interseccion_dos_puntos(
    n1: float, e1: float, az1_gms: float, dist1: float,
    n2: float, e2: float, az2_gms: float, dist2: float,
) -> dict:
    """Calcula la interseccion de dos visuales desde puntos conocidos."""
    az1 = math.radians(gms_to_decimal(az1_gms))
    az2 = math.radians(gms_to_decimal(az2_gms))

    n_calc1 = n1 + dist1 * math.cos(az1)
    e_calc1 = e1 + dist1 * math.sin(az1)

    n_calc2 = n2 + dist2 * math.cos(az2)
    e_calc2 = e2 + dist2 * math.sin(az2)

    n_final = (n_calc1 + n_calc2) / 2
    e_final = (e_calc1 + e_calc2) / 2

    error_n = abs(n_calc1 - n_calc2)
    error_e = abs(e_calc1 - e_calc2)
    error_lineal = math.sqrt(error_n**2 + error_e**2)

    distancia_promedio = (dist1 + dist2) / 2
    error_angular_rad = math.atan2(error_lineal / 2, max(distancia_promedio, 0.001))
    error_angular_seg = math.degrees(error_angular_rad) * 3600

    return {
        "norte": round(n_final, 4),
        "este": round(e_final, 4),
        "error_norte": round(error_n, 4),
        "error_este": round(error_e, 4),
        "error_lineal": round(error_lineal, 4),
        "error_angular_segundos": round(error_angular_seg, 2),
        "norte_desde_p1": round(n_calc1, 4),
        "este_desde_p1": round(e_calc1, 4),
        "norte_desde_p2": round(n_calc2, 4),
        "este_desde_p2": round(e_calc2, 4),
    }


def calcular_verificacion_nivel(resultados: dict, tolerancia_mm: float = 2.0, distancia_m: float = 30.0) -> dict:
    """Prueba del doble estadal (two-peg test)."""
    la1 = float(resultados.get("lectura_a_pos1", 0))
    lb1 = float(resultados.get("lectura_b_pos1", 0))
    la2 = float(resultados.get("lectura_a_pos2", 0))
    lb2 = float(resultados.get("lectura_b_pos2", 0))
    dist = float(resultados.get("distancia_estacas", distancia_m) or distancia_m)
    delta = abs((la1 - lb1) - (la2 - lb2))
    error_mm_m = (delta * 1000.0) / max(dist, 0.001)
    cumple = error_mm_m <= tolerancia_mm
    recomendacion = "Equipo apto para nivelacion." if cumple else "Calibrar o enviar a servicio tecnico."
    return {
        "error_colimacion_mm_m": round(error_mm_m, 4),
        "tolerancia_mm_m": tolerancia_mm,
        "cumple": cumple,
        "diagnostico": "CUMPLE" if cumple else "NO CUMPLE",
        "recomendacion": recomendacion,
    }


def calcular_verificacion_estacion_total(resultados: dict, tolerancia_seg: float = 30.0) -> dict:
    """Verificacion de colimacion horizontal e indice vertical."""
    dir_directa = gms_to_decimal(float(resultados.get("horizontal_directa_gms", 0)))
    dir_inversa = gms_to_decimal(float(resultados.get("horizontal_inversa_gms", 0)))
    vert_directa = gms_to_decimal(float(resultados.get("vertical_directa_gms", 0)))
    vert_inversa = gms_to_decimal(float(resultados.get("vertical_inversa_gms", 0)))

    error_colimacion = abs((dir_inversa - dir_directa + 180) % 360 - 180) * 3600
    error_indice = abs((vert_inversa - vert_directa + 360) % 360 - 180) * 3600

    cumple_col = error_colimacion <= tolerancia_seg
    cumple_ind = error_indice <= tolerancia_seg
    cumple = cumple_col and cumple_ind
    recomendacion = "Equipo apto para medicion." if cumple else "Calibrar o enviar a servicio tecnico."

    return {
        "error_colimacion_seg": round(error_colimacion, 2),
        "error_indice_seg": round(error_indice, 2),
        "tolerancia_seg": tolerancia_seg,
        "cumple": cumple,
        "diagnostico": "CUMPLE" if cumple else "NO CUMPLE",
        "recomendacion": recomendacion,
    }


def svg_poligono(puntos: list, width: int = 500, height: int = 400, titulo: str = "") -> str:
    """Genera SVG de un poligono con cuadricula automatica."""
    if not puntos:
        return f'<svg width="{width}" height="{height}"><text x="10" y="20">Sin puntos</text></svg>'

    nortes = [p["norte"] for p in puntos]
    estes = [p["este"] for p in puntos]
    min_n, max_n = min(nortes), max(nortes)
    min_e, max_e = min(estes), max(estes)
    pad = max((max_n - min_n), (max_e - min_e), 1) * 0.15
    min_n -= pad
    max_n += pad
    min_e -= pad
    max_e += pad

    def tx(e):
        return 40 + (e - min_e) / max(max_e - min_e, 0.001) * (width - 80)

    def ty(n):
        return height - 40 - (n - min_n) / max(max_n - min_n, 0.001) * (height - 80)

    coords = " ".join(f"{tx(p['este'])},{ty(p['norte'])}" for p in puntos)
    labels = ""
    for p in puntos:
        x, y = tx(p["este"]), ty(p["norte"])
        nombre = html.escape(str(p.get("nombre", "")))
        labels += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#2563eb"/>'
        labels += f'<text x="{x + 6:.1f}" y="{y - 6:.1f}" font-size="10" fill="#1e293b">{nombre}</text>'

    titulo_html = f'<text x="{width/2:.0f}" y="16" text-anchor="middle" font-size="12" fill="#334155">{html.escape(titulo)}</text>' if titulo else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<rect width="100%" height="100%" fill="#f8fafc"/>'
        f'{titulo_html}'
        f'<polygon points="{coords}" fill="rgba(37,99,235,0.15)" stroke="#2563eb" stroke-width="2"/>'
        f'{labels}'
        f'<text x="{width - 20}" y="24" font-size="10" fill="#64748b">N</text>'
        f'<line x1="{width - 20}" y1="30" x2="{width - 20}" y2="10" stroke="#64748b" stroke-width="1.5"/>'
        f"</svg>"
    )


def svg_interseccion(
    p1: dict, p2: dict, pn: dict,
    width: int = 500, height: int = 400,
) -> str:
    """SVG del triangulo de interseccion."""
    puntos = [
        {"nombre": p1.get("nombre", "P1"), "norte": p1["norte"], "este": p1["este"]},
        {"nombre": p2.get("nombre", "P2"), "norte": p2["norte"], "este": p2["este"]},
        {"nombre": pn.get("nombre", "XXX"), "norte": pn["norte"], "este": pn["este"]},
    ]
    return svg_poligono(puntos, width=width, height=height, titulo="Interseccion de coordenadas")


def matplotlib_poligono_base64(puntos: list, titulo: str = "") -> str:
    """Genera imagen PNG base64 de un poligono con matplotlib."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return ""

    if not puntos:
        return ""

    estes = [p["este"] for p in puntos] + [puntos[0]["este"]]
    nortes = [p["norte"] for p in puntos] + [puntos[0]["norte"]]
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(estes, nortes, "b-o", linewidth=1.5, markersize=5)
    for p in puntos:
        ax.annotate(str(p.get("nombre", "")), (p["este"], p["norte"]), fontsize=8, xytext=(4, 4), textcoords="offset points")
    ax.set_xlabel("Este")
    ax.set_ylabel("Norte")
    ax.set_title(titulo or "Plano topografico")
    ax.grid(True, alpha=0.3)
    ax.set_aspect("equal", adjustable="box")
    buf = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def html_encabezado_pdf(contrato: dict, titulo: str) -> str:
    """Encabezado comun para PDFs de topografia."""
    nombre = html.escape(str(contrato.get("objeto") or contrato.get("numero") or ""))
    numero = html.escape(str(contrato.get("numero") or ""))
    contratista = html.escape(str(contrato.get("contratista") or ""))
    interventoria = html.escape(str(contrato.get("interventoria") or ""))
    municipio = html.escape(str(contrato.get("municipio") or ""))
    departamento = html.escape(str(contrato.get("departamento") or ""))
    fecha = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    logo = contrato.get("logo_contratista") or ""
    logo_html = (
        f'<img src="{html.escape(str(logo), quote=True)}" style="max-height:60px;max-width:120px;" />'
        if logo else '<div style="border:1px dashed #cbd5e1;padding:8px;font-size:8pt;color:#94a3b8;">LOGO</div>'
    )
    return f"""
    <table width="100%" style="border-bottom:2px solid #1e40af;margin-bottom:12px;">
      <tr>
        <td width="20%" valign="top">{logo_html}</td>
        <td width="60%" align="center" valign="middle">
          <div style="font-size:14pt;font-weight:bold;color:#1e293b;">{html.escape(titulo)}</div>
          <div style="font-size:9pt;color:#475569;">{nombre}</div>
        </td>
        <td width="20%" align="right" valign="top" style="font-size:8pt;color:#64748b;">
          Contrato: {numero}<br/>
          {municipio}, {departamento}<br/>
          {fecha}
        </td>
      </tr>
      <tr>
        <td colspan="3" style="font-size:8pt;color:#475569;padding-top:4px;">
          Contratista: {contratista} | Interventoria: {interventoria}
        </td>
      </tr>
    </table>
    """


def html_pie_pdf(contrato: dict) -> str:
    nombre = html.escape(str(contrato.get("objeto") or contrato.get("numero") or ""))
    return f"""
    <div style="font-size:7pt;color:#64748b;text-align:center;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:6px;">
      Producto ClaraCore para el contrato {nombre}
    </div>
    """


def html_firmas_pdf(firmas: List[dict]) -> str:
    if not firmas:
        return ""
    rows = ""
    for f in firmas:
        img = f.get("firma_base64") or ""
        img_html = f'<img src="{html.escape(img, quote=True)}" style="max-height:50px;" />' if img else ""
        rows += f"""
        <td align="center" width="{100 // max(len(firmas), 1)}%">
          {img_html}<br/>
          <strong>{html.escape(str(f.get('nombre_firmante') or ''))}</strong><br/>
          <span style="font-size:8pt;">{html.escape(str(f.get('cargo_firmante') or ''))}</span><br/>
          <span style="font-size:7pt;">CPIC: {html.escape(str(f.get('matricula') or ''))}</span>
        </td>
        """
    return f'<table width="100%" style="margin-top:20px;"><tr>{rows}</tr></table>'


def to_pdf_bytes(html_doc: str) -> bytes:
    """Genera PDF con xhtml2pdf."""
    from xhtml2pdf import pisa

    buf = io.BytesIO()
    src = io.BytesIO(html_doc.encode("utf-8", errors="replace"))
    result = pisa.CreatePDF(src, dest=buf, encoding="utf-8")
    buf.seek(0)
    out = buf.read()
    if not out:
        raise ValueError("xhtml2pdf no produjo bytes")
    if getattr(result, "err", 0):
        pass
    return out
