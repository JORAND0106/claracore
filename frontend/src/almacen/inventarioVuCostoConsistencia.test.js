/**
 * Smoke — VU costo sin rendimiento en Inventario.
 * node --test frontend/src/almacen/inventarioVuCostoConsistencia.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Inventario VU costo sin rendimiento', () => {
  it('muestra VU unitario del insumo (no contribución × rendimiento)', () => {
    const src = readFileSync(join(dir, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /ins\.vu_costo \?\? ins\.vu_costo_unitario/)
    assert.match(src, /sin rendimiento/)
    assert.doesNotMatch(src, /VU unitario .* × rendimiento/)
  })

  it('backend suma VU unitarios y no multiplica por rendimiento', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(src, /def _vu_costo_desde_insumos_materiales/)
    assert.match(src, /No usa rendimiento/)
    assert.match(src, /vu_costo = _vu_costo_desde_insumos_materiales/)
    assert.doesNotMatch(
      src,
      /VU costo del ítem = suma \(vu_costo × rendimiento\)/,
    )
  })
})
