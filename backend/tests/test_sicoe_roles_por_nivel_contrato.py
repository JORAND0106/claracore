"""Roles por nivel de validación SICOE por contrato (Inspector dinámico)."""
from unittest.mock import patch

import main as m


def test_parse_roles_por_nivel_raw_acepta_str_y_int():
    assert m._parse_roles_por_nivel_raw({"1": 6, 4: "2", "x": 9, "7": 1}) == {1: 6, 4: 2}
    assert m._parse_roles_por_nivel_raw("{}") == {}
    assert m._parse_roles_por_nivel_raw('{"1": 6, "5": 8}') == {1: 6, 5: 8}
    assert m._parse_roles_por_nivel_raw(None) == {}


def test_roles_por_nivel_efectivo_merge_defaults():
    eff = m._roles_por_nivel_efectivo({1: 6, 4: 2, 5: 8})
    assert eff[1] == 6
    assert eff[2] == m.DEFAULT_ROLES_POR_NIVEL[2]
    assert eff[4] == 2
    assert eff[5] == 8
    assert list(eff.values()).count(6) == 1  # Operativo Interventoría solo en N1


def test_nivel_para_rol_interventoria_dominante():
    with patch.object(m, "_get_contrato_niveles_cfg", return_value=([1, 4, 5], {1: 6, 4: 2, 5: 8})):
        assert m._nivel_para_rol_id_en_contrato(99, 6) == 1  # Operativo Interventoría → N1
        assert m._nivel_para_rol_id_en_contrato(99, 2) == 4
        assert m._nivel_para_rol_id_en_contrato(99, 8) == 5
        assert m._nivel_para_rol_id_en_contrato(99, 5) is None  # Operativo Contratista fuera


def test_rol_id_para_nivel_inspector_default_y_override():
    with patch.object(m, "_get_contrato_niveles_cfg", return_value=([1, 2, 3], {})):
        assert m._rol_id_para_nivel_contrato(1, 1) == 5  # Operativo Contratista
    with patch.object(m, "_get_contrato_niveles_cfg", return_value=([1, 4, 5], {1: 6, 4: 2, 5: 8})):
        assert m._rol_id_para_nivel_contrato(2, 1) == 6
        assert m._nivel_inspector_reporte_contrato(2) == 1


def test_nivel_inspector_sin_n1_usa_minimo_activo():
    with patch.object(m, "_get_niveles_activos_contrato", return_value=[2, 4, 5]):
        assert m._nivel_inspector_reporte_contrato(10) == 2


def test_sicoe_db_nivel_usuario_respeta_contrato(monkeypatch):
    monkeypatch.setattr(
        m,
        "supabase",
        type("S", (), {})(),
    )

    class _Table:
        def __init__(self, data):
            self._data = data

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": self._data})()

    class FakeSb:
        def table(self, name):
            if name == "usuarios":
                return _Table([{"rol_id": 6, "cargo_id": None}])
            return _Table([])

    monkeypatch.setattr(m, "supabase", FakeSb())

    with patch.object(m, "_get_contrato_niveles_cfg", return_value=([1, 4, 5], {1: 6, 4: 2, 5: 8})):
        assert m._sicoe_db_nivel_validacion_usuario(42, contrato_id=7) == 1

    with patch.object(m, "_get_contrato_niveles_cfg", return_value=([1, 2, 3], {})):
        # Sin override: Operativo Interventoría sigue sin nivel de validación
        assert m._sicoe_db_nivel_validacion_usuario(42, contrato_id=7) is None

    # Sin contrato: mapa global
    assert m._sicoe_db_nivel_validacion_usuario(42) is None


def test_sicoe_db_nivel_operativo_contratista_excluido_si_n1_es_interventoria(monkeypatch):
    class _Table:
        def __init__(self, data):
            self._data = data

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": self._data})()

    class FakeSb:
        def table(self, name):
            if name == "usuarios":
                return _Table([{"rol_id": 5, "cargo_id": 54}])
            return _Table([])

    monkeypatch.setattr(m, "supabase", FakeSb())
    with patch.object(m, "_get_contrato_niveles_cfg", return_value=([1, 4, 5], {1: 6, 4: 2, 5: 8})):
        assert m._sicoe_db_nivel_validacion_usuario(1, contrato_id=9) is None


def test_prereq_cascada_independiente_del_lado_del_rol():
    """La cascada salta niveles inactivos; no depende de Contratista vs Interventoría."""
    with patch.object(m, "_get_niveles_activos_contrato", return_value=[1, 4, 5]):
        assert m._get_prereq_nivel_activo("nivel4_estado", 3) == ("nivel1_estado", "Aprobado")
        assert m._get_prereq_nivel_activo("nivel5_estado", 3) == ("nivel4_estado", "Aprobado")
