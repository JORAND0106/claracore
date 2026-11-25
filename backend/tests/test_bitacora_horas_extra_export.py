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
    html = _html_informe(_payload_vista(vista))
    assert "margin: 2mm" in html
    assert "margin: 12mm" not in html
    assert 'class="firmas-row"' in html
    assert 'class="closing"' in html
    assert "-pdf-keep-with-next:true" in html
    assert "page-break-after:avoid" in html
    assert "page-break-before:avoid" in html
    assert 'class="subtotal' in html
    assert 'class="total"' in html
    assert "page-break-before:always" not in html  # informe corto: una hoja
    closing = html[html.index('class="closing"'):]
    assert closing.index("Total general") < closing.index("Elaboró")
    assert "Aprobó" in closing


def test_html_multipagina_encabezado_unido_y_cierre_final():
    """Con muchas filas: keep-with-next en hdr/meta + cierre en hoja final."""
    from bitacora_horas_extra_export import _html_informe, generar_pdf_horas_extra

    detalle = []
    for i in range(20):
        detalle.append({
            "nombre": f"Colab {i:02d}",
            "documento": str(1000 + i),
            "fecha": "2026-11-10",
            "hora_inicio": "07:30",
            "hora_fin": "19:30",
            "tiempo_extra": 2.0,
            "observacion": "Extra",
        })
    vista = filas_informe_agrupadas(detalle)
    html = _html_informe(_payload_vista(vista))
    assert 'class="hdr" style="-pdf-keep-with-next:true' in html
    assert 'class="meta" style="-pdf-keep-with-next:true' in html
    assert "page-break-before:always" in html
    assert html.index('class="hdr"') < html.index('class="grid"')
    closing = html[html.index("page-break-before:always"):]
    assert "Total general" in closing and "Elaboró" in closing

    pdf = generar_pdf_horas_extra(_payload_vista(vista))
    assert pdf[:4] == b"%PDF"
    from pypdf import PdfReader
    import io
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) >= 2
    p1 = reader.pages[0].extract_text() or ""
    # Encabezado NO solo: debe traer contrato/tabla en la 1ª hoja
    assert "INFORME" in p1
    assert ("Contrato" in p1) or ("Nombre colaborador" in p1)
    last = reader.pages[-1].extract_text() or ""
    assert "Total general" in last and "Elaboró" in last


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
