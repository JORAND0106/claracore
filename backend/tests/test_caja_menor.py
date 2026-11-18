"""Caja Menor: reglas, aislamiento, OCR, Excel y PDF. Sin base real."""
from __future__ import annotations

import io
from collections import defaultdict
from types import SimpleNamespace

import fitz
from openpyxl import load_workbook
from PIL import Image

import caja_menor_calc as calc
import caja_menor_ocr as ocr
import caja_menor_permissions as perm
import caja_menor_service as svc
from caja_menor_export import FORMATO_CALIDAD, build_excel, build_pdf
from caja_menor_service import DuplicadoCajaMenor


class FakeSb:
    def __init__(self):
        self.tables = defaultdict(list)

    def alloc(self):
        ids = []
        for rows in self.tables.values():
            for row in rows:
                if row.get("id") is not None:
                    ids.append(int(row["id"]))
        return (max(ids) if ids else 0) + 1

    def table(self, name):
        return FakeQuery(self, name)


class FakeQuery:
    def __init__(self, sb, name):
        self.sb = sb
        self.name = name
        self._op = "select"
        self._filters = []
        self._payload = None
        self._limit = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, row):
        self._op = "insert"
        self._payload = dict(row)
        return self

    def update(self, row):
        self._op = "update"
        self._payload = dict(row)
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, key, value):
        self._filters.append(("eq", key, value))
        return self

    def in_(self, key, values):
        self._filters.append(("in", key, list(values)))
        return self

    def is_(self, key, value):
        self._filters.append(("is", key, value))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def order(self, *_a, **_k):
        return self

    def _match(self, row):
        for op, key, value in self._filters:
            actual = row.get(key)
            if op == "eq" and actual != value:
                return False
            if op == "in" and actual not in value:
                return False
            if op == "is" and value == "null" and actual is not None:
                return False
        return True

    def execute(self):
        rows = self.sb.tables[self.name]
        if self._op == "insert":
            row = dict(self._payload)
            row.setdefault("id", self.sb.alloc())
            self.sb.tables[self.name].append(row)
            return SimpleNamespace(data=[dict(row)])
        matched = [r for r in rows if self._match(r)]
        if self._limit:
            matched = matched[: self._limit]
        if self._op == "select":
            return SimpleNamespace(data=[dict(r) for r in matched])
        if self._op == "update":
            for row in matched:
                row.update(self._payload)
            return SimpleNamespace(data=[dict(r) for r in matched])
        if self._op == "delete":
            self.sb.tables[self.name] = [r for r in rows if r not in matched]
            return SimpleNamespace(data=[dict(r) for r in matched])
        return SimpleNamespace(data=[])


class Memoria:
    def __init__(self):
        self.blobs = {}

    def save(self, contrato_id, caja_id, kind, data, mime, nombre):
        path = f"{contrato_id}/{caja_id}/{kind}/{len(self.blobs)}"
        self.blobs[path] = data
        return path

    def read(self, path):
        return self.blobs[path]


DEV = {
    "sub": "7",
    "nombre": "Ana Dev",
    "cargo_nombre": "Desarrollador",
    "contrato_id": 1,
}


def _png(ancho=80, alto=40, color=(20, 120, 140)):
    im = Image.new("RGB", (ancho, alto), color)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _semilla():
    sb = FakeSb()
    sb.table("contratos").insert({
        "id": 1, "numero": "IDU-1551", "contratista": "Obra SAS", "nit": "900111222-1",
    }).execute()
    sb.table("contratos").insert({
        "id": 2, "numero": "OTRO-9", "contratista": "Otra SAS", "nit": "800000000-1",
    }).execute()
    sb.table("roles").insert({"id": 8, "nombre": "Administrador"}).execute()
    sb.table("roles").insert({"id": 2, "nombre": "Administrativo"}).execute()
    sb.table("usuarios").insert({
        "id": 3, "nombre": "Luis Pérez", "email": "luis@obra.co", "rol_id": None, "contrato_id": 1,
    }).execute()
    sb.table("usuarios").insert({
        "id": 4, "nombre": "Marta Gerencia", "email": "marta@obra.co", "rol_id": 8, "contrato_id": 1,
    }).execute()
    sb.table("usuarios").insert({
        "id": 5, "nombre": "Rol Administrativo", "email": "adm@obra.co", "rol_id": 2, "contrato_id": 1,
    }).execute()
    sb.table("usuarios").insert({
        "id": 6, "nombre": "Ajeno", "email": "ajeno@otra.co", "rol_id": 8, "contrato_id": 2,
    }).execute()
    return sb


