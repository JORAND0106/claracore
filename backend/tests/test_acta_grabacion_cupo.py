"""Cupo diario de grabación de actas: 180 min/contrato (America/Bogota)."""
from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from acta_grabacion_cupo_service import (
    LIMITE_MINUTOS,
    LIMITE_SEGUNDOS,
    apply_claim,
    claim_segundos,
    fecha_bogota,
    finalizar_sesion,
    iniciar_sesion,
    leer_cupo,
    reclamar_segundos,
    remaining_hoy,
)

BOGOTA = ZoneInfo("America/Bogota")


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, store, name, seq):
        self.store = store
        self.name = name
        self.seq = seq
        self._op = "select"
        self._filters = {}
        self._payload = None
        self._cols = "*"

    def select(self, cols="*", **_k):
        self._op = "select"
        self._cols = cols
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def execute(self):
        rows = self.store.setdefault(self.name, [])
        if self._op == "select":
            found = [
                dict(r)
                for r in rows
                if all(str(r.get(k)) == str(v) for k, v in self._filters.items())
            ]
            return _FakeResult(found)
        if self._op == "insert":
            row = dict(self._payload)
            if "id" not in row or row["id"] is None:
                self.seq[self.name] = self.seq.get(self.name, 0) + 1
                row["id"] = self.seq[self.name]
            rows.append(row)
            return _FakeResult([dict(row)])
        if self._op == "update":
            updated = []
            for r in rows:
                if all(str(r.get(k)) == str(v) for k, v in self._filters.items()):
                    r.update(self._payload)
                    updated.append(dict(r))
            return _FakeResult(updated)
        return _FakeResult([])


class _FakeSb:
    """Supabase mínimo + RPC claim atómico en memoria (simula FOR UPDATE)."""

    def __init__(self):
        self.store = {}
        self.seq = {}
        self._rpc_lock = threading.Lock()

    def table(self, name):
        return _FakeTable(self.store, name, self.seq)

    def rpc(self, name, params):
        assert name == "acta_grabacion_claim_segundos"
        return _FakeRpc(self, params)


class _FakeRpc:
    def __init__(self, sb: _FakeSb, params: dict):
        self.sb = sb
        self.params = params

    def execute(self):
        with self.sb._rpc_lock:
            cid = int(self.params["p_contrato_id"])
            fecha = str(self.params["p_fecha"])
            pedir = int(self.params["p_segundos"])
            limite = int(self.params.get("p_limite") or LIMITE_SEGUNDOS)
            rows = self.sb.store.setdefault("acta_grabacion_cupo_diario", [])
            row = next(
                (
                    r
                    for r in rows
                    if str(r.get("contrato_id")) == str(cid) and str(r.get("fecha")) == fecha
                ),
                None,
            )
            if row is None:
                row = {
                    "contrato_id": cid,
                    "fecha": fecha,
                    "segundos_consumidos": 0,
                    "updated_at": datetime.now(BOGOTA).isoformat(),
                }
                rows.append(row)
            nuevo, claimed, restantes = apply_claim(
                int(row["segundos_consumidos"]), pedir, limite
            )
            row["segundos_consumidos"] = nuevo
            row["updated_at"] = datetime.now(BOGOTA).isoformat()
            return _FakeResult(
                {
                    "ok": claimed > 0 or pedir == 0,
                    "claimed": claimed,
                    "segundos_consumidos": nuevo,
                    "segundos_restantes": restantes,
                    "limite_segundos": limite,
                    "fecha": fecha,
                }
            )


def test_limites_constantes():
    assert LIMITE_MINUTOS == 180
    assert LIMITE_SEGUNDOS == 10800
    assert remaining_hoy(0) == 10800
    assert remaining_hoy(10800) == 0
    assert remaining_hoy(10801) == 0


def test_fecha_bogota_cambia_a_medianoche_colombia():
    before = datetime(2026, 9, 11, 23, 59, tzinfo=BOGOTA)
    after = datetime(2026, 9, 12, 0, 1, tzinfo=BOGOTA)
    assert str(fecha_bogota(before)) == "2026-09-11"
    assert str(fecha_bogota(after)) == "2026-09-12"


def test_apply_claim_parcial_al_agotar():
    nuevo, claimed, restantes = apply_claim(10750, 100)
    assert claimed == 50
    assert nuevo == 10800
    assert restantes == 0


def test_leer_cupo_vacio():
    sb = _FakeSb()
    now = datetime(2026, 9, 12, 10, 0, tzinfo=BOGOTA)
    cupo = leer_cupo(sb, 1, now=now)
    assert cupo["permitido"] is True
    assert cupo["blocked"] is False
    assert cupo["segundos_restantes"] == LIMITE_SEGUNDOS
    assert cupo["fecha"] == "2026-09-12"


def test_iniciar_bloquea_si_agotado():
    sb = _FakeSb()
    now = datetime(2026, 9, 12, 10, 0, tzinfo=BOGOTA)
    sb.store["acta_grabacion_cupo_diario"] = [
        {
            "contrato_id": 5,
            "fecha": "2026-09-12",
            "segundos_consumidos": LIMITE_SEGUNDOS,
        }
    ]
    with pytest.raises(HTTPException) as ei:
        iniciar_sesion(sb, 5, usuario_id=9, now=now)
    assert ei.value.status_code == 429
    assert "agotado" in ei.value.detail.lower()


