import { isLikelyDarkBackground } from '../theme/adminPanelTheme.js'

/**
 * Superficies de aviso legibles en claro, oscuro y descanso.
 * El fondo y el texto cambian juntos: en oscuro no se deja texto claro sobre blanco.
 */
export function almacenContraste(ui) {
  const bg = String(ui?.card?.background || '')
  const border = String(ui?.card?.border || '')
  const text = String(ui?.text || '')
  const dark = isLikelyDarkBackground(bg)
  const rest = !dark && /c9b8a4|f2ede4|e8e0d5/i.test(`${bg} ${border} ${text}`)
  if (dark) {
    return {
      mode: 'dark',
      panelBg: 'rgba(224, 242, 254, 0.06)',
      panelBorder: 'rgba(127, 179, 211, 0.35)',
      panelText: text || '#E0F2FE',
      warnBg: 'rgba(251, 191, 36, 0.16)',
      warnBorder: 'rgba(251, 191, 36, 0.5)',
      warnText: '#fde68a',
      okBg: 'rgba(16, 185, 129, 0.16)',
      okBorder: 'rgba(52, 211, 153, 0.45)',
      okText: '#6ee7b7',
      dangerBg: 'rgba(248, 113, 113, 0.16)',
      dangerBorder: 'rgba(248, 113, 113, 0.45)',
      dangerText: '#fecaca',
      infoBg: 'rgba(56, 189, 248, 0.14)',
      infoBorder: 'rgba(125, 211, 252, 0.4)',
      infoText: '#bae6fd',
    }
  }
  if (rest) {
    return {
      mode: 'rest',
      panelBg: '#FAF6EF',
      panelBorder: '#C9B8A4',
      panelText: text || '#2A2318',
      warnBg: '#F6E7C1',
      warnBorder: '#C4A35A',
      warnText: '#6B4E16',
      okBg: '#E5F0E4',
      okBorder: '#8FBC8F',
      okText: '#14532D',
      dangerBg: '#F8E4E0',
      dangerBorder: '#E7B2A8',
      dangerText: '#7F1D1D',
      infoBg: '#E4EEF0',
      infoBorder: '#9BB8C0',
      infoText: '#134E4A',
    }
  }
  return {
    mode: 'light',
    panelBg: '#f8fafc',
    panelBorder: '#e2e8f0',
    panelText: text || '#0F2942',
    warnBg: '#fffbeb',
    warnBorder: '#fcd34d',
    warnText: '#92400e',
    okBg: '#ecfdf5',
    okBorder: '#a7f3d0',
    okText: '#065f46',
    dangerBg: '#fef2f2',
    dangerBorder: '#fecaca',
    dangerText: '#991b1b',
    infoBg: '#eff6ff',
    infoBorder: '#bfdbfe',
    infoText: '#1e3a8a',
  }
}

/**
 * Fila de la grilla con líneas sin insumo.
 * En claro sigue el gris piedra. En oscuro es un gris de fondo oscuro, con texto claro.
 * El hover y la fila abierta usan el acento, distinto de este gris y de los estados.
 */
export function tonoFilaSinInsumo(ui) {
  const c = almacenContraste(ui)
  const accent = ui?.accent || '#0077B6'
  if (c.mode === 'dark') {
    return {
      mode: 'dark',
      fondo: '#2a3444',
      fondoHover: '#384556',
      barra: '#94a3b8',
      badgeBg: '#64748b',
      badgeText: '#f8fafc',
      vaciaBg: '#334155',
      vaciaText: '#e2e8f0',
      vaciaBorder: '#94a3b8',
      estadoBorrador: '#cbd5e1',
      estadoEnviada: '#93c5fd',
      estadoAprobada: 'var(--cc-color-success, #fde047)',
      estadoRechazada: '#fca5a5',
      movimientoTotal: '#86efac',
      movimientoParcial: '#fcd34d',
      eliminar: '#fdba74',
      anular: '#fca5a5',
      error: '#fecaca',
      seleccionadoFondo: 'rgba(0, 180, 198, 0.28)',
      seleccionadoBorde: '#22d3ee',
    }
  }
  if (c.mode === 'rest') {
    return {
      mode: 'rest',
      fondo: '#ddd4c6',
      fondoHover: '#d2c7b6',
      barra: '#6b5e4e',
      badgeBg: '#6b5e4e',
      badgeText: '#faf6ef',
      vaciaBg: '#faf6ef',
      vaciaText: '#3f3428',
      vaciaBorder: '#a89880',
      estadoBorrador: '#57534e',
      estadoEnviada: '#0e7490',
      estadoAprobada: 'var(--cc-color-success, #166534)',
      estadoRechazada: '#b91c1c',
      movimientoTotal: '#166534',
      movimientoParcial: '#9a3412',
      eliminar: '#9a3412',
      anular: '#b91c1c',
      error: '#991b1b',
      seleccionadoFondo: 'rgba(14, 116, 144, 0.18)',
      seleccionadoBorde: '#0e7490',
    }
  }
  return {
    mode: 'light',
    fondo: '#e7e5e4',
    fondoHover: '#d6d3d1',
    barra: '#57534e',
    badgeBg: '#57534e',
    badgeText: '#ffffff',
    vaciaBg: '#f5f5f4',
    vaciaText: '#44403c',
    vaciaBorder: '#a8a29e',
    estadoBorrador: '#64748b',
    estadoEnviada: '#2563eb',
    estadoAprobada: 'var(--cc-color-success, #047857)',
    estadoRechazada: '#dc2626',
    movimientoTotal: '#15803d',
    movimientoParcial: '#b45309',
    eliminar: '#7c2d12',
    anular: '#dc2626',
    error: '#991b1b',
    seleccionadoFondo: ui?.accentSoft || `${accent}22`,
    seleccionadoBorde: accent,
  }
}

export function colorEstadoSolicitud(estado, tono) {
  if (estado === 'enviada') return tono.estadoEnviada
  if (estado === 'aprobada') return tono.estadoAprobada
  if (estado === 'rechazada') return tono.estadoRechazada
  return tono.estadoBorrador
}

/** Estado de una línea dentro del popup de la solicitud. */
export function colorEstadoLinea(estado, contraste) {
  const mode = contraste?.mode || 'light'
  const paleta = {
    dark: {
      pendiente: '#fcd34d',
      aprobado: '#6ee7b7',
      rechazado: '#fca5a5',
      varios: '#cbd5e1',
    },
    rest: {
      pendiente: '#9a3412',
      aprobado: '#14532d',
      rechazado: '#991b1b',
      varios: '#57534e',
    },
    light: {
      pendiente: '#d97706',
      aprobado: '#059669',
      rechazado: '#dc2626',
      varios: '#64748b',
    },
  }
  const tabla = paleta[mode] || paleta.light
  return tabla[estado] || tabla.pendiente
}

export function estiloAvisoAlmacen(contraste, kind = 'panel', { compact = false } = {}) {
  const tono = ['panel', 'warn', 'ok', 'danger', 'info'].includes(kind) ? kind : 'panel'
  return {
    background: contraste[`${tono}Bg`],
    border: `1px solid ${contraste[`${tono}Border`]}`,
    color: contraste[`${tono}Text`],
    borderRadius: compact ? 6 : 8,
    padding: compact ? '3px 8px' : '8px 10px',
  }
}
