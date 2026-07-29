/**
 * Catálogo y helpers de columnas de grilla por contrato (SicoeObra / Presupuesto).
 * Config a nivel contrato (no usuario), compartida por todos los usuarios del contrato.
 */

export const GRILLAS_UI_VERSION = 1

/** Columnas SicoeObra (desktop). `flex` = columna flexible (1fr). */
export const SICOE_OBRA_COLUMNAS = [
  { id: 'numero_reporte', label: 'N° REP.', defaultWidth: 64, locked: true },
  { id: 'fecha_creacion', label: 'F. CREACIÓN', defaultWidth: 110 },
  { id: 'tramo', label: 'TRAMO', defaultWidth: 84 },
  { id: 'costado', label: 'COSTADO', defaultWidth: 80 },
  { id: 'abcisa', label: 'ABCISA', defaultWidth: 112 },
  { id: 'nodo', label: 'NODO', defaultWidth: 124 },
  { id: 'descripcion', label: 'DESCRIPCIÓN', defaultWidth: 220, flex: true },
  { id: 'costo_directo', label: 'COSTO DIRECTO', defaultWidth: 100, roleGated: 'economia' },
  { id: 'capitulo', label: 'CAPÍTULO', defaultWidth: 96 },
  { id: 'regs', label: 'REGS.', defaultWidth: 64, locked: true },
]

/** Columnas Presupuesto (tabla principal desktop). */
export const PRESUPUESTO_COLUMNAS = [
  { id: 'check', label: 'Selección', defaultWidth: 56, locked: true },
  { id: 'id_pol', label: 'ID_POL', defaultWidth: 88, locked: true },
  { id: 'capitulo', label: 'Capítulo', defaultWidth: 140 },
  { id: 'competencia', label: 'Competencia', defaultWidth: 110 },
  { id: 'item', label: 'Ítem', defaultWidth: 72 },
  { id: 'descripcion', label: 'Descripción', defaultWidth: 200 },
  { id: 'und', label: 'Und', defaultWidth: 56 },
  { id: 'nodo_ini', label: 'No.Ini', defaultWidth: 72 },
  { id: 'nodo_fin', label: 'No.Fin', defaultWidth: 72 },
  { id: 'abs_inicio', label: 'Abs. Inicio', defaultWidth: 80 },
  { id: 'abs_final', label: 'Abs. Final', defaultWidth: 80 },
  { id: 'area_long', label: 'Área/Long', defaultWidth: 80 },
  { id: 'ancho', label: 'Ancho', defaultWidth: 64 },
  { id: 'espesor', label: 'Espesor', defaultWidth: 64 },
  { id: 'cant_total', label: 'Cant.Total', defaultWidth: 80 },
  { id: 'vlr_unit', label: 'Vlr Unit.', defaultWidth: 90, roleGated: 'economia' },
  { id: 'costo_directo', label: 'Costo Directo', defaultWidth: 100, roleGated: 'economia' },
  { id: 'depuracion', label: 'Depuración', defaultWidth: 100, roleGated: 'depuracion' },
  { id: 'revisado', label: 'Revisado', defaultWidth: 90 },
  { id: 'auditoria', label: 'Auditoría', defaultWidth: 48 },
  { id: 'comentarios', label: '💬', defaultWidth: 48 },
  { id: 'acciones', label: 'Acciones', defaultWidth: 48, locked: true },
]

const CATALOGOS = {
  sicoe_obra: SICOE_OBRA_COLUMNAS,
  presupuesto: PRESUPUESTO_COLUMNAS,
}

function _modKey(mod) {
  const k = String(mod || '').trim().toLowerCase()
  if (k === 'sicoe' || k === 'sicoeobra' || k === 'sicoe_obra') return 'sicoe_obra'
  if (k === 'ppto' || k === 'presupuesto') return 'presupuesto'
  return k
}

export function defaultModuloConfig(modulo) {
  const cat = CATALOGOS[_modKey(modulo)] || []
  return {
    columns: cat.map((c) => ({
      id: c.id,
      visible: true,
      width: c.defaultWidth,
    })),
  }
}

