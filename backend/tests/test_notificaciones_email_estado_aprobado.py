"""_usuarios_vinculados_contrato solo incluye estado Aprobado."""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from notificaciones_email_service import NotificacionesEmailRunner


class _Q:
    def __init__(self, sb: "_FakeSB", table: str):
        self._sb = sb
        self._table = table
        self._filters: Dict[str, Any] = {}
        self._in_filter: Optional[tuple] = None

    def select(self, *_cols):
        return self

    def eq(self, col: str, val: Any):
        self._filters[col] = val
        return self

    def in_(self, col: str, vals: List[Any]):
        self._in_filter = (col, vals)
        return self

    def execute(self):
        return _R(self._sb._run(self))


class _R:
    def __init__(self, data):
        self.data = data


class _FakeSB:
    def __init__(self, users: List[dict]):
        self.users = {int(u["id"]): u for u in users}
        self.links: Dict[int, List[int]] = {}  # contrato_id -> usuario_ids

    def table(self, name: str) -> _Q:
        return _Q(self, name)

    def _run(self, q: _Q):
        if q._table == "usuarios":
            estado_f = q._filters.get("estado")
            activo_f = q._filters.get("activo")
            if q._filters.get("contrato_id") is not None:
                cid = int(q._filters["contrato_id"])
                out = []
                for uid in self.links.get(cid, []):
                    u = self.users.get(uid)
                    if not u:
                        continue
                    if activo_f is not None and u.get("activo") != activo_f:
                        continue
                    if estado_f is not None and (u.get("estado") or "").lower() != str(estado_f).lower():
                        continue
                    if u.get("contrato_id") == cid:
                        out.append({"id": u["id"]})
                return out
            if q._in_filter:
                _, ids = q._in_filter
                out = []
                for i in ids:
                    u = self.users.get(int(i))
                    if not u:
                        continue
                    if activo_f is not None and u.get("activo") != activo_f:
                        continue
                    if estado_f is not None and (u.get("estado") or "").lower() != str(estado_f).lower():
                        continue
                    out.append(u)
                return out
            return []
        if q._table == "usuario_contratos":
            cid = q._filters.get("contrato_id")
            if cid is None:
                return []
            return [{"usuario_id": uid} for uid in self.links.get(int(cid), [])]
        return []


def _runner(sb: _FakeSB) -> NotificacionesEmailRunner:
    return NotificacionesEmailRunner(
        sb,
        lambda fn: fn(),
        permiso_reporte_cantidades_user_id=lambda *_a: True,
        nivel_validacion_usuario=lambda *_a: 1,
        niveles_activos_contrato=lambda *_a: [1],
        acta_rpo_vigente_row=lambda *_a: {"id": 1},
        es_desarrollador_user_id=lambda *_a: False,
        destinatarios_resumen_jornada=lambda *_a: [],
        fetch_matriz_validacion_email=lambda *_a: {},
        fetch_capitulos_financiero_email=lambda *_a: {},
        ids_cargo_por_nombre=lambda *_a: [],
        usuarios_activos_por_cargos=lambda *_a: [],
        usuario_vinculado_contrato=lambda uid, cid: True,
    )


def test_excluye_pendiente_y_rechazado_aunque_activos():
    users = [
        {
            "id": 1,
            "email": "a@t.local",
            "nombre": "A",
            "apellidos": "Ok",
            "cargo_id": 1,
            "contrato_id": 10,
            "activo": True,
            "estado": "aprobado",
        },
        {
            "id": 2,
            "email": "p@t.local",
            "nombre": "P",
            "apellidos": "Pend",
            "cargo_id": 1,
            "contrato_id": 10,
            "activo": True,
            "estado": "pendiente",
        },
        {
            "id": 3,
            "email": "r@t.local",
            "nombre": "R",
            "apellidos": "Rech",
            "cargo_id": 1,
            "contrato_id": 10,
            "activo": True,
            "estado": "rechazado",
        },
    ]
    sb = _FakeSB(users)
    sb.links[10] = [1, 2, 3]
    r = _runner(sb)
    out = r._usuarios_vinculados_contrato(10)
    assert [u["id"] for u in out] == [1]


def test_incluye_aprobado_vinculado_solo_por_usuario_contratos():
    users = [
        {
            "id": 9,
            "email": "sec@t.local",
            "nombre": "Sec",
            "apellidos": "Link",
            "cargo_id": 1,
            "contrato_id": 99,
            "activo": True,
            "estado": "aprobado",
        },
    ]
    sb = _FakeSB(users)
    sb.links[10] = [9]
    r = _runner(sb)
    out = r._usuarios_vinculados_contrato(10)
    assert [u["id"] for u in out] == [9]
