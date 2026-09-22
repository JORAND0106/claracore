"""Depuración de asistentes externos: listado y reemplazo por usuario registrado."""
from __future__ import annotations

import pytest

import seguimiento_service as svc


class StoreQ:
    def __init__(self, store, name, *, forbidden_cols=None):
        self.store = store
        self.name = name
        self.forbidden_cols = set(forbidden_cols or [])
        self._op = "select"
        self._filters = []
        self._in = None
        self._payload = None
        self._order = None
        self._limit = None
        self._eq = {}
        self._select = ""

    def select(self, *_a, **_k):
        self._op = "select"
        self._select = _a[0] if _a else ""
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = dict(payload) if isinstance(payload, dict) else payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = dict(payload)
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, k, v):
        self._eq[k] = v
        self._filters.append(("eq", k, v))
        return self

    def in_(self, k, ids):
        self._in = (k, list(ids))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _match(self, row):
        for op, k, v in self._filters:
            if op == "eq" and row.get(k) != v:
                return False
        if self._in:
            k, ids = self._in
            if row.get(k) not in ids:
                return False
        return True

    def execute(self):
        table = self.store.setdefault(self.name, [])
        if self._op == "select":
            for col in self.forbidden_cols:
                if col in (self._select or ""):
                    raise RuntimeError(
                        f"{{'message': 'column {self.name}.{col} does not exist', "
                        f"'code': '42703', 'hint': None, 'details': None}}"
                    )
            rows = [dict(r) for r in table if self._match(r)]
            if self._limit is not None:
                rows = rows[: self._limit]
            return type("R", (), {"data": rows})()
        if self._op == "insert":
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            out = []
            for p in payloads:
                row = dict(p)
                if "id" not in row:
                    row["id"] = max([r.get("id", 0) for r in table] + [0]) + 1
                table.append(row)
                out.append(dict(row))
            return type("R", (), {"data": out})()
        if self._op == "update":
            out = []
            for r in table:
                if self._match(r):
                    r.update(self._payload)
                    out.append(dict(r))
            return type("R", (), {"data": out})()
        if self._op == "delete":
            keep = []
            deleted = []
            for r in table:
                if self._match(r):
                    deleted.append(dict(r))
                else:
                    keep.append(r)
            self.store[self.name] = keep
            return type("R", (), {"data": deleted})()
        return type("R", (), {"data": []})()


class FakeSb:
    def __init__(self, store, *, forbidden_cols=None):
        self.store = store
        self.forbidden_cols = forbidden_cols or {}

    def table(self, name):
        return StoreQ(self.store, name, forbidden_cols=self.forbidden_cols.get(name) or [])


def _base_store():
    return {
        "seguimiento_acta": [
            {"id": 1, "contrato_id": 7, "consecutivo": 1, "fecha_reunion": "2026-01-10", "tipo_acta": "interna", "estado": "realizada"},
            {"id": 2, "contrato_id": 7, "consecutivo": 2, "fecha_reunion": "2026-02-10", "tipo_acta": "interna", "estado": "borrador"},
            {"id": 3, "contrato_id": 7, "consecutivo": 3, "fecha_reunion": "2026-03-10", "tipo_acta": "interna", "estado": "realizada"},
            {"id": 99, "contrato_id": 8, "consecutivo": 1, "fecha_reunion": "2026-01-01", "tipo_acta": "interna", "estado": "borrador"},
        ],
        "seguimiento_acta_asistente": [
            {"id": 10, "acta_id": 1, "nombre": "Pepito Pérez", "cargo": "Invitado", "entidad": "Ext", "email": "pepito@ext.com", "usuario_id": None, "orden": 0},
            {"id": 11, "acta_id": 2, "nombre": "Pepito Pérez", "cargo": "Invitado", "entidad": "Ext", "email": "pepito@ext.com", "usuario_id": None, "orden": 0},
            {"id": 12, "acta_id": 3, "nombre": "Pepito Pérez", "cargo": "Invitado", "entidad": "Ext", "email": "pepito@ext.com", "usuario_id": None, "orden": 1},
            {"id": 13, "acta_id": 1, "nombre": "Otro Ext", "cargo": None, "entidad": None, "email": None, "usuario_id": None, "orden": 1},
            {"id": 14, "acta_id": 99, "nombre": "Pepito Pérez", "cargo": None, "entidad": None, "email": "pepito@ext.com", "usuario_id": None, "orden": 0},
            {"id": 15, "acta_id": 3, "nombre": "Ana Real", "cargo": "Residente", "entidad": "ACME", "email": "ana@mail.com", "usuario_id": 51, "orden": 0},
        ],
        "seguimiento_contacto_externo": [
            {
                "id": 100,
                "contrato_id": 7,
                "nombre": "Pepito Pérez",
                "cargo": "Invitado",
                "entidad": "Ext",
                "email": "pepito@ext.com",
                "email_norm": "pepito@ext.com",
                "activo": True,
                "usuario_id": None,
            },
            {
                "id": 101,
                "contrato_id": 7,
                "nombre": "Otro Ext",
                "cargo": None,
                "entidad": None,
                "email": None,
                "email_norm": None,
                "activo": True,
                "usuario_id": None,
            },
        ],
        "seguimiento_item": [
            {
                "id": 200,
                "contrato_id": 7,
                "asignado_externo_id": 100,
                "asignado_a_id": None,
                "asignado_a_nombre": "Pepito Pérez",
            },
        ],
        "seguimiento_firma_registro": [
            {"id": 1, "acta_id": 1, "asistente_id": 10, "usuario_id": None},
        ],
        "contratos": [{"id": 7, "contratista": "ACME", "numero": "1"}],
        "usuario_contratos": [
            {"usuario_id": 50, "contrato_id": 7},
            {"usuario_id": 51, "contrato_id": 7},
        ],
        "usuarios": [
            {
                "id": 50,
                "nombre": "Pepito Eduardo",
                "apellidos": "Pérez",
                "email": "pepito.eduardo@mail.com",
                "cargo_id": 2,
                "activo": True,
                "contrato_id": 7,
            },
            {
                "id": 51,
                "nombre": "Ana",
                "apellidos": "Real",
                "email": "ana@mail.com",
                "cargo_id": 2,
                "activo": True,
                "contrato_id": 7,
            },
        ],
        "cargos": [{"id": 2, "nombre": "Residente"}],
    }


