"""Firma digital en Orden de Compra y eliminación dev de solicitudes."""
import pytest

from almacen_firma_pdf import firma_url_a_data_uri
from almacen_orden_compra_pdf import _html_firma_oc_celda, generar_pdf_orden_compra
from almacen_service import _usuario_firma_url, aprobar_solicitud, eliminar_solicitud_desarrollador


def test_firma_url_data_uri_invalido_no_rompe():
    uri = "data:image/png;base64,@@@not-valid@@@"
    out = firma_url_a_data_uri(uri)
    assert out.startswith("data:image/")


def test_firma_url_aplana_png_transparente():
    """PNG con alpha se aplana sobre blanco (evita fondo negro en xhtml2pdf)."""
    import base64
    import io
    from PIL import Image

    im = Image.new("RGBA", (8, 8), (0, 128, 255, 0))  # totalmente transparente
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    out = firma_url_a_data_uri(uri)
    assert out.startswith("data:image/png;base64,")
    raw = base64.b64decode(out.split(",", 1)[1])
    flat = Image.open(io.BytesIO(raw))
    assert flat.mode == "RGB"
    assert flat.getpixel((0, 0)) == (255, 255, 255)


def test_html_firma_oc_celda_incluye_imagen():
    html = _html_firma_oc_celda(
        "Aprobó",
        "Juan Pérez",
        "2026-07-09",
        "data:image/png;base64,iVBORw0KGgo=",
    )
    assert "<img" in html
    assert "data:image/png;base64" in html


def test_html_firma_oc_celda_sin_firma_espacio_reservado():
    html = _html_firma_oc_celda("Solicitó", "Ana", "2026-07-09", "")
    assert "<img" not in html
    assert "height:28pt" in html


def test_usuario_firma_url_desde_perfil(monkeypatch):
    class FakeTable:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": [{"firma_imagen_url": "https://cdn.test/firma.png"}]})()

    class FakeSB:
        def table(self, name):
            assert name == "usuarios"
            return FakeTable()

    assert _usuario_firma_url(FakeSB(), 5) == "https://cdn.test/firma.png"
    assert _usuario_firma_url(FakeSB(), None) is None


def test_aprobar_solicitud_sin_firma_perfil_falla(monkeypatch):
    class FakeTable:
        def __init__(self, name):
            self.name = name

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def is_(self, *_a, **_k):
            return self

        def update(self, _row):
            return self

        def execute(self):
            if self.name == "almacen_solicitud_item":
                return type("R", (), {"data": [{
                    "id": 9,
                    "estado_validacion": "aprobado",
                    "insumo_id": 1,
                    "material_descripcion": "Arena",
                    "cantidad": 1,
                    "unidad": "UND",
                    "es_recurrente": True,
                    "valor_compra_unitario": 1000,
                    "presupuesto_id": 1,
                }]})()
            return type("R", (), {"data": []})()

    class FakeSB:
        def table(self, name):
            return FakeTable(name)

    monkeypatch.setattr("almacen_service._sb", lambda: FakeSB())
    monkeypatch.setattr(
        "almacen_service._fetch_solicitud_head",
        lambda *_a, **_k: {
            "id": 1,
            "contrato_id": 10,
            "estado": "enviada",
            "created_by": 2,
            "consecutivo": 1,
        },
    )
    monkeypatch.setattr("almacen_service._fetch_ocs_de_solicitud", lambda *_a, **_k: [])
    monkeypatch.setattr(
        "almacen_service._usuario_firma_url",
        lambda _sb, uid: None if uid == 7 else "https://cdn.test/sol.png",
    )
    monkeypatch.setattr("almacen_service._next_consecutivo", lambda *_a, **_k: 1)

    with pytest.raises(ValueError, match="firma"):
        aprobar_solicitud(10, 1, 7, {"aprobar_todos_pendientes": False})


def test_eliminar_solicitud_desarrollador_solo_dev(monkeypatch):
    monkeypatch.setattr("main._es_desarrollador", lambda _u: False)

    with pytest.raises(ValueError, match="Desarrollador"):
        eliminar_solicitud_desarrollador(10, 1, {"id": 99})


def test_solicitud_tiene_orden_compra_con_null():
    from almacen_service import _solicitud_tiene_orden_compra

    assert not _solicitud_tiene_orden_compra({"orden_compra": None, "tiene_orden_compra": False})
    assert _solicitud_tiene_orden_compra({"orden_compra": {"id": 5}})
    assert _solicitud_tiene_orden_compra({"tiene_orden_compra": True, "orden_compra": None})


