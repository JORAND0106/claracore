/** Helpers UI Programación — tooltips institucionales, sin title nativo. */

export function tipProps(text, variant = 'short') {
  const t = String(text || '').trim()
  if (!t) return {}
  return {
    'data-cc-tooltip': t,
    'data-cc-tooltip-variant': variant,
    'aria-label': t,
  }
}

/** Botón solo icono + tooltip institucional. */
export function iconBtnStyle(t, { primary = false, disabled = false } = {}) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1px solid ${primary ? t.primary : t.border}`,
    background: primary ? t.primary : t.bgCard,
    color: primary ? '#fff' : t.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    padding: 0,
  }
}
