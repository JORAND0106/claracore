import ExcelJS from 'exceljs'
import { buildCompareExcelColors } from '../../utils/exportPalette.js'

/** Tema activo del export (se reinicia en cada descarga según paleta del contrato). */
let CC = buildCompareExcelColors()
let FILL_TITLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.title } }

const FILL_META = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.metaBg } }
const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.headerBg } }
let FILL_ROW_PRIMARY = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.rowBg } }
let FILL_ROW_ALT = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.rowBgAlt } }
let FILL_TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.totalBg } }

function aplicarTemaExportCompare(exportPalette) {
  CC = buildCompareExcelColors(exportPalette)
  FILL_TITLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.title } }
  FILL_META.fgColor.argb = CC.metaBg
  FILL_HEADER.fgColor.argb = CC.headerBg
  FILL_ROW_PRIMARY = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.rowBg } }
  FILL_ROW_ALT = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.rowBgAlt } }
  FILL_TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.totalBg } }
}

function fillGrillaFila(rowNum) {
  return rowNum % 2 === 0 ? FILL_ROW_ALT : FILL_ROW_PRIMARY
}

function textoGrillaFila(rowNum) {
  return rowNum % 2 === 0 ? CC.rowTextAlt : CC.rowText
}

const COP_NUM_FMT = '"$"#,##0'
const QTY_NUM_FMT = '#,##0.00'
/** Verde positivo / rojo negativo (formato Excel). */
const DELTA_QTY_FMT = '[Color10]+#,##0.00;[Color3]-#,##0.00;[Color1]"—"'
const DELTA_COP_FMT = '[Color10]+"$"#,##0;[Color3]-"$"#,##0;[Color1]"—"'
/** Variación % vs versión inicial (V0). */
const PCT_VS_INICIAL_FMT = '0.00%;[Color3]-0.00%;[Color1]"—"'

/** Alturas de fila al 80% del valor base. */
const rowH = (h) => Math.max(6, Math.round(h * 0.8))

function prepararHojaCompare(ws) {
  ws.properties.defaultRowHeight = rowH(15)
}

const ANCHO_ITEM = 12
const ANCHO_DESC_ITEMS = Math.round(48 * 1.6)
const ANCHO_DESC_TRAMO = Math.round(42 * 1.6)
const ANCHO_UND = 8
const ANCHO_VLR_UNIT = 14
const COL_ITEM = 1
const COL_DESC = 2
const COL_UND = 3
const COL_VLR = 4
const LABEL_HEADERS_ITEMS = ['Ítem', 'Descripción', 'Und', 'Vlr. unitario']
const LABEL_COUNT_ITEMS = LABEL_HEADERS_ITEMS.length

