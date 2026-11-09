import * as XLSX from 'xlsx'

const COL_MAP = {
  tramo: ['tramo', 'sector'],
  abscisa: ['abscisa', 'pk', 'progresiva', 'estacion', 'estaca', 'cadena'],
  cota_izquierda: [
    'izquierda', 'izq', 'left', 'cota_izquierda', 'cota_izq',
    'elev_izquierda', 'elevacion_izquierda', 'elev_izq',
    'z_izquierda', 'z_izq', 'nivel_izquierda',
  ],
  cota_eje: [
    'eje', 'centro', 'center', 'cota_eje', 'elev_eje',
    'elevacion_eje', 'elev_centro', 'z_eje', 'nivel_eje',
  ],
  cota_derecha: [
    'derecha', 'der', 'right', 'cota_derecha', 'cota_der',
    'elev_derecha', 'elevacion_derecha', 'elev_der',
    'z_derecha', 'z_der', 'nivel_derecha',
  ],
  ancho: ['ancho', 'width', 'ancho_calzada', 'ancho_via'],
}

const COTA_FIELDS = ['cota_izquierda', 'cota_eje', 'cota_derecha']

const HEADER_FIELD_ORDER = [
  'cota_izquierda',
  'cota_eje',
  'cota_derecha',
  'abscisa',
  'ancho',
  'tramo',
]

function normHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/_(m|msnm|ml|mts|metros?)$/g, '')
    .replace(/^_|_$/g, '')
}

function headerMatches(nh, alias) {
  if (!nh) return false
  const aliasN = normHeader(alias)
  if (nh === aliasN || nh === alias) return true
  if (nh.replace(/_/g, '') === aliasN.replace(/_/g, '')) return true
  const tokens = new Set(nh.split('_').filter(Boolean))
  const aliasTokens = aliasN.split('_').filter(Boolean)
  return aliasTokens.length > 0 && aliasTokens.every((t) => tokens.has(t))
}

export function mapDisenoHeaders(headers) {
  const mapped = {}
  const used = new Set()
  headers.forEach((raw, i) => {
    const nh = normHeader(raw)
    for (const field of HEADER_FIELD_ORDER) {
      if (used.has(field)) continue
      const aliases = COL_MAP[field]
      if (nh === field || aliases.some((a) => headerMatches(nh, a))) {
        mapped[i] = field
        used.add(field)
        break
      }
    }
  })
  return mapped
}

