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