function sheetFormulaRef(name) {
  const escaped = String(name).replace(/'/g, "''")
  return `'${escaped}'`
}

function crearRegistroRefsTramo() {
  return { byTramo: {} }
}

function registrarRefCantTramo(registry, tramoLabel, sheetName, cap, itemKey, versionId, colNum, rowNum) {
  if (!registry?.byTramo) return
  if (!registry.byTramo[tramoLabel]) registry.byTramo[tramoLabel] = {}
  if (!registry.byTramo[tramoLabel][cap]) registry.byTramo[tramoLabel][cap] = {}
  if (!registry.byTramo[tramoLabel][cap][itemKey]) registry.byTramo[tramoLabel][cap][itemKey] = {}
  registry.byTramo[tramoLabel][cap][itemKey][versionId] = { sheet: sheetName, col: colNum, row: rowNum }
}

function formulaSumaCantTramos(registry, tramoLabels, cap, itemKey, versionId) {
  if (!registry || !tramoLabels?.length) return null
  const parts = []
  tramoLabels.forEach((tramoLabel) => {
    const ref = registry.byTramo[tramoLabel]?.[cap]?.[itemKey]?.[versionId]
    if (!ref) return
    parts.push(`${sheetFormulaRef(ref.sheet)}!${colToLetter(ref.col)}${ref.row}`)
  })
  if (!parts.length) return null
  return parts.length === 1 ? parts[0] : parts.join('+')
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

function colToLetter(col) {
  let s = ''
  let n = col
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function safeSheetName(raw, fallback = 'Tramo') {
  let s = String(raw ?? fallback).replace(/[\\/*?:\[\]]/g, ' ').trim()
  if (!s) s = fallback
  if (s.length > 31) s = s.slice(0, 31)
  return s
}

function formulaDelta(prevCol, currCol, rowNum) {
  return `${colToLetter(currCol)}${rowNum}-${colToLetter(prevCol)}${rowNum}`
}

function formulaPctVsInicial(v0Col, currCol, rowNum) {
  const v0 = colToLetter(v0Col)
  const cur = colToLetter(currCol)
  return `IF(${v0}${rowNum}=0,"",(${cur}${rowNum}-${v0}${rowNum})/${v0}${rowNum})`
}

function escribirPctVsInicialCelda(cell, cols, colDef, rowNum) {
  if (colDef.kind !== 'pct_delta_costo') return
  const v0Col = cols.findIndex((x) => x.key === `${colDef.initialVersionId}-costo`) + 1
  const currCol = cols.findIndex((x) => x.key === `${colDef.versionId}-costo`) + 1
  if (v0Col <= 0 || currCol <= 0) return
  cell.value = { formula: formulaPctVsInicial(v0Col, currCol, rowNum) }
  estiloDato(cell, { numFmt: PCT_VS_INICIAL_FMT, align: 'right' })
}

function bordeCelda(cell, { top, bottom, left, right } = {}) {
  const b = {}
  if (top) b.top = top
  if (bottom) b.bottom = bottom
  if (left) b.left = left
  if (right) b.right = right
  cell.border = b
}

const B_THIN = { style: 'thin', color: { argb: CC.borderLight } }
const B_HEADER = { style: 'thin', color: { argb: CC.border } }

function estiloHeaderTabla(cell) {
  cell.fill = FILL_HEADER
  cell.font = { bold: true, size: 10, color: { argb: CC.headerText } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  bordeCelda(cell, { top: B_HEADER, bottom: B_HEADER, left: B_THIN, right: B_THIN })
}

function estiloDato(cell, { align = 'right', numFmt, fill, wrapText = false, fontColor, rowNum } = {}) {
  const rowFill = fill ?? (rowNum != null ? fillGrillaFila(rowNum) : FILL_ROW_PRIMARY)
  const rowFont = fontColor ?? (rowNum != null ? textoGrillaFila(rowNum) : CC.rowText)
  cell.fill = rowFill
  cell.alignment = { vertical: wrapText ? 'top' : 'middle', horizontal: align, wrapText }
  if (numFmt) cell.numFmt = numFmt
  cell.font = { size: 10, color: { argb: rowFont } }
  bordeCelda(cell, { bottom: B_THIN, left: B_THIN, right: B_THIN })
}

function estiloDelta(cell, numFmt, rowNum, fill) {
  estiloDato(cell, {
    align: 'right',
    numFmt,
    fill: fill ?? (rowNum != null ? fillGrillaFila(rowNum) : FILL_ROW_PRIMARY),
    fontColor: rowNum != null ? textoGrillaFila(rowNum) : CC.rowText,
    rowNum,
  })
  cell.font = { size: 10, bold: false }
}

function ajustarAlturaFilaDescripcion(ws, rowNum, text, colWidth) {
  const len = String(text ?? '').length
  const charsPerLine = Math.max(28, Math.floor(colWidth * 1.12))
  const lines = Math.max(1, Math.ceil(len / charsPerLine))
  const prev = ws.getRow(rowNum).height
  const next = Math.min(rowH(96), Math.max(rowH(22), rowH(15) * lines + rowH(8)))
  if (!prev || prev < next) ws.getRow(rowNum).height = next
}

function escribirCeldaDescripcion(ws, rowNum, colNum, text, colWidth) {
  const cell = ws.getRow(rowNum).getCell(colNum)
  cell.value = text
  estiloDato(cell, { align: 'left', wrapText: true, rowNum })
  ajustarAlturaFilaDescripcion(ws, rowNum, text, colWidth)
}

function escribirFilasItem(ws, rowNum, { itemKey, descripcion }, descWidth) {
  escribirCeldaDescripcion(ws, rowNum, COL_ITEM, itemKey, ANCHO_ITEM)
  escribirCeldaDescripcion(ws, rowNum, COL_DESC, descripcion || '—', descWidth)
}

function resolverDescripcionItem(itemRows, itemKey) {
  return (
    itemRows
      ?.map((x) => x.items.find((it) => String(it.item) === itemKey)?.descripcion)
      .find(Boolean) || ''
  )
}

function resolverMetaItem(itemRows, itemKey, versionesOrd) {
  let und = ''
  let vlrUnitario = null

  for (let vi = versionesOrd.length - 1; vi >= 0; vi -= 1) {
    const v = versionesOrd[vi]
    const block = itemRows.find((x) => String(x.version.id) === String(v.id))
    const it = block?.items?.find((i) => String(i.item) === itemKey)
    if (!it) continue
    if (!und && it.und) und = String(it.und).trim()
    if (vlrUnitario == null && it.vlr_unitario != null && it.vlr_unitario !== '') {
      vlrUnitario = Math.round(Number(it.vlr_unitario) || 0)
    }
  }

  if (!und) {
    for (const { items } of itemRows) {
      const it = items.find((i) => String(i.item) === itemKey)
      if (it?.und) {
        und = String(it.und).trim()
        break
      }
    }
  }

  return { und: und || '—', vlr_unitario: vlrUnitario }
}

function escribirCeldasMetaItem(ws, rowNum, { und, vlr_unitario }) {
  const cUnd = ws.getRow(rowNum).getCell(COL_UND)
  cUnd.value = und || '—'
  estiloDato(cUnd, { align: 'center', rowNum })

  const cVlr = ws.getRow(rowNum).getCell(COL_VLR)
  if (vlr_unitario == null || Number.isNaN(vlr_unitario)) {
    cVlr.value = null
  } else {
    cVlr.value = vlr_unitario
  }
  estiloDato(cVlr, { numFmt: COP_NUM_FMT, align: 'right', rowNum })
}

function estiloLabelExtraTotal(cell) {
  cell.fill = FILL_TOTAL
  cell.font = { bold: true, size: 11, color: { argb: CC.totalText } }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
}

function estiloSubtotalCapLabel(cell) {
  cell.fill = FILL_META
  cell.font = { bold: true, size: 10, color: { argb: CC.metaText } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: false }
  bordeCelda(cell, { top: B_HEADER, bottom: B_THIN, left: B_THIN, right: B_THIN })
}

function estiloSubtotalCapValor(cell, numFmt) {
  cell.fill = FILL_META
  cell.font = { bold: true, size: 10, color: { argb: CC.metaText } }
  cell.numFmt = numFmt
  cell.alignment = { vertical: 'middle', horizontal: 'right' }
  bordeCelda(cell, { top: B_HEADER, bottom: B_THIN, left: B_THIN, right: B_THIN })
}

function estiloSubtotalTramoLabel(cell) {
  cell.fill = FILL_META
  cell.font = { bold: true, size: 11, color: { argb: CC.metaText } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: false }
  bordeCelda(cell, { top: B_HEADER, bottom: B_HEADER, left: B_THIN, right: B_THIN })
}

function estiloSubtotalTramoValor(cell, numFmt) {
  cell.fill = FILL_META
  cell.font = { bold: true, size: 11, color: { argb: CC.metaText } }
  cell.numFmt = numFmt
  cell.alignment = { vertical: 'middle', horizontal: 'right' }
  bordeCelda(cell, { top: B_HEADER, bottom: B_HEADER, left: B_THIN, right: B_THIN })
}

function mergeCeldasEtiquetaSubtotal(ws, rowNum, cols) {
  const labelCount = cols.filter((c) => c.kind === 'label').length || 1
  if (labelCount > 1) {
    ws.mergeCells(rowNum, 1, rowNum, labelCount)
  }
  return labelCount
}

function indicesColumnasCosto(cols) {
  return cols
    .map((c, idx) => ({ ...c, colNum: idx + 1 }))
    .filter((c) => c.kind === 'costo' || c.kind === 'delta_costo')
    .map((c) => ({ colNum: c.colNum, kind: c.kind }))
}

function paresCostoParaDelta(cols) {
  return cols
    .filter((c) => c.kind === 'delta_costo')
    .map((c) => {
      const deltaCol = cols.indexOf(c) + 1
      const currCostoCol = cols.findIndex((x) => x.key === `${c.versionId}-costo`) + 1
      const prevCostoCol = cols.findIndex((x) => x.key === `${c.prevVersionId}-costo`) + 1
      return { deltaCol, currCostoCol, prevCostoCol }
    })
}

function numFmtCostoCol(kind) {
  if (kind === 'delta_costo') return DELTA_COP_FMT
  return COP_NUM_FMT
}

function estiloMetaInforme(cell, { bold = false, align = 'left', rowNum } = {}) {
  cell.fill = rowNum != null ? fillGrillaFila(rowNum) : FILL_ROW_PRIMARY
  cell.font = {
    size: 10,
    bold,
    color: { argb: rowNum != null ? textoGrillaFila(rowNum) : CC.rowText },
  }
  cell.alignment = { vertical: 'middle', horizontal: align, indent: 1, wrapText: true }
  bordeCelda(cell, { bottom: B_THIN, left: B_THIN, right: B_THIN })
}

function formatearVersionesCompare(versionesOrd) {
  if (!versionesOrd?.length) return '—'
  return versionesOrd.map((v) => v.etiqueta).join('  →  ')
}

function buildVersionColumnPlan(versionesOrd, labelCount = 1, { includePct = false } = {}) {
  const cols = []
  const initialVersionId = versionesOrd[0]?.id
  for (let i = 0; i < labelCount; i += 1) {
    cols.push({ key: `label${i}`, kind: 'label', labelIdx: i })
  }
  versionesOrd.forEach((v, vi) => {
    cols.push({ key: `${v.id}-cant`, versionId: v.id, kind: 'cant', versionIdx: vi })
    cols.push({ key: `${v.id}-costo`, versionId: v.id, kind: 'costo', versionIdx: vi })
    if (vi > 0) {
      cols.push({
        key: `${v.id}-dcant`,
        versionId: v.id,
        kind: 'delta_cant',
        versionIdx: vi,
        prevVersionId: versionesOrd[vi - 1].id,
      })
      cols.push({
        key: `${v.id}-dcosto`,
        versionId: v.id,
        kind: 'delta_costo',
        versionIdx: vi,
        prevVersionId: versionesOrd[vi - 1].id,
      })
      if (includePct && initialVersionId) {
        cols.push({
          key: `${v.id}-pcosto`,
          versionId: v.id,
          kind: 'pct_delta_costo',
          versionIdx: vi,
          initialVersionId,
        })
      }
    }
  })
  return cols
}

function formulaCostoDirecto(cantCol, vlrCol, rowNum) {
  return `ROUND(${colToLetter(cantCol)}${rowNum}*${colToLetter(vlrCol)}${rowNum},0)`
}

function columnasPorVersion() {
  return 2
}

function columnasDelta(includePct) {
  return includePct ? 5 : 4
}

function escribirEncabezadosCompare(
  ws,
  versionesOrd,
  rowOffset,
  { labelHeaders = ['Capítulo / Ítem'], includePct = false } = {},
) {
  const labelCount = labelHeaders.length
  const cols = buildVersionColumnPlan(versionesOrd, labelCount, { includePct })
  const r1 = ws.getRow(rowOffset)
  const r2 = ws.getRow(rowOffset + 1)

  labelHeaders.forEach((h, i) => {
    const col = i + 1
    r1.getCell(col).value = h
    ws.mergeCells(rowOffset, col, rowOffset + 1, col)
    estiloHeaderTabla(r1.getCell(col))
    estiloHeaderTabla(r2.getCell(col))
  })

  let colNum = labelCount + 1
  versionesOrd.forEach((v, vi) => {
    const span = vi > 0 ? columnasDelta(includePct) : columnasPorVersion()
    r1.getCell(colNum).value = v.etiqueta
    ws.mergeCells(rowOffset, colNum, rowOffset, colNum + span - 1)
    estiloHeaderTabla(r1.getCell(colNum))

    r2.getCell(colNum).value = 'Cantidad'
    estiloHeaderTabla(r2.getCell(colNum))
    r2.getCell(colNum + 1).value = 'Costo directo'
    estiloHeaderTabla(r2.getCell(colNum + 1))

    if (vi > 0) {
      const v0Label = versionesOrd[0]?.etiqueta ?? 'V0'
      r2.getCell(colNum + 2).value = '▲ Cantidad'
      estiloHeaderTabla(r2.getCell(colNum + 2))
      r2.getCell(colNum + 3).value = '▲ Costo directo'
      estiloHeaderTabla(r2.getCell(colNum + 3))
      if (includePct) {
        r2.getCell(colNum + 4).value = `% vs ${v0Label} Costo`
        estiloHeaderTabla(r2.getCell(colNum + 4))
      }
    }
    colNum += span
  })

  r1.height = rowH(22)
  r2.height = rowH(22)

  return { cols, firstDataRow: rowOffset + 2, totalCols: cols.length, labelCount, includePct }
}

/** Encabezado institucional enriquecido (todas las pestañas del comparador). */
function escribirEncabezadoInforme(ws, totalCols, ctx = {}) {
  const cols = Math.max(totalCols, 10)
  const meta = ctx.metaContrato || {}
  const logoImageId = ctx.logoImageId ?? null

  const splitMeta = Math.floor(cols * 0.38)
  const tieneLogo = logoImageId != null
  const logoSpan = tieneLogo ? 2 : 0
  const titleStart = logoSpan + 1

  if (tieneLogo) {
    ws.mergeCells(1, 1, 1, logoSpan)
    ws.getCell(1, 1).fill = FILL_TITLE
    insertarLogoEncabezado(ws, logoImageId)
    ws.mergeCells(1, titleStart, 1, cols)
    const cTitulo = ws.getCell(1, titleStart)
    cTitulo.value = 'Comparación de versiones de presupuesto'
    cTitulo.fill = FILL_TITLE
    cTitulo.font = { bold: true, size: 14, color: { argb: CC.titleText } }
    cTitulo.alignment = { vertical: 'middle', horizontal: 'center' }
  } else {
    ws.mergeCells(1, 1, 1, cols)
    const cTitulo = ws.getCell(1, 1)
    cTitulo.value = 'Comparación de versiones de presupuesto'
    cTitulo.fill = FILL_TITLE
    cTitulo.font = { bold: true, size: 14, color: { argb: CC.titleText } }
    cTitulo.alignment = { vertical: 'middle', horizontal: 'center' }
  }
  ws.getRow(1).height = tieneLogo ? rowH(42) : rowH(32)

  ws.mergeCells(2, 1, 2, splitMeta)
  ws.mergeCells(2, splitMeta + 1, 2, cols)
  ws.getCell(2, 1).value = `Contrato: ${meta.numero ?? meta.contrato ?? '—'}`
  ws.getCell(2, splitMeta + 1).value = `Contratista: ${meta.contratista ?? '—'}`
  estiloMetaInforme(ws.getCell(2, 1), { bold: true, rowNum: 2 })
  estiloMetaInforme(ws.getCell(2, splitMeta + 1), { bold: true, rowNum: 2 })
  ws.getRow(2).height = rowH(22)

  ws.mergeCells(3, 1, 3, splitMeta)
  ws.mergeCells(3, splitMeta + 1, 3, cols)
  ws.getCell(3, 1).value = `Interventoría: ${meta.interventoria ?? '—'}`
  ws.getCell(3, splitMeta + 1).value = `Alcance del informe: ${ctx.alcanceLabel ?? 'General'}`
  estiloMetaInforme(ws.getCell(3, 1), { rowNum: 3 })
  estiloMetaInforme(ws.getCell(3, splitMeta + 1), { rowNum: 3 })
  ws.getRow(3).height = rowH(22)

  const objeto = meta.objeto ? String(meta.objeto) : '—'
  ws.mergeCells(4, 1, 4, cols)
  ws.getCell(4, 1).value = `Objeto contractual: ${objeto}`
  estiloMetaInforme(ws.getCell(4, 1), { rowNum: 4 })
  ws.getRow(4).height = Math.min(rowH(56), rowH(22) + Math.floor(objeto.length / 90) * rowH(12))

  ws.mergeCells(5, 1, 5, cols)
  ws.getCell(5, 1).value = `Versiones comparadas: ${formatearVersionesCompare(ctx.versionesOrd)}`
  estiloMetaInforme(ws.getCell(5, 1), { bold: true, rowNum: 5 })
  ws.getRow(5).height = rowH(22)

  let nextRow = 6
  if (ctx.subtituloDestacado) {
    ws.mergeCells(nextRow, 1, nextRow, cols)
    const cSec = ws.getCell(nextRow, 1)
    cSec.value = ctx.subtituloDestacado
    cSec.fill = FILL_HEADER
    cSec.font = { bold: true, size: 15, color: { argb: CC.headerText } }
    cSec.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    bordeCelda(cSec, { top: B_HEADER, bottom: B_HEADER, left: B_HEADER, right: B_HEADER })
    ws.getRow(nextRow).height = rowH(34)
    nextRow += 1
  }

  ws.getRow(nextRow).height = rowH(8)
  return nextRow + 1
}

function valorCantCosto(data, kind) {
  if (!data) return null
  if (kind === 'cant') return Number(data.cant_total)
  if (kind === 'vlr') {
    if (data.vlr_unitario == null || data.vlr_unitario === '') return null
    return Math.round(Number(data.vlr_unitario) || 0)
  }
  return Math.round(Number(data.costo_total) || 0)
}

function escribirFilaCompareItem(
  ws,
  rowNum,
  cols,
  getDataForVersion,
  { vlrCol = null, skipPct = false, cantFormulaForVersion = null } = {},
) {
  const colIndexByKey = {}
  cols.forEach((c, idx) => {
    colIndexByKey[c.key] = idx + 1
  })

  cols.forEach((c, idx) => {
    if (c.kind === 'label') return
    const cell = ws.getRow(rowNum).getCell(idx + 1)

    if (c.kind === 'pct_delta_costo') {
      if (skipPct) {
        cell.value = null
        estiloDato(cell, { align: 'right', rowNum })
        return
      }
      escribirPctVsInicialCelda(cell, cols, c, rowNum)
      return
    }

    if (c.kind === 'cant') {
      const formulaCant = cantFormulaForVersion?.(c.versionId)
      if (formulaCant) {
        cell.value = { formula: formulaCant }
      } else {
        const data = getDataForVersion(c.versionId)
        const val = valorCantCosto(data, 'cant')
        cell.value = val == null || Number.isNaN(val) ? null : val
      }
      estiloDato(cell, { numFmt: QTY_NUM_FMT, align: 'right', rowNum })
      return
    }

    if (c.kind === 'costo') {
      const cantCol = colIndexByKey[`${c.versionId}-cant`]
      if (vlrCol) {
        cell.value = { formula: formulaCostoDirecto(cantCol, vlrCol, rowNum) }
      } else {
        const data = getDataForVersion(c.versionId)
        const val = valorCantCosto(data, 'costo')
        cell.value = val == null || Number.isNaN(val) ? null : val
      }
      estiloDato(cell, { numFmt: COP_NUM_FMT, align: 'right', rowNum })
      return
    }

    const prevCantCol = colIndexByKey[`${c.prevVersionId}-cant`]
    const currCantCol = colIndexByKey[`${c.versionId}-cant`]
    const prevCostoCol = colIndexByKey[`${c.prevVersionId}-costo`]
    const currCostoCol = colIndexByKey[`${c.versionId}-costo`]

    if (c.kind === 'delta_cant') {
      cell.value = { formula: formulaDelta(prevCantCol, currCantCol, rowNum) }
      estiloDelta(cell, DELTA_QTY_FMT, rowNum)
    } else if (c.kind === 'delta_costo') {
      cell.value = { formula: formulaDelta(prevCostoCol, currCostoCol, rowNum) }
      estiloDelta(cell, DELTA_COP_FMT, rowNum)
    }
  })
}

function escribirFilaItemConMeta(ws, rowNum, cols, getDataForVersion, meta, opts = {}) {
  escribirCeldasMetaItem(ws, rowNum, meta)
  escribirFilaCompareItem(ws, rowNum, cols, getDataForVersion, {
    vlrCol: COL_VLR,
    skipPct: true,
    ...opts,
  })
}

function obtenerItemDeVersion(itemRows, versionId, itemKey) {
  const block = itemRows.find((x) => String(x.version.id) === String(versionId))
  return block?.items?.find((it) => String(it.item) === itemKey) || null
}

function escribirFilaCompare(ws, rowNum, cols, getDataForVersion) {
  escribirFilaCompareItem(ws, rowNum, cols, getDataForVersion, { skipPct: true })
}

function indicesColumnasCant(cols) {
  return cols
    .map((c, idx) => ({ ...c, colNum: idx + 1 }))
    .filter((c) => c.kind === 'cant' || c.kind === 'delta_cant')
    .map((c) => ({ colNum: c.colNum, kind: c.kind }))
}

function escribirSubtotalCapitulo(
  ws,
  rowNum,
  cols,
  costoCols,
  paresDelta,
  { firstItemRow, lastItemRow, labelText, sumRows = null },
) {
  const r = ws.getRow(rowNum)
  mergeCeldasEtiquetaSubtotal(ws, rowNum, cols)
  r.getCell(1).value = labelText
  estiloSubtotalCapLabel(r.getCell(1))
  ws.getRow(rowNum).height = rowH(22)

  const cantCols = indicesColumnasCant(cols)

  cols.forEach((c, idx) => {
    if (c.kind === 'label') return
    const cell = r.getCell(idx + 1)
    if (c.kind === 'pct_delta_costo') {
      escribirPctVsInicialCelda(cell, cols, c, rowNum)
      estiloSubtotalCapValor(cell, PCT_VS_INICIAL_FMT)
      return
    }
    const hitCant = cantCols.find((cc) => cc.colNum === idx + 1)
    if (hitCant?.kind === 'cant') {
      const L = colToLetter(hitCant.colNum)
      if (sumRows?.length) {
        cell.value = { formula: `SUM(${sumRows.map((sr) => `${L}${sr}`).join(',')})` }
      } else {
        cell.value = { formula: `SUM(${L}${firstItemRow}:${L}${lastItemRow})` }
      }
      estiloSubtotalCapValor(cell, QTY_NUM_FMT)
      return
    }
    if (hitCant?.kind === 'delta_cant') {
      const pair = cols
        .filter((x) => x.kind === 'delta_cant')
        .map((x, i, arr) => {
          const deltaCol = cols.indexOf(x) + 1
          const currCantCol = cols.findIndex((y) => y.key === `${x.versionId}-cant`) + 1
          const prevCantCol = cols.findIndex((y) => y.key === `${x.prevVersionId}-cant`) + 1
          return { deltaCol, currCantCol, prevCantCol }
        })
        .find((p) => p.deltaCol === idx + 1)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCantCol, pair.currCantCol, rowNum) }
        estiloSubtotalCapValor(cell, DELTA_QTY_FMT)
      }
      return
    }
    const hit = costoCols.find((cc) => cc.colNum === idx + 1)
    if (!hit) {
      cell.fill = FILL_META
      return
    }

    if (hit.kind === 'costo') {
      const L = colToLetter(hit.colNum)
      if (sumRows?.length) {
        cell.value = { formula: `SUM(${sumRows.map((sr) => `${L}${sr}`).join(',')})` }
      } else {
        cell.value = { formula: `SUM(${L}${firstItemRow}:${L}${lastItemRow})` }
      }
      estiloSubtotalCapValor(cell, COP_NUM_FMT)
      return
    }

    if (hit.kind === 'delta_costo') {
      const pair = paresDelta.find((p) => p.deltaCol === hit.colNum)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCostoCol, pair.currCostoCol, rowNum) }
        estiloSubtotalCapValor(cell, DELTA_COP_FMT)
      }
      return
    }

    cell.fill = FILL_META
  })
}

