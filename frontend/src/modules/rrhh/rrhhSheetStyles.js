/**
 * Estilos de grilla tipo Excel para RRHH
 * (mismo lenguaje visual que Bitácora / Subcontratistas / Almacén).
 */
const SHEET_CELL_BORDER = '#94a3b8'

function hexLuminance(hex) {
  const raw = String(hex || '').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return 1
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function sheetHeaderTint(primaryHex, baseHex) {
  const primaryRaw = String(primaryHex || '#0077B6').replace('#', '')
  const baseRaw = String(baseHex || '#ffffff').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(primaryRaw)) {
    return hexLuminance(`#${baseRaw}`) < 0.45 ? '#1a3a52' : '#D6EAF8'
  }
  const base = /^[0-9a-fA-F]{6}$/.test(baseRaw) ? baseRaw : 'ffffff'
  const pr = parseInt(primaryRaw.slice(0, 2), 16)
  const pg = parseInt(primaryRaw.slice(2, 4), 16)
  const pb = parseInt(primaryRaw.slice(4, 6), 16)
  const br = parseInt(base.slice(0, 2), 16)
  const bg = parseInt(base.slice(2, 4), 16)
  const bb = parseInt(base.slice(4, 6), 16)
  const mix = (c, b) => Math.round(c * 0.18 + b * 0.82)
  const toHex = (n) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(pr, br))}${toHex(mix(pg, bg))}${toHex(mix(pb, bb))}`
}

export function rrhhSheetCssVars(t) {
  const ui = rrhhSheetStyles(t)
  return {
    '--cc-sheet-grid-border': ui.border,
    '--cc-primary': t?.primary || '#0077B6',
    '--cc-bg-card': t?.bgCard || '#ffffff',
    '--cc-input-bg': t?.inputBg || t?.bg || '#f8fafc',
    '--cc-text': t?.text || '#0f172a',
    '--cc-text-muted': t?.textMuted || '#64748b',
    '--cc-border': t?.border || '#e2e8f0',
    '--cc-bitacora-header-bg': ui.th?.background || sheetHeaderTint(t?.primary, t?.bgCard),
  }
}

export function rrhhSheetStyles(t) {
  const text = t?.text || '#0f172a'
  const textMuted = t?.textMuted || '#64748b'
  const bgCard = t?.bgCard || '#ffffff'
  const inputBg = t?.inputBg || t?.bg || '#f8fafc'
  const primary = t?.primary || '#0077B6'
  const border = t?.sheetGridBorder
    || (hexLuminance(bgCard) < 0.45
      ? (t?.textMuted || '#7FB3D3')
      : SHEET_CELL_BORDER)
  const headerBg = t?.sheetHeaderBg || sheetHeaderTint(primary, bgCard)
  const headerColor = t?.sheetHeaderColor || primary

  return {
    border,
    text,
    textMuted,
    bgCard,
    primary,
    inputBg,
    sheetWrap: {
      overflow: 'auto',
      border: `1px solid ${border}`,
      background: bgCard,
      borderRadius: 4,
      maxHeight: 'min(420px, 50vh)',
    },
    sheetTable: {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
    },
    th: {
      textAlign: 'left',
      padding: '5px 6px',
      fontSize: 'var(--cc-caption)',
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
      padding: '6px 8px',
      fontSize: 'var(--cc-sm)',
      color: text,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      lineHeight: 1.35,
      background: 'transparent',
      minHeight: 32,
      height: 'auto',
      overflow: 'hidden',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
    },
    tdLabel: {
      padding: '6px 8px',
      fontSize: 'var(--cc-sm)',
      fontWeight: 700,
      color: textMuted,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      lineHeight: 1.35,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
      overflow: 'hidden',
      minHeight: 32,
      height: 'auto',
    },
    cellInp: {
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: text,
      fontSize: 'var(--cc-sm)',
      padding: '4px 4px',
      minHeight: 28,
      height: 'auto',
      fontFamily: 'inherit',
      lineHeight: 1.35,
    },
    cellSelect: {
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: text,
      fontSize: 'var(--cc-sm)',
      padding: '2px 2px',
      minHeight: 28,
      height: 'auto',
      fontFamily: 'inherit',
      cursor: 'pointer',
      lineHeight: 1.35,
    },
    sectionTitle: {
      fontWeight: 800,
      color: text,
      fontSize: 'var(--cc-sm)',
      marginBottom: 6,
      letterSpacing: '0.02em',
    },
    addRowBtn: {
      border: `1px dashed ${border}`,
      background: 'transparent',
      color: primary,
      cursor: 'pointer',
      fontSize: 'var(--cc-sm)',
      fontWeight: 700,
      padding: '6px 10px',
      borderRadius: 4,
      width: '100%',
      marginTop: 6,
      fontFamily: 'inherit',
      lineHeight: 1.3,
    },
  }
}

export function rrhhUi(theme, tTok) {
  const dark = theme === 'dark'
  const rest = theme === 'rest'
  const dangerColor = dark ? '#f87171' : rest ? '#991B1B' : '#DC2626'
  const successColor = 'var(--cc-color-success, #047857)'
  return {
    input: {
      width: '100%',
      boxSizing: 'border-box',
      border: `1px solid ${tTok.border}`,
      borderRadius: 8,
      padding: '8px 10px',
      background: tTok.inputBg || tTok.bg,
      color: tTok.text,
      fontSize: 'var(--cc-sm)',
      fontFamily: 'inherit',
    },
    btnPrimary: {
      border: 'none',
      borderRadius: 8,
      padding: '8px 14px',
      background: tTok.primary,
      color: '#fff',
      fontWeight: 700,
      fontSize: 'var(--cc-sm)',
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    btnGhost: {
      border: `1px solid ${tTok.border}`,
      borderRadius: 8,
      padding: '8px 14px',
      background: 'transparent',
      color: tTok.textMuted,
      fontWeight: 600,
      fontSize: 'var(--cc-sm)',
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    btnDanger: {
      border: `1px solid ${dangerColor}`,
      borderRadius: 8,
      padding: '6px 10px',
      background: 'transparent',
      color: dangerColor,
      fontWeight: 700,
      fontSize: 'var(--cc-caption)',
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    successColor,
    dangerColor,
    td: {
      padding: '8px 10px',
      borderBottom: `1px solid ${tTok.border}`,
      color: tTok.text,
      fontSize: 'var(--cc-sm)',
      verticalAlign: 'middle',
    },
    th: {
      textAlign: 'left',
      padding: '8px 10px',
      background: tTok.headerBg || tTok.bgCard,
      color: tTok.primary,
      fontSize: 'var(--cc-caption)',
      fontWeight: 700,
      textTransform: 'uppercase',
      borderBottom: `1px solid ${tTok.border}`,
    },
  }
}
