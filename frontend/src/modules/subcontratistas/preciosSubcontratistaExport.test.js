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
  buildPreciosSubcontratistaWorkbook,
  colLetter,
  preciosExportColumnMap,
} from './preciosSubcontratistaExportExcel.js'
import { computeValorDespuesAiuIva } from '../../admin/catalogoInsumosTributos.js'

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
    const wb = buildPreciosSubcontratistaWorkbook({
      subcontratista: {
        razon_social: 'Constructora Demo S.A.S.',
        nit: '900123456-1',
        objeto_contrato: 'Obras fase 1',
      },
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      generadoEn: new Date('2026-10-07T15:00:00Z'),
      incluirVuCobro: false,
    })
    const buf = await wb.xlsx.writeBuffer()
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(buf)
    const ws = loaded.getWorksheet('Precios pactados')
    assert.ok(ws)
    assert.equal(ws.getCell(2, 2).value, 'Constructora Demo S.A.S.')

    // Headers: sin Cobro / sin Con AIU/IVA por fila
    const h7 = String(ws.getRow(7).getCell(6).value || '')
    assert.match(h7, /Antes AIU/i)
    assert.ok(!/con AIU/i.test(h7))

    const row8 = ws.getRow(8)
    assert.equal(row8.getCell(4).value, check.lineas[0].cantidad)
    assert.equal(row8.getCell(5).value, check.lineas[0].vu_costo_mo)
    assert.equal(formulaOf(row8.getCell(6)), 'ROUND(ROUND(D8,2)*ROUND(E8,0),0)')
    assert.equal(resultOf(row8.getCell(6)), check.lineas[0].total_antes_aiu)

    // Columna oculta con AIU
    const hidden = formulaOf(row8.getCell(7))
    assert.ok(hidden)
    assert.match(hidden, /ROUND\(ROUND\(D8,2\)/)
    assert.equal(resultOf(row8.getCell(7)), check.lineas[0].total_con_aiu)

    // Fila totales
    const totalsRow = 10 // 8,9 data → 10 totales
    assert.equal(String(ws.getCell(totalsRow, 1).value), 'Totales')
    assert.equal(formulaOf(ws.getCell(totalsRow, 6)), 'SUM(F8:F9)')
    assert.equal(resultOf(ws.getCell(totalsRow, 6)), check.totales.sumatoria_antes_aiu)

    let foundGrand = false
    ws.eachRow((row) => {
      const lab = String(row.getCell(1).value || '')
      if (lab.includes('Total general')) {
        assert.equal(resultOf(row.getCell(6)), check.totales.total_general_con_aiu)
        assert.ok(formulaOf(row.getCell(6)))
        foundGrand = true
      }
      if (lab.includes('Valor correspondiente')) {
        assert.equal(resultOf(row.getCell(6)), check.totales.valor_aiu_iva)
        assert.match(formulaOf(row.getCell(6)) || '', /ROUND\(/)
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
    const wb = buildPreciosSubcontratistaWorkbook({
      subcontratista: { razon_social: 'Demo', nit: '1', objeto_contrato: 'x' },
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      generadoEn: new Date('2026-10-07T15:00:00Z'),
      incluirVuCobro: true,
    })
    const buf = await wb.xlsx.writeBuffer()
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(buf)
    const ws = loaded.getWorksheet('Precios pactados')
    const map = preciosExportColumnMap(true)

    assert.equal(String(ws.getRow(7).getCell(map.deltaCosto).value), '▲ Costo')
    assert.equal(String(ws.getRow(7).getCell(map.deltaValor).value), '▲ Valor Total')

    const row8 = ws.getRow(8)
    assert.equal(row8.getCell(map.vuCobro).value, check.lineas[0].vu_cobro)
    assert.equal(formulaOf(row8.getCell(map.totalVuCobro)), 'ROUND(ROUND(D8,2)*ROUND(E8,0),0)')
    assert.equal(resultOf(row8.getCell(map.totalVuCobro)), check.lineas[0].total_vu_cobro)
    assert.equal(formulaOf(row8.getCell(map.totalAntes)), 'ROUND(ROUND(D8,2)*ROUND(G8,0),0)')
    assert.equal(resultOf(row8.getCell(map.totalAntes)), check.lineas[0].total_antes_aiu)
    assert.equal(formulaOf(row8.getCell(map.deltaCosto)), 'ROUND(ROUND(G8,0)-ROUND(E8,0),0)')
    assert.equal(resultOf(row8.getCell(map.deltaCosto)), check.lineas[0].delta_vu)
    assert.equal(formulaOf(row8.getCell(map.deltaValor)), 'ROUND(H8-F8,0)')
    assert.equal(resultOf(row8.getCell(map.deltaValor)), check.lineas[0].delta_valor_total)

    // Colores iniciales ▲
    assert.equal(row8.getCell(map.deltaCosto).font.color.argb, 'FFDC2626') // +100
    const row9 = ws.getRow(9)
    assert.equal(row9.getCell(map.deltaCosto).font.color.argb, 'FF15803D') // -100

    // Conditional formatting presente
    assert.ok((ws.conditionalFormattings || []).length >= 2)

    const totalsRow = 10
    assert.equal(formulaOf(ws.getCell(totalsRow, map.totalVuCobro)), 'SUM(F8:F9)')
    assert.equal(resultOf(ws.getCell(totalsRow, map.totalVuCobro)), check.totales.sumatoria_vu_cobro)
    assert.equal(formulaOf(ws.getCell(totalsRow, map.deltaValor)), 'SUM(J8:J9)')
    assert.equal(resultOf(ws.getCell(totalsRow, map.deltaValor)), check.totales.sumatoria_delta_valor_total)
  })

  it('recálculo vivo: al cambiar cantidad y precio las fórmulas coinciden con plataforma', () => {
    const baseOpts = {
      subcontratista: { razon_social: 'Demo', nit: '1', objeto_contrato: 'x' },
      rows: rowsDemo,
      drafts: {},
      impuesto: impuestoEjemplo,
      generadoEn: new Date('2026-10-07T15:00:00Z'),
    }

    for (const conCobro of [false, true]) {
      const wb = buildPreciosSubcontratistaWorkbook({ ...baseOpts, incluirVuCobro: conCobro })
      const meta = wb.preciosExportMeta
      const ws = wb.getWorksheet('Precios pactados')
      const map = meta.columnMap
      const cells = new Map()

      // Cargar valores/resultados iniciales
      for (let r = meta.firstDataRow; r <= meta.lastDataRow; r += 1) {
        for (let c = 1; c <= map.hiddenConAiu; c += 1) {
          const addr = `${colLetter(c)}${r}`
          const cell = ws.getCell(r, c)
          const f = formulaOf(cell)
          if (f) cells.set(addr, { formula: f, value: resultOf(cell) })
          else cells.set(addr, { value: cell.value })
        }
      }
      // Totals row
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

      // Sin modificar: resultados = plataforma
      const check0 = validatePreciosExport({
        rows: rowsDemo,
        drafts: {},
        impuesto: impuestoEjemplo,
        incluirVuCobro: conCobro,
      })
      assert.equal(getCell(`${colLetter(map.totalAntes)}${meta.firstDataRow}`), check0.lineas[0].total_antes_aiu)
      assert.equal(getCell(`${colLetter(map.hiddenConAiu)}${meta.totalsRowIdx}`), check0.totales.total_general_con_aiu)

      // Mutar cantidad y VU M.O. de la primera fila
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
