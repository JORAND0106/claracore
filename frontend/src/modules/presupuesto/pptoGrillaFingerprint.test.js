import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pptoFingerprintGrilla,
  pptoGrillaDatosIguales,
} from './pptoGrillaFingerprint.js'

describe('pptoFingerprintGrilla', () => {
  it('misma data → misma huella (incluye total)', () => {
    const rows = [
      { id: 1, revisado: 'Aprobado', cant_total: 10, costo_directo: 100 },
      { id: 2, revisado: 'No Revisado', cant_total: 2, costo_directo: 20 },
    ]
    assert.equal(pptoFingerprintGrilla(rows, 2), pptoFingerprintGrilla(rows, 2))
  })

  it('cambio en campo visible → huella distinta', () => {
    const a = [{ id: 1, revisado: 'No Revisado', cant_total: 10 }]
    const b = [{ id: 1, revisado: 'Aprobado', cant_total: 10 }]
    assert.notEqual(pptoFingerprintGrilla(a, 1), pptoFingerprintGrilla(b, 1))
  })

  it('total distinto con mismas filas → huella distinta', () => {
    const rows = [{ id: 1, revisado: 'A', cant_total: 1 }]
    assert.notEqual(pptoFingerprintGrilla(rows, 1), pptoFingerprintGrilla(rows, 99))
  })

  it('null/undefined se tratan como vacíos equivalentes', () => {
    assert.equal(pptoFingerprintGrilla(null, 0), pptoFingerprintGrilla([], 0))
    assert.equal(pptoFingerprintGrilla(undefined, 0), pptoFingerprintGrilla([], 0))
  })
})

describe('pptoGrillaDatosIguales', () => {
  it('detecta igualdad y diferencia', () => {
    const a = [{ id: 7, cant_total: 3, vlr_unitario: 1.5 }]
    const b = [{ id: 7, cant_total: 3, vlr_unitario: 1.5 }]
    const c = [{ id: 7, cant_total: 4, vlr_unitario: 1.5 }]
    assert.equal(pptoGrillaDatosIguales(a, 1, b, 1), true)
    assert.equal(pptoGrillaDatosIguales(a, 1, c, 1), false)
  })
})
