/**
 * Estilos de grilla tipo Excel para Gestión de Usuarios
 * (mismo lenguaje visual que RRHH / Subcontratistas / Bitácora).
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

export function usuariosSheetCssVars(t) {
  const ui = usuariosSheetStyles(t)
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

export function usuariosSheetStyles(t) {
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
      maxHeight: 'min(70vh, 820px)',
      WebkitOverflowScrolling: 'touch',
    },
    sheetTable: {
      width: '100%',
      minWidth: 920,
      borderCollapse: 'collapse',
      tableLayout: 'auto',
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
      width: '34%',
      maxWidth: 220,
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
  }
}

/** Estilos de apoyo (alertas, botones de pie) alineados al panel admin. */
export function usuariosUi(theme, tTok) {
  const dark = theme === 'dark'
  const rest = theme === 'rest'
  const warnColor = dark ? '#fbbf24' : rest ? '#92400E' : '#B45309'
  const successColor = 'var(--cc-color-success, #047857)'
  const dangerColor = dark ? '#f87171' : rest ? '#991B1B' : '#DC2626'
  const primary = tTok?.primary || '#0077B6'
  return {
    alert: (type) => ({
      padding: '10px 12px',
      borderRadius: 6,
      fontSize: 'var(--cc-body)',
      lineHeight: 1.4,
      marginBottom: 12,
      background: type === 'success' ? 'rgba(34,197,94,0.1)'
        : type === 'warn' ? (dark ? 'rgba(251,191,36,0.12)' : 'rgba(180,83,9,0.1)')
          : 'rgba(239,68,68,0.1)',
      border: `1px solid ${
        type === 'success' ? 'rgba(34,197,94,0.3)'
          : type === 'warn' ? `${warnColor}55`
            : 'rgba(239,68,68,0.3)'
      }`,
      color: type === 'success' ? successColor
        : type === 'warn' ? warnColor
          : dangerColor,
    }),
    empty: {
      textAlign: 'center',
      padding: '28px 0',
      color: tTok.textMuted,
      fontSize: 'var(--cc-body)',
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
      color: estado === 'pendiente' ? warnColor
        : estado === 'aprobado' ? successColor
          : dangerColor,
    }),
    closeBtn: {
      width: 36,
      height: 36,
      minWidth: 36,
      minHeight: 36,
      borderRadius: 8,
      background: dark ? 'rgba(0,175,197,0.08)' : (rest ? 'rgba(14,116,144,0.1)' : 'rgba(0,119,182,0.08)'),
      border: `1px solid ${tTok.border}`,
      color: primary,
      fontSize: 'var(--cc-sm)',
      lineHeight: 1,
      fontFamily: 'inherit',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
    },
    footBtn: (variant = 'primary') => ({
      width: 40,
      height: 40,
      minWidth: 40,
      minHeight: 40,
      borderRadius: 8,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      fontFamily: 'inherit',
      border: '1px solid',
      transition: 'all 0.15s',
      ...(variant === 'primary' ? {
        background: primary, borderColor: primary, color: dark ? '#081318' : '#fff',
      } : variant === 'success' ? {
        background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: successColor,
      } : variant === 'danger' ? {
        background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)', color: dangerColor,
      } : {
        background: 'transparent', borderColor: `${primary}55`, color: primary,
      }),
    }),
    chip: {
      background: `${primary}14`,
      border: `1px solid ${primary}44`,
      borderRadius: 6,
      padding: '6px 10px',
      fontSize: 'var(--cc-sm)',
      color: tTok.text,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      minHeight: 32,
    },
    estadoColor: {
      pendiente: warnColor,
      aprobado: successColor,
      rechazado: dangerColor,
    },
  }
}

/** Iniciales derivadas de nombre/apellidos (identidad visual del usuario). */
export function inicialesUsuario(nombre, apellidos) {
  const a = String(nombre || '').trim().charAt(0)
  const b = String(apellidos || '').trim().charAt(0)
  const out = `${a}${b}`.toUpperCase()
  return out || '?'
}

/**
 * Tokens visuales del popup de ficha (por tema: light / dark / rest).
 * Solo presentación — no altera datos ni acciones.
 */