function escribirSubtotalTramo(ws, rowNum, cols, costoCols, paresDelta, chapterSubRows, tramoLabel) {
  const labelText = `Total tramo — ${tramoLabel}`
  const r = ws.getRow(rowNum)
  mergeCeldasEtiquetaSubtotal(ws, rowNum, cols)
  r.getCell(1).value = labelText
  estiloSubtotalTramoLabel(r.getCell(1))
  ws.getRow(rowNum).height = rowH(24)

  const cantCols = indicesColumnasCant(cols)

  cols.forEach((c, idx) => {
    if (c.kind === 'label') return
    const cell = r.getCell(idx + 1)
    if (c.kind === 'pct_delta_costo') {
      escribirPctVsInicialCelda(cell, cols, c, rowNum)
      estiloSubtotalTramoValor(cell, PCT_VS_INICIAL_FMT)
      return
    }
    const hitCant = cantCols.find((cc) => cc.colNum === idx + 1)
    if (hitCant?.kind === 'cant') {
      const L = colToLetter(hitCant.colNum)
      cell.value = { formula: `SUM(${chapterSubRows.map((sr) => `${L}${sr}`).join(',')})` }
      estiloSubtotalTramoValor(cell, QTY_NUM_FMT)
      return
    }
    if (hitCant?.kind === 'delta_cant') {
      const pair = cols
        .filter((x) => x.kind === 'delta_cant')
        .map((x) => {
          const deltaCol = cols.indexOf(x) + 1
          const currCantCol = cols.findIndex((y) => y.key === `${x.versionId}-cant`) + 1
          const prevCantCol = cols.findIndex((y) => y.key === `${x.prevVersionId}-cant`) + 1
          return { deltaCol, currCantCol, prevCantCol }
        })
        .find((p) => p.deltaCol === idx + 1)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCantCol, pair.currCantCol, rowNum) }
        estiloSubtotalTramoValor(cell, DELTA_QTY_FMT)
      }
      return
    }
    const hit = costoCols.find((cc) => cc.colNum === idx + 1)
    if (!hit) {
      cell.fill = FILL_META
      return
    }

    if (hit.kind === 'costo') {
      const L = colToLetter(hit.colNum)
      cell.value = { formula: `SUM(${chapterSubRows.map((sr) => `${L}${sr}`).join(',')})` }
      estiloSubtotalTramoValor(cell, COP_NUM_FMT)
      return
    }

    if (hit.kind === 'delta_costo') {
      const pair = paresDelta.find((p) => p.deltaCol === hit.colNum)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCostoCol, pair.currCostoCol, rowNum) }
        estiloSubtotalTramoValor(cell, DELTA_COP_FMT)
      }
      return
    }

    cell.fill = FILL_META
  })
}