def _gasto(**extra):
    base = {
        "fecha": calc.hoy_colombia().isoformat(),
        "tercero_razon_social": "Ferretería El Punto",
        "tercero_documento": "900.555.666-7",
        "descripcion": "Tornillos",
        "documento_no": "",
        "centro_costos": "",
        "valor_bruto": 100000,
        "iva": 19000,
        "retenciones": 0,
        "impuesto_consumo": 0,
        "otros_deducibles": 0,
    }
    base.update(extra)
    return base


def test_indicadores_sin_dividir_por_cero_y_rechazo():
    assert calc.valor_neto(100000, 19000, 4000, 8000, 2000) == 121000
    ind = calc.indicadores(0, [], [])
    assert ind["fondo_establecido"] == 0
    assert ind["gasto_actual"] is None
    assert ind["disponible"] == 0
    assert calc.alcanza_80(0, 10, False) is False
    ind = calc.indicadores(10_000, [{"valor": 90_000}], [
        {"valor_neto": 80_000, "estado_validacion": "pendiente"},
        {"valor_neto": 50_000, "estado_validacion": "rechazado"},
    ])
    assert ind["fondo_establecido"] == 100_000
    assert ind["gastos_periodo"] == 80_000
    assert ind["disponible"] == 20_000
    assert ind["gasto_actual"] == 80
    assert calc.alcanza_80(100_000, 80_000, False) is True
    assert calc.alcanza_80(100_000, 80_000, True) is False
    assert calc.es_rol_administrador_gerencia("ADMINISTRADOR") is True
    assert calc.es_rol_administrador_gerencia("Administrativo") is False
    assert calc.fmt_pct(None) == "—"


def test_desarrollador_no_depende_de_la_matriz():
    assert perm.tiene_permiso_caja_menor(
        {"sub": "1", "cargo_nombre": "Desarrollador"}, "eliminar", 9,
    ) is True
    assert perm.acceso_caja_menor({"rol_nombre": "desarrollador"}, 3)["validar"] is True
    assert perm.tiene_permiso_caja_menor({"rol_nombre": "Administrador"}, "ver", 3) is True
    assert perm.tiene_permiso_caja_menor({"sub": "4", "rol_id": 1}, "crear", 3) is True
    assert perm.acceso_caja_menor({"es_desarrollador": True}, 3)["eliminar"] is True


def test_ocr_extrae_impuestos_sin_red():
    analisis = {
        "content": "NIT 900555666-7\nRetención en la fuente 2.500\nImpoconsumo 1.000",
        "documents": [{
            "fields": {
                "VendorName": {"valueString": "Ferretería El Punto"},
                "InvoiceDate": {"valueDate": "2026-11-01"},
                "InvoiceId": {"valueString": "RC-44"},
                "SubTotal": {"valueCurrency": {"amount": 100000}},
                "TotalTax": {"valueCurrency": {"amount": 19000}},
                "InvoiceTotal": {"valueCurrency": {"amount": 117500}},
                "Items": {"valueArray": [{"valueObject": {"Description": {"valueString": "Tornillos"}}}]},
            },
        }],
    }
    out = ocr.mapear_analisis(analisis)
    sug = out["sugerencias"]
    assert sug["tercero_razon_social"] == "Ferretería El Punto"
    assert "900555666" in calc.normalizar_documento(sug["tercero_documento"])
    assert sug["valor_bruto"] == 100000
    assert sug["iva"] == 19000
    assert sug["retenciones"] == 2500
    assert sug["impuesto_consumo"] == 1000
    assert sug["descripcion"] == "Tornillos"
    assert "fecha" in out["campos_detectados"]
    vacio = ocr.analyze_recibo_bytes(b"")
    assert vacio["ok"] is False
    partido = ocr.mapear_analisis({
        "content": "FERRETERÍA INDUSTRIAL-\nIZADA\nNIT 900555666-7",
        "documents": [{
            "fields": {
                "VendorName": {
                    "valueString": "FERRETERÍAINDUSTRIAL-IZADA",
                    "content": "FERRETERÍA INDUSTRIAL-\nIZADA",
                },
                "Items": {"valueArray": [
                    {"valueObject": {"Description": {"valueString": "Tornillos - · "}}},
                    {"valueObject": {"Description": {"valueString": " - · Tuercas"}}},
                ]},
            },
        }],
    })
    assert partido["sugerencias"]["tercero_razon_social"] == "FERRETERÍA INDUSTRIALIZADA"
    assert partido["sugerencias"]["descripcion"] == "Tornillos; Tuercas"
    assert "locale=es-ES" in ocr.url_analisis()
    cuerpo = ocr.cuerpo_analisis(b"factura")
    assert cuerpo["base64Source"]


