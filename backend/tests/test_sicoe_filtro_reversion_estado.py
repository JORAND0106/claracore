"""Filtro virtual «Reversión» en búsqueda SICOE obra."""
import main as m


def test_estado_filtro_es_reversion():
    assert m._estado_filtro_es_reversion("Reversión") is True
    assert m._estado_filtro_es_reversion("reversion") is True
    assert m._estado_filtro_es_reversion("Borrador") is False


def test_usuario_filtro_reversion_solo_interventoria():
    assert m._usuario_filtro_reversion_solo_interventoria({"rol_nombre": "Interventoría"}) is True
    assert m._usuario_filtro_reversion_solo_interventoria({"rol_nombre": "Operativo Interventoría"}) is True
    assert m._usuario_filtro_reversion_solo_interventoria({"rol_nombre": "Interventoría Gerencial"}) is True
    assert m._usuario_filtro_reversion_solo_interventoria({"rol_nombre": "Contratista"}) is False


def test_sicoe_reversion_modo_filtro_por_rol():
    assert m._sicoe_reversion_modo_filtro("Reversión", {"rol_nombre": "Interventoría"}) == "interv_primera_llave"
    assert m._sicoe_reversion_modo_filtro("Reversión", {"rol_nombre": "Contratista"}) == "contratista"
    assert m._sicoe_reversion_modo_filtro("Borrador", {"rol_nombre": "Contratista"}) is None


def test_estado_reversion_omite_validacion_capas():
    assert m._estado_filtro_omite_validacion_por_cargo("Reversión") is True
