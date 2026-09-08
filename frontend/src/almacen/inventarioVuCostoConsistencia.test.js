/**
 * Smoke — VU costo ítem = contribución de insumos en Inventario.
 * node --test frontend/src/almacen/inventarioVuCostoConsistencia.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Inventario VU costo consistente', () => {
  it('muestra contribución (VU × rendimiento) en fila de insumo', () => {
    const src = readFileSync(join(dir, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /costo_contribucion \?\? ins\.vu_costo/)
    assert.match(src, /vu_costo_unitario/)
    assert.match(src, /suma de la contribución/)
  })

  it('backend alinea vu_costo del ítem con insumos', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(src, /def _vu_costo_desde_insumos_materiales/)
    assert.match(src, /vu_costo_unitario/)
    assert.match(src, /vu_costo = _vu_costo_desde_insumos_materiales/)
  })
})