def test_flujo_caja_traslado_rechazo_y_80():
    sb = _semilla()
    mem = Memoria()
    avisos = []

    def mailer(dest, *, responsable, disponible, enlace, numero):
        avisos.append({
            "dest": list(dest),
            "responsable": responsable,
            "disponible": disponible,
            "enlace": enlace,
            "numero": numero,
        })
        return {"enviados": 1, "motivo": None}

    det = svc.crear_caja(sb, DEV, 1, 3)
    caja_id = det["caja"]["id"]
    assert det["caja"]["numero"] == 1
    assert det["caja"]["estado"] == "abierta"
    try:
        svc.crear_caja(sb, DEV, 1, 3)
        raise AssertionError("debía impedir una segunda caja abierta")
    except ValueError as exc:
        assert "abierta" in str(exc).lower()

    img = (_png(), "image/jpeg", "consig.jpg")
    svc.crear_ingreso(sb, DEV, 1, caja_id, calc.hoy_colombia().isoformat(), 200000, img, storage=mem, mailer=mailer)
    try:
        svc.crear_gasto(
            sb, DEV, 1, caja_id,
            _gasto(fecha="2099-01-01", iva=0),
            (_png(), "image/png", "r.png"),
            storage=mem,
        )
        raise AssertionError("fecha futura")
    except ValueError as exc:
        assert "futura" in str(exc).lower()

    det = svc.crear_gasto(
        sb, DEV, 1, caja_id, _gasto(documento_no="RC-1", iva=0),
        (_png(), "image/png", "r.png"), storage=mem, mailer=mailer,
    )
    assert det["indicadores"]["fondo_establecido"] == 200000
    assert det["indicadores"]["gastos_periodo"] == 100000
    assert det["indicadores"]["disponible"] == 100000
    assert det["indicadores"]["gasto_actual"] == 50
    assert det["gastos"][0]["consecutivo"] == 1
    assert det["gastos"][0]["centro_costos"] == "IDU-1551"
    assert det["gastos"][0]["documento_no"] == "RC-1"
    assert avisos == []

    det = svc.crear_gasto(
        sb, DEV, 1, caja_id,
        _gasto(documento_no="RC-2", valor_bruto=80000, iva=0, descripcion="Cable"),
        (_png(), "image/png", "r2.png"), storage=mem, mailer=mailer,
    )
    assert len(avisos) == 1
    assert avisos[0]["dest"] == ["marta@obra.co"]
    assert "luis" in avisos[0]["responsable"].lower()
    assert "caja=" in avisos[0]["enlace"]
    assert det["caja"]["alerta_80_enviada"] is True

    try:
        svc.crear_gasto(
            sb, DEV, 1, caja_id,
            _gasto(documento_no="RC-1", descripcion="Otra"),
            (_png(), "image/png", "r3.png"), storage=mem, mailer=mailer,
        )
        raise AssertionError("duplicado")
    except DuplicadoCajaMenor as exc:
        assert "Puede continuar" in str(exc)

    det = svc.crear_gasto(
        sb, DEV, 1, caja_id,
        _gasto(documento_no="RC-1", descripcion="Otra", valor_bruto=1000, iva=0),
        (_png(), "image/png", "r3.png"),
        storage=mem, mailer=mailer, confirmar_duplicado=True,
    )
    assert len(avisos) == 1

    # Otra caja de otro contrato con el mismo NIT no se ve.
    otra = svc.crear_caja(sb, DEV, 2, 6)
    svc.crear_gasto(
        sb, DEV, 2, otra["caja"]["id"],
        _gasto(documento_no="RC-9"),
        (_png(), "image/png", "x.png"), storage=mem, mailer=mailer,
    )
    lista = svc.listar_cajas(sb, DEV, 1)
    assert {c["id"] for c in lista["cajas"]} == {caja_id}
    assert "contabilidad" not in str(lista).lower()

    det = svc.solicitar_cierre(sb, DEV, 1, caja_id)
    assert det["caja"]["estado"] == "en_legalizacion"
    try:
        svc.crear_gasto(
            sb, DEV, 1, caja_id, _gasto(documento_no="RC-8", valor_bruto=1000, iva=0),
            (_png(), "image/png", "z.png"), storage=mem,
        )
        raise AssertionError("no debe cargar en legalización")
    except ValueError:
        pass

    gastos = det["gastos"]
    svc.validar_gasto(sb, DEV, 1, caja_id, gastos[0]["id"], "rechazado", "Sin soporte legible")
    svc.validar_gasto(sb, DEV, 1, caja_id, gastos[1]["id"], "aprobado", "")
    det = svc.validar_gasto(sb, DEV, 1, caja_id, gastos[2]["id"], "aprobado", "")
    assert det["caja"]["estado"] == "legalizada"
    # El rechazo devuelve su valor: 200000 - 80000 - 1000 = 119000
    assert det["indicadores"]["gastos_periodo"] == 81000
    assert det["indicadores"]["disponible"] == 119000

    nueva = svc.crear_caja(sb, DEV, 1, 3)
    assert nueva["caja"]["numero"] == 2
    assert nueva["indicadores"]["saldo_trasladado"] == 119000
    assert nueva["indicadores"]["fondo_establecido"] == 119000


