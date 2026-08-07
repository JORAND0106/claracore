import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickLogoUrl,
  planLayoutLogosEncabezado,
  resolverMetaLogosPresupuesto,
  fitLogoContain,
  dimensionesImagenBuffer,
  posicionLogoFlotante,
  LOGO_PAR_MAX_W,
  LOGO_PAR_MAX_H,
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
      { contratista: { imageId: 0 }, interventoria: { imageId: 1 }, entidad: { imageId: 2 } },
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
    const layout = planLayoutLogosEncabezado({ contratista: { imageId: 0 }, interventoria: null, entidad: null }, 7)
    assert.equal(layout.leftSpan, 2)
    assert.equal(layout.rightSpan, 0)
    assert.equal(layout.leftLogos.length, 1)
  })
})

describe('fitLogoContain', () => {
  it('no deforma: logo cuadrado en caja ancha queda cuadrado y centrado', () => {
    const fit = fitLogoContain(100, 100, LOGO_PAR_MAX_W, LOGO_PAR_MAX_H)
    assert.equal(fit.width, fit.height)
    assert.equal(fit.height, LOGO_PAR_MAX_H)
    assert.ok(fit.offsetX > 0)
    assert.equal(fit.offsetY, 0)
  })

  it('logo muy ancho se limita por el ancho máximo', () => {
    const fit = fitLogoContain(400, 40, LOGO_PAR_MAX_W, LOGO_PAR_MAX_H)
    assert.equal(fit.width, LOGO_PAR_MAX_W)
    assert.ok(fit.height <= LOGO_PAR_MAX_H)
    assert.ok(fit.offsetY >= 0)
  })

  it('no agranda logos más pequeños que la caja', () => {
    const fit = fitLogoContain(20, 10, 96, 40)
    assert.equal(fit.width, 20)
    assert.equal(fit.height, 10)
  })
})

describe('dimensionesImagenBuffer', () => {
  it('lee PNG IHDR', () => {
    // PNG mínimo con IHDR 2×3
    const buf = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0, 2, 0, 0, 0, 3,
      8, 2, 0, 0, 0, 0, 0, 0, 0,
    ])
    assert.deepEqual(dimensionesImagenBuffer(buf), { width: 2, height: 3 })
  })
})

describe('posicionLogoFlotante', () => {
  it('usa ext proporcional y tl con offset de centrado', () => {
    const pos = posicionLogoFlotante({
      colStart: 3,
      slotCols: 2,
      maxW: 96,
      maxH: 40,
      natW: 100,
      natH: 100,
      rowHeightPt: 54,
    })
    assert.equal(pos.ext.width, pos.ext.height)
    assert.equal(pos.ext.height, 40)
    // colStart 3 → índice 2; offsetX = (96-40)/2 = 28 → +28/96*2 ≈ 0.583
    assert.ok(pos.tl.col > 2 && pos.tl.col < 3)
    assert.ok(pos.tl.row >= 0)
  })
})
