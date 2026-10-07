/**
 * Generación Excel (soporte contractual) — Tab Precios Subcontratistas.
 * Valores calculados = fórmulas vivas (ROUND) enlazadas a cantidad/precio.
 * Opcionalmente incluye VU Cobro + comparativo (solo uso interno).
 */
import ExcelJS from 'exceljs'
import {
  buildPreciosExportFilename,
  deltaEsRojo,
  formulaTotalConAiuExcel,
  validatePreciosExport,
} from './preciosSubcontratistaExport.js'

const FILL_TITLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5C75' } }
const FILL_META = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F6F9' } }
const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00AFC5' } }
const FILL_SECTION = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEFF8' } }
const FILL_TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8E4EC' } }
const FILL_TOTALS_ROW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5E8F0' } }

const FONT_WHITE_BOLD = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
const FONT_META = { bold: true, size: 11, color: { argb: 'FF0F2942' }, name: 'Calibri' }
const FONT_HEADER = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
const FONT_BODY = { size: 10, color: { argb: 'FF1A1A1A' }, name: 'Calibri' }
const FONT_SECTION = { bold: true, size: 11, color: { argb: 'FF0B5C75' }, name: 'Calibri' }
const FONT_TOTALS = { bold: true, size: 10, color: { argb: 'FF0B5C75' }, name: 'Calibri' }
const FONT_DELTA_RED = { bold: true, size: 10, color: { argb: 'FFDC2626' }, name: 'Calibri' }
const FONT_DELTA_GREEN = { bold: true, size: 10, color: { argb: 'FF15803D' }, name: 'Calibri' }
const FONT_GRAND = { bold: true, size: 12, color: { argb: 'FF0B5C75' }, name: 'Calibri' }

const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FF8AB8C4' } },
  left: { style: 'thin', color: { argb: 'FF8AB8C4' } },
  bottom: { style: 'thin', color: { argb: 'FF8AB8C4' } },
  right: { style: 'thin', color: { argb: 'FF8AB8C4' } },
}

const NUM_COP = '"$"#,##0'
const NUM_QTY = '#,##0.00'
const NUM_DELTA = '+#,##0;-#,##0;0'
const NUM_PCT = '0.####" %"'

function applyBorderRange(ws, r1, c1, r2, c2) {
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) {
      ws.getCell(r, c).border = BORDER_THIN
    }
  }
}

