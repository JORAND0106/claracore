import ExcelJS from 'exceljs'
import { buildCompareExcelColors } from '../../utils/exportPalette.js'
import {
  ITEM_HEADER_COLS,
  ITEM_HEADER_ENTIDAD_COL,
  ITEM_HEADER_LEFT_END,
  ITEM_HEADER_LEFT_START,
  ITEM_HEADER_TITLE_END,
  ITEM_HEADER_TITLE_START,
  LOGO_HEIGHT_PX,
  LOGO_LEFT_COL_CHARS,
  LOGO_PAIR_GAP_PX,
  RESUMEN_COL_B_MAX_CHARS,
  RESUMEN_COL_D_CHARS,
  RESUMEN_HEADER_ENTIDAD_END,
  RESUMEN_HEADER_ENTIDAD_START,
  RESUMEN_HEADER_LEFT_END,
  RESUMEN_HEADER_LEFT_START,
  RESUMEN_HEADER_TITLE_END,
  RESUMEN_HEADER_TITLE_START,
  anchoNecesarioParLogosPx,
  dimensionesImagenBuffer,
  excelColWidthToPx,
  excelPxToColWidth,
  logoImageId,
  planLayoutItemEncabezado,
  planLayoutLogosEncabezado,
  planLayoutResumenEncabezado,
  posicionLogoCentradoEnRango,
  posicionParLogosExtremosBloque,
  posicionParLogosFlotante,
  resolverMetaLogosPresupuesto,
  sizeContainInBox,
} from './presupuestoExportLogos.js'
import { agruparRegistrosPorTipoEntidad } from './pptoTipoEntidad.js'
import { filtrarGraficosPorGrupoEntidad } from './pptoGraficosExport.js'
import {
  costoDirectoResumenFila,
  formulaSumaFilas,
  planFilasResumenConSubtotales,
} from './pptoResumenExport.js'

export { resolverMetaLogosPresupuesto }

/** Tema activo del export (paleta del contrato). */
let CC = buildCompareExcelColors()
let FILL_TITLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.title } }
const FILL_META = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.metaBg } }
const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.headerBg } }
let FILL_ROW_PRIMARY = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.rowBg } }
let FILL_ROW_ALT = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.rowBgAlt } }

function aplicarTemaExportInforme(exportPalette) {
  CC = buildCompareExcelColors(exportPalette)
  FILL_TITLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.title } }
  FILL_META.fgColor.argb = CC.metaBg
  FILL_HEADER.fgColor.argb = CC.headerBg
  FILL_ROW_PRIMARY = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.rowBg } }
  FILL_ROW_ALT = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.rowBgAlt } }
}

function fillGrillaFila(rowNum) {
  return rowNum % 2 === 0 ? FILL_ROW_ALT : FILL_ROW_PRIMARY
}

function textoGrillaFila(rowNum) {
  return rowNum % 2 === 0 ? CC.rowTextAlt : CC.rowText
}

function fillTotalesTier(tier) {
  return tier === 'titulo_1' ? FILL_META : FILL_HEADER
}

function textoTotalesTier(tier) {
  return tier === 'titulo_1' ? CC.metaText : CC.headerText
}
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

/** Pie de página impreso: logo ClaraCore + contrato; paginador con nombre de pestaña. */
function aplicarPiePaginaClaraCore(ws, claraLogoImageId, contratoLabel, sheetLabel = '') {
  const label = safeStr(contratoLabel || '—').trim() || '—'
  const texto = `Producto ClaraCore para el contrato ${label}`
  const hoja = safeStr(sheetLabel).trim()
  const paginador = hoja ? `${hoja} — &P de &N` : '&P de &N'
  const pie = claraLogoImageId != null
    ? `&L&G  ${texto}&R${paginador}`
    : `&C${texto}&R${paginador}`
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
  const logo = await prepararLogoWorkbook(wb, url)
  return logoImageId(logo)
}

/**
 * Carga logo al workbook y devuelve descriptor con dimensiones naturales.
 * @returns {Promise<{ imageId: number, natW: number|null, natH: number|null }|null>}
 */
async function prepararLogoWorkbook(wb, logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') return null
  const raw = logoUrl.trim()
  if (!raw) return null
  try {
    let buffer
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
        if (ext === 'svg+xml') return null
        if (!['png', 'jpeg', 'gif', 'webp'].includes(ext)) ext = 'png'
        if (ext === 'webp') ext = 'png'
      }
      const binary = atob(b64)
      buffer = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i)
    } else {
      const res = await fetch(raw)
      if (!res.ok) return null
      const blob = await res.blob()
      buffer = new Uint8Array(await blob.arrayBuffer())
      if (blob.type.includes('jpeg') || blob.type.includes('jpg')) ext = 'jpeg'
      else if (blob.type.includes('gif')) ext = 'gif'
      else ext = 'png'
    }
    const dims = dimensionesImagenBuffer(buffer)
    const safeExt = ext === 'png' || ext === 'jpeg' || ext === 'gif' ? ext : 'png'
    const imageId = wb.addImage({ buffer, extension: safeExt })
    return {
      imageId,
      natW: dims?.width ?? null,
      natH: dims?.height ?? null,
    }
  } catch {
    return null
  }
}

/** Inserta imagen flotante ya dimensionada (altura 1.8 cm, ancho proporcional). */
function insertarImagenFlotante(ws, logo, pos) {
  const id = logoImageId(logo)
  if (id == null || !pos) return
  // tl con nativeCol/nativeColOff en EMUs reales; ext → oneCellAnchor (cx/cy fijos).
  ws.addImage(id, { tl: pos.tl, ext: pos.ext })
}

/** Anchos reales de columnas 1..colCount en px (tras ajustarAnchos*). */
function leerAnchosColumnasPx(ws, colCount) {
  const widths = []
  for (let c = 1; c <= colCount; c += 1) {
    widths.push(excelColWidthToPx(ws.getColumn(c).width || 12))
  }
  return widths
}

/**
 * Logos de memoria de ítem tras anchos definitivos:
 * C+I en extremos de A:D; entidad centrada en M1 (col 13, ex-N tras borrar M).
 * @param {number} [nativeRow=0] fila 0-based (0 = fila 1; para 2.º encabezado usar startRow-1)
 */
function insertarLogosEncabezadoItem(ws, { logoC, logoI, logoE, rowHeightPt, nativeRow = 0 }) {
  const widths = leerAnchosColumnasPx(ws, ITEM_HEADER_COLS)
  const par = posicionParLogosExtremosBloque({
    logoC,
    logoI,
    colWidthsPx: widths.slice(ITEM_HEADER_LEFT_START - 1, ITEM_HEADER_LEFT_END),
    rowHeightPt,
    nativeRow,
  })
  if (par.contratista) insertarImagenFlotante(ws, logoC, par.contratista)
  if (par.interventoria) insertarImagenFlotante(ws, logoI, par.interventoria)

  // Entidad en última columna (= M1 con 13 cols).
  const posE = posicionLogoCentradoEnRango({
    logo: logoE,
    colStart: ITEM_HEADER_ENTIDAD_COL,
    colEnd: ITEM_HEADER_ENTIDAD_COL,
    colWidthsPx: widths,
    rowHeightPt,
    nativeRow,
  })
  insertarImagenFlotante(ws, logoE, posE)
}

/**
 * Resumen: B ≤ 15; A lo bastante ancha para que C+I (1.8 cm) quepan en A:B
 * sin solaparse al anclarse a extremos.
 */
function aplicarAnchosBloqueLogosResumen(ws, logoC, logoI) {
  const bMax = RESUMEN_COL_B_MAX_CHARS
  const curB = Number(ws.getColumn(2).width) || bMax
  ws.getColumn(2).width = Math.min(curB, bMax)

  // Extremos (pad 0): basta con que quepan ambos anchos a 1.8 cm.
  const needPx = anchoNecesarioParLogosPx({
    logoC,
    logoI,
    gapPx: 0,
    padLeftPx: 0,
    padRightPx: 0,
  })
  if (needPx <= 0) return
  const bPx = excelColWidthToPx(ws.getColumn(2).width)
  const aNeedPx = Math.max(1, needPx - bPx)
  const aNeedChars = excelPxToColWidth(aNeedPx)
  const curA = Number(ws.getColumn(1).width) || 12
  if (curA < aNeedChars) ws.getColumn(1).width = aNeedChars
}