def test_clave_externo_prioriza_email():
    assert svc._clave_externo(email=" A@B.COM ", nombre="X") == "email:a@b.com"
    assert svc._clave_externo(email="mailto:Ana@Mail.COM", nombre="X") == "email:ana@mail.com"
    assert svc._clave_externo(email=None, nombre="  Pepito   Pérez ") == "nombre:pepito perez"
    assert svc._clave_externo(email="", nombre="") is None


def test_list_une_mailto_y_mismo_nombre(monkeypatch):
    """Duplicados tipo Viviana (mailto) y Lubin (con/sin email) deben unirse."""
    store = _base_store()
    store["seguimiento_acta_asistente"].extend([
        {
            "id": 30, "acta_id": 1, "nombre": "Viviana Paulina Garcia Mancipe",
            "cargo": "Abogada", "entidad": "Umbrales", "email": "vgarciam@umbrales.com",
            "usuario_id": None, "orden": 5,
        },
        {
            "id": 31, "acta_id": 2, "nombre": "Viviana Paulina Garcia Mancipe",
            "cargo": "Abogada", "entidad": "Umbrales", "email": "mailto:vgarciam@umbrales.com",
            "usuario_id": None, "orden": 5,
        },
        {
            "id": 32, "acta_id": 1, "nombre": "Lubin Andrés Hernández Sanabria",
            "cargo": "Ingeniero Ambiental", "entidad": "CONSORCIO", "email": "mailto:lhernandez@x.com",
            "usuario_id": None, "orden": 6,
        },
        {
            "id": 33, "acta_id": 2, "nombre": "Lubin Andrés Hernández Sanabria",
            "cargo": "Ingeniero Ambiental", "entidad": None, "email": None,
            "usuario_id": None, "orden": 6,
        },
    ])
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    out = svc.list_externos_depuracion(FakeSb(store), 7)

    vivianas = [x for x in out if "viviana" in (x.get("nombre") or "").lower()]
    assert len(vivianas) == 1
    assert vivianas[0]["actas_count"] == 2
    assert vivianas[0]["email"] == "vgarciam@umbrales.com"
    assert "email:vgarciam@umbrales.com" in vivianas[0]["match_keys"]

    lubines = [x for x in out if "lubin" in (x.get("nombre") or "").lower()]
    assert len(lubines) == 1
    assert lubines[0]["actas_count"] == 2
    assert lubines[0]["email"] == "lhernandez@x.com"
    assert any(k.startswith("nombre:") for k in lubines[0]["match_keys"])
    assert any(k.startswith("email:") for k in lubines[0]["match_keys"])


def test_list_externos_depuracion_agrupa_por_email(monkeypatch):
    store = _base_store()
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    out = svc.list_externos_depuracion(FakeSb(store), 7)
    pepito = next(x for x in out if x.get("externo_id") == 100)
    assert pepito["actas_count"] == 3
    assert pepito["asistentes_count"] == 3
    assert pepito["match_key"] == "email:pepito@ext.com"
    assert len(pepito["actas"]) == 3
    # No incluye acta de otro contrato
    assert all(a["id"] != 99 for a in pepito["actas"])
    otro = next(x for x in out if x.get("match_key") == "nombre:otro ext")
    assert otro["actas_count"] == 1
    assert otro["externo_id"] == 101


def test_reemplazar_externo_exige_usuario(monkeypatch):
    store = _base_store()
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    with pytest.raises(ValueError, match="usuario registrado"):
        svc.reemplazar_externo_por_usuario(
            FakeSb(store), 7, usuario_id=0, externo_id=100,
        )


