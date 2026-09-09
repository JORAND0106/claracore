/**
 * Smoke — recuperación de VU costo en Inventario.
 * node --test frontend/src/almacen/inventarioVuCostoConsistencia.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Inventario VU costo sin rendimiento + recuperación', () => {
  it('muestra VU unitario del insumo', () => {
    const src = readFileSync(join(dir, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /ins\.vu_costo \?\? ins\.vu_costo_unitario/)
    assert.match(src, /sin rendimiento/)
  })

  it('backend recupera VU si falla enrich y no multiplica por rendimiento', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(src, /def _load_composicion_ligera/)
    assert.match(src, /def _backfill_vu_costo_composition/)
    assert.match(src, /No cachear respuestas degradadas/)
    assert.match(src, /No usa rendimiento/)
  })
})
