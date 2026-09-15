"""Recordatorio email Seguimiento: día hábil anterior 15:30 + consolidación."""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from prog_obra_calendar import es_dia_habil_colombia, siguiente_dia_habil_colombia
from seguimiento_recordatorio_email import (
    RecordatorioItem,
    build_email_bodies,
    en_ventana_envio,
    fecha_vencimiento_objetivo,
    procesar_recordatorios_email_habil,
)

BOGOTA = ZoneInfo("America/Bogota")


def test_siguiente_habil_salta_finde_y_lunes_objetivo():
    # Viernes → siguiente hábil es lunes (si no es festivo)
    viernes = date(2026, 9, 18)  # viernes
    assert es_dia_habil_colombia(viernes)
    assert fecha_vencimiento_objetivo(viernes) == date(2026, 9, 21)  # lunes


def test_siguiente_habil_desde_jueves():
    jueves = date(2026, 9, 17)
    assert fecha_vencimiento_objetivo(jueves) == date(2026, 9, 18)


def test_navidad_no_habil():
    assert es_dia_habil_colombia(date(2026, 12, 25)) is False
    # 24-dic-2026 es jueves; siguiente hábil tras 24 = 28 (lun) porque 25 festivo, 26-27 finde
    assert siguiente_dia_habil_colombia(date(2026, 12, 25)) == date(2026, 12, 28)


def test_ventana_1530():
    ok = datetime(2026, 9, 18, 15, 32, tzinfo=BOGOTA)
    assert en_ventana_envio(ok) is True
    tarde = datetime(2026, 9, 18, 16, 0, tzinfo=BOGOTA)
    assert en_ventana_envio(tarde) is False
    sabado = datetime(2026, 9, 19, 15, 30, tzinfo=BOGOTA)
    assert en_ventana_envio(sabado) is False
    assert en_ventana_envio(sabado, forzar=True) is True


def test_email_consolida_secciones():
    items = [
        RecordatorioItem(
            tipo="tarea", id=1, titulo="Revisar planos", fecha="2026-09-21",
            hora="09:00", delegado_por="Ana Pérez", rol="responsable",
        ),
        RecordatorioItem(
            tipo="compromiso", id=2, titulo="Entregar informe", fecha="2026-09-21",
            delegado_por="Luis Gómez", rol="notificado",
        ),
        RecordatorioItem(
            tipo="reunion", id=3, titulo="Acta Nº 7 — Sala A", fecha="2026-09-21",
            hora="14:30", delegado_por="Elaborador", rol="asistente",
        ),
    ]
    asunto, text, html = build_email_bodies(
        nombre="Yuri",
        fecha_vencimiento=date(2026, 9, 21),
        items=items,
    )
    assert "21/09/2026" in asunto
    assert "TAREAS" in text and "COMPROMISOS" in text and "REUNIONES" in text
    assert "Revisar planos" in text and "Entregar informe" in text
    assert "Delegado por: Ana Pérez" in text
    assert "a las 09:00" in text
    assert "Tareas" in html and "Compromisos" in html and "Reuniones" in html
    assert "Yuri" in html
    assert "Notificado" in html
    assert "Asistente" in html


class _Resp:
    def __init__(self, data):
        self.data = data


class _FakeQ:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []
        self._in_filters = []
        self._payload = None
        self._op = "select"

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def is_(self, col, val):
        self._filters.append(("is", col, val))
        return self

    def in_(self, col, vals):
        self._in_filters.append((col, set(vals)))
        return self

    def limit(self, *_a, **_k):
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = dict(payload)
        return self

    def upsert(self, payload, **_k):
        self._op = "upsert"
        self._payload = dict(payload)
        return self

    def execute(self):
        rows = list(self._store.get(self._table) or [])
        if self._op in ("insert", "upsert") and self._payload is not None:
            self._store.setdefault(self._table, []).append(dict(self._payload))
            return _Resp([self._payload])
        for op, col, val in self._filters:
            if op == "eq":
                rows = [r for r in rows if r.get(col) == val or str(r.get(col)) == str(val)]
            elif op == "is":
                if val == "null":
                    rows = [r for r in rows if r.get(col) is None]
        for col, vals in self._in_filters:
            rows = [r for r in rows if r.get(col) in vals or str(r.get(col)) in {str(v) for v in vals}]
        return _Resp(rows)


class _FakeSB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeQ(self.store, name)


