/**
 * Textos del aviso al generar la OC. Sin cifras.
 * node --test frontend/src/almacen/ocGeneradaMensaje.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  asuntoInicialOc,
  avisosEnvioEnProceso,
  avisosEnvioOc,
  etiquetasInicialesOc,
  filaSolicitudTrasOc,
  mensajeInicialOc,
  ordenesDeRespuestaAprobar,
} from './ocGeneradaMensaje.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('aviso de OC generada', () => {
  const sol = { id: 4, consecutivo: 12 }
  const ocs = [
    { id: 1, numero_oc: 30, proveedor_nombre: 'Aceros' },
    { id: 2, numero_oc: 31, proveedor_nombre: 'Cementos' },
  ]

  it('prellena etiquetas, asunto y mensaje con la solicitud y todas las OC, sin dinero', () => {
    const tags = etiquetasInicialesOc(sol, ocs)
    assert.deepEqual(tags, ['Solicitud #12', 'OC #30 · Aceros', 'OC #31 · Cementos'])
    const asunto = asuntoInicialOc(sol, ocs)
    assert.match(asunto, /N\.° 30/)
    assert.match(asunto, /N\.° 31/)
    assert.match(asunto, /solicitud #12/)
    const mensaje = mensajeInicialOc(sol, ocs)
    assert.match(mensaje, /OC #30/)
    assert.match(mensaje, /OC #31/)
    assert.doesNotMatch(`${asunto} ${mensaje} ${tags.join(' ')}`, /\$|IVA|valor|costo/i)
  })

  it('avisa pendiente de envío y toma las OC de la respuesta', () => {
    const avisos = avisosEnvioOc([
      { numero_oc: 30, resultado: 'enviado' },
      { numero_oc: 31, resultado: 'pendiente', detalle: 'La cotización no tiene correo.', persistido: false },
    ])
    assert.equal(avisos.length, 1)
    assert.match(avisos[0], /OC #31/)
    assert.match(avisos[0], /pendiente de envío/)
    assert.match(avisos[0], /no quedó guardado/)
    const r = { ordenes_compra_generadas: ocs, envios_oc: [] }
    assert.equal(ordenesDeRespuestaAprobar(r).length, 2)
  })

  it('el popup se puede cerrar sin enviar y el expediente muestra el registro', () => {
    const modal = readFileSync(join(dir, 'OcGeneradaMensajeModal.jsx'), 'utf8')
    assert.match(modal, /data-testid="oc-generada-mensaje"/)
    assert.match(modal, /aria-label="Destinatario"/)
    assert.match(modal, /aria-label="Etiqueta"/)
    assert.match(modal, /aria-label="Asunto"/)
    assert.match(modal, /aria-label="Mensaje"/)
    assert.match(modal, /data-testid="oc-mensaje-enviar"/)
    assert.match(modal, /data-testid="oc-reintentar-correo"/)
    assert.match(modal, /Cerrar/)
    const exp = readFileSync(join(dir, 'ExpedienteCompraModal.jsx'), 'utf8')
    assert.match(exp, /data-testid="oc-envios"/)
    assert.match(exp, /data-testid="oc-reenviar-correo"/)
    assert.match(exp, /puedeReenviar/)
  })

  it('el correo en segundo plano no se muestra como fallo y la grilla toma el número de OC', () => {
    const proceso = avisosEnvioEnProceso([{ numero_oc: 40, resultado: 'en_proceso' }])
    assert.equal(proceso.length, 1)
    assert.match(proceso[0], /OC #40/)
    assert.equal(avisosEnvioOc([{ numero_oc: 40, resultado: 'en_proceso' }]).length, 0)
    const fila = filaSolicitudTrasOc(
      { id: 9, consecutivo: 3, estado: 'aprobada', items: [{ id: 1 }] },
      [{ id: 70, numero_oc: 40, solicitud_id: 9 }],
    )
    assert.equal(fila.orden_compra.numero_oc, 40)
    assert.equal(fila.tiene_orden_compra, true)
    assert.deepEqual(fila.items, [])
    assert.equal(fila.items_count, 1)
  })
})
