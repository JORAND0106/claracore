import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import ExcelJS from 'exceljs'
import {
  buildPreciosExportFilename,
  buildPreciosExportLineas,
  deltaEsRojo,
  deltaValorTotalVsCobro,
  deltaVuCostoVsCobro,
  desgloseAiuIvaParaExport,
  formatDeltaConSigno,
  formulaTotalConAiuExcel,
  formulaVuConAiuExcel,
  roundCop,
  roundQty,
  sumarTotalesExport,
  validatePreciosExport,
} from './preciosSubcontratistaExport.js'
import {
  AIU_DESGLOSE_COMPONENTES,
  buildPreciosSubcontratistaWorkbook,
  colLetter,
  estimateWrappedRowHeight,
  FORMAT_GRID_MIN_COLS,
  layoutAiuFooterPairs,
  layoutEncabezado,
  layoutPrimeraLineaDatos,
  LOGO_WIDTH_PX,
  PRECIOS_FORMATO_CALIDAD,
  preciosExportColumnMap,
  resolveFormatGrid,
  sizeLogoFixedWidth,
} from './preciosSubcontratistaExportExcel.js'
import { buildCompareExcelColors } from '../../utils/exportPalette.js'
import { computeValorDespuesAiuIva } from '../../admin/catalogoInsumosTributos.js'

/** PNG 2×1 px (proporción 2:1) para probar logo 5 cm sin deformar. */
const PNG_2X1_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const LOGO_DATA_URI = `data:image/png;base64,${PNG_2X1_B64}`

const impuestoEjemplo = {
  administracion: '0.05',
  imprevistos: '0.02',
  utilidad: '0.05',
  iva: '0.19',
}

const rowsDemo = [
  {
    listado_precio_id: 1,
    origen: 'presupuesto',
    item_numero: '1.01',
    descripcion: 'Excavación',
    unidad: 'm3',
    cantidad: 10.456,
    vu_costo_mo: 1000.4,
    vu_cobro: 900,
  },
  {
    listado_precio_id: 2,
    origen: 'manual',
    item_numero: 'M-01',
    descripcion: 'Ítem manual',
    unidad: 'und',
    cantidad: 3,
    vu_costo_mo: 2000,
    vu_cobro: 2100,
  },
]

function formulaOf(cell) {
  const v = cell.value
  if (v && typeof v === 'object' && v.formula) return String(v.formula)
  return null
}

function resultOf(cell) {
  const v = cell.value
  if (v && typeof v === 'object' && 'result' in v) return v.result
  return v
}

/** Evaluador mínimo ROUND/SUM y ops aritméticas con refs A1 para verificar recálculo. */
function evalExcelLike(formula, getCell) {
  const src = String(formula).replace(/^=/, '').trim()

  function parsePrimary(s, i) {
    while (i < s.length && /\s/.test(s[i])) i += 1
    if (s[i] === '(') {
      const [v, ni] = parseExpr(s, i + 1)
      let j = ni
      while (j < s.length && /\s/.test(s[j])) j += 1
      if (s[j] !== ')') throw new Error(`")" esperado en ${s.slice(j)}`)
      return [v, j + 1]
    }
    if (/[A-Za-z]/.test(s[i])) {
      let j = i
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j += 1
      const name = s.slice(i, j).toUpperCase()
      while (j < s.length && /\s/.test(s[j])) j += 1
      if (s[j] === '(') {
        const args = []
        j += 1
        while (true) {
          while (j < s.length && /\s/.test(s[j])) j += 1
          if (s[j] === ')') { j += 1; break }
          // SUM range A1:A3
          const rangeMatch = s.slice(j).match(/^([A-Z]+\d+)\s*:\s*([A-Z]+\d+)/i)
          if (name === 'SUM' && rangeMatch) {
            const a = rangeMatch[1].toUpperCase()
            const b = rangeMatch[2].toUpperCase()
            j += rangeMatch[0].length
            const col = a.replace(/\d/g, '')
            const r1 = Number(a.replace(/\D/g, ''))
            const r2 = Number(b.replace(/\D/g, ''))
            let sum = 0
            for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
              sum += Number(getCell(`${col}${r}`)) || 0
            }
            args.push(sum)
          } else {
            const [v, ni] = parseExpr(s, j)
            args.push(v)
            j = ni
          }
          while (j < s.length && /\s/.test(s[j])) j += 1
          if (s[j] === ',') { j += 1; continue }
          if (s[j] === ')') { j += 1; break }
        }
        if (name === 'ROUND') {
          const n = Number(args[0]) || 0
          const d = Number(args[1]) || 0
          const f = 10 ** d
          return [Math.round(n * f) / f, j]
        }
        if (name === 'SUM') {
          return [args.reduce((a, b) => a + (Number(b) || 0), 0), j]
        }
        throw new Error(`Función no soportada: ${name}`)
      }
      // cell ref
      return [Number(getCell(name)) || 0, j]
    }
    // number
    const m = s.slice(i).match(/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?/)
    if (!m) throw new Error(`Número esperado en ${s.slice(i)}`)
    return [Number(m[0]), i + m[0].length]
  }

  function parseFactor(s, i) {
    let [v, ni] = parsePrimary(s, i)
    while (true) {
      while (ni < s.length && /\s/.test(s[ni])) ni += 1
      const op = s[ni]
      if (op !== '*' && op !== '/') break
      const [r, nj] = parsePrimary(s, ni + 1)
      v = op === '*' ? v * r : v / r
      ni = nj
    }
    return [v, ni]
  }

  function parseExpr(s, i) {
    let [v, ni] = parseFactor(s, i)
    while (true) {
      while (ni < s.length && /\s/.test(s[ni])) ni += 1
      const op = s[ni]
      if (op !== '+' && op !== '-') break
      const [r, nj] = parseFactor(s, ni + 1)
      v = op === '+' ? v + r : v - r
      ni = nj
    }
    return [v, ni]
  }

  const [v] = parseExpr(src, 0)
  return v
}

