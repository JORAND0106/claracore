/**
 * Pegado tipo Excel en el panel de coordenadas topográficas (portada SicoeObra).
 * Bloque TSV/CSV → celdas desde la posición del cursor; crea filas si hacen falta.
 */

export const SICOE_PORTADA_TOPO_CAMPOS = Object.freeze([
  'punto',
  'norte',
  'este',
  'cota',
  'descripcion',
])

export const SICOE_PORTADA_TOPO_LABELS = Object.freeze({
  punto: 'Punto',
  norte: 'Norte',
  este: 'Este',
  cota: 'Cota',
  descripcion: 'Descripción',
})

/** Columnas que deben ser numéricas (vacío permitido). */
export const SICOE_PORTADA_TOPO_CAMPOS_NUMERICOS = Object.freeze(['norte', 'este', 'cota'])

export function puntoTopoVacio() {
  return { punto: '', norte: '', este: '', cota: '', descripcion: '' }
}

/**
 * Normaliza un valor pegado desde Excel (coma decimal, miles es-CO).
 * @param {unknown} v
 * @returns {string}
 */
export function normalizarValorPasteTopo(v) {
  let s = String(v ?? '').trim()
  if (!s) return ''
  // 1.234,56 → 1234.56
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.')
  }
  return s
}

/**
 * True si el texto del portapapeles aporta más de una celda (filas/columnas).
 * Un solo valor sin tab/salto se deja al pegado nativo del input.
 */
export function esPasteMasivoTopo(text) {
  if (text == null || text === '') return false
  const grid = parseClipboardGridTopo(text)
  if (grid.length > 1) return true
  if (grid.length === 1 && grid[0].length > 1) return true
  if (grid.length === 1 && grid[0].length === 1 && /[\n\r\t]/.test(String(text))) return true
  return false
}

/**
 * Interpreta clipboard Excel (TSV; CSV si no hay tabs) como matriz de strings.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseClipboardGridTopo(text) {
  if (text == null || text === '') return []
  const raw = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = raw.split('\n')
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (!lines.length) return []
  const hasTab = lines.some((l) => l.includes('\t'))
  return lines.map((line) => {
    const parts = hasTab ? line.split('\t') : line.split(',')
    return parts.map((c) => String(c ?? '').trim())
  })
}

/**
 * ¿El valor es válido para la columna? Vacío siempre OK.
 * Numéricos: acepta coma/punto y miles; texto no numérico → inválido.
 */
export function esValorValidoCampoTopo(campo, raw) {
  const s = String(raw ?? '').trim()
  if (!s) return true
  if (!SICOE_PORTADA_TOPO_CAMPOS_NUMERICOS.includes(campo)) return true
  const norm = normalizarValorPasteTopo(s)
  if (!norm) return true
  const n = Number(norm)
  return Number.isFinite(n)
}

/**
 * Valor a guardar en la fila tras pegar (numéricos normalizados a punto).
 */
export function valorPegadoParaCampo(campo, raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (SICOE_PORTADA_TOPO_CAMPOS_NUMERICOS.includes(campo)) {
    return normalizarValorPasteTopo(s)
  }
  return s
}

/**
 * Aplica una matriz pegada sobre `filas` desde (startRow, startColKey).
 * Extiende filas si hace falta; reemplaza celdas cubiertas.
 *
 * @param {object[]} filas
 * @param {number} startRow
 * @param {string} startColKey
 * @param {string[][]} grid
 * @returns {{ filas: object[], invalidas: Array<{ row: number, campo: string, valor: string }>, mensaje: string }}
 */
export function aplicarPasteGridTopo(filas, startRow, startColKey, grid) {
  const cols = SICOE_PORTADA_TOPO_CAMPOS
  const startCol = cols.indexOf(startColKey)
  const start = Math.max(0, Number(startRow) || 0)
  const matrix = Array.isArray(grid) ? grid : []
  if (!matrix.length || startCol < 0) {
    return {
      filas: Array.isArray(filas) ? filas.map((r) => ({ ...puntoTopoVacio(), ...r })) : [],
      invalidas: [],
      mensaje: '',
    }
  }

  const next = (Array.isArray(filas) ? filas : []).map((r) => ({ ...puntoTopoVacio(), ...r }))
  const needed = start + matrix.length
  while (next.length < needed) next.push(puntoTopoVacio())

  const invalidas = []
  for (let r = 0; r < matrix.length; r++) {
    const rowVals = matrix[r] || []
    for (let c = 0; c < rowVals.length; c++) {
      const colIdx = startCol + c
      if (colIdx < 0 || colIdx >= cols.length) break
      const campo = cols[colIdx]
      const raw = rowVals[c]
      const valor = valorPegadoParaCampo(campo, raw)
      const rowIdx = start + r
      next[rowIdx] = { ...next[rowIdx], [campo]: valor }
      if (!esValorValidoCampoTopo(campo, raw)) {
        invalidas.push({ row: rowIdx, campo, valor: String(raw ?? '').trim() })
      }
    }
  }

  let mensaje = ''
  if (invalidas.length) {
    const muestras = invalidas.slice(0, 4).map((x) => {
      const label = SICOE_PORTADA_TOPO_LABELS[x.campo] || x.campo
      return `fila ${x.row + 1}, ${label} («${x.valor}»)`
    })
    const extra = invalidas.length > 4 ? ` y ${invalidas.length - 4} más` : ''
    mensaje = `Algunos datos pegados no son números válidos: ${muestras.join('; ')}${extra}. Se conservaron; corríjalos antes de guardar.`
  }

  return { filas: next, invalidas, mensaje }
}

/**
 * Clave de celda inválida para resaltar en UI.
 */
export function claveCeldaTopo(row, campo) {
  return `${row}:${campo}`
}
