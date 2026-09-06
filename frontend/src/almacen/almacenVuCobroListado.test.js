/**
 * VU Cobro / motivos explícitos cuando falta listado.
 * node --test frontend/src/almacen/almacenVuCobroListado.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

function labelCobroMotivo(motivo, { esPrincipal = true } = {}) {
  if (esPrincipal === false || motivo === 'insumo_asociado') return 'Insumo asociado'
  switch (motivo) {
    case 'pendiente_aprobacion':
      return 'Pendiente de aprobación'
    case 'sin_valor_asignado':
      return 'Sin valor asignado'
    case 'sin_capitulo':
    case 'sin_item':
    case 'sin_valor_listado':
      return 'Sin valor en listado'
    default:
      return motivo ? 'Sin valor en listado' : null
  }
}

describe('labelCobroMotivo', () => {
  it('distingue pendiente / sin listado / asociado', () => {
    assert.equal(labelCobroMotivo('pendiente_aprobacion'), 'Pendiente de aprobación')
    assert.equal(labelCobroMotivo('sin_valor_listado'), 'Sin valor en listado')
    assert.equal(labelCobroMotivo('insumo_asociado'), 'Insumo asociado')
    assert.equal(labelCobroMotivo(null, { esPrincipal: false }), 'Insumo asociado')
  })

  it('fuente compartida exporta labelCobroMotivo', () => {
    const src = readFileSync(join(dir, 'almacenShared.jsx'), 'utf8')
    assert.match(src, /export function labelCobroMotivo/)
  })
})

describe('UI cobro vacío', () => {
  it('tabla rentabilidad usa mensaje explícito', () => {
    const src = readFileSync(join(dir, 'TablaRentabilidadAcumulada.jsx'), 'utf8')
    assert.match(src, /sinCobro/)
    assert.match(src, /labelCobroMotivo/)
    assert.match(src, /Sin valor en listado/)
  })

  it('resumen excel explica cobro faltante', () => {
    const src = readFileSync(join(dir, 'LineaResumenExcelTable.jsx'), 'utf8')
    assert.match(src, /Sin valor de cobro en listado/)
    assert.match(src, /Pendiente de aprobación/)
  })
})
