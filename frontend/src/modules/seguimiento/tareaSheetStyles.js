/**
 * Estilos de grilla tipo Excel para el popup de Tarea
 * (mismo lenguaje visual que Bitácora / Almacén / SicoeObra).
 */
import { bitacoraSheetStyles } from './bitacoraSheetStyles'

export function tareaSheetStyles(t) {
  const base = bitacoraSheetStyles(t)
  return {
    ...base,
    thCenter: { ...base.th, textAlign: 'center' },
    tdCenter: { ...base.td, textAlign: 'center' },
    cellSelect: {
      ...base.cellInp,
      height: 28,
      padding: '2px 4px',
      cursor: 'pointer',
    },
    iconBtn: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: 14,
      lineHeight: 1,
      padding: '2px 4px',
      color: base.textMuted,
      verticalAlign: 'middle',
    },
    iconBtnActive: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: 14,
      lineHeight: 1,
      padding: '2px 4px',
      color: t?.primary || '#2563eb',
      verticalAlign: 'middle',
    },
    expandHint: {
      fontSize: 10,
      color: base.textMuted,
      marginTop: 4,
    },
  }
}