/** Inserta C+I en extremos de A:B y entidad centrada en F:G (tras anchos definitivos). */
function insertarLogosEncabezadoResumen(ws, { logoC, logoI, logoE, rowHeightPt }) {
  const widths = leerAnchosColumnasPx(ws, 7)
  const par = posicionParLogosExtremosBloque({
    logoC,
    logoI,
    colWidthsPx: [widths[0], widths[1]],
    rowHeightPt,
  })
  if (par.contratista) insertarImagenFlotante(ws, logoC, par.contratista)
  if (par.interventoria) insertarImagenFlotante(ws, logoI, par.interventoria)

  const posE = posicionLogoCentradoEnRango({
    logo: logoE,
    colStart: RESUMEN_HEADER_ENTIDAD_START,
    colEnd: RESUMEN_HEADER_ENTIDAD_END,
    colWidthsPx: widths,
    rowHeightPt,
  })
  insertarImagenFlotante(ws, logoE, posE)
}

function estiloMetaCell(cell, { bold = false, align = 'left', rowNum } = {}) {
  cell.fill = rowNum != null ? fillGrillaFila(rowNum) : FILL_ROW_PRIMARY
  cell.font = {
    bold,
    size: 11,
    color: { argb: rowNum != null ? textoGrillaFila(rowNum) : CC.rowText },
  }
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true }
}

function estiloTitulo1Cell(cell, { bold = true, align = 'left', size = 11 } = {}) {
  cell.fill = FILL_META
  cell.font = { bold, size, color: { argb: CC.metaText } }
  cell.alignment = { vertical: 'middle', horizontal: align, indent: align === 'left' ? 1 : 0, wrapText: true }
}

function estiloTitulo2Cell(cell, { bold = true, align = 'left', size = 11 } = {}) {
  cell.fill = FILL_HEADER
  cell.font = { bold, size, color: { argb: CC.headerText } }
  cell.alignment = { vertical: 'middle', horizontal: align, indent: align === 'left' ? 1 : 0, wrapText: true }
}