function escribirSubtotalCapituloItems(
  ws,
  rowNum,
  cols,
  costoCols,
  paresDelta,
  opts,
) {
  escribirSubtotalCapitulo(ws, rowNum, cols, costoCols, paresDelta, opts)
}

function escribirFilaTotalesCostoDirecto(
  ws,
  rowNum,
  cols,
  costoCols,
  paresDelta,
  { firstRow, lastRow, label = 'TOTAL COSTO DIRECTO' },
) {
  if (lastRow < firstRow) return
  const r = ws.getRow(rowNum)
  r.getCell(1).value = label
  r.getCell(1).fill = FILL_TOTAL
  r.getCell(1).font = { bold: true, size: 11, color: { argb: CC.totalText } }
  r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  cols.forEach((c, idx) => {
    if (c.kind === 'label') {
      if (idx > 0) estiloLabelExtraTotal(r.getCell(idx + 1))
      return
    }
    const cell = r.getCell(idx + 1)
    if (c.kind === 'pct_delta_costo') {
      escribirPctVsInicialCelda(cell, cols, c, rowNum)
      cell.fill = FILL_TOTAL
      cell.font = { bold: true, size: 11, color: { argb: CC.totalText } }
      return
    }
    const hit = costoCols.find((cc) => cc.colNum === idx + 1)
    if (!hit) {
      cell.fill = FILL_TOTAL
      return
    }
    cell.fill = FILL_TOTAL
    cell.font = { bold: true, size: 11, color: { argb: CC.totalText } }
    cell.alignment = { vertical: 'middle', horizontal: 'right' }

    if (hit.kind === 'costo') {
      const L = colToLetter(hit.colNum)
      cell.value = { formula: `SUM(${L}${firstRow}:${L}${lastRow})` }
      cell.numFmt = COP_NUM_FMT
    } else if (hit.kind === 'delta_costo') {
      const pair = paresDelta.find((p) => p.deltaCol === hit.colNum)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCostoCol, pair.currCostoCol, rowNum) }
        cell.numFmt = DELTA_COP_FMT
      }
    }
  })
}

