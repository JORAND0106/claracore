"""Tests conversión a letras, IVA y generación PDF contrato licencia."""

from contrato_numero_letras import entero_en_letras, valor_pesos_en_letras, formato_pesos_cop
from contrato_documentos_service import calcular_valor_mensual_neto, iva_tasa_licencia_contrato, _iva_etiqueta_porcentaje
from contrato_documentos_pdf import (
    _normalizar_texto_final,
    _nit_claracore_display,
    construir_contexto_placeholders,
    generar_pdf_contrato_licencia,
    _formatear_lista_clausula,
    _desglosar_lineas_firma,
    _html_logo_celda,
    _dimensiones_logo_png,
    _escala_logo_px,
    _LOGO_ESCALA_COMPACTA,
)
from contrato_documentos_service import logo_claracore_path


def test_formato_pesos():
    assert formato_pesos_cop(1500000) == "1.500.000"
    assert formato_pesos_cop(0) == "0"


def test_valor_letras():
    assert "UN MILLÓN QUINIENTOS MIL PESOS" == valor_pesos_en_letras(1500000)
    assert valor_pesos_en_letras(0) == "CERO PESOS"
    assert "MIL" in valor_pesos_en_letras(1000)


def test_entero_letras_millones():
    assert "UN MILLÓN" in entero_en_letras(1_000_000)
    assert "DOS MILLONES" in entero_en_letras(2_000_000)


def test_calcular_neto_sin_iva():
    assert calcular_valor_mensual_neto(1500000, iva_incluido=False, tasa_iva=0.19) == 1500000


def test_calcular_neto_con_iva_incluido():
    assert calcular_valor_mensual_neto(1190000, iva_incluido=True, tasa_iva=0.19) == 1000000
    assert calcular_valor_mensual_neto(1190001, iva_incluido=True, tasa_iva=0.19) == 1000001


def test_iva_etiqueta():
    assert _iva_etiqueta_porcentaje(0.19) == "19%"


def test_iva_tasa_desde_contrato():
    assert iva_tasa_licencia_contrato({"iva": 0.05}) == 0.05
    assert iva_tasa_licencia_contrato({"iva": None}) == 0.19


def test_nit_claracore_en_tramite():
    assert _nit_claracore_display("") == "En trámite"
    assert _nit_claracore_display(None) == "En trámite"
    assert _nit_claracore_display("1") == "En trámite"
    assert _nit_claracore_display("901234567-8") == "901234567-8"


def test_fecha_inicio_placeholder():
    from contrato_documentos_pdf import _formatear_fecha_licencia_inicio

    assert _formatear_fecha_licencia_inicio("2026-07-06") == "6 de julio de 2026"
    assert _formatear_fecha_licencia_inicio(None) == "________________"
    ctx = construir_contexto_placeholders(
        licenciatario={"razon_social": "X", "fecha_inicio_licencia": "2026-01-15"},
        numero_contrato="CT-1",
    )
    assert ctx["{{FECHA_INICIO}}"] == "15 de enero de 2026"


def test_clausula4_sin_pesos_duplicados(monkeypatch):
    monkeypatch.delenv("CLARACORE_EMPRESA_NIT", raising=False)
    ctx = construir_contexto_placeholders(
        licenciatario={"razon_social": "X", "valor_mensual": 2_521_008},
        numero_contrato="CT-1",
    )
    letras = ctx["{{LIC_VALOR_MENSUAL_LETRAS}}"]
    assert letras.endswith(" PESOS")
    assert "PESOS pesos" not in letras
    texto = _normalizar_texto_final(
        f"CLÁUSULA 4. – VALOR: de {letras} pesos ($2.521.008)"
    )
    assert "PESOS pesos" not in texto


def test_normalizar_portada_y_firmas():
    raw = (
        "TECNOLÓGICAModalidad (SaaS)PLATAFORMA CLARACOREContrato N.° IDU-1551-2017Bogotá D.C., 5 de julio de 2026"
        "EL LICENCIANTEJorge Andrés Jaimes ArenasC.C. N.° 80.071.406 de BogotáRepresentante LegalCLARACORE SOLUTIONS S.A.S.NIT 1"
    )
    out = _normalizar_texto_final(raw)
    assert "TECNOLÓGICAModalidad" not in out
    assert "2017Bogotá" not in out
    assert "ArenasC.C." not in out
    assert "LegalCLARACORE" not in out
    assert "S.A.S.NIT" not in out