function estiloItemBloqueCell(cell, { bold = false } = {}) {
  cell.font = { bold, size: 11, color: { argb: CC.rowText } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
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

/**
 * Filas meta del encabezado memorias de ítem (13 cols), relativas a baseRow (=2 en encabezado inicial):
 * base: Contrato | número | Objeto: | objeto
 * base+1: Contratista / nombre / NIT / nit
 * base+2: Interventoría / nombre / NIT / —
 *
 * Nota: B2:C2 usa el número de contrato (etiqueta A2 = «Contrato»).
 */
function escribirFilasMetaItem(ws, meta, cols = ITEM_HEADER_COLS, baseRow = 2) {
  const n = Math.max(cols, ITEM_HEADER_COLS)
  const objetoTxt = meta?.objeto ? String(meta.objeto).slice(0, 320) : '—'
  const r2 = baseRow
  const r3 = baseRow + 1
  const r4 = baseRow + 2

  ws.addRow(new Array(n).fill(''))
  ws.getCell(r2, 1).value = 'Contrato'
  ws.getCell(r2, 2).value = safeStr(meta?.numero).trim() || '—'
  ws.mergeCells(r2, 2, r2, 3)
  ws.getCell(r2, 4).value = 'Objeto:'
  ws.getCell(r2, 5).value = objetoTxt
  ws.mergeCells(r2, 5, r2, ITEM_HEADER_ENTIDAD_COL)
  ws.getRow(r2).height = 25
  estiloMetaCell(ws.getCell(r2, 1), { bold: true, rowNum: r2 })
  estiloMetaCell(ws.getCell(r2, 2), { rowNum: r2 })
  estiloMetaCell(ws.getCell(r2, 4), { bold: true, rowNum: r2 })
  estiloMetaCell(ws.getCell(r2, 5), { rowNum: r2 })

  ws.addRow(new Array(n).fill(''))
  ws.getCell(r3, 1).value = 'Contratista'
  ws.mergeCells(r3, 1, r3, 2)
  ws.getCell(r3, 3).value = safeStr(meta?.contratista).trim() || '—'
  ws.mergeCells(r3, 3, r3, 6)
  ws.getCell(r3, 7).value = 'NIT'
  ws.mergeCells(r3, 7, r3, 8)
  ws.getCell(r3, 9).value = safeStr(meta?.nit).trim() || '—'
  ws.mergeCells(r3, 9, r3, 11)
  ws.getRow(r3).height = 22
  estiloMetaCell(ws.getCell(r3, 1), { bold: true, rowNum: r3 })
  estiloMetaCell(ws.getCell(r3, 3), { rowNum: r3 })
  estiloMetaCell(ws.getCell(r3, 7), { bold: true, rowNum: r3 })
  estiloMetaCell(ws.getCell(r3, 9), { rowNum: r3 })

  ws.addRow(new Array(n).fill(''))
  ws.getCell(r4, 1).value = 'Interventoría'
  ws.mergeCells(r4, 1, r4, 2)
  ws.getCell(r4, 3).value = safeStr(meta?.interventoria).trim() || '—'
  ws.mergeCells(r4, 3, r4, 6)
  ws.getCell(r4, 7).value = 'NIT'
  ws.mergeCells(r4, 7, r4, 8)
  ws.getCell(r4, 9).value = '—'
  ws.mergeCells(r4, 9, r4, 11)
  ws.getRow(r4).height = 22
  estiloMetaCell(ws.getCell(r4, 1), { bold: true, rowNum: r4 })
  estiloMetaCell(ws.getCell(r4, 3), { rowNum: r4 })
  estiloMetaCell(ws.getCell(r4, 7), { bold: true, rowNum: r4 })
  estiloMetaCell(ws.getCell(r4, 9), { rowNum: r4 })
}

/** Contenedor fijo por gráfico (px) — 3 columnas uniformes en hoja de 13 cols. */
const GRAFICO_BOX_W_PX = 220
const GRAFICO_BOX_H_PX = 150
const GRAFICO_ROW_HEIGHT_PT = GRAFICO_BOX_H_PX * (72 / 96) + 8
const GRAFICO_COLS_POR_CELDA = [
  { start: 1, end: 4 },
  { start: 5, end: 8 },
  { start: 9, end: 13 },
]

/**
 * Inserta gráficos en 3 columnas, contain sin stretch, con pie de foto.
 * No escribe firmas (el panel de firmas de gráficos va una sola vez al cierre del ítem).
 * @returns {number} siguiente fila disponible tras el bloque
 */
function escribirBloqueGraficosItem(ws, startRow, graficosPrep) {
  const cols = ITEM_HEADER_COLS
  let row = startRow
  const list = Array.isArray(graficosPrep) ? graficosPrep.filter((g) => g?.image) : []
  if (!list.length) return row

  const widths = leerAnchosColumnasPx(ws, cols)

  for (let i = 0; i < list.length; i += 3) {
    const chunk = list.slice(i, i + 3)
    // Asegurar que startRow coincide con la siguiente fila añadida
    while (ws.rowCount < row - 1) {
      ws.addRow(new Array(cols).fill(''))
    }
    ws.addRow(new Array(cols).fill(''))
    const imgRow = ws.rowCount
    ws.getRow(imgRow).height = GRAFICO_ROW_HEIGHT_PT
    for (let c = 1; c <= cols; c += 1) {
      ws.getCell(imgRow, c).fill = fillGrillaFila(imgRow)
    }

    chunk.forEach((g, idx) => {
      const slot = GRAFICO_COLS_POR_CELDA[idx]
      ws.mergeCells(imgRow, slot.start, imgRow, slot.end)
      const natW = g.image.natW
      const natH = g.image.natH
      const size = sizeContainInBox(natW, natH, GRAFICO_BOX_W_PX, GRAFICO_BOX_H_PX)
      let blockStartPx = 0
      for (let c = 1; c < slot.start; c += 1) blockStartPx += widths[c - 1] || 64
      let blockW = 0
      for (let c = slot.start; c <= slot.end; c += 1) blockW += widths[c - 1] || 64
      const offsetX = blockStartPx + Math.max(0, (blockW - size.width) / 2)
      const tl = {
        ...pxOffsetToNativeColLocal(offsetX, widths),
        nativeRow: imgRow - 1,
        nativeRowOff: Math.max(0, Math.floor((pointsToEmuLocal(GRAFICO_ROW_HEIGHT_PT) - pxToEmuLocal(size.height)) / 2)),
      }
      insertarImagenFlotante(ws, g.image, { tl, ext: { width: size.width, height: size.height } })
    })

    ws.addRow(new Array(cols).fill(''))
    const capRow = ws.rowCount
    chunk.forEach((g, idx) => {
      const slot = GRAFICO_COLS_POR_CELDA[idx]
      ws.mergeCells(capRow, slot.start, capRow, slot.end)
      const cell = ws.getCell(capRow, slot.start)
      cell.value = safeStr(g.caption || '—')
      cell.font = { size: 8, italic: true, color: { argb: CC.rowTextAlt } }
      cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true }
      cell.fill = fillGrillaFila(capRow)
    })
    const longest = Math.max(...chunk.map((g) => safeStr(g.caption).length), 40)
    ws.getRow(capRow).height = Math.min(56, 22 + Math.ceil(longest / 48) * 10)
    row = capRow + 1
    if (i + 3 < list.length) {
      ws.addRow(new Array(cols).fill(''))
      row = ws.rowCount + 1
    }
  }

  return row
}

/** Helpers locales EMU (evitan exportar internos de logos). */
function pxToEmuLocal(px) {
  return Math.round(Math.max(0, Number(px) || 0) * 9525)
}
function pointsToEmuLocal(pt) {
  return Math.round(Math.max(0, Number(pt) || 0) * 12700)
}
function pxOffsetToNativeColLocal(px, colWidthsPx) {
  let remaining = Math.max(0, Number(px) || 0)
  const widths = Array.isArray(colWidthsPx) && colWidthsPx.length ? colWidthsPx : [64]
  let col = 0
  for (let i = 0; i < 64; i += 1) {
    const cw = widths[i] ?? widths[widths.length - 1] ?? 64
    if (remaining < cw) {
      return { nativeCol: col, nativeColOff: pxToEmuLocal(remaining) }
    }
    remaining -= cw
    col += 1
  }
  return { nativeCol: col, nativeColOff: pxToEmuLocal(remaining) }
}

/**
 * Filas 2–4 del encabezado Resumen (7 cols):
 * 2: A2 Contrato | B2:G2 objeto (altura 22)
 * 3: A3 Contratista | B3:C3 nombre | D3 NIT | E3:F3 nit contratista
 * 4: A4 Interventoría | B4:C4 nombre | D4 NIT | E4:F4 (sin nit_interventoria en BD → "—")
 */
function escribirFilasMetaResumen(ws, meta, cols = 7) {
  const n = Math.max(cols, 7)
  const objetoTxt = meta?.objeto ? String(meta.objeto).slice(0, 320) : '—'

  ws.addRow(new Array(n).fill(''))
  ws.getCell(2, 1).value = `Contrato: ${meta?.numero ?? '—'}`
  ws.getCell(2, 2).value = objetoTxt
  ws.mergeCells(2, 2, 2, 7)
  ws.getRow(2).height = 22
  estiloMetaCell(ws.getCell(2, 1), { bold: true, rowNum: 2 })
  estiloMetaCell(ws.getCell(2, 2), { rowNum: 2 })

  ws.addRow(new Array(n).fill(''))
  ws.getCell(3, 1).value = 'Contratista'
  ws.getCell(3, 2).value = safeStr(meta?.contratista).trim() || '—'
  ws.mergeCells(3, 2, 3, 3)
  ws.getCell(3, 4).value = 'NIT'
  ws.getCell(3, 5).value = safeStr(meta?.nit).trim() || '—'
  ws.mergeCells(3, 5, 3, 6)
  ws.getRow(3).height = 22
  estiloMetaCell(ws.getCell(3, 1), { bold: true, rowNum: 3 })
  estiloMetaCell(ws.getCell(3, 2), { rowNum: 3 })
  estiloMetaCell(ws.getCell(3, 4), { bold: true, rowNum: 3 })
  estiloMetaCell(ws.getCell(3, 5), { rowNum: 3 })

  ws.addRow(new Array(n).fill(''))
  ws.getCell(4, 1).value = 'Interventoría'
  ws.getCell(4, 2).value = safeStr(meta?.interventoria).trim() || '—'
  ws.mergeCells(4, 2, 4, 3)
  ws.getCell(4, 4).value = 'NIT'
  // No hay campo nit_interventoria en contratos; numero_interventoria no es un NIT.
  ws.getCell(4, 5).value = '—'
  ws.mergeCells(4, 5, 4, 6)
  ws.getRow(4).height = 22
  estiloMetaCell(ws.getCell(4, 1), { bold: true, rowNum: 4 })
  estiloMetaCell(ws.getCell(4, 2), { rowNum: 4 })
  estiloMetaCell(ws.getCell(4, 4), { bold: true, rowNum: 4 })
  estiloMetaCell(ws.getCell(4, 5), { rowNum: 4 })
}

function escribirEncabezadoCompacto(ws, totalCols, titulo, meta, modoLabel, totalRegistros, generatedAt, logoLegacy = null, { soloCantidad = false, totalsTier = 'titulo_2', logos = null, headerLayout = 'auto' } = {}) {
  const cols = Math.max(totalCols, 7)
  // Compat: si solo llega logoLegacy (id o descriptor), tratarlo como contratista.
  const logosEff =
    logos != null
      ? logos
      : (logoLegacy != null
        ? { contratista: typeof logoLegacy === 'object' ? logoLegacy : { imageId: logoLegacy }, interventoria: null, entidad: null }
        : null)

  // Par C+I: altura 1.8 cm; I al extremo derecho del bloque (Resumen A:B / Ítem A:D).
  const logoRowHeightPt = Math.max(TITLE_ROW_HEIGHT, LOGO_HEIGHT_PX * (72 / 96) + 8)
  const isResumen7 = headerLayout === 'resumen7'
  const isItemMemoria = headerLayout === 'item13' || headerLayout === 'item14'

  let hasEntidad
  let entidadLogo
  let tieneLogo
  let leftSpan
  let rightSpan
  let logoContratista = null
  let logoInterventoria = null

  if (isResumen7) {
    const layout = planLayoutResumenEncabezado(logosEff)
    ;({
      hasEntidad,
      entidadLogo,
      tieneLogo,
      leftSpan,
      rightSpan,
      logoContratista,
      logoInterventoria,
    } = layout)
  } else if (isItemMemoria) {
    const layout = planLayoutItemEncabezado(logosEff)
    ;({
      hasEntidad,
      entidadLogo,
      tieneLogo,
      leftSpan,
      rightSpan,
      logoContratista,
      logoInterventoria,
    } = layout)
  } else {
    const par = posicionParLogosFlotante({
      logoC: logosEff?.contratista,
      logoI: logosEff?.interventoria,
      colChars: LOGO_LEFT_COL_CHARS,
      gapPx: LOGO_PAIR_GAP_PX,
      rowHeightPt: logoRowHeightPt,
    })
    const layout = planLayoutLogosEncabezado(logosEff, cols, { leftSpanOverride: par.leftSpanCols })
    ;({
      hasEntidad,
      entidadLogo,
      tieneLogo,
      leftSpan,
      rightSpan,
    } = layout)
    logoContratista = layout.logoContratista
    logoInterventoria = layout.logoInterventoria
  }

  ws.addRow(new Array(cols).fill(''))
  ws.getRow(1).height = tieneLogo ? logoRowHeightPt : TITLE_ROW_HEIGHT_NO_LOGO

  for (let c = 1; c <= cols; c += 1) ws.getCell(1, c).fill = FILL_TITLE

  if (isResumen7) {
    // Exactamente A1:B1 | C1:E1 | F1:G1. Logos se insertan tras ajustar anchos.
    ws.mergeCells(1, RESUMEN_HEADER_LEFT_START, 1, RESUMEN_HEADER_LEFT_END)
    ws.mergeCells(1, RESUMEN_HEADER_TITLE_START, 1, RESUMEN_HEADER_TITLE_END)
    ws.mergeCells(1, RESUMEN_HEADER_ENTIDAD_START, 1, RESUMEN_HEADER_ENTIDAD_END)
    ws.getCell(1, RESUMEN_HEADER_TITLE_START).value = titulo
    ws.getCell(1, RESUMEN_HEADER_TITLE_START).fill = FILL_TITLE
    ws.getCell(1, RESUMEN_HEADER_TITLE_START).font = { bold: true, size: 14, color: { argb: CC.titleText } }
    ws.getCell(1, RESUMEN_HEADER_TITLE_START).alignment = { horizontal: 'center', vertical: 'middle' }
  } else if (isItemMemoria) {
    // A1:D1 logos | E1:L1 título | M1 entidad (ex-N1 tras eliminar columna M).
    ws.mergeCells(1, ITEM_HEADER_LEFT_START, 1, ITEM_HEADER_LEFT_END)
    ws.mergeCells(1, ITEM_HEADER_TITLE_START, 1, ITEM_HEADER_TITLE_END)
    ws.getCell(1, ITEM_HEADER_TITLE_START).value = titulo
    ws.getCell(1, ITEM_HEADER_TITLE_START).fill = FILL_TITLE
    ws.getCell(1, ITEM_HEADER_TITLE_START).font = { bold: true, size: 14, color: { argb: CC.titleText } }
    ws.getCell(1, ITEM_HEADER_TITLE_START).alignment = { horizontal: 'center', vertical: 'middle' }
  } else {
    const titleStart = leftSpan + 1
    const titleEnd = Math.max(titleStart, cols - rightSpan)
    const entidadStart = hasEntidad ? titleEnd + 1 : null
    if (leftSpan > 0) {
      ws.mergeCells(1, 1, 1, leftSpan)
      const par = posicionParLogosFlotante({
        logoC: logosEff?.contratista,
        logoI: logosEff?.interventoria,
        colChars: LOGO_LEFT_COL_CHARS,
        gapPx: LOGO_PAIR_GAP_PX,
        rowHeightPt: logoRowHeightPt,
      })
      if (par.contratista) insertarImagenFlotante(ws, logosEff.contratista, par.contratista)
      if (par.interventoria) insertarImagenFlotante(ws, logosEff.interventoria, par.interventoria)
    }

    if (hasEntidad && entidadStart != null && entidadStart <= cols) {
      ws.mergeCells(1, entidadStart, 1, cols)
    }

    if (tieneLogo) {
      ws.mergeCells(1, titleStart, 1, titleEnd)
      ws.getCell(1, titleStart).value = titulo
      ws.getCell(1, titleStart).fill = FILL_TITLE
      ws.getCell(1, titleStart).font = { bold: true, size: 14, color: { argb: CC.titleText } }
      ws.getCell(1, titleStart).alignment = { horizontal: 'center', vertical: 'middle' }
    } else {
      ws.mergeCells(1, 1, 1, cols)
      ws.getCell(1, 1).value = titulo
      ws.getCell(1, 1).fill = FILL_TITLE
      ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: CC.titleText } }
      ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' }
    }
  }

  if (isResumen7) {
    escribirFilasMetaResumen(ws, meta, cols)
  } else if (isItemMemoria) {
    escribirFilasMetaItem(ws, meta, cols)
  } else {
    const fechaTxt = generatedAt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
    const horaTxt = generatedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    const splitContrato = Math.max(2, Math.floor(cols * 0.18))
    const splitContratista = Math.max(splitContrato + 3, Math.floor(cols * 0.58))
    ws.addRow(new Array(cols).fill(''))
    ws.getCell(2, 1).value = `Contrato: ${meta.numero ?? '—'}`
    ws.getCell(2, splitContrato + 1).value = `Contratista: ${meta.contratista ?? '—'}`
    ws.getCell(2, splitContratista + 1).value = `Generado: ${fechaTxt} ${horaTxt}`
    ws.mergeCells(2, 1, 2, splitContrato)
    ws.mergeCells(2, splitContrato + 1, 2, splitContratista)
    ws.mergeCells(2, splitContratista + 1, 2, cols)
    ws.getRow(2).height = 22
    estiloMetaCell(ws.getCell(2, 1), { bold: true, rowNum: 2 })
    estiloMetaCell(ws.getCell(2, splitContrato + 1), { bold: true, rowNum: 2 })
    estiloMetaCell(ws.getCell(2, splitContratista + 1), { bold: true, align: 'right', rowNum: 2 })

    ws.addRow(new Array(cols).fill(''))
    const interventoriaTxt = safeStr(meta.interventoria).trim() || '—'
    ws.getCell(3, 1).value = `Interventoría: ${interventoriaTxt}`
    ws.getCell(3, splitContratista + 1).value = `Registros: ${totalRegistros ?? 0}`
    ws.mergeCells(3, 1, 3, splitContratista)
    ws.mergeCells(3, splitContratista + 1, 3, cols)
    ws.getRow(3).height = Math.min(22 + Math.floor(interventoriaTxt.length / 72) * 10, 44)
    estiloMetaCell(ws.getCell(3, 1), { rowNum: 3 })
    estiloMetaCell(ws.getCell(3, splitContratista + 1), { align: 'right', rowNum: 3 })

    const objeto = meta.objeto ? String(meta.objeto).slice(0, 320) : '—'
    ws.addRow([`Objeto: ${objeto}`])
    ws.mergeCells(4, 1, 4, cols)
    ws.getRow(4).height = Math.min(22 + Math.floor(objeto.length / 80) * 10, 56)
    estiloMetaCell(ws.getCell(4, 1), { rowNum: 4 })
  }

  ws.addRow(['TOTALES DEL INFORME', '', '', soloCantidad ? 'Cant. total ítem:' : 'Cantidad total:', '', soloCantidad ? '' : 'Costo directo total:', ''])
  ws.mergeCells(5, 1, 5, 3)
  ws.mergeCells(5, 4, 5, soloCantidad ? cols : 5)
  if (!soloCantidad) ws.mergeCells(5, 6, 5, cols)
  ws.getRow(5).height = 22
  const estiloTotales = totalsTier === 'titulo_1' ? estiloTitulo1Cell : estiloTitulo2Cell
  estiloTotales(ws.getCell(5, 1))
  estiloTotales(ws.getCell(5, 4), { align: 'right' })
  if (!soloCantidad) estiloTotales(ws.getCell(5, 6), { align: 'right' })

  ws.addRow([])

  return {
    tableHeaderRow: 7,
    totalsSummaryRow: 5,
    totalsTier,
    logoLeftSpan: leftSpan,
    logoRightSpan: rightSpan,
    entidadLogo: hasEntidad ? entidadLogo : null,
    logoContratista,
    logoInterventoria,
    logoRowHeightPt,
    headerCols: cols,
    headerLayout: isResumen7 ? 'resumen7' : isItemMemoria ? 'item13' : 'auto',
  }
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
  totalsTier = 'titulo_1',
  /** @type {number[]|null} Si se indica, el total general suma solo estas filas (p. ej. subtotales de capítulo). */
  filasSuma = null,
) {
  const srcCant = colSumaCant || colDisplayCant
  const srcCosto = colSumaCosto || colDisplayCosto
  let sumCant
  let sumCosto
  if (Array.isArray(filasSuma) && filasSuma.length) {
    sumCant = formulaSumaFilas(colToLetter(srcCant), filasSuma)
    sumCosto = formulaSumaFilas(colToLetter(srcCosto), filasSuma)
  } else {
    if (lastDataRow < firstDataRow) return
    sumCant = `SUM(${colToLetter(srcCant)}${firstDataRow}:${colToLetter(srcCant)}${lastDataRow})`
    sumCosto = `SUM(${colToLetter(srcCosto)}${firstDataRow}:${colToLetter(srcCosto)}${lastDataRow})`
  }
  const fillTot = fillTotalesTier(totalsTier)
  const textTot = textoTotalesTier(totalsTier)

  ws.getCell(totalsSummaryRow, colDisplayCant).value = { formula: sumCant }
  estiloCantidad(ws.getCell(totalsSummaryRow, colDisplayCant))
  ws.getCell(totalsSummaryRow, colDisplayCant).font = { bold: true, size: 11, color: { argb: textTot } }
  ws.getCell(totalsSummaryRow, colDisplayCant).fill = fillTot

  if (colDisplayCosto != null) {
    ws.getCell(totalsSummaryRow, colDisplayCosto).value = { formula: sumCosto }
    estiloMoneda(ws.getCell(totalsSummaryRow, colDisplayCosto))
    ws.getCell(totalsSummaryRow, colDisplayCosto).font = { bold: true, size: 11, color: { argb: textTot } }
    ws.getCell(totalsSummaryRow, colDisplayCosto).fill = fillTot
  }

  if (totalsFooterRow) {
    ws.getCell(totalsFooterRow, 1).value = 'TOTALES'
    ws.getCell(totalsFooterRow, colDisplayCant).value = { formula: sumCant }
    ws.getCell(totalsFooterRow, 1).font = { bold: true, size: 11, color: { argb: textTot } }
    ws.getCell(totalsFooterRow, 1).fill = fillTot
    estiloCantidad(ws.getCell(totalsFooterRow, colDisplayCant))
    ws.getCell(totalsFooterRow, colDisplayCant).font = { bold: true, size: 11, color: { argb: textTot } }
    ws.getCell(totalsFooterRow, colDisplayCant).fill = fillTot
    if (colDisplayCosto != null) {
      ws.getCell(totalsFooterRow, colDisplayCosto).value = { formula: sumCosto }
      estiloMoneda(ws.getCell(totalsFooterRow, colDisplayCosto))
      ws.getCell(totalsFooterRow, colDisplayCosto).font = { bold: true, size: 11, color: { argb: textTot } }
      ws.getCell(totalsFooterRow, colDisplayCosto).fill = fillTot
    }
    const maxCol = Math.max(colDisplayCant, colDisplayCosto || 0)
    for (let c = 1; c <= maxCol; c += 1) {
      bordeCeldaTabla(ws.getCell(totalsFooterRow, c), { esTotal: true })
    }
  }
}

