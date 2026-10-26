"""PDF de la OC: una línea por insumo y regeneración que archiva la versión anterior."""
import io
from pathlib import Path

import almacen_oc_pdf_version as ver
import almacen_orden_compra_pdf as pdf
import almacen_permissions as perm
import almacen_service as svc


def _dos_tramos():
    items = [
        {
            "solicitud_item_id": 1,
            "cantidad": 2,
            "valor_unitario": 119,
            "unidad": "m",
            "material_descripcion": "Tubería",
        },
        {
            "solicitud_item_id": 2,
            "cantidad": 3,
            "valor_unitario": 119,
            "unidad": "m",
            "material_descripcion": "Tubería",
        },
    ]
    sol = {
        1: {
            "id": 1, "insumo_id": 9, "insumo_codigo": "CC-1614-001",
            "pk_id": "PK-10", "tramo": "Norte", "abscisa_inicial": "0+100",
        },
        2: {
            "id": 2, "insumo_id": 9, "insumo_codigo": "CC-1614-001",
            "pk_id": "PK-20", "tramo": "Sur", "abscisa_inicial": "0+200",
        },
    }
    insumos = {9: {"codigo": "CC-1614-001", "tipo_impuesto": "iva", "impuesto_porcentaje": 19}}
    return items, sol, insumos


def test_dos_tramos_del_mismo_insumo_son_una_linea_y_el_total_cuadra():
    items, sol, insumos = _dos_tramos()
    rows, tot = pdf._lineas_y_totales(items, sol, insumos)
    assert rows.count("CC-1614-001") == 1
    assert "PK-10" not in rows and "PK-20" not in rows
    assert "Norte" not in rows and "Sur" not in rows
    assert "0+100" not in rows and "0+200" not in rows
    assert abs(tot["subtotal"] - 500) < 0.01
    assert abs(tot["total"] - 595) < 0.01
    assert abs(sum(g["total_con_iva"] for g in tot["grupos"]) - 595) < 0.01
    cuadre = pdf.cuadrar_presentacion_oc(items, sol, insumos)
    assert cuadre["ok"] is True
    assert cuadre["motivo"] == ""


def test_argos_usa_costo_base_y_discrimina_iva_pleno():
    """Valor catálogo 25.480; con IVA 19% → total 165.007.970 (no 30.321 como base)."""
    vu_con_iva = 25480 * 1.19  # 30321.2
    items = [{
        "solicitud_item_id": 1,
        "cantidad": 5442,
        "valor_unitario": vu_con_iva,
        "unidad": "BULTO",
        "material_descripcion": "CC-1614-080 — CC-1614-080 — Cemento",
    }]
    sol = {1: {"id": 1, "insumo_id": 80, "insumo_codigo": "CC-1614-080"}}
    insumos = {
        80: {
            "codigo": "CC-1614-080",
            "costo_base": 25480,
            "tributos": {"iva": {"porcentaje": 19}},
            "tipo_impuesto": "iva",
            "impuesto_porcentaje": 19,
        },
    }
    rows, tot = pdf._lineas_y_totales(items, sol, insumos)
    assert rows.count("CC-1614-080") == 1
    assert "CC-1614-080 — CC-1614-080" not in rows
    assert abs(tot["subtotal"] - 138_662_160) < 0.01
    assert abs(tot["total"] - 165_007_970.4) < 0.01 or abs(tot["total"] - 165_007_970) < 0.5
    assert "IVA 19%" in tot["rows_html"]
    assert abs(tot["total"] - tot["subtotal"] - 26_345_810.4) < 0.01 or abs(
        tot["total"] - tot["subtotal"] - 26_345_810
    ) < 0.5
    assert pdf.cuadrar_presentacion_oc(items, sol, insumos)["ok"] is True
    vu_base = tot["grupos"][0]["valor_unitario_base"]
    assert abs(vu_base - 25480) < 0.01


def test_descripcion_no_repite_codigo():
    assert pdf._descripcion_con_codigo("CC-1", "CC-1 — CC-1 — Arena") == "CC-1 — Arena"
    assert pdf._descripcion_con_codigo("CC-1", "Arena") == "CC-1 — Arena"
    assert pdf._descripcion_con_codigo("CC-1", "CC-1") == "CC-1"


