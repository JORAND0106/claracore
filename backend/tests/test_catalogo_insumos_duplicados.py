"""Duplicidad de insumos: solo descripción exacta (normalizada) + mismo proveedor."""
from catalogo_insumos_service import find_duplicados, normalize_cotizaciones_detalle


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _FakeSb:
    def __init__(self, insumos, proveedor=None):
        self._insumos = insumos
        self._proveedor = proveedor or {"razon_social": "Prov SA", "nit": "900"}

    def table(self, name):
        if name == "almacen_insumo":
            return _FakeQuery(self._insumos)
        if name == "almacen_proveedor":
            return _FakeQuery([self._proveedor])
        return _FakeQuery([])


def test_find_duplicados_solo_descripcion_exacta(monkeypatch):
    rows = [
        {"id": 1, "descripcion": "Geotextil 2400", "codigo": "CC-1", "costo_base": 100, "tributos": {}},
        {"id": 2, "descripcion": "Geotextil 2500", "codigo": "CC-2", "costo_base": 110, "tributos": {}},
        {"id": 3, "descripcion": "  geotextil   2400 ", "codigo": "CC-3", "costo_base": 120, "tributos": {}},
    ]
    monkeypatch.setattr("catalogo_insumos_service._sb", lambda: _FakeSb(rows))

    dups = find_duplicados(10, 99, "Geotextil 2400")
    ids = {int(d["insumo_id"] if d.get("insumo_id") is not None else d["id"]) for d in dups}
    assert 1 in ids
    assert 3 in ids  # misma descripción normalizada
    assert 2 not in ids  # no por coincidencia parcial de "Geotextil"


def test_find_duplicados_sin_parcial_substring(monkeypatch):
    rows = [
        {"id": 1, "descripcion": "Cemento gris", "codigo": "A", "costo_base": 1, "tributos": {}},
    ]
    monkeypatch.setattr("catalogo_insumos_service._sb", lambda: _FakeSb(rows))
    assert find_duplicados(1, 1, "Cemento") == []
    assert find_duplicados(1, 1, "Cemento gris tipo I") == []


def test_normalize_cotizaciones_detalle_secciones():
    raw = [
        {"tipo": "insumo", "es_ganadora": True, "numero": "G1", "valor": "1000", "proveedor": "A"},
        {"tipo": "insumo", "numero": "S1", "valor": 900},
        {"tipo": "no_previsto", "es_ganadora": True, "numero": "NP1", "valor": 1100},
        {"tipo": "insumo"},  # vacío → omitido
    ]
    out = normalize_cotizaciones_detalle(raw)
    assert len(out) == 3
    assert out[0]["es_ganadora"] is True
    assert out[2]["tipo"] == "no_previsto"
    assert out[2]["es_ganadora"] is False  # no_previsto nunca ganadora