function estiloFilaSubtotalCapitulo(row, colCount) {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > colCount) return
    cell.fill = FILL_HEADER
    cell.font = { bold: true, size: 10, color: { argb: CC.headerText } }
    cell.alignment = {
      horizontal: colNumber >= 5 ? 'right' : 'left',
      vertical: 'middle',
      wrapText: colNumber <= 3,
    }
    bordeCeldaTabla(cell, { esTotal: true })
  })
  row.height = 20
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
    cell.fill = FILL_HEADER
    cell.font = { bold: true, size: 11, color: { argb: CC.headerText } }
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

function estiloFilaDatos(row, colCount, rowNum, { wrapAll = false } = {}) {
  const rn = rowNum ?? row.number ?? 1
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > colCount) return
    cell.fill = fillGrillaFila(rn)
    cell.font = { size: 10, color: { argb: textoGrillaFila(rn) } }
    cell.alignment = {
      horizontal: colNumber >= 5 ? 'right' : 'left',
      vertical: 'middle',
      wrapText: wrapAll || colNumber <= 3,
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

/** Memorias de ítem (13 cols): A–L = 11, M = 45. A–D mín. 14 para logos. */
function ajustarAnchosMemoriaItem(ws, colCount = ITEM_HEADER_COLS, { logoLeftSpan = 0 } = {}) {
  for (let c = 1; c <= colCount; c += 1) {
    ws.getColumn(c).width = c < colCount ? 11 : 45
  }
  const left = Math.min(logoLeftSpan || 0, ITEM_HEADER_LEFT_END)
  for (let c = 1; c <= left; c += 1) {
    ws.getColumn(c).width = Math.max(ws.getColumn(c).width || 0, 14)
  }
}

function aplicarWrapTextRango(ws, fromRow, toRow, colCount) {
  if (!fromRow || !toRow || toRow < fromRow) return
  for (let r = fromRow; r <= toRow; r += 1) {
    const row = ws.getRow(r)
    for (let c = 1; c <= colCount; c += 1) {
      const cell = row.getCell(c)
      const prev = cell.alignment || {}
      cell.alignment = { ...prev, wrapText: true, vertical: prev.vertical || 'middle' }
    }
  }
}

/** Resumen: anchos base; con logos C+I reserva 4 cols izq. y entidad a la derecha. */
function ajustarAnchosResumen(ws, desdeFila, colCount, { logoLeftSpan = 0, logoRightSpan = 0 } = {}) {
  ajustarAnchos(ws, desdeFila, colCount)
  if (logoLeftSpan >= 4) {
    for (let c = 1; c <= 4; c += 1) {
      ws.getColumn(c).width = Math.max(ws.getColumn(c).width || 0, 14)
    }
    if (colCount >= 5) ws.getColumn(5).width = Math.max(ws.getColumn(5).width || 0, 28)
  } else if (logoLeftSpan >= 2) {
    ws.getColumn(1).width = Math.max(ws.getColumn(1).width || 0, 16)
    if (colCount >= 2) ws.getColumn(2).width = Math.max(ws.getColumn(2).width || 0, 14)
    if (colCount >= 3) ws.getColumn(3).width = Math.max(ws.getColumn(3).width || 0, 40)
  } else {
    ws.getColumn(1).width = 30
    if (colCount >= 2) ws.getColumn(2).width = 10
    if (colCount >= 3) ws.getColumn(3).width = 50
  }
  for (let c = colCount - logoRightSpan + 1; c <= colCount; c += 1) {
    if (c >= 1) ws.getColumn(c).width = Math.max(ws.getColumn(c).width || 0, 12)
  }
  // Columna D (Unidad) fija: no debe variar por subtotales ni auto-ajuste de contenido.
  if (colCount >= 4) ws.getColumn(4).width = RESUMEN_COL_D_CHARS
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
  estiloItemBloqueCell(ws.getCell(startRow, 1), { bold: true })
  estiloItemBloqueCell(ws.getCell(startRow, 4), { bold: true })
  estiloItemBloqueCell(ws.getCell(startRow, 6), { bold: true })

  const descRow = startRow + 1
  ws.getCell(descRow, 1).value = `Descripción: ${desc}`
  ws.mergeCells(descRow, 1, descRow, cols)
  ws.getRow(descRow).height = Math.min(22 + Math.floor(desc.length / 70) * 10, 48)
  estiloItemBloqueCell(ws.getCell(descRow, 1), { bold: true })

  return descRow + 1
}

function moverHojaAlInicio(wb, sheetName) {
  const sheets = wb.worksheets.slice()
  const idx = sheets.findIndex((w) => w.name === sheetName)
  if (idx <= 0) return
  const target = sheets[idx]
  if (typeof wb.moveWorksheet === 'function') {
    wb.moveWorksheet(target.id, 0)
    return
  }
  // ExcelJS ordena por orderNo; mutar el array de worksheets no basta
  const ordered = [target, ...sheets.filter((_, i) => i !== idx)]
  ordered.forEach((s, i) => {
    s.orderNo = i + 1
  })
}

function colectarFirmantes(registros) {
  const revisores = new Map()
  const aprobadores = new Map()
  for (const reg of registros || []) {
    const depPor = safeStr(reg?.pre_interv_por).trim()
    if (depPor && !revisores.has(depPor)) {
      revisores.set(depPor, { nombre: depPor, rol: 'Depuración contratista' })
    }
    const intPor = safeStr(reg?.validado_por).trim()
    if (intPor && !aprobadores.has(intPor)) {
      aprobadores.set(intPor, { nombre: intPor, rol: 'Interventoría' })
    }
  }
  return { revisores: [...revisores.values()], aprobadores: [...aprobadores.values()] }
}

const BORDER_FIRMA_OUTER = { style: 'medium', color: { argb: 'FF64748B' } }
const BORDER_FIRMA_INNER = { style: 'thin', color: { argb: 'FF94A3B8' } }
const BORDER_FIRMA_DIVIDER = { style: 'medium', color: { argb: 'FF64748B' } }
const PASTEL_FIRMA_BODY = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FCFE' } }

function bordeFirmaCell(cell, { top, left, bottom, right } = {}) {
  const b = {}
  if (top) b.top = top
  if (left) b.left = left
  if (bottom) b.bottom = bottom
  if (right) b.right = right
  cell.border = b
}

function aplicarMarcoBloqueFirmas(ws, rTit, rNom, rRol, leftEnd, rightStart, cols) {
  const O = BORDER_FIRMA_OUTER
  const I = BORDER_FIRMA_INNER
  const D = BORDER_FIRMA_DIVIDER

  bordeFirmaCell(ws.getCell(rTit, 1), { top: O, left: O, bottom: I, right: D })
  bordeFirmaCell(ws.getCell(rTit, rightStart), { top: O, right: O, bottom: I, left: D })

  bordeFirmaCell(ws.getCell(rNom, 1), { left: O, bottom: I, right: D })
  bordeFirmaCell(ws.getCell(rNom, rightStart), { right: O, bottom: I, left: D })

  bordeFirmaCell(ws.getCell(rRol, 1), { left: O, bottom: O, right: D })
  bordeFirmaCell(ws.getCell(rRol, rightStart), { right: O, bottom: O, left: D })

  for (let r = rTit; r <= rRol; r += 1) {
    for (let c = leftEnd + 1; c < rightStart; c += 1) {
      const cell = ws.getCell(r, c)
      cell.fill = PASTEL_FIRMA_BODY
      bordeFirmaCell(cell, {
        top: r === rTit ? O : I,
        bottom: r === rRol ? O : I,
        left: c === leftEnd + 1 ? D : undefined,
        right: c === rightStart - 1 ? D : undefined,
      })
    }
  }
}

function escribirBloqueFirmas(ws, startRow, totalCols, firmantes) {
  const cols = Math.max(totalCols, 7)
  const midCol = Math.max(2, Math.ceil(cols / 2))
  const leftEnd = midCol - 1
  const rightStart = midCol

  const estiloTitulo = (cell) => {
    cell.fill = FILL_HEADER
    cell.font = { bold: true, size: 11, color: { argb: CC.headerText } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }
  const estiloLinea = (cell, { resaltar = false } = {}) => {
    cell.fill = resaltar ? FILL_ROW_PRIMARY : PASTEL_FIRMA_BODY
    cell.font = { size: 10, color: { argb: resaltar ? CC.rowText : CC.rowTextAlt } }
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 }
  }

  ws.addRow(new Array(cols).fill(''))
  ws.getRow(startRow).height = 12

  const rTit = startRow + 1
  ws.mergeCells(rTit, 1, rTit, leftEnd)
  ws.mergeCells(rTit, rightStart, rTit, cols)
  ws.getCell(rTit, 1).value = 'Revisó'
  ws.getCell(rTit, rightStart).value = 'Aprobó'
  estiloTitulo(ws.getCell(rTit, 1))
  estiloTitulo(ws.getCell(rTit, rightStart))
  ws.getRow(rTit).height = 24

  const nombresRev = (firmantes.revisores.length
    ? firmantes.revisores.map((f) => `Nombre  ${f.nombre}`)
    : ['Nombre'])
    .join('\n')
  const nombresApr = (firmantes.aprobadores.length
    ? firmantes.aprobadores.map((f) => `Nombre  ${f.nombre}`)
    : ['Nombre'])
    .join('\n')

  const rNom = startRow + 2
  ws.mergeCells(rNom, 1, rNom, leftEnd)
  ws.mergeCells(rNom, rightStart, rNom, cols)
  ws.getCell(rNom, 1).value = nombresRev
  ws.getCell(rNom, rightStart).value = nombresApr
  estiloLinea(ws.getCell(rNom, 1), { resaltar: true })
  estiloLinea(ws.getCell(rNom, rightStart), { resaltar: true })
  ws.getRow(rNom).height = Math.max(
    44,
    Math.max(firmantes.revisores.length, 1) * 22,
    Math.max(firmantes.aprobadores.length, 1) * 22,
  )

  const rolesRev = (firmantes.revisores.length
    ? firmantes.revisores.map((f) => `Rol  ${f.rol}`)
    : ['Rol'])
    .join('\n')
  const rolesApr = (firmantes.aprobadores.length
    ? firmantes.aprobadores.map((f) => `Rol  ${f.rol}`)
    : ['Rol'])
    .join('\n')

  const rRol = startRow + 3
  ws.mergeCells(rRol, 1, rRol, leftEnd)
  ws.mergeCells(rRol, rightStart, rRol, cols)
  ws.getCell(rRol, 1).value = rolesRev
  ws.getCell(rRol, rightStart).value = rolesApr
  estiloLinea(ws.getCell(rRol, 1))
  estiloLinea(ws.getCell(rRol, rightStart))
  ws.getRow(rRol).height = Math.max(
    26,
    Math.max(firmantes.revisores.length, 1) * 18,
    Math.max(firmantes.aprobadores.length, 1) * 18,
  )

  aplicarMarcoBloqueFirmas(ws, rTit, rNom, rRol, leftEnd, rightStart, cols)

  return rRol
}

// Sin columna «Validación Dep. / Int.» (ex-M eliminada); Observación queda en M.
// Columna 9 (Área/Long/Nodo) se renombra por subtabla según tipo_entidad.
const DET_HEADERS_BASE = [
  'ID_POL',
  'PK_ID',
  'Tramo',
  'Infraestructura',
  'Abscisa Inicial',
  'Abscisa Final',
  'Nodo Inicial',
  'Nodo Final',
  'Área/Long/Nodo',
  'Ancho',
  'Espesor',
  'Cant. Total',
  'Observación',
]
const TOTAL_COLS_DET = DET_HEADERS_BASE.length
const COL_AREA_LONG = 9
const COL_ANCHO = DET_HEADERS_BASE.indexOf('Ancho') + 1
const COL_ESPESOR = DET_HEADERS_BASE.indexOf('Espesor') + 1
const COL_CANT_TOTAL = DET_HEADERS_BASE.indexOf('Cant. Total') + 1

function headersDetallePorGrupo(colLabel) {
  const headers = DET_HEADERS_BASE.slice()
  headers[COL_AREA_LONG - 1] = colLabel || 'Área/Long/Nodo'
  return headers
}

function escribirFilaRegistroDetalle(ws, reg) {
  const r = ws.addRow([
    reg.id_pol,
    reg.pk_id,
    reg.tramo,
    reg.infraestructura,
    reg.abs_inicio,
    reg.abs_final,
    reg.no_inicio,
    reg.no_final,
    reg.area_long_nod,
    reg.ancho,
    reg.espesor,
    reg.cant_total,
    reg.observacion,
  ])
  estiloCantidad(r.getCell(COL_AREA_LONG))
  estiloCantidad(r.getCell(COL_ANCHO))
  estiloCantidad(r.getCell(COL_ESPESOR))
  estiloCantidad(r.getCell(COL_CANT_TOTAL))
  estiloFilaDatos(r, TOTAL_COLS_DET, r.number, { wrapAll: true })
  return r
}

function crearHojaItem(wb, itemInfo, idx, usedNames, meta, modoLabel, generatedAt, logoLegacy, claraLogoImageId, logos = null, graficosPrep = []) {
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
  aplicarPiePaginaClaraCore(ws, claraLogoImageId, meta.numero || meta.contrato, sheetName)

  const regs = itemInfo.registros || []
  const enc = escribirEncabezadoCompacto(
    ws,
    TOTAL_COLS_DET,
    'PRESUPUESTO - SOPORTE DE CANTIDADES',
    meta,
    modoLabel,
    regs.length,
    generatedAt,
    logoLegacy,
    { soloCantidad: true, totalsTier: 'titulo_2', logos, headerLayout: 'item13' },
  )

  const afterItemMeta = escribirEncabezadoItemCompacto(ws, enc.tableHeaderRow, TOTAL_COLS_DET, itemInfo)
  const grupos = agruparRegistrosPorTipoEntidad(regs)

  let firstDataRowGlobal = null
  let lastDataRowGlobal = null
  let firstHeaderRow = null
  let lastTableRow = afterItemMeta - 1

  grupos.forEach((grupo, gIdx) => {
    // Separación visual entre subtablas (fila en blanco).
    if (gIdx > 0) {
      ws.addRow(new Array(TOTAL_COLS_DET).fill(''))
      const sepRow = ws.rowCount
      ws.getRow(sepRow).height = 10
      for (let c = 1; c <= TOTAL_COLS_DET; c += 1) {
        const cell = ws.getCell(sepRow, c)
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF64748B' } } }
      }
    }

    const headers = headersDetallePorGrupo(grupo.colLabel)
    ws.addRow(headers)
    const headerRow = ws.rowCount
    if (firstHeaderRow == null) firstHeaderRow = headerRow
    estiloFilaHeader(ws.getRow(headerRow), TOTAL_COLS_DET)

    const firstDet = headerRow + 1
    for (const reg of grupo.registros) {
      escribirFilaRegistroDetalle(ws, reg)
    }
    const lastDet = grupo.registros.length > 0 ? firstDet + grupo.registros.length - 1 : null
    if (lastDet != null) {
      if (firstDataRowGlobal == null) firstDataRowGlobal = firstDet
      lastDataRowGlobal = lastDet
      aplicarBordesTabla(ws, headerRow, lastDet, TOTAL_COLS_DET)
      lastTableRow = lastDet
    } else {
      lastTableRow = headerRow
    }

    // Gráficos del tipo de entidad, justo después de la subtabla (sin encabezado repetido).
    const grafsGrupo = filtrarGraficosPorGrupoEntidad(graficosPrep, grupo.key)
    if (grafsGrupo.length) {
      ws.addRow(new Array(TOTAL_COLS_DET).fill(''))
      escribirBloqueGraficosItem(ws, ws.rowCount + 1, grafsGrupo)
      lastTableRow = ws.rowCount
    }
  })

  if (firstHeaderRow != null) {
    ws.pageSetup.printTitlesRow = `${firstHeaderRow}:${firstHeaderRow}`
  }

  let cantTotalRow = null
  if (firstDataRowGlobal != null && lastDataRowGlobal != null) {
    ws.addRow(new Array(TOTAL_COLS_DET).fill(''))
    cantTotalRow = ws.rowCount
    ws.getCell(cantTotalRow, 1).value = 'TOTAL CANT.'
    // Suma única al final del ítem (cubre todas las subtablas; encabezados/texto/gráficos se ignoran en SUM).
    ws.getCell(cantTotalRow, COL_CANT_TOTAL).value = {
      formula: `SUM(${colToLetter(COL_CANT_TOTAL)}${firstDataRowGlobal}:${colToLetter(COL_CANT_TOTAL)}${lastDataRowGlobal})`,
    }
    estiloTitulo2Cell(ws.getCell(cantTotalRow, 1))
    estiloCantidad(ws.getCell(cantTotalRow, COL_CANT_TOTAL))
    ws.getCell(cantTotalRow, COL_CANT_TOTAL).font = { bold: true, size: 11, color: { argb: CC.headerText } }
    ws.getCell(cantTotalRow, COL_CANT_TOTAL).fill = FILL_HEADER
    completarFormulasTotales(
      ws,
      enc.totalsSummaryRow,
      null,
      firstDataRowGlobal,
      lastDataRowGlobal,
      5,
      null,
      COL_CANT_TOTAL,
      null,
      enc.totalsTier,
    )
    lastTableRow = cantTotalRow
  }

  // Un solo panel de firmas al cierre (después de la última subtabla y sus gráficos).
  const firmantes = colectarFirmantes(regs)
  const firmRowStart = lastTableRow + 2
  escribirBloqueFirmas(ws, firmRowStart, TOTAL_COLS_DET, firmantes)

  ajustarAnchosMemoriaItem(ws, TOTAL_COLS_DET, {
    logoLeftSpan: enc.logoLeftSpan || 0,
  })
  insertarLogosEncabezadoItem(ws, {
    logoC: enc.logoContratista,
    logoI: enc.logoInterventoria,
    logoE: enc.entidadLogo,
    rowHeightPt: enc.logoRowHeightPt,
    nativeRow: 0,
  })
  const wrapHasta = lastTableRow || afterItemMeta
  aplicarWrapTextRango(ws, afterItemMeta, wrapHasta, TOTAL_COLS_DET)

  // Fila 2 ya fijada en 25 por escribirFilasMetaItem; bloque ítem / encabezado tabla.
  ws.getRow(7).height = 30
  ws.getRow(9).height = 30

  return {
    sheetName,
    cantTotalRow,
    key: itemMapKey(itemInfo.capitulo, itemInfo.item),
  }
}

function crearHojaResumen(wb, resumen, itemRefs, meta, modoLabel, totalRegistros, generatedAt, logoLegacy, claraLogoImageId, todosRegistros = [], wsExistente = null, logos = null) {
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
  const wsRes = wsExistente || wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] })
  aplicarPaginaHorizontal(wsRes)
  aplicarPiePaginaClaraCore(wsRes, claraLogoImageId, meta.numero || meta.contrato, 'Resumen')

  const {
    tableHeaderRow,
    totalsSummaryRow,
    totalsTier,
    logoLeftSpan,
    logoRightSpan,
    entidadLogo,
    logoContratista,
    logoInterventoria,
    logoRowHeightPt,
  } = escribirEncabezadoCompacto(
    wsRes,
    totalColsResumen,
    'PRESUPUESTO - RESUMEN DE EXPORTACIÓN',
    meta,
    modoLabel,
    totalRegistros,
    generatedAt,
    logoLegacy,
    { totalsTier: 'titulo_1', logos, headerLayout: 'resumen7' },
  )

  wsRes.addRow(resumenHeaders)
  estiloFilaHeader(wsRes.getRow(tableHeaderRow), totalColsResumen)
  wsRes.pageSetup.printTitlesRow = `${tableHeaderRow}:${tableHeaderRow}`

  const firstDataRow = tableHeaderRow + 1
  let rowNum = firstDataRow
  /** Filas de subtotal por capítulo: el total general (fila 5) suma solo estas. */
  const filasSubtotalCap = []
  let chapterItemStart = null

  const plan = planFilasResumenConSubtotales(resumen)
  for (const entry of plan) {
    if (entry.tipo === 'item') {
      const row = entry.row
      if (chapterItemStart == null) chapterItemStart = rowNum
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
          formula: `${sheetFormulaRef(ref.sheetName)}!${colToLetter(COL_CANT_TOTAL)}${ref.cantTotalRow}`,
        }
      } else {
        r.getCell(6).value = Number(row.cantidad) || 0
      }
      estiloCantidad(r.getCell(6))

      // Congruente con la plataforma: Σ costo_directo (no ROUND(vlr × Σcant)).
      r.getCell(7).value = costoDirectoResumenFila(row)
      estiloMoneda(r.getCell(7))
      estiloFilaDatos(r, totalColsResumen, rowNum)
      rowNum += 1
      continue
    }

    // Subtotal de capítulo: suma Cantidad y Costo directo de las filas del grupo.
    const itemEnd = rowNum - 1
    const itemStart = chapterItemStart
    const label = `SUBTOTAL ${entry.capitulo || '—'}`.trim()
    const rSub = wsRes.addRow([label, '', '', '', '', null, null])
    if (itemStart != null && itemEnd >= itemStart) {
      rSub.getCell(6).value = {
        formula: `SUM(${colToLetter(6)}${itemStart}:${colToLetter(6)}${itemEnd})`,
      }
      rSub.getCell(7).value = {
        formula: `SUM(${colToLetter(7)}${itemStart}:${colToLetter(7)}${itemEnd})`,
      }
    } else {
      rSub.getCell(6).value = 0
      rSub.getCell(7).value = entry.costoDirecto || 0
    }
    estiloCantidad(rSub.getCell(6))
    estiloMoneda(rSub.getCell(7))
    estiloFilaSubtotalCapitulo(rSub, totalColsResumen)
    try {
      wsRes.mergeCells(rowNum, 1, rowNum, 4)
    } catch {
      /* merge opcional */
    }
    filasSubtotalCap.push(rowNum)
    chapterItemStart = null
    rowNum += 1
  }

  const lastDataRow = plan.length > 0 ? rowNum - 1 : firstDataRow - 1
  let totalsFooterRow = null
  if (plan.length > 0) {
    totalsFooterRow = lastDataRow + 1
    wsRes.addRow(new Array(totalColsResumen).fill(''))
    completarFormulasTotales(
      wsRes,
      totalsSummaryRow,
      totalsFooterRow,
      firstDataRow,
      lastDataRow,
      6,
      7,
      null,
      null,
      totalsTier,
      filasSubtotalCap.length ? filasSubtotalCap : null,
    )
    aplicarBordesTabla(wsRes, tableHeaderRow, totalsFooterRow, totalColsResumen)
  }

  const firmRowStart = (totalsFooterRow || tableHeaderRow) + 2
  escribirBloqueFirmas(wsRes, firmRowStart, totalColsResumen, colectarFirmantes(todosRegistros))

  // Anchos de datos; luego B≤15 y A suficiente para el par C+I en A1:B1.
  ajustarAnchosResumen(wsRes, tableHeaderRow, totalColsResumen, {
    logoLeftSpan: logoLeftSpan || 0,
    logoRightSpan: logoRightSpan || 0,
  })
  aplicarAnchosBloqueLogosResumen(wsRes, logoContratista, logoInterventoria)
  // Reafirmar D=15 por si algún ajuste de logos/contenido lo movió.
  wsRes.getColumn(4).width = RESUMEN_COL_D_CHARS
  insertarLogosEncabezadoResumen(wsRes, {
    logoC: logoContratista,
    logoI: logoInterventoria,
    logoE: entidadLogo,
    rowHeightPt: logoRowHeightPt,
  })
  return wsRes
}

