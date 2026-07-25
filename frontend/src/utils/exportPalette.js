/** Paleta por defecto: fondo + texto por nivel. */
export const EXPORT_PALETTE_DEFAULTS = {
  encabezado: { bg: '#DDEFF8', text: '#0F2942' },
  titulo_1: { bg: '#EEF7FB', text: '#0F2942' },
  titulo_2: { bg: '#E5F4FA', text: '#1F4E70' },
  linea_principal: { bg: '#FFFFFF', text: '#0F2942' },
  linea_secundaria: { bg: '#F8FAFC', text: '#0F2942' },
}

export const EXPORT_PALETTE_TIERS = [
  {
    key: 'encabezado',
    label: 'Encabezado',
    hint: 'Banda principal del informe (título del exporte y totales generales).',
  },
  {
    key: 'titulo_1',
    label: 'Título 1',
    hint: 'Metadatos del contrato, objeto, versiones comparadas.',
  },
  {
    key: 'titulo_2',
    label: 'Título 2',
    hint: 'Subtítulos de sección y encabezados de columnas en tablas.',
  },
  {
    key: 'linea_principal',
    label: 'Líneas principales',
    hint: 'Filas impares de la grilla (texto más marcado, fondo base).',
  },
  {
    key: 'linea_secundaria',
    label: 'Líneas secundarias',
    hint: 'Filas pares alternadas — tono tenue para que la tabla no se vea plana.',
  },
]

/** Compatibilidad con paletas anteriores. */
const LEGACY_BG_KEYS = {
  encabezado: 'encabezado',
  titulo_1: 'subtitulos',
  titulo_2: 'cuerpo_principal',
  linea_principal: 'cuerpo_principal',
  linea_secundaria: 'cuerpo_secundario',
}

function normHex(v) {
  if (v == null || v === '') return null
  let s = String(v).trim()
  if (!s.startsWith('#')) s = `#${s}`
  if (!/^#[0-9A-Fa-f]{6}$/.test(s)) return null
  return s.toUpperCase()
}

function readTier(raw, tierKey, defaults) {
  const def = defaults[tierKey] || { bg: '#FFFFFF', text: '#0F2942' }
  const block = raw?.[tierKey]
  const legacyBgKey = LEGACY_BG_KEYS[tierKey]

  let bg = null
  let text = null

  if (block && typeof block === 'object' && !Array.isArray(block)) {
    bg = normHex(block.bg)
    text = normHex(block.text)
  } else if (typeof block === 'string') {
    bg = normHex(block)
  }

  if (!bg && legacyBgKey) bg = normHex(raw?.[legacyBgKey])
  if (!bg && tierKey === 'encabezado') bg = normHex(raw?.encabezado)
  if (!text) text = normHex(raw?.[`${tierKey}_text`])

  // Migración: tier único "cuerpos" → línea secundaria
  if (tierKey === 'linea_secundaria' && !bg && raw?.cuerpos) {
    const c = raw.cuerpos
    if (typeof c === 'object') {
      bg = normHex(c.bg)
      text = normHex(c.text)
    } else {
      bg = normHex(c)
    }
  }

  return {
    bg: bg || def.bg,
    text: text || def.text,
  }
}

export function mergeExportPalette(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  EXPORT_PALETTE_TIERS.forEach(({ key }) => {
    out[key] = readTier(src, key, EXPORT_PALETTE_DEFAULTS)
  })
  return out
}

export function hexToExcelArgb(hex) {
  const h = normHex(hex)
  if (!h) return null
  return `FF${h.slice(1).toUpperCase()}`
}

/** Tema Excel del comparador de versiones (y otros exports que lo reutilicen). */
export function buildCompareExcelColors(exportPalette) {
  const p = mergeExportPalette(exportPalette)
  return {
    title: hexToExcelArgb(p.encabezado.bg) || 'FFDDEFF8',
    titleText: hexToExcelArgb(p.encabezado.text) || 'FF0F2942',
    metaBg: hexToExcelArgb(p.titulo_1.bg) || 'FFEEF7FB',
    metaText: hexToExcelArgb(p.titulo_1.text) || 'FF0F2942',
    headerBg: hexToExcelArgb(p.titulo_2.bg) || 'FFE5F4FA',
    headerText: hexToExcelArgb(p.titulo_2.text) || 'FF1F4E70',
    rowBg: hexToExcelArgb(p.linea_principal.bg) || 'FFFFFFFF',
    rowText: hexToExcelArgb(p.linea_principal.text) || 'FF0F2942',
    rowBgAlt: hexToExcelArgb(p.linea_secundaria.bg) || 'FFF8FAFC',
    rowTextAlt: hexToExcelArgb(p.linea_secundaria.text) || 'FF0F2942',
    totalBg: hexToExcelArgb(p.encabezado.bg) || 'FFDDEFF8',
    totalText: hexToExcelArgb(p.encabezado.text) || 'FF0F2942',
    border: 'FF94A3B8',
    borderLight: 'FFE2E8F0',
    subtotalCapBg: 'FF64748B',
    subtotalTramoBg: 'FF475569',
    white: 'FFFFFFFF',
  }
}

export function setExportPaletteTier(prev, tierKey, field, value) {
  const merged = mergeExportPalette(prev)
  return {
    ...merged,
    [tierKey]: {
      ...merged[tierKey],
      [field]: value,
    },
  }
}
