/**
 * Ajuste manual de ancho de columna en tablas TipTap
 * (arrastre nativo resizable + valor numérico, como en esquemas).
 */

export function parseColWidthAttr(raw) {
  if (raw == null || raw === '') return null
  if (Array.isArray(raw)) {
    const n = Number(raw[0])
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }
  const parts = String(raw)
    .split(',')
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
  return parts.length ? parts[0] : null
}

/** Ancho actual de la celda activa (atributo colwidth TipTap). */
export function currentCellColWidth(editor) {
  if (!editor) return null
  const cell = editor.getAttributes('tableCell')
  const header = editor.getAttributes('tableHeader')
  const attrs = (cell && (cell.colwidth != null || Object.keys(cell).length)) ? cell : header
  if (!attrs) return null
  return parseColWidthAttr(attrs.colwidth)
}

/**
 * Índice de columna (0-based) de la celda que contiene `$from`.
 */
export function columnIndexFromSelection(state) {
  const { selection, doc } = state
  const $from = selection.$from
  let cellDepth = -1
  for (let d = $from.depth; d > 0; d -= 1) {
    const name = $from.node(d).type.name
    if (name === 'tableCell' || name === 'tableHeader') {
      cellDepth = d
      break
    }
  }
  if (cellDepth < 0) return null
  const rowDepth = cellDepth - 1
  if (rowDepth < 1 || $from.node(rowDepth).type.name !== 'tableRow') return null
  const row = $from.node(rowDepth)
  const cellPos = $from.before(cellDepth)
  let pos = $from.before(rowDepth) + 1
  for (let i = 0; i < row.childCount; i += 1) {
    if (pos === cellPos) return i
    pos += row.child(i).nodeSize
  }
  // Fallback identidad
  const cellNode = doc.nodeAt(cellPos)
  for (let i = 0; i < row.childCount; i += 1) {
    if (row.child(i) === cellNode) return i
  }
  return null
}

/**
 * Aplica ancho (px) a todas las celdas de la columna activa.
 * @returns {boolean}
 */
export function applyColumnWidthPx(editor, widthPx, { min = 40, max = 640 } = {}) {
  if (!editor || !editor.isActive('table')) return false
  let w = Math.round(Number(widthPx))
  if (!Number.isFinite(w)) return false
  w = Math.max(min, Math.min(max, w))

  const { state } = editor
  const { selection } = state
  const $from = selection.$from
  let tableDepth = -1
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type.name === 'table') {
      tableDepth = d
      break
    }
  }
  if (tableDepth < 0) return false
  const colIndex = columnIndexFromSelection(state)
  if (colIndex == null) return false

  const tableStart = $from.before(tableDepth)
  const tableNode = $from.node(tableDepth)
  let tr = state.tr
  let changed = false
  let rowPos = tableStart + 1
  for (let r = 0; r < tableNode.childCount; r += 1) {
    const rowNode = tableNode.child(r)
    if (rowNode.type.name !== 'tableRow') {
      rowPos += rowNode.nodeSize
      continue
    }
    if (colIndex < rowNode.childCount) {
      let cellStart = rowPos + 1
      for (let c = 0; c < colIndex; c += 1) {
        cellStart += rowNode.child(c).nodeSize
      }
      const target = rowNode.child(colIndex)
      if (target.type.name === 'tableCell' || target.type.name === 'tableHeader') {
        tr = tr.setNodeMarkup(cellStart, undefined, { ...target.attrs, colwidth: [w] })
        changed = true
      }
    }
    rowPos += rowNode.nodeSize
  }
  if (!changed) return false
  editor.view.dispatch(tr)
  return true
}
