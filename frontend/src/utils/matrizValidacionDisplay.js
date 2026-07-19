/** Encabezados por defecto de columnas de validación SICOE (N1–N6). */
export const SICOE_NIVEL_ENCABEZADO_FALLBACK = {
  1: 'Inspector (N1)',
  2: 'Residente (N2)',
  3: 'Interventoría (N3)',
  4: 'Interventoría (N4)',
  5: 'Interventoría (N5)',
  6: 'Interventoría (N6)',
}

/** Valor columna matriz por nivel. Con strictNivel=true solo claves nivel{N}. */
export function matrizValorNivel(cols, nivelNum, strictNivel = false) {
  if (!cols || typeof cols !== 'object') return 0
  const k = `nivel${nivelNum}`
  if (cols[k] != null && cols[k] !== '') return cols[k]
  if (strictNivel) return 0
  const legacy = {
    1: 'inspector',
    2: 'residente',
    3: 'interventoria',
    4: 'interventoria',
    5: 'interventoria',
    6: 'interventoria',
  }
  const leg = legacy[Number(nivelNum)]
  return leg && cols[leg] != null ? cols[leg] : 0
}

export function dashMatrizThDesdeNiveles(nivelesContrato, nivelNum) {
  const n = Number(nivelNum)
  if (!Number.isFinite(n) || n < 1) return `Nivel ${nivelNum}`
  const row = (nivelesContrato?.niveles || []).find((x) => Number(x?.nivel) === n)
  const base =
    (row?.encabezado && String(row.encabezado).trim()) ||
    SICOE_NIVEL_ENCABEZADO_FALLBACK[n] ||
    `Nivel ${n}`
  if (new RegExp(`\\(N${n}\\)`, 'i').test(base) || new RegExp(`\\bN${n}\\b`).test(base)) return base
  return `${base} (N${n})`
}

export const MATRIZ_VALIDACION_FILAS = [
  { key: 'aprobado', label: 'APROBADO', bg: '#DCFCE7', dark: false },
  { key: 'pendiente', label: 'PENDIENTES', bg: '#FEF9C3', dark: false },
  { key: 'pendiente_item', label: 'PENDIENTE N', bg: '#DBEAFE', dark: false, dynamicLabel: true },
  { key: 'no_revisado', label: 'NO REVISADOS', bg: '#E9D5FF', dark: false },
  { key: 'rechazado', label: 'RECHAZADOS', bg: '#FECACA', dark: false },
  { key: 'habilitado', label: 'HABILITADO VALIDACIÓN', bg: '#374151', dark: true },
  { key: 'otras_actas', label: 'PENDIENTES OTRAS ACTAS', bg: '#FEF9C3', dark: false },
]

export function mergeMatrizBloque(bloque, colsMatriz) {
  const empty = () =>
    Object.fromEntries(colsMatriz.map((n) => [`nivel${n}`, 0]))
  const e = {
    aprobado: empty(),
    pendiente: empty(),
    pendiente_item: empty(),
    no_revisado: empty(),
    rechazado: empty(),
    habilitado: empty(),
    otras_actas: empty(),
  }
  if (!bloque || typeof bloque !== 'object') return e
  for (const k of Object.keys(e)) {
    if (bloque[k] && typeof bloque[k] === 'object') {
      e[k] = { ...e[k], ...bloque[k] }
    }
  }
  return e
}
