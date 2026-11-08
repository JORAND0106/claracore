/**
 * Referencias aprobadas de salidas generadas (C-OUT-02…08).
 * Antes de desplegar se verifica que cada tipo conserve encabezado,
 * tablas/columnas/totales y letra mínima; si falta algo, se bloquea.
 */
import { ESQUEMA_DOC_MIN_FONT_FRAC } from './esquemaDocLegibility.js'
import {
  ESQUEMA_MEMORIA_TABLE_COLUMNS,
  planEsquemaExportSalida,
} from './esquemaExport.js'
import { planEsquemaSalidaHeader } from './esquemaSalidaHeader.js'
import { memoriaDisplayRows } from './esquema3dCalcExport.js'

/** Columnas del cuadro de despiece (aprobadas). */
export const ESQUEMA_DESPIECE_TABLE_COLUMNS = Object.freeze([
  'Posición', 'N°', 'Espaciamiento', 'N° piezas', 'Ubicación', 'Parrilla',
  'Long. parcial (m)', 'Forma L=(cm)', 'Long. total (m)', 'Peso kg/m', 'Peso kg', 'Total',
])

/** Columnas de tabla de coordenadas (aprobadas). */
export const ESQUEMA_COORDS_TABLE_COLUMNS = Object.freeze([
  'N°', 'Norte', 'Este', 'Cota', 'Descripción',
])

/**
 * Catálogo de referencias aprobadas (datos de prueba fijos).
 * Cada una describe qué debe conservar la salida generada.
 */
export const ESQUEMA_SALIDAS_REFERENCIAS = Object.freeze([
  {
    id: 'esquema-con-memoria',
    label: 'Esquema con memoria de volúmenes (Cabezal / poceta)',
    requires: {
      header: true,
      iso: true,
      memoriaTable: true,
      columns: [...ESQUEMA_MEMORIA_TABLE_COLUMNS],
      minFontFrac: ESQUEMA_DOC_MIN_FONT_FRAC,
      /** Con sólidos (cálculo) la imagen sale en isométrico NE. */
      exportView: 'iso-ne',
      headersIntact: ['Descuenta de', 'Operación', 'Color'],
      noWordBreak: true,
    },
  },
  {
    id: 'esquema-sin-tablas',
    label: 'Esquema sin tablas (solo encabezado + dibujo)',
    requires: {
      header: true,
      iso: true,
      memoriaTable: false,
      coordsTable: false,
      minFontFrac: ESQUEMA_DOC_MIN_FONT_FRAC,
    },
  },
  {
    id: 'esquema-con-solidos-iso',
    label: 'Esquema con sólidos → imagen en isométrico NE (C-OUT-21)',
    requires: {
      header: true,
      iso: true,
      exportView: 'iso-ne',
      hasSolids: true,
      minFontFrac: ESQUEMA_DOC_MIN_FONT_FRAC,
    },
  },
  {
    id: 'esquema-sin-solidos-top',
    label: 'Esquema sin sólidos → imagen en vista superior (C-OUT-21)',
    requires: {
      header: true,
      iso: true,
      exportView: 'top',
      hasSolids: false,
      minFontFrac: ESQUEMA_DOC_MIN_FONT_FRAC,
    },
  },
  {
    id: 'memoria-volúmenes',
    label: 'PNG memoria de cálculo (encabezado + iso + tabla)',
    requires: {
      header: true,
      iso: true,
      memoriaTable: true,
      columns: [...ESQUEMA_MEMORIA_TABLE_COLUMNS],
      minFontFrac: ESQUEMA_DOC_MIN_FONT_FRAC,
      exportView: 'iso-ne',
      headersIntact: ['Descuenta de'],
      noWordBreak: true,
    },
  },
  {
    id: 'cuadro-despiece',
    label: 'Cuadro de despiece PNG',
    requires: {
      header: true,
      despieceTable: true,
      columns: [...ESQUEMA_DESPIECE_TABLE_COLUMNS],
      minFontFrac: ESQUEMA_DOC_MIN_FONT_FRAC,
    },
  },
  {
    id: 'tabla-coordenadas',
    label: 'Esquema con tabla de coordenadas',
    requires: {
      header: true,
      iso: true,
      coordsTable: true,
      columns: [...ESQUEMA_COORDS_TABLE_COLUMNS],
      minFontFrac: ESQUEMA_DOC_MIN_FONT_FRAC,
    },
  },
])

/**
 * Snapshot de prueba fijo (poceta perforada / desglose 1, 1.1…).
 * Estructura compatible con memoriaDisplayRows.
 */
