import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickLogoUrl,
  planLayoutLogosEncabezado,
  resolverMetaLogosPresupuesto,
} from './presupuestoExportLogos.js'

describe('pickLogoUrl', () => {
  it('elige el primer string no vacío', () => {
    assert.equal(pickLogoUrl('', null, '  data:x  ', 'y'), 'data:x')
  })
})

describe('resolverMetaLogosPresupuesto', () => {
  it('completa interventoría y entidad desde _contratos si el meta del popup está incompleto', () => {
    const meta = { numero: 'C-1', logo_contratista: 'data:c' }
    const usuario = {
      logo_contratista: 'data:session-c',
      logo_interventoria: 'data:session-i',
      _contratos: [
        {
          id: 9,
          logo_contratista: 'data:list-c',
          logo_interventoria: 'data:list-i',
          logo_entidad: 'data:list-e',
        },
      ],
    }
    const out = resolverMetaLogosPresupuesto(meta, usuario, 9)
    assert.equal(out.logo_contratista, 'data:c')
    assert.equal(out.logo_interventoria, 'data:list-i')
    assert.equal(out.logo_entidad, 'data:list-e')
  })

  it('usa sesión si no hay logos en meta ni lista', () => {
    const out = resolverMetaLogosPresupuesto(
      null,
      { logo_contratista: 'c', logo_interventoria: 'i', _contratos: [] },
      1,
    )
    assert.equal(out.logo_contratista, 'c')
    assert.equal(out.logo_interventoria, 'i')
    assert.equal(out.logo_entidad, null)
  })
})

describe('planLayoutLogosEncabezado', () => {
  it('reserva columnas propias para C e I (no un solo merge) y entidad a la derecha', () => {
    const layout = planLayoutLogosEncabezado(
      { contratista: 0, interventoria: 1, entidad: 2 },
      14,
    )
    assert.equal(layout.leftSpan, 4)
    assert.equal(layout.rightSpan, 2)
    assert.equal(layout.titleStart, 5)
    assert.equal(layout.entidadStart, 13)
    assert.deepEqual(
      layout.leftLogos.map((x) => [x.role, x.colStart]),
      [
        ['contratista', 1],
        ['interventoria', 3],
      ],
    )
    assert.ok(layout.entidadStart > layout.titleStart)
  })

  it('con solo contratista usa 2 columnas a la izquierda', () => {
    const layout = planLayoutLogosEncabezado({ contratista: 0, interventoria: null, entidad: null }, 7)
    assert.equal(layout.leftSpan, 2)
    assert.equal(layout.rightSpan, 0)
    assert.equal(layout.leftLogos.length, 1)
  })
})
