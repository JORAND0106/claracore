"""Correo inmediato al asignar tarea/compromiso (independiente del recordatorio hábil)."""
from __future__ import annotations

from seguimiento_asignacion_email import (
    JOB_TIPO,
    build_asignacion_email_bodies,
    enviar_email_asignacion_inmediata,
)


def test_job_tipo_distinto_del_recordatorio():
    assert JOB_TIPO == "seguimiento_asignacion_inmediata"
    assert JOB_TIPO != "seguimiento_recordatorio_habil"


def test_build_email_tarea_incluye_delegado_y_vencimiento():
    asunto, text, html = build_asignacion_email_bodies(
        nombre_destinatario="Ana Pérez",
        tipo="tarea",
        titulo="Revisar memorias",
        detalle="Incluir anexos del tramo 2.",
        delegado_por="Carlos López",
        fecha_vencimiento="2026-09-20",
        hora_vencimiento="14:30",
        reasignacion=False,
    )
    assert "Tarea asignada" in asunto
    assert "Revisar memorias" in asunto
    assert "Ana Pérez" in text
    assert "Carlos López" in text
    assert "20/09/2026" in text
    assert "14:30" in text
    assert "Incluir anexos" in text
    assert "Seguimiento · Asignación" in html
    assert "Delegado por" in html
    assert "Carlos López" in html
    assert "rgb(0,119,182)" in html  # color tarea


def test_build_email_compromiso_reasignacion():
    asunto, text, html = build_asignacion_email_bodies(
        nombre_destinatario="Luis",
        tipo="compromiso",
        titulo="Entregar planos",
        delegado_por="María",
        fecha_vencimiento="2026-10-01",
        reasignacion=True,
        contexto="Proveniente de Acta Nº 12",
    )
    assert "reasignada" in asunto.lower()
    assert "reasignó" in text
    assert "Acta Nº 12" in text
    assert "rgb(0,168,150)" in html  # color compromiso
    assert "Compromiso reasignada" in html or "reasignada" in html.lower()


class _Resp:
    def __init__(self, data):
        self.data = data


class _FakeQ:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []
        self._payload = None
        self._op = "select"
        self._null_cols = []

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = dict(payload)
        return self

    def upsert(self, payload, **_k):
        self._op = "upsert"
        self._payload = dict(payload)
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def is_(self, col, val):
        self._null_cols.append((col, val))
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._op in ("insert", "upsert") and self._payload is not None:
            rows = self._store.setdefault(self._table, [])
            rows.append(dict(self._payload))
            return _Resp([self._payload])
        rows = list(self._store.get(self._table) or [])
        for col, val in self._filters:
            rows = [r for r in rows if r.get(col) == val or str(r.get(col)) == str(val)]
        for col, val in self._null_cols:
            if val is None or val == "null":
                rows = [r for r in rows if r.get(col) is None]
        return _Resp(rows)


class _FakeSB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeQ(self.store, name)


def test_enviar_email_asignacion_ok(monkeypatch):
    store = {
        "usuarios": [
            {
                "id": 20,
                "email": "ana@example.com",
                "nombre": "Ana",
                "apellidos": "Pérez",
                "estado": "aprobado",
                "activo": True,
            },
            {
                "id": 10,
                "email": "carlos@example.com",
                "nombre": "Carlos",
                "apellidos": "López",
                "estado": "aprobado",
                "activo": True,
            },
        ],
        "notificaciones_email_envio": [],
    }
    sb = _FakeSB(store)
    sent = []

    monkeypatch.setattr(
        "seguimiento_asignacion_email._send_smtp",
        lambda *a, **k: sent.append(a) or True,
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._contacto_smtp_configured",
        lambda: True,
    )

    ok = enviar_email_asignacion_inmediata(
        sb,
        destinatario_id=20,
        remitente_id=10,
        tipo="tarea",
        titulo="Revisar memorias",
        item_id=55,
        fecha_vencimiento="2026-09-20",
        hora_vencimiento="09:00",
        detalle="Con planos",
    )
    assert ok is True
    assert len(sent) == 1
    assert sent[0][0] == "ana@example.com"
    assert "Revisar memorias" in sent[0][1]
    assert "Carlos" in sent[0][2]
    assert any(r.get("tipo") == JOB_TIPO for r in store["notificaciones_email_envio"])

    # Idempotencia: no reenvía tras éxito
    ok2 = enviar_email_asignacion_inmediata(
        sb,
        destinatario_id=20,
        remitente_id=10,
        tipo="tarea",
        titulo="Revisar memorias",
        item_id=55,
        fecha_vencimiento="2026-09-20",
    )
    assert ok2 is False
    assert len(sent) == 1


def test_fallo_smtp_no_bloquea_reintento(monkeypatch):
    store = {
        "usuarios": [
            {
                "id": 20,
                "email": "ana@example.com",
                "nombre": "Ana",
                "apellidos": "P",
                "estado": "aprobado",
                "activo": True,
            },
            {
                "id": 10,
                "email": "c@example.com",
                "nombre": "C",
                "apellidos": "",
                "estado": "aprobado",
                "activo": True,
            },
        ],
        "notificaciones_email_envio": [],
    }
    sb = _FakeSB(store)
    calls = {"n": 0}

    def flaky(*_a, **_k):
        calls["n"] += 1
        return calls["n"] > 1  # primer intento falla

    monkeypatch.setattr("seguimiento_asignacion_email._send_smtp", flaky)
    monkeypatch.setattr(
        "seguimiento_asignacion_email._contacto_smtp_configured",
        lambda: True,
    )
    assert enviar_email_asignacion_inmediata(
        sb, destinatario_id=20, remitente_id=10, tipo="tarea",
        titulo="X", item_id=9,
    ) is False
    assert enviar_email_asignacion_inmediata(
        sb, destinatario_id=20, remitente_id=10, tipo="tarea",
        titulo="X", item_id=9,
    ) is True