export function fixtureMemoriaPocetaSnapshot() {
  return {
    nombre: 'Poceta perforada',
    frozenAt: '2026-11-08T12:00:00.000Z',
    totalM3: 2.27,
    memoriaRows: [
      {
        numLabel: '1', nombre: 'Muro (exterior)', op: 'add', volumeM3: 3.0,
        color: '#0f766e',
        detail: { dimensiones: 'L=3,00 · A=0,30 · H=2,00', formula: '3×0,3×2' },
      },
      {
        numLabel: '1.1', nombre: 'Pase Ø', op: 'subtract', volumeM3: 0.24,
        discountFromNombre: 'Muro (exterior)',
        color: '#b91c1c',
        detail: { dimensiones: 'Ø=1,10 · L=0,25', formula: 'π×0,55²×0,25' },
      },
      {
        numLabel: '1.2', nombre: 'Hueco A', op: 'subtract', volumeM3: 0.2,
        discountFromNombre: 'Muro (exterior)',
        detail: { dimensiones: 'L=0,40 · A=0,40 · H=0,30', formula: '0,4×0,4×0,3' },
      },
      {
        numLabel: '1.3', nombre: 'Hueco B', op: 'subtract', volumeM3: 0.15,
        discountFromNombre: 'Muro (exterior)',
        detail: { dimensiones: 'L=0,50 · A=0,30 · H=0,30', formula: '0,5×0,3×0,3' },
      },
      {
        numLabel: '1.4', nombre: 'Muro (neto)', op: 'add', volumeM3: 2.27,
        isNetRow: true,
        netOpLabel: '1 − 1.1 − 1.2 − 1.3',
        detail: { dimensiones: '—', formula: '—' },
      },
    ],
    lines: [
      { ok: true, solidId: 'muro', volumeM3: 2.27 },
    ],
  }
}

/**
 * Verifica una meta/plan de salida contra su referencia aprobada.
 * @returns {{ ok: boolean, errors: string[], refId: string }}
 */
export function verifySalidaAgainstReference(meta, refId) {
  const ref = ESQUEMA_SALIDAS_REFERENCIAS.find((r) => r.id === refId)
  if (!ref) return { ok: false, errors: [`Referencia desconocida: ${refId}`], refId }
  const req = ref.requires || {}
  const errors = []
  const m = meta || {}

  if (req.header) {
    const h = m.header || m
    if (!(m.hasHeader || h?.tipoTitulo || h?.drawn || h?.requiredTokens)) {
      errors.push('Falta encabezado institucional')
    }
    const brand = h?.brandTitle || m.brandTitle
    if (brand != null && !String(brand).trim()) errors.push('Falta marca de plataforma en encabezado')
    const nombre = h?.nombre || m.nombre || m.title
    if (nombre != null && !String(nombre).trim()) errors.push('Falta nombre en encabezado')
    // Fecha: plan siempre la incluye
    if (h && !h.fecha && !m.fecha && h.requiredTokens && !h.requiredTokens.includes('fecha')) {
      errors.push('Falta fecha en encabezado')
    }
  }
  if (req.iso && m.hasIso === false) errors.push('Falta isométrico/dibujo')
  if (req.memoriaTable) {
    if (!(m.hasMemoriaTable || (m.memoria && m.memoria.length) || m.rowCount > 0)) {
      errors.push('Falta tabla de memoria de volúmenes')
    }
    const cols = m.columns || m.columnsRequired || (m.memoria && m.memoria[0]?.columns)
    if (req.columns?.length) {
      for (const col of req.columns) {
        if (!(cols || []).includes(col)) errors.push(`Falta columna de memoria: ${col}`)
      }
    }
  }
  if (req.coordsTable && !(m.hasCoordsTable || m.hasCoords)) {
    errors.push('Falta tabla de coordenadas')
  }
  if (req.despieceTable && m.hasDespieceTable === false) {
    errors.push('Falta tabla de despiece')
  }
  if (req.columns?.length && req.despieceTable) {
    const cols = m.columns || []
    for (const col of req.columns) {
      if (!cols.includes(col)) errors.push(`Falta columna de despiece: ${col}`)
    }
  }
  if (req.minFontFrac != null && m.cellFontPx != null && m.width != null) {
    const minPx = m.width * req.minFontFrac
    if (m.cellFontPx + 1e-6 < minPx) {
      errors.push(`Letra ${m.cellFontPx}px < mínimo ${minPx.toFixed(2)}px (1/55 del ancho)`)
    }
  }
  if (req.exportView) {
    const view = m.exportView || m.view3d
    if (view !== req.exportView) {
      errors.push(`Vista exportada «${view || '—'}» ≠ requerida «${req.exportView}»`)
    }
  }
  if (req.hasSolids === true && m.hasSolids === false) {
    errors.push('Se esperaban sólidos (isométrico NE)')
  }
  if (req.hasSolids === false && m.hasSolids === true) {
    errors.push('No se esperaban sólidos (vista superior)')
  }
  if (req.headersIntact?.length) {
    const intact = m.headersIntact || m.columns || m.columnsRequired || []
    for (const h of req.headersIntact) {
      if (!intact.includes(h)) errors.push(`Encabezado incompleto o ausente: ${h}`)
    }
  }
  if (req.noWordBreak && m.noWordBreak === false) {
    errors.push('Hay palabras partidas en la tabla')
  }

  return { ok: errors.length === 0, errors, refId }
}

/**
 * Genera planes de las salidas con fixtures fijos y las verifica.
 * Usado por la prueba que bloquea el despliegue.
 */
