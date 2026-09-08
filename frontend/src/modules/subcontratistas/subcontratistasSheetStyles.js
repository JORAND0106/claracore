/**
 * Estilos de grilla tipo Excel para Subcontratistas
 * (mismo lenguaje visual que Bitácora / Almacén).
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

export function subcontratistasSheetCssVars(t) {
  const ui = subcontratistasSheetStyles(t)
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

export function subcontratistasSheetStyles(t) {
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
      maxHeight: 'min(320px, 40vh)',
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
    cellSelect: {
      width: '100%',
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: text,
      fontSize: 'var(--cc-sm)',
      padding: '2px 2px',
      height: 28,
      fontFamily: 'inherit',
      cursor: 'pointer',
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
    },
  }
}

/** Estilos locales al estilo AdminPanel S.* (sin importar AdminPanel). */
export function subUi(theme, tTok) {
  const dark = theme === 'dark'
  const rest = theme === 'rest'
  return {
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', lineHeight: 1.3 },
    th: {
      textAlign: 'left',
      padding: '4px 8px',
      background: rest ? '#2E2A25' : (dark ? '#020617' : '#081318'),
      color: rest ? 'rgba(242,235,224,0.9)' : '#4a8a96',
      fontSize: 'var(--cc-label)',
      fontWeight: 600,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      borderBottom: dark ? '1px solid rgba(0,175,197,0.12)' : `1px solid ${tTok.border}`,
    },
    td: {
      padding: '5px 8px',
      fontSize: 'var(--cc-sm)',
      color: tTok.text,
      borderBottom: dark
        ? '1px solid rgba(255,255,255,0.04)'
        : `1px solid ${rest ? 'rgba(201,184,164,0.45)' : '#E0F2FE'}`,
      verticalAlign: 'middle',
    },
    badge: (estado) => ({
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 20,
      fontSize: 'var(--cc-caption)',
      fontWeight: 600,
      background: estado === 'pendiente' ? 'rgba(245,158,11,0.15)'
        : estado === 'aprobado' ? 'rgba(34,197,94,0.15)'
          : 'rgba(239,68,68,0.15)',
      color: estado === 'pendiente' ? '#f59e0b'
        : estado === 'aprobado' ? '#22c55e'
          : '#ef4444',
    }),
    btn: (variant = 'primary', sm = false) => {
      const primary = tTok?.primary || '#0077B6'
      return {
        padding: sm ? '4px 10px' : '6px 14px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: sm ? 'var(--cc-caption)' : 'var(--cc-sm)',
        fontWeight: 600,
        border: '1px solid',
        transition: 'all 0.15s',
        fontFamily: 'inherit',
        ...(variant === 'primary' ? {
          background: primary, borderColor: primary, color: dark ? '#081318' : '#fff',
        } : variant === 'success' ? {
          background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#22c55e',
        } : variant === 'danger' ? {
          background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444',
        } : variant === 'ghost' ? {
          background: 'transparent', borderColor: `${primary}55`, color: primary,
        } : {
          background: `${primary}14`, borderColor: `${primary}44`, color: primary,
        }),
      }
    },
    input: dark ? {
      background: '#081318',
      border: '1px solid rgba(0,175,197,0.2)',
      borderRadius: 6,
      color: '#c0dde3',
      fontSize: 'var(--cc-input)',
      padding: '5px 10px',
      outline: 'none',
      width: '100%',
    } : {
      background: tTok.inputBg,
      border: `1px solid ${tTok.border}`,
      borderRadius: 6,
      color: tTok.text,
      fontSize: 'var(--cc-input)',
      padding: '5px 10px',
      outline: 'none',
      width: '100%',
    },
    alert: (type) => ({
      padding: '8px 12px',
      borderRadius: 6,
      fontSize: 'var(--cc-sm)',
      marginBottom: 12,
      background: type === 'success' ? 'rgba(34,197,94,0.1)'
        : type === 'warn' ? 'rgba(245,158,11,0.12)'
          : 'rgba(239,68,68,0.1)',
      border: `1px solid ${
        type === 'success' ? 'rgba(34,197,94,0.3)'
          : type === 'warn' ? 'rgba(245,158,11,0.35)'
            : 'rgba(239,68,68,0.3)'
      }`,
      color: type === 'success' ? '#22c55e'
        : type === 'warn' ? '#d97706'
          : '#ef4444',
    }),
    empty: {
      textAlign: 'center',
      padding: '28px 0',
      color: tTok.textMuted,
      fontSize: 'var(--cc-body)',
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 6,
      background: dark ? 'rgba(0,175,197,0.08)' : (rest ? 'rgba(14,116,144,0.1)' : 'rgba(0,119,182,0.08)'),
      border: `1px solid ${tTok.border}`,
      color: tTok.primary,
      fontSize: 'var(--cc-md)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.15s',
    },
  }
}
