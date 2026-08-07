"""Buscar objetivo — precisión completa y cierre exacto del total."""
from presupuesto_buscar_objetivo import (
    calcular_ajuste_buscar_objetivo,
    cant_total_exacta,
    despejar_dimension,
)


def test_cierre_exacto_objetivo_20b():
    actual = 18_450_320_000
    objetivo = 20_000_000_000
    cd_old = 3_840_300
    vlr = 85_123
    r = calcular_ajuste_buscar_objetivo(
        presupuesto_actual=actual,
        presupuesto_objetivo=objetivo,
        costo_directo_registro=cd_old,
        vlr_unitario=vlr,
        area=125.5,
        ancho=2.4,
        espesor=0.15,
        dimension="espesor",
    )
    assert r["ok"] is True
    assert r["total_nuevo"] == objetivo
    assert r["cd_registro_nuevo"] == cd_old + (objetivo - actual)
    # Sin round a 2 dp: cant = CD / vlr
    assert abs(r["cant_nueva"] - r["cd_registro_nuevo"] / vlr) < 1e-9
    # Producto de dims = cant (precisión completa)
    dims = r["dims"]
    assert abs(cant_total_exacta(dims["area_long_nod"], dims["ancho"], dims["espesor"]) - r["cant_nueva"]) < 1e-9


def test_cant_2dp_produciria_desfase():
    """Documenta por qué se eliminó el round a 2 dp."""
    cd_new = 1_549_680_000  # ejemplo de delta grande
    vlr = 85_123
    cant_exact = cd_new / vlr
    cant_2dp = round(cant_exact, 2)
    assert round(cant_2dp * vlr) != cd_new
    assert abs(cant_exact * vlr - cd_new) < 1e-6


def test_despejar_espesor():
    assert despejar_dimension("espesor", 15, 10, 2, 0.5) == 0.75