def test_pasivo_queda_pendiente_si_no_hay_caja_nueva():
    sb = _semilla()
    mem = Memoria()
    det = svc.crear_caja(sb, DEV, 1, 3)
    cid = det["caja"]["id"]
    svc.crear_ingreso(
        sb, DEV, 1, cid, calc.hoy_colombia().isoformat(), 50000,
        (_png(), "image/jpeg", "c.jpg"), storage=mem,
    )
    det = svc.crear_gasto(
        sb, DEV, 1, cid,
        _gasto(documento_no="A-1", valor_bruto=80000, iva=0),
        (_png(), "image/png", "g.png"), storage=mem,
    )
    det = svc.solicitar_cierre(sb, DEV, 1, cid)
    det = svc.validar_gasto(sb, DEV, 1, cid, det["gastos"][0]["id"], "aprobado", "")
    assert det["caja"]["estado"] == "legalizada"
    assert det["indicadores"]["disponible"] == -30000
    pendientes = sb.tables["caja_menor_saldo_pendiente"]
    assert len(pendientes) == 1
    assert int(pendientes[0]["saldo"]) == -30000
    assert not pendientes[0].get("aplicado_en_caja_id")
    nueva = svc.crear_caja(sb, DEV, 1, 3)
    assert nueva["indicadores"]["saldo_trasladado"] == -30000


def test_impuestos_vacios_se_guardan_en_cero():
    sb = _semilla()
    mem = Memoria()
    det = svc.crear_caja(sb, DEV, 1, 3)
    det = svc.crear_gasto(
        sb, DEV, 1, det["caja"]["id"],
        _gasto(
            iva="",
            retenciones="",
            impuesto_consumo=None,
            otros_deducibles="",
            observaciones="Compra de obra",
        ),
        (_png(), "image/png", "r.png"),
        storage=mem,
    )
    gasto = det["gastos"][0]
    assert gasto["iva"] == 0
    assert gasto["retenciones"] == 0
    assert gasto["impuesto_consumo"] == 0
    assert gasto["otros_deducibles"] == 0
    assert gasto["valor_neto"] == 100000
    assert gasto["observaciones"] == "Compra de obra"


