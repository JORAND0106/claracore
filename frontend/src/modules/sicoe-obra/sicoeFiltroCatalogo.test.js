import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SICOE_ESTADO_REPORTE_REVERSION,
  SICOE_ESTADOS_REPORTE_FILTRO,
  sicoeEstadosReporteFiltro,
  sicoeFiltroSoloReversionInterventoria,
  sicoePuedeVerFiltroSubcontratista,
} from './sicoeFiltroCatalogo.js'

describe('sicoeEstadosReporteFiltro — sin restricción por rol', () => {
  it('Interventoría con permisos ve el catálogo completo (no solo Reversión)', () => {
    const usuario = {
      rol_nombre: 'Interventoría',
      permisos: [{ funcion_nombre: 'Reporte de Cantidades', ver: true, crear: true, editar: true, eliminar: true, exportar: true }],
    }
    const out = sicoeEstadosReporteFiltro(usuario, { esInterventoria: true })
    assert.deepEqual(out, SICOE_ESTADOS_REPORTE_FILTRO)
    assert.ok(out.includes('Borrador'))
    assert.ok(out.includes(SICOE_ESTADO_REPORTE_REVERSION))
    assert.ok(out.length > 1)
  })

  it('Contratista ve el mismo catálogo completo', () => {
    const usuario = { rol_nombre: 'Contratista' }
    const out = sicoeEstadosReporteFiltro(usuario, { esInterventoria: false })
    assert.deepEqual(out, SICOE_ESTADOS_REPORTE_FILTRO)
  })

  it('sicoeFiltroSoloReversionInterventoria ya no restringe por rol', () => {
    assert.equal(
      sicoeFiltroSoloReversionInterventoria({ rol_nombre: 'Operativo Interventoría' }),
      false,
    )
  })
})

describe('sicoePuedeVerFiltroSubcontratista — por permiso, no por rol', () => {
  it('Interventoría con permiso Ver ve subcontratistas', () => {
    const usuario = {
      rol_nombre: 'Interventoría',
      contrato_id: 10,
      permisos: [{ funcion_nombre: 'Reporte de Cantidades', ver: true, contrato_id: 10 }],
    }
    assert.equal(sicoePuedeVerFiltroSubcontratista(usuario, 10), true)
  })

  it('Contratista con permiso Ver ve subcontratistas', () => {
    const usuario = {
      rol_nombre: 'Contratista',
      contrato_id: 10,
      permisos: [{ funcion_nombre: 'Reporte de Cantidades', ver: true, contrato_id: 10 }],
    }
    assert.equal(sicoePuedeVerFiltroSubcontratista(usuario, 10), true)
  })

  it('sin permiso de reporte no ve subcontratistas', () => {
    const usuario = {
      rol_nombre: 'Interventoría',
      contrato_id: 10,
      permisos: [],
    }
    assert.equal(sicoePuedeVerFiltroSubcontratista(usuario, 10), false)
  })
})