def test_pdf_etiqueta_vigencia_cotizacion():
    html = pdf.generar_pdf_orden_compra(
        contrato={"numero": "CT-1", "contratista": "Vías"},
        orden_compra={"numero_oc": 1, "items": []},
        solicitud={"consecutivo": 1, "items": []},
        terminos="15 días",
        solo_html=True,
    )
    assert "Vigencia de la cotización" in html
    assert "15 días" in html
    assert "Términos y condiciones" not in html


def test_aiu_sin_iva_y_sin_impuesto():
    items_aiu = [{
        "solicitud_item_id": 1, "cantidad": 10, "valor_unitario": 113,
        "unidad": "m", "material_descripcion": "Obra",
    }]
    sol = {1: {"id": 1, "insumo_id": 1, "insumo_codigo": "CC-A"}}
    # AIU 5+3+5 = 13% sobre base 100 → 113
    insumos_aiu = {
        1: {
            "codigo": "CC-A",
            "costo_base": 100,
            "tributos": {"administracion": 5, "imprevistos": 3, "utilidad": 5},
        },
    }
    _rows, tot = pdf._lineas_y_totales(items_aiu, sol, insumos_aiu)
    assert abs(tot["subtotal"] - 1000) < 0.01
    assert abs(tot["total"] - 1130) < 0.01
    assert "AIU" in tot["rows_html"]

    items_sin = [{
        "solicitud_item_id": 2, "cantidad": 2, "valor_unitario": 50,
        "unidad": "u", "material_descripcion": "Nada",
    }]
    sol2 = {2: {"id": 2, "insumo_id": 2, "insumo_codigo": "CC-B"}}
    insumos_sin = {2: {"codigo": "CC-B", "costo_base": 50}}
    _r2, tot2 = pdf._lineas_y_totales(items_sin, sol2, insumos_sin)
    assert abs(tot2["subtotal"] - 100) < 0.01
    assert abs(tot2["total"] - 100) < 0.01
    assert "IVA 19%" not in tot2["rows_html"]
    assert "AIU" not in tot2["rows_html"]
    assert tot2["subtotal"] == tot2["total"]


def test_precios_distintos_siguen_siendo_una_linea_y_suman_el_total():
    items = [
        {"solicitud_item_id": 1, "cantidad": 1, "valor_unitario": 119, "unidad": "m", "material_descripcion": "Tubería"},
        {"solicitud_item_id": 2, "cantidad": 1, "valor_unitario": 238, "unidad": "m", "material_descripcion": "Tubería"},
    ]
    sol = {
        1: {"id": 1, "insumo_id": 9, "insumo_codigo": "CC-9"},
        2: {"id": 2, "insumo_id": 9, "insumo_codigo": "CC-9"},
    }
    insumos = {9: {"codigo": "CC-9", "tipo_impuesto": "iva", "impuesto_porcentaje": 19}}
    rows, tot = pdf._lineas_y_totales(items, sol, insumos)
    assert rows.count("CC-9") == 1
    assert abs(tot["subtotal"] - 300) < 0.01
    assert abs(tot["total"] - 357) < 0.01
    assert pdf.cuadrar_presentacion_oc(items, sol, insumos)["ok"] is True


def test_el_documento_no_imprime_ubicacion_y_conserva_firmas():
    items, sol, insumos = _dos_tramos()
    html = pdf.generar_pdf_orden_compra(
        contrato={"numero": "CT-1", "contratista": "Vías", "objeto": "Obra norte"},
        orden_compra={
            "numero_oc": 12,
            "proveedor_nombre": "Acme",
            "items": items,
        },
        solicitud={
            "consecutivo": 4,
            "items": list(sol.values()),
            "observaciones": "Entregar según programa",
        },
        proveedores=[{"razon_social": "Acme"}],
        insumo_map=insumos,
        puntos_entrega=["PK-10 · Norte"],
        solo_html=True,
    )
    assert "Punto de entrega" not in html
    assert "Puntos:" not in html
    assert "PK-10" not in html and "PK-20" not in html
    assert "0+100" not in html
    assert html.count("CC-1614-001") == 1
    assert "Solicitó requisición" in html
    assert "Aprobó y generó OC" in html
    assert "Subtotal (antes de IVA)" in html
    assert "Total (IVA incluido)" in html
    assert "Obra norte" in html


