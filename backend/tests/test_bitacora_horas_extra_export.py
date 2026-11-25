"""Tests unitarios — informe horas extras Bitácora."""
from bitacora_horas_extra_export import (
    CODIGO_FORMATO_HORAS_EXTRA,
    _key_empresa,
    construir_filas_horas_extra,
    empresas_con_personal_reportado,
    filas_informe_agrupadas,
)


def test_key_empresa_normaliza():
    assert _key_empresa("Empresa A") == _key_empresa("  empresa   a ")
    assert _key_empresa("") == "__sin_empresa__"


def test_excluye_3110_2026_solo_contrato_3():
    """CTO 3 · 31/10/2026 no entra al informe; 14/11 y otros contratos sí."""
    from bitacora_horario import horario_default

    h = horario_default()
    # Sábado 31/10: sin jornada → calc daría 9h; debe excluirse solo en cto 3.
    dia_3110 = {
        "tipo": "diario",
        "fecha": "2026-10-31",
        "contrato_id": 3,
        "horario_aplicado": h,
        "asistencia_colaboradores": [{
            "nombre": "Ana Perez",
            "documento_numero": "222",
            "subcontratista_nombre": "Empresa A",
            "hora_ingreso": "07:30",
            "hora_salida": "16:30",
            "horas_extra": 0,
            "justificacion_horas_extra": "",
        }],
    }
    dia_1411 = {
        "tipo": "diario",
        "fecha": "2026-11-14",
        "contrato_id": 3,
        "horario_aplicado": h,
        "asistencia_colaboradores": [{
            "nombre": "Ana Perez",
            "documento_numero": "222",
            "subcontratista_nombre": "Empresa A",
            "hora_ingreso": "07:30",
            "hora_salida": "19:30",
            "horas_extra": 3.0,
            "justificacion_horas_extra": "Cierre",
        }],
    }
    # Sin contrato_id explícito: se toma del diario → excluido
    filas_cto3 = construir_filas_horas_extra(
        [dia_3110, dia_1411],
        empresa_key="Empresa A",
        contrato_id=3,
    )
    assert len(filas_cto3) == 1
    assert filas_cto3[0]["fecha"] == "2026-11-14"
    assert filas_cto3[0]["tiempo_extra"] == 3.0
    vista = filas_informe_agrupadas(filas_cto3)
    assert vista[-1]["tipo"] == "total"
    assert vista[-1]["tiempo_extra"] == 3.0
    assert all(r.get("fecha") != "2026-10-31" for r in vista if r.get("tipo") == "detalle")

    # Otro contrato el mismo día: sí aparece (9h extra por sábado no laborable)
    dia_otro = {**dia_3110, "contrato_id": 99}
    filas_otro = construir_filas_horas_extra(
        [dia_otro],
        empresa_key="Empresa A",
        contrato_id=99,
    )
    assert len(filas_otro) == 1
    assert filas_otro[0]["fecha"] == "2026-10-31"
    assert filas_otro[0]["tiempo_extra"] == 9.0


def test_construir_filas_solo_con_extra_ordenado_por_colaborador():
    diarios = [
        {
            "tipo": "diario",
            "fecha": "2026-11-12",
            "horario_aplicado": None,
            "asistencia_colaboradores": [
                {
                    "nombre": "Zeta Lopez",
                    "documento_numero": "11.1",
                    "subcontratista_nombre": "Empresa A",
                    "hora_ingreso": "07:30",
                    "hora_salida": "19:30",
                    "horas_extra": 2.5,
                    "justificacion_horas_extra": "Obra nocturna",
                },
                {
                    "nombre": "Ana Perez",
                    "documento_numero": "222",
                    "subcontratista_nombre": "Empresa A",
                    "hora_ingreso": "07:30",
                    "hora_salida": "16:30",
                    "horas_extra": 0,
                },
            ],
        },
        {
            "tipo": "diario",
            "fecha": "2026-11-11",
            "asistencia_colaboradores": [
                {
                    "nombre": "Ana Perez",
                    "documento_numero": "222",
                    "subcontratista_nombre": "Empresa A",
                    "hora_ingreso": "07:00",
                    "hora_salida": "19:00",
                    "horas_extra": 1.5,
                    "justificacion_horas_extra": "Cierre de tramo",
                },
                {
                    "nombre": "Luis Mora",
                    "subcontratista_nombre": "Empresa B",
                    "hora_ingreso": "07:30",
                    "hora_salida": "20:00",
                    "horas_extra": 3,
                    "justificacion_horas_extra": "Emergencia",
                },
            ],
        },
        {
            "tipo": "evento",
            "fecha": "2026-11-10",
            "asistencia_colaboradores": [
                {"nombre": "X", "horas_extra": 9, "justificacion_horas_extra": "no"},
            ],
        },
    ]
    filas = construir_filas_horas_extra(diarios, empresa_key="Empresa A")
    assert len(filas) == 2
    # Orden: colaborador (Ana) luego Zeta; fechas cronológicas dentro del grupo
    assert filas[0]["nombre"] == "Ana Perez"
    assert filas[0]["fecha"] == "2026-11-11"
    assert filas[0]["tiempo_extra"] == 1.5
    assert filas[1]["nombre"] == "Zeta Lopez"
    assert filas[1]["documento"] == "111"

    otras = construir_filas_horas_extra(diarios, empresa_key="Empresa B")
    assert len(otras) == 1
    assert otras[0]["nombre"] == "Luis Mora"

    vacio = construir_filas_horas_extra(diarios, empresa_key="No Existe")
    assert vacio == []


