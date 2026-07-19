"""Cobertura multi-contrato en notificaciones email."""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import pytest

from notificaciones_email_service import NotificacionesEmailRunner


CONTRATOS = [
    {"id": 2, "numero": "IDU-1551-2017"},
    {"id": 3, "numero": "ICCU-CTO-1614-2025"},
]

USUARIO_MULTI = {
    "id": 100,
    "email": "multi@test.local",
    "nombre": "Ana",
    "apellidos": "Multi",
    "cargo_id": 1,
    "contrato_id": 2,
    "activo": True,
    "estado": "aprobado",
}


class _Q:
    def __init__(self, sb: "_FakeSupabase", table: str):
        self._sb = sb
        self._table = table
        self._filters: Dict[str, Any] = {}
        self._in_filter: Optional[tuple] = None
        self._is_null: Optional[str] = None
        self._limit: Optional[int] = None
        self._on_conflict: Optional[str] = None
        self._upsert_row: Optional[dict] = None

    def select(self, *_cols):
        return self

    def eq(self, col: str, val: Any):
        self._filters[col] = val
        return self

    def in_(self, col: str, vals: List[Any]):
        self._in_filter = (col, vals)
        return self

    def is_(self, col: str, val: str):
        if val == "null":
            self._is_null = col
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def upsert(self, row: dict, on_conflict: str = ""):
        self._upsert_row = row
        self._on_conflict = on_conflict
        return self

    def execute(self):
        return _R(self._sb._run(self))


class _R:
    def __init__(self, data):
        self.data = data


class _FakeSupabase:
    def __init__(self):
        self.envios: List[dict] = []
        self.rpc_calls: List[tuple] = []
        self.copiados: set[tuple] = set()
        self.sin_item_counts = {2: 3, 3: 5}
        self.pendiente_counts = {(2, 1): 2, (3, 1): 4}

    def table(self, name: str) -> _Q:
        return _Q(self, name)

    def rpc(self, fn: str, params: dict):
        self.rpc_calls.append((fn, params))

        class _RpcQ:
            def __init__(self, outer, fn_name, p):
                self._outer = outer
                self._fn = fn_name
                self._p = p

            def execute(self):
                if self._fn == "notif_email_count_sin_item":
                    cid = int(self._p["p_contrato_id"])
                    return _R([{"count": self._outer.sin_item_counts.get(cid, 0)}])
                if self._fn == "notif_email_count_pendiente_nivel":
                    cid = int(self._p["p_contrato_id"])
                    nivel = int(self._p["p_nivel"])
                    return _R([{"count": self._outer.pendiente_counts.get((cid, nivel), 0)}])
                if self._fn == "notif_email_registros_dia":
                    return _R([{"n_reg": 1, "total_valor": 1000}])
                if self._fn == "notif_email_aprobados_nivel":
                    return _R([{"aprobado_dia": 1, "aprobado_acum": 10}])
                return _R([])

        return _RpcQ(self, fn, params)

    def _run(self, q: _Q):
        if q._table == "contratos":
            return CONTRATOS
        if q._table == "usuarios":
            if q._filters.get("contrato_id") is not None:
                cid = int(q._filters["contrato_id"])
                if cid in (2, 3):
                    return [{"id": USUARIO_MULTI["id"]}]
                return []
            if q._in_filter:
                _, ids = q._in_filter
                if USUARIO_MULTI["id"] in ids:
                    return [USUARIO_MULTI]
                return []
            if q._filters.get("id") == USUARIO_MULTI["id"]:
                return [USUARIO_MULTI]
            if q._filters.get("id") == 200:
                return [
                    {
                        "id": 200,
                        "email": "admin@test.local",
                        "nombre": "Admin",
                        "apellidos": "Contrato",
                    }
                ]
            return []
        if q._table == "usuario_contratos":
            if q._filters.get("contrato_id") == 2:
                return [{"usuario_id": USUARIO_MULTI["id"]}]
            if q._filters.get("contrato_id") == 3:
                return [{"usuario_id": USUARIO_MULTI["id"]}]
            return []
        if q._table == "informe_periodico_copia":
            key = (
                int(q._filters["usuario_id"]),
                int(q._filters["contrato_id"]),
                q._filters["slot_id"],
            )
            return [{"id": 1}] if key in self.copiados else []
        if q._table == "notificaciones_email_envio":
            if q._upsert_row is not None:
                self.envios.append(q._upsert_row)
                return [q._upsert_row]
            return []
        return []


def _supabase_execute(fn: Callable):
    return fn()