def test_el_motivo_de_cuadre_no_lleva_cifras():
    total = pdf.evaluar_cuadre_numeros(10.5, 11, {("id", 1): 2}, {("id", 1): 2})
    cant = pdf.evaluar_cuadre_numeros(10, 10, {("id", 1): 2}, {("id", 1): 5})
    for resultado in (total, cant):
        assert resultado["ok"] is False
        assert "$" not in resultado["motivo"]
        assert not any(ch.isdigit() for ch in resultado["motivo"])
        assert "No se reemplazó nada." in resultado["motivo"]
    assert "total" in total["motivo"]
    assert "cantidad" in cant["motivo"]


def test_quien_puede_regenerar_no_es_quien_genera_la_oc():
    admin = {"cargo_nombre": "Administrador", "rol_nombre": "Operativo Contratista"}
    gerencial = {"rol_nombre": "Contratista Gerencial", "cargo_nombre": "Residente"}
    dev = {"rol_nombre": "Desarrollador", "cargo_nombre": "Auxiliar"}
    otro = {"rol_nombre": "Operativo Contratista", "cargo_nombre": "Almacenista"}
    bloqueado = {"rol_nombre": "Interventoría", "cargo_nombre": "Administrador"}
    assert perm.puede_regenerar_pdf_oc(admin) is True
    assert perm.puede_regenerar_pdf_oc(gerencial) is True
    assert perm.puede_regenerar_pdf_oc(dev) is True
    assert perm.puede_regenerar_pdf_oc(otro) is False
    assert perm.puede_regenerar_pdf_oc(bloqueado) is False
    assert perm.puede_generar_orden_compra_almacen(admin) is False
    assert perm.puede_generar_orden_compra_almacen(bloqueado) is False


def test_la_descarga_conjunta_reutiliza_el_pdf_guardado():
    src = Path(svc.__file__).read_text(encoding="utf-8")
    fn = src.split("def download_pdf_conjunto_solicitud", 1)[1].split("\ndef ", 1)[0]
    assert "pdf_blob_path" in fn
    assert fn.index("pdf_blob_path") < fn.index("generar_y_guardar_pdf_oc")
    correo = Path(svc.__file__).with_name("almacen_oc_email.py")
    envio = correo.read_text(encoding="utf-8").split("def enviar_oc_por_correo", 1)[1].split("\ndef ", 1)[0]
    assert "if not pdf_bytes and oc.get(\"pdf_blob_path\")" in envio
    assert envio.index("if not pdf_bytes and oc.get") < envio.index("saved = generar_y_guardar_pdf_oc")


def test_unir_pdfs_conserva_cada_hoja():
    from pypdf import PdfReader, PdfWriter

    def hoja():
        w = PdfWriter()
        w.add_blank_page(width=72, height=72)
        buf = io.BytesIO()
        w.write(buf)
        return buf.getvalue()

    data = svc._unir_pdfs([hoja(), hoja()])
    assert len(PdfReader(io.BytesIO(data)).pages) == 2


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store, name):
        self.store = store
        self.name = name
        self.op = None
        self.payload = None
        self.filters = []

    def select(self, *_a, **_k):
        self.op = "select"
        return self

    def insert(self, row):
        self.op = "insert"
        self.payload = dict(row)
        return self

    def update(self, row):
        self.op = "update"
        self.payload = dict(row)
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        filtros = dict(self.filters)
        if self.name == "almacen_orden_compra_pdf":
            filas = self.store["versiones"]
            if self.op == "select":
                data = [r for r in filas if r.get("orden_compra_id") == filtros.get("orden_compra_id")]
                return _Result(sorted(data, key=lambda r: r["version"]))
            if self.op == "insert":
                row = dict(self.payload)
                row.setdefault("id", len(filas) + 1)
                filas.append(row)
                return _Result([row])
            if self.op == "update":
                for row in filas:
                    if row.get("orden_compra_id") != filtros.get("orden_compra_id"):
                        continue
                    if "vigente" in filtros and bool(row.get("vigente")) != bool(filtros["vigente"]):
                        continue
                    row.update(self.payload)
                return _Result([])
            if self.op == "delete":
                self.store["versiones"] = [
                    r for r in filas
                    if not (
                        r.get("orden_compra_id") == filtros.get("orden_compra_id")
                        and r.get("version") == filtros.get("version")
                    )
                ]
                return _Result([])
        if self.name == "almacen_orden_compra" and self.op == "update":
            self.store["oc_updates"].append(dict(self.payload))
            return _Result([])
        return _Result([])