export function usuariosFichaTheme(theme, tTok) {
  const dark = theme === 'dark'
  const rest = theme === 'rest'
  const primary = tTok?.primary || '#0077B6'
  const primaryLight = tTok?.primaryLight || primary
  const bgCard = tTok?.bgCard || '#ffffff'
  const text = tTok?.text || '#0f172a'
  const textMuted = tTok?.textMuted || '#64748b'
  const border = tTok?.border || '#e2e8f0'
  const inputBg = tTok?.inputBg || tTok?.bg || '#f8fafc'
  const warnColor = dark ? '#fbbf24' : rest ? '#92400E' : '#B45309'
  const successColor = dark ? '#4ade80' : rest ? '#166534' : '#047857'
  const dangerColor = dark ? '#f87171' : rest ? '#991B1B' : '#DC2626'

  const heroBg = dark
    ? `linear-gradient(135deg, ${primary}33 0%, #0A1628 48%, #0F2038 100%)`
    : rest
      ? `linear-gradient(135deg, ${primary}22 0%, #EDE6DC 45%, #F2EDE4 100%)`
      : `linear-gradient(135deg, ${primary}22 0%, #E0F2FE 42%, #FFFFFF 100%)`

  const sectionBg = dark
    ? 'rgba(0,180,198,0.06)'
    : rest
      ? 'rgba(14,116,144,0.06)'
      : 'rgba(0,119,182,0.04)'

  const avatarColors = dark
    ? ['#00B4C6', '#0284C7', '#0EA5E9', '#14B8A6', '#38BDF8']
    : rest
      ? ['#0E7490', '#0F766E', '#0369A1', '#155E75', '#0D9488']
      : ['#0077B6', '#0284C7', '#0EA5E9', '#0891B2', '#0369A1']

  return {
    primary,
    primaryLight,
    bgCard,
    text,
    textMuted,
    border,
    inputBg,
    warnColor,
    successColor,
    dangerColor,
    heroBg,
    sectionBg,
    avatarColors,
    overlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 10050,
      background: dark ? 'rgba(5,12,20,0.78)' : rest ? 'rgba(42,35,24,0.48)' : 'rgba(8, 30, 48, 0.55)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modal: {
      background: bgCard,
      border: `1px solid ${dark ? `${primary}55` : border}`,
      boxShadow: dark
        ? `0 28px 80px rgba(0,0,0,0.55), 0 0 0 1px ${primary}33`
        : rest
          ? '0 24px 64px rgba(42,35,24,0.22)'
          : `0 28px 72px rgba(0,119,182,0.22), 0 0 0 1px ${primary}22`,
    },
    hero: {
      background: heroBg,
      borderBottom: `1px solid ${dark ? `${primary}44` : border}`,
      position: 'relative',
      overflow: 'hidden',
    },
    heroAccent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      background: `linear-gradient(90deg, ${primary}, ${primaryLight})`,
    },
    sectionCard: {
      background: sectionBg,
      border: `1px solid ${dark ? `${primary}33` : border}`,
      borderLeft: `3px solid ${primary}`,
      borderRadius: 10,
      padding: '12px 12px 14px',
      marginBottom: 14,
    },
    sectionTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontWeight: 800,
      color: primary,
      fontSize: 'var(--cc-sm)',
      marginBottom: 10,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    },
    sectionDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: primary,
      boxShadow: `0 0 0 3px ${primary}22`,
      flexShrink: 0,
    },
    fieldLabel: {
      padding: '8px 10px',
      fontSize: 'var(--cc-caption)',
      fontWeight: 700,
      color: textMuted,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      lineHeight: 1.35,
      background: dark ? 'rgba(0,0,0,0.18)' : rest ? 'rgba(42,35,24,0.04)' : 'rgba(0,119,182,0.04)',
      width: '34%',
      maxWidth: 220,
    },
    fieldValue: {
      padding: '8px 10px',
      fontSize: 'var(--cc-sm)',
      fontWeight: 600,
      color: text,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      lineHeight: 1.35,
      background: bgCard,
    },
    select: {
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      border: `1px solid ${border}`,
      borderRadius: 8,
      outline: 'none',
      background: inputBg,
      color: text,
      fontSize: 'var(--cc-sm)',
      fontWeight: 600,
      padding: '8px 10px',
      minHeight: 36,
      fontFamily: 'inherit',
      cursor: 'pointer',
      lineHeight: 1.35,
    },
    pill: (tone = 'neutral') => {
      const map = {
        pendiente: { bg: `${warnColor}22`, color: warnColor, border: `${warnColor}55` },
        aprobado: { bg: `${successColor}22`, color: successColor, border: `${successColor}55` },
        rechazado: { bg: `${dangerColor}22`, color: dangerColor, border: `${dangerColor}55` },
        primary: { bg: `${primary}18`, color: primary, border: `${primary}44` },
        neutral: { bg: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)', color: textMuted, border },
      }
      const t = map[tone] || map.neutral
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 'var(--cc-caption)',
        fontWeight: 700,
        lineHeight: 1.2,
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        maxWidth: '100%',
      }
    },
    foot: {
      padding: '12px 16px',
      borderTop: `1px solid ${border}`,
      background: dark
        ? `linear-gradient(180deg, ${bgCard} 0%, rgba(0,180,198,0.08) 100%)`
        : rest
          ? `linear-gradient(180deg, ${bgCard} 0%, rgba(14,116,144,0.08) 100%)`
          : `linear-gradient(180deg, ${bgCard} 0%, rgba(0,119,182,0.06) 100%)`,
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
      flexWrap: 'wrap',
    },
    closeBtn: {
      width: 40,
      height: 40,
      minWidth: 40,
      minHeight: 40,
      borderRadius: 10,
      background: dark ? 'rgba(0,180,198,0.12)' : rest ? 'rgba(14,116,144,0.12)' : 'rgba(0,119,182,0.1)',
      border: `1px solid ${dark ? `${primary}55` : border}`,
      color: primary,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      flexShrink: 0,
    },
  }
}

/** Color de avatar estable a partir del nombre (paleta institucional). */
export function avatarColorFromName(nombre, apellidos, colors) {
  const palette = Array.isArray(colors) && colors.length ? colors : ['#0077B6']
  const key = `${nombre || ''}|${apellidos || ''}`
  let h = 0
  for (let i = 0; i < key.length; i += 1) h = ((h << 5) - h) + key.charCodeAt(i)
  return palette[Math.abs(h) % palette.length]
}
