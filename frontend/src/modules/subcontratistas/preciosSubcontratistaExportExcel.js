/**
 * Generación Excel (soporte contractual) — Tab Precios Subcontratistas.
 * Cliente con ExcelJS; formato profesional listo para anexar al contrato.
 * Opcionalmente incluye VU Cobro + comparativo (solo uso interno).
 */
import ExcelJS from 'exceljs'
import {
  buildPreciosExportFilename,
  deltaEsRojo,
  formatDeltaConSigno,
  formatPctExport,
  validatePreciosExport,
} from './preciosSubcontratistaExport.js'

const FILL_TITLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5C75' } }
const FILL_META = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F6F9' } }
const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00AFC5' } }
const FILL_SECTION = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEFF8' } }
const FILL_TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8E4EC' } }

const FONT_WHITE_BOLD = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
const FONT_META = { bold: true, size: 11, color: { argb: 'FF0F2942' }, name: 'Calibri' }
const FONT_HEADER = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
const FONT_BODY = { size: 10, color: { argb: 'FF1A1A1A' }, name: 'Calibri' }
const FONT_SECTION = { bold: true, size: 11, color: { argb: 'FF0B5C75' }, name: 'Calibri' }
const FONT_DELTA_RED = { bold: true, size: 10, color: { argb: 'FFDC2626' }, name: 'Calibri' }
const FONT_DELTA_GREEN = { bold: true, size: 10, color: { argb: 'FF15803D' }, name: 'Calibri' }

const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FF8AB8C4' } },
  left: { style: 'thin', color: { argb: 'FF8AB8C4' } },
  bottom: { style: 'thin', color: { argb: 'FF8AB8C4' } },
  right: { style: 'thin', color: { argb: 'FF8AB8C4' } },
}

const NUM_COP = '"$"#,##0'
const NUM_QTY = '#,##0.####'

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

