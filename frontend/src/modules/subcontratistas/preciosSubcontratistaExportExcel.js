/**
 * Generación Excel (soporte contractual) — Tab Precios Subcontratistas.
 * Cliente con ExcelJS; formato profesional listo para anexar al contrato.
 */
import ExcelJS from 'exceljs'
import {
  buildPreciosExportFilename,
  formatPctExport,
  validatePreciosExport,
} from './preciosSubcontratistaExport.js'

const COLS = 7

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
} = {}) {
  const check = validatePreciosExport({ rows, drafts, impuesto })
  if (!check.ok) {
    const err = new Error(check.message)
    err.code = 'PRECIOS_EXPORT_INVALID'
    throw err
  }
  const { lineas, totales, aiu } = check
  const hoy = generadoEn instanceof Date ? generadoEn : new Date()

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore'
  wb.created = hoy
  wb.modified = hoy
  wb.title = 'Precios pactados — Subcontratista'
  wb.description = 'Soporte contractual de ítems, cantidades y precios pactados'

  const ws = wb.addWorksheet('Precios pactados', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 7 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    properties: { defaultRowHeight: 18 },
  })

  const widths = [12, 42, 8, 12, 16, 18, 18]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── Encabezado ──────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, COLS)
  const title = ws.getCell(1, 1)
  title.value = 'CLARACORE — PRECIOS PACTADOS CON SUBCONTRATISTA'
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

  // fila vacía
  ws.getRow(6).height = 8

  // ── Tabla de ítems ──────────────────────────────────────────
  const headerLabels = [
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

    for (let c = 1; c <= COLS; c += 1) {
      const cell = row.getCell(c)
      cell.font = FONT_BODY
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

  // ── Bloque AIU/IVA ──────────────────────────────────────────
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

  const totLines = [
    ['Sumatoria antes de AIU/IVA', totales.sumatoria_antes_aiu],
    ['Valor correspondiente al AIU/IVA', totales.valor_aiu_iva],
    ['Total general con AIU/IVA', totales.total_general_con_aiu],
  ]
  totLines.forEach(([lab, val], idx) => {
    const isGrand = idx === totLines.length - 1
    ws.mergeCells(r, 1, r, 5)
    ws.getCell(r, 1).value = lab
    ws.mergeCells(r, 6, r, 7)
    ws.getCell(r, 6).value = val
    ws.getCell(r, 6).numFmt = NUM_COP
    for (let c = 1; c <= COLS; c += 1) {
      const cell = ws.getCell(r, c)
      cell.fill = isGrand ? FILL_TOTAL : FILL_META
      cell.font = isGrand
        ? { bold: true, size: 12, color: { argb: 'FF0B5C75' }, name: 'Calibri' }
        : FONT_META
      cell.border = BORDER_THIN
      cell.alignment = { vertical: 'middle', horizontal: c >= 6 ? 'right' : 'left' }
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
      'Documento de soporte contractual generado por ClaraCore.',
      'No incluye VU Cobro (información interna).',
      'Los montos están en COP redondeados a pesos enteros.',
    ]
    if (sinAiu) {
      pie.push('AIU/IVA no configurado al generar este archivo: valores «con AIU/IVA» iguales a los valores antes de AIU/IVA.')
    }
    ws.getCell(r, 1).value = pie.join(' ')
  }
  ws.getCell(r, 1).font = { size: 8, italic: true, color: { argb: 'FF5A7A85' }, name: 'Calibri' }
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(r).height = 36

  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: lastDataRow, column: COLS },
  }

  ws.headerFooter = {
    oddFooter: '&LClaraCore — Precios pactados&RPágina &P de &N',
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
  // Diferir revoke: revoke inmediato provoca net::ERR_FILE_NOT_FOUND en varios navegadores
  // antes de que arranque la descarga del blob.
  setTimeout(() => {
    try { a.remove() } catch { /* ignore */ }
    try { URL.revokeObjectURL(url) } catch { /* ignore */ }
  }, 2500)
  return { blob, filename }
}