describe('preciosSubcontratistaExport', () => {
  it('roundCop / roundQty', () => {
    assert.equal(roundCop(1000.4), 1000)
    assert.equal(roundCop(1000.5), 1001)
    assert.equal(roundQty(10.456), 10.46)
    assert.equal(roundQty(10.454), 10.45)
  })

  it('buildPreciosExportLineas redondea qty 2dp y money 0dp', () => {
    const lineas = buildPreciosExportLineas(rowsDemo, {}, impuestoEjemplo)
    assert.equal(lineas.length, 2)
    assert.equal(lineas[0].cantidad, 10.46)
    assert.equal(lineas[0].vu_costo_mo, 1000)
    assert.equal(lineas[0].total_antes_aiu, roundCop(10.46 * 1000))
    assert.ok(!('origen' in lineas[0]))
    assert.ok(!('vu_cobro' in lineas[0]))

    const vuCon0 = computeValorDespuesAiuIva(1000, impuestoEjemplo, { valoresEnDecimal: true })
    assert.equal(lineas[0].vu_con_aiu, vuCon0)
    assert.equal(lineas[0].total_con_aiu, roundCop(10.46 * vuCon0))
  })

  it('respeta drafts de pantalla (VU/cantidad editados)', () => {
    const rows = [{
      listado_precio_id: 1,
      precio_id: 9,
      item_numero: '1.01',
      descripcion: 'A',
      unidad: 'm',
      cantidad: 1,
      vu_costo_mo: 100,
    }]
    const drafts = { 'p-9': { vu_costo: '500', cantidad: '4' } }
    const lineas = buildPreciosExportLineas(rows, drafts, impuestoEjemplo)
    assert.equal(lineas.length, 1)
    assert.equal(lineas[0].cantidad, 4)
    assert.equal(lineas[0].vu_costo_mo, 500)
    assert.equal(lineas[0].total_antes_aiu, 2000)
  })

  it('omite filas sin VU o cantidad', () => {
    const rows = [
      { listado_precio_id: 1, item_numero: '1', descripcion: 'x', unidad: 'u', cantidad: 2, vu_costo_mo: null },
      { listado_precio_id: 2, item_numero: '2', descripcion: 'y', unidad: 'u', cantidad: null, vu_costo_mo: 10 },
    ]
    assert.equal(buildPreciosExportLineas(rows, {}, impuestoEjemplo).length, 0)
  })

  it('sumarTotalesExport coincide con sumatoria de filas', () => {
    const lineas = [
      { total_antes_aiu: 1000, total_con_aiu: 1129 },
      { total_antes_aiu: 2000, total_con_aiu: 2259 },
    ]
    const t = sumarTotalesExport(lineas)
    assert.equal(t.sumatoria_antes_aiu, 3000)
    assert.equal(t.total_general_con_aiu, 3388)
    assert.equal(t.valor_aiu_iva, 388)
  })

  it('validatePreciosExport bloquea sin ítems pactados', () => {
    const r = validatePreciosExport({ rows: [], drafts: {}, impuesto: impuestoEjemplo })
    assert.equal(r.ok, false)
    assert.match(r.message, /precio pactado/i)
  })

  it('validatePreciosExport avisa sin AIU/IVA pero no bloquea (confirm en UI)', () => {
    const rows = [{
      listado_precio_id: 1,
      item_numero: '1',
      descripcion: 'x',
      unidad: 'u',
      cantidad: 1,
      vu_costo_mo: 100,
    }]
    const r = validatePreciosExport({
      rows,
      drafts: {},
      impuesto: { administracion: '', imprevistos: '', utilidad: '', iva: '' },
    })
    assert.equal(r.ok, true)
    assert.equal(r.faltaAiu, true)
    assert.equal(r.lineas.length, 1)
    assert.equal(r.totales.sumatoria_antes_aiu, 100)
    assert.equal(r.totales.total_general_con_aiu, 100)
  })

  it('validatePreciosExport ok con ítems + AIU', () => {
    const rows = [{
      listado_precio_id: 1,
      item_numero: '1',
      descripcion: 'x',
      unidad: 'u',
      cantidad: 2,
      vu_costo_mo: 1000,
    }]
    const r = validatePreciosExport({ rows, drafts: {}, impuesto: impuestoEjemplo })
    assert.equal(r.ok, true)
    assert.equal(r.lineas.length, 1)
    assert.equal(r.totales.sumatoria_antes_aiu, 2000)
    assert.ok(r.totales.total_general_con_aiu >= r.totales.sumatoria_antes_aiu)
    assert.equal(r.aiu.administracion, 5)
    assert.equal(r.aiu.imprevistos, 2)
    assert.equal(r.aiu.utilidad, 5)
    assert.equal(r.aiu.iva_sobre_utilidad, 19)
  })

  it('desgloseAiuIvaParaExport y filename', () => {
    const d = desgloseAiuIvaParaExport(impuestoEjemplo)
    assert.equal(d.administracion, 5)
    const name = buildPreciosExportFilename(
      { razon_social: 'Constructora ABC S.A.S.' },
      new Date('2026-10-07T15:00:00Z'),
    )
    assert.match(name, /^precios_pactados_Constructora_ABC_S_A_S_2026-10-07\.xlsx$/)
  })

  it('comparativo VU Cobro: ▲ rojo si sub > cobro, verde si ≤', () => {
    assert.equal(deltaVuCostoVsCobro(1200, 1000), 200)
    assert.equal(deltaEsRojo(200), true)
    assert.equal(formatDeltaConSigno(200), '+200')
    assert.equal(deltaVuCostoVsCobro(800, 1000), -200)
    assert.equal(deltaEsRojo(-200), false)
    assert.equal(formatDeltaConSigno(-200), '-200')
    assert.equal(deltaVuCostoVsCobro(1000, 1000), 0)
    assert.equal(deltaEsRojo(0), false)
    assert.equal(formatDeltaConSigno(0), '0')
    assert.equal(deltaValorTotalVsCobro(2400, 2000), 400)
  })

  it('incluirVuCobro agrega columnas y totales sin alterar AIU', () => {
    const rows = [
      {
        listado_precio_id: 1,
        item_numero: '1',
        descripcion: 'caro',
        unidad: 'u',
        cantidad: 2,
        vu_costo_mo: 1200,
        vu_cobro: 1000,
      },
      {
        listado_precio_id: 2,
        item_numero: '2',
        descripcion: 'barato',
        unidad: 'u',
        cantidad: 3,
        vu_costo_mo: 800,
        vu_cobro: 1000,
      },
      {
        listado_precio_id: 3,
        item_numero: '3',
        descripcion: 'igual',
        unidad: 'u',
        cantidad: 1,
        vu_costo_mo: 500,
        vu_cobro: 500,
      },
    ]
    const sin = validatePreciosExport({ rows, drafts: {}, impuesto: impuestoEjemplo, incluirVuCobro: false })
    const con = validatePreciosExport({ rows, drafts: {}, impuesto: impuestoEjemplo, incluirVuCobro: true })
    assert.equal(con.ok, true)
    assert.equal(con.lineas[0].delta_vu, 200)
    assert.equal(con.lineas[0].total_vu_cobro, 2000)
    assert.equal(con.lineas[0].delta_valor_total, 400)
    assert.equal(con.lineas[1].delta_vu, -200)
    assert.equal(con.lineas[2].delta_vu, 0)
    assert.equal(con.totales.sumatoria_antes_aiu, sin.totales.sumatoria_antes_aiu)
    assert.equal(con.totales.valor_aiu_iva, sin.totales.valor_aiu_iva)
    assert.equal(con.totales.total_general_con_aiu, sin.totales.total_general_con_aiu)
    assert.equal(con.totales.sumatoria_vu_cobro, 5500)
    assert.equal(
      con.totales.diferencia_total_vs_cobro,
      roundCop(con.totales.sumatoria_antes_aiu - 5500),
    )
    assert.equal(con.totales.sumatoria_delta_valor_total, con.totales.diferencia_total_vs_cobro)
    assert.ok(!('vu_cobro' in sin.lineas[0]))
  })

  it('fórmulas AIU Excel alineadas con computeValorDespuesAiuIva', () => {
    const aiu = desgloseAiuIvaParaExport(impuestoEjemplo)
    const f = formulaVuConAiuExcel('G8', aiu)
    assert.match(f, /ROUND\(G8\*\(1\+/)
    const totalF = formulaTotalConAiuExcel('D8', 'G8', aiu)
    assert.match(totalF, /^ROUND\(ROUND\(D8,2\)\*/)
  })

  it('column map: con/sin VU Cobro en orden contractual', () => {
    const con = preciosExportColumnMap(true)
    assert.deepEqual(con.headers.map((h) => h.replace(/\n/g, ' ')), [
      'Ítem',
      'Descripción',
      'Und',
      'Cantidad',
      'VU Cobro',
      'Valor Total VU Cobro',
      'VU Costo M.O.',
      'Valor Total Antes AIU/IVA',
      '▲ Costo',
      '▲ Valor Total',
    ])
    assert.equal(con.cols, 10)
    const sin = preciosExportColumnMap(false)
    assert.equal(sin.cols, 6)
    assert.equal(sin.headers.length, 6)
    assert.ok(!sin.headers.some((h) => /Cobro|▲/.test(h)))
    assert.equal(colLetter(1), 'A')
    assert.equal(colLetter(10), 'J')
  })

  it('workbook sin VU Cobro: fórmulas + resultados = plataforma', async () => {
    const check = validatePreciosExport({
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      incluirVuCobro: false,
    })
    const wb = await buildPreciosSubcontratistaWorkbook({
      subcontratista: {
        razon_social: 'Constructora Demo S.A.S.',
        nit: '900123456-1',
        objeto_contrato: 'Obras fase 1',
        nombre_contacto: 'Ana Pérez',
        telefono: '3001234567',
      },
      contrato: {
        numero: 'CT-100',
        objeto: 'Construcción de redes',
      },
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      generadoEn: new Date('2026-10-07T15:00:00Z'),
      incluirVuCobro: false,
    })
    const meta = wb.preciosExportMeta
    const buf = await wb.xlsx.writeBuffer()
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(buf)
    const ws = loaded.getWorksheet('Precios pactados')
    assert.ok(ws)
    const cmap = meta.columnMap
    const L1 = layoutPrimeraLineaDatos(meta.gridCols)
    assert.equal(ws.getCell(3, 2).value, 'Constructora Demo S.A.S.')
    assert.equal(ws.getCell(2, L1.objetoLabel).value, 'Objeto del contrato')
    assert.equal(ws.getCell(2, L1.objetoValueStart).value, 'Construcción de redes')
    assert.equal(ws.getCell(2, L1.numeroLabel).value, 'Número de contrato')
    assert.equal(ws.getCell(2, L1.numeroValue).value, 'CT-100')
    assert.equal(meta.gridCols, FORMAT_GRID_MIN_COLS)
    assert.ok(meta.printArea.endsWith(`${colLetter(meta.gridCols)}`) || meta.printArea.includes(colLetter(meta.gridCols)))

    const hdr = meta.headerRowIdx
    const hVal = String(ws.getRow(hdr).getCell(cmap.totalAntes).value || '')
    assert.match(hVal, /Antes AIU/i)
    assert.ok(!/con AIU/i.test(hVal))

    const r0 = meta.firstDataRow
    const row0 = ws.getRow(r0)
    const Lc = colLetter(cmap.cantidad)
    const Lv = colLetter(cmap.vuMo)
    const Lt = colLetter(cmap.totalAntes)
    assert.equal(row0.getCell(cmap.cantidad).value, check.lineas[0].cantidad)
    assert.equal(row0.getCell(cmap.vuMo).value, check.lineas[0].vu_costo_mo)
    assert.equal(
      formulaOf(row0.getCell(cmap.totalAntes)),
      `ROUND(ROUND(${Lc}${r0},2)*ROUND(${Lv}${r0},0),0)`,
    )
    assert.equal(resultOf(row0.getCell(cmap.totalAntes)), check.lineas[0].total_antes_aiu)

    const hidden = formulaOf(row0.getCell(cmap.hiddenConAiu))
    assert.ok(hidden)
    assert.match(hidden, new RegExp(`ROUND\\(ROUND\\(${Lc}${r0},2\\)`))
    assert.equal(resultOf(row0.getCell(cmap.hiddenConAiu)), check.lineas[0].total_con_aiu)

    const totalsRow = meta.totalsRowIdx
    assert.equal(String(ws.getCell(totalsRow, 1).value), 'Totales')
    assert.equal(
      formulaOf(ws.getCell(totalsRow, cmap.totalAntes)),
      `SUM(${Lt}${meta.firstDataRow}:${Lt}${meta.lastDataRow})`,
    )
    assert.equal(resultOf(ws.getCell(totalsRow, cmap.totalAntes)), check.totales.sumatoria_antes_aiu)

    let foundGrand = false
    ws.eachRow((row) => {
      const lab = String(row.getCell(1).value || '')
      if (lab.includes('Total general')) {
        assert.equal(resultOf(row.getCell(cmap.totalAntes)), check.totales.total_general_con_aiu)
        assert.ok(formulaOf(row.getCell(cmap.totalAntes)))
        foundGrand = true
      }
      if (lab.includes('Valor correspondiente')) {
        assert.equal(resultOf(row.getCell(cmap.totalAntes)), check.totales.valor_aiu_iva)
        assert.match(formulaOf(row.getCell(cmap.totalAntes)) || '', /ROUND\(/)
      }
    })
    assert.equal(foundGrand, true)
  })

  it('workbook con VU Cobro: orden columnas, ▲ y fórmulas', async () => {
    const check = validatePreciosExport({
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      incluirVuCobro: true,
    })
    const wb = await buildPreciosSubcontratistaWorkbook({
      subcontratista: { razon_social: 'Demo', nit: '1', objeto_contrato: 'x' },
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      generadoEn: new Date('2026-10-07T15:00:00Z'),
      incluirVuCobro: true,
    })
    const meta = wb.preciosExportMeta
    const buf = await wb.xlsx.writeBuffer()
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(buf)
    const ws = loaded.getWorksheet('Precios pactados')
    const map = preciosExportColumnMap(true)
    const r0 = meta.firstDataRow
    const r1 = meta.firstDataRow + 1

    assert.equal(String(ws.getRow(meta.headerRowIdx).getCell(map.deltaCosto).value), '▲ Costo')
    assert.equal(String(ws.getRow(meta.headerRowIdx).getCell(map.deltaValor).value), '▲ Valor Total')

    const row0 = ws.getRow(r0)
    assert.equal(row0.getCell(map.vuCobro).value, check.lineas[0].vu_cobro)
    assert.equal(
      formulaOf(row0.getCell(map.totalVuCobro)),
      `ROUND(ROUND(D${r0},2)*ROUND(E${r0},0),0)`,
    )
    assert.equal(resultOf(row0.getCell(map.totalVuCobro)), check.lineas[0].total_vu_cobro)
    assert.equal(
      formulaOf(row0.getCell(map.totalAntes)),
      `ROUND(ROUND(D${r0},2)*ROUND(G${r0},0),0)`,
    )
    assert.equal(resultOf(row0.getCell(map.totalAntes)), check.lineas[0].total_antes_aiu)
    assert.equal(
      formulaOf(row0.getCell(map.deltaCosto)),
      `ROUND(ROUND(G${r0},0)-ROUND(E${r0},0),0)`,
    )
    assert.equal(resultOf(row0.getCell(map.deltaCosto)), check.lineas[0].delta_vu)
    assert.equal(formulaOf(row0.getCell(map.deltaValor)), `ROUND(H${r0}-F${r0},0)`)
    assert.equal(resultOf(row0.getCell(map.deltaValor)), check.lineas[0].delta_valor_total)

    assert.equal(row0.getCell(map.deltaCosto).font.color.argb, 'FFDC2626') // +100
    const row1 = ws.getRow(r1)
    assert.equal(row1.getCell(map.deltaCosto).font.color.argb, 'FF15803D') // -100

    assert.ok((ws.conditionalFormattings || []).length >= 2)

    const totalsRow = meta.totalsRowIdx
    assert.equal(
      formulaOf(ws.getCell(totalsRow, map.totalVuCobro)),
      `SUM(F${meta.firstDataRow}:F${meta.lastDataRow})`,
    )
    assert.equal(resultOf(ws.getCell(totalsRow, map.totalVuCobro)), check.totales.sumatoria_vu_cobro)
    assert.equal(
      formulaOf(ws.getCell(totalsRow, map.deltaValor)),
      `SUM(J${meta.firstDataRow}:J${meta.lastDataRow})`,
    )
    assert.equal(resultOf(ws.getCell(totalsRow, map.deltaValor)), check.totales.sumatoria_delta_valor_total)
  })

  it('encabezado A|B-D|resto, línea 1 objeto/número, logo 5cm y paleta', async () => {
    assert.deepEqual(layoutEncabezado(6), {
      leftCol: 1, titleStart: 2, titleEnd: 4, rightStart: 5, rightEnd: 6,
    })
    assert.deepEqual(layoutEncabezado(10), {
      leftCol: 1, titleStart: 2, titleEnd: 4, rightStart: 5, rightEnd: 10,
    })
    assert.deepEqual(layoutPrimeraLineaDatos(6), {
      objetoLabel: 1, objetoValueStart: 2, objetoValueEnd: 4, numeroLabel: 5, numeroValue: 6,
    })
    assert.deepEqual(layoutPrimeraLineaDatos(10), {
      objetoLabel: 1, objetoValueStart: 2, objetoValueEnd: 8, numeroLabel: 9, numeroValue: 10,
    })
    const sized = sizeLogoFixedWidth(200, 100, LOGO_WIDTH_PX)
    assert.equal(sized.width, LOGO_WIDTH_PX)
    assert.equal(sized.height, Math.round(LOGO_WIDTH_PX * 0.5))

    const paletteA = {
      encabezado: { bg: '#1B4F72', text: '#FFFFFF' },
      titulo_1: { bg: '#D4E6F1', text: '#1B4F72' },
      titulo_2: { bg: '#2874A6', text: '#FFFFFF' },
      linea_principal: { bg: '#FFFFFF', text: '#1B4F72' },
      linea_secundaria: { bg: '#EBF5FB', text: '#1B4F72' },
    }
    const paletteB = {
      encabezado: { bg: '#145A32', text: '#FFFFFF' },
      titulo_1: { bg: '#D5F5E3', text: '#145A32' },
      titulo_2: { bg: '#1E8449', text: '#FFFFFF' },
      linea_principal: { bg: '#FFFFFF', text: '#145A32' },
      linea_secundaria: { bg: '#E8F8F5', text: '#145A32' },
    }
    const objetoLargo = 'Objeto contractual del contratista con texto suficientemente largo para forzar varias líneas al exportar y verificar que la altura de fila se ajusta al contenido completo sin cortar la descripción del alcance.'
    const descLarga = 'Descripción de ítem muy larga que debe verse completa en la celda con ajuste de texto y altura automática en la fila de datos del Excel de precios de mano de obra del subcontratista.'

    const rows = [
      {
        ...rowsDemo[0],
        descripcion: descLarga,
      },
      rowsDemo[1],
    ]

    for (const [palette, label] of [[paletteA, 'A'], [paletteB, 'B']]) {
      const expected = buildCompareExcelColors(palette)
      const wb = await buildPreciosSubcontratistaWorkbook({
        subcontratista: {
          razon_social: 'Sub Demo S.A.S.',
          nit: '800111222-3',
          objeto_contrato: 'Objeto del subcontratista extendido para validar wrap en línea completa del bloque de datos.',
          nombre_contacto: 'Carlos Ruiz',
          telefono: '3109876543',
        },
        contrato: {
          numero: `CT-PAL-${label}`,
          objeto: objetoLargo,
          export_palette: palette,
          logo_contratista: label === 'A' ? LOGO_DATA_URI : '',
        },
        rows,
        drafts: {},
        impuesto: impuestoEjemplo,
        generadoEn: new Date('2026-10-07T15:00:00Z'),
        incluirVuCobro: false,
      })
      const meta = wb.preciosExportMeta
      const ws = wb.getWorksheet('Precios pactados')
      const L1 = layoutPrimeraLineaDatos(meta.gridCols)
      const split = Math.max(2, Math.floor(meta.gridCols / 2))

      // Título en B:D (master en col 2); calidad desde E
      assert.match(String(ws.getCell(1, 2).value || ''), /PRECIOS DE MANO DE OBRA/)
      assert.match(String(ws.getCell(1, 5).value || ''), new RegExp(PRECIOS_FORMATO_CALIDAD.codigo))
      assert.match(String(ws.getCell(1, 5).value || ''), /Versión 1\.0/)
      assert.equal(ws.getCell(1, 1).fill.fgColor.argb, expected.title)
      assert.equal(ws.getCell(meta.headerRowIdx, 1).fill.fgColor.argb, expected.headerBg)
      assert.equal(ws.getCell(meta.totalsRowIdx, 1).fill.fgColor.argb, expected.totalBg)

      assert.equal(ws.getCell(2, L1.objetoLabel).value, 'Objeto del contrato')
      assert.equal(ws.getCell(2, L1.objetoValueStart).value, objetoLargo)
      assert.equal(ws.getCell(2, L1.numeroLabel).value, 'Número de contrato')
      assert.equal(ws.getCell(2, L1.numeroValue).value, `CT-PAL-${label}`)
      assert.equal(ws.getCell(3, 2).value, 'Sub Demo S.A.S.')
      assert.equal(ws.getCell(3, split + 2).value, '800111222-3')
      assert.match(String(ws.getCell(4, 1).value || ''), /Objeto del contrato \(subcontratista\)/)
      assert.equal(ws.getCell(5, 2).value, 'Carlos Ruiz')
      assert.equal(ws.getCell(5, split + 2).value, '3109876543')

      assert.ok(ws.getRow(2).height >= 28, `altura objeto contrato paleta ${label}`)
      assert.ok(ws.getRow(meta.firstDataRow).height >= 28, `altura descripción larga ${label}`)
      assert.equal(ws.getCell(meta.firstDataRow, 2).alignment.wrapText, true)
      assert.equal(meta.hasLogo, label === 'A')
      assert.equal(meta.footerMaxCol, meta.gridCols)
      assert.ok(meta.aiuLayout.pairs.every((p) => p.valueEnd <= meta.gridCols))
      if (label === 'A') {
        assert.ok(ws.getRow(1).height >= 40, 'fila encabezado contiene logo 5 cm')
        assert.ok(Number(ws.getColumn(1).width) >= 20, 'columna A ensanchada al logo')
      }
    }

    assert.ok(estimateWrappedRowHeight('corto', 40) <= 22)
    assert.ok(estimateWrappedRowHeight(descLarga, 34) > 28)

    // Datos faltantes → guion, sin romper exportación (sin logo)
    const wbEmpty = await buildPreciosSubcontratistaWorkbook({
      subcontratista: {},
      contrato: {},
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      generadoEn: new Date('2026-10-07T15:00:00Z'),
    })
    const wsE = wbEmpty.getWorksheet('Precios pactados')
    const L1e = layoutPrimeraLineaDatos(wbEmpty.preciosExportMeta.gridCols)
    assert.equal(wsE.getCell(2, 2).value, '—')
    assert.equal(wsE.getCell(2, L1e.numeroValue).value, '—')
    assert.equal(wsE.getCell(3, 2).value, '—')
    assert.equal(wsE.getCell(5, 2).value, '—')
    assert.equal(wbEmpty.preciosExportMeta.hasLogo, false)

    // Tres variantes: mismo borde derecho = gridCols; AIU no se sale
    for (const opts of [{ modoCrudo: true }, { incluirVuCobro: false }, { incluirVuCobro: true }]) {
      const wbV = await buildPreciosSubcontratistaWorkbook({
        subcontratista: { razon_social: 'X', nit: '1', objeto_contrato: 'y' },
        contrato: { numero: 'N-1', objeto: 'Objeto variante de prueba' },
        rows: rowsDemo,
        drafts: {},
        impuesto: impuestoEjemplo,
        generadoEn: new Date('2026-10-07T15:00:00Z'),
        ...opts,
      })
      const metaV = wbV.preciosExportMeta
      const wsV = wbV.getWorksheet('Precios pactados')
      const cols = metaV.gridCols
      const L = layoutPrimeraLineaDatos(cols)
      assert.match(String(wsV.getCell(1, 2).value || ''), /PRECIOS DE MANO DE OBRA/)
      assert.match(String(wsV.getCell(1, 5).value || ''), /CC-SUB-PRE/)
      assert.equal(wsV.getCell(2, L.objetoLabel).value, 'Objeto del contrato')
      assert.equal(wsV.getCell(2, L.objetoValueStart).value, 'Objeto variante de prueba')
      assert.equal(wsV.getCell(2, L.numeroLabel).value, 'Número de contrato')
      assert.equal(wsV.getCell(2, L.numeroValue).value, 'N-1')
      assert.equal(metaV.columnMap.cols, cols)
      assert.equal(metaV.footerMaxCol, cols)
      assert.ok(metaV.aiuLayout.pairs.every((p) => p.valueEnd <= cols))
      assert.ok(String(metaV.printArea).startsWith('A1:'))
      assert.ok(String(metaV.printArea).includes(colLetter(cols)))
    }
  })

  it('bloque AIU en una fila + Anticipo/% amortización (3 variantes)', async () => {
    const g6 = resolveFormatGrid(preciosExportColumnMap(false))
    assert.equal(g6.gridCols, FORMAT_GRID_MIN_COLS)
    assert.equal(g6.itemCols, 6)
    assert.equal(g6.hiddenCol, FORMAT_GRID_MIN_COLS + 1)
    assert.ok(g6.spans[2].end > g6.spans[2].start, 'extra cols absorbidas en Descripción')

    const g10 = resolveFormatGrid(preciosExportColumnMap(true))
    assert.equal(g10.gridCols, 10)
    assert.equal(g10.hiddenCol, 11)

    const lay8 = layoutAiuFooterPairs(8, 4)
    assert.equal(lay8.pairs.length, 4)
    assert.equal(lay8.pairs[0].labelCol, 1)
    assert.equal(lay8.maxCol, 8)
    for (const p of lay8.pairs) {
      assert.ok(p.valueEnd <= 8)
    }
    const lay10 = layoutAiuFooterPairs(10, 4)
    assert.equal(lay10.pairs.length, 4)
    assert.ok(lay10.pairs[3].valueEnd <= 10)

    const check = validatePreciosExport({
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      incluirVuCobro: false,
    })
    const grandAntes = check.totales.total_general_con_aiu

    for (const opts of [
      { incluirVuCobro: false, modoCrudo: false },
      { incluirVuCobro: true, modoCrudo: false },
      { incluirVuCobro: false, modoCrudo: true },
    ]) {
      const wb = await buildPreciosSubcontratistaWorkbook({
        subcontratista: {
          razon_social: 'Demo',
          nit: '1',
          objeto_contrato: 'x',
          anticipo: 1500000.4,
          amortizacion_pct: 5,
        },
        contrato: { numero: 'N-1', objeto: 'O' },
        rows: rowsDemo,
        drafts: {},
        impuesto: impuestoEjemplo,
        generadoEn: new Date('2026-10-08T15:00:00Z'),
        ...opts,
      })
      const meta = wb.preciosExportMeta
      const ws = wb.getWorksheet('Precios pactados')
      assert.ok(meta.aiuDesgloseRowIdx)
      assert.ok(meta.anticipoRowIdx)
      assert.equal(meta.anticipoRowIdx, meta.aiuDesgloseRowIdx + 1)

      const aiuRow = meta.aiuDesgloseRowIdx
      const pairs = meta.aiuLayout.pairs
      assert.equal(pairs.length, 4)
      assert.equal(meta.footerMaxCol, meta.gridCols)
      assert.ok(meta.printArea.includes(colLetter(meta.gridCols)))
      AIU_DESGLOSE_COMPONENTES.forEach((comp, i) => {
        const lab = String(ws.getCell(aiuRow, pairs[i].labelCol).value || '')
        assert.match(lab, new RegExp(comp.nombre))
        assert.match(lab, new RegExp(`\\(${comp.abr}\\)`))
        assert.ok(
          Number(ws.getColumn(pairs[i].labelCol).width) >= 14,
          `etiqueta «${comp.nombre}» ancho ≥14 (variante ${JSON.stringify(opts)})`,
        )
        assert.ok(pairs[i].valueEnd <= meta.gridCols)
        const valCell = ws.getCell(aiuRow, pairs[i].valueStart)
        assert.equal(valCell.value, check.lineas ? desgloseAiuIvaParaExport(impuestoEjemplo)[comp.key] : valCell.value)
        assert.equal(valCell.fill.fgColor.argb, 'FFFFFFFF')
        assert.equal(valCell.font.color.argb, 'FF0F2942')
      })

      const antPairs = meta.antLayout.pairs
      assert.equal(ws.getCell(meta.anticipoRowIdx, antPairs[0].labelCol).value, 'Anticipo')
      assert.equal(ws.getCell(meta.anticipoRowIdx, antPairs[0].valueStart).value, roundCop(1500000.4))
      assert.equal(ws.getCell(meta.anticipoRowIdx, antPairs[1].labelCol).value, '% de Amortización')
      assert.equal(ws.getCell(meta.anticipoRowIdx, antPairs[1].valueStart).value, 5)
      assert.equal(
        ws.getCell(meta.anticipoRowIdx, antPairs[0].valueStart).fill.fgColor.argb,
        'FFFFFFFF',
      )
      assert.ok(antPairs.every((p) => p.valueEnd <= meta.gridCols))

      // Nada de contenido (salvo col oculta de fórmulas) a la derecha del borde
      const hidden = meta.columnMap.hiddenConAiu
      ws.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          if (colNumber > meta.gridCols && colNumber !== hidden) {
            assert.fail(`celda fuera del formato en col ${colNumber}: ${cell.value}`)
          }
        })
      })

      if (!opts.modoCrudo) {
        let foundGrand = false
        ws.eachRow((row) => {
          const lab = String(row.getCell(1).value || '')
          if (lab.includes('Total general')) {
            const map = meta.columnMap
            assert.equal(resultOf(row.getCell(map.totalAntes)), grandAntes)
            foundGrand = true
          }
        })
        assert.equal(foundGrand, true)
      }
    }

    // Sin anticipo / amortización → guion
    const wbDash = await buildPreciosSubcontratistaWorkbook({
      subcontratista: { razon_social: 'X', nit: '1', objeto_contrato: 'y' },
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      generadoEn: new Date('2026-10-08T15:00:00Z'),
    })
    const m = wbDash.preciosExportMeta
    const wsD = wbDash.getWorksheet('Precios pactados')
    assert.equal(wsD.getCell(m.anticipoRowIdx, m.antLayout.pairs[0].valueStart).value, '—')
    assert.equal(wsD.getCell(m.anticipoRowIdx, m.antLayout.pairs[1].valueStart).value, '—')
  })

  it('recálculo vivo: al cambiar cantidad y precio las fórmulas coinciden con plataforma', async () => {
    const baseOpts = {
      subcontratista: { razon_social: 'Demo', nit: '1', objeto_contrato: 'x' },
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      generadoEn: new Date('2026-10-07T15:00:00Z'),
    }

    for (const conCobro of [false, true]) {
      const wb = await buildPreciosSubcontratistaWorkbook({ ...baseOpts, incluirVuCobro: conCobro })
      const meta = wb.preciosExportMeta
      const ws = wb.getWorksheet('Precios pactados')
      const map = meta.columnMap
      const cells = new Map()

      for (let r = meta.firstDataRow; r <= meta.lastDataRow; r += 1) {
        for (let c = 1; c <= map.hiddenConAiu; c += 1) {
          const addr = `${colLetter(c)}${r}`
          const cell = ws.getCell(r, c)
          const f = formulaOf(cell)
          if (f) cells.set(addr, { formula: f, value: resultOf(cell) })
          else cells.set(addr, { value: cell.value })
        }
      }
      for (let c = 1; c <= map.hiddenConAiu; c += 1) {
        const addr = `${colLetter(c)}${meta.totalsRowIdx}`
        const cell = ws.getCell(meta.totalsRowIdx, c)
        const f = formulaOf(cell)
        if (f) cells.set(addr, { formula: f, value: resultOf(cell) })
        else if (cell.value != null && cell.value !== '') cells.set(addr, { value: cell.value })
      }

      const getCell = (addr) => {
        const e = cells.get(addr.toUpperCase())
        if (!e) return 0
        if (e.formula) return evalExcelLike(e.formula, getCell)
        return Number(e.value) || 0
      }

      const check0 = validatePreciosExport({
        rows: rowsDemo,
        drafts: {},
        impuesto: impuestoEjemplo,
        incluirVuCobro: conCobro,
      })
      assert.equal(getCell(`${colLetter(map.totalAntes)}${meta.firstDataRow}`), check0.lineas[0].total_antes_aiu)
      assert.equal(getCell(`${colLetter(map.hiddenConAiu)}${meta.totalsRowIdx}`), check0.totales.total_general_con_aiu)

      const newCant = 12.5
      const newVu = 1500
      cells.set(`${colLetter(map.cantidad)}${meta.firstDataRow}`, { value: newCant })
      cells.set(`${colLetter(map.vuMo)}${meta.firstDataRow}`, { value: newVu })

      const rowsMut = rowsDemo.map((row, idx) => (
        idx === 0
          ? { ...row, cantidad: newCant, vu_costo_mo: newVu }
          : row
      ))
      const check1 = validatePreciosExport({
        rows: rowsMut,
        drafts: {},
        impuesto: impuestoEjemplo,
        incluirVuCobro: conCobro,
      })

      assert.equal(
        getCell(`${colLetter(map.totalAntes)}${meta.firstDataRow}`),
        check1.lineas[0].total_antes_aiu,
        `total antes (${conCobro ? 'con' : 'sin'} cobro)`,
      )
      assert.equal(
        getCell(`${colLetter(map.hiddenConAiu)}${meta.firstDataRow}`),
        check1.lineas[0].total_con_aiu,
        `total con AIU fila (${conCobro ? 'con' : 'sin'} cobro)`,
      )
      assert.equal(
        getCell(`${colLetter(map.totalAntes)}${meta.totalsRowIdx}`),
        check1.totales.sumatoria_antes_aiu,
      )
      assert.equal(
        getCell(`${colLetter(map.hiddenConAiu)}${meta.totalsRowIdx}`),
        check1.totales.total_general_con_aiu,
      )

      if (conCobro) {
        assert.equal(
          getCell(`${colLetter(map.deltaCosto)}${meta.firstDataRow}`),
          check1.lineas[0].delta_vu,
        )
        assert.equal(
          getCell(`${colLetter(map.deltaValor)}${meta.firstDataRow}`),
          check1.lineas[0].delta_valor_total,
        )
        assert.equal(
          getCell(`${colLetter(map.deltaValor)}${meta.totalsRowIdx}`),
          check1.totales.sumatoria_delta_valor_total,
        )
      }
    }
  })
})
