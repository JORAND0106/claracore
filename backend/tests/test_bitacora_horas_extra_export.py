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
    assert 'class="firmas-row"' not in html  # firmas fuera de la grilla
    assert "firma-line" in html
    assert "firma-sp" in html  # espacio compacto para firma a mano
    assert 'class="closing"' in html
    assert "-pdf-keep-with-next:true" in html
    assert "page-break-after:avoid" in html
    assert "page-break-before:avoid" in html
    assert 'class="subtotal' in html
    assert 'class="total"' in html
    assert "page-break-before:always" not in html  # informe corto: una hoja
    assert "Gustavo Español Alba" in html
    assert "EspaÑOl" not in html
    # Firmas después del total, fuera de la tabla grid
    assert html.index("Total general") < html.index('class="firmas"')
    assert html.index("</table>", html.index("Total general")) < html.index('class="firmas"')
    assert "Aprobó" in html


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
    # Firmas fuera de la grilla: no thead pegado solo a firmas
    assert 'class="firmas"' in closing
    firmas_pos = closing.index('class="firmas"')
    assert closing.rfind("Total general", 0, firmas_pos) >= 0

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
    # No hoja con solo thead + firmas (debe haber datos o total junto a firmas)
    assert ("Subtotal" in last) or ("Colab" in last) or ("Total general" in last)


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


def test_empresas_con_opcion_todas():
    from bitacora_horas_extra_export import (
        EMPRESA_TODAS_KEY,
        EMPRESA_TODAS_LABEL,
        empresas_con_opcion_todas,
        es_empresa_todas,
    )

    assert empresas_con_opcion_todas([]) == []
    out = empresas_con_opcion_todas([{"key": "a", "nombre": "Alpha"}])
    assert out[0] == {"key": EMPRESA_TODAS_KEY, "nombre": EMPRESA_TODAS_LABEL}
    assert out[1]["nombre"] == "Alpha"
    assert es_empresa_todas(EMPRESA_TODAS_KEY)
    assert es_empresa_todas("Todas las empresas")
    assert not es_empresa_todas("Alpha")


def test_filas_agrupadas_por_empresa_subtotales_y_total():
    detalle = [
        {
            "nombre": "Ana Perez",
            "documento": "222",
            "fecha": "2026-11-11",
            "hora_inicio": "07:00",
            "hora_fin": "19:00",
            "tiempo_extra": 1.5,
            "extra_diurna": 1.5,
            "extra_nocturna": 0,
            "extra_festiva_diurna": 0,
            "extra_festiva_nocturna": 0,
            "observacion": "Cierre",
            "empresa": "Empresa A",
            "empresa_key": "empresa a",
        },
        {
            "nombre": "Luis Mora",
            "documento": "333",
            "fecha": "2026-11-12",
            "hora_inicio": "07:30",
            "hora_fin": "20:00",
            "tiempo_extra": 3.0,
            "extra_diurna": 2.0,
            "extra_nocturna": 1.0,
            "extra_festiva_diurna": 0,
            "extra_festiva_nocturna": 0,
            "observacion": "Emergencia",
            "empresa": "Empresa B",
            "empresa_key": "empresa b",
        },
        {
            "nombre": "Luis Mora",
            "documento": "333",
            "fecha": "2026-11-13",
            "hora_inicio": "07:30",
            "hora_fin": "18:30",
            "tiempo_extra": 1.0,
            "extra_diurna": 1.0,
            "extra_nocturna": 0,
            "extra_festiva_diurna": 0,
            "extra_festiva_nocturna": 0,
            "observacion": "Extra",
            "empresa": "Empresa B",
            "empresa_key": "empresa b",
        },
    ]
    vista = filas_informe_agrupadas(detalle, agrupar_por_empresa=True)
    tipos = [r["tipo"] for r in vista]
    assert tipos == [
        "empresa", "detalle", "subtotal", "subtotal_empresa",
        "empresa", "detalle", "detalle", "subtotal", "subtotal_empresa",
        "total",
    ]
    # No continuo entre empresas
    assert vista[1]["no"] == 1 and vista[5]["no"] == 2
    assert vista[3]["tipo"] == "subtotal_empresa" and vista[3]["tiempo_extra"] == 1.5
    assert vista[8]["tipo"] == "subtotal_empresa" and vista[8]["tiempo_extra"] == 4.0
    assert vista[-1]["tiempo_extra"] == 5.5
    assert vista[3]["extra_diurna"] == 1.5
    assert vista[8]["extra_diurna"] == 3.0 and vista[8]["extra_nocturna"] == 1.0

    # Una sola empresa: mismo resultado que antes (sin filas empresa)
    solo_a = [r for r in detalle if r["empresa_key"] == "empresa a"]
    vista_a = filas_informe_agrupadas(solo_a, agrupar_por_empresa=False)
    assert [r["tipo"] for r in vista_a] == ["detalle", "subtotal", "total"]
    assert vista_a[-1]["tiempo_extra"] == 1.5


def test_construir_filas_todas_empresas():
    from bitacora_horas_extra_export import EMPRESA_TODAS_KEY

    diarios = [
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
                    "justificacion_horas_extra": "Cierre",
                },
                {
                    "nombre": "Luis Mora",
                    "documento_numero": "333",
                    "subcontratista_nombre": "Empresa B",
                    "hora_ingreso": "07:30",
                    "hora_salida": "20:00",
                    "horas_extra": 3,
                    "justificacion_horas_extra": "Emergencia",
                },
            ],
        },
    ]
    todas = construir_filas_horas_extra(diarios, empresa_key=EMPRESA_TODAS_KEY)
    assert len(todas) == 2
    assert {r["empresa"] for r in todas} == {"Empresa A", "Empresa B"}
    vista = filas_informe_agrupadas(todas, agrupar_por_empresa=True)
    assert vista[-1]["tiempo_extra"] == 4.5
    assert any(r["tipo"] == "empresa" and r["nombre"] == "Empresa A" for r in vista)
    assert CODIGO_FORMATO_HORAS_EXTRA == "CC-BIT-HE-001"
