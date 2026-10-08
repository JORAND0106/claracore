/**
 * Generación Excel (soporte contractual) — Tab Precios Subcontratistas.
 * Valores calculados = fórmulas vivas (ROUND) enlazadas a cantidad/precio.
 * Opcionalmente incluye VU Cobro + comparativo (solo uso interno).
 *
 * Presentación: encabezado 3 secciones (logo contratista | nombre formato | calidad),
 * bloque de datos contrato/subcontratista, paleta del contrato y alturas al texto.
 */
import ExcelJS from 'exceljs'
import { buildCompareExcelColors } from '../../utils/exportPalette.js'
import {
  dimensionesImagenBuffer,
  excelPxToColWidth,
} from '../presupuesto/presupuestoExportLogos.js'
import {
  buildPreciosExportFilename,
  deltaEsRojo,
  formulaTotalConAiuExcel,
  validatePreciosExport,
} from './preciosSubcontratistaExport.js'

/** Identificación de calidad del formato (sistema CCD ClaraCore). */
export const PRECIOS_FORMATO_CALIDAD = Object.freeze({
  codigo: 'CC-SUB-PRE',
  version: '1.0',
  nombre: 'PRECIOS DE MANO DE OBRA',
  nombreCrudo: 'PRECIOS DE MANO DE OBRA EN CRUDO',
  nombreInterno: 'PRECIOS DE MANO DE OBRA (USO INTERNO · VU COBRO)',
})

const FONT_DELTA_RED = { bold: true, size: 10, color: { argb: 'FFDC2626' }, name: 'Calibri' }
const FONT_DELTA_GREEN = { bold: true, size: 10, color: { argb: 'FF15803D' }, name: 'Calibri' }

const NUM_COP = '"$"#,##0'
const NUM_QTY = '#,##0.00'
const NUM_DELTA = '+#,##0;-#,##0;0'
const NUM_PCT = '0.####" %"'

/** Ancho fijo del logo del contratista en el encabezado (5 cm @ 96 dpi). */
export const LOGO_WIDTH_CM = 5
export const LOGO_WIDTH_PX = Math.round((LOGO_WIDTH_CM * 96) / 2.54) // ≈ 189 px
/** Padding interior en A1 para que el logo no roce el borde ni la sección B–D. */
const LOGO_PAD_PX = 6
const HEADER_ROW_HEIGHT_NO_LOGO = 36

/** Ancho fijo; alto = ancho × (natH/natW). Sin deformar. */
export function sizeLogoFixedWidth(natW, natH, widthPx = LOGO_WIDTH_PX) {
  const width = Math.max(1, Math.round(Number(widthPx) || LOGO_WIDTH_PX))
  const nw = Math.max(1, Number(natW) || width)
  const nh = Math.max(1, Number(natH) || width)
  const height = Math.max(1, Math.round(width * (nh / nw)))
  return { width, height }
}

/** px → puntos tipográficos (altura de fila Excel). */
function pxToRowPoints(px) {
  return Math.max(1, Math.round(Number(px) * (72 / 96)))
}

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function thinBorder(argb) {
  const edge = { style: 'thin', color: { argb } }
  return { top: edge, left: edge, bottom: edge, right: edge }
}

function dashOrValue(v) {
  if (v == null) return '—'
  const s = String(v).trim()
  return s || '—'
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

function fechaCalidadTxt(d) {
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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

function applyBorderRange(ws, r1, c1, r2, c2, border) {
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) {
      ws.getCell(r, c).border = border
    }
  }
}

/** Altura estimada con wrap según ancho aproximado de caracteres Excel. */
export function estimateWrappedRowHeight(text, widthChars, {
  fontSize = 10,
  min = 18,
  max = 96,
  padding = 6,
} = {}) {
  const s = String(text ?? '')
  if (!s) return min
  const charsPerLine = Math.max(6, Math.floor(Number(widthChars) * 1.05) || 12)
  const lines = s.split(/\r?\n/).reduce(
    (acc, part) => acc + Math.max(1, Math.ceil(Math.max(part.length, 1) / charsPerLine)),
    0,
  )
  const linePt = fontSize * 1.35
  return Math.min(max, Math.max(min, Math.ceil(lines * linePt + padding)))
}

