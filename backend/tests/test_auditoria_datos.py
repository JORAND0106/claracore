"""El log de modificaciones se arma en Python y no altera la operación de datos."""
from __future__ import annotations

import unittest
from types import SimpleNamespace

import auditoria_datos as aud


class _Resp:
    def __init__(self, data, status=200, content_range="0-0/1"):
        self.status_code = status
        self.headers = {"content-range": content_range}
        self._data = data

    def json(self):
        return self._data


class _Session:
    def __init__(self, data, status=200, content_range="0-0/1"):
        self.data = data
        self.status = status
        self.content_range = content_range
        self.calls = []

    def request(self, method, url, params=None, headers=None, auth=None):
        self.calls.append(method)
        return _Resp(self.data, self.status, self.content_range)


def _req(method, tabla, payload=None, *, session=None, prefer="", params=None):
    from httpx import QueryParams

    qp = QueryParams(params or {})
    return SimpleNamespace(
        http_method=method,
        path=f"https://db.example/rest/v1/{tabla}",
        json=payload,
        headers={"Prefer": prefer, "apikey": "k"},
        params=qp,
        session=session,
        auth=None,
    )


class TestDiff(unittest.TestCase):
    def test_edicion_solo_campos_que_cambian(self):
        eventos = aud.construir_eventos(
            tabla="presupuesto",
            metodo="PATCH",
            payload={"cantidad": 12, "updated_at": "2026-04-01T00:00:00Z"},
            antes=[{
                "id": 7,
                "descripcion": "Excavación",
                "cantidad": 10,
                "updated_at": "2026-03-01T00:00:00Z",
            }],
            despues=[{
                "id": 7,
                "descripcion": "Excavación",
                "cantidad": 12,
                "updated_at": "2026-04-01T00:00:00Z",
            }],
            es_upsert=False,
            es_carga=False,
            carga_id=None,
        )
        self.assertEqual(len(eventos), 1)
        ev = eventos[0]
        self.assertEqual(ev["accion"], "EDITAR")
        self.assertEqual(ev["modulo"], "Presupuesto")
        self.assertIn("Excavación", ev["registro"])
        self.assertEqual([c["etiqueta"] for c in ev["campos"]], ["Cantidad"])
        self.assertEqual(ev["campos"][0]["anterior"], "10")
        self.assertEqual(ev["campos"][0]["nuevo"], "12")

    def test_guardar_sin_cambios_no_genera_evento(self):
        eventos = aud.construir_eventos(
            tabla="presupuesto",
            metodo="PATCH",
            payload={"cantidad": "10", "updated_at": "2026-04-01T00:00:00Z"},
            antes=[{"id": 7, "cantidad": 10, "updated_at": "2026-01-01T00:00:00Z", "descripcion": "Muro"}],
            despues=[{"id": 7, "cantidad": 10.0, "updated_at": "2026-04-01T00:00:00Z", "descripcion": "Muro"}],
            es_upsert=False,
            es_carga=False,
            carga_id=None,
        )
        self.assertEqual(eventos, [])

    def test_creacion_guarda_valores_iniciales(self):
        eventos = aud.construir_eventos(
            tabla="usuarios",
            metodo="POST",
            payload={"nombre": "Ana", "email": "ana@obra.co", "password_hash": "secreto"},
            antes=None,
            despues=[{"id": 3, "nombre": "Ana", "email": "ana@obra.co", "password_hash": "secreto"}],
            es_upsert=False,
            es_carga=False,
            carga_id=None,
        )
        self.assertEqual(len(eventos), 1)
        ev = eventos[0]
        self.assertEqual(ev["accion"], "CREAR")
        self.assertEqual(ev["modulo"], "Usuarios")
        etiquetas = {c["etiqueta"]: c for c in ev["campos"]}
        self.assertEqual(etiquetas["Nombre"]["anterior"], "—")
        self.assertEqual(etiquetas["Nombre"]["nuevo"], "Ana")
        self.assertEqual(etiquetas["Correo"]["nuevo"], "ana@obra.co")
        self.assertEqual(etiquetas["Contraseña"]["nuevo"], "(oculto)")
        self.assertNotIn("secreto", str(ev))

    def test_eliminacion_conserva_valores(self):
        eventos = aud.construir_eventos(
            tabla="so_registros",
            metodo="DELETE",
            payload=None,
            antes=[{"id": 9, "item": "3.2", "descripcion": "Concreto", "cantidad": 4}],
            despues=None,
            es_upsert=False,
            es_carga=False,
            carga_id=None,
        )
        self.assertEqual(eventos[0]["accion"], "ELIMINAR")
        self.assertEqual(eventos[0]["modulo"], "SICOE")
        self.assertIn("3.2", eventos[0]["registro"])
        self.assertIn("Concreto", eventos[0]["registro"])
        cant = next(c for c in eventos[0]["campos"] if c["etiqueta"] == "Cantidad")
        self.assertEqual(cant["anterior"], "4")
        self.assertEqual(cant["nuevo"], "—")

    def test_varios_campos_en_la_misma_edicion(self):
        eventos = aud.construir_eventos(
            tabla="presupuesto",
            metodo="PATCH",
            payload={"descripcion": "Nueva", "cantidad": 2},
            antes=[{"id": 1, "descripcion": "Vieja", "cantidad": 1}],
            despues=[{"id": 1, "descripcion": "Nueva", "cantidad": 2}],
            es_upsert=False,
            es_carga=False,
            carga_id=None,
        )
        self.assertEqual(len(eventos), 1)
        self.assertEqual(len(eventos[0]["campos"]), 2)

    def test_carga_masiva_agrupa_filas(self):
        eventos = aud.construir_eventos(
            tabla="topo_diseno_rasante",
            metodo="POST",
            payload=None,
            antes=None,
            despues=[
                {"id": 1, "abscisa": "0+100", "cota_eje": 10},
                {"id": 2, "abscisa": "0+120", "cota_eje": 11},
            ],
            es_upsert=False,
            es_carga=True,
            carga_id="carga-1",
        )
        self.assertEqual(len(eventos), 2)
        self.assertTrue(all(e["accion"] == "CARGA_MASIVA" for e in eventos))
        self.assertTrue(all(e["carga_id"] == "carga-1" for e in eventos))
        self.assertTrue(all(e["operacion"] == "CREAR" for e in eventos))
        self.assertNotEqual(eventos[0]["entidad_id"], eventos[1]["entidad_id"])

    def test_mismo_statement_con_varias_filas_es_carga_aunque_la_ruta_no_lo_diga(self):
        eventos = aud.construir_eventos(
            tabla="presupuesto",
            metodo="POST",
            payload=None,
            antes=None,
            despues=[{"id": 1, "item": "1"}, {"id": 2, "item": "2"}],
            es_upsert=False,
            es_carga=False,
            carga_id=None,
        )
        self.assertEqual(eventos[0]["accion"], "CARGA_MASIVA")
        self.assertEqual(eventos[0]["carga_id"], eventos[1]["carga_id"])
        self.assertTrue(eventos[0]["carga_id"])

    def test_upsert_existente_solo_si_cambia(self):
        eventos = aud.construir_eventos(
            tabla="catalogo_insumos",
            metodo="POST",
            payload=[{"id": 5, "nombre": "Cemento", "precio": 100}],
            antes=[{"id": 5, "nombre": "Cemento", "precio": 100}],
            despues=[{"id": 5, "nombre": "Cemento", "precio": 100}],
            es_upsert=True,
            es_carga=False,
            carga_id=None,
            claves_conflicto=["id"],
        )
        self.assertEqual(eventos, [])

    def test_upsert_nuevo_es_creacion(self):
        eventos = aud.construir_eventos(
            tabla="catalogo_insumos",
            metodo="POST",
            payload=[{"id": 8, "nombre": "Arena"}],
            antes=[],
            despues=[{"id": 8, "nombre": "Arena"}],
            es_upsert=True,
            es_carga=False,
            carga_id=None,
            claves_conflicto=["id"],
        )
        self.assertEqual(eventos[0]["accion"], "CREAR")
        self.assertEqual(eventos[0]["modulo"], "Catálogo de insumos")

    def test_lectura_previa_fallida_no_inventa_edicion(self):
        eventos = aud.construir_eventos(
            tabla="presupuesto",
            metodo="PATCH",
            payload={"cantidad": 3},
            antes=None,
            despues=[{"id": 1, "cantidad": 3}],
            es_upsert=False,
            es_carga=False,
            carga_id=None,
        )
        self.assertEqual(eventos, [])

    def test_booleano_y_fecha_legibles(self):
        eventos = aud.construir_eventos(
            tabla="contratos",
            metodo="PATCH",
            payload={"activo": False},
            antes=[{"id": 1, "numero": "IDU-1", "activo": True}],
            despues=[{"id": 1, "numero": "IDU-1", "activo": False}],
            es_upsert=False,
            es_carga=False,
            carga_id=None,
        )
        campo = eventos[0]["campos"][0]
        self.assertEqual(campo["etiqueta"], "Activo")
        self.assertEqual(campo["anterior"], "Sí")
        self.assertEqual(campo["nuevo"], "No")


