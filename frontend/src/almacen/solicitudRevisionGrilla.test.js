/**
 * Helpers de grilla Excel / saldos (pruebas puras).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

function textoLibreSolicitudItem(item) {
  return String(item?.descripcion_solicitada || item?.material_descripcion || '').trim()
}

function descripcionGrillaItem(item) {
  if (item?.insumo_id && item?.material_descripcion) {
    return String(item.material_descripcion).trim()
  }
  return textoLibreSolicitudItem(item) || String(item?.material_descripcion || '').trim() || '—'
}

function saldoNegociadoItem(item) {
  const ctx = item?.contexto_negociado || item?.preview?.contexto_negociado
  if (!ctx?.tiene_negociado) return null
  const v = ctx.saldo_negociado_despues ?? ctx.saldo_negociado
  return v == null ? null : Number(v)
}

function saldoPresupuestadoItem(item) {
  const ctx = item?.contexto_presupuesto || item?.preview?.contexto_presupuesto
  if (!ctx) return null
  const v = ctx.saldo_disponible_despues ?? ctx.saldo_disponible
  return v == null ? null : Number(v)
}

describe('grilla revisión Gerencial', () => {
  it('descripcionGrilla prioriza catálogo si hay insumo mapeado', () => {
    assert.equal(
      descripcionGrillaItem({
        insumo_id: 9,
        material_descripcion: 'Cemento catalogado',
        descripcion_solicitada: 'cemento gris',
      }),
      'Cemento catalogado',
    )
    assert.equal(
      descripcionGrillaItem({
        descripcion_solicitada: 'cemento gris',
        material_descripcion: 'cemento gris',
      }),
      'cemento gris',
    )
  })

  it('saldos vienen del contexto enriquecido', () => {
    assert.equal(saldoNegociadoItem({}), null)
    assert.equal(
      saldoNegociadoItem({
        contexto_negociado: { tiene_negociado: true, saldo_negociado_despues: 12.5 },
      }),
      12.5,
    )
    assert.equal(
      saldoPresupuestadoItem({
        contexto_presupuesto: { saldo_disponible_despues: -3 },
      }),
      -3,
    )
  })
})