def test_aprobar_solicitud_orden_compra_null_no_attribute_error(monkeypatch):
    class FakeTable:
        def __init__(self, name):
            self.name = name
            self._did_insert = False
            self._filters = {}

        def select(self, *_a, **_k):
            return self

        def eq(self, key, val):
            self._filters[key] = val
            return self

        def limit(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def is_(self, *_a, **_k):
            return self

        def update(self, _row):
            return self

        def insert(self, _row):
            self._did_insert = True
            self._inserted = _row
            return self

        def execute(self):
            if self.name == "almacen_solicitud_item" and not self._did_insert:
                # Ítems aprobados para generar OC
                return type("R", (), {"data": [{
                    "id": 9,
                    "estado_validacion": "aprobado",
                    "insumo_id": 1,
                    "material_descripcion": "Arena",
                    "cantidad": 1,
                    "unidad": "UND",
                    "es_recurrente": True,
                    "valor_compra_unitario": 1000,
                    "presupuesto_id": 1,
                }]})()
            if self.name == "almacen_orden_compra" and self._did_insert:
                return type("R", (), {"data": [{"id": 99}]})()
            if self.name == "almacen_orden_compra":
                return type("R", (), {"data": []})()
            return type("R", (), {"data": []})()

    class FakeSB:
        def table(self, name):
            return FakeTable(name)

    sol = {
        "id": 1,
        "contrato_id": 10,
        "estado": "enviada",
        "created_by": 2,
        "orden_compra": None,
        "tiene_orden_compra": False,
        "items": [{
            "id": 9,
            "estado_validacion": "aprobado",
            "insumo_id": 1,
            "material_descripcion": "Arena",
            "cantidad": 1,
            "unidad": "UND",
            "es_recurrente": True,
            "valor_compra_unitario": 1000,
            "presupuesto_id": 1,
        }],
    }

    monkeypatch.setattr("almacen_service._sb", lambda: FakeSB())
    monkeypatch.setattr(
        "almacen_service._fetch_solicitud_head",
        lambda *_a, **_k: {
            "id": 1,
            "contrato_id": 10,
            "estado": "enviada",
            "created_by": 2,
            "consecutivo": 1,
        },
    )
    monkeypatch.setattr("almacen_service._fetch_ocs_de_solicitud", lambda *_a, **_k: [])
    monkeypatch.setattr("almacen_service.get_solicitud", lambda *_a, **kw: dict(sol))
    monkeypatch.setattr(
        "almacen_service._usuario_firma_url",
        lambda _sb, uid: "https://cdn.test/firma.png",
    )
    monkeypatch.setattr("almacen_service._next_consecutivo", lambda *_a, **_k: 1)
    monkeypatch.setattr("almacen_service._now_iso", lambda: "2026-01-01T00:00:00+00:00")
    monkeypatch.setattr("almacen_service._enrich_solicitud_usuarios", lambda _sb, s, **_k: s)
    monkeypatch.setattr("almacen_service.generar_y_guardar_pdf_oc", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._lanzar_pdfs_oc", lambda *_a, **_k: None)

    result = aprobar_solicitud(10, 1, 7, {"aprobar_todos_pendientes": False})
    assert result["orden_compra_generada"]["id"] == 99
    assert len(result["ordenes_compra_generadas"]) == 1
    assert result["ordenes_compra_generadas"][0]["proveedor_nombre"] == "Compra recurrente"


def test_generar_pdf_oc_con_firma_data_uri(monkeypatch):
    monkeypatch.setattr(
        "almacen_orden_compra_pdf.firma_url_a_data_uri",
        lambda url: url if url else "",
    )
    monkeypatch.setattr(
        "almacen_orden_compra_pdf.to_pdf_bytes",
        lambda html, **_k: html.encode("utf-8"),
    )

    pdf = generar_pdf_orden_compra(
        contrato={"numero": "CTO-1", "contratista": "Demo", "nit": "123"},
        orden_compra={"numero_oc": 1, "items": [], "created_at": "2026-07-09"},
        solicitud={"consecutivo": 5, "items": [], "solicitante_nombre": "Ana"},
        aprobador_nombre="Director",
        aprobador_firma_url="data:image/png;base64,abc",
        solicitante_firma_url="data:image/png;base64,def",
    )
    html = pdf.decode("utf-8")
    assert html.count("<img") >= 2
    assert "data:image/png;base64,abc" in html
