"""Catálogo de contactos externos de actas Seguimiento."""
from __future__ import annotations

import seguimiento_service as svc


def test_norm_email():
    assert svc._norm_email("  Ana@Mail.COM ") == "ana@mail.com"
    assert svc._norm_email("") is None
    assert svc._norm_email(None) is None


def test_upsert_e_inhabilitar_por_email(monkeypatch):
    store = []
    updates = []

    class FakeQ:
        def __init__(self):
            self._filters = {}
            self._payload = None
            self._op = "select"

        def select(self, *_a, **_k):
            self._op = "select"
            return self

        def insert(self, payload):
            self._op = "insert"
            self._payload = dict(payload)
            return self

        def update(self, payload):
            self._op = "update"
            self._payload = dict(payload)
            return self

        def eq(self, k, v):
            self._filters[k] = v
            return self

        def limit(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def execute(self):
            if self._op == "insert":
                row = {**self._payload, "id": len(store) + 1}
                store.append(row)
                return type("R", (), {"data": [row]})()
            if self._op == "update":
                updates.append((dict(self._filters), dict(self._payload)))
                for r in store:
                    ok = all(r.get(k) == v for k, v in self._filters.items())
                    if ok:
                        r.update(self._payload)
                return type("R", (), {"data": []})()
            # select
            rows = list(store)
            for k, v in self._filters.items():
                rows = [r for r in rows if r.get(k) == v]
            return type("R", (), {"data": rows})()

    class FakeSb:
        def table(self, name):
            assert name == "seguimiento_contacto_externo"
            return FakeQ()

    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    sb = FakeSb()

    row = svc.upsert_contacto_externo(
        sb, 7,
        nombre="Invitado X",
        cargo="Residente",
        entidad="Constructora Z",
        email="Invitado@Mail.com",
    )
    assert row["email_norm"] == "invitado@mail.com"
    assert row["activo"] is True
    assert len(store) == 1

    # Segunda acta con mismo correo → update, no duplicar
    svc.upsert_contacto_externo(
        sb, 7,
        nombre="Invitado X Actualizado",
        cargo="Director",
        entidad="Constructora Z",
        email="invitado@mail.com",
    )
    assert len(store) == 1
    assert store[0]["nombre"] == "Invitado X Actualizado"
    assert store[0]["cargo"] == "Director"

    n = svc.inhabilitar_contactos_externos_por_email(sb, "INVITADO@mail.com", usuario_id=99)
    assert n == 1
    assert store[0]["activo"] is False
    assert store[0]["usuario_id"] == 99

    # No reactivar si ya tiene usuario_id
    again = svc.upsert_contacto_externo(
        sb, 7,
        nombre="Invitado X",
        email="invitado@mail.com",
        cargo="Otro",
    )
    assert again["activo"] is False
    assert store[0]["cargo"] == "Director"  # sin overwrite


def test_list_usuarios_prioriza_real_sobre_externo(monkeypatch):
    """Si hay usuario real con el mismo email, el externo no aparece en el buscador."""
    users = [
        {"id": 1, "nombre": "Ana", "apellidos": "Pérez", "email": "ana@mail.com", "cargo_id": 2, "activo": True},
    ]
    externos = [
        {"id": 10, "contrato_id": 5, "nombre": "Ana Externa", "cargo": "Invitada", "entidad": "Ext", "email": "ana@mail.com", "email_norm": "ana@mail.com", "activo": True},
        {"id": 11, "contrato_id": 5, "nombre": "Luis Ext", "cargo": "Guest", "entidad": "Y", "email": "luis@ext.com", "email_norm": "luis@ext.com", "activo": True},
    ]

    class Q:
        def __init__(self, data):
            self._data = data
            self._in_ids = None
            self._eq = {}

        def select(self, *_a, **_k):
            return self

        def eq(self, k, v):
            self._eq[k] = v
            return self

        def in_(self, k, ids):
            self._in_ids = (k, ids)
            return self

        def limit(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def execute(self):
            rows = list(self._data)
            if self._in_ids:
                key, ids = self._in_ids
                rows = [r for r in rows if r.get(key) in ids or r.get("id") in ids]
            for k, v in self._eq.items():
                rows = [r for r in rows if r.get(k) == v]
            return type("R", (), {"data": rows})()

    class FakeSb:
        def table(self, name):
            if name == "contratos":
                return Q([{"id": 5, "contratista": "ACME", "numero": "1"}])
            if name == "usuario_contratos":
                return Q([{"usuario_id": 1, "contrato_id": 5}])
            if name == "usuarios":
                # Soporta consulta por contrato_id (principales) y por id/activo
                enriched = [{**u, "contrato_id": 5} for u in users]
                return Q(enriched)
            if name == "cargos":
                return Q([{"id": 2, "nombre": "Residente"}])
            if name == "seguimiento_contacto_externo":
                return Q(externos)
            return Q([])

    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    out = svc.list_usuarios_contrato_enriquecidos(FakeSb(), 5)
    emails = [x.get("email") for x in out]
    assert "ana@mail.com" in emails
    # Solo una entrada para Ana (usuario real), no el externo
    ana_rows = [x for x in out if (x.get("email") or "").lower() == "ana@mail.com"]
    assert len(ana_rows) == 1
    assert ana_rows[0].get("es_externo") is False
    # Luis externo sí aparece
    luis = next(x for x in out if x.get("externo_id") == 11)
    assert luis["es_externo"] is True
    assert luis["id"] == -11
    assert luis["empresa"] == "Y"