class _Sb:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _Query(self.store, name)


def _oc_base():
    items, sol, insumos = _dos_tramos()
    return {
        "id": 5,
        "numero_oc": 12,
        "solicitud_id": 3,
        "proveedor_id": 8,
        "proveedor_nombre": "Acme",
        "documento_sistema": False,
        "envio_estado": "enviado",
        "envio_correo": "compras@acme.co",
        "pdf_blob_path": "almacen-soportes/1/oc-pdf/5/OC-12.pdf",
        "pdf_nombre": "OC-12.pdf",
        "items": items,
        "envios": [{"resultado": "enviado", "destinatario": "compras@acme.co"}],
        "_sol": sol,
        "_insumos": insumos,
    }


def test_regenerar_archiva_el_pdf_anterior_sin_tocar_datos(monkeypatch):
    oc = _oc_base()
    store = {"versiones": [], "oc_updates": [], "uploads": [], "logs": []}
    monkeypatch.setattr(svc, "get_orden_compra", lambda *_a, **_k: oc)
    monkeypatch.setattr(svc, "get_solicitud", lambda *_a, **_k: {"id": 3, "items": list(oc["_sol"].values())})
    monkeypatch.setattr(svc, "_armar_pdf_oc", lambda *_a, **_k: {
        "pdf_bytes": b"%PDF-nuevo",
        "html": "<html>CC-1614-001</html>",
        "nombre": "OC-12.pdf",
        "insumo_map": oc["_insumos"],
        "sol_items": oc["_sol"],
    })
    monkeypatch.setattr(svc, "_sb", lambda: _Sb(store))

    def _upload(path, data, mime, overwrite=False, **_k):
        store["uploads"].append({"path": path, "overwrite": overwrite, "data": data})

    monkeypatch.setattr(svc, "upload_blob_private", _upload)
    monkeypatch.setattr(svc, "delete_blob_private", lambda path: store.setdefault("deleted", []).append(path))

    def _log(_user, accion, _id, detalle=None):
        store["logs"].append({"accion": accion, "detalle": detalle or {}})

    monkeypatch.setattr(ver, "_registrar", _log)

    out = ver._regenerar_una(1, 5, {"sub": 7, "nombre": "Ana"})
    assert out["ok"] is True
    assert out["version_anterior"] == 1
    assert out["version_vigente"] == 2
    assert out["ya_enviada"] is True
    assert out["destinatarios"] == ["compras@acme.co"]
    assert out["proveedor_desactualizado"] is True
    assert "$" not in str(out)
    assert store["uploads"][0]["overwrite"] is False
    assert "/v2/" in store["uploads"][0]["path"]
    assert store["uploads"][0]["path"] != oc["pdf_blob_path"]
    assert oc["pdf_blob_path"] not in [u["path"] for u in store["uploads"]]
    vigentes = [r for r in store["versiones"] if r["vigente"]]
    anteriores = [r for r in store["versiones"] if not r["vigente"]]
    assert len(vigentes) == 1 and vigentes[0]["version"] == 2
    assert anteriores[0]["blob_path"] == oc["pdf_blob_path"]
    campos = store["oc_updates"][0]
    assert set(campos) == {
        "pdf_blob_path", "pdf_nombre", "pdf_version", "pdf_proveedor_desactualizado",
    }
    assert campos["pdf_proveedor_desactualizado"] is True
    detalle = store["logs"][0]["detalle"]
    assert store["logs"][0]["accion"] == "REGENERAR_PDF_OC"
    assert detalle["version_reemplazada"] == 1
    assert detalle["version_vigente"] == 2
    assert detalle["reenviado"] is False
    assert "valor" not in detalle
    assert "$" not in str(detalle)