function fechaGeneracionTxt(d) {
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 1-based column index → letter(s) (1=A … 27=AA). */
export function colLetter(n) {
  let x = Number(n)
  if (!Number.isFinite(x) || x < 1) return 'A'
  let s = ''
  while (x > 0) {
    const m = (x - 1) % 26
    s = String.fromCharCode(65 + m) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

function setFormula(cell, formula, result, numFmt) {
  cell.value = { formula, result }
  if (numFmt) cell.numFmt = numFmt
}

/**
 * Mapa de columnas visibles según opción VU Cobro.
 * Índices 1-based. `hiddenConAiu` = columna oculta con total fila con AIU/IVA.
 */
export function preciosExportColumnMap(incluirVuCobro) {
  if (incluirVuCobro) {
    return {
      conCobro: true,
      cols: 10,
      item: 1,
      descripcion: 2,
      und: 3,
      cantidad: 4,
      vuCobro: 5,
      totalVuCobro: 6,
      vuMo: 7,
      totalAntes: 8,
      deltaCosto: 9,
      deltaValor: 10,
      hiddenConAiu: 11,
      headers: [
        'Ítem',
        'Descripción',
        'Und',
        'Cantidad',
        'VU Cobro',
        'Valor Total\nVU Cobro',
        'VU Costo M.O.',
        'Valor Total\nAntes AIU/IVA',
        '▲ Costo',
        '▲ Valor Total',
      ],
      widths: [11, 34, 7, 10, 12, 14, 13, 15, 11, 13],
    }
  }
  return {
    conCobro: false,
    cols: 6,
    item: 1,
    descripcion: 2,
    und: 3,
    cantidad: 4,
    vuMo: 5,
    totalAntes: 6,
    hiddenConAiu: 7,
    headers: [
      'Ítem',
      'Descripción',
      'Und',
      'Cantidad',
      'VU Costo M.O.',
      'Valor Total\nAntes AIU/IVA',
    ],
    widths: [12, 42, 8, 12, 14, 18],
  }
}

/**
 * Construye el workbook listo para descargar.
 * @throws Error si validatePreciosExport falla
 */
export function buildPreciosSubcontratistaWorkbook({
  subcontratista = {},
  rows = [],
  drafts = {},
  impuesto,
  generadoEn = new Date(),
  incluirVuCobro = false,
} = {}) {
  const conCobro = !!incluirVuCobro
  const check = validatePreciosExport({
    rows,
    drafts,
    impuesto,
    incluirVuCobro: conCobro,
  })
  if (!check.ok) {
    const err = new Error(check.message)
    err.code = 'PRECIOS_EXPORT_INVALID'
    throw err
  }
  const { lineas, totales, aiu } = check
  const hoy = generadoEn instanceof Date ? generadoEn : new Date()
  const map = preciosExportColumnMap(conCobro)
  const COLS = map.cols

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore'
  wb.created = hoy
  wb.modified = hoy
  wb.title = conCobro
    ? 'Precios pactados — Subcontratista (con VU Cobro)'
    : 'Precios pactados — Subcontratista'
  wb.description = conCobro
    ? 'Soporte interno con VU Cobro y comparativo (no entregar al subcontratista)'
    : 'Soporte contractual de ítems, cantidades y precios pactados'

  const ws = wb.addWorksheet('Precios pactados', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 7 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    properties: { defaultRowHeight: 18 },
  })

  map.widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.getColumn(map.hiddenConAiu).hidden = true
  ws.getColumn(map.hiddenConAiu).width = 14

  // ── Encabezado ──────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, COLS)
  const title = ws.getCell(1, 1)
  title.value = conCobro
    ? 'CLARACORE — PRECIOS PACTADOS (USO INTERNO · CON VU COBRO)'
    : 'CLARACORE — PRECIOS PACTADOS CON SUBCONTRATISTA'
  title.fill = FILL_TITLE
  title.font = FONT_WHITE_BOLD
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  const metaRows = [
    ['Subcontratista (razón social)', subcontratista.razon_social || '—'],
    ['NIT', subcontratista.nit || '—'],
    ['Objeto del contrato', subcontratista.objeto_contrato || '—'],
    ['Fecha de generación', fechaGeneracionTxt(hoy)],
  ]
  metaRows.forEach((pair, idx) => {
    const r = 2 + idx
    ws.mergeCells(r, 2, r, COLS)
    const lab = ws.getCell(r, 1)
    const val = ws.getCell(r, 2)
    lab.value = pair[0]
    val.value = pair[1]
    lab.fill = FILL_META
    val.fill = FILL_META
    lab.font = FONT_META
    val.font = { ...FONT_BODY, size: 11 }
    lab.alignment = { vertical: 'middle' }
    val.alignment = { vertical: 'middle', wrapText: true }
    ws.getRow(r).height = idx === 2 ? 36 : 20
  })
  applyBorderRange(ws, 2, 1, 5, COLS)

  ws.getRow(6).height = 8

  // ── Tabla ───────────────────────────────────────────────────
  const headerRowIdx = 7
  const hr = ws.getRow(headerRowIdx)
  map.headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = h
    cell.fill = FILL_HEADER
    cell.font = FONT_HEADER
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = BORDER_THIN
  })
  hr.height = 36

  const firstDataRow = headerRowIdx + 1
  let r = firstDataRow
  const Lcant = colLetter(map.cantidad)
  const LvuMo = colLetter(map.vuMo)
  const LtotalAntes = colLetter(map.totalAntes)
  const LvuCobro = conCobro ? colLetter(map.vuCobro) : null
  const LtotalCobro = conCobro ? colLetter(map.totalVuCobro) : null
  const LdeltaCosto = conCobro ? colLetter(map.deltaCosto) : null
  const LdeltaValor = conCobro ? colLetter(map.deltaValor) : null
  const Lhidden = colLetter(map.hiddenConAiu)

  for (const L of lineas) {
    const row = ws.getRow(r)
    row.getCell(map.item).value = L.item
    row.getCell(map.descripcion).value = L.descripcion
    row.getCell(map.und).value = L.und
    row.getCell(map.cantidad).value = L.cantidad
    row.getCell(map.cantidad).numFmt = NUM_QTY
    row.getCell(map.vuMo).value = L.vu_costo_mo
    row.getCell(map.vuMo).numFmt = NUM_COP

    setFormula(
      row.getCell(map.totalAntes),
      `ROUND(ROUND(${Lcant}${r},2)*ROUND(${LvuMo}${r},0),0)`,
      L.total_antes_aiu,
      NUM_COP,
    )

    if (conCobro) {
      row.getCell(map.vuCobro).value = L.vu_cobro
      row.getCell(map.vuCobro).numFmt = NUM_COP
      setFormula(
        row.getCell(map.totalVuCobro),
        `ROUND(ROUND(${Lcant}${r},2)*ROUND(${LvuCobro}${r},0),0)`,
        L.total_vu_cobro,
        NUM_COP,
      )
      setFormula(
        row.getCell(map.deltaCosto),
        `ROUND(ROUND(${LvuMo}${r},0)-ROUND(${LvuCobro}${r},0),0)`,
        L.delta_vu,
        NUM_DELTA,
      )
      row.getCell(map.deltaCosto).font = deltaEsRojo(L.delta_vu) ? FONT_DELTA_RED : FONT_DELTA_GREEN
      setFormula(
        row.getCell(map.deltaValor),
        `ROUND(${LtotalAntes}${r}-${LtotalCobro}${r},0)`,
        L.delta_valor_total,
        NUM_DELTA,
      )
      row.getCell(map.deltaValor).font = deltaEsRojo(L.delta_valor_total)
        ? FONT_DELTA_RED
        : FONT_DELTA_GREEN
    }

    setFormula(
      row.getCell(map.hiddenConAiu),
      formulaTotalConAiuExcel(`${Lcant}${r}`, `${LvuMo}${r}`, aiu),
      L.total_con_aiu,
      NUM_COP,
    )

    for (let c = 1; c <= COLS; c += 1) {
      const cell = row.getCell(c)
      const isDelta = conCobro && (c === map.deltaCosto || c === map.deltaValor)
      if (!isDelta) cell.font = FONT_BODY
      cell.border = BORDER_THIN
      cell.alignment = {
        vertical: 'middle',
        wrapText: c === map.descripcion,
        horizontal: c >= map.cantidad ? 'right' : (c === map.und ? 'center' : 'left'),
      }
    }
    row.height = 18
    r += 1
  }

  const lastDataRow = r - 1

  // Conditional formatting ▲ (se actualiza al editar cantidad/precio en Excel)
  if (conCobro && lastDataRow >= firstDataRow) {
    const deltaRefs = [
      `${LdeltaCosto}${firstDataRow}:${LdeltaCosto}${lastDataRow}`,
      `${LdeltaValor}${firstDataRow}:${LdeltaValor}${lastDataRow}`,
    ]
    for (const ref of deltaRefs) {
      ws.addConditionalFormatting({
        ref,
        rules: [
          {
            type: 'cellIs',
            operator: 'greaterThan',
            formulae: ['0'],
            style: { font: { bold: true, color: { argb: 'FFDC2626' } } },
          },
          {
            type: 'cellIs',
            operator: 'lessThanOrEqual',
            formulae: ['0'],
            style: { font: { bold: true, color: { argb: 'FF15803D' } } },
          },
        ],
      })
    }
  }

  // ── Fila de totales (sumatorias económicas) ─────────────────
  const totalsRowIdx = r
  {
    const row = ws.getRow(totalsRowIdx)
    ws.mergeCells(totalsRowIdx, 1, totalsRowIdx, map.cantidad)
    row.getCell(1).value = 'Totales'
    row.getCell(1).font = FONT_TOTALS
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }

    if (conCobro) {
      setFormula(
        row.getCell(map.totalVuCobro),
        `SUM(${LtotalCobro}${firstDataRow}:${LtotalCobro}${lastDataRow})`,
        totales.sumatoria_vu_cobro,
        NUM_COP,
      )
      setFormula(
        row.getCell(map.deltaValor),
        `SUM(${LdeltaValor}${firstDataRow}:${LdeltaValor}${lastDataRow})`,
        totales.sumatoria_delta_valor_total,
        NUM_DELTA,
      )
      row.getCell(map.deltaValor).font = deltaEsRojo(totales.sumatoria_delta_valor_total)
        ? FONT_DELTA_RED
        : FONT_DELTA_GREEN
    }

    setFormula(
      row.getCell(map.totalAntes),
      `SUM(${LtotalAntes}${firstDataRow}:${LtotalAntes}${lastDataRow})`,
      totales.sumatoria_antes_aiu,
      NUM_COP,
    )
    setFormula(
      row.getCell(map.hiddenConAiu),
      `SUM(${Lhidden}${firstDataRow}:${Lhidden}${lastDataRow})`,
      totales.total_general_con_aiu,
      NUM_COP,
    )

    for (let c = 1; c <= COLS; c += 1) {
      const cell = row.getCell(c)
      cell.fill = FILL_TOTALS_ROW
      cell.border = BORDER_THIN
      if (!(conCobro && c === map.deltaValor)) cell.font = FONT_TOTALS
      cell.alignment = {
        vertical: 'middle',
        horizontal: c >= map.cantidad ? 'right' : 'left',
      }
    }
    row.height = 22
  }
  r = totalsRowIdx + 1

  // ── AIU/IVA ─────────────────────────────────────────────────
  r += 1
  ws.mergeCells(r, 1, r, COLS)
  {
    const cell = ws.getCell(r, 1)
    cell.value = 'AIU / IVA pactado (único del subcontratista)'
    cell.fill = FILL_SECTION
    cell.font = FONT_SECTION
    cell.alignment = { vertical: 'middle' }
    applyBorderRange(ws, r, 1, r, COLS)
    ws.getRow(r).height = 22
  }
  r += 1

  const aiuLines = [
    ['Administración (A)', aiu.administracion],
    ['Imprevistos (Í)', aiu.imprevistos],
    ['Utilidad (U)', aiu.utilidad],
    ['IVA sobre Utilidad', aiu.iva_sobre_utilidad],
  ]
  for (const [lab, pts] of aiuLines) {
    ws.mergeCells(r, 2, r, COLS)
    ws.getCell(r, 1).value = lab
    const valCell = ws.getCell(r, 2)
    if (pts == null || !Number.isFinite(Number(pts))) {
      valCell.value = '—'
    } else {
      valCell.value = Number(pts)
      valCell.numFmt = NUM_PCT
    }
    ws.getCell(r, 1).font = FONT_META
    valCell.font = FONT_BODY
    ws.getCell(r, 1).fill = FILL_META
    valCell.fill = FILL_META
    applyBorderRange(ws, r, 1, r, COLS)
    ws.getRow(r).height = 18
    r += 1
  }

  // ── Total general con AIU/IVA (fórmulas) ────────────────────
  r += 1
  const valueColStart = map.totalAntes
  const totAiuLines = [
    {
      lab: 'Sumatoria antes de AIU/IVA',
      formula: `${LtotalAntes}${totalsRowIdx}`,
      result: totales.sumatoria_antes_aiu,
      kind: 'money',
    },
  ]
  if (conCobro) {
    totAiuLines.unshift({
      lab: 'Sumatoria a VU Cobro',
      formula: `${LtotalCobro}${totalsRowIdx}`,
      result: totales.sumatoria_vu_cobro,
      kind: 'money',
    })
    totAiuLines.push({
      lab: 'Diferencia total (antes AIU − VU Cobro)',
      formula: `${LdeltaValor}${totalsRowIdx}`,
      result: totales.sumatoria_delta_valor_total,
      kind: 'delta',
    })
  }
  totAiuLines.push({
    lab: 'Valor correspondiente al AIU/IVA',
    formula: `ROUND(${Lhidden}${totalsRowIdx}-${LtotalAntes}${totalsRowIdx},0)`,
    result: totales.valor_aiu_iva,
    kind: 'money',
  })
  totAiuLines.push({
    lab: 'Total general con AIU/IVA',
    formula: `${Lhidden}${totalsRowIdx}`,
    result: totales.total_general_con_aiu,
    kind: 'money',
    grand: true,
  })

  totAiuLines.forEach((line) => {
    const isGrand = !!line.grand
    ws.mergeCells(r, 1, r, valueColStart - 1)
    ws.getCell(r, 1).value = line.lab
    ws.mergeCells(r, valueColStart, r, COLS)
    const valCell = ws.getCell(r, valueColStart)
    setFormula(
      valCell,
      line.formula,
      line.result,
      line.kind === 'delta' ? NUM_DELTA : NUM_COP,
    )
    if (line.kind === 'delta') {
      valCell.font = deltaEsRojo(line.result) ? FONT_DELTA_RED : FONT_DELTA_GREEN
    }
    for (let c = 1; c <= COLS; c += 1) {
      const cell = ws.getCell(r, c)
      cell.fill = isGrand ? FILL_TOTAL : FILL_META
      if (!(line.kind === 'delta' && c >= valueColStart)) {
        cell.font = isGrand ? FONT_GRAND : FONT_META
      }
      cell.border = BORDER_THIN
      cell.alignment = { vertical: 'middle', horizontal: c >= valueColStart ? 'right' : 'left' }
    }
    ws.getRow(r).height = isGrand ? 24 : 20
    r += 1
  })

  // Pie
  r += 1
  ws.mergeCells(r, 1, r, COLS)
  {
    const sinAiu = !aiu || (
      aiu.administracion == null
      && aiu.imprevistos == null
      && aiu.utilidad == null
      && aiu.iva_sobre_utilidad == null
    )
    const pie = [
      'Documento generado por ClaraCore.',
      conCobro
        ? 'Incluye VU Cobro y comparativo (uso interno; no entregar al subcontratista).'
        : 'No incluye VU Cobro (información interna).',
      'Cantidades redondeadas a 2 decimales; montos COP a pesos enteros (fórmulas ROUND).',
      'Los totales y diferencias son fórmulas: al editar cantidad o precio se recalculan.',
      conCobro
        ? '▲ Costo = VU Costo M.O. − VU Cobro; ▲ Valor Total = Total antes AIU − Total VU Cobro (rojo si el subcontratista es más caro).'
        : null,
    ].filter(Boolean)
    if (sinAiu) {
      pie.push('AIU/IVA no configurado: el total con AIU/IVA coincide con la sumatoria antes de AIU/IVA.')
    }
    ws.getCell(r, 1).value = pie.join(' ')
  }
  ws.getCell(r, 1).font = { size: 8, italic: true, color: { argb: 'FF5A7A85' }, name: 'Calibri' }
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(r).height = conCobro ? 48 : 40

  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: lastDataRow, column: COLS },
  }

  ws.headerFooter = {
    oddFooter: conCobro
      ? '&LClaraCore — Precios (interno · VU Cobro)&RPágina &P de &N'
      : '&LClaraCore — Precios pactados&RPágina &P de &N',
  }

  // Metadatos útiles para pruebas / introspección
  wb.preciosExportMeta = {
    conCobro,
    headerRowIdx,
    firstDataRow,
    lastDataRow,
    totalsRowIdx,
    columnMap: map,
    totales,
    aiu,
  }

  return wb
}

export async function workbookToXlsxBlob(wb) {
  const buffer = await wb.xlsx.writeBuffer()
  let bytes
  if (buffer instanceof Uint8Array) {
    bytes = new Uint8Array(buffer.byteLength)
    bytes.set(buffer)
  } else if (buffer instanceof ArrayBuffer) {
    bytes = new Uint8Array(buffer)
  } else if (ArrayBuffer.isView(buffer)) {
    bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  } else {
    bytes = new Uint8Array(buffer)
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function downloadPreciosSubcontratistaExcel(opts = {}) {
  const wb = buildPreciosSubcontratistaWorkbook(opts)
  const blob = await workbookToXlsxBlob(wb)
  const filename = buildPreciosExportFilename(opts.subcontratista, opts.generadoEn)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    try { a.remove() } catch { /* ignore */ }
    try { URL.revokeObjectURL(url) } catch { /* ignore */ }
  }, 2500)
  return { blob, filename }
}
