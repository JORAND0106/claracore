import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { etiquetaOcVisible, numeroOcVisible } from './numeroOc.js'

describe('número visible de la OC', () => {
  const ordenes = [{ id: 17, numero_oc: 2, proveedor_nombre: 'SERVIPERFILES CYS' }]

  it('usa numero_oc y no el id interno', () => {
    const fila = { orden_compra_id: 17, numero_oc: 2 }
    assert.equal(numeroOcVisible(fila, ordenes), '2')
    assert.equal(etiquetaOcVisible(fila, ordenes), 'OC #2')
    assert.equal(etiquetaOcVisible({ orden_compra_id: 17 }, ordenes), 'OC #2')
  })

  it('si no hay número visible no inventa el id', () => {
    assert.equal(etiquetaOcVisible({ orden_compra_id: 17 }, []), 'La orden de compra')
    assert.equal(etiquetaOcVisible({ orden_compra_id: 99 }, ordenes), 'La orden de compra')
  })
})
