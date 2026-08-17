/**
 * Pruebas puras de identificadores de entidad / snapshots (sin backend).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/** Mirror de entidad_tipo usados en Almacén. */
const ENTIDADES = {
  solicitud: 'solicitud',
  entradaItem: 'entrada_item',
  salida: 'salida',
  devolucion: 'devolucion',
}

function tituloEntradaItem(row) {
  const num = row?.codigo || row?.numero_entrada || row?.id
  const mat = row?.material_descripcion || row?.insumo_label || `línea ${row?.entrada_item_id}`
  return `Almacén · Entrada ${num} · ${mat}`
}

describe('trazabilidad almacén — entidades', () => {
  it('usa entrada_item (no entrada agregada) para historial por insumo', () => {
    assert.equal(ENTIDADES.entradaItem, 'entrada_item')
    assert.notEqual(ENTIDADES.entradaItem, 'entrada')
  })

  it('arma título por línea de entrada', () => {
    const t = tituloEntradaItem({
      codigo: 'Ent-1-00001',
      material_descripcion: 'Cemento',
      entrada_item_id: 9,
    })
    assert.match(t, /Cemento/)
    assert.match(t, /Ent-1-00001/)
  })

  it('mantiene tipos independientes por submódulo', () => {
    const tipos = new Set(Object.values(ENTIDADES))
    assert.equal(tipos.size, 4)
  })
})