def test_procesar_consolida_responsable_y_notificado(monkeypatch):
    """Un usuario con tarea (responsable) y compromiso (notificado vía checklist no aplica);
    aquí: responsable de tarea + asistente de reunión → un solo correo."""
    store = {
        "seguimiento_item": [
            {
                "id": 10,
                "origen": "tarea",
                "titulo": "Tarea A",
                "estado_gestion": "abierto",
                "fecha_vencimiento": "2026-09-21",
                "hora_vencimiento": "10:00",
                "asignado_a_id": 5,
                "created_by": 1,
                "contrato_id": 9,
                "campos_libres": {
                    "checklist": [
                        {"id": "s1", "notificar_a_id": 5, "texto": "sub"},  # mismo user
                    ],
                    "asignaciones": [{"usuario_id": 5, "nombre": "Yo"}],
                },
            },
            {
                "id": 11,
                "origen": "compromiso",
                "titulo": "Compromiso B",
                "estado_gestion": "abierto",
                "fecha_vencimiento": "2026-09-21",
                "asignado_a_id": 5,
                "created_by": 2,
                "contrato_id": 9,
                "campos_libres": {},
            },
            {
                "id": 12,
                "origen": "tarea",
                "titulo": "Ajena",
                "estado_gestion": "abierto",
                "fecha_vencimiento": "2026-09-22",
                "asignado_a_id": 5,
                "created_by": 1,
                "contrato_id": 9,
                "campos_libres": {},
            },
        ],
        "seguimiento_acta": [
            {
                "id": 50,
                "contrato_id": 9,
                "consecutivo": 3,
                "fecha_reunion": "2026-09-21",
                "hora_inicio": "15:00",
                "ubicacion": "Sala",
                "elaborador_id": 1,
                "elaborador_nombre": "Ana",
                "estado": "borrador",
                "tipo_acta": "interna",
            },
        ],
        "seguimiento_acta_asistente": [
            {"acta_id": 50, "usuario_id": 5, "nombre": "Yo"},
            {"acta_id": 50, "usuario_id": None, "nombre": "Externo"},
        ],
        "usuarios": [
            {"id": 5, "nombre": "Yuri", "apellidos": "Test", "email": "yuri@example.com", "activo": True},
            {"id": 1, "nombre": "Ana", "apellidos": "Pérez", "email": "ana@example.com", "activo": True},
            {"id": 2, "nombre": "Luis", "apellidos": "Gómez", "email": "luis@example.com", "activo": True},
        ],
        "notificaciones_email_envio": [],
    }
    sb = _FakeSB(store)
    sent = []

    def fake_send(to, subject, text, html_body):
        sent.append({"to": to, "subject": subject, "text": text, "html": html_body})
        return True

    monkeypatch.setattr("seguimiento_recordatorio_email._send_smtp", fake_send)
    monkeypatch.setattr("seguimiento_recordatorio_email._contacto_smtp_configured", lambda: True)

    now = datetime(2026, 9, 18, 15, 30, tzinfo=BOGOTA)  # viernes
    res = procesar_recordatorios_email_habil(sb, now_bogota=now, forzar_hora=True)
    assert res["omitido"] is False
    assert res["fecha_vencimiento"] == "2026-09-21"
    assert res["enviados"] == 1
    assert len(sent) == 1
    assert sent[0]["to"] == "yuri@example.com"
    body = sent[0]["text"]
    assert "Tarea A" in body
    assert "Compromiso B" in body
    assert "Acta Nº 3" in body or "Reunión" in body
    assert "Ajena" not in body  # otro día
    # Un solo correo (no tres)
    assert body.count("Hola") == 1

    # Idempotencia
    res2 = procesar_recordatorios_email_habil(sb, now_bogota=now, forzar_hora=True)
    assert res2["enviados"] == 0
    assert res2["omitidos_duplicado"] == 1


def test_notificado_distinto_del_responsable(monkeypatch):
    store = {
        "seguimiento_item": [
            {
                "id": 20,
                "origen": "tarea",
                "titulo": "Delegada",
                "estado_gestion": "abierto",
                "fecha_vencimiento": "2026-09-21",
                "asignado_a_id": 10,
                "created_by": 1,
                "contrato_id": 1,
                "campos_libres": {
                    "asignaciones": [{"usuario_id": 10, "nombre": "Responsable"}],
                    "checklist": [
                        {"id": "x", "notificar_a_id": 20, "texto": "avisar"},
                    ],
                },
            },
        ],
        "seguimiento_acta": [],
        "seguimiento_acta_asistente": [],
        "usuarios": [
            {"id": 10, "nombre": "Resp", "apellidos": "", "email": "r@ex.com", "activo": True},
            {"id": 20, "nombre": "Notif", "apellidos": "", "email": "n@ex.com", "activo": True},
            {"id": 1, "nombre": "Creador", "apellidos": "", "email": "c@ex.com", "activo": True},
        ],
        "notificaciones_email_envio": [],
    }
    sb = _FakeSB(store)
    sent = []
    monkeypatch.setattr(
        "seguimiento_recordatorio_email._send_smtp",
        lambda *a, **k: sent.append(a) or True,
    )
    monkeypatch.setattr("seguimiento_recordatorio_email._contacto_smtp_configured", lambda: True)
    now = datetime(2026, 9, 18, 15, 30, tzinfo=BOGOTA)
    res = procesar_recordatorios_email_habil(sb, now_bogota=now, forzar_hora=True)
    assert res["enviados"] == 2
    destinatarios = sorted(s[0] for s in sent)
    assert destinatarios == ["n@ex.com", "r@ex.com"]
