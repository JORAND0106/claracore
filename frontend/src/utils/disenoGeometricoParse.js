import * as XLSX from 'xlsx'

const COL_MAP = {
  tramo: ['tramo', 'sector'],
  abscisa: ['abscisa', 'pk', 'progresiva', 'estacion'],
  cota_izquierda: ['izquierda', 'izq', 'left', 'cota_izquierda', 'cota izquierda'],
  cota_eje: ['eje', 'centro', 'cota_eje', 'cota eje'],
  cota_derecha: ['derecha', 'der', 'right', 'cota_derecha', 'cota derecha'],
  ancho: ['ancho', 'width', 'ancho_calzada', 'ancho calzada'],
}

function normHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

const HEADER_FIELD_ORDER = [
  'cota_izquierda',
  'cota_eje',
  'cota_derecha',
  'abscisa',
  'ancho',
  'tramo',
]

function mapHeaders(headers) {
  const mapped = {}
  headers.forEach((raw, i) => {
    const nh = normHeader(raw)
    for (const field of HEADER_FIELD_ORDER) {
      const aliases = COL_MAP[field]
      if (aliases.includes(nh) || nh === field) {
        mapped[i] = field
        break
      }
    }
  })
  return mapped
}

function parseNum(val) {
  if (val == null || val === '') return null
  const s = String(val).trim().replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function rowToFila(mapped, row) {
  const data = {}
  Object.entries(mapped).forEach(([i, field]) => {
    const raw = row[Number(i)]
    if (field === 'tramo') {
      const t = String(raw ?? '').trim()
      if (t) data.tramo = t
    } else if (field === 'abscisa') {
      const v = parseNum(raw)
      if (v != null) data.abscisa = v
    } else {
      const v = parseNum(raw)
      if (v != null) data[field] = v
    }
  })
  return data.abscisa != null ? data : null
}

/** Parsea primera hoja Excel (.xlsx) a filas de diseño geométrico. */
export function parseDisenoExcelBuffer(buf) {
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) throw new Error('El archivo Excel está vacío.')
  const mapped = mapHeaders(rows[0])
  if (!Object.values(mapped).includes('abscisa')) {
    throw new Error('Faltan columnas. Use: TRAMO, ABSCISA, IZQUIERDA, EJE, DERECHA, ANCHO.')
  }
  const filas = []
  rows.slice(1).forEach((row) => {
    if (!row.some((c) => String(c).trim())) return
    const f = rowToFila(mapped, row)
    if (f) filas.push(f)
  })
  if (!filas.length) throw new Error('No se encontraron filas válidas con ABSCISA.')
  return filas
}