function parseNum(val) {
  if (val == null || val === '') return null
  const s = String(val).trim().replace(/\s/g, '').replace(',', '.')
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

function findHeaderRow(rows, maxScan = 20) {
  let bestI = -1
  let bestMapped = null
  let bestScore = -1
  const limit = Math.min(rows.length, maxScan)
  for (let i = 0; i < limit; i += 1) {
    const mapped = mapDisenoHeaders((rows[i] || []).map((c) => (c == null ? '' : String(c))))
    const vals = Object.values(mapped)
    if (!vals.includes('abscisa')) continue
    let score = vals.length
    if (vals.some((f) => COTA_FIELDS.includes(f))) score += 10
    if (score > bestScore) {
      bestScore = score
      bestI = i
      bestMapped = mapped
    }
  }
  if (bestI < 0 || !bestMapped) {
    throw new Error(
      'No se encontró la fila de encabezados. Use columnas: TRAMO, ABSCISA, IZQUIERDA, EJE, DERECHA, ANCHO.',
    )
  }
  return { headerIndex: bestI, mapped: bestMapped }
}

export function assertFilasConCotas(filas, mappedFields) {
  if (mappedFields) {
    const halladas = COTA_FIELDS.filter((f) => mappedFields.has(f))
    if (!halladas.length) {
      throw new Error(
        'No se reconocieron columnas de cotas. '
        + 'Se esperan IZQUIERDA, EJE y DERECHA (o equivalentes como Cota Izq / Elevación Eje). '
        + 'Revise los encabezados del archivo; la carga no inventa valores.',
      )
    }
    const faltantes = COTA_FIELDS
      .filter((f) => !mappedFields.has(f))
      .map((f) => f.replace('cota_', '').toUpperCase())
    if (faltantes.length) {
      throw new Error(
        `Faltan columnas de cotas: ${faltantes.join(', ')}. `
        + 'Use la plantilla: TRAMO, ABSCISA, IZQUIERDA, EJE, DERECHA, ANCHO.',
      )
    }
  }
  if (!filas.length) {
    throw new Error('No se encontraron filas válidas con ABSCISA.')
  }
  const conCota = filas.filter((f) => COTA_FIELDS.some((k) => f[k] != null)).length
  if (!conCota) {
    throw new Error(
      'Se leyeron las abscisas, pero ninguna fila tiene cotas numéricas en IZQUIERDA, EJE o DERECHA. '
      + 'Revise que esas columnas tengan valores y no estén vacías.',
    )
  }
}

function filasDesdeMatriz(rows) {
  const { headerIndex, mapped } = findHeaderRow(rows)
  const filas = []
  rows.slice(headerIndex + 1).forEach((row) => {
    if (!row?.some?.((c) => String(c).trim())) return
    const f = rowToFila(mapped, row)
    if (f) filas.push(f)
  })
  assertFilasConCotas(filas, new Set(Object.values(mapped)))
  return filas
}

/** Nombres de hojas de un Excel (.xlsx / .xls). */
export function listDisenoExcelSheetNames(buf) {
  const wb = XLSX.read(buf, { type: 'array' })
  const names = Array.isArray(wb.SheetNames) ? wb.SheetNames.filter(Boolean) : []
  if (!names.length) throw new Error('El archivo Excel no tiene hojas.')
  return names
}

/**
 * Parsea una hoja Excel a filas de diseño geométrico.
 * @param {ArrayBuffer} buf
 * @param {{ sheetName?: string }} [opts] — si no se indica, usa la primera hoja.
 */
export function parseDisenoExcelBuffer(buf, opts = {}) {
  const wb = XLSX.read(buf, { type: 'array' })
  const names = Array.isArray(wb.SheetNames) ? wb.SheetNames : []
  if (!names.length) throw new Error('El archivo Excel no tiene hojas.')
  const wanted = (opts.sheetName || '').trim()
  const sheetName = wanted
    ? names.find((n) => String(n) === wanted)
    : names[0]
  if (!sheetName) {
    throw new Error(`No se encontró la hoja «${wanted}» en el Excel.`)
  }
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`La hoja «${sheetName}» está vacía o no es válida.`)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) throw new Error(`La hoja «${sheetName}» está vacía.`)
  return filasDesdeMatriz(rows)
}

/** Ordenadas de referencia IZQ / EJE / DER según tipo de sección (misma lógica del backend). */
export function ordenadasReferenciaSeccion(tipo, anchoVia) {
  const w = Number(anchoVia)
  const ancho = Number.isFinite(w) && w > 0 ? w : 7
  if (tipo === 'B') return [-ancho, -ancho / 2, 0]
  if (tipo === 'C') return [0, ancho / 2, ancho]
  return [-ancho / 2, 0, ancho / 2]
}

/**
 * Construye puntos transversales para la vista previa a partir de rasante
 * cuando el backend aún no devolvió perfil_puntos (o vienen vacíos).
 * No inventa cotas: solo proyecta las que ya existen en la fila.
 */
export function sintetizarPerfilDesdeRasante(rasante, eje) {
  const rows = Array.isArray(rasante) ? rasante : []
  const tipo = eje?.tipo_seccion || 'A'
  const ancho = Number(eje?.ancho_via_m)
    || Number(rows.find((r) => r?.ancho != null)?.ancho)
    || 7
  const refs = ordenadasReferenciaSeccion(tipo, ancho)
  const out = []
  rows.forEach((r) => {
    const cotas = [r?.cota_izquierda, r?.cota_eje, r?.cota_derecha]
    refs.forEach((ord, i) => {
      const cota = cotas[i]
      if (cota == null || cota === '') return
      const n = Number(cota)
      if (!Number.isFinite(n)) return
      out.push({
        abscisa: r.abscisa,
        ordenada: ord,
        cota: n,
        es_referencia: true,
      })
    })
  })
  return out
}