function paintDeltaCell(cell, delta) {
  const n = Number(delta) || 0
  cell.value = formatDeltaConSigno(n)
  cell.font = deltaEsRojo(n) ? FONT_DELTA_RED : FONT_DELTA_GREEN
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
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
  const COLS = conCobro ? 10 : 7

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

  const widths = conCobro
    ? [11, 34, 7, 10, 13, 14, 11, 14, 16, 16]
    : [12, 42, 8, 12, 16, 18, 18]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

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
  const headerLabels = conCobro
    ? [
      'Ítem',
      'Descripción',
      'Und',
      'Cantidad',
      'VU Cobro',
      'VU Costo M.O.\n(antes AIU/IVA)',
      '▲',
      'Valor Total\na VU Cobro',
      'Valor Total\nantes de AIU/IVA',
      'Valor Total\ncon AIU/IVA',
    ]
    : [
      'Ítem',
      'Descripción',
      'Und',
      'Cantidad',
      'VU Costo M.O.\n(antes AIU/IVA)',
      'Valor Total\nantes de AIU/IVA',
      'Valor Total\ncon AIU/IVA',
    ]
  const headerRowIdx = 7
  const hr = ws.getRow(headerRowIdx)
  headerLabels.forEach((h, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = h
    cell.fill = FILL_HEADER
    cell.font = FONT_HEADER
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = BORDER_THIN
  })
  hr.height = 36

  let r = headerRowIdx + 1
  for (const L of lineas) {
    const row = ws.getRow(r)
    if (conCobro) {
      row.getCell(1).value = L.item
      row.getCell(2).value = L.descripcion
      row.getCell(3).value = L.und
      row.getCell(4).value = L.cantidad
      row.getCell(4).numFmt = NUM_QTY
      row.getCell(5).value = L.vu_cobro
      row.getCell(5).numFmt = NUM_COP
      row.getCell(6).value = L.vu_costo_mo
      row.getCell(6).numFmt = NUM_COP
      paintDeltaCell(row.getCell(7), L.delta_vu)
      row.getCell(8).value = L.total_vu_cobro
      row.getCell(8).numFmt = NUM_COP
      row.getCell(9).value = L.total_antes_aiu
      row.getCell(9).numFmt = NUM_COP
      row.getCell(10).value = L.total_con_aiu
      row.getCell(10).numFmt = NUM_COP
    } else {
      row.getCell(1).value = L.item
      row.getCell(2).value = L.descripcion
      row.getCell(3).value = L.und
      row.getCell(4).value = L.cantidad
      row.getCell(4).numFmt = NUM_QTY
      row.getCell(5).value = L.vu_costo_mo
      row.getCell(5).numFmt = NUM_COP
      row.getCell(6).value = L.total_antes_aiu
      row.getCell(6).numFmt = NUM_COP
      row.getCell(7).value = L.total_con_aiu
      row.getCell(7).numFmt = NUM_COP
    }

    for (let c = 1; c <= COLS; c += 1) {
      const cell = row.getCell(c)
      if (!(conCobro && c === 7)) cell.font = FONT_BODY
      cell.border = BORDER_THIN
      cell.alignment = {
        vertical: 'middle',
        wrapText: c === 2,
        horizontal: c >= 4 ? 'right' : (c === 3 ? 'center' : 'left'),
      }
    }
    row.height = 18
    r += 1
  }

  const lastDataRow = r - 1

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
    ['Administración (A)', formatPctExport(aiu.administracion)],
    ['Imprevistos (Í)', formatPctExport(aiu.imprevistos)],
    ['Utilidad (U)', formatPctExport(aiu.utilidad)],
    ['IVA sobre Utilidad', formatPctExport(aiu.iva_sobre_utilidad)],
  ]
  for (const [lab, val] of aiuLines) {
    ws.mergeCells(r, 2, r, COLS)
    ws.getCell(r, 1).value = lab
    ws.getCell(r, 2).value = val
    ws.getCell(r, 1).font = FONT_META
    ws.getCell(r, 2).font = FONT_BODY
    ws.getCell(r, 1).fill = FILL_META
    ws.getCell(r, 2).fill = FILL_META
    applyBorderRange(ws, r, 1, r, COLS)
    ws.getRow(r).height = 18
    r += 1
  }

  // ── Totales ─────────────────────────────────────────────────
  r += 1
  ws.mergeCells(r, 1, r, COLS)
  {
    const cell = ws.getCell(r, 1)
    cell.value = 'Totales'
    cell.fill = FILL_SECTION
    cell.font = FONT_SECTION
    applyBorderRange(ws, r, 1, r, COLS)
    ws.getRow(r).height = 22
  }
  r += 1

  const totLines = []
  if (conCobro) {
    totLines.push(['Sumatoria a VU Cobro', totales.sumatoria_vu_cobro, 'money'])
    totLines.push(['Diferencia total (antes AIU − VU Cobro)', totales.diferencia_total_vs_cobro, 'delta'])
  }
  totLines.push(['Sumatoria antes de AIU/IVA', totales.sumatoria_antes_aiu, 'money'])
  totLines.push(['Valor correspondiente al AIU/IVA', totales.valor_aiu_iva, 'money'])
  totLines.push(['Total general con AIU/IVA', totales.total_general_con_aiu, 'money'])

  const valueColStart = conCobro ? 8 : 6
  totLines.forEach(([lab, val, kind], idx) => {
    const isGrand = idx === totLines.length - 1
    ws.mergeCells(r, 1, r, valueColStart - 1)
    ws.getCell(r, 1).value = lab
    ws.mergeCells(r, valueColStart, r, COLS)
    const valCell = ws.getCell(r, valueColStart)
    if (kind === 'delta') {
      paintDeltaCell(valCell, val)
    } else {
      valCell.value = val
      valCell.numFmt = NUM_COP
    }
    for (let c = 1; c <= COLS; c += 1) {
      const cell = ws.getCell(r, c)
      cell.fill = isGrand ? FILL_TOTAL : FILL_META
      if (!(kind === 'delta' && c >= valueColStart)) {
        cell.font = isGrand
          ? { bold: true, size: 12, color: { argb: 'FF0B5C75' }, name: 'Calibri' }
          : FONT_META
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
      'Los montos están en COP redondeados a pesos enteros.',
      conCobro
        ? '▲ = VU Costo M.O. − VU Cobro (rojo si el subcontratista es más caro). Totales con AIU/IVA se calculan solo con VU Costo M.O.'
        : null,
    ].filter(Boolean)
    if (sinAiu) {
      pie.push('AIU/IVA no configurado: valores «con AIU/IVA» iguales a los valores antes de AIU/IVA.')
    }
    ws.getCell(r, 1).value = pie.join(' ')
  }
  ws.getCell(r, 1).font = { size: 8, italic: true, color: { argb: 'FF5A7A85' }, name: 'Calibri' }
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(r).height = conCobro ? 42 : 36

  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: lastDataRow, column: COLS },
  }

  ws.headerFooter = {
    oddFooter: conCobro
      ? '&LClaraCore — Precios (interno · VU Cobro)&RPágina &P de &N'
      : '&LClaraCore — Precios pactados&RPágina &P de &N',
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