def test_filas_informe_agrupadas_subtotales_y_total():
    detalle = [
        {
            "nombre": "Ana Perez",
            "documento": "222",
            "fecha": "2026-11-11",
            "hora_inicio": "07:00",
            "hora_fin": "19:00",
            "tiempo_extra": 1.5,
            "observacion": "Cierre",
        },
        {
            "nombre": "Ana Perez",
            "documento": "222",
            "fecha": "2026-11-12",
            "hora_inicio": "07:00",
            "hora_fin": "18:00",
            "tiempo_extra": 0.5,
            "observacion": "Extra",
        },
        {
            "nombre": "Zeta Lopez",
            "documento": "111",
            "fecha": "2026-11-12",
            "hora_inicio": "07:30",
            "hora_fin": "19:30",
            "tiempo_extra": 2.5,
            "observacion": "Noche",
        },
    ]
    vista = filas_informe_agrupadas(detalle)
    tipos = [r["tipo"] for r in vista]
    assert tipos == ["detalle", "detalle", "subtotal", "detalle", "subtotal", "total"]
    # No cuenta colaboradores
    assert vista[0]["no"] == 1 and vista[1]["no"] == 1
    assert vista[3]["no"] == 2
    assert vista[2]["tiempo_extra"] == 2.0  # Ana 1.5+0.5
    assert vista[2]["observacion"] == "Subtotal"
    assert vista[4]["tiempo_extra"] == 2.5
    assert vista[5]["tiempo_extra"] == 4.5
    assert vista[5]["observacion"] == "Total general"
    # Nombre/doc en cada detalle del grupo
    assert vista[0]["nombre"] == vista[1]["nombre"] == "Ana Perez"
    assert vista[0]["documento"] == vista[1]["documento"] == "222"


def _payload_vista(vista, **extra):
    base = {
        "contrato": {"numero": "CTO-1", "objeto": "Obra", "contratista": "X"},
        "empresa": "Empresa A",
        "fecha_desde": "2026-11-01",
        "fecha_hasta": "2026-11-30",
        "responsable": {"nombre": "R"},
        "elaboro": {"nombre": "E", "cargo": "Aux"},
        "aprobo": {"nombre": "A", "cargo": "Dir"},
        "filas": vista,
        "formato": {
            "codigo": CODIGO_FORMATO_HORAS_EXTRA,
            "version": "1.0",
            "titulo": "INFORME DE HORAS EXTRAS DEL PERSONAL",
        },
    }
    base.update(extra)
    return base


def test_nombre_persona_corrige_espanol():
    from bitacora_horas_extra_export import _nombre_persona_informe

    assert _nombre_persona_informe("Gustavo EspaÑOl Alba") == "Gustavo Español Alba"
    assert _nombre_persona_informe("JOSÉ MARÍA NÚÑEZ") == "José María Núñez"
    assert _nombre_persona_informe("Luis Lopez") == "Luis Lopez"
    assert _nombre_persona_informe("Director De Obra") == "Director de Obra"


def test_html_pdf_sin_margenes_y_firmas_con_total():
    from bitacora_horas_extra_export import _html_informe

    detalle = [
        {
            "nombre": "Ana Perez",
            "documento": "222",
            "fecha": "2026-11-11",
            "hora_inicio": "07:00",
            "hora_fin": "19:00",
            "tiempo_extra": 1.5,
            "observacion": "Cierre",
        },
        {
            "nombre": "Zeta Lopez",
            "documento": "111",
            "fecha": "2026-11-12",
            "hora_inicio": "07:30",
            "hora_fin": "19:30",
            "tiempo_extra": 2.5,
            "observacion": "Noche",
        },
    ]
    vista = filas_informe_agrupadas(detalle)
    html = _html_informe(_payload_vista(
        vista,
        aprobo={"nombre": "Gustavo EspaÑOl Alba", "cargo": "Director de Obra"},
    ))
    assert "margin: 2mm" in html
    assert "margin: 12mm" not in html
    assert 'class="firmas"' in html
    assert 'class="firmas-row"' not in html
    assert "firma-line" in html
    assert "firma-sp" in html
    assert 'class="closing"' in html
    assert 'class="subtotal' in html
    assert 'class="total"' in html
    assert "page-break-before:always" not in html
    assert "Gustavo Español Alba" in html
    assert "EspaÑOl" not in html
    assert html.index("Total general") < html.index('class="firmas"')
    assert "Aprobó" in html


