/**
 * Tema visual compartido de fichas/popup corporativo ClaraCore
 * (misma familia que Gestión de Usuarios).
 * Solo presentación — sin lógica de negocio.
 */

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
