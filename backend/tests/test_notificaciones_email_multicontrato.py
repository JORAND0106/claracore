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
        self.resumen_snapshots: Dict[tuple, dict] = {}
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
            if q._filters.get("id") is not None:
                cid = int(q._filters["id"])
                return [c for c in CONTRATOS if int(c["id"]) == cid]
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
        if q._table == "notificaciones_email_resumen_snapshot":
            if q._upsert_row is not None:
                key = (int(q._upsert_row["contrato_id"]), q._upsert_row["fecha"])
                self.resumen_snapshots[key] = q._upsert_row
                return [q._upsert_row]
            cid = q._filters.get("contrato_id")
            fecha = q._filters.get("fecha")
            if cid is not None and fecha is not None:
                row = self.resumen_snapshots.get((int(cid), fecha))
                return [row] if row else []
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

    _matriz_stub = {
        "acta_rpo": 10,
        "niveles_activos": [1, 2],
        "nivel_maximo": 2,
        "niveles": [{"nivel": 1, "encabezado": "Inspector (N1)"}, {"nivel": 2, "encabezado": "Residente (N2)"}],
        "obra_ejecutada_directo_sin_aiu": {},
        "ensayos_sondeos_directo_sin_iva": {},
    }
    _cap_stub = {
        "capitulos_aiu": [],
        "totales_aiu": {"claracore": 0, "cobrado": 0, "delta": 0},
        "capitulos_iva": [],
        "totales_iva": {"claracore": 0, "cobrado": 0, "delta": 0},
    }

    r = NotificacionesEmailRunner(
        sb,
        _supabase_execute,
        permiso_reporte_cantidades_user_id=_perm,
        nivel_validacion_usuario=_nivel,
        niveles_activos_contrato=_niveles,
        acta_rpo_vigente_row=lambda cid: {"id": 1},
        es_desarrollador_user_id=lambda uid: False,
        destinatarios_resumen_jornada=_admin_dest,
        fetch_matriz_validacion_email=lambda cid: _matriz_stub,
        fetch_capitulos_financiero_email=lambda cid: _cap_stub,
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


def test_admin_resumen_incluye_destinatarios_gerenciales(runner, monkeypatch):
    """Destinatarios admin_resumen usan _destinatarios_resumen_jornada (devs + CG)."""
    r, sb, sent = runner

    def _resumen_dest(cid):
        return [100, 200] if cid in (2, 3) else []

    r._resumen_dest = _resumen_dest
    stats = r.run_admin_resumen("2026-07-21", "manana", "2026-07-21_manana")
    assert stats["enviados"] == 4  # 2 contratos × 2 destinatarios
    assert len(sent) == 4
    assert all("inicio de jornada" in s[1] for s in sent)


def test_admin_resumen_asunto_fin_jornada(runner):
    r, sb, sent = runner
    r.run_admin_resumen("2026-07-21", "tarde", "2026-07-21_tarde")
    assert any("fin de jornada" in s[1] for s in sent)


def test_admin_resumen_guarda_snapshot_manana_y_compara_tarde(runner, monkeypatch):
    r, sb, sent = runner
    captured_html: List[str] = []

    def _capture(to, subj, txt, html):
        captured_html.append(html)
        sent.append((to, subj))
        return True

    monkeypatch.setattr(
        "notificaciones_email_service.try_send_notification_email",
        _capture,
    )

    r.run_admin_resumen("2026-07-21", "manana", "2026-07-21_manana")
    assert (2, "2026-07-21") in sb.resumen_snapshots
    assert (3, "2026-07-21") in sb.resumen_snapshots

    r._fetch_matriz = lambda cid: {
        **_matriz_con_aprobado(cid, 500000),
    }
    r._fetch_capitulos = lambda cid: {
        "capitulos_aiu": [
            {"capitulo": "01. Cap", "claracore": 200, "cobrado": 150, "delta": 50},
        ],
        "totales_aiu": {"claracore": 200, "cobrado": 150, "delta": 50},
        "capitulos_iva": [],
        "totales_iva": {"claracore": 0, "cobrado": 0, "delta": 0},
    }

    captured_html.clear()
    sent.clear()
    r.run_admin_resumen("2026-07-21", "tarde", "2026-07-21_tarde")
    assert any("Avance durante la jornada" in h for h in captured_html)
    assert any("Aprobado adicional" in h for h in captured_html)
    assert any("Δ ClaraCore" in h for h in captured_html)
    assert any("fin de jornada" in s[1] for s in sent)


def _matriz_con_aprobado(cid: int, extra_aprobado: float):
    return {
        "acta_rpo": 10,
        "niveles_activos": [1, 2],
        "nivel_maximo": 2,
        "niveles": [{"nivel": 1, "encabezado": "Inspector (N1)"}, {"nivel": 2, "encabezado": "Residente (N2)"}],
        "obra_ejecutada_directo_sin_aiu": {
            "aprobado": {"nivel1": extra_aprobado, "nivel2": 0.0},
            "pendiente": {"nivel1": 0.0, "nivel2": 0.0},
            "pendiente_item": {"nivel1": 0.0, "nivel2": 0.0},
            "no_revisado": {"nivel1": 0.0, "nivel2": 0.0},
            "rechazado": {"nivel1": 0.0, "nivel2": 0.0},
            "habilitado": {"nivel1": 0.0, "nivel2": 0.0},
            "otras_actas": {"nivel1": 0.0, "nivel2": 0.0},
        },
        "ensayos_sondeos_directo_sin_iva": {
            "aprobado": {"nivel1": 0.0, "nivel2": 0.0},
            "pendiente": {"nivel1": 0.0, "nivel2": 0.0},
            "pendiente_item": {"nivel1": 0.0, "nivel2": 0.0},
            "no_revisado": {"nivel1": 0.0, "nivel2": 0.0},
            "rechazado": {"nivel1": 0.0, "nivel2": 0.0},
            "habilitado": {"nivel1": 0.0, "nivel2": 0.0},
            "otras_actas": {"nivel1": 0.0, "nivel2": 0.0},
        },
    }

