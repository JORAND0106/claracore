/**
 * Grilla paginada, portal de insumos, S.PPTO solo principales, ancho revisión = detalle.
 * node --test frontend/src/almacen/solicitudGrillaInsumoSppto.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Grilla solicitudes — paginación', () => {
  it('API y panel usan limit/offset y respuesta { items, has_more }', () => {
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    assert.match(api, /params\.set\('limit'/)
    assert.match(api, /params\.set\('offset'/)
    assert.match(api, /has_more/)
    assert.match(panel, /PAGE_SIZE/)
    assert.match(panel, /loadMore/)
    assert.match(panel, /Cargar más/)
  })
})

describe('Revisión de línea — insumos + ancho', () => {
  it('dropdown en portal y suggestFrom desde descripción contratista', () => {
    const search = readFileSync(join(dir, 'InsumoSearchTable.jsx'), 'utf8')
    const modal = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    assert.match(search, /createPortal/)
    assert.match(search, /suggestFrom/)
    assert.match(search, /insumo-search-dropdown/)
    assert.match(modal, /suggestFrom=\{/)
    assert.match(modal, /LINEA_MODAL_WIDTH\s*=\s*'min\(1622px, 100%\)'/)
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(detalle, /min\(1622px, 100%\)/)
  })
})

describe('S.PPTO — solo principales', () => {
  it('backend endurece _item_es_principal y excluye asociados del acumulado', () => {
    const insumos = readFileSync(join(dir, '../../../backend/almacen_insumos_service.py'), 'utf8')
    assert.match(insumos, /def _item_es_principal/)
    assert.match(insumos, /"false", "0", "f"/)
    assert.match(insumos, /es_principal\.eq\.true,es_principal\.is\.null/)
    assert.match(insumos, /def score_insumo_contra_consulta/)
  })
})