export function defaultGrillasUiConfig() {
  return {
    version: GRILLAS_UI_VERSION,
    sicoe_obra: defaultModuloConfig('sicoe_obra'),
    presupuesto: defaultModuloConfig('presupuesto'),
  }
}

/**
 * Normaliza config cruda del backend con defaults del catálogo.
 * Columnas locked siempre visible; ids desconocidos se ignoran.
 */
export function mergeGrillasUiConfig(raw) {
  const base = defaultGrillasUiConfig()
  if (!raw || typeof raw !== 'object') return base
  const out = { version: GRILLAS_UI_VERSION, sicoe_obra: null, presupuesto: null }
  for (const mod of ['sicoe_obra', 'presupuesto']) {
    const cat = CATALOGOS[mod]
    const byId = new Map()
    const src = raw[mod]?.columns
    if (Array.isArray(src)) {
      for (const row of src) {
        if (row && row.id) byId.set(String(row.id), row)
      }
    }
    out[mod] = {
      columns: cat.map((c) => {
        const prev = byId.get(c.id) || {}
        let visible = prev.visible !== false
        if (c.locked) visible = true
        let width = prev.width != null ? Number(prev.width) : c.defaultWidth
        if (!Number.isFinite(width) || width < 40) width = c.defaultWidth
        if (width > 640) width = 640
        return { id: c.id, visible, width }
      }),
    }
  }
  return out
}

/** Lista de columnas efectivas (visibles) con anchos para renderizar la grilla. */
export function resolveVisibleColumns(modulo, config, { verEconomia = true, verDepuracion = true } = {}) {
  const mod = _modKey(modulo)
  const cat = CATALOGOS[mod] || []
  const merged = mergeGrillasUiConfig(config)
  const byId = new Map((merged[mod]?.columns || []).map((c) => [c.id, c]))
  const out = []
  for (const meta of cat) {
    const cfg = byId.get(meta.id) || { visible: true, width: meta.defaultWidth }
    if (meta.roleGated === 'economia' && !verEconomia) continue
    if (meta.roleGated === 'depuracion' && !verDepuracion) continue
    if (!cfg.visible && !meta.locked) continue
    out.push({
      ...meta,
      visible: true,
      width: cfg.width || meta.defaultWidth,
    })
  }
  return out
}

/** grid-template-columns CSS a partir de columnas resueltas. */
export function buildGridTemplate(columns) {
  return columns
    .map((c) => (c.flex ? `minmax(${Math.max(120, c.width || 180)}px, 1.4fr)` : `${c.width || c.defaultWidth || 80}px`))
    .join(' ')
}

export function minWidthFromColumns(columns) {
  return columns.reduce((acc, c) => acc + (c.width || c.defaultWidth || 80) + 8, 32)
}

/** Actualiza width de una columna en la config mergeada. */
export function patchColumnWidth(config, modulo, columnId, widthPx) {
  const merged = mergeGrillasUiConfig(config)
  const mod = _modKey(modulo)
  const w = Math.max(40, Math.min(640, Math.round(Number(widthPx) || 80)))
  merged[mod] = {
    columns: (merged[mod].columns || []).map((c) =>
      c.id === columnId ? { ...c, width: w } : c,
    ),
  }
  return merged
}

/** Toggle visible (respeta locked). */
export function patchColumnVisible(config, modulo, columnId, visible) {
  const merged = mergeGrillasUiConfig(config)
  const mod = _modKey(modulo)
  const cat = CATALOGOS[mod] || []
  const meta = cat.find((c) => c.id === columnId)
  if (meta?.locked) return merged
  merged[mod] = {
    columns: (merged[mod].columns || []).map((c) =>
      c.id === columnId ? { ...c, visible: !!visible } : c,
    ),
  }
  return merged
}

export function catalogoModulo(modulo) {
  return CATALOGOS[_modKey(modulo)] || []
}
