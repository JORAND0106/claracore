import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickLogoUrl,
  planLayoutLogosEncabezado,
  planLayoutResumenEncabezado,
  planLayoutItemEncabezado,
  resolverMetaLogosPresupuesto,
  dimensionesImagenBuffer,
  sizeLogoFixedHeight,
  posicionParLogosFlotante,
  posicionParLogosExtremosBloque,
  posicionLogoEntidadFlotante,
  posicionLogoCentradoEnRango,
  anchoNecesarioParLogosPx,
  excelColWidthToPx,
  excelPxToColWidth,
  pxOffsetToNativeCol,
  pxToEmu,
  LOGO_HEIGHT_CM,
  LOGO_HEIGHT_PX,
  LOGO_PAIR_GAP_PX,
  LOGO_PAIR_PAD_LEFT_PX,
  LOGO_LEFT_COL_CHARS,
  RESUMEN_COL_B_MAX_CHARS,
  RESUMEN_COL_D_CHARS,
  RESUMEN_COL_WIDTHS,
  resolverAnchosPlantillaResumen,
  RESUMEN_HEADER_TITLE_START,
  RESUMEN_HEADER_TITLE_END,
  RESUMEN_HEADER_ENTIDAD_START,
  RESUMEN_HEADER_ENTIDAD_END,
  ITEM_HEADER_LEFT_END,
  ITEM_HEADER_TITLE_START,
  ITEM_HEADER_TITLE_END,
  ITEM_HEADER_ENTIDAD_COL,
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

describe('planLayoutResumenEncabezado', () => {
  it('fija A1:B1 | C1:E1 | F1:G1', () => {
    const layout = planLayoutResumenEncabezado({
      contratista: { imageId: 0 },
      interventoria: { imageId: 1 },
      entidad: { imageId: 2 },
    })
    assert.equal(layout.leftSpan, 2)
    assert.equal(layout.rightSpan, 2)
    assert.equal(layout.titleStart, RESUMEN_HEADER_TITLE_START)
    assert.equal(layout.titleEnd, RESUMEN_HEADER_TITLE_END)
    assert.equal(layout.entidadStart, RESUMEN_HEADER_ENTIDAD_START)
    assert.equal(layout.entidadEnd, RESUMEN_HEADER_ENTIDAD_END)
    assert.equal(RESUMEN_COL_B_MAX_CHARS, 15)
    assert.equal(RESUMEN_COL_D_CHARS, 15)
  })
})

describe('resolverAnchosPlantillaResumen (regla de plataforma)', () => {
  it('expone plantilla fija de 7 columnas con D=15', () => {
    assert.equal(RESUMEN_COL_WIDTHS.length, 7)
    assert.equal(RESUMEN_COL_WIDTHS[3], RESUMEN_COL_D_CHARS)
    assert.deepEqual(RESUMEN_COL_WIDTHS, [30, 14, 50, 15, 16, 14, 18])
  })

  it('es idéntico para dos contratos con distinto contenido (mismo layout de logos)', () => {
    // Simula contrato A (textos cortos) vs B (textos muy largos): el resolver
    // no recibe contenido; solo colCount + spans de logos.
    const opts = { logoLeftSpan: 2, logoRightSpan: 2 }
    const contratoA = resolverAnchosPlantillaResumen(7, opts)
    const contratoB = resolverAnchosPlantillaResumen(7, opts)
    assert.deepEqual(contratoA, contratoB)
    assert.deepEqual(contratoA, [30, 14, 50, 15, 16, 14, 18])
  })

  it('no varía si se omite layout de logos (sigue plantilla fija)', () => {
    const sinLogos = resolverAnchosPlantillaResumen(7, { logoLeftSpan: 0, logoRightSpan: 0 })
    assert.deepEqual(sinLogos, [30, 14, 50, 15, 16, 14, 18])
  })

  it('con leftSpan≥4 solo aplica mínimos de layout, sin leer celdas', () => {
    const w = resolverAnchosPlantillaResumen(7, { logoLeftSpan: 4, logoRightSpan: 0 })
    assert.equal(w[0], 30)
    assert.equal(w[3], 15)
    assert.equal(w[4], 28) // mínimo layout logos 4-col
  })
})

describe('planLayoutItemEncabezado', () => {
  it('fija A1:D1 | E1:L1 | M1 (13 cols; ex-M eliminada)', () => {
    const layout = planLayoutItemEncabezado({
      contratista: { imageId: 0 },
      interventoria: { imageId: 1 },
      entidad: { imageId: 2 },
    })
    assert.equal(layout.cols, 13)
    assert.equal(layout.leftSpan, 4)
    assert.equal(layout.rightSpan, 1)
    assert.equal(layout.titleStart, ITEM_HEADER_TITLE_START)
    assert.equal(layout.titleEnd, ITEM_HEADER_TITLE_END)
    assert.equal(layout.entidadStart, ITEM_HEADER_ENTIDAD_COL)
    assert.equal(ITEM_HEADER_ENTIDAD_COL, 13)
    assert.equal(ITEM_HEADER_LEFT_END, 4)
  })
})

