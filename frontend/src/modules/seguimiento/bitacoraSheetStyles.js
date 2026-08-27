/**
 * Estilos de grilla tipo Excel para Bitácora (mismo lenguaje visual que Almacén/SicoeObra/Topografía).
 * Divisores de celda con contraste medio (#94a3b8) para distinguir columnas/filas.
 */
const SHEET_CELL_BORDER = '#94a3b8'

/** Tinte sólido del primary institucional (~18 % sobre blanco) para encabezados de grilla. */
function sheetHeaderTint(primaryHex) {
  const raw = String(primaryHex || '#0077B6').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return '#D6EAF8'
  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  const mix = (c) => Math.round(c * 0.18 + 255 * 0.82)
  const toHex = (n) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}

export function bitacoraSheetStyles(t) {
  const border = t?.sheetGridBorder || SHEET_CELL_BORDER
  const text = t?.text || '#0f172a'
  const textMuted = t?.textMuted || '#64748b'
  const bgCard = t?.bgCard || '#ffffff'
  const inputBg = t?.inputBg || t?.bg || '#f8fafc'
  const primary = t?.primary || '#0077B6'
  // Encabezados con más contraste que headerBg del tema (a menudo blanco / muy tenue).
  const headerBg = t?.sheetHeaderBg || sheetHeaderTint(primary)
  const headerColor = t?.sheetHeaderColor || primary

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
      color: headerColor,
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
