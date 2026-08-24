import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SICOE_ESTADO_REPORTE_REVERSION,
  SICOE_ESTADOS_REPORTE_FILTRO,
  SICOE_ESTADOS_REPORTE_SOLO_REVERSION,
  sicoeEstadosReporteFiltro,
  sicoeFiltroSoloReversionInterventoria,
  sicoePuedeFiltroCatalogoCompleto,
  sicoePuedeVerFiltroSubcontratista,
} from './sicoeFiltroCatalogo.js'

const permCompleto = {
  funcion_nombre: 'Reporte de Cantidades',
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  exportar: true,
  contrato_id: 10,
}

const permSoloVer = {
  funcion_nombre: 'Reporte de Cantidades',
  ver: true,
  crear: false,
  editar: false,
  contrato_id: 10,
}

describe('sicoePuedeFiltroCatalogoCompleto — Crear/Editar, no solo Ver', () => {
  it('solo Ver → false (cualquier rol)', () => {
    assert.equal(
      sicoePuedeFiltroCatalogoCompleto({
        rol_nombre: 'Interventoría',
        contrato_id: 10,
        permisos: [permSoloVer],
      }, 10),
      false,
    )
    assert.equal(
      sicoePuedeFiltroCatalogoCompleto({
        rol_nombre: 'Contratista',
        contrato_id: 10,
        permisos: [permSoloVer],
      }, 10),
      false,
    )
  })

  it('Crear sin Editar → true (Interventoría o Contratista)', () => {
    const p = { ...permSoloVer, crear: true }
    assert.equal(
      sicoePuedeFiltroCatalogoCompleto({
        rol_nombre: 'Interventoría',
        contrato_id: 10,
        permisos: [p],
      }, 10),
      true,
    )
  })

  it('Editar sin Crear → true', () => {
    const p = { ...permSoloVer, editar: true }
    assert.equal(
      sicoePuedeFiltroCatalogoCompleto({
        rol_nombre: 'Operativo Interventoría',
        contrato_id: 10,
        permisos: [p],
      }, 10),
      true,
    )
  })
})

describe('sicoeEstadosReporteFiltro', () => {
  it('solo Ver → únicamente Reversión (también Interventoría 4-5)', () => {
    const usuario = {
      rol_nombre: 'Interventoría',
      contrato_id: 10,
      permisos: [permSoloVer],
    }
    const out = sicoeEstadosReporteFiltro(usuario, { esInterventoria: true }, 10)
    assert.deepEqual(out, SICOE_ESTADOS_REPORTE_SOLO_REVERSION)
    assert.deepEqual(out, [SICOE_ESTADO_REPORTE_REVERSION])
  })

  it('Crear/Editar Interventoría → catálogo completo (no por rol)', () => {
    const usuario = {
      rol_nombre: 'Interventoría',
      contrato_id: 10,
      permisos: [permCompleto],
    }
    const out = sicoeEstadosReporteFiltro(usuario, { esInterventoria: true }, 10)
    assert.deepEqual(out, SICOE_ESTADOS_REPORTE_FILTRO)
    assert.ok(out.includes('Borrador'))
    assert.ok(out.length > 1)
  })

  it('Crear/Editar Contratista → mismo catálogo completo', () => {
    const usuario = {
      rol_nombre: 'Contratista',
      contrato_id: 10,
      permisos: [permCompleto],
    }
    const out = sicoeEstadosReporteFiltro(usuario, { esInterventoria: false }, 10)
    assert.deepEqual(out, SICOE_ESTADOS_REPORTE_FILTRO)
  })

  it('sicoeFiltroSoloReversionInterventoria refleja falta de Crear/Editar', () => {
    assert.equal(
      sicoeFiltroSoloReversionInterventoria({
        rol_nombre: 'Operativo Interventoría',
        contrato_id: 10,
        permisos: [permSoloVer],
      }, 10),
      true,
    )
    assert.equal(
      sicoeFiltroSoloReversionInterventoria({
        rol_nombre: 'Operativo Interventoría',
        contrato_id: 10,
        permisos: [permCompleto],
      }, 10),
      false,
    )
  })
})

describe('sicoePuedeVerFiltroSubcontratista', () => {
  it('solo Ver → no ve subcontratistas', () => {
    assert.equal(
      sicoePuedeVerFiltroSubcontratista({
        rol_nombre: 'Interventoría',
        contrato_id: 10,
        permisos: [permSoloVer],
      }, 10),
      false,
    )
  })

  it('Crear/Editar Interventoría → ve subcontratistas', () => {
    assert.equal(
      sicoePuedeVerFiltroSubcontratista({
        rol_nombre: 'Interventoría',
        contrato_id: 10,
        permisos: [permCompleto],
      }, 10),
      true,
    )
  })

  it('Crear/Editar Contratista → ve subcontratistas', () => {
    assert.equal(
      sicoePuedeVerFiltroSubcontratista({
        rol_nombre: 'Contratista',
        contrato_id: 10,
        permisos: [permCompleto],
      }, 10),
      true,
    )
  })
})
