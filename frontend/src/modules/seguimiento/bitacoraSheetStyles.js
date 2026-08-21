/**
 * Estilos de grilla tipo Excel para Bitácora (mismo lenguaje visual que Almacén/SicoeObra).
 */
export function bitacoraSheetStyles(t) {
  const border = t?.border || '#e2e8f0'
  const text = t?.text || '#0f172a'
  const textMuted = t?.textMuted || '#64748b'
  const bgCard = t?.bgCard || '#ffffff'
  const inputBg = t?.inputBg || t?.bg || '#f8fafc'
  const headerBg = t?.headerBg || inputBg

  return {
    border,
    text,
    textMuted,
    bgCard,
    sheetWrap: {
      overflow: 'auto',
      border: `1px solid ${border}`,
      background: bgCard,
      borderRadius: 4,
    },
    sheetTable: {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
    },
    th: {
      textAlign: 'left',
      padding: '5px 6px',
      fontSize: 10,
      fontWeight: 800,
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
      border: `1px solid ${border}`,
      background: headerBg,
      position: 'sticky',
      top: 0,
      zIndex: 2,
      lineHeight: 1.2,
    },
    td: {
      padding: '2px 4px',
      fontSize: 'var(--cc-sm)',
      color: text,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      lineHeight: 1.2,
      background: 'transparent',
      height: 32,
    },
    cellInp: {
      width: '100%',
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: text,
      fontSize: 'var(--cc-sm)',
      padding: '4px 4px',
      height: 28,
      fontFamily: 'inherit',
    },
    cellRo: {
      width: '100%',
      boxSizing: 'border-box',
      border: 'none',
      background: inputBg,
      color: text,
      fontSize: 'var(--cc-sm)',
      padding: '4px 6px',
      height: 28,
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontVariantNumeric: 'tabular-nums',
      fontWeight: 700,
    },
    sectionTitle: {
      fontWeight: 800,
      color: text,
      fontSize: 'var(--cc-sm)',
      marginBottom: 6,
      letterSpacing: '0.02em',
    },
    clipBtn: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: 14,
      lineHeight: 1,
      padding: '2px 4px',
      color: textMuted,
    },
  }
}
