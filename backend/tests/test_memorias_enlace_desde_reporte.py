"""Memorias: columna Enlace toma so_reportes.enlace_soporte (no so_registros)."""
from __future__ import annotations

from ccd_conciliacion import overlay_enlace_soporte_desde_reporte


class _FakeExec:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, table, store):
        self._table = table
        self._store = store
        self._ids = None

    def select(self, *_a, **_k):
        return self

    def in_(self, col, ids):
        self._ids = list(ids)
        return self

    def execute(self):
        rows = self._store.get(self._table, [])
        if self._ids is not None:
            idset = {int(x) for x in self._ids}
            rows = [r for r in rows if int(r.get("id")) in idset]
        return _FakeExec(rows)


class _FakeSb:
    def __init__(self, reportes):
        self._store = {"so_reportes": reportes}

    def table(self, name):
        return _FakeQuery(name, self._store)


def test_overlay_sella_enlace_del_reporte_en_cada_registro():
    """
    Causa raíz: memorias leían so_registros.enlace_soporte (vacío) mientras
    SicoeObra guarda la biblioteca en so_reportes.enlace_soporte.
    """
    sb = _FakeSb(
        [
            {
                "id": 10,
                "enlace_soporte": '["https://drive.google.com/a","https://contoso.sharepoint.com/b.pdf"]',
            },
            {"id": 20, "enlace_soporte": None},
            {"id": 30, "enlace_soporte": "[]"},
        ]
    )
    regs = [
        {"id": 1, "reporte_id": 10, "numero_registro": 1, "enlace_soporte": None},
        {"id": 2, "reporte_id": 10, "numero_registro": 2, "enlace_soporte": "[]"},
        {"id": 3, "reporte_id": 20, "numero_registro": 3, "enlace_soporte": '["https://legacy-reg.com"]'},
        {"id": 4, "reporte_id": 30, "numero_registro": 4, "enlace_soporte": None},
        {"id": 5, "reporte_id": None, "numero_registro": 5, "enlace_soporte": '["https://solo-reg.com"]'},
    ]
    out = overlay_enlace_soporte_desde_reporte(sb, regs)

    # Mismo reporte → mismos enlaces (del reporte), aunque el registro estuviera vacío.
    assert out[0]["enlace_soporte_fuente"] == "so_reportes"
    assert "drive.google.com/a" in str(out[0]["enlace_soporte"])
    assert "sharepoint.com/b.pdf" in str(out[0]["enlace_soporte"])
    assert out[1]["enlace_soporte"] == out[0]["enlace_soporte"]

    # Reporte sin enlace: pisa el valor del registro (fuente = reporte).
    assert out[2]["enlace_soporte"] is None
    assert out[2]["enlace_soporte_fuente"] == "so_reportes"

    # Reporte con [] explícito.
    assert out[3]["enlace_soporte"] == "[]"

    # Sin reporte_id: no se toca (fallback residual).
    assert out[4]["enlace_soporte"] == '["https://solo-reg.com"]'
    assert "enlace_soporte_fuente" not in out[4]


def test_memoria_html_y_excel_usan_enlace_sellado_del_reporte():
    from openpyxl import Workbook

    # Reusar stubs de test_memorias_capitulo_fotos_formulas
    from test_memorias_capitulo_fotos_formulas import _import_informes_with_stubs

    inf = _import_informes_with_stubs()

    sb = _FakeSb(
        [
            {
                "id": 7,
                "enlace_soporte": (
                    '["https://drive.google.com/file/d/xyz/view",'
                    '"https://example.com/docs/plano.dwg"]'
                ),
            }
        ]
    )
    regs = [
        {"reporte_id": 7, "numero_registro": 11, "enlace_soporte": None},
        {"reporte_id": 7, "numero_registro": 12, "enlace_soporte": None},
        {"reporte_id": 99, "numero_registro": 13, "enlace_soporte": None},
    ]
    overlay_enlace_soporte_desde_reporte(sb, regs)

    html1 = inf._memoria_enlaces_html_cell(regs[0])
    html2 = inf._memoria_enlaces_html_cell(regs[1])
    assert html1 == html2
    assert 'href="https://drive.google.com/file/d/xyz/view"' in html1
    assert "Drive 1" in html1
    assert "plano.dwg" in html1
    assert html1.count("<a href=") == 2

    assert inf._memoria_enlaces_html_cell(regs[2]) == ""

    wb = Workbook()
    ws = wb.active
    cell = ws.cell(row=1, column=1)
    links = inf._memoria_enlaces_soporte(regs[0])
    inf._excel_write_enlaces_soporte(cell, links)
    assert "Drive 1" in str(cell.value)
    assert "plano.dwg" in str(cell.value)
    assert cell.hyperlink is not None
    href = str(getattr(cell.hyperlink, "target", None) or cell.hyperlink)
    assert "drive.google.com" in href


def test_evidencia_causa_raiz_documentada_en_overlay():
    doc = overlay_enlace_soporte_desde_reporte.__doc__ or ""
    assert "so_reportes.enlace_soporte" in doc
    assert "so_registros.enlace_soporte" in doc
    assert "vacío" in doc.lower() or "null" in doc.lower() or "blanco" in doc.lower()
