import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_SOLICITUDES_FILTROS,
  countSolicitudesFiltrosActivos,
  filterSolicitudesLista,
  matchSolicitudFiltros,
} from './solicitudesFiltros.js'

const base = {
  id: 1,
  consecutivo: 12,
  titulo: 'Cemento vía',
  estado: 'aprobada',
  solicitante_nombre: 'Ana Pérez',
  created_at: '2026-03-15T15:00:00Z',
  tiene_orden_compra: true,
  orden_compra: { id: 9, numero_oc: 42 },
}

describe('filtros solicitudes', () => {
  it('sin filtros devuelve todo', () => {
    const list = [base, { ...base, id: 2, estado: 'borrador', tiene_orden_compra: false, orden_compra: null }]
    assert.equal(filterSolicitudesLista(list, EMPTY_SOLICITUDES_FILTROS).length, 2)
    assert.equal(countSolicitudesFiltrosActivos(EMPTY_SOLICITUDES_FILTROS), 0)
  })

  it('filtra por estado y título', () => {
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, estado: 'aprobada' }), true)
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, estado: 'borrador' }), false)
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, titulo: 'cemento' }), true)
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, titulo: 'asfalto' }), false)
  })

  it('filtra por OC y rango de fechas', () => {
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, con_oc: 'si' }), true)
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, con_oc: 'no' }), false)
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, numero_oc: '42' }), true)
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, numero_oc: '99' }), false)
    assert.equal(matchSolicitudFiltros(base, {
      ...EMPTY_SOLICITUDES_FILTROS,
      fecha_desde: '2026-03-15',
      fecha_hasta: '2026-03-15',
    }), true)
    assert.equal(matchSolicitudFiltros(base, {
      ...EMPTY_SOLICITUDES_FILTROS,
      fecha_desde: '2026-04-01',
    }), false)
  })

  it('filtra por solicitante', () => {
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, solicitante: 'ana' }), true)
    assert.equal(matchSolicitudFiltros(base, { ...EMPTY_SOLICITUDES_FILTROS, solicitante: 'luis' }), false)
  })
})
