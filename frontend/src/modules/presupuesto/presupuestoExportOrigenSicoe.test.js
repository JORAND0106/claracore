/**
 * Cabecera de memorias: ID_POL vs Registro según origen del ítem.
 * (Lógica espejo de headersDetallePorGrupo en presupuestoExportExcel.js)
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const DET_HEADERS_BASE = [
  'ID_POL',
  'PK_ID',
  'Tramo',
  'Infraestructura',
  'Abscisa Inicial',
  'Abscisa Final',
  'Nodo Inicial',
  'Nodo Final',
  'Área/Long/Nodo',
  'Ancho',
  'Espesor',
  'Cant. Total',
  'Observación',
]

function headersDetallePorGrupo(colLabel, { idColLabel = 'ID_POL' } = {}) {
  const headers = DET_HEADERS_BASE.slice()
  headers[0] = idColLabel || 'ID_POL'
  headers[8] = colLabel || 'Área/Long/Nodo'
  return headers
}

describe('memorias Excel: columna identificador según origen', () => {
  it('ítem presupuesto mantiene ID_POL', () => {
    const h = headersDetallePorGrupo('Área', { idColLabel: 'ID_POL' })
    assert.equal(h[0], 'ID_POL')
    assert.equal(h[8], 'Área')
  })

  it('ítem solo SICOE Obra usa Registro', () => {
    const origen = 'sicoe_obra'
    const idColLabel = origen === 'sicoe_obra' ? 'Registro' : 'ID_POL'
    const h = headersDetallePorGrupo('Área/Long/Nodo', { idColLabel })
    assert.equal(h[0], 'Registro')
  })
})
