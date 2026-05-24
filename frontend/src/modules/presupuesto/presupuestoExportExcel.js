import ExcelJS from 'exceljs'

const PASTEL_TITLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEFF8' } }
const PASTEL_META = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF7FB' } }
const PASTEL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5F4FA' } }
const PASTEL_TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1EEF7' } }
const COP_NUM_FMT = '"$"#,##0'
const QTY_NUM_FMT = '#,##0.00'
const TITLE_ROW_HEIGHT = 54
const TITLE_ROW_HEIGHT_NO_LOGO = 28

const BORDER_OUTLINE = { style: 'thin', color: { argb: 'FF64748B' } }
const BORDER_VERT = { style: 'thin', color: { argb: 'FF94A3B8' } }
const BORDER_ROW = { style: 'dotted', color: { argb: 'FFCBD5E1' } }

function safeStr(v) {
  if (v == null) return ''
  return String(v)
}

function safeSheetName(raw, fallback = 'Item') {
  let s = safeStr(raw || fallback).replace(/[\\/*?:\[\]]/g, ' ').trim()
  if (!s) s = fallback
  if (s.length > 31) s = s.slice(0, 31)
  return s
}

function sheetFormulaRef(sheetName) {
  const escaped = String(sheetName).replace(/'/g, "''")
  return `'${escaped}'`
}

function itemMapKey(capitulo, item) {
  return `${safeStr(capitulo)}\x1e${safeStr(item)}`
}

function aplicarPaginaHorizontal(ws) {
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.45,
      bottom: 0.52,
      header: 0.25,
      footer: 0.42,
    },
  }
}

/** Pie de página impreso: logo ClaraCore (contenedor fijo) + texto del contrato. */
function aplicarPiePaginaClaraCore(ws, claraLogoImageId, contratoLabel) {
  const label = safeStr(contratoLabel || '—').trim() || '—'
  const texto = `Producto ClaraCore para el contrato ${label}`
  const pie = claraLogoImageId != null
    ? `&L&G  ${texto}&R&P de &N`
    : `&C${texto}&R&P de &N`
  ws.headerFooter.oddFooter = pie
  ws.headerFooter.evenFooter = pie
  ws.headerFooter.firstFooter = pie
  if (claraLogoImageId != null) {
    // Contenedor fijo 88×32 pt; imagen ~10% mayor que tamaño base previo, centrada en el slot &G
    ws.headerFooter.images = {
      G: { imageId: claraLogoImageId, width: 88, height: 32 },
    }
  }
}

async function cargarLogoClaraCore(wb) {
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/CLARA.CORE.png`
    : '/CLARA.CORE.png'
  return prepararLogoWorkbook(wb, url)
}

async function prepararLogoWorkbook(wb, logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') return null
  try {
    if (logoUrl.startsWith('data:image')) {
      const m = logoUrl.match(/^data:image\/(\w+);base64,(.+)$/i)
      if (!m) return null
      let ext = m[1].toLowerCase()
      if (ext === 'jpg') ext = 'jpeg'
      if (!['png', 'jpeg', 'gif'].includes(ext)) ext = 'png'
      const binary = atob(m[2])
      const buffer = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i)
      return wb.addImage({ buffer, extension: ext })
    }
    const res = await fetch(logoUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    const buffer = await blob.arrayBuffer()
    let ext = 'png'
    if (blob.type.includes('jpeg') || blob.type.includes('jpg')) ext = 'jpeg'
    else if (blob.type.includes('gif')) ext = 'gif'
    return wb.addImage({ buffer, extension: ext })
  } catch {
    return null
  }
}

function insertarLogoEncabezado(ws, logoImageId) {
  if (logoImageId == null) return
  ws.addImage(logoImageId, {
    tl: { col: 0.1, row: 0.1 },
    ext: { width: 112, height: 44 },
  })
}

function estiloMetaCell(cell, { bold = false, align = 'left' } = {}) {
  cell.fill = PASTEL_META
  cell.font = { bold, size: 11, color: { argb: 'FF1F4E70' } }
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true }
}

function estiloMetaCellCuadricula(cell, { bold = false, align = 'left' } = {}) {
  estiloMetaCell(cell, { bold, align })
  cell.border = {
    top: BORDER_OUTLINE,
    left: BORDER_VERT,
    bottom: BORDER_VERT,
    right: BORDER_VERT,
  }
}

function bordeCeldaTabla(cell, { esHeader = false, esTotal = false, esUltimaFila = false } = {}) {
  cell.border = {
    top: esHeader || esTotal ? BORDER_OUTLINE : undefined,
    left: BORDER_VERT,
    right: BORDER_VERT,
    bottom: esUltimaFila || esTotal ? BORDER_OUTLINE : BORDER_ROW,
  }
}

function aplicarBordesTabla(ws, fromRow, toRow, colCount) {
  for (let r = fromRow; r <= toRow; r += 1) {
    for (let c = 1; c <= colCount; c += 1) {
      bordeCeldaTabla(ws.getCell(r, c), {
        esHeader: r === fromRow,
        esTotal: r === toRow && r > fromRow,
        esUltimaFila: r === toRow,
      })
    }
  }
}

function escribirEncabezadoCompacto(ws, totalCols, titulo, meta, modoLabel, totalRegistros, generatedAt, logoImageId = null, { soloCantidad = false } = {}) {
  const fechaTxt = generatedAt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  const horaTxt = generatedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  const cols = Math.max(totalCols, 7)
  const tieneLogo = logoImageId != null
  const logoSpan = tieneLogo ? 2 : 0
  const titleStart = logoSpan + 1

  const splitContrato = Math.max(2, Math.floor(cols * 0.18))
  const splitContratista = Math.max(splitContrato + 3, Math.floor(cols * 0.58))
  const splitTipo = Math.max(splitContrato + 2, Math.floor(cols * 0.42))

  ws.addRow(new Array(cols).fill(''))
  ws.getRow(1).height = tieneLogo ? TITLE_ROW_HEIGHT : TITLE_ROW_HEIGHT_NO_LOGO

  if (tieneLogo) {
    ws.mergeCells(1, 1, 1, logoSpan)
    ws.getCell(1, 1).fill = PASTEL_TITLE
    insertarLogoEncabezado(ws, logoImageId)
    ws.mergeCells(1, titleStart, 1, cols)
    ws.getCell(1, titleStart).value = titulo
    ws.getCell(1, titleStart).fill = PASTEL_TITLE
    ws.getCell(1, titleStart).font = { bold: true, size: 14, color: { argb: 'FF0F2942' } }
    ws.getCell(1, titleStart).alignment = { horizontal: 'center', vertical: 'middle' }
  } else {
    ws.mergeCells(1, 1, 1, cols)
    ws.getCell(1, 1).value = titulo
    ws.getCell(1, 1).fill = PASTEL_TITLE
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF0F2942' } }
    ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' }
  }

  ws.addRow(new Array(cols).fill(''))
  ws.getCell(2, 1).value = `Contrato: ${meta.numero ?? '—'}`
  ws.getCell(2, splitContrato + 1).value = `Contratista: ${meta.contratista ?? '—'}`
  ws.getCell(2, splitContratista + 1).value = `Generado: ${fechaTxt} ${horaTxt}`
  ws.mergeCells(2, 1, 2, splitContrato)
  ws.mergeCells(2, splitContrato + 1, 2, splitContratista)
  ws.mergeCells(2, splitContratista + 1, 2, cols)
  ws.getRow(2).height = 22
  estiloMetaCell(ws.getCell(2, 1), { bold: true })
  estiloMetaCell(ws.getCell(2, splitContrato + 1), { bold: true })
  estiloMetaCell(ws.getCell(2, splitContratista + 1), { bold: true, align: 'right' })

  ws.addRow(new Array(cols).fill(''))
  ws.getCell(3, 1).value = `Interventoría: ${meta.interventoria ?? '—'}`
  ws.getCell(3, splitContrato + 1).value = `Tipo: ${modoLabel}`
  ws.getCell(3, splitTipo + 1).value = `Registros: ${totalRegistros ?? 0}`
  ws.mergeCells(3, 1, 3, splitContrato)
  ws.mergeCells(3, splitContrato + 1, 3, splitTipo)
  ws.mergeCells(3, splitTipo + 1, 3, cols)
  ws.getRow(3).height = 20
  estiloMetaCell(ws.getCell(3, 1))
  estiloMetaCell(ws.getCell(3, splitContrato + 1))
  estiloMetaCell(ws.getCell(3, splitTipo + 1), { align: 'right' })

  const objeto = meta.objeto ? String(meta.objeto).slice(0, 320) : '—'
  ws.addRow([`Objeto: ${objeto}`])
  ws.mergeCells(4, 1, 4, cols)
  ws.getRow(4).height = Math.min(22 + Math.floor(objeto.length / 80) * 10, 56)
  estiloMetaCell(ws.getCell(4, 1))

  ws.addRow(['TOTALES DEL INFORME', '', '', soloCantidad ? 'Cant. total ítem:' : 'Cantidad total:', '', soloCantidad ? '' : 'Costo directo total:', ''])
  ws.mergeCells(5, 1, 5, 3)
  ws.mergeCells(5, 4, 5, soloCantidad ? cols : 5)
  if (!soloCantidad) ws.mergeCells(5, 6, 5, cols)
  ws.getRow(5).height = 22
  ws.getCell(5, 1).fill = PASTEL_TOTAL
  ws.getCell(5, 1).font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
  ws.getCell(5, 1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getCell(5, 4).fill = PASTEL_TOTAL
  ws.getCell(5, 4).font = { bold: true, size: 11, color: { argb: 'FF1F4E70' } }
  ws.getCell(5, 4).alignment = { vertical: 'middle', horizontal: 'right' }
  if (!soloCantidad) {
    ws.getCell(5, 6).fill = PASTEL_TOTAL
    ws.getCell(5, 6).font = { bold: true, size: 11, color: { argb: 'FF1F4E70' } }
    ws.getCell(5, 6).alignment = { vertical: 'middle', horizontal: 'right' }
  }

  ws.addRow([])

  return { tableHeaderRow: 7, totalsSummaryRow: 5 }
}

function completarFormulasTotales(
  ws,
  totalsSummaryRow,
  totalsFooterRow,
  firstDataRow,
  lastDataRow,
  colDisplayCant = 6,
  colDisplayCosto = 7,
  colSumaCant = null,
  colSumaCosto = null,
) {
  if (lastDataRow < firstDataRow) return
  const srcCant = colSumaCant || colDisplayCant
  const sumCant = `SUM(${colToLetter(srcCant)}${firstDataRow}:${colToLetter(srcCant)}${lastDataRow})`

  ws.getCell(totalsSummaryRow, colDisplayCant).value = { formula: sumCant }
  estiloCantidad(ws.getCell(totalsSummaryRow, colDisplayCant))
  ws.getCell(totalsSummaryRow, colDisplayCant).font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
  ws.getCell(totalsSummaryRow, colDisplayCant).fill = PASTEL_TOTAL

  if (colDisplayCosto != null) {
    const srcCosto = colSumaCosto || colDisplayCosto
    const sumCosto = `SUM(${colToLetter(srcCosto)}${firstDataRow}:${colToLetter(srcCosto)}${lastDataRow})`
    ws.getCell(totalsSummaryRow, colDisplayCosto).value = { formula: sumCosto }
    estiloMoneda(ws.getCell(totalsSummaryRow, colDisplayCosto))
    ws.getCell(totalsSummaryRow, colDisplayCosto).font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
    ws.getCell(totalsSummaryRow, colDisplayCosto).fill = PASTEL_TOTAL
  }

  if (totalsFooterRow) {
    ws.getCell(totalsFooterRow, 1).value = 'TOTALES'
    ws.getCell(totalsFooterRow, colDisplayCant).value = { formula: sumCant }
    ws.getCell(totalsFooterRow, 1).font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
    ws.getCell(totalsFooterRow, 1).fill = PASTEL_TOTAL
    estiloCantidad(ws.getCell(totalsFooterRow, colDisplayCant))
    ws.getCell(totalsFooterRow, colDisplayCant).font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
    ws.getCell(totalsFooterRow, colDisplayCant).fill = PASTEL_TOTAL
    if (colDisplayCosto != null) {
      const srcCosto = colSumaCosto || colDisplayCosto
      ws.getCell(totalsFooterRow, colDisplayCosto).value = {
        formula: `SUM(${colToLetter(srcCosto)}${firstDataRow}:${colToLetter(srcCosto)}${lastDataRow})`,
      }
      estiloMoneda(ws.getCell(totalsFooterRow, colDisplayCosto))
      ws.getCell(totalsFooterRow, colDisplayCosto).font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
      ws.getCell(totalsFooterRow, colDisplayCosto).fill = PASTEL_TOTAL
    }
    const maxCol = Math.max(colDisplayCant, colDisplayCosto || 0)
    for (let c = 1; c <= maxCol; c += 1) {
      bordeCeldaTabla(ws.getCell(totalsFooterRow, c), { esTotal: true })
    }
  }
}

function colToLetter(col) {
  let n = col
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function estiloFilaHeader(row, colCount) {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > colCount) return
    cell.fill = PASTEL_HEADER
    cell.font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    bordeCeldaTabla(cell, { esHeader: true })
  })
  row.height = 22
}

function estiloMoneda(cell) {
  cell.numFmt = COP_NUM_FMT
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
}

function estiloCantidad(cell) {
  cell.numFmt = QTY_NUM_FMT
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
}

function estiloFilaDatos(row, colCount) {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > colCount) return
    cell.alignment = {
      horizontal: colNumber >= 5 ? 'right' : 'left',
      vertical: 'middle',
      wrapText: colNumber <= 3,
    }
    bordeCeldaTabla(cell)
  })
}

function ajustarAnchos(ws, desdeFila, colCount) {
  for (let c = 1; c <= colCount; c += 1) {
    let max = 12
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < desdeFila) return
      const v = row.getCell(c).value
      let s = ''
      if (v && typeof v === 'object' && v.formula) s = '000000000'
      else if (v != null) s = String(v)
      if (s.length > max) max = s.length
    })
    ws.getColumn(c).width = Math.min(Math.max(max * 1.05 + 2, 12), 44)
  }
}

function escribirEncabezadoItemCompacto(ws, startRow, totalCols, itemInfo) {
  const cap = safeStr(itemInfo.capitulo)
  const it = safeStr(itemInfo.item)
  const desc = safeStr(itemInfo.descripcion)
  const und = safeStr(itemInfo.und)
  const cols = Math.max(totalCols, 7)

  ws.getCell(startRow, 1).value = `Capítulo: ${cap}`
  ws.getCell(startRow, 4).value = `Ítem: ${it}`
  ws.getCell(startRow, 6).value = `Unidad: ${und}`
  ws.mergeCells(startRow, 1, startRow, 3)
  ws.mergeCells(startRow, 4, startRow, 5)
  ws.mergeCells(startRow, 6, startRow, cols)
  ws.getRow(startRow).height = 22
  estiloMetaCellCuadricula(ws.getCell(startRow, 1), { bold: true })
  estiloMetaCellCuadricula(ws.getCell(startRow, 4), { bold: true })
  estiloMetaCellCuadricula(ws.getCell(startRow, 6), { bold: true })

  const descRow = startRow + 1
  ws.getCell(descRow, 1).value = `Descripción: ${desc}`
  ws.mergeCells(descRow, 1, descRow, cols)
  ws.getRow(descRow).height = Math.min(22 + Math.floor(desc.length / 70) * 10, 48)
  estiloMetaCellCuadricula(ws.getCell(descRow, 1))

  return descRow + 1
}

function moverHojaAlInicio(wb, sheetName) {
  const idx = wb.worksheets.findIndex((w) => w.name === sheetName)
  if (idx <= 0) return
  const [sheet] = wb.worksheets.splice(idx, 1)
  wb.worksheets.unshift(sheet)
}

const DET_HEADERS = [
  'ID_POL',
  'PK_ID',
  'Tramo',
  'Calzada',
  'Abscisa Inicial',
  'Abscisa Final',
  'Longitud (Área/Long/Nodo)',
  'Ancho',
  'Espesor',
  'Cant. Total',
  'Validación Dep. / Int.',
  'Observación',
]
const TOTAL_COLS_DET = DET_HEADERS.length

function crearHojaItem(wb, itemInfo, idx, usedNames, meta, modoLabel, generatedAt, logoImageId, claraLogoImageId) {
  const baseName = safeSheetName(`${itemInfo.item || 'Item'}_${idx + 1}`, `Item_${idx + 1}`)
  let sheetName = baseName
  let n = 1
  while (usedNames.has(sheetName.toLowerCase())) {
    const suffix = `_${n}`
    sheetName = safeSheetName(`${baseName.slice(0, 31 - suffix.length)}${suffix}`)
    n += 1
  }
  usedNames.add(sheetName.toLowerCase())

  const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] })
  aplicarPaginaHorizontal(ws)
  aplicarPiePaginaClaraCore(ws, claraLogoImageId, meta.numero || meta.contrato)

  const enc = escribirEncabezadoCompacto(
    ws,
    TOTAL_COLS_DET,
    'CLARACORE - PRESUPUESTO - SOPORTE DE CANTIDADES',
    meta,
    `Soporte — ${modoLabel}`,
    (itemInfo.registros || []).length,
    generatedAt,
    logoImageId,
    { soloCantidad: true },
  )

  const tableRow = escribirEncabezadoItemCompacto(ws, enc.tableHeaderRow, TOTAL_COLS_DET, itemInfo)
  ws.addRow(DET_HEADERS)
  estiloFilaHeader(ws.getRow(tableRow), TOTAL_COLS_DET)
  const firstDetRow = tableRow + 1
  const regs = itemInfo.registros || []

  for (const reg of regs) {
    const r = ws.addRow([
      reg.id_pol,
      reg.pk_id,
      reg.tramo,
      reg.calzada,
      reg.abs_inicio,
      reg.abs_final,
      reg.area_long_nod,
      reg.ancho,
      reg.espesor,
      reg.cant_total,
      reg.validacion,
      reg.observacion,
    ])
    estiloCantidad(r.getCell(7))
    estiloCantidad(r.getCell(8))
    estiloCantidad(r.getCell(9))
    estiloCantidad(r.getCell(10))
    estiloFilaDatos(r, TOTAL_COLS_DET)
  }

  let cantTotalRow = null
  const lastDetRow = regs.length > 0 ? firstDetRow + regs.length - 1 : null

  if (regs.length > 0) {
    cantTotalRow = lastDetRow + 1
    ws.addRow(new Array(TOTAL_COLS_DET).fill(''))
    ws.getCell(cantTotalRow, 1).value = 'TOTAL CANT.'
    ws.getCell(cantTotalRow, 10).value = { formula: `SUM(J${firstDetRow}:J${lastDetRow})` }
    ws.getCell(cantTotalRow, 1).font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
    ws.getCell(cantTotalRow, 1).fill = PASTEL_TOTAL
    estiloCantidad(ws.getCell(cantTotalRow, 10))
    ws.getCell(cantTotalRow, 10).font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
    ws.getCell(cantTotalRow, 10).fill = PASTEL_TOTAL
    completarFormulasTotales(ws, enc.totalsSummaryRow, null, firstDetRow, lastDetRow, 5, null, 10)
    aplicarBordesTabla(ws, tableRow, cantTotalRow, TOTAL_COLS_DET)
  }

  ajustarAnchos(ws, tableRow, TOTAL_COLS_DET)

  return {
    sheetName,
    cantTotalRow,
    key: itemMapKey(itemInfo.capitulo, itemInfo.item),
  }
}

function crearHojaResumen(wb, resumen, itemRefs, meta, modoLabel, totalRegistros, generatedAt, logoImageId, claraLogoImageId) {
  const resumenHeaders = [
    'Capítulo',
    'Ítem',
    'Descripción',
    'Unidad',
    'Valor unitario',
    'Cantidad',
    'Costo directo',
  ]
  const totalColsResumen = resumenHeaders.length
  const wsRes = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] })
  aplicarPaginaHorizontal(wsRes)
  aplicarPiePaginaClaraCore(wsRes, claraLogoImageId, meta.numero || meta.contrato)

  const { tableHeaderRow, totalsSummaryRow } = escribirEncabezadoCompacto(
    wsRes,
    totalColsResumen,
    'CLARACORE - PRESUPUESTO - RESUMEN DE EXPORTACIÓN',
    meta,
    modoLabel,
    totalRegistros,
    generatedAt,
    logoImageId,
  )

  wsRes.addRow(resumenHeaders)
  estiloFilaHeader(wsRes.getRow(tableHeaderRow), totalColsResumen)

  const firstDataRow = tableHeaderRow + 1
  let rowNum = firstDataRow

  for (const row of resumen) {
    const r = wsRes.addRow([
      row.capitulo,
      row.item,
      row.descripcion,
      row.und,
      Math.round(Number(row.vlr_unitario) || 0),
      null,
      null,
    ])
    estiloMoneda(r.getCell(5))

    const ref = itemRefs.get(itemMapKey(row.capitulo, row.item))
    if (ref?.cantTotalRow) {
      r.getCell(6).value = {
        formula: `${sheetFormulaRef(ref.sheetName)}!J${ref.cantTotalRow}`,
      }
    } else {
      r.getCell(6).value = 0
    }
    estiloCantidad(r.getCell(6))

    r.getCell(7).value = { formula: `ROUND(E${rowNum}*F${rowNum},0)` }
    estiloMoneda(r.getCell(7))
    estiloFilaDatos(r, totalColsResumen)
    rowNum += 1
  }

  const lastDataRow = resumen.length > 0 ? firstDataRow + resumen.length - 1 : firstDataRow - 1
  if (resumen.length > 0) {
    const totalsFooterRow = lastDataRow + 1
    wsRes.addRow(new Array(totalColsResumen).fill(''))
    completarFormulasTotales(wsRes, totalsSummaryRow, totalsFooterRow, firstDataRow, lastDataRow)
    aplicarBordesTabla(wsRes, tableHeaderRow, totalsFooterRow, totalColsResumen)
  }

  ajustarAnchos(wsRes, tableHeaderRow, totalColsResumen)
  return wsRes
}

/**
 * @param {object} payload respuesta POST /presupuesto/{id}/exportar-informe
 * @param {object|null} metaContrato GET /contratos/{id}
 * @param {number|string} contratoId
 */
export async function downloadPresupuestoInformeExcel(payload, metaContrato, contratoId, filename) {
  const resumen = Array.isArray(payload?.resumen) ? payload.resumen : []
  const items = Array.isArray(payload?.items) ? payload.items : []
  const modoLabel = payload?.modo_label || 'Presupuesto'
  const generatedAt = new Date()
  const meta = metaContrato || {}

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore · Presupuesto'

  const logoImageId = await prepararLogoWorkbook(wb, meta.logo_contratista)
  const claraLogoImageId = await cargarLogoClaraCore(wb)
  const contratoLabel = meta.numero || meta.contrato || String(contratoId ?? '')

  const usedNames = new Set(['resumen'])
  const itemRefs = new Map()

  items.forEach((itemInfo, idx) => {
    const ref = crearHojaItem(wb, itemInfo, idx, usedNames, { ...meta, contrato: contratoLabel }, modoLabel, generatedAt, logoImageId, claraLogoImageId)
    if (ref.cantTotalRow) itemRefs.set(ref.key, ref)
  })

  crearHojaResumen(
    wb,
    resumen,
    itemRefs,
    { ...meta, contrato: contratoLabel },
    modoLabel,
    payload?.total_registros ?? 0,
    generatedAt,
    logoImageId,
    claraLogoImageId,
  )

  moverHojaAlInicio(wb, 'Resumen')

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = payload?.modo === 'obra_ejecutada' ? 'obra_ejecutada' : 'presupuesto_obra'
  a.download = filename || `presupuesto_${slug}_${contratoId ?? 'NA'}_${generatedAt.toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