@pytest.fixture
def runner(monkeypatch):
    sb = _FakeSupabase()

    def _perm(uid: int, accion: str, cid: int) -> bool:
        return uid == 100 and accion in ("editar", "validar")

    def _vinculado(uid: int, cid: int) -> bool:
        return uid == 100 and cid in (2, 3)

    def _nivel(uid: int):
        return 1 if uid == 100 else None

    def _niveles(cid: int):
        return [1, 2]

    def _admin_dest(cid: int):
        return [100] if cid in (2, 3) else []

    r = NotificacionesEmailRunner(
        sb,
        _supabase_execute,
        permiso_reporte_cantidades_user_id=_perm,
        nivel_validacion_usuario=_nivel,
        niveles_activos_contrato=_niveles,
        acta_rpo_vigente_row=lambda cid: {"id": 1},
        es_desarrollador_user_id=lambda uid: False,
        destinatarios_admin_contrato=_admin_dest,
        ids_cargo_por_nombre=lambda n: [],
        usuarios_activos_por_cargos=lambda ids: [],
        usuario_vinculado_contrato=_vinculado,
    )

    sent: List[tuple] = []

    def _fake_send(to, subj, txt, html):
        sent.append((to, subj))
        return True

    monkeypatch.setattr(
        "notificaciones_email_service.try_send_notification_email",
        _fake_send,
    )
    monkeypatch.setattr("notificaciones_email_service.smtp_configured", lambda: True)
    return r, sb, sent


def test_sin_item_evalua_todos_los_contratos(runner):
    r, sb, sent = runner
    stats = r.run_sin_item_asignado("2026-07-21_0800")
    assert stats["contratos_evaluados"] == 2
    assert stats["enviados"] == 2
    assert len(sent) == 2
    subjects = {s[1] for s in sent}
    assert any("IDU-1551-2017" in s for s in subjects)
    assert any("ICCU-CTO-1614-2025" in s for s in subjects)
    rpc_cids = {p["p_contrato_id"] for fn, p in sb.rpc_calls if fn == "notif_email_count_sin_item"}
    assert rpc_cids == {2, 3}


def test_validacion_evalua_todos_los_contratos(runner):
    r, sb, sent = runner
    stats = r.run_validacion_pendiente("2026-07-21_0800")
    assert stats["contratos_evaluados"] == 2
    assert stats["enviados"] == 2
    subjects = {s[1] for s in sent}
    assert any("IDU-1551-2017" in s for s in subjects)
    assert any("ICCU-CTO-1614-2025" in s for s in subjects)


def test_informe_no_copiado_por_contrato(runner):
    r, sb, sent = runner
    sb.copiados.add((100, 2, "2026-07-21_0815"))
    stats = r.run_informe_no_copiado("2026-07-21", "0815", "2026-07-21_0815")
    assert stats["contratos_evaluados"] == 2
    assert stats["enviados"] == 1
    assert stats["omitidos_ya_copiaron"] == 1
    assert len(sent) == 1
    assert "ICCU-CTO-1614-2025" in sent[0][1]


def test_admin_resumen_un_correo_por_contrato(runner):
    r, sb, sent = runner
    stats = r.run_admin_resumen("2026-07-21", "manana", "2026-07-21_manana")
    assert stats["contratos_evaluados"] == 2
    assert stats["enviados"] == 2
    subjects = [s[1] for s in sent]
    assert subjects[0] != subjects[1]
    assert any("IDU-1551-2017" in s for s in subjects)
    assert any("ICCU-CTO-1614-2025" in s for s in subjects)


def test_admin_resumen_incluye_desarrolladores(runner, monkeypatch):
    """Destinatarios admin_resumen usan _destinatarios_notif_nuevo_registro (devs + admins)."""
    r, sb, sent = runner

    def _admin_dest(cid):
        return [100, 200] if cid in (2, 3) else []

    r._admin_dest = _admin_dest
    stats = r.run_admin_resumen("2026-07-21", "manana", "2026-07-21_manana")
    assert stats["enviados"] == 4  # 2 contratos × 2 destinatarios (dev + admin simulados)
    assert len(sent) == 4


def test_run_due_jobs_fin_de_semana_con_prueba_temp(runner, monkeypatch):
    import pytz
    from datetime import datetime

    from notificaciones_email_config import TZ_BOGOTA

    r, sb, sent = runner
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 18, 23, 35))
    monkeypatch.setattr("notificaciones_email_service._bogota_now", lambda: dt)
    out = r.run_due_jobs()
    assert out.get("fin_de_semana") is True
    assert len(out["jobs"]) == 1
    assert out["jobs"][0]["temp_test"] is True
    assert out["jobs"][0]["slot"] == "prueba_temp"
    assert out["jobs"][0]["enviados"] >= 1
