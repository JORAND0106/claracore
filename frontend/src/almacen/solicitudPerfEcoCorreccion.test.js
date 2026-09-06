/**
 * Perf progresiva, eco solo Gerencial, corrección post-OC.
 * node --test frontend/src/almacen/solicitudPerfEcoCorreccion.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Valores económicos solo Contratista Gerencial', () => {
  it('frontend y backend restringen a Gerencial', () => {
    const fe = readFileSync(join(dir, 'almacenPermisos.js'), 'utf8')
    assert.match(fe, /Solo Contratista Gerencial/)
    assert.match(fe, /return esContratistaGerencialUsuario\(usuario\)/)
    const be = readFileSync(join(dir, '../../../backend/almacen_permissions.py'), 'utf8')
    assert.match(be, /return es_contratista_gerencial\(current_user\)/)
  })
})

describe('Detalle progresivo', () => {
  it('abre con seed y carga ligera + enrich en segundo plano', () => {
    const src = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(src, /initialSeed/)
    assert.match(src, /loadingSaldos/)
    assert.match(src, /Actualizando saldos/)
    assert.match(src, /ligera:\s*false/)
    const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    assert.match(panel, /initialSeed=\{/)
  })
})

describe('Guardado con id de línea', () => {
  it('buildPayload envía id para upsert', () => {
    const src = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    assert.match(src, /id:\s*it\.id/)
  })
  it('backend usa _sync_solicitud_items', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(src, /def _sync_solicitud_items/)
    assert.match(src, /_sync_solicitud_items\(sb, solicitud_id/)
  })
})

describe('Corrección post-OC', () => {
  it('helper, API y modal de corrección', () => {
    const helpers = readFileSync(join(dir, 'solicitudDetalleHelpers.js'), 'utf8')
    assert.match(helpers, /itemPuedeCorregirInsumoPostOc/)
    assert.match(helpers, /tiene_entradas/)
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    assert.match(api, /corregirInsumoItemPostOc/)
    assert.match(api, /corregir-insumo/)
    const modal = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    assert.match(modal, /Corregir insumo y actualizar OC/)
    const be = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(be, /def corregir_insumo_item_post_oc/)
  })
})

describe('Aprobar ítem ligero', () => {
  it('mapear/validar retornan get_solicitud ligera', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(src, /return get_solicitud\(contrato_id, solicitud_id, ligera=True\)/)
  })
})
