"""El ojo del catálogo encuentra el PDF guardado aunque el nombre esté saneado."""
from __future__ import annotations

import pytest

import catalogo_insumos_service as cis


def test_ganadora_coincide_con_el_nombre_original():
    row = {
        "soporte_pdf_blob_path": "almacen-soportes/1/insumos-soporte/9/Mi_cotizacion.pdf",
        "soporte_pdf_nombre": "Mi_cotizacion.pdf",
    }
    found = cis.resolver_blob_cotizacion_insumo(row, [], "Mi cotizacion.pdf", prefer="ganadora")
    assert found["kind"] == "ganadora"
    assert found["blob_path"].endswith("Mi_cotizacion.pdf")


def test_no_previsto_prefiere_el_soporte_aunque_el_nombre_coincida_con_la_ganadora():
    row = {
        "soporte_pdf_blob_path": "blob/ganadora.pdf",
        "soporte_pdf_nombre": "misma.pdf",
    }
    soportes = [
        {"id": 4, "nombre": "misma.pdf", "blob_path": "blob/viejo.pdf"},
        {"id": 11, "nombre": "misma.pdf", "blob_path": "blob/nuevo.pdf"},
    ]
    found = cis.resolver_blob_cotizacion_insumo(row, soportes, "misma.pdf", prefer="soporte")
    assert found["kind"] == "soporte"
    assert found["soporte_id"] == 11
    assert found["blob_path"] == "blob/nuevo.pdf"


def test_fila_perdedora_cae_al_soporte_mas_reciente():
    soportes = [
        {"id": 2, "nombre": "Oferta_B.pdf", "blob_path": "blob/b.pdf"},
        {"id": 8, "nombre": "Oferta B.pdf", "blob_path": "blob/b2.pdf"},
    ]
    found = cis.resolver_blob_cotizacion_insumo(
        {"soporte_pdf_blob_path": "blob/otra.pdf", "soporte_pdf_nombre": "otra.pdf"},
        soportes,
        "Oferta B.pdf",
        prefer="soporte",
    )
    assert found["blob_path"] == "blob/b2.pdf"


def test_sin_archivo_explica_que_no_esta_disponible():
    with pytest.raises(ValueError, match="Vuelva a adjuntarlo"):
        cis.resolver_blob_cotizacion_insumo(
            {"soporte_pdf_blob_path": "blob/x.pdf", "soporte_pdf_nombre": "x.pdf"},
            [],
            "no-existe.pdf",
        )


def test_ganadora_sin_coincidencia_usa_el_soporte():
    row = {"soporte_pdf_blob_path": "blob/win.pdf", "soporte_pdf_nombre": "win.pdf"}
    soportes = [{"id": 3, "nombre": "perd.pdf", "blob_path": "blob/perd.pdf"}]
    found = cis.resolver_blob_cotizacion_insumo(row, soportes, "perd.pdf", prefer="ganadora")
    assert found["kind"] == "soporte"
    assert found["blob_path"] == "blob/perd.pdf"


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table, store):
        self.table = table
        self.store = store
        self.filters = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        rows = []
        for row in self.store.get(self.table, []):
            if all(row.get(k) == v for k, v in self.filters.items()):
                rows.append(row)
        return _Resp(rows)


def test_descarga_el_blob_privado_de_la_fila(monkeypatch):
    store = {
        "almacen_insumo": [{
            "id": 9,
            "contrato_id": 3,
            "soporte_pdf_blob_path": "blob/gan.pdf",
            "soporte_pdf_nombre": "gan.pdf",
        }],
        "almacen_insumo_cotizacion_soporte": [{
            "id": 5,
            "insumo_id": 9,
            "nombre": "np.pdf",
            "blob_path": "blob/np.pdf",
        }],
    }
    llamadas = []

    monkeypatch.setattr(cis, "_sb", lambda: type("SB", (), {"table": lambda _s, name: _Query(name, store)})())

    def _bajar(path):
        llamadas.append(path)
        return b"%PDF-np", "application/pdf"

    monkeypatch.setattr(cis, "download_soporte", _bajar)
    data, mime, nombre = cis.download_cotizacion_pdf_de_insumo(3, 9, "np.pdf", prefer="soporte")
    assert data.startswith(b"%PDF")
    assert mime == "application/pdf"
    assert nombre == "np.pdf"
    assert llamadas == ["blob/np.pdf"]


def test_blob_vacio_o_ajeno_al_contrato_no_se_abre(monkeypatch):
    store = {"almacen_insumo": [], "almacen_insumo_cotizacion_soporte": []}
    monkeypatch.setattr(cis, "_sb", lambda: type("SB", (), {"table": lambda _s, name: _Query(name, store)})())
    with pytest.raises(ValueError, match="Insumo no encontrado"):
        cis.download_cotizacion_pdf_de_insumo(3, 9, "x.pdf")

    store["almacen_insumo"] = [{
        "id": 9,
        "contrato_id": 3,
        "soporte_pdf_blob_path": "blob/gan.pdf",
        "soporte_pdf_nombre": "gan.pdf",
    }]
    monkeypatch.setattr(cis, "download_soporte", lambda _path: (b"", "application/pdf"))
    with pytest.raises(ValueError, match="Vuelva a adjuntarlo"):
        cis.download_cotizacion_pdf_de_insumo(3, 9, "gan.pdf", prefer="ganadora")


def test_el_nombre_con_tildes_cabe_en_el_encabezado():
    assert cis._filename_header("Cotización.pdf") == "Cotización.pdf"
    assert cis._filename_header("报价.pdf") == "pdf.pdf"
    assert cis._filename_header('oferta "a".pdf') == "oferta a.pdf"
    cis._filename_header("Cotización.pdf").encode("latin-1")
    cis._filename_header("报价.pdf").encode("latin-1")


def test_la_ruta_de_previsualizacion_exige_ver():
    from pathlib import Path
    src = Path(__file__).resolve().parents[1].joinpath("catalogo_insumos_routes.py").read_text(encoding="utf-8")
    assert '/insumos/{insumo_id}/cotizacion-pdf' in src
    bloque = src.split("def route_preview_cotizacion_insumo", 1)[1].split("def route_", 1)[0]
    assert 'require_permiso_catalogo_insumos(current_user, "ver")' in bloque