class TestEjecucion(unittest.TestCase):
    def setUp(self):
        self.prev = aud.insertador_actual()
        self.guardados = []

        def _guardar(payload):
            self.guardados.append(payload)
            return True

        aud.configurar_insertador(_guardar)

    def tearDown(self):
        aud.configurar_insertador(self.prev)

    def test_fallo_de_la_operacion_no_deja_log_y_propaga(self):
        session = _Session([{"id": 1, "cantidad": 1, "descripcion": "A"}])
        builder = SimpleNamespace(request=_req(
            "PATCH", "presupuesto", {"cantidad": 9}, session=session,
        ))

        def orig(_builder):
            raise RuntimeError("no se guardó")

        with self.assertRaises(RuntimeError):
            aud._auditar_execute(builder, orig)
        self.assertEqual(self.guardados, [])

    def test_exito_no_cambia_el_resultado_y_registra_despues(self):
        session = _Session([{"id": 4, "cantidad": 1, "descripcion": "Muro"}])
        builder = SimpleNamespace(request=_req(
            "PATCH", "presupuesto", {"cantidad": 6}, session=session,
        ))
        respuesta = SimpleNamespace(data=[{"id": 4, "cantidad": 6, "descripcion": "Muro"}])

        def orig(_builder):
            return respuesta

        token = aud.abrir_contexto(
            usuario={"sub": "15", "nombre": "Ana Pérez", "cargo_nombre": "Residente", "contrato_id": 3, "contrato_numero": "C-9"},
            ip="10.0.0.8",
            endpoint="/presupuesto/4",
            metodo_http="PATCH",
            es_carga=False,
        )
        try:
            out = aud._auditar_execute(builder, orig)
        finally:
            aud.cerrar_contexto(token)
        self.assertIs(out, respuesta)
        self.assertEqual(len(self.guardados), 1)
        fila = self.guardados[0]
        self.assertEqual(fila["usuario_nombre"], "Ana Pérez")
        self.assertEqual(fila["categoria"], "datos")
        self.assertEqual(fila["accion"], "EDITAR")
        self.assertEqual(fila["modulo"], "Presupuesto")
        self.assertIn("Muro", fila["detalle"]["registro"])
        self.assertEqual(fila["detalle"]["campos"][0]["anterior"], "1")
        self.assertEqual(fila["detalle"]["campos"][0]["nuevo"], "6")

    def test_logs_no_se_pueden_borrar_ni_editar(self):
        builder = SimpleNamespace(request=_req("DELETE", "logs", None, session=_Session([])))
        called = {"n": 0}

        def orig(_builder):
            called["n"] += 1
            return SimpleNamespace(data=[])

        with self.assertRaises(aud.AuditoriaInmutableError):
            aud._auditar_execute(builder, orig)
        self.assertEqual(called["n"], 0)
        self.assertEqual(self.guardados, [])

        builder.request.http_method = "PATCH"
        with self.assertRaises(aud.AuditoriaInmutableError):
            aud._auditar_execute(builder, orig)
        self.assertEqual(called["n"], 0)

    def test_insertar_en_logs_no_se_audita_a_si_mismo(self):
        builder = SimpleNamespace(request=_req("POST", "logs", {"accion": "EDITAR"}, prefer="return=representation"))

        def orig(_builder):
            return SimpleNamespace(data=[{"id": 1}])

        out = aud._auditar_execute(builder, orig)
        self.assertEqual(out.data[0]["id"], 1)
        self.assertEqual(self.guardados, [])

    def test_parche_solo_de_marca_de_tiempo_no_lee_ni_registra(self):
        session = _Session([{"id": 1, "cantidad": 4}])
        builder = SimpleNamespace(request=_req(
            "PATCH", "presupuesto", {"updated_at": "2026-04-01T00:00:00Z"}, session=session,
        ))

        def orig(_builder):
            return SimpleNamespace(data=[{"id": 1, "cantidad": 4}])

        aud._auditar_execute(builder, orig)
        self.assertEqual(session.calls, [])
        self.assertEqual(self.guardados, [])

    def test_select_no_pasa_por_auditoria(self):
        builder = SimpleNamespace(request=_req("GET", "presupuesto", None))
        called = {"n": 0}

        def orig(_builder):
            called["n"] += 1
            return SimpleNamespace(data=[])

        aud._auditar_execute(builder, orig)
        self.assertEqual(called["n"], 1)
        self.assertEqual(self.guardados, [])

    def test_ruta_de_importacion_marca_carga(self):
        self.assertTrue(aud.ruta_es_carga("/topografia/1/diseno/import-csv", "POST"))
        self.assertFalse(aud.ruta_es_carga("/topografia/1/diseno/import-csv", "GET"))
        self.assertFalse(aud.ruta_es_carga("/presupuesto/1", "PATCH"))

    def test_busqueda_no_rompe_el_filtro(self):
        clause = aud.clausula_busqueda('muro (3.2),*', extendida=False)
        self.assertNotIn(",", clause.split("ilike")[0])
        self.assertIn("usuario_nombre.ilike.", clause)
        self.assertNotIn("busqueda", clause)
        ext = aud.clausula_busqueda("cemento", extendida=True)
        self.assertIn("busqueda.ilike.", ext)


class TestFuenteInmutable(unittest.TestCase):
    def test_no_hay_rutas_para_editar_o_borrar_logs(self):
        from pathlib import Path

        texto = Path(__file__).resolve().parents[1].joinpath("main.py").read_text(encoding="utf-8")
        for verbo in ("put", "patch", "delete"):
            self.assertNotIn(f'@app.{verbo}("/logs', texto)
            self.assertNotIn(f"@app.{verbo}('/logs", texto)
        self.assertIn("auditoria_datos.instalar()", texto)
        self.assertIn("auditoria_datos.configurar_insertador", texto)
        self.assertIn("contexto_modificaciones_datos", texto)


if __name__ == "__main__":
    unittest.main()
