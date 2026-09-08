/**
 * Descripción de ítem en Revisión de línea + popup catálogo insumos (ancho/texto).
 * node --test frontend/src/almacen/almacenRevisionDescPopupInsumos.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

function descripcionItemPresupuesto(item) {
  if (!item) return ''
  const ctx = item.contexto_presupuesto || item.preview?.contexto_presupuesto
  const candidates = [
    ctx?.descripcion,
    item.item_descripcion,
    item.descripcion_item,
    item.presupuesto_descripcion,
  ]
  for (const c of candidates) {
    const s = String(c || '').trim()
    if (s) return s
  }
  return ''
}

describe('descripcionItemPresupuesto', () => {
  it('prioriza contexto y acepta item_descripcion (respuesta ligera)', () => {
    assert.equal(
      descripcionItemPresupuesto({
        contexto_presupuesto: { descripcion: 'Desde contexto' },
        item_descripcion: 'Desde item',
      }),
      'Desde contexto',
    )
    assert.equal(
      descripcionItemPresupuesto({ item_descripcion: 'Suministro e instalación de adoquín' }),
      'Suministro e instalación de adoquín',
    )
    assert.equal(descripcionItemPresupuesto({ material_descripcion: 'Cemento' }), '')
  })

  it('helper exportado y modal muestra descripción', () => {
    const helpers = readFileSync(join(dir, 'solicitudDetalleHelpers.js'), 'utf8')
    const modal = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    const service = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(helpers, /item_descripcion/)
    assert.match(helpers, /presupuesto_descripcion/)
    assert.match(modal, /revision-linea-item-descripcion/)
    assert.match(service, /item_descripcion/)
    assert.match(service, /ppto_map_lig/)
  })
})

describe('popup creación insumos escritorio', () => {
  it('amplía ancho y evita recorte de texto en columnas', () => {
    const src = readFileSync(join(dir, '../admin/SeccionCatalogoInsumos.jsx'), 'utf8')
    assert.match(src, /catalogo-insumo-modal/)
    assert.match(src, /1780px/)
    assert.match(src, /calc\(100vw - 24px\)/)
    assert.match(src, /tableLayout: compactCatalog \? 'fixed' : 'auto'/)
    assert.match(src, /overflow: 'visible'/)
  })
})
