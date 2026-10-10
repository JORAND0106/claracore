import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))

test('la línea aprobada deja el proveedor editable solo para gerencia, administrador o desarrollador', () => {
  const helpers = readFileSync(join(dir, 'solicitudDetalleHelpers.js'), 'utf8')
  const modal = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
  const main = readFileSync(join(dir, 'AlmacenMain.jsx'), 'utf8')
  assert.match(helpers, /export function puedeCambiarProveedorLineaAprobada/)
  assert.match(helpers, /esCargoAdministrador/)
  assert.match(helpers, /MOTIVO_PROVEEDOR_EN_OC/)
  const asignar = helpers.slice(
    helpers.indexOf('export function itemPuedeAsignarInsumo'),
    helpers.indexOf('export function itemPuedeValidar'),
  )
  assert.match(asignar, /aprobado/)
  assert.match(modal, /revision-guardar-proveedor/)
  assert.match(modal, /revision-proveedor-oc/)
  assert.match(modal, /cambiarProveedorLinea/)
  assert.match(main, /esCargoAdministrador/)
})

test('los mensajes de la solicitud abren en su popup y pueden reintentar el aviso', () => {
  const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
  const buzon = readFileSync(join(dir, 'SolicitudBuzon.jsx'), 'utf8')
  const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
  assert.match(detalle, /SolicitudBuzon/)
  assert.doesNotMatch(detalle, /Mensajes de la solicitud/)
  assert.match(buzon, /data-testid="solicitud-mensajes"/)
  assert.match(buzon, /Mensajes/)
  assert.match(buzon, /solicitud-buzon-no-leidos/)
  assert.match(buzon, /solicitud-mensajes-popup/)
  assert.match(buzon, /Buscar por nombre o cargo/)
  assert.match(buzon, /Reintentar aviso/)
  assert.match(buzon, /puedeEnviar && disponible/)
  assert.match(api, /reintentar-aviso/)
  assert.match(api, /items\/\$\{itemId\}\/proveedor/)
})

test('el listado de proveedores se dibuja por delante del popup', () => {
  const field = readFileSync(join(dir, 'ProveedorOfertaField.jsx'), 'utf8')
  const modal = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
  assert.match(field, /createPortal/)
  assert.match(field, /position: 'fixed'/)
  assert.match(field, /revision-linea-proveedor-lista/)
  assert.match(field, /zIndex: 100080/)
  assert.match(modal, /zIndex: 100035/)
  assert.doesNotMatch(field, /position: 'absolute'/)
})