def test_email_override_si_usuario_sin_fila(monkeypatch):
    store = {"usuarios": [], "notificaciones_email_envio": []}
    sent = []
    monkeypatch.setattr(
        "seguimiento_asignacion_email._send_smtp",
        lambda *a, **k: sent.append(a) or True,
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._contacto_smtp_configured",
        lambda: True,
    )
    ok = enviar_email_asignacion_inmediata(
        _FakeSB(store),
        destinatario_id=99,
        remitente_id=1,
        tipo="tarea",
        titulo="Personal",
        item_id=3,
        es_personal=True,
        destinatario_email="yo@example.com",
        destinatario_nombre="Yo Mismo",
    )
    assert ok is True
    assert sent[0][0] == "yo@example.com"
    assert "Yo Mismo" in sent[0][2]


def test_build_email_tarea_personal_sin_delegado():
    asunto, text, html = build_asignacion_email_bodies(
        nombre_destinatario="Ana Pérez",
        tipo="tarea",
        titulo="Llamar al interventor",
        detalle="Confirmar visita",
        delegado_por="No debe aparecer",
        fecha_vencimiento="2026-09-22",
        hora_vencimiento="10:00",
        es_personal=True,
    )
    assert "personal" in asunto.lower()
    assert "registró" in text
    assert "Delegado por" not in text
    assert "Delegado por" not in html
    assert "No debe aparecer" not in html
    assert "Tarea personal" in html
    assert "10:00" in html


def test_enviar_tarea_personal_autoasignada(monkeypatch):
    store = {
        "usuarios": [
            {
                "id": 10,
                "email": "yo@example.com",
                "nombre": "Yo",
                "apellidos": "Mismo",
                "estado": "aprobado",
                "activo": True,
            },
        ],
        "notificaciones_email_envio": [],
    }
    sent = []
    monkeypatch.setattr(
        "seguimiento_asignacion_email._send_smtp",
        lambda *a, **k: sent.append(a) or True,
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._contacto_smtp_configured",
        lambda: True,
    )
    ok = enviar_email_asignacion_inmediata(
        _FakeSB(store),
        destinatario_id=10,
        remitente_id=10,
        tipo="tarea",
        titulo="Personal",
        item_id=1,
        fecha_vencimiento="2026-09-22",
        es_personal=True,
    )
    assert ok is True
    assert len(sent) == 1
    assert sent[0][0] == "yo@example.com"
    assert "personal" in sent[0][1].lower()
    assert "Delegado por" not in sent[0][2]


def test_crear_tarea_personal_dispara_email(monkeypatch):
    import seguimiento_service as svc

    emails = []
    inserted = []

    class FakeQ:
        def __init__(self, name):
            self.name = name
            self._payload = None

        def select(self, *_a, **_k):
            return self

        def insert(self, payload):
            self._payload = payload
            return self

        def eq(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            if self.name == "seguimiento_item" and self._payload is not None:
                row = dict(self._payload)
                row["id"] = 77
                inserted.append(row)
                return type("R", (), {"data": [row]})()
            if self.name == "usuarios":
                return type("R", (), {"data": [{
                    "id": 3, "nombre": "Ana", "apellidos": "P",
                    "email": "a@x.com", "contrato_id": 12, "estado": "aprobado",
                }]})()
            return type("R", (), {"data": []})()

    class FakeSb:
        def table(self, name):
            return FakeQ(name)

    monkeypatch.setattr(svc, "_usuario_row", lambda *_a, **_k: {
        "id": 3, "nombre": "Ana", "apellidos": "P", "contrato_id": 12,
    })
    monkeypatch.setattr(svc, "_nombre_usuario", lambda *_a, **_k: "Ana P")
    monkeypatch.setattr(svc, "_proximo_consecutivo_item", lambda *_a, **_k: 1)
    monkeypatch.setattr(svc, "_registrar_evento", lambda *_a, **_k: None)
    monkeypatch.setattr(
        svc, "_try_email_asignacion_inmediata",
        lambda *_a, **k: emails.append(k),
    )
    monkeypatch.setattr(svc, "_notificar", lambda *_a, **_k: True)

    row = svc.crear_tarea(
        FakeSb(),
        {"titulo": "Mi tarea personal", "contrato_id": 12, "fecha_vencimiento": "2026-09-25"},
        user_id=3,
    )
    assert row["id"] == 77
    assert len(emails) == 1
    assert emails[0]["es_personal"] is True
    assert emails[0]["destinatario_id"] == 3
    assert emails[0]["titulo"] == "Mi tarea personal"


def test_notificar_compromiso_dispara_email(monkeypatch):
    import seguimiento_service as svc

    emails = []
    monkeypatch.setattr(svc, "_notificar", lambda *_a, **_k: True)
    monkeypatch.setattr(
        svc,
        "_try_email_asignacion_inmediata",
        lambda *_a, **k: emails.append(k),
    )
    svc._notificar_compromiso_asignado(
        None,
        destinatario_id=20,
        remitente_id=10,
        titulo="Entregar planos",
        fecha_vencimiento="2026-08-20",
        contrato_id=5,
        item_id=99,
        acta={"consecutivo": 7},
        reasignacion=False,
        hora_vencimiento="16:00",
        descripcion="Planos estructurales",
    )
    assert len(emails) == 1
    assert emails[0]["tipo"] == "compromiso"
    assert emails[0]["destinatario_id"] == 20
    assert emails[0]["hora_vencimiento"] == "16:00"
    assert "Acta Nº 7" in (emails[0].get("contexto") or "")