def test_html_multipagina_empaque_sin_salto_forzado():
    """Muchas filas: empaque por altura; sin page-break-before:always; cierre con firmas."""
    from bitacora_horas_extra_export import _html_hojas_horas_extra, generar_pdf_horas_extra

    detalle = []
    for i in range(40):
        for d in range(2):
            detalle.append({
                "nombre": f"Colab {i:02d}",
                "documento": str(1000 + i),
                "fecha": f"2026-11-{d + 1:02d}",
                "hora_inicio": "07:30",
                "hora_fin": "19:30",
                "tiempo_extra": 2.0,
                "observacion": "Extra",
            })
    vista = filas_informe_agrupadas(detalle)
    hojas = _html_hojas_horas_extra(_payload_vista(vista))
    assert len(hojas) >= 1
    assert all("page-break-before:always" not in h for h in hojas)
    assert 'class="hdr"' in hojas[0]
    assert 'class="grid"' in hojas[0]
    last_html = hojas[-1]
    assert "Total general" in last_html and "Elaboró" in last_html
    assert 'class="firmas"' in last_html
    assert last_html.index("Total general") < last_html.index('class="firmas"')

    pdf = generar_pdf_horas_extra(_payload_vista(vista))
    assert pdf[:4] == b"%PDF"
    from pypdf import PdfReader
    import io
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) >= 2
    # Cada página del PDF fusionado es una parte de 1 hoja (sin huérfanos de firmas)
    for page in reader.pages:
        text = page.extract_text() or ""
        if "Elaboró" in text:
            assert "Total general" in text
    p1 = reader.pages[0].extract_text() or ""
    assert "INFORME" in p1
    assert ("Contrato" in p1) or ("Nombre colaborador" in p1)
    last = reader.pages[-1].extract_text() or ""
    assert "Total general" in last and "Elaboró" in last


def test_pdf_no_huerfano_cuando_cierre_cabe():
    """Regresión: bloque que cabe no debe ir solo a la hoja siguiente."""
    from bitacora_horas_extra_export import generar_pdf_horas_extra
    from pypdf import PdfReader
    import io

    # 10 colab × 2 días = 30 filas de cuerpo: antes forzaba page-break-always.
    detalle = []
    for i in range(10):
        for d in range(2):
            detalle.append({
                "nombre": f"Colab {i:02d}",
                "documento": str(1000 + i),
                "fecha": f"2026-11-{10 + d:02d}",
                "hora_inicio": "07:30",
                "hora_fin": "19:30",
                "tiempo_extra": 2.0,
                "observacion": "Extra",
            })
    pdf = generar_pdf_horas_extra(_payload_vista(filas_informe_agrupadas(detalle)))
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) == 1
    text = reader.pages[0].extract_text() or ""
    assert "Total general" in text and "Elaboró" in text and "Colab 09" in text


def test_pdf_generacion_rapida_informe_largo():
    from bitacora_horas_extra_export import generar_pdf_horas_extra
    import time

    detalle = []
    for i in range(50):
        for d in range(4):
            detalle.append({
                "nombre": f"Colab {i:03d}",
                "documento": str(2000 + i),
                "fecha": f"2026-11-{d + 1:02d}",
                "hora_inicio": "07:30",
                "hora_fin": "19:30",
                "tiempo_extra": 1.5,
                "observacion": "Jornada extendida",
            })
    vista = filas_informe_agrupadas(detalle)
    payload = _payload_vista(vista)
    t0 = time.perf_counter()
    pdf = generar_pdf_horas_extra(payload)
    elapsed = time.perf_counter() - t0
    assert pdf[:4] == b"%PDF"
    assert elapsed < 10.0, f"PDF tardó {elapsed:.2f}s (límite 10s)"


def test_empresas_con_personal_reportado():
    diarios = [
        {
            "asistencia_colaboradores": [
                {"nombre": "A", "subcontratista_nombre": "Beta"},
                {"nombre": "B", "subcontratista_nombre": "Alpha"},
                {"nombre": "", "subcontratista_nombre": "Ignorar"},
            ],
        },
    ]
    emps = empresas_con_personal_reportado(diarios)
    nombres = [e["nombre"] for e in emps]
    assert nombres == ["Alpha", "Beta"]
    assert CODIGO_FORMATO_HORAS_EXTRA == "CC-BIT-HE-001"