def test_reemplazar_externo_en_varias_actas(monkeypatch):
    """Caso real: externo en 3 actas → usuario registrado; participación intacta."""
    store = _base_store()
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    sb = FakeSb(store)

    result = svc.reemplazar_externo_por_usuario(
        sb, 7, usuario_id=50, externo_id=100,
    )
    assert result["ok"] is True
    assert result["actas_count"] == 3
    assert result["asistentes_actualizados"] == 3
    assert result["compromisos_actualizados"] == 1
    assert result["catalogo_inhabilitados"] >= 1

    # Asistentes del contrato 7 ahora tienen usuario_id=50 y nombre del registrado
    for aid in (10, 11, 12):
        row = next(r for r in store["seguimiento_acta_asistente"] if r["id"] == aid)
        assert row["usuario_id"] == 50
        assert "Pepito Eduardo" in row["nombre"]
        assert row["id"] == aid  # misma fila → historial / firmas conservados

    # Firma sigue apuntando al mismo asistente_id, con usuario_id actualizado
    firma = store["seguimiento_firma_registro"][0]
    assert firma["asistente_id"] == 10
    assert firma["usuario_id"] == 50

    # Compromiso migrado
    item = store["seguimiento_item"][0]
    assert item["asignado_a_id"] == 50
    assert item["asignado_externo_id"] is None

    # Catálogo inhabilitado
    cat = next(r for r in store["seguimiento_contacto_externo"] if r["id"] == 100)
    assert cat["activo"] is False
    assert cat["usuario_id"] == 50

    # Acta de otro contrato intacta
    otro = next(r for r in store["seguimiento_acta_asistente"] if r["id"] == 14)
    assert otro["usuario_id"] is None

    # Ya no aparece en el listado de depuración
    remaining = svc.list_externos_depuracion(sb, 7)
    assert not any(x.get("externo_id") == 100 for x in remaining)
    assert not any(x.get("match_key") == "email:pepito@ext.com" for x in remaining)


def test_reemplazar_fusiona_si_usuario_ya_es_asistente(monkeypatch):
    store = _base_store()
    # En acta 3 el usuario 50 ya está como asistente además del externo Pepito
    store["seguimiento_acta_asistente"].append({
        "id": 16,
        "acta_id": 3,
        "nombre": "Pepito Eduardo Pérez",
        "cargo": "Residente",
        "entidad": "ACME",
        "email": "pepito.eduardo@mail.com",
        "usuario_id": 50,
        "orden": 2,
    })
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    sb = FakeSb(store)
    result = svc.reemplazar_externo_por_usuario(
        sb, 7, usuario_id=50, match_key="email:pepito@ext.com",
    )
    assert result["asistentes_fusionados"] == 1
    assert result["asistentes_actualizados"] == 2
    assert not any(r["id"] == 12 for r in store["seguimiento_acta_asistente"])
    # El asistente registrado del usuario permanece
    assert any(r["id"] == 16 and r["usuario_id"] == 50 for r in store["seguimiento_acta_asistente"])


def test_list_nunca_consulta_tipo_acta(monkeypatch):
    """Regresión: el listado no debe pedir tipo_acta (columna inexistente → 42703)."""
    store = _base_store()
    for a in store["seguimiento_acta"]:
        a.pop("tipo_acta", None)
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    # Si el código pide tipo_acta, FakeSb lanza el mismo 42703 de producción.
    sb = FakeSb(store, forbidden_cols={"seguimiento_acta": ["tipo_acta"]})
    out = svc.list_externos_depuracion(sb, 7)
    assert len(out) >= 1
    pepito = next(x for x in out if x.get("match_key") == "email:pepito@ext.com")
    assert pepito["actas_count"] == 3
    assert "tipo_acta" not in pepito["actas"][0]


def test_list_filtra_por_contrato_automatico(monkeypatch):
    """El contrato viene del path/sesión: cada contrato ve solo sus externos."""
    store = _base_store()
    store["seguimiento_contacto_externo"].append({
        "id": 200,
        "contrato_id": 8,
        "nombre": "Pepito Pérez",
        "cargo": "Guest",
        "entidad": "Otro",
        "email": "pepito@ext.com",
        "email_norm": "pepito@ext.com",
        "activo": True,
        "usuario_id": None,
    })
    store["contratos"].append({"id": 8, "contratista": "OTRO", "numero": "2"})
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    sb = FakeSb(store, forbidden_cols={"seguimiento_acta": ["tipo_acta"]})

    out7 = svc.list_externos_depuracion(sb, 7)
    out8 = svc.list_externos_depuracion(sb, 8)

    pepito7 = next(x for x in out7 if x.get("match_key") == "email:pepito@ext.com")
    pepito8 = next(x for x in out8 if x.get("match_key") == "email:pepito@ext.com")
    assert pepito7["externo_id"] == 100
    assert pepito7["actas_count"] == 3
    assert pepito8["externo_id"] == 200
    assert pepito8["actas_count"] == 1
    ids7 = {a["id"] for x in out7 for a in x["actas"]}
    ids8 = {a["id"] for x in out8 for a in x["actas"]}
    assert ids7.isdisjoint(ids8)