function escribirFilaTotalGeneralItems(ws, rowNum, cols, costoCols, paresDelta, subtotalRows) {
  if (!subtotalRows.length) return
  const r = ws.getRow(rowNum)
  r.getCell(1).value = 'TOTAL GENERAL'
  r.getCell(1).fill = FILL_TOTAL
  r.getCell(1).font = { bold: true, size: 11, color: { argb: CC.totalText } }
  r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  const cantCols = indicesColumnasCant(cols)

  cols.forEach((c, idx) => {
    if (c.kind === 'label') {
      if (idx > 0) estiloLabelExtraTotal(r.getCell(idx + 1))
      return
    }
    const cell = r.getCell(idx + 1)
    if (c.kind === 'pct_delta_costo') {
      escribirPctVsInicialCelda(cell, cols, c, rowNum)
      cell.fill = FILL_TOTAL
      cell.font = { bold: true, size: 11, color: { argb: CC.totalText } }
      return
    }
    const hitCant = cantCols.find((cc) => cc.colNum === idx + 1)
    if (hitCant?.kind === 'cant') {
      const L = colToLetter(hitCant.colNum)
      cell.value = { formula: `SUM(${subtotalRows.map((sr) => `${L}${sr}`).join(',')})` }
      cell.fill = FILL_TOTAL
      cell.font = { bold: true, size: 11, color: { argb: CC.totalText } }
      cell.numFmt = QTY_NUM_FMT
      cell.alignment = { vertical: 'middle', horizontal: 'right' }
      return
    }
    if (hitCant?.kind === 'delta_cant') {
      const pair = cols
        .filter((x) => x.kind === 'delta_cant')
        .map((x) => {
          const deltaCol = cols.indexOf(x) + 1
          const currCantCol = cols.findIndex((y) => y.key === `${x.versionId}-cant`) + 1
          const prevCantCol = cols.findIndex((y) => y.key === `${x.prevVersionId}-cant`) + 1
          return { deltaCol, currCantCol, prevCantCol }
        })
        .find((p) => p.deltaCol === idx + 1)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCantCol, pair.currCantCol, rowNum) }
        cell.fill = FILL_TOTAL
        cell.font = { bold: true, size: 11, color: { argb: CC.totalText } }
        cell.numFmt = DELTA_QTY_FMT
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      }
      return
    }
    const hit = costoCols.find((cc) => cc.colNum === idx + 1)
    if (!hit) {
      cell.fill = FILL_TOTAL
      return
    }
    cell.fill = FILL_TOTAL
    cell.font = { bold: true, size: 11, color: { argb: CC.totalText } }
    cell.alignment = { vertical: 'middle', horizontal: 'right' }

    if (hit.kind === 'costo') {
      const L = colToLetter(hit.colNum)
      cell.value = { formula: `SUM(${subtotalRows.map((sr) => `${L}${sr}`).join(',')})` }
      cell.numFmt = COP_NUM_FMT
    } else if (hit.kind === 'delta_costo') {
      const pair = paresDelta.find((p) => p.deltaCol === hit.colNum)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCostoCol, pair.currCostoCol, rowNum) }
        cell.numFmt = DELTA_COP_FMT
      }
    }
  })
}

