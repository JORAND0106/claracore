import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluarRegenerarPdfOc } from './regenerarPdfOcRegla.js'
import { evaluarGenerarOc } from './generarOcRegla.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('quién puede regenerar el PDF de la OC', () => {
  it('basta administrador, contratista gerencial o desarrollador', () => {
    assert.equal(evaluarRegenerarPdfOc({ cargoAdministrador: true }), true)
    assert.equal(evaluarRegenerarPdfOc({ contratistaGerencial: true }), true)
    assert.equal(evaluarRegenerarPdfOc({ desarrollador: true }), true)
    assert.equal(evaluarRegenerarPdfOc({}), false)
    assert.equal(evaluarRegenerarPdfOc({
      excluido: true,
      cargoAdministrador: true,
      desarrollador: true,
      contratistaGerencial: true,
    }), false)
    assert.equal(evaluarGenerarOc({ cargoAdministrador: true, validar: true }), false)
  })

  it('el servidor exige la regla y la pantalla no muestra dinero', () => {
    const permisos = readFileSync(join(dir, 'almacenPermisos.js'), 'utf8')
    assert.match(permisos, /export function puedeRegenerarPdfOcAlmacen/)
    assert.match(permisos, /puedeRegenerarPdfOc: !bloqueado && puedeRegenerarPdfOcAlmacen/)
    const backend = readFileSync(join(dir, '../../../backend/almacen_permissions.py'), 'utf8')
    assert.match(backend, /def puede_regenerar_pdf_oc/)
    assert.match(backend, /def require_regenerar_pdf_oc/)
    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    const regenerar = routes.slice(routes.indexOf('def route_regenerar_pdf_ocs'))
    assert.match(regenerar, /require_regenerar_pdf_oc/)
    assert.doesNotMatch(
      routes.slice(routes.indexOf('def route_regenerar_pdf_ocs'), routes.indexOf('def route_reenviar_oc_correo')),
      /require_generar_orden_compra_almacen/,
    )
    const ui = readFileSync(join(dir, 'SolicitudRegenerarPdf.jsx'), 'utf8')
    assert.match(ui, /Regenerar PDF/)
    assert.match(ui, /reenviar-pdf-corregido/)
    assert.match(ui, /oc-pdf-proveedor-desactualizado/)
    assert.match(ui, /oc-pdf-version-anterior/)
    assert.doesNotMatch(ui, /fmtMoney|\$ \{/)
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(detalle, /puedeRegenerarPdfOc/)
    assert.match(detalle, /reabrir-oc-no-disponible/)
    assert.match(detalle, /MOTIVO_REABRIR_OC_SIN_PANTALLA/)
    assert.match(detalle, /typeof onReabrirOc === 'function'/)
    const form = readFileSync(join(dir, 'SolicitudFormModal.jsx'), 'utf8')
    assert.match(form, /zIndex = 100056/)
    assert.doesNotMatch(ui, /orden_compra_id \?\?/)
    assert.match(ui, /etiquetaOcVisible/)
  })
})
