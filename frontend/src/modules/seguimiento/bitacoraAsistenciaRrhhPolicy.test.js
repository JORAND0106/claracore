/**
 * Node tests — política Bitácora ↔ RRHH (corte + contrato 3).
 * Run: node --test src/modules/seguimiento/bitacoraAsistenciaRrhhPolicy.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BITACORA_ASISTENCIA_RRHH_CORTE_ISO,
  cutoverAsistenciaRrhhActivo,
  docValidacionEsAprobado,
  esContratoExentoAsistenciaRrhh,
  filtrarCatalogoRrhhAprobados,
  policySnapshotAsistenciaRrhh,
  requiereAsistenciaRrhhAprobado,
} from './bitacoraAsistenciaRrhhPolicy.js'
import { puedeUsarCargoCantidadAsistencia } from './personalAsistenciaHelpers.js'

describe('bitacoraAsistenciaRrhhPolicy', () => {
  it('antes del 25-sep-2026 no exige gate', () => {
    const now = new Date('2026-09-24T23:30:00-05:00')
    assert.equal(cutoverAsistenciaRrhhActivo(now), false)
    assert.equal(requiereAsistenciaRrhhAprobado({ contratoId: 1, now }), false)
    assert.equal(requiereAsistenciaRrhhAprobado({ contratoId: 3, activaEnExento: true, now }), false)
  })

  it('desde el 25-sep-2026 exige gate salvo contrato 3', () => {
    const now = new Date('2026-09-25T00:00:00-05:00')
    assert.equal(cutoverAsistenciaRrhhActivo(now), true)
    assert.equal(requiereAsistenciaRrhhAprobado({ contratoId: 1, now }), true)
    assert.equal(requiereAsistenciaRrhhAprobado({ contratoId: 3, activaEnExento: false, now }), false)
    assert.equal(requiereAsistenciaRrhhAprobado({ contratoId: 3, activaEnExento: true, now }), true)
  })

  it('snapshot y filtro de aprobados', () => {
    const now = new Date('2026-09-26T10:00:00-05:00')
    const snap = policySnapshotAsistenciaRrhh({ contratoId: 3, activaEnExento: false, now })
    assert.equal(snap.corte_iso, BITACORA_ASISTENCIA_RRHH_CORTE_ISO)
    assert.equal(snap.permite_cargo_cuadrilla, true)
    assert.equal(esContratoExentoAsistenciaRrhh(3), true)
    assert.equal(docValidacionEsAprobado('aprobado'), true)
    const cat = filtrarCatalogoRrhhAprobados([
      { id: 1, doc_validacion_estado: 'aprobado' },
      { id: 2, doc_validacion_estado: 'pendiente' },
    ], { aplicar: true })
    assert.equal(cat.length, 1)
    assert.equal(cat[0].id, 1)
  })

  it('cargo/cuadrilla en contrato exento', () => {
    assert.equal(puedeUsarCargoCantidadAsistencia({
      esDesarrollador: false,
      contratoNumero: 'X',
      permiteCargoCuadrilla: true,
    }), true)
    assert.equal(puedeUsarCargoCantidadAsistencia({
      esDesarrollador: false,
      contratoNumero: 'X',
      permiteCargoCuadrilla: false,
    }), false)
  })
})