def test_lista_clausula_8_y_11():
    c8 = (
        " – OBLIGACIONES DEL LICENCIANTE SOBRE LOS DATOS: EL LICENCIANTE se obliga a: "
        "Implementar medidas técnicas;No divulgar información;Realizar copias"
    )
    html8 = _formatear_lista_clausula(c8)
    assert "<ul" in html8
    assert "Implementar medidas técnicas" in html8
    assert "No divulgar información" in html8
    assert html8.index("se obliga a:") < html8.index("<ul")

    c11 = (
        " – PROHIBICIONES: EL LICENCIATARIO se obliga a NO realizar ninguna de las siguientes conductas:"
        "Copiar, reproducir;Realizar ingeniería inversa;Sublicenciar"
    )
    html11 = _formatear_lista_clausula(c11)
    assert "conductas:" in html11
    assert "Copiar, reproducir" in html11
    assert html11.index("conductas:") < html11.index("Copiar")


def test_desglosar_firmas():
    raw = (
        "Jorge Andrés Jaimes ArenasC.C. N.° 80.071.406 de Bogotá"
        "Representante LegalCLARACORE SOLUTIONS S.A.S.NIT En trámite"
    )
    lines = _desglosar_lineas_firma(raw)
    assert len(lines) >= 4
    assert lines[0].endswith("Arenas")
    assert lines[1].startswith("C.C.")
    assert any("Representante Legal" in ln for ln in lines)


def test_logo_compacto_usa_dimensiones_explicitas():
    html = _html_logo_celda(compact=True)
    assert 'width="' in html and 'height="' in html
    nat_w, nat_h = _dimensiones_logo_png(logo_claracore_path())
    w_px, h_px = _escala_logo_px(nat_w, nat_h, compact=True)
    assert f'width="{w_px}"' in html
    assert f'height="{h_px}"' in html
    assert w_px <= int(nat_w * _LOGO_ESCALA_COMPACTA) + 1


def test_generar_pdf_bytes(monkeypatch):
    monkeypatch.delenv("CLARACORE_EMPRESA_NIT", raising=False)
    lic = {
        "razon_social": "EMPRESA TEST S.A.S.",
        "nit": "900123456-7",
        "representante_nombre": "Juan Perez",
        "representante_cedula": "1234567890",
        "direccion": "Calle 1",
        "email_notificaciones": "test@empresa.co",
        "identificacion_obra": "IDU-1551-2017",
        "valor_mensual": 2_521_008,
    }
    pdf = generar_pdf_contrato_licencia(licenciatario=lic, numero_contrato="IDU-1551-2017")
    assert pdf and len(pdf) > 5000


def test_pdf_tres_paginas_firmas_en_pagina_final(monkeypatch):
    from io import BytesIO

    try:
        from pypdf import PdfReader
    except ImportError:
        from PyPDF2 import PdfReader

    monkeypatch.delenv("CLARACORE_EMPRESA_NIT", raising=False)
    lic = {
        "razon_social": "UNION TEMPORAL MURCON",
        "nit": "900555123-4",
        "representante_nombre": "Carlos Ejemplo",
        "representante_cedula": "9876543210",
        "direccion": "Carrera 7 # 123-45",
        "email_notificaciones": "facturacion@murcon.co",
        "identificacion_obra": "IDU-1551-2017",
        "valor_mensual": 2_521_008,
    }
    pdf = generar_pdf_contrato_licencia(licenciatario=lic, numero_contrato="IDU-1551-2017")
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) == 3
    pagina3 = reader.pages[2].extract_text() or ""
    assert "En constancia de lo anterior" in pagina3
    assert "EL LICENCIANTE" in pagina3 and "EL LICENCIATARIO" in pagina3
    assert "CLÁUSULA 24" in pagina3
    assert "CLÁUSULA 21" in pagina3 or "CLÁUSULA 22" in pagina3 or "CLÁUSULA 23" in pagina3