def test_si_no_cuadra_no_reemplaza_el_pdf(monkeypatch):
    oc = _oc_base()
    store = {"versiones": [], "oc_updates": [], "uploads": []}
    monkeypatch.setattr(svc, "get_orden_compra", lambda *_a, **_k: oc)
    monkeypatch.setattr(svc, "get_solicitud", lambda *_a, **_k: {})
    monkeypatch.setattr(svc, "_armar_pdf_oc", lambda *_a, **_k: {
        "pdf_bytes": b"%PDF",
        "nombre": "OC-12.pdf",
        "insumo_map": {},
        "sol_items": {},
    })
    monkeypatch.setattr(pdf, "cuadrar_presentacion_oc", lambda *_a, **_k: {
        "ok": False,
        "motivo": pdf.MOTIVO_TOTAL_NO_CUADRA,
    })
    monkeypatch.setattr(svc, "_sb", lambda: _Sb(store))
    monkeypatch.setattr(svc, "upload_blob_private", lambda *_a, **_k: store["uploads"].append("no"))
    out = ver._regenerar_una(1, 5, {"sub": 1})
    assert out["ok"] is False
    assert "No se reemplazó nada." in out["motivo"]
    assert not any(ch.isdigit() for ch in out["motivo"])
    assert store["uploads"] == []
    assert store["versiones"] == []
    assert store["oc_updates"] == []


def test_documento_de_sistema_se_regenera_y_no_queda_para_reenviar(monkeypatch):
    oc = _oc_base()
    oc["documento_sistema"] = True
    store = {"versiones": [], "oc_updates": [], "uploads": [], "logs": []}
    monkeypatch.setattr(svc, "get_orden_compra", lambda *_a, **_k: oc)
    monkeypatch.setattr(svc, "get_solicitud", lambda *_a, **_k: {})
    monkeypatch.setattr(svc, "_armar_pdf_oc", lambda *_a, **_k: {
        "pdf_bytes": b"%PDF",
        "nombre": "OC-12.pdf",
        "insumo_map": oc["_insumos"],
        "sol_items": oc["_sol"],
    })
    monkeypatch.setattr(svc, "_sb", lambda: _Sb(store))
    monkeypatch.setattr(svc, "upload_blob_private", lambda path, data, mime, overwrite=False, **_k: store["uploads"].append(path))
    monkeypatch.setattr(ver, "_registrar", lambda *_a, **_k: None)
    out = ver._regenerar_una(1, 5, {"sub": 1})
    assert out["ok"] is True
    assert out["ya_enviada"] is False
    assert out["documento_sistema"] is True
    assert out["proveedor_desactualizado"] is False
    assert store["oc_updates"][0]["pdf_proveedor_desactualizado"] is False


def test_no_reenviar_deja_marcado_que_el_proveedor_tiene_la_anterior(monkeypatch):
    oc = _oc_base()
    oc["pdf_version"] = 2
    store = {"versiones": [], "oc_updates": [], "logs": []}
    monkeypatch.setattr(svc, "get_orden_compra", lambda *_a, **_k: oc)
    monkeypatch.setattr(svc, "_sb", lambda: _Sb(store))
    def _log(_user, accion, _id, detalle=None):
        store["logs"].append({"accion": accion, "detalle": detalle or {}})

    monkeypatch.setattr(ver, "_registrar", _log)
    out = ver.resolver_reenvio_pdf(1, 5, {"sub": 4}, reenviar=False)
    assert out["reenviado"] is False
    assert out["proveedor_desactualizado"] is True
    assert "versión anterior" in out["detalle"]
    assert "$" not in out["detalle"]
    assert store["oc_updates"][0]["pdf_proveedor_desactualizado"] is True
    assert store["logs"][0]["detalle"]["reenviado"] is False
    assert store["logs"][0]["detalle"]["resultado"] == "omitido"


def test_reenviar_usa_el_pdf_ya_guardado(monkeypatch):
    oc = _oc_base()
    oc["pdf_version"] = 2
    oc["pdf_blob_path"] = "almacen-soportes/1/oc-pdf/5/v2/OC-12.pdf"
    store = {"versiones": [{"orden_compra_id": 5, "version": 2, "vigente": True, "reenviado": False}], "oc_updates": [], "logs": [], "mail": []}
    monkeypatch.setattr(svc, "get_orden_compra", lambda *_a, **_k: oc)
    monkeypatch.setattr(svc, "_sb", lambda: _Sb(store))
    monkeypatch.setattr(svc, "download_soporte", lambda _path: (b"%PDF-vigente", "application/pdf"))

    def _mail(*_a, **k):
        store["mail"].append(k)
        return {"resultado": "enviado", "detalle": "PDF enviado.", "destinatarios": ["compras@acme.co"]}

    import almacen_oc_email
    monkeypatch.setattr(almacen_oc_email, "enviar_oc_por_correo", _mail)
    monkeypatch.setattr(ver, "_registrar", lambda _user, _accion, _id, detalle=None: store["logs"].append(detalle or {}))
    out = ver.resolver_reenvio_pdf(1, 5, {"sub": 4}, reenviar=True)
    assert out["reenviado"] is True
    assert out["proveedor_desactualizado"] is False
    assert store["mail"][0]["pdf_bytes"] == b"%PDF-vigente"
    assert store["oc_updates"][0]["pdf_proveedor_desactualizado"] is False
    assert store["versiones"][0]["reenviado"] is True
    assert store["logs"][0]["reenviado"] is True
    assert store["logs"][0]["destinatario"] == "compras@acme.co"