/**
 * @param {object} payload respuesta POST /presupuesto/{id}/exportar-informe (formato=crudo)
 * @param {object|null} metaContrato GET /contratos/{id}
 * @param {number|string} contratoId
 */
export async function downloadPresupuestoCrudoExcel(payload, metaContrato, contratoId, filename) {
  const columnas = Array.isArray(payload?.columnas) ? payload.columnas : []
  const filas = Array.isArray(payload?.filas) ? payload.filas : []
  if (!columnas.length && filas.length) {
    columnas.push(...Object.keys(filas[0]))
  }
  const modoLabel = payload?.modo_label || 'Exportación cruda'
  const generatedAt = new Date()
  const meta = metaContrato || {}

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore · Presupuesto'

  const ws = wb.addWorksheet('Datos crudos', { views: [{ state: 'frozen', ySplit: 1, showGridLines: true }] })
  aplicarPaginaHorizontal(ws)

  ws.addRow(columnas)
  estiloFilaHeader(ws.getRow(1), columnas.length)

  for (const row of filas) {
    const vals = columnas.map((col) => {
      const v = row?.[col]
      if (v == null) return ''
      if (typeof v === 'object') return JSON.stringify(v)
      return v
    })
    const r = ws.addRow(vals)
    estiloFilaDatos(r, columnas.length)
  }

  columnas.forEach((col, idx) => {
    const colNum = idx + 1
    let maxLen = String(col).length
    for (const row of filas.slice(0, 200)) {
      const s = row?.[col] == null ? '' : String(row[col])
      maxLen = Math.max(maxLen, Math.min(s.length, 48))
    }
    ws.getColumn(colNum).width = Math.min(Math.max(maxLen + 2, 10), 42)
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = String(payload?.modo || 'crudo').replace(/[^\w.-]+/g, '_')
  a.download = filename || `presupuesto_${slug}_${contratoId ?? 'NA'}_${generatedAt.toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
  aplicarTemaExportInforme(meta.export_palette)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore · Presupuesto'

  // Secuencial: ExcelJS muta el workbook al registrar cada imagen.
  const logoContratista = await prepararLogoWorkbook(wb, meta.logo_contratista)
  const logoInterventoria = await prepararLogoWorkbook(wb, meta.logo_interventoria)
  const logoEntidad = await prepararLogoWorkbook(wb, meta.logo_entidad)
  const logos = {
    contratista: logoContratista,
    interventoria: logoInterventoria,
    entidad: logoEntidad,
  }
  const claraLogoImageId = await cargarLogoClaraCore(wb)
  const contratoLabel = meta.numero || meta.contrato || String(contratoId ?? '')

  const usedNames = new Set(['resumen'])
  const itemRefs = new Map()
  const todosRegistros = []

  // Crear Resumen primero para que sea la pestaña inicial; se rellena tras las memorias
  // (las fórmulas de cantidad dependen de los totales por ítem).
  const wsResumen = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] })

  // Precargar gráficos (URLs únicas) para reutilizar el mismo imageId entre ítems del grupo.
  const grafUrlCache = new Map()
  for (const itemInfo of items) {
    for (const g of itemInfo.graficos || []) {
      const url = (g?.url || '').trim()
      if (!url || grafUrlCache.has(url)) continue
      // Secuencial: ExcelJS muta el workbook al registrar cada imagen.
      // eslint-disable-next-line no-await-in-loop
      grafUrlCache.set(url, await prepararLogoWorkbook(wb, url))
    }
  }

  for (let idx = 0; idx < items.length; idx += 1) {
    const itemInfo = items[idx]
    const graficosPrep = (itemInfo.graficos || [])
      .map((g) => ({
        caption: g.caption,
        orden: g.orden,
        tipos_entidad: Array.isArray(g.tipos_entidad) ? g.tipos_entidad : [],
        image: grafUrlCache.get((g?.url || '').trim()) || null,
      }))
      .filter((g) => g.image)
    const ref = crearHojaItem(
      wb,
      itemInfo,
      idx,
      usedNames,
      { ...meta, contrato: contratoLabel },
      modoLabel,
      generatedAt,
      logoContratista,
      claraLogoImageId,
      logos,
      graficosPrep,
    )
    if (ref.cantTotalRow) itemRefs.set(ref.key, ref)
    for (const reg of itemInfo.registros || []) todosRegistros.push(reg)
  }

  crearHojaResumen(
    wb,
    resumen,
    itemRefs,
    { ...meta, contrato: contratoLabel },
    modoLabel,
    payload?.total_registros ?? 0,
    generatedAt,
    logoContratista,
    claraLogoImageId,
    todosRegistros,
    wsResumen,
    logos,
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
