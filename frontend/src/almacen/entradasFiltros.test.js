import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_ENTRADAS_FILTROS,
  countEntradasFiltrosActivos,
  filterEntradasLista,
  matchEntradaFiltros,
} from './entradasFiltros.js'

const base = {
  id: 1,
  fecha_entrada: '2026-05-10T12:00:00Z',
  tipo: 'recibo',
  numero_documento: 'REM-001',
  almacen_orden_compra: { numero_oc: 7 },
  material_descripcion: 'Arena gruesa',
  proveedor_nombre: 'Agregados SA',
  usuario_nombre: 'Carlos Ruiz',
  pk_id: 'PK-120',
  alerta_saldo: 'naranja',
}

describe('filtros entradas', () => {
  it('sin filtros no reduce', () => {
    assert.equal(filterEntradasLista([base], EMPTY_ENTRADAS_FILTROS).length, 1)
    assert.equal(countEntradasFiltrosActivos(EMPTY_ENTRADAS_FILTROS), 0)
  })

  it('filtra por tipo, remisión, OC e insumo', () => {
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, tipo: 'recibo' }), true)
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, tipo: 'disposicion' }), false)
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, remision: '001' }), true)
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, numero_oc: '7' }), true)
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, insumo: 'arena' }), true)
  })

  it('filtra proveedor, usuario, PK y alerta', () => {
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, proveedor: 'agregados' }), true)
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, usuario: 'carlos' }), true)
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, pk_id: '120' }), true)
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, alerta_saldo: 'naranja' }), true)
    assert.equal(matchEntradaFiltros(base, { ...EMPTY_ENTRADAS_FILTROS, alerta_saldo: 'rojo' }), false)
  })

  it('combinación y vacío', () => {
    const list = [
      base,
      { ...base, id: 2, tipo: 'disposicion', alerta_saldo: 'rojo', material_descripcion: 'Cemento' },
    ]
    const out = filterEntradasLista(list, {
      ...EMPTY_ENTRADAS_FILTROS,
      tipo: 'disposicion',
      alerta_saldo: 'rojo',
    })
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 2)
    assert.equal(filterEntradasLista(list, {
      ...EMPTY_ENTRADAS_FILTROS,
      insumo: 'xyz-no-existe',
    }).length, 0)
  })
})