def test_varias_oc_de_la_solicitud_y_una_ajena_no_se_toca(monkeypatch):
    tocadas = []

    def _una(_contrato, oc_id, _user):
        tocadas.append(oc_id)
        return {"orden_compra_id": oc_id, "ok": True, "numero_oc": oc_id, "ya_enviada": False, "documento_sistema": False, "destinatarios": []}

    monkeypatch.setattr(ver, "_regenerar_una", _una)
    monkeypatch.setattr(svc, "_fetch_ocs_de_solicitud", lambda *_a, **_k: [{"id": 5}, {"id": 6}])
    monkeypatch.setattr(svc, "_sb", lambda: object())
    out = ver.regenerar_pdfs_solicitud(1, 9, [5, 6, 5, 99], {"sub": 1})
    assert tocadas == [5, 6]
    assert [r["orden_compra_id"] for r in out["resultados"]] == [5, 6, 99]
    assert out["resultados"][-1]["ok"] is False
    assert out["resultados"][-1]["numero_oc"] is None
    assert "No se reemplazó nada." in out["resultados"][-1]["motivo"]
    assert "99" not in out["resultados"][-1]["motivo"]


def test_fallo_de_versiones_conserva_el_numero_visible(monkeypatch):
    def _una(*_a, **_k):
        raise ValueError(
            "Falta en la base la tabla donde se guardan las versiones del PDF, "
            "o la base todavía no la tiene visible. No se reemplazó nada."
        )

    monkeypatch.setattr(ver, "_regenerar_una", _una)
    monkeypatch.setattr(
        svc, "_fetch_ocs_de_solicitud",
        lambda *_a, **_k: [{"id": 17, "numero_oc": 2, "proveedor_nombre": "SERVIPERFILES CYS"}],
    )
    monkeypatch.setattr(svc, "_sb", lambda: object())
    out = ver.regenerar_pdfs_solicitud(1, 19, [17], {"sub": 1})
    fila = out["resultados"][0]
    assert fila["orden_compra_id"] == 17
    assert fila["numero_oc"] == 2
    assert fila["ok"] is False
    assert "17" not in fila["motivo"]
    assert "No se reemplazó nada" in fila["motivo"]


def test_motivo_si_falta_la_tabla_o_el_permiso():
    class _Roto:
        def __init__(self, mensaje):
            self.mensaje = mensaje

        def table(self, _name):
            raise Exception(self.mensaje)

    try:
        ver._leer_versiones(
            _Roto("Could not find the table 'public.almacen_orden_compra_pdf' in the schema cache (PGRST205)"),
            17,
            obligatorio=True,
        )
        raise AssertionError("debía fallar")
    except ValueError as exc:
        texto = str(exc)
    assert "17" not in texto
    assert "PGRST" not in texto
    assert "schema" not in texto.lower()
    assert "No se reemplazó nada" in texto

    try:
        ver._leer_versiones(_Roto("permission denied for table almacen_orden_compra_pdf (42501)"), 17, obligatorio=True)
        raise AssertionError("debía fallar")
    except ValueError as exc:
        permiso = str(exc)
    assert "17" not in permiso
    assert "42501" not in permiso
    assert "no permitió" in permiso

    assert ver.nombre_archivo_pdf_oc({"numero_oc": 2}) == "OC-2.pdf"
    assert ver.nombre_archivo_pdf_oc({"id": 17}) == "OC-sin-numero.pdf"
    assert "17" not in ver.etiqueta_oc({"id": 17, "numero_oc": 2})
