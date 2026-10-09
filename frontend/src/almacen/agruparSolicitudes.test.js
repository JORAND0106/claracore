import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))

test('la grilla resalta sin insumo y ofrece Agrupar solo con permiso de editar', () => {
  const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
  const modal = readFileSync(join(dir, 'AgruparSolicitudesModal.jsx'), 'utf8')
  const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
  assert.match(panel, /lineas_sin_insumo/)
  assert.match(panel, /solicitud-sin-insumo/)
  assert.match(panel, /permisos\?\.editar && \(/)
  assert.match(panel, /data-testid="agrupar-solicitudes"/)
  assert.match(panel, /verEconomicos=\{verEconomicos\}/)
  assert.match(modal, /verEconomicos &&/)
  assert.match(modal, /agrupar-confirmar-creacion/)
  assert.match(modal, /disabled=\{busy \|\| !puedeConfirmar\}/)
  assert.match(api, /solicitudes\/agrupar\/vista-previa/)
  assert.match(api, /solicitudes\/agrupar/)
  assert.match(panel, /data-testid="deshacer-agrupar"/)
  assert.match(api, /solicitudes\/agrupar\/deshacer/)
  assert.match(panel, /Leyendo las solicitudes y sus proveedores/)
  assert.match(panel, /Devolviendo las líneas a sus solicitudes/)
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