def test_flujo_parcial_exacto_y_cierre_ordenado():
    sb = _FakeSb()
    now = datetime(2026, 9, 12, 11, 0, tzinfo=BOGOTA)
    # Dejar 90 s de cupo
    sb.store["acta_grabacion_cupo_diario"] = [
        {
            "contrato_id": 2,
            "fecha": "2026-09-12",
            "segundos_consumidos": LIMITE_SEGUNDOS - 90,
        }
    ]
    started = iniciar_sesion(sb, 2, usuario_id=3, now=now)
    sid = started["sesion"]["id"]
    assert started["permitido"] is True

    r1 = reclamar_segundos(sb, 2, sid, 3, 60, now=now)
    assert r1["claimed"] == 60
    assert r1["segundos_restantes"] == 30
    assert r1["debe_cerrar"] is False

    r2 = reclamar_segundos(sb, 2, sid, 3, 60, now=now)
    assert r2["claimed"] == 30  # parcial
    assert r2["segundos_restantes"] == 0
    assert r2["debe_cerrar"] is True
    assert r2["sesion"]["estado"] == "agotada"

    fin = finalizar_sesion(sb, 2, sid, 3, segundos_adicionales=10, now=now)
    assert fin["claimed"] == 0  # ya no activa / sin cupo
    assert fin["sesion"]["estado"] == "agotada"
    assert fin["segundos_consumidos"] == LIMITE_SEGUNDOS


def test_consumo_exacto_180_minutos():
    sb = _FakeSb()
    now = datetime(2026, 9, 12, 8, 0, tzinfo=BOGOTA)
    started = iniciar_sesion(sb, 7, usuario_id=1, now=now)
    sid = started["sesion"]["id"]
    restantes = LIMITE_SEGUNDOS
    out = None
    while restantes > 0:
        chunk = min(120, restantes)
        out = reclamar_segundos(sb, 7, sid, 1, chunk, now=now)
        assert out["claimed"] == chunk
        restantes = out["segundos_restantes"]
    assert out is not None
    assert out["blocked"] is True
    assert out["segundos_consumidos"] == LIMITE_SEGUNDOS
    with pytest.raises(HTTPException) as ei:
        iniciar_sesion(sb, 7, usuario_id=2, now=now)
    assert ei.value.status_code == 429


def test_concurrente_no_supera_limite():
    sb = _FakeSb()
    now = datetime(2026, 9, 12, 9, 0, tzinfo=BOGOTA)
    s1 = iniciar_sesion(sb, 10, usuario_id=1, now=now)["sesion"]["id"]
    s2 = iniciar_sesion(sb, 10, usuario_id=2, now=now)["sesion"]["id"]

    claimed_total = {"n": 0}
    lock = threading.Lock()

    def worker(sesion_id, uid):
        local = 0
        for _ in range(200):
            out = reclamar_segundos(sb, 10, sesion_id, uid, 60, now=now)
            c = int(out["claimed"])
            local += c
            if c == 0 or out["debe_cerrar"]:
                break
        with lock:
            claimed_total["n"] += local
        return local

    with ThreadPoolExecutor(max_workers=2) as pool:
        futs = [
            pool.submit(worker, s1, 1),
            pool.submit(worker, s2, 2),
        ]
        parts = [f.result() for f in as_completed(futs)]

    assert sum(parts) == LIMITE_SEGUNDOS
    assert claimed_total["n"] == LIMITE_SEGUNDOS
    cupo = leer_cupo(sb, 10, now=now)
    assert cupo["segundos_consumidos"] == LIMITE_SEGUNDOS
    assert cupo["segundos_restantes"] == 0


def test_rollover_dia_bogota_reinicia_cupo():
    sb = _FakeSb()
    dia1 = datetime(2026, 9, 12, 23, 50, tzinfo=BOGOTA)
    dia2 = datetime(2026, 9, 13, 0, 5, tzinfo=BOGOTA)
    sb.store["acta_grabacion_cupo_diario"] = [
        {
            "contrato_id": 3,
            "fecha": "2026-09-12",
            "segundos_consumidos": LIMITE_SEGUNDOS,
        }
    ]
    assert leer_cupo(sb, 3, now=dia1)["blocked"] is True
    cupo2 = leer_cupo(sb, 3, now=dia2)
    assert cupo2["fecha"] == "2026-09-13"
    assert cupo2["permitido"] is True
    assert cupo2["segundos_restantes"] == LIMITE_SEGUNDOS

    started = iniciar_sesion(sb, 3, usuario_id=8, now=dia2)
    out = reclamar_segundos(sb, 3, started["sesion"]["id"], 8, 30, now=dia2)
    assert out["claimed"] == 30
    assert out["fecha"] == "2026-09-13"
    assert leer_cupo(sb, 3, now=dia1)["segundos_consumidos"] == LIMITE_SEGUNDOS


def test_claim_segundos_respeta_cap_por_llamada_y_tope_diario():
    sb = _FakeSb()
    now = datetime(2026, 9, 12, 12, 0, tzinfo=BOGOTA)
    # Cap por heartbeat: máx. 120 s por llamada
    a = claim_segundos(sb, 99, 10000, now=now)
    assert a["claimed"] == 120
    # Llenar hasta el límite con claims de 120
    while True:
        out = claim_segundos(sb, 99, 120, now=now)
        if out["claimed"] == 0:
            break
    assert out["segundos_consumidos"] == LIMITE_SEGUNDOS
    assert out["blocked"] is True
    # Claim parcial justo al borde
    sb2 = _FakeSb()
    sb2.store["acta_grabacion_cupo_diario"] = [
        {
            "contrato_id": 99,
            "fecha": "2026-09-12",
            "segundos_consumidos": LIMITE_SEGUNDOS - 40,
        }
    ]
    parcial = claim_segundos(sb2, 99, 120, now=now)
    assert parcial["claimed"] == 40
    assert parcial["debe_cerrar"] is True
