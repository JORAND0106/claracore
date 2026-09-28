"""El .xlsx exportado debe ser OOXML bien formado (sin merges solapados ni repair de Excel)."""
from __future__ import annotations

import io
import zipfile
import unittest
from xml.etree import ElementTree as ET

from openpyxl import load_workbook

from topografia_planilla_tuberia_excel import (
    FIRMAS_FIRST_ROW,
    NOTAS_LAST_ROW,
    build_planilla_tuberia_xlsx,
)

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def _sample_planilla(tipo: str) -> dict:
    return {
        "tipo": tipo,
        "diametro_m": 0.9,
        "espesor_m": 0.05,
        "ancho_excavacion_m": 1.5,
        "relacion_atraque": "1:3",
        "pk_id": "PK-01",
        "costado": "Izquierdo",
        "material": "Concreto",
        "meta_cabecera": {
            "cama_triturado_m": 0.1,
            "traslapo_m": 0.3,
            "notas": ["Nota de prueba para bloque Notas"],
        },
    }


def _sample_calculo(tipo: str) -> dict:
    filas = [
        {
            "orden": 1,
            "vacio": False,
            "abscisa": 100,
            "terreno_natural": 105,
            "subrasante_via": 104,
            "cota_lomo": 103.5,
            "terminado_filtro": 104.2,
            "cota_fondo_excavacion": 103,
        },
        {
            "orden": 2,
            "vacio": False,
            "abscisa": 130,
            "terreno_natural": 104.7,
            "subrasante_via": 103.7,
            "cota_lomo": 103.2,
            "terminado_filtro": 103.9,
            "cota_fondo_excavacion": 102.7,
        },
    ]
    return {
        "cartera": {"filas": filas},
        "netos": [
            {
                "codigo": "EXC",
                "nombre": "Excavación Varias",
                "unidad": "m³",
                "long": 30,
                "ancho": 1.5,
                "espesor": 2,
                "neto": 90,
            },
            {
                "codigo": "TUB",
                "nombre": "Long Tubería",
                "unidad": "ml",
                "long": 30,
                "neto": 30,
            },
        ],
        "descuentos": [
            {
                "codigo": "DESC_A1" if tipo == "ALCANTARILLA" else "DESC_TUB_FILT",
                "nombre": "Area 1" if tipo == "ALCANTARILLA" else "Tubería Filtro",
                "cantidad": 1.2,
            }
        ],
        "notas_descuento_altura": [
            "Excavación Roca: Altura Excavación 1.0 − 0.1 = 0.9 m",
        ],
    }


def _build(tipo: str, *, vacia: bool = False) -> bytes:
    return build_planilla_tuberia_xlsx(
        planilla=_sample_planilla(tipo),
        calculo=None if vacia else _sample_calculo(tipo),
        vacia=vacia,
    )


def _parse_ref(ref: str):
    a, b = ref.split(":") if ":" in ref else (ref, ref)

    def rc(addr: str):
        col = "".join(c for c in addr if c.isalpha())
        row = int("".join(c for c in addr if c.isdigit()))
        n = 0
        for ch in col:
            n = n * 26 + (ord(ch.upper()) - 64)
        return n, row

    c1, r1 = rc(a)
    c2, r2 = rc(b)
    return min(c1, c2), max(c1, c2), min(r1, r2), max(r1, r2)


def _merge_refs_from_xlsx(raw: bytes) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    merges = root.find("m:mergeCells", NS)
    if merges is None:
        return []
    return [m.get("ref") for m in merges if m.get("ref")]


def _overlapping_merges(refs: list[str]) -> list[tuple[str, str]]:
    boxes = [(*_parse_ref(r), r) for r in refs]
    out = []
    for i, a in enumerate(boxes):
        for j, b in enumerate(boxes):
            if j <= i:
                continue
            if not (a[1] < b[0] or b[1] < a[0] or a[3] < b[2] or b[3] < a[2]):
                out.append((a[4], b[4]))
    return out


class TestExcelOoxmlValido(unittest.TestCase):
    def test_constantes_notas_no_invaden_firmas(self):
        self.assertEqual(NOTAS_LAST_ROW, 62)
        self.assertEqual(FIRMAS_FIRST_ROW, 63)
        self.assertLess(NOTAS_LAST_ROW, FIRMAS_FIRST_ROW)

    def test_alcantarilla_sin_merges_solapados(self):
        raw = _build("ALCANTARILLA")
        self.assertEqual(raw[:2], b"PK")
        refs = _merge_refs_from_xlsx(raw)
        overlaps = _overlapping_merges(refs)
        self.assertEqual(overlaps, [], msg=f"merges solapados: {overlaps}")
        # Firmas del inventario intactas
        self.assertIn("A63:G63", refs)
        self.assertIn("H63:N63", refs)
        # Ningún merge de Notas debe tocar fila 63+
        for ref in refs:
            _c0, _c1, r0, r1 = _parse_ref(ref)
            if r0 <= NOTAS_LAST_ROW and "A" in ref.split(":")[0] and r1 >= 54:
                # cuerpo notas Axx:Nyy
                if ref.startswith("A") and ":N" in ref and r0 >= 53:
                    self.assertLessEqual(r1, NOTAS_LAST_ROW, msg=ref)

    def test_filtro_sin_merges_solapados(self):
        raw = _build("FILTRO")
        overlaps = _overlapping_merges(_merge_refs_from_xlsx(raw))
        self.assertEqual(overlaps, [], msg=f"merges solapados: {overlaps}")

    def test_plantilla_vacia_tambien_limpia(self):
        for tipo in ("ALCANTARILLA", "FILTRO"):
            raw = _build(tipo, vacia=True)
            overlaps = _overlapping_merges(_merge_refs_from_xlsx(raw))
            self.assertEqual(overlaps, [], msg=f"{tipo} vacia: {overlaps}")

    def test_openpyxl_reload_chart_imagen(self):
        for tipo in ("ALCANTARILLA", "FILTRO"):
            raw = _build(tipo)
            wb = load_workbook(io.BytesIO(raw))
            ws = wb["planilla"]
            self.assertEqual(len(ws._charts), 1)
            self.assertEqual(len(ws._images), 1)
            # XML de drawing parseable
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                ET.fromstring(z.read("xl/drawings/drawing1.xml"))
                ET.fromstring(z.read("xl/charts/chart1.xml"))
                for name in z.namelist():
                    if name.endswith(".xml") or name.endswith(".rels"):
                        ET.fromstring(z.read(name))


if __name__ == "__main__":
    unittest.main()