function sumColWidths(widths, fromCol, toCol) {
  let w = 0
  for (let c = fromCol; c <= toCol; c += 1) {
    w += Number(widths[c - 1]) || 12
  }
  return w
}

/**
 * Carga logo (data URI o URL) al workbook.
 * @returns {Promise<{ imageId: number, natW: number|null, natH: number|null }|null>}
 */
export async function prepararLogoPreciosWorkbook(wb, logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') return null
  const raw = logoUrl.trim()
  if (!raw) return null
  try {
    let buffer = null
    let ext = 'png'
    if (raw.startsWith('data:image')) {
      const comma = raw.indexOf(',')
      if (comma < 0) return null
      const header = raw.slice(0, comma).toLowerCase()
      let b64 = raw.slice(comma + 1).replace(/\s+/g, '')
      if (!b64 || !header.includes('base64')) return null
      const m = header.match(/^data:image\/([a-z0-9+.-]+)/i)
      if (m) {
        ext = m[1].toLowerCase()
        if (ext === 'jpg') ext = 'jpeg'
        if (ext === 'svg+xml' || ext === 'webp') return null
        if (!['png', 'jpeg', 'gif'].includes(ext)) ext = 'png'
      }
      const binary = atob(b64)
      buffer = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i)
    } else {
      const res = await fetch(raw, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) return null
      const blob = await res.blob()
      buffer = new Uint8Array(await blob.arrayBuffer())
      if (!buffer.length) return null
      if (blob.type.includes('jpeg') || blob.type.includes('jpg')) ext = 'jpeg'
      else if (blob.type.includes('gif')) ext = 'gif'
    }
    const dims = dimensionesImagenBuffer(buffer)
    const imageId = wb.addImage({ buffer, extension: ext })
    return {
      imageId,
      natW: dims?.width ?? null,
      natH: dims?.height ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Mapa de columnas visibles según opción VU Cobro / crudo.
 * Índices 1-based. `hiddenConAiu` = columna oculta con total fila con AIU/IVA (no en crudo).
 */
export function preciosExportColumnMap(incluirVuCobro, { modoCrudo = false } = {}) {
  if (modoCrudo) {
    return {
      conCobro: false,
      modoCrudo: true,
      cols: 6,
      item: 1,
      descripcion: 2,
      und: 3,
      cantidad: 4,
      vuMo: 5,
      totalAntes: 6,
      headers: [
        'Ítem',
        'Descripción',
        'Und',
        'Cantidad',
        'VU Costo M.O.',
        'Valor Total\nAntes AIU/IVA',
      ],
      widths: [12, 42, 8, 12, 16, 18],
    }
  }
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

function nombreFormato(crudo, conCobro) {
  if (crudo) return PRECIOS_FORMATO_CALIDAD.nombreCrudo
  if (conCobro) return PRECIOS_FORMATO_CALIDAD.nombreInterno
  return PRECIOS_FORMATO_CALIDAD.nombre
}

/**
 * Encabezado fijo: A = logo | B:D = título | E…última = calidad.
 * Aplica con ≥4 columnas visibles (6 sin cobro / 10 con cobro).
 */
export function layoutEncabezado(cols) {
  const n = Math.max(4, Number(cols) || 4)
  return {
    leftCol: 1,
    titleStart: 2,
    titleEnd: 4,
    rightStart: 5,
    rightEnd: n,
  }
}

/** Líneas 2 y 4 del bloque: mitad izquierda / mitad derecha. */
function layoutDataSplit(cols) {
  const split = Math.max(2, Math.floor(cols / 2))
  return {
    leftLabel: 1,
    leftValueStart: 2,
    leftValueEnd: split,
    rightLabel: split + 1,
    rightValueStart: split + 2,
    rightValueEnd: cols,
  }
}

/**
 * Primera línea del bloque: A = etiqueta Objeto | B…(n-2) = objeto |
 * penúltima = etiqueta Nº contrato | última = número.
 */
export function layoutPrimeraLineaDatos(cols) {
  const n = Math.max(4, Number(cols) || 4)
  return {
    objetoLabel: 1,
    objetoValueStart: 2,
    objetoValueEnd: n - 2,
    numeroLabel: n - 1,
    numeroValue: n,
  }
}

function styleRange(ws, r, c1, c2, { fill, font, border, align }) {
  for (let c = c1; c <= c2; c += 1) {
    const cell = ws.getCell(r, c)
    if (fill) cell.fill = fill
    if (font) cell.font = font
    if (border) cell.border = border
    if (align) cell.alignment = align
  }
}

function escribirCeldaEtiquetaValor(ws, r, labelCol, valueStart, valueEnd, label, value, theme, widths) {
  const lab = ws.getCell(r, labelCol)
  lab.value = label
  lab.fill = solidFill(theme.metaBg)
  lab.font = { bold: true, size: 9, color: { argb: theme.metaText }, name: 'Calibri' }
  lab.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  lab.border = thinBorder(theme.border)

  if (valueEnd > valueStart) {
    try {
      ws.mergeCells(r, valueStart, r, valueEnd)
    } catch { /* ya fusionado */ }
  }
  const val = ws.getCell(r, valueStart)
  val.value = value
  val.fill = solidFill(theme.rowBg)
  val.font = { size: 10, color: { argb: theme.rowText }, name: 'Calibri' }
  val.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  styleRange(ws, r, valueStart, valueEnd, {
    fill: solidFill(theme.rowBg),
    font: { size: 10, color: { argb: theme.rowText }, name: 'Calibri' },
    border: thinBorder(theme.border),
    align: { vertical: 'middle', horizontal: 'left', wrapText: true },
  })

  const wLabel = sumColWidths(widths, labelCol, labelCol)
  const wVal = sumColWidths(widths, valueStart, valueEnd)
  const hLab = estimateWrappedRowHeight(label, wLabel, { fontSize: 9, min: 20, max: 72 })
  const hVal = estimateWrappedRowHeight(value, wVal, { fontSize: 10, min: 20, max: 96 })
  return Math.max(hLab, hVal)
}

/**
 * Construye el workbook listo para descargar.
 * @throws Error si validatePreciosExport falla
 */
export async function buildPreciosSubcontratistaWorkbook({
  subcontratista = {},
  contrato = {},
  rows = [],
  drafts = {},
  impuesto,
  generadoEn = new Date(),
  incluirVuCobro = false,
  modoCrudo = false,
  logoImageId: logoImageIdPrefetched = null,
} = {}) {
  const crudo = !!modoCrudo
  const conCobro = !crudo && !!incluirVuCobro
  const check = validatePreciosExport({
    rows,
    drafts,
    impuesto,
    incluirVuCobro: conCobro,
    modoCrudo: crudo,
  })
  if (!check.ok) {
    const err = new Error(check.message)
    err.code = 'PRECIOS_EXPORT_INVALID'
    throw err
  }
  const { lineas, totales, aiu } = check
  const hoy = generadoEn instanceof Date ? generadoEn : new Date()
  const map = preciosExportColumnMap(conCobro, { modoCrudo: crudo })
  const COLS = map.cols
  const theme = buildCompareExcelColors(contrato?.export_palette)
  const border = thinBorder(theme.border)
  const fillTitle = solidFill(theme.title)
  const fillMeta = solidFill(theme.metaBg)
  const fillHeader = solidFill(theme.headerBg)
  const fillSection = solidFill(theme.metaBg)
  const fillTotal = solidFill(theme.totalBg)
  const fillTotalsRow = solidFill(theme.totalBg)
  const fillRow = solidFill(theme.rowBg)
  const fillRowAlt = solidFill(theme.rowBgAlt)

  const FONT_TITLE = { bold: true, size: 13, color: { argb: theme.titleText }, name: 'Calibri' }
  const FONT_META = { bold: true, size: 9, color: { argb: theme.metaText }, name: 'Calibri' }
  const FONT_HEADER = { bold: true, size: 10, color: { argb: theme.headerText }, name: 'Calibri' }
  const FONT_BODY = { size: 10, color: { argb: theme.rowText }, name: 'Calibri' }
  const FONT_SECTION = { bold: true, size: 11, color: { argb: theme.metaText }, name: 'Calibri' }
  const FONT_TOTALS = { bold: true, size: 10, color: { argb: theme.totalText }, name: 'Calibri' }
  const FONT_GRAND = { bold: true, size: 12, color: { argb: theme.totalText }, name: 'Calibri' }
  const FONT_CALIDAD = { bold: true, size: 9, color: { argb: theme.titleText }, name: 'Calibri' }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore'
  wb.created = hoy
  wb.modified = hoy
  wb.title = crudo
    ? 'Precios en crudo — Subcontratista (diligenciar VU Costo M.O.)'
    : conCobro
      ? 'Precios pactados — Subcontratista (con VU Cobro)'
      : 'Precios pactados — Subcontratista'
  wb.description = crudo
    ? 'Listado de ítems sin precios para diligenciar VU Costo M.O. en Excel'
    : conCobro
      ? 'Soporte interno con VU Cobro y comparativo (no entregar al subcontratista)'
      : 'Soporte contractual de ítems, cantidades y precios pactados'

  // Encabezado (1) + bloque datos (4) + spacer (1) + header tabla → ySplit dinámico
  const headerBandRows = 1
  const dataBlockRows = 4
  const spacerAfterMeta = 1
  const headerRowIdx = headerBandRows + dataBlockRows + spacerAfterMeta + 1

  const ws = wb.addWorksheet('Precios pactados', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: headerRowIdx }],
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
  if (map.hiddenConAiu) {
    ws.getColumn(map.hiddenConAiu).hidden = true
    ws.getColumn(map.hiddenConAiu).width = 14
  }

  let logoDesc = null
  if (logoImageIdPrefetched != null && typeof logoImageIdPrefetched === 'object') {
    logoDesc = logoImageIdPrefetched
  } else if (typeof logoImageIdPrefetched === 'number') {
    logoDesc = { imageId: logoImageIdPrefetched, natW: null, natH: null }
  } else {
    logoDesc = await prepararLogoPreciosWorkbook(wb, contrato?.logo_contratista)
  }
  const logoImageId = logoDesc?.imageId ?? null

  // ── Encabezado 3 secciones: A | B:D | E…última ──────────────
  const lay = layoutEncabezado(COLS)
  const titulo = nombreFormato(crudo, conCobro)

  // El logo mide 5 cm de ancho: la columna A se ensancha (no se reduce el logo).
  let logoSize = null
  if (logoImageId != null) {
    logoSize = sizeLogoFixedWidth(logoDesc.natW, logoDesc.natH, LOGO_WIDTH_PX)
    const colANeed = excelPxToColWidth(logoSize.width + LOGO_PAD_PX * 2)
    const curA = Number(ws.getColumn(1).width) || map.widths[0] || 12
    if (curA < colANeed) {
      ws.getColumn(1).width = colANeed
      map.widths[0] = colANeed
    }
  }

  styleRange(ws, 1, 1, COLS, {
    fill: fillTitle,
    border,
    align: { vertical: 'middle', horizontal: 'center', wrapText: true },
  })

  // A1 (logo) — sin merge; B1:D1 título; E1:última calidad
  try { ws.mergeCells(1, lay.titleStart, 1, lay.titleEnd) } catch { /* ignore */ }
  if (lay.rightStart <= lay.rightEnd) {
    try { ws.mergeCells(1, lay.rightStart, 1, lay.rightEnd) } catch { /* ignore */ }
  }

  ws.getCell(1, lay.leftCol).value = ''
  const titleCell = ws.getCell(1, lay.titleStart)
  titleCell.value = titulo
  titleCell.font = FONT_TITLE
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

  const calidadTxt = [
    PRECIOS_FORMATO_CALIDAD.codigo,
    `Versión ${PRECIOS_FORMATO_CALIDAD.version}`,
    `Fecha ${fechaCalidadTxt(hoy)}`,
  ].join('\n')
  const calidadCell = ws.getCell(1, lay.rightStart)
  calidadCell.value = calidadTxt
  calidadCell.font = FONT_CALIDAD
  calidadCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

  const textHeaderH = Math.max(
    HEADER_ROW_HEIGHT_NO_LOGO,
    estimateWrappedRowHeight(titulo, sumColWidths(map.widths, lay.titleStart, lay.titleEnd), {
      fontSize: 13,
      min: HEADER_ROW_HEIGHT_NO_LOGO,
      max: 72,
    }),
    estimateWrappedRowHeight(calidadTxt, sumColWidths(map.widths, lay.rightStart, lay.rightEnd), {
      fontSize: 9,
      min: HEADER_ROW_HEIGHT_NO_LOGO,
      max: 72,
    }),
  )

  if (logoImageId != null && logoSize) {
    // Anclado en A1; ancho 5 cm, alto proporcional — no invade B–D ni calidad.
    const padFrac = Math.min(0.08, LOGO_PAD_PX / Math.max(logoSize.width, 1))
    ws.addImage(logoImageId, {
      tl: { col: padFrac, row: 0.08 },
      ext: { width: logoSize.width, height: logoSize.height },
    })
    ws.getRow(1).height = Math.max(textHeaderH, pxToRowPoints(logoSize.height + LOGO_PAD_PX * 2))
  } else {
    ws.getRow(1).height = textHeaderH
  }

  // ── Bloque de datos (4 líneas) ──────────────────────────────
  const split = layoutDataSplit(COLS)
  const line1 = layoutPrimeraLineaDatos(COLS)
  const numContrato = dashOrValue(contrato?.numero ?? contrato?.numero_contrato)
  const objetoContrato = dashOrValue(contrato?.objeto)
  const razon = dashOrValue(subcontratista?.razon_social)
  const nit = dashOrValue(subcontratista?.nit)
  const objetoSub = dashOrValue(subcontratista?.objeto_contrato)
  const contactoNombre = dashOrValue(subcontratista?.nombre_contacto)
  const contactoTel = dashOrValue(subcontratista?.telefono)

  // Línea 1: Objeto (A + B…n-2) | Número de contrato (penúltima + última)
  let h = escribirCeldaEtiquetaValor(
    ws, 2, line1.objetoLabel, line1.objetoValueStart, line1.objetoValueEnd,
    'Objeto del contrato', objetoContrato, theme, map.widths,
  )
  h = Math.max(h, escribirCeldaEtiquetaValor(
    ws, 2, line1.numeroLabel, line1.numeroValue, line1.numeroValue,
    'Número de contrato', numContrato, theme, map.widths,
  ))
  ws.getRow(2).height = h

  // Línea 2: Subcontratista | NIT
  h = escribirCeldaEtiquetaValor(
    ws, 3, split.leftLabel, split.leftValueStart, split.leftValueEnd,
    'Subcontratista', razon, theme, map.widths,
  )
  h = Math.max(h, escribirCeldaEtiquetaValor(
    ws, 3, split.rightLabel, split.rightValueStart, split.rightValueEnd,
    'NIT', nit, theme, map.widths,
  ))
  ws.getRow(3).height = h

  // Línea 3: Objeto subcontratista (línea completa)
  h = escribirCeldaEtiquetaValor(
    ws, 4, 1, 2, COLS,
    'Objeto del contrato (subcontratista)', objetoSub, theme, map.widths,
  )
  ws.getRow(4).height = h

  // Línea 4: Nombre y teléfono de contacto (misma fila, etiquetas diferenciadas)
  h = escribirCeldaEtiquetaValor(
    ws, 5, split.leftLabel, split.leftValueStart, split.leftValueEnd,
    'Nombre de contacto', contactoNombre, theme, map.widths,
  )
  h = Math.max(h, escribirCeldaEtiquetaValor(
    ws, 5, split.rightLabel, split.rightValueStart, split.rightValueEnd,
    'Teléfono', contactoTel, theme, map.widths,
  ))
  ws.getRow(5).height = h

  ws.getRow(6).height = 8

  // ── Tabla ───────────────────────────────────────────────────
  const hr = ws.getRow(headerRowIdx)
  map.headers.forEach((headerTxt, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = headerTxt
    cell.fill = fillHeader
    cell.font = FONT_HEADER
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = border
  })
  hr.height = Math.max(
    32,
    ...map.headers.map((headerTxt, i) => estimateWrappedRowHeight(
      headerTxt,
      map.widths[i] || 12,
      { fontSize: 10, min: 32, max: 48 },
    )),
  )

  const firstDataRow = headerRowIdx + 1
  let r = firstDataRow
  const Lcant = colLetter(map.cantidad)
  const LvuMo = colLetter(map.vuMo)
  const LtotalAntes = colLetter(map.totalAntes)
  const LvuCobro = conCobro ? colLetter(map.vuCobro) : null
  const LtotalCobro = conCobro ? colLetter(map.totalVuCobro) : null
  const LdeltaCosto = conCobro ? colLetter(map.deltaCosto) : null
  const LdeltaValor = conCobro ? colLetter(map.deltaValor) : null
  const Lhidden = map.hiddenConAiu ? colLetter(map.hiddenConAiu) : null

  for (const L of lineas) {
    const row = ws.getRow(r)
    const rowFill = ((r - firstDataRow) % 2 === 0) ? fillRow : fillRowAlt
    const rowTextArgb = ((r - firstDataRow) % 2 === 0) ? theme.rowText : theme.rowTextAlt
    const fontBody = { ...FONT_BODY, color: { argb: rowTextArgb } }

    row.getCell(map.item).value = L.item
    row.getCell(map.descripcion).value = L.descripcion
    row.getCell(map.und).value = L.und
    row.getCell(map.cantidad).value = L.cantidad
    row.getCell(map.cantidad).numFmt = NUM_QTY
    if (crudo) {
      row.getCell(map.vuMo).value = null
    } else {
      row.getCell(map.vuMo).value = L.vu_costo_mo
    }
    row.getCell(map.vuMo).numFmt = NUM_COP

    setFormula(
      row.getCell(map.totalAntes),
      crudo
        ? `ROUND(ROUND(${Lcant}${r},2)*IF(${LvuMo}${r}="",0,ROUND(${LvuMo}${r},0)),0)`
        : `ROUND(ROUND(${Lcant}${r},2)*ROUND(${LvuMo}${r},0),0)`,
      crudo ? 0 : L.total_antes_aiu,
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

    if (!crudo && map.hiddenConAiu) {
      setFormula(
        row.getCell(map.hiddenConAiu),
        formulaTotalConAiuExcel(`${Lcant}${r}`, `${LvuMo}${r}`, aiu),
        L.total_con_aiu,
        NUM_COP,
      )
    }

    for (let c = 1; c <= COLS; c += 1) {
      const cell = row.getCell(c)
      const isDelta = conCobro && (c === map.deltaCosto || c === map.deltaValor)
      if (!isDelta) cell.font = fontBody
      cell.fill = rowFill
      cell.border = border
      cell.alignment = {
        vertical: 'middle',
        wrapText: c === map.descripcion || c === map.item,
        horizontal: c >= map.cantidad ? 'right' : (c === map.und ? 'center' : 'left'),
      }
    }
    const descH = estimateWrappedRowHeight(
      L.descripcion,
      map.widths[map.descripcion - 1] || 34,
      { fontSize: 10, min: 18, max: 90 },
    )
    row.height = descH
    r += 1
  }

  const lastDataRow = r - 1

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

  // ── Fila de totales ─────────────────────────────────────────
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
      totales.sumatoria_antes_aiu || 0,
      NUM_COP,
    )
    if (!crudo && map.hiddenConAiu && Lhidden) {
      setFormula(
        row.getCell(map.hiddenConAiu),
        `SUM(${Lhidden}${firstDataRow}:${Lhidden}${lastDataRow})`,
        totales.total_general_con_aiu,
        NUM_COP,
      )
    }

    for (let c = 1; c <= COLS; c += 1) {
      const cell = row.getCell(c)
      cell.fill = fillTotalsRow
      cell.border = border
      if (!(conCobro && c === map.deltaValor)) cell.font = FONT_TOTALS
      cell.alignment = {
        vertical: 'middle',
        horizontal: c >= map.cantidad ? 'right' : 'left',
      }
    }
    row.height = 22
  }
  r = totalsRowIdx + 1

  // ── AIU/IVA (no aplica al archivo en crudo) ─────────────────
  if (!crudo) {
    r += 1
    ws.mergeCells(r, 1, r, COLS)
    {
      const cell = ws.getCell(r, 1)
      cell.value = 'AIU / IVA pactado (único del subcontratista)'
      cell.fill = fillSection
      cell.font = FONT_SECTION
      cell.alignment = { vertical: 'middle' }
      applyBorderRange(ws, r, 1, r, COLS, border)
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
      ws.getCell(r, 1).fill = fillMeta
      valCell.fill = fillMeta
      applyBorderRange(ws, r, 1, r, COLS, border)
      ws.getRow(r).height = 18
      r += 1
    }

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
        cell.fill = isGrand ? fillTotal : fillMeta
        if (!(line.kind === 'delta' && c >= valueColStart)) {
          cell.font = isGrand ? FONT_GRAND : FONT_META
        }
        cell.border = border
        cell.alignment = { vertical: 'middle', horizontal: c >= valueColStart ? 'right' : 'left' }
      }
      ws.getRow(r).height = isGrand ? 24 : 20
      r += 1
    })
  }

  // Pie
  r += 1
  ws.mergeCells(r, 1, r, COLS)
  {
    const sinAiu = !crudo && (!aiu || (
      aiu.administracion == null
      && aiu.imprevistos == null
      && aiu.utilidad == null
      && aiu.iva_sobre_utilidad == null
    ))
    const pie = crudo
      ? [
        'Documento generado por ClaraCore.',
        'Exportación en crudo: sin precios (ni del subcontratista ni VU Cobro del contrato).',
        'Diligencie la columna VU Costo M.O.; el Valor Total Antes AIU/IVA y la fila Totales se recalculan con fórmulas ROUND.',
        'Cantidades a 2 decimales; montos COP a pesos enteros.',
      ]
      : [
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
  const pieW = sumColWidths(map.widths, 1, COLS)
  ws.getRow(r).height = estimateWrappedRowHeight(ws.getCell(r, 1).value, pieW, {
    fontSize: 8,
    min: crudo || conCobro ? 48 : 40,
    max: 72,
  })

  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: lastDataRow, column: COLS },
  }

  ws.headerFooter = {
    oddFooter: crudo
      ? '&LClaraCore — Precios en crudo&RPágina &P de &N'
      : conCobro
        ? '&LClaraCore — Precios (interno · VU Cobro)&RPágina &P de &N'
        : '&LClaraCore — Precios pactados&RPágina &P de &N',
  }

  wb.preciosExportMeta = {
    conCobro,
    modoCrudo: crudo,
    headerRowIdx,
    firstDataRow,
    lastDataRow,
    totalsRowIdx,
    columnMap: map,
    totales,
    aiu,
    formatoCalidad: { ...PRECIOS_FORMATO_CALIDAD },
    theme,
    hasLogo: logoImageId != null,
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
  const wb = await buildPreciosSubcontratistaWorkbook(opts)
  const blob = await workbookToXlsxBlob(wb)
  const filename = buildPreciosExportFilename(opts.subcontratista, opts.generadoEn, {
    modoCrudo: !!opts.modoCrudo,
  })
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
