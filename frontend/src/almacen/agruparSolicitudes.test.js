import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))

test('la grilla resalta sin insumo y ya no ofrece Agrupar ni Deshacer', () => {
  const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
  const modal = readFileSync(join(dir, 'AgruparSolicitudesModal.jsx'), 'utf8')
  const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
  assert.match(panel, /lineas_sin_insumo/)
  assert.match(panel, /solicitud-sin-insumo/)
  assert.doesNotMatch(panel, /data-testid="agrupar-solicitudes"/)
  assert.doesNotMatch(panel, /data-testid="deshacer-agrupar"/)
  assert.match(modal, /verEconomicos &&/)
  assert.match(modal, /agrupar-confirmar-creacion/)
  assert.match(api, /solicitudes\/agrupar\/vista-previa/)
  assert.match(api, /solicitudes\/agrupar/)
  assert.match(api, /solicitudes\/agrupar\/deshacer/)
})

test('el nombre completo queda en el popup, el formulario y la OC', () => {
  const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
  const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
  const expediente = readFileSync(join(dir, 'ExpedienteCompraModal.jsx'), 'utf8')
  assert.match(detalle, /data-testid="solicitud-titulo"/)
  assert.match(detalle, /whiteSpace: 'normal'/)
  assert.match(form, /solicitud-form-titulo/)
  assert.match(expediente, /expediente-solicitud-nombre/)
  assert.match(expediente, /sol\?\.titulo/)
})
