"""Tests — cálculo único cant×VU listado + control de integridad."""
from sicoe_valor_canonico import (
    TRAZABILIDAD_PRECIOS_STATUS,
    auditar_integridad_registros,
    cap_item_key,
    resumen_integridad,
    sum_valor_canonico,
    valor_cant_vu,
    valores_por_cap_item,
)
from sicoe_costo_aprobado_nivel import (
    registro_aprobado_nivel_max,
    sum_costo_aprobado_nivel_max,
)


def test_valor_cant_vu_redondea_cant_2_y_valor_0():
    assert valor_cant_vu(6.005, 2205) == 13230.0  # 6.00×2205
    assert valor_cant_vu(3.14159, 1000) == 3140.0
    assert valor_cant_vu(10.004, 100) == 1000.0


def test_sum_valor_canonico_agrega_antes_de_multiplicar():
    """Σ cant por (cap,ítem) → ROUND2 → × VU ROUND0 (no suma CD guardado)."""
    listado = {
        cap_item_key("I", "A"): {"vlr_unitario": 1000, "precio_unitario": 1000},
        cap_item_key("I", "B"): {"vlr_unitario": 500, "precio_unitario": 500},
    }
    regs = [
        {"capitulo": "I", "item_numero": "A", "cantidad_total": 1.004, "costo_directo": 99999},
        {"capitulo": "I", "item_numero": "A", "cantidad_total": 2.004, "costo_directo": 99999},
        {"capitulo": "I", "item_numero": "B", "cantidad_total": 10, "costo_directo": 1},
    ]
    # A: ROUND(1.004+2.004,2)=3.01 ×1000 = 3010; B: 10×500=5000 → 8010
    assert sum_valor_canonico(regs, listado) == 8010.0
    # Homónimo en otro capítulo no toma VU de I/A
    regs2 = regs + [
        {"capitulo": "II", "item_numero": "A", "cantidad_total": 1, "costo_directo": 0},
    ]
    listado2 = {
        **listado,
        cap_item_key("II", "A"): {"vlr_unitario": 2000},
    }
    assert sum_valor_canonico(regs2, listado2) == 8010.0 + 2000.0


def test_sin_listado_aporta_cero_no_cd_guardado():
    listado = {}
    regs = [{"capitulo": "X", "item_numero": "NP-08", "cantidad_total": 5, "costo_directo": 1_000_000}]
    assert sum_valor_canonico(regs, listado) == 0.0
    vals = valores_por_cap_item(regs, listado)
    assert vals[cap_item_key("X", "NP-08")]["sin_listado"] is True


def test_integridad_detecta_tipos():
    listado = {
        cap_item_key("CAP1", "1.1"): {"vlr_unitario": 1000, "precio_unitario": 1000},
    }
    regs = [
        {"id": 1, "numero_registro": 10, "capitulo": "", "item_numero": "1.1",
         "cantidad_total": 2, "vlr_unitario": 1000, "costo_directo": 2000},
        {"id": 2, "numero_registro": 11, "capitulo": "CAP1", "item_numero": "",
         "cantidad_total": 1, "vlr_unitario": 1000, "costo_directo": 1000},
        {"id": 3, "numero_registro": 12, "capitulo": "CAP1", "item_numero": "NP-08",
         "cantidad_total": 1, "vlr_unitario": 500, "costo_directo": 500},
        {"id": 4, "numero_registro": 13, "capitulo": "CAP1", "item_numero": "1.1",
         "cantidad_total": 2, "vlr_unitario": 900, "costo_directo": 2000},
        {"id": 5, "numero_registro": 14, "capitulo": "CAP1", "item_numero": "1.1",
         "cantidad_total": 2, "vlr_unitario": 1000, "costo_directo": 999},
    ]
    incs = auditar_integridad_registros(regs, listado)
    tipos = {i.tipo for i in incs}
    assert "sin_capitulo" in tipos
    assert "sin_item" in tipos
    assert "cap_item_ausente_en_listado" in tipos
    assert "vu_guardado_distinto_listado" in tipos
    assert "cd_guardado_distinto_cant_x_vu" in tipos
    resum = resumen_integridad(incs)
    assert resum["tiene_inconsistencias"] is True
    assert resum["n_registros_afectados"] >= 4


def test_sum_aprobado_nivel_usa_listado_no_cd():
    na = [1, 2, 3, 4]
    listado = {cap_item_key("C", "X"): {"vlr_unitario": 100}}
    regs = [
        {
            "capitulo": "C",
            "item_numero": "X",
            "cantidad_total": 10.004,
            "vlr_unitario": 50,
            "costo_directo": 999999,
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Aprobado",
            "nivel4_estado": "Aprobado",
        },
        {
            "capitulo": "C",
            "item_numero": "X",
            "cantidad_total": 5,
            "vlr_unitario": 50,
            "costo_directo": 1,
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Pendiente",
            "nivel4_estado": "Aprobado",
        },
    ]
    assert registro_aprobado_nivel_max(regs[0], na) is True
    assert registro_aprobado_nivel_max(regs[1], na) is False
    # Solo regs[0]: ROUND(10.004,2)=10.00 ×100 = 1000 (no CD)
    assert sum_costo_aprobado_nivel_max(regs, na, listado_idx=listado) == 1000.0


def test_trazabilidad_reporta_sin_historial_campo():
    assert TRAZABILIDAD_PRECIOS_STATUS["existe_historial_campo_a_campo"] is False
    assert TRAZABILIDAD_PRECIOS_STATUS["existe_log_eventos"] is True
    assert "Pendiente" in TRAZABILIDAD_PRECIOS_STATUS["detalle"] or "pendiente" in TRAZABILIDAD_PRECIOS_STATUS["detalle"].lower()


def test_norm_item_strip_trailing_dots():
    from sicoe_valor_canonico import norm_item, cap_item_key

    assert norm_item("1.1.") == "1.1"
    assert norm_item("2.3._") == "2.3"
    assert norm_item("NP-08.") == "NP-08"
    assert cap_item_key("1. CAP", "1.1.") == cap_item_key("1.CAP", "1.1")


def test_homonimo_otro_capitulo_no_toma_vu():
    from sicoe_valor_canonico import cap_item_key, sum_valor_canonico

    listado = {
        cap_item_key("2.ESTRUCTURA", "2.1"): {"vlr_unitario": 180_000},
        # Cap señalización NO tiene 2.1
    }
    regs = [
        {
            "capitulo": "2. SEÑALIZACIÓN Y CANALIZACIÓN",
            "item_numero": "2.1._",
            "cantidad_total": 2,
            "costo_directo": 90_000,
            "vlr_unitario": 45_000,
        }
    ]
    # Sin cruce cap+ítem → 0 (no toma VU del homónimo de otro capítulo)
    assert sum_valor_canonico(regs, listado) == 0.0

