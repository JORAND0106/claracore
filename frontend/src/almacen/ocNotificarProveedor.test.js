/**
 * Confirmación Sí/No antes de generar la OC, y marca de documento de sistema.
 * node --test frontend/src/almacen/ocNotificarProveedor.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aplicarRespuestaTodos,
  notificarProveedoresPayload,
  respuestaNotificarCompleta,
} from './ocNotificarProveedor.js'
import { esDocumentoSistema, ETIQUETA_DOCUMENTO_SISTEMA } from './ocDocumentoSistema.js'
import { avisosDocumentoSistemaOc, avisosEnvioOc } from './ocGeneradaMensaje.js'

const dir = dirname(fileURLToPath(import.meta.url))
const leer = (nombre) => readFileSync(join(dir, nombre), 'utf8')

const proveedores = [
  { key: 'id:7', nombre: 'Aceros' },
  { key: 'nombre:cementos', nombre: 'Cementos' },
]

describe('confirmación de notificación al proveedor', () => {
  it('no deja ninguna respuesta marcada y exige todas', () => {
    assert.equal(respuestaNotificarCompleta(proveedores, {}), false)
    assert.equal(respuestaNotificarCompleta(proveedores, { 'id:7': true }), false)
    assert.equal(respuestaNotificarCompleta([], {}), false)
    assert.equal(
      respuestaNotificarCompleta(proveedores, { 'id:7': true, 'nombre:cementos': false }),
      true,
    )
  })

  it('arma el payload con el id o el nombre y respeta el No', () => {
    const payload = notificarProveedoresPayload(proveedores, {
      'id:7': true,
      'nombre:cementos': false,
    })
    assert.deepEqual(payload, [
      { proveedor_id: 7, proveedor_nombre: 'Aceros', notificar: true },
      { proveedor_id: null, proveedor_nombre: 'Cementos', notificar: false },
    ])
    assert.deepEqual(aplicarRespuestaTodos(proveedores, false), {
      'id:7': false,
      'nombre:cementos': false,
    })
  })

  it('incluye redirección temporal solo cuando se notifica', () => {
    const payload = notificarProveedoresPayload(
      proveedores,
      { 'id:7': true, 'nombre:cementos': false },
      { 'id:7': 'yo@obra.com', 'nombre:cementos': 'no@obra.com' },
    )
    assert.equal(payload[0].correo_override, 'yo@obra.com')
    assert.equal(payload[1].correo_override, undefined)
  })

  it('documento de sistema no es pendiente ni enviado', () => {
    assert.equal(esDocumentoSistema({ documento_sistema: true, envio_estado: null }), true)
    assert.equal(esDocumentoSistema({ documento_sistema: true, envio_estado: 'pendiente' }), false)
    assert.equal(esDocumentoSistema({ documento_sistema: true, envio_estado: 'enviado' }), false)
    assert.equal(esDocumentoSistema({ documento_sistema: false }), false)
    assert.equal(ETIQUETA_DOCUMENTO_SISTEMA, 'Documento de sistema')
  })

  it('el aviso de sistema no se etiqueta como pendiente', () => {
    const envios = [
      { numero_oc: 3, proveedor_nombre: 'Aceros', resultado: 'enviado' },
      { numero_oc: 4, proveedor_nombre: 'Cementos', resultado: 'sistema' },
      { numero_oc: 5, resultado: 'pendiente', detalle: 'La cotización no tiene correo.' },
    ]
    const sistema = avisosDocumentoSistemaOc(envios)
    assert.equal(sistema.length, 1)
    assert.match(sistema[0], /OC #4/)
    assert.match(sistema[0], /documento de sistema/)
    assert.doesNotMatch(sistema[0], /pendiente/)
    const pendientes = avisosEnvioOc(envios)
    assert.equal(pendientes.length, 1)
    assert.match(pendientes[0], /OC #5/)
    assert.match(pendientes[0], /pendiente de envío/)
  })

  it('la ventana pregunta por cada proveedor y cancelar no llama a aprobar', () => {
    const modal = leer('OcNotificarProveedorModal.jsx')
    assert.match(modal, /¿Desea notificar al comercial del proveedor/)
    assert.match(modal, /Sí a todos/)
    assert.match(modal, /No a todos/)
    assert.match(modal, /data-testid="oc-notificar-continuar"/)
    assert.match(modal, /data-testid="oc-notificar-correo"/)
    assert.match(modal, /data-testid="oc-notificar-redirect"/)
    assert.match(modal, /Correo de destino/)
    assert.match(modal, /Redirigir solo esta vez/)
    assert.match(modal, /disabled=\{busy \|\| !listo\}/)
    assert.doesNotMatch(modal, /fmtMoney|valor_unitario|valorLinea|verEconomicos/)
    for (const archivo of ['SolicitudDetalleModal.jsx', 'SolicitudRevisionModal.jsx']) {
      const src = leer(archivo)
      assert.match(src, /OcNotificarProveedorModal/)
      assert.match(src, /notificar_proveedores: notificarProveedores/)
      assert.match(src, /correosNotificarOc/)
      assert.match(src, /onCancel=\{\(\) => !busy && setNotificarOc\(null\)\}/)
      assert.match(src, /puedeGenerarOc &&/)
    }
  })
})