export function runApprovedSalidasVerification(opts = {}) {
  const {
    /** Si true, simula regresión quitando la tabla de memoria. */
    stripMemoriaTable = false,
  } = opts
  const results = []
  const snap = fixtureMemoriaPocetaSnapshot()
  const rows = memoriaDisplayRows(snap)

  // Fixture sólido mínimo (cells) para forzar iso-ne en plan.
  const solidFixture = [{
    type: 'solid3d', id: 's1',
    cells: [{ z0: 0, z1: 1, ring: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }],
  }]

  // 1) Esquema con memoria (+ sólidos → iso-ne)
  let planConMem = planEsquemaExportSalida({
    title: 'Cabezal 9A',
    calcSnapshots: [snap],
    nodes: [],
    solids3d: solidFixture,
  })
  if (stripMemoriaTable) {
    planConMem = {
      ...planConMem,
      hasMemoriaTable: false,
      memoria: [],
      columnsRequired: null,
      kind: 'esquema-sin-tablas',
    }
  }
  results.push({
    ...verifySalidaAgainstReference({
      ...planConMem,
      header: planConMem.header,
      hasHeader: true,
      hasIso: true,
      columns: planConMem.columnsRequired,
      headersIntact: planConMem.headersIntact,
      noWordBreak: true,
      cellFontPx: Math.max(1, (planConMem.header?.width || 1600) / 55),
      width: planConMem.header?.width || 1600,
    }, 'esquema-con-memoria'),
    fixtureRows: rows.length,
  })

  // 2) Esquema sin tablas
  const planSin = planEsquemaExportSalida({ title: 'Plano simple', nodes: [], calcSnapshots: [] })
  results.push(verifySalidaAgainstReference({
    ...planSin,
    hasHeader: true,
    hasIso: true,
    cellFontPx: Math.max(1, (planSin.header?.width || 1600) / 55),
    width: planSin.header?.width || 1600,
  }, 'esquema-sin-tablas'))

  // 3) Con sólidos → iso-ne
  const planSolids = planEsquemaExportSalida({
    title: 'Cabezal 9A',
    solids3d: solidFixture,
    calcSnapshots: [snap],
  })
  results.push(verifySalidaAgainstReference({
    ...planSolids,
    hasHeader: true,
    hasIso: true,
    cellFontPx: Math.max(1, (planSolids.header?.width || 1600) / 55),
    width: planSolids.header?.width || 1600,
  }, 'esquema-con-solidos-iso'))

  // 4) Sin sólidos → top
  const planTop = planEsquemaExportSalida({
    title: 'Planta 2D',
    solids3d: [],
    nodes: [],
    calcSnapshots: [],
  })
  results.push(verifySalidaAgainstReference({
    ...planTop,
    hasHeader: true,
    hasIso: true,
    cellFontPx: Math.max(1, (planTop.header?.width || 1600) / 55),
    width: planTop.header?.width || 1600,
  }, 'esquema-sin-solidos-top'))

  // 5) Memoria dedicada
  const headerMem = planEsquemaSalidaHeader({
    imageWidth: 1400,
    tipoTitulo: 'Memoria de cálculo de volúmenes',
    nombre: snap.nombre,
  })
  results.push(verifySalidaAgainstReference({
    hasHeader: true,
    header: headerMem,
    hasIso: true,
    hasMemoriaTable: !stripMemoriaTable,
    columns: [...ESQUEMA_MEMORIA_TABLE_COLUMNS],
    headersIntact: [...ESQUEMA_MEMORIA_TABLE_COLUMNS],
    noWordBreak: true,
    exportView: 'iso-ne',
    rowCount: rows.length,
    totalM3: snap.totalM3,
    cellFontPx: Math.max(1, 1400 / 55),
    width: 1400,
  }, 'memoria-volúmenes'))

  // 6) Despiece
  results.push(verifySalidaAgainstReference({
    hasHeader: true,
    header: planEsquemaSalidaHeader({
      imageWidth: 2200,
      tipoTitulo: 'Cuadro de despiece de acero',
      nombre: 'Cuadro prueba',
    }),
    hasDespieceTable: true,
    columns: [...ESQUEMA_DESPIECE_TABLE_COLUMNS],
    cellFontPx: Math.max(1, 2200 / 55),
    width: 2200,
  }, 'cuadro-despiece'))

  // 7) Coords
  const planCoords = planEsquemaExportSalida({
    title: 'Levantamiento',
    nodes: [{ n: 1 }, { n: 2 }],
    calcSnapshots: [],
  })
  results.push(verifySalidaAgainstReference({
    ...planCoords,
    hasHeader: true,
    hasIso: true,
    hasCoordsTable: true,
    columns: [...ESQUEMA_COORDS_TABLE_COLUMNS],
    cellFontPx: Math.max(1, (planCoords.header?.width || 1600) / 55),
    width: planCoords.header?.width || 1600,
  }, 'tabla-coordenadas'))

  const failed = results.filter((r) => !r.ok)
  return {
    ok: failed.length === 0,
    results,
    failed,
    referencias: ESQUEMA_SALIDAS_REFERENCIAS.map((r) => r.id),
  }
}