function ajustarAnchosColumnas(ws, versionesOrd, labelWidths, { includePct = false } = {}) {
  const widths = Array.isArray(labelWidths) ? labelWidths : [labelWidths]
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
  let cn = widths.length + 1
  versionesOrd.forEach((_, vi) => {
    ws.getColumn(cn).width = 14
    ws.getColumn(cn + 1).width = 16
    if (vi > 0) {
      ws.getColumn(cn + 2).width = 14
      ws.getColumn(cn + 3).width = 16
      if (includePct) {
        ws.getColumn(cn + 4).width = 12
      }
    }
    cn += vi > 0 ? columnasDelta(includePct) : columnasPorVersion()
  })
}

function unionItemKeysCapitulo(capitulo, itemsByCap) {
  const itemRows = itemsByCap[capitulo]
  if (!itemRows) return []
  const keys = new Set()
  itemRows.forEach(({ items }) => items.forEach((it) => keys.add(String(it.item))))
  return [...keys].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

function escribirHojaItems(
  ws,
  versionesOrd,
  capitulosUnion,
  itemsByCap,
  exportCtx,
  { tramosData = null, tramoRefs = null, tramoLabels = [] } = {},
) {
  prepararHojaCompare(ws)
  const includePct = true
  const totalCols = buildVersionColumnPlan(versionesOrd, LABEL_COUNT_ITEMS, { includePct }).length
  const usarFormulaTramos = tramoLabels.length > 0 && tramoRefs

  const headerRow = escribirEncabezadoInforme(ws, totalCols, {
    ...exportCtx,
    subtituloDestacado: 'Resumen general',
  })

  const { cols, firstDataRow } = escribirEncabezadosCompare(ws, versionesOrd, headerRow, {
    labelHeaders: LABEL_HEADERS_ITEMS,
    includePct,
  })
  const costoCols = indicesColumnasCosto(cols)
  const paresDelta = paresCostoParaDelta(cols)
  let rowNum = firstDataRow
  const subtotalRows = []

  capitulosUnion.forEach((cap) => {
    const itemRows = itemsByCap[cap]
    if (!itemRows) return

    const itemKeys = unionItemKeysCapitulo(cap, itemsByCap)
    if (!itemKeys.length) return

    const chapterStartRow = rowNum

    itemKeys.forEach((itemKey) => {
      const descripcion = resolverDescripcionItem(itemRows, itemKey)
      escribirFilasItem(ws, rowNum, { itemKey, descripcion }, ANCHO_DESC_ITEMS)

      const meta = resolverMetaItem(itemRows, itemKey, versionesOrd)
      escribirFilaItemConMeta(
        ws,
        rowNum,
        cols,
        (versionId) => obtenerItemDeVersion(itemRows, versionId, itemKey),
        meta,
        {
          cantFormulaForVersion: usarFormulaTramos
            ? (versionId) => formulaSumaCantTramos(tramoRefs, tramoLabels, cap, itemKey, versionId)
            : null,
        },
      )
      rowNum += 1
    })

    escribirSubtotalCapituloItems(ws, rowNum, cols, costoCols, paresDelta, {
      firstItemRow: chapterStartRow,
      lastItemRow: rowNum - 1,
      labelText: `Subtotal — ${cap}`,
    })
    subtotalRows.push(rowNum)
    rowNum += 2
  })

  if (subtotalRows.length > 1) {
    escribirFilaTotalGeneralItems(ws, rowNum, cols, costoCols, paresDelta, subtotalRows)
  }

  ajustarAnchosColumnas(
    ws,
    versionesOrd,
    [ANCHO_ITEM, ANCHO_DESC_ITEMS, ANCHO_UND, ANCHO_VLR_UNIT],
    { includePct },
  )
  ws.views = [{ showGridLines: false }]
}

function escribirHojaCapitulos(ws, versionesOrd, capitulosUnion, getCapData, exportCtx) {
  prepararHojaCompare(ws)
  const totalCols = buildVersionColumnPlan(versionesOrd, 1).length
  const headerRow = escribirEncabezadoInforme(ws, totalCols, {
    ...exportCtx,
    subtituloDestacado: 'Resumen por capítulo',
  })

  const { cols, firstDataRow } = escribirEncabezadosCompare(ws, versionesOrd, headerRow, {
    labelHeaders: ['Capítulo'],
  })
  const costoCols = indicesColumnasCosto(cols)
  const paresDelta = paresCostoParaDelta(cols)
  let rowNum = firstDataRow

  capitulosUnion.forEach((cap) => {
    escribirCeldaDescripcion(ws, rowNum, 1, cap, 36)
    escribirFilaCompare(ws, rowNum, cols, (versionId) => getCapData(versionId, cap))
    rowNum += 1
  })

  if (capitulosUnion.length > 0) {
    const lastDataRow = rowNum - 1
    escribirFilaTotalesCostoDirecto(ws, rowNum, cols, costoCols, paresDelta, {
      firstRow: firstDataRow,
      lastRow: lastDataRow,
      label: 'TOTAL COSTO DIRECTO',
    })
  }

  ajustarAnchosColumnas(ws, versionesOrd, 36)
  ws.views = [{ showGridLines: false }]
}

/** Una pestaña = un tramo (encabezado + ítems + subtotal por capítulo + total tramo). */
function escribirHojaTramo(
  ws,
  tramoLabel,
  block,
  versionesOrd,
  exportCtx,
  { sheetName, tramoRefs } = {},
) {
  prepararHojaCompare(ws)
  const { capitulosUnion, itemsByCap } = block
  const includePct = true
  const totalCols = buildVersionColumnPlan(versionesOrd, LABEL_COUNT_ITEMS, { includePct }).length
  const headerRow = escribirEncabezadoInforme(ws, totalCols, {
    ...exportCtx,
    subtituloDestacado: `Tramo: ${tramoLabel}`,
  })

  const { cols, firstDataRow } = escribirEncabezadosCompare(ws, versionesOrd, headerRow, {
    labelHeaders: LABEL_HEADERS_ITEMS,
    includePct,
  })
  const costoCols = indicesColumnasCosto(cols)
  const paresDelta = paresCostoParaDelta(cols)
  let rowNum = firstDataRow
  const chapterSubRows = []

  capitulosUnion.forEach((cap) => {
    const itemRows = itemsByCap[cap]
    if (!itemRows) return

    const itemKeys = unionItemKeysCapitulo(cap, itemsByCap)
    if (!itemKeys.length) return

    const chapterStartRow = rowNum

    itemKeys.forEach((itemKey) => {
      const descripcion = resolverDescripcionItem(itemRows, itemKey)
      escribirFilasItem(ws, rowNum, { itemKey, descripcion }, ANCHO_DESC_TRAMO)

      const meta = resolverMetaItem(itemRows, itemKey, versionesOrd)
      escribirFilaItemConMeta(
        ws,
        rowNum,
        cols,
        (versionId) => obtenerItemDeVersion(itemRows, versionId, itemKey),
        meta,
      )

      if (tramoRefs && sheetName) {
        versionesOrd.forEach((v) => {
          const cantCol = cols.findIndex((c) => c.key === `${v.id}-cant`) + 1
          if (cantCol > 0) {
            registrarRefCantTramo(tramoRefs, tramoLabel, sheetName, cap, itemKey, v.id, cantCol, rowNum)
          }
        })
      }

      rowNum += 1
    })

    const capSubLabel = `Subtotal cap. — ${cap}`
    escribirSubtotalCapitulo(ws, rowNum, cols, costoCols, paresDelta, {
      firstItemRow: chapterStartRow,
      lastItemRow: rowNum - 1,
      labelText: capSubLabel,
    })
    chapterSubRows.push(rowNum)
    rowNum += 1
  })

  if (chapterSubRows.length) {
    escribirSubtotalTramo(ws, rowNum, cols, costoCols, paresDelta, chapterSubRows, tramoLabel)
  }

  ajustarAnchosColumnas(
    ws,
    versionesOrd,
    [ANCHO_ITEM, ANCHO_DESC_TRAMO, ANCHO_UND, ANCHO_VLR_UNIT],
    { includePct },
  )
  ws.views = [{ showGridLines: false }]
}

function cmpCapitulo(a, b) {
  const key = (c) => {
    const m = String(c ?? '').match(/^(\d+)/)
    return m ? [0, parseInt(m[1], 10), c] : [1, 0, c]
  }
  const ka = key(a)
  const kb = key(b)
  if (ka[0] !== kb[0]) return ka[0] - kb[0]
  if (ka[1] !== kb[1]) return ka[1] - kb[1]
  return String(ka[2] ?? '').localeCompare(String(kb[2] ?? ''), 'es', { numeric: true })
}

export async function fetchVersionCompareTramosData({
  API,
  contratoId,
  token,
  versionesOrd,
  tramosList,
}) {
  const tramosExport = Array.isArray(tramosList) && tramosList.length ? tramosList : [null]
  const authHeaders = { Authorization: `Bearer ${token}` }

  const entries = await Promise.all(
    tramosExport.map(async (tramoName) => {
      const qsCap = tramoName ? `?tramo=${encodeURIComponent(String(tramoName))}` : ''
      const capsByVersion = await Promise.all(
        versionesOrd.map(async (v) => {
          const res = await fetch(
            `${API}/presupuesto/${contratoId}/versiones/${v.id}/capitulos-lista${qsCap}`,
            { headers: authHeaders },
          )
          const caps = res.ok ? await res.json() : []
          return { version: v, caps: Array.isArray(caps) ? caps : [] }
        }),
      )

      const capSet = new Set()
      capsByVersion.forEach(({ caps }) => caps.forEach((c) => capSet.add(c.capitulo)))
      const capitulosUnion = [...capSet].sort(cmpCapitulo)
      if (!capitulosUnion.length) return null

      const itemsByCap = {}
      await Promise.all(
        capitulosUnion.map(async (cap) => {
          const rows = await Promise.all(
            versionesOrd.map(async (v) => {
              const p = new URLSearchParams({ capitulo: cap })
              if (tramoName) p.set('tramo', String(tramoName))
              const res = await fetch(
                `${API}/presupuesto/${contratoId}/versiones/${v.id}/items-lista?${p.toString()}`,
                { headers: authHeaders },
              )
              const items = res.ok ? await res.json() : []
              return { version: v, items: Array.isArray(items) ? items : [] }
            }),
          )
          itemsByCap[cap] = rows
        }),
      )

      const label = tramoName ? String(tramoName) : '(Sin tramo)'
      return [label, { capitulosUnion, itemsByCap }]
    }),
  )

  return Object.fromEntries(entries.filter(Boolean))
}

function colCantidadVersion(versionesOrd, versionIndex, labelCount, includePct) {
  let col = labelCount + 1
  for (let vi = 0; vi < versionIndex; vi += 1) {
    col += vi > 0 ? columnasDelta(includePct) : columnasPorVersion()
  }
  return col
}

function medirFirstDataRowCompare(wb, versionesOrd, labelCount, exportCtx, subtituloDestacado, labelHeaders, includePct) {
  const totalCols = buildVersionColumnPlan(versionesOrd, labelCount, { includePct }).length
  const tmpName = `__plan_${Date.now()}`
  const tmp = wb.addWorksheet(tmpName)
  const headerRow = escribirEncabezadoInforme(tmp, totalCols, { ...exportCtx, subtituloDestacado })
  const { firstDataRow } = escribirEncabezadosCompare(tmp, versionesOrd, headerRow, { labelHeaders, includePct })
  wb.removeWorksheet(tmp.id)
  return firstDataRow
}

function planificarRefsTramos(wb, tramoEntries, versionesOrd, exportCtx) {
  const tramoRefs = crearRegistroRefsTramo()
  const includePct = true
  tramoEntries.forEach(({ tramoLabel, sheetName, block }) => {
    const firstDataRow = medirFirstDataRowCompare(
      wb,
      versionesOrd,
      LABEL_COUNT_ITEMS,
      exportCtx,
      `Tramo: ${tramoLabel}`,
      LABEL_HEADERS_ITEMS,
      includePct,
    )
    let rowNum = firstDataRow
    block.capitulosUnion.forEach((cap) => {
      const itemKeys = unionItemKeysCapitulo(cap, block.itemsByCap)
      itemKeys.forEach((itemKey) => {
        versionesOrd.forEach((v, vi) => {
          const cantCol = colCantidadVersion(versionesOrd, vi, LABEL_COUNT_ITEMS, includePct)
          registrarRefCantTramo(tramoRefs, tramoLabel, sheetName, cap, itemKey, v.id, cantCol, rowNum)
        })
        rowNum += 1
      })
      rowNum += 1
    })
  })
  return tramoRefs
}

function reservarNombreHoja(baseName, usedNames) {
  let sheetName = safeSheetName(baseName)
  let n = 1
  while (usedNames.has(sheetName.toLowerCase())) {
    const suffix = `_${n}`
    sheetName = safeSheetName(`${String(baseName).slice(0, 31 - suffix.length)}${suffix}`)
    n += 1
  }
  usedNames.add(sheetName.toLowerCase())
  return sheetName
}

export async function downloadVersionCompareExcel({
  versionesOrd,
  capitulosUnion,
  getCapData,
  itemsByCap,
  tramosData = null,
  metaContrato = null,
  alcanceLabel = 'General',
  contratoId,
  exportadoPor,
  filename,
  usuario = null,
}) {
  const wb = new ExcelJS.Workbook()
  const meta = { ...(metaContrato || {}) }
  if (!meta.logo_contratista && usuario?.logo_contratista) {
    meta.logo_contratista = usuario.logo_contratista
  }
  const logoImageId = await prepararLogoWorkbook(wb, meta.logo_contratista)
  aplicarTemaExportCompare(meta.export_palette)
  const generatedAt = new Date()
  wb.created = generatedAt
  wb.creator = meta.contratista ? `${meta.contratista} · Presupuesto` : 'Presupuesto'

  const exportCtx = {
    metaContrato: meta,
    versionesOrd,
    alcanceLabel,
    exportadoPor,
    generatedAt,
    logoImageId,
  }

  const usedNames = new Set()
  const tramoLabels =
    tramosData && Object.keys(tramosData).length
      ? Object.keys(tramosData).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      : []
  const tramoEntries = tramoLabels.map((tramoLabel) => ({
    tramoLabel,
    sheetName: reservarNombreHoja(tramoLabel, usedNames),
    block: tramosData[tramoLabel],
  }))

  const tramoRefs = tramoEntries.length
    ? planificarRefsTramos(wb, tramoEntries, versionesOrd, exportCtx)
    : crearRegistroRefsTramo()

  const wsCap = wb.addWorksheet(reservarNombreHoja('Capítulos', usedNames), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  escribirHojaCapitulos(wsCap, versionesOrd, capitulosUnion, getCapData, exportCtx)

  const wsItems = wb.addWorksheet(reservarNombreHoja('Ítems', usedNames), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  escribirHojaItems(wsItems, versionesOrd, capitulosUnion, itemsByCap, exportCtx, {
    tramoRefs,
    tramoLabels,
  })

  tramoEntries.forEach(({ tramoLabel, sheetName, block }) => {
    const ws = wb.addWorksheet(sheetName, {
      views: [{ showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    })
    escribirHojaTramo(ws, tramoLabel, block, versionesOrd, exportCtx, { sheetName, tramoRefs })
  })

  const wsInfo = wb.addWorksheet('Info')
  wsInfo.getCell(1, 1).value = 'Alcance'
  wsInfo.getCell(1, 2).value = alcanceLabel
  wsInfo.getCell(2, 1).value = 'Versiones'
  wsInfo.getCell(2, 2).value = versionesOrd.map((v) => v.etiqueta).join(' · ')
  wsInfo.getCell(3, 1).value = 'Generado'
  wsInfo.getCell(3, 2).value = new Date().toLocaleString('es-CO')
  wsInfo.state = 'hidden'

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = versionesOrd.map((v) => `v${v.numero_version ?? v.id}`).join('_vs_')
  a.download =
    filename ||
    `comparacion_presupuesto_${contratoId ?? 'NA'}_${slug}_${alcanceLabel.replace(/[^\w.-]+/g, '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
