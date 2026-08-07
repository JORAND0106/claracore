import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickLogoUrl,
  planLayoutLogosEncabezado,
  resolverMetaLogosPresupuesto,
  dimensionesImagenBuffer,
  sizeLogoFixedHeight,
  posicionParLogosFlotante,
  posicionLogoEntidadFlotante,
  excelColWidthToPx,
  pxOffsetToNativeCol,
  pxToEmu,
  LOGO_HEIGHT_CM,
  LOGO_HEIGHT_PX,
  LOGO_PAIR_GAP_PX,
  LOGO_PAIR_PAD_LEFT_PX,
  LOGO_LEFT_COL_CHARS,
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
  it('bloque izquierdo unificado para C+I y entidad a la derecha', () => {
    const layout = planLayoutLogosEncabezado(
      { contratista: { imageId: 0 }, interventoria: { imageId: 1 }, entidad: { imageId: 2 } },
      14,
    )
    assert.equal(layout.leftSpan, 4)
    assert.equal(layout.rightSpan, 2)
    assert.equal(layout.titleStart, 5)
    assert.equal(layout.entidadStart, 13)
    assert.ok(layout.entidadStart > layout.titleStart)
  })

  it('con solo contratista usa 2 columnas a la izquierda', () => {
    const layout = planLayoutLogosEncabezado(
      { contratista: { imageId: 0 }, interventoria: null, entidad: null },
      7,
    )
    assert.equal(layout.leftSpan, 2)
    assert.equal(layout.rightSpan, 0)
  })

  it('respeta leftSpanOverride del par flotante', () => {
    const layout = planLayoutLogosEncabezado(
      { contratista: { imageId: 0 }, interventoria: { imageId: 1 }, entidad: null },
      14,
      { leftSpanOverride: 5 },
    )
    assert.equal(layout.leftSpan, 5)
  })
})

describe('sizeLogoFixedHeight', () => {
  it('fija altura a 1.8 cm (68 px) y ancho proporcional', () => {
    assert.equal(LOGO_HEIGHT_CM, 1.8)
    assert.equal(LOGO_HEIGHT_PX, 68)
    const sq = sizeLogoFixedHeight(100, 100)
    assert.equal(sq.height, 68)
    assert.equal(sq.width, 68)
    const wide = sizeLogoFixedHeight(400, 100)
    assert.equal(wide.height, 68)
    assert.equal(wide.width, Math.round(68 * 4))
    const tall = sizeLogoFixedHeight(50, 100)
    assert.equal(tall.height, 68)
    assert.equal(tall.width, Math.round(68 * 0.5))
  })

  it('no deforma: relación ancho/alto = natW/natH', () => {
    const fit = sizeLogoFixedHeight(320, 80)
    assert.ok(Math.abs(fit.width / fit.height - 320 / 80) < 0.02)
  })
})

describe('dimensionesImagenBuffer', () => {
  it('lee PNG IHDR', () => {
    const buf = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0, 2, 0, 0, 0, 3,
      8, 2, 0, 0, 0, 0, 0, 0, 0,
    ])
    assert.deepEqual(dimensionesImagenBuffer(buf), { width: 2, height: 3 })
  })
})

describe('posicionParLogosFlotante', () => {
  it('coloca interventoría justo a la derecha de contratista con gap 8 px (EMUs nativos)', () => {
    assert.equal(LOGO_PAIR_GAP_PX, 8)
    const logoC = { imageId: 0, natW: 100, natH: 100 }
    const logoI = { imageId: 1, natW: 200, natH: 100 }
    const par = posicionParLogosFlotante({ logoC, logoI })
    assert.ok(par.contratista)
    assert.ok(par.interventoria)
    assert.equal(par.contratista.ext.height, LOGO_HEIGHT_PX)
    assert.equal(par.interventoria.ext.height, LOGO_HEIGHT_PX)
    assert.equal(par.contratista.ext.width, 68)
    assert.equal(par.interventoria.ext.width, 136)

    const colPx = excelColWidthToPx(LOGO_LEFT_COL_CHARS)
    const startC = LOGO_PAIR_PAD_LEFT_PX
    const startI = startC + par.contratista.ext.width + LOGO_PAIR_GAP_PX
    assert.deepEqual(
      { nativeCol: par.contratista.tl.nativeCol, nativeColOff: par.contratista.tl.nativeColOff },
      pxOffsetToNativeCol(startC, [colPx]),
    )
    assert.deepEqual(
      { nativeCol: par.interventoria.tl.nativeCol, nativeColOff: par.interventoria.tl.nativeColOff },
      pxOffsetToNativeCol(startI, [colPx]),
    )
    // Separación en px entre bordes = gap (independiente de columnas).
    assert.equal(startI - (startC + par.contratista.ext.width), LOGO_PAIR_GAP_PX)
    // Offsets en EMUs reales (no widthChars*10000 de ExcelJS).
    assert.equal(par.contratista.tl.nativeColOff, pxToEmu(startC))
    assert.equal(
      par.interventoria.tl.nativeColOff - par.contratista.tl.nativeColOff,
      pxToEmu(par.contratista.ext.width + LOGO_PAIR_GAP_PX),
    )
  })

  it('con solo interventoría arranca en el padding izquierdo', () => {
    const par = posicionParLogosFlotante({
      logoC: null,
      logoI: { imageId: 1, natW: 100, natH: 100 },
    })
    assert.equal(par.contratista, null)
    assert.ok(par.interventoria)
    const colPx = excelColWidthToPx(LOGO_LEFT_COL_CHARS)
    assert.deepEqual(
      { nativeCol: par.interventoria.tl.nativeCol, nativeColOff: par.interventoria.tl.nativeColOff },
      pxOffsetToNativeCol(LOGO_PAIR_PAD_LEFT_PX, [colPx]),
    )
  })
})

describe('posicionLogoEntidadFlotante', () => {
  it('altura 1.8 cm y se ancla al bloque derecho con EMUs nativos', () => {
    const pos = posicionLogoEntidadFlotante({
      logo: { imageId: 2, natW: 120, natH: 60 },
      colStart: 13,
      slotCols: 2,
      colChars: LOGO_LEFT_COL_CHARS,
    })
    assert.equal(pos.ext.height, LOGO_HEIGHT_PX)
    assert.equal(pos.ext.width, Math.round(68 * 2))
    assert.equal(pos.tl.nativeCol, 12)
    assert.ok(pos.tl.nativeColOff >= 0)
  })
})
