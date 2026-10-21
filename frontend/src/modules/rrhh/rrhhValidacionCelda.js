/**
 * Celda «Validación» de la grilla de colaboradores por empresa.
 *
 * Texto = estado de validación (Aprobado / Pendiente / Rechazado).
 * Fondo = resultado del último informe de auditoría:
 *   verde  → sin observaciones (doc_auditoria_ok === true)
 *   amarillo → con observaciones (doc_auditoria_ok === false)
 *   sin resaltado → aún no hay auditoría ejecutada
 *
 * No usa el pastel de botones del panel: el color de celda es solo auditoría.
 */

export const ESTADOS_VALIDACION = Object.freeze(['aprobado', 'pendiente', 'rechazado'])

const LABELS = Object.freeze({
  aprobado: 'Aprobado',
  pendiente: 'Pendiente',
  rechazado: 'Rechazado',
})

/** Normaliza el estado de validación del colaborador. */
export function normalizarEstadoValidacion(estado) {
  const raw = String(estado || '').trim().toLowerCase()
  if (raw === 'aprobado' || raw === 'rechazado') return raw
  return 'pendiente'
}

/** Etiqueta visible para la grilla / panel. */
export function labelEstadoValidacion(estado) {
  return LABELS[normalizarEstadoValidacion(estado)]
}

/**
 * ¿Hay al menos un informe de auditoría?
 * Misma regla que DocumentacionTab (`doc_auditoria_en` o `doc_auditoria_informe_id`).
 */
export function auditoriaEjecutada(row) {
  if (!row || typeof row !== 'object') return false
  return Boolean(row.doc_auditoria_en || row.doc_auditoria_informe_id)
}

/**
 * Tono de auditoría para resaltar la celda.
 * @returns {'ok' | 'hallazgos' | 'ninguna'}
 */
export function tonoAuditoriaCelda(row) {
  if (!auditoriaEjecutada(row)) return 'ninguna'
  if (row.doc_auditoria_ok === true) return 'ok'
  if (row.doc_auditoria_ok === false) return 'hallazgos'
  // Auditoría ejecutada pero ok desconocido: tratar como hallazgos cautelosos
  return 'hallazgos'
}

/**
 * Colores de celda adaptados a Claro / Oscuro / Descansar / Automático.
 * Usa la paleta de plataforma (--cc-color-success) y warn del tema de contrato.
 *
 * @param {'ok'|'hallazgos'|'ninguna'} tono
 * @param {'light'|'dark'|'rest'|string} theme
 * @param {object} [uiTheme] buildContratoUiTheme (warnBg / warnText)
 */
export function coloresAuditoriaCelda(tono, theme, uiTheme = {}) {
  const dark = theme === 'dark'
  const rest = theme === 'rest'
  const successColor = 'var(--cc-color-success, #047857)'
  const warnText = uiTheme.warnText
    || (dark ? '#fbbf24' : rest ? '#92400E' : '#D97706')
  const warnBg = uiTheme.warnBg
    || (dark ? '#2a1a0a' : rest ? '#FEF3C7' : '#FFFBEB')

  if (tono === 'ok') {
    return {
      background: dark
        ? 'rgba(34,197,94,0.18)'
        : rest
          ? 'rgba(22,101,52,0.14)'
          : 'color-mix(in srgb, var(--cc-color-success, #047857) 16%, transparent)',
      color: successColor,
      borderColor: dark
        ? 'rgba(34,197,94,0.35)'
        : 'color-mix(in srgb, var(--cc-color-success, #047857) 35%, transparent)',
    }
  }
  if (tono === 'hallazgos') {
    return {
      background: warnBg,
      color: warnText,
      borderColor: dark ? 'rgba(251,191,36,0.35)' : `${warnText}55`,
    }
  }
  return {
    background: 'transparent',
    color: null,
    borderColor: null,
  }
}

/**
 * Estilo de la celda td (fondo + tipografía) + title accesible.
 * @param {object} [opts]
 * @param {boolean} [opts.mostrarTonoAuditoria=true] — si false (auditoría oculta),
 *   solo muestra el estado sin verde/amarillo.
 */
export function estiloCeldaValidacion(row, theme, uiTheme, baseTd = {}, opts = {}) {
  const mostrarTono = opts.mostrarTonoAuditoria !== false
  const estado = normalizarEstadoValidacion(row?.doc_validacion_estado)
  const label = LABELS[estado]
  const tono = mostrarTono ? tonoAuditoriaCelda(row) : 'ninguna'
  const colores = coloresAuditoriaCelda(tono, theme, uiTheme)

  let title = `Validación: ${label}`
  if (mostrarTono) {
    if (tono === 'ok') title += ' · Auditoría sin observaciones'
    else if (tono === 'hallazgos') title += ' · Auditoría con observaciones'
    else title += ' · Sin auditoría ejecutada'
  }

  return {
    label,
    tono,
    title,
    style: {
      ...baseTd,
      background: colores.background,
      color: colores.color || baseTd.color,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    },
  }
}

/**
 * Campos de validación/auditoría a propagar a la fila de la grilla
 * cuando se actualiza el colaborador desde el panel.
 */
export function patchFilaValidacionAuditoria(full) {
  if (!full || typeof full !== 'object') return {}
  return {
    doc_validacion_estado: full.doc_validacion_estado,
    doc_validacion_observacion: full.doc_validacion_observacion,
    doc_validacion_en: full.doc_validacion_en,
    doc_validacion_por: full.doc_validacion_por,
    doc_bloqueado: full.doc_bloqueado,
    doc_auditoria_ok: full.doc_auditoria_ok,
    doc_auditoria_en: full.doc_auditoria_en,
    doc_auditoria_informe_id: full.doc_auditoria_informe_id,
    doc_auditoria_observaciones: full.doc_auditoria_observaciones,
  }
}
