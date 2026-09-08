/** Helpers puros — pólizas / documentos de subcontratistas. */

export const polizaTipoOptions = [
  { value: 'garantia', label: 'Garantía' },
  { value: 'responsabilidad_civil', label: 'Responsabilidad Civil y Extracontractual' },
  { value: 'otro', label: 'Otro' },
]

/** Orden jerárquico de documentos requeridos para corte. */
export const docTipoOrder = [
  { tipo: 'contrato_firmado', label: 'Contrato Firmado', versionado: true },
  { tipo: 'seguridad_social', label: 'Pago Seguridad Social', versionado: false, porPeriodo: true },
  { tipo: 'propuesta_economica', label: 'Propuesta Económica', versionado: true },
]

export const DOC_TIPO_LABEL = Object.fromEntries(docTipoOrder.map((d) => [d.tipo, d.label]))

/** Formato moneda es-CO (COP). */
export function fmtMoneda(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `$${Math.round(n).toLocaleString('es-CO')}`
}

/**
 * Badge visual para alerta de póliza en listado.
 * @param {{ nivel?: string|null, label?: string|null }|null|undefined} alerta
 */
export function nivelPolizaBadge(alerta) {
  const nivel = (alerta && alerta.nivel) || null
  if (!nivel || nivel === 'ok') {
    return {
      nivel: nivel || 'ok',
      label: (alerta && alerta.label) || (nivel === 'ok' ? 'Pólizas al día' : ''),
      background: 'rgba(34,197,94,0.15)',
      color: '#22c55e',
      show: nivel === 'ok',
    }
  }
  if (nivel === 'vencida') {
    return {
      nivel,
      label: (alerta && alerta.label) || 'Póliza vencida',
      background: 'rgba(239,68,68,0.15)',
      color: '#ef4444',
      show: true,
    }
  }
  if (nivel === 'por_vencer') {
    return {
      nivel,
      label: (alerta && alerta.label) || 'Póliza por vencer',
      background: 'rgba(245,158,11,0.15)',
      color: '#f59e0b',
      show: true,
    }
  }
  return {
    nivel,
    label: (alerta && alerta.label) || String(nivel),
    background: 'rgba(148,163,184,0.2)',
    color: '#64748b',
    show: true,
  }
}

export function polizaTipoLabel(tipo, tipoOtroTexto) {
  const t = (tipo || '').trim().toLowerCase()
  if (t === 'otro') return (tipoOtroTexto || 'Otro').trim() || 'Otro'
  const hit = polizaTipoOptions.find((o) => o.value === t)
  return hit ? hit.label : (tipo || '—')
}

export function emptyPolizaDraft(overrides = {}) {
  return {
    _localId: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tipo: 'garantia',
    tipo_otro_texto: '',
    fecha_vencimiento: '',
    valor_asegurado: '',
    archivo: null,
    archivoPreviewUrl: null,
    notas: '',
    replaces_id: null,
    ...overrides,
  }
}

export function emptyDocDraft(tipo = 'contrato_firmado', overrides = {}) {
  return {
    _localId: `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tipo,
    version_label: '',
    periodo: '',
    archivo: null,
    archivoPreviewUrl: null,
    notas: '',
    marcar_vigente: true,
    ...overrides,
  }
}