describe('posicionParLogosExtremosBloque con 4 columnas', () => {
  it('ancla interventoría al borde derecho de A:D', () => {
    const widths = [80, 80, 80, 80]
    const par = posicionParLogosExtremosBloque({
      logoC: { imageId: 0, natW: 100, natH: 100 },
      logoI: { imageId: 1, natW: 100, natH: 100 },
      colWidthsPx: widths,
    })
    const blockW = 320
    const startI = blockW - 68
    assert.deepEqual(
      { nativeCol: par.interventoria.tl.nativeCol, nativeColOff: par.interventoria.tl.nativeColOff },
      pxOffsetToNativeCol(startI, widths),
    )
    assert.deepEqual(
      { nativeCol: par.contratista.tl.nativeCol, nativeColOff: par.contratista.tl.nativeColOff },
      pxOffsetToNativeCol(0, widths),
    )
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

describe('posicionParLogosExtremosBloque', () => {
  it('alinea contratista a la izquierda e interventoría a la derecha de A:B', () => {
    const widths = [120, 105]
    const logoC = { imageId: 0, natW: 100, natH: 100 }
    const logoI = { imageId: 1, natW: 200, natH: 100 }
    const par = posicionParLogosExtremosBloque({
      logoC,
      logoI,
      colWidthsPx: widths,
    })
    assert.equal(par.contratista.ext.height, LOGO_HEIGHT_PX)
    assert.equal(par.interventoria.ext.height, LOGO_HEIGHT_PX)
    assert.equal(par.contratista.ext.width, 68)
    assert.equal(par.interventoria.ext.width, 136)
    // C en x=0 (extremo izquierdo)
    assert.deepEqual(
      { nativeCol: par.contratista.tl.nativeCol, nativeColOff: par.contratista.tl.nativeColOff },
      pxOffsetToNativeCol(0, widths),
    )
    // I con borde derecho en blockW
    const startI = widths[0] + widths[1] - 136
    assert.deepEqual(
      { nativeCol: par.interventoria.tl.nativeCol, nativeColOff: par.interventoria.tl.nativeColOff },
      pxOffsetToNativeCol(startI, widths),
    )
    assert.ok(startI >= 68) // no solape con C (68 px)
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

describe('posicionLogoCentradoEnRango', () => {
  it('centra el logo de entidad en F:G (cols 6-7)', () => {
    const colPx = excelColWidthToPx(12)
    const widths = Array.from({ length: 7 }, () => colPx)
    const pos = posicionLogoCentradoEnRango({
      logo: { imageId: 2, natW: 120, natH: 60 },
      colStart: 6,
      colEnd: 7,
      colWidthsPx: widths,
      padPx: LOGO_PAIR_PAD_LEFT_PX,
    })
    assert.equal(pos.ext.height, LOGO_HEIGHT_PX)
    const blockStart = colPx * 5
    const blockW = colPx * 2
    const expected = blockStart + LOGO_PAIR_PAD_LEFT_PX
      + Math.max(0, (blockW - LOGO_PAIR_PAD_LEFT_PX * 2 - pos.ext.width) / 2)
    assert.deepEqual(
      { nativeCol: pos.tl.nativeCol, nativeColOff: pos.tl.nativeColOff },
      pxOffsetToNativeCol(expected, widths),
    )
  })
})

describe('anchoNecesarioParLogosPx / excelPxToColWidth', () => {
  it('calcula espacio del par y convierte px→chars', () => {
    const need = anchoNecesarioParLogosPx({
      logoC: { imageId: 0, natW: 100, natH: 100 },
      logoI: { imageId: 1, natW: 100, natH: 100 },
    })
    // 6 + 68 + 8 + 68 + 6
    assert.equal(need, LOGO_PAIR_PAD_LEFT_PX * 2 + 68 + LOGO_PAIR_GAP_PX + 68)
    const chars = excelPxToColWidth(need)
    assert.ok(excelColWidthToPx(chars) >= need)
  })
})

describe('posicionLogoEntidadFlotante', () => {
  it('altura 1.8 cm y alinea el borde derecho al extremo del área usada', () => {
    const colPx = excelColWidthToPx(LOGO_LEFT_COL_CHARS)
    const colCount = 7
    const colWidthsPx = Array.from({ length: colCount }, () => colPx)
    const pos = posicionLogoEntidadFlotante({
      logo: { imageId: 2, natW: 120, natH: 60 },
      colCount,
      colWidthsPx,
      padRightPx: LOGO_PAIR_PAD_LEFT_PX,
    })
    assert.equal(pos.ext.height, LOGO_HEIGHT_PX)
    assert.equal(pos.ext.width, Math.round(68 * 2))
    const totalPx = colPx * colCount
    const expectedStart = totalPx - pos.ext.width - LOGO_PAIR_PAD_LEFT_PX
    assert.deepEqual(
      { nativeCol: pos.tl.nativeCol, nativeColOff: pos.tl.nativeColOff },
      pxOffsetToNativeCol(expectedStart, colWidthsPx),
    )
  })

  it('con anchos reales distintos sigue pegado al borde derecho', () => {
    const widths = [100, 80, 200, 60, 90, 70, 150]
    const pos = posicionLogoEntidadFlotante({
      logo: { imageId: 2, natW: 100, natH: 100 },
      colCount: 7,
      colWidthsPx: widths,
      padRightPx: 6,
    })
    const total = widths.reduce((a, b) => a + b, 0)
    const start = total - 68 - 6
    assert.deepEqual(
      { nativeCol: pos.tl.nativeCol, nativeColOff: pos.tl.nativeColOff },
      pxOffsetToNativeCol(start, widths),
    )
  })
})
