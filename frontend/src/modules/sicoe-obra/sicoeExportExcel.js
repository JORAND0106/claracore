/**
 * Exportación Excel de registros SICOE Obra (cliente).
 *
 * Excel repara y descarta estilos si el OOXML trae celdas numéricas inválidas
 * (`NaN` / `Infinity`) u otros valores no escalares mal serializados. Aquí se
 * normaliza cada celda y el buffer de descarga antes de generar el .xlsx.
 */
import ExcelJS from 'exceljs'

/** Límite práctico de texto por celda en Excel. */
export const SICOE_EXCEL_MAX_CELL_CHARS = 32767

/** Caracteres ilegales en XML 1.0 (excepto TAB/LF/CR). */
const XML_ILLEGAL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

/**
 * Normaliza un valor de celda para OOXML válido y estable en Excel de escritorio.
 * - null/undefined → ''
 * - number no finito (NaN/Infinity) → ''
 * - boolean → 'Sí' / 'No'
 * - Date → ISO date (yyyy-mm-dd)
 * - object/array → JSON compacto
 * - string → sin controles XML ilegales, truncado a 32767
 */
export function sicoeExcelCellValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : ''
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'bigint') {
    const n = Number(value)
    return Number.isFinite(n) ? n : String(value)
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'object') {
    try {
      const s = JSON.stringify(value)
      return _sanitizeText(s == null ? '' : s)
    } catch {
      return ''
    }
  }
  return _sanitizeText(String(value))
}

function _sanitizeText(s) {
  let out = s.replace(XML_ILLEGAL_CHARS_RE, '')
  if (out.length > SICOE_EXCEL_MAX_CELL_CHARS) {
    out = out.slice(0, SICOE_EXCEL_MAX_CELL_CHARS)
  }
  return out
}

/**
 * Construye el workbook con el layout institucional (encabezado + grilla).
 * `bodyRows` debe venir ya mapeado a columnas; aquí se vuelve a sanitizar.
 */
export function buildSicoeRegistrosWorkbook({
  meta = {},
  headers = [],
  bodyRows = [],
  generadoEn = new Date(),
} = {}) {
  const hoy = generadoEn instanceof Date ? generadoEn : new Date()
  const fechaTxt = hoy.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const horaTxt = hoy.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const totalCols = Math.max(headers.length, 6)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore'
  wb.created = hoy
  wb.modified = hoy

  const ws = wb.addWorksheet('SICOE Obra - Registros', {
    views: [{ showGridLines: false }],
  })

  ws.addRow(['CLARACORE - SICOE OBRA - EXPORTACION DE REGISTROS'])
  ws.addRow([
    `Contrato: ${sicoeExcelCellValue(meta.numero || '')}`,
    '',
    '',
    '',
    '',
    `Generado: ${fechaTxt} ${horaTxt}`,
  ])
  ws.addRow([`Contratista: ${sicoeExcelCellValue(meta.contratista || '')}`])
  ws.addRow([`Interventoria: ${sicoeExcelCellValue(meta.interventoria || '')}`])
  ws.addRow([`Objeto: ${sicoeExcelCellValue(meta.objeto || '')}`])
  ws.addRow([])
  ws.addRow(headers.map((h) => sicoeExcelCellValue(h)))
  for (const row of bodyRows) {
    const cells = Array.isArray(row) ? row : []
    ws.addRow(cells.map((c) => sicoeExcelCellValue(c)))
  }

  ws.mergeCells(1, 1, 1, totalCols)
  ws.mergeCells(3, 1, 3, totalCols)
  ws.mergeCells(4, 1, 4, totalCols)
  ws.mergeCells(5, 1, 5, totalCols)

  for (let c = 1; c <= totalCols; c += 1) {
    ws.getColumn(c).width = c === 1 ? 24 : 18
  }
  ws.getRow(1).height = 28
  ws.getRow(2).height = 22
  ws.getRow(3).height = 20
  ws.getRow(4).height = 20
  ws.getRow(5).height = 20
  ws.getRow(7).height = 22

  const pastelTitle = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDDEFF8' },
  }
  const pastelMeta = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEEF7FB' },
  }
  const pastelHeader = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5F4FA' },
  }

  ws.getCell('A1').fill = pastelTitle
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F2942' } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }

  ws.getCell('A2').fill = pastelMeta
  ws.getCell('F2').fill = pastelMeta
  ws.getCell('A2').font = { bold: true, size: 11, color: { argb: 'FF1F4E70' } }
  ws.getCell('F2').font = { bold: true, size: 11, color: { argb: 'FF1F4E70' } }

  ;['A3', 'A4', 'A5'].forEach((addr) => {
    ws.getCell(addr).fill = pastelMeta
    ws.getCell(addr).font = { bold: true, size: 11, color: { argb: 'FF1F4E70' } }
  })

  ws.getRow(7).eachCell((cell) => {
    cell.fill = pastelHeader
    cell.font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  return wb
}

/** ArrayBuffer / Uint8Array / Buffer → Uint8Array seguro para Blob. */
export function sicoeExcelBufferToUint8Array(buffer) {
  if (buffer == null) return new Uint8Array(0)
  if (buffer instanceof Uint8Array) {
    // Evitar vistas con byteOffset distinto de 0 (Buffer Node / pools).
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer)
  if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }
  return new Uint8Array(buffer)
}

export async function workbookToXlsxBlob(wb) {
  const buffer = await wb.xlsx.writeBuffer()
  const bytes = sicoeExcelBufferToUint8Array(buffer)
  // Copia propia: el ArrayBuffer subyacente no debe compartirse tras revoke.
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function downloadSicoeRegistrosExcel({
  meta,
  headers,
  bodyRows,
  filename,
  generadoEn,
} = {}) {
  const wb = buildSicoeRegistrosWorkbook({ meta, headers, bodyRows, generadoEn })
  const blob = await workbookToXlsxBlob(wb)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'sicoe_obra_registros.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return blob
}