def test_excel_y_pdf_icontec():
    caja = {
        "numero": 4,
        "responsable_nombre": "Luis Pérez",
        "estado": "legalizada",
        "periodo_desde": "2026-11-01",
        "periodo_hasta": "2026-11-17",
        "saldo_trasladado": 10000,
        "observaciones": "Periodo de obra",
        "control": "OK",
        "firma_elaboro": "Luis Pérez",
        "firma_reviso": "Marta",
        "firma_aprobo": "Director",
    }
    contrato = {"contratista": "Obra SAS", "nit": "900111222-1", "numero": "IDU-1551"}
    gastos = [{
        "id": 9,
        "consecutivo": 1,
        "fecha": "2026-11-02",
        "tercero_razon_social": "Ferretería",
        "tercero_documento": "900555666-7",
        "descripcion": "Tornillos",
        "documento_no": "RC-1",
        "centro_costos": "IDU-1551",
        "valor_bruto": 100000,
        "iva": 19000,
        "retenciones": 0,
        "impuesto_consumo": 0,
        "otros_deducibles": 0,
        "valor_neto": 119000,
        "estado_validacion": "aprobado",
    }]
    logo = _png(ancho=80, alto=80, color=(14, 116, 144))
    data = build_excel(
        caja=caja, contrato=contrato, ingresos=[{"valor": 200000}],
        gastos=gastos, enlace_por_gasto={9: "https://app.claracore.co/?modulo=caja_menor&caja=4&gasto=9"},
        logo=logo,
    )
    wb = load_workbook(io.BytesIO(data))
    ws = wb.active
    assert ws.cell(1, 2).value == "CONTROL DE GASTOS POR CAJA MENOR"
    fila1 = " ".join(str(ws.cell(1, c).value or "") for c in range(1, 20))
    assert "CC-CM-001" in fila1
    assert "Versión 1.0" in fila1
    assert ws.cell(9, 3).value == "Razón Social"
    assert ws.cell(3, 2).value == "Obra SAS"
    assert ws.cell(5, 1).value == "Saldo trasladado"
    soporte = next(c for c in range(1, 20) if ws.cell(9, c).value == "Soporte")
    neto = next(c for c in range(1, 20) if ws.cell(9, c).value == "Valor neto")
    assert ws.cell(10, soporte).hyperlink.target.startswith("https://")
    assert ws.cell(11, neto).value == 119000
    assert ws["A13"].value == "Elaboró"
    assert ws.sheet_view.showGridLines is False
    assert any(ws._images)

    alto = _png(ancho=200, alto=2400)
    corto = _png(ancho=200, alto=80, color=(200, 120, 20))
    gastos_pdf = [
        {**gastos[0], "imagen": alto},
        {
            "consecutivo": 2,
            "fecha": "2026-11-03",
            "tercero_razon_social": "Papelería",
            "documento_no": "RC-2",
            "valor_neto": 50000,
            "estado_validacion": "aprobado",
            "imagen": corto,
        },
    ]
    pdf = build_pdf(
        caja=caja, contrato=contrato, ingresos=[{"valor": 200000}],
        gastos=gastos_pdf, logo=logo,
    )
    doc = fitz.open(stream=pdf, filetype="pdf")
    assert doc.page_count == 2
    texto0 = doc[0].get_text()
    assert "CONTROL DE GASTOS POR CAJA MENOR" in texto0
    assert "CC-CM-001" in texto0
    assert "Legalización de Caja Menor No." in texto0
    assert "Razón" in texto0 and "Social" in texto0
    assert "Elaboró" in texto0
    assert "Página 1 de 2" in texto0
    assert "Página 2 de 2" in doc[1].get_text()
    assert "Ferretería" in doc[1].get_text()
    assert "Papelería" in doc[1].get_text()
    # El logo va en cada página. Los dos recibos caben juntos y no se parten.
    assert len(doc[0].get_images()) == 1
    assert len(doc[1].get_images()) == 3
    assert FORMATO_CALIDAD["codigo"] == "CC-CM-001"


def test_not_found_pide_permisos_del_api():
    from pathlib import Path

    from caja_menor_service import mensaje_falla_datos

    class Falla(Exception):
        def __init__(self):
            super().__init__("Error 404:\nMessage: Not Found")
            self.message = "Not Found"
            self.code = "404"

    texto = mensaje_falla_datos(Falla())
    assert "caja_menor_grants.sql" in texto

    class FaltaColumna(Exception):
        def __init__(self):
            super().__init__("Could not find the 'observaciones' column of 'caja_menor_gasto' in the schema cache")
            self.message = "Could not find the 'observaciones' column of 'caja_menor_gasto' in the schema cache"
            self.code = "PGRST204"

    assert "20261118161000_caja_menor_gasto_observaciones.sql" in mensaje_falla_datos(FaltaColumna())
    raiz = Path(__file__).resolve().parents[1]
    for nombre in (
        "sql/caja_menor_grants.sql",
        "sql/caja_menor_modulo.sql",
        "migrations/20261117180000_caja_menor.sql",
        "migrations/20261117223000_caja_menor_grants.sql",
    ):
        sql = (raiz / nombre).read_text(encoding="utf-8")
        assert "GRANT SELECT, INSERT, UPDATE, DELETE" in sql
        assert "service_role" in sql
        assert "NOTIFY pgrst, 'reload schema'" in sql


def test_auditoria_etiqueta_caja_menor():
    from auditoria_datos import modulo_de_tabla

    assert modulo_de_tabla("caja_menor_gasto") == "Caja Menor"
    assert modulo_de_tabla("caja_menor_ingreso") == "Caja Menor"
    assert modulo_de_tabla("contabilidad_transaccion") == "Contabilidad"


def test_modulos_no_importan_contabilidad():
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[1]
    for nombre in (
        "caja_menor_calc.py",
        "caja_menor_service.py",
        "caja_menor_routes.py",
        "caja_menor_ocr.py",
        "caja_menor_export.py",
        "caja_menor_permissions.py",
        "caja_menor_email.py",
    ):
        texto = (raiz / nombre).read_text(encoding="utf-8")
        assert "import contabilidad" not in texto
        assert "from contabilidad" not in texto
