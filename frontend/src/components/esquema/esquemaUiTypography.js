/**
 * Tipografía e íconos de la UI del esquema sincronizados con --cc-* (C-TX-13).
 * No aplica a textos dibujados en el lienzo ni a PNG exportados.
 */

/** Roles de letra → variables CSS de plataforma. */
export const ESQUEMA_UI_FS = Object.freeze({
  micro: 'var(--cc-caption)',
  caption: 'var(--cc-caption)',
  label: 'var(--cc-label)',
  sm: 'var(--cc-sm)',
  body: 'var(--cc-body)',
  input: 'var(--cc-input)',
  md: 'var(--cc-md)',
  lg: 'var(--cc-lg)',
  title: 'var(--cc-title)',
})

/** Tamaño de botón de barra (crece con --cc-space / body). */
export function esquemaIconBtnSize() {
  return {
    width: 'calc(var(--cc-body) * 1.9)',
    height: 'calc(var(--cc-body) * 1.9)',
    minWidth: 34,
    minHeight: 34,
  }
}

export function esquemaIconSvgSize() {
  return {
    width: 'calc(var(--cc-body) * 1.05)',
    height: 'calc(var(--cc-body) * 1.05)',
  }
}

/** Estilo base de botón icono de la barra (iPad/portátil). */
export function esquemaIconBtnStyle(t, active) {
  return {
    ...esquemaIconBtnSize(),
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    cursor: 'pointer',
    border: `1px solid ${active ? t.primary : t.border}`,
    background: active ? `${t.primary}18` : 'transparent',
    color: active ? t.primary : t.text,
    fontSize: ESQUEMA_UI_FS.caption,
    boxSizing: 'border-box',
  }
}

export function esquemaIconSvgProps() {
  return {
    ...esquemaIconSvgSize(),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
}

/**
 * Mapa de fontSize numérico legado → var(--cc-*).
 * Usado por tests y por migraciones.
 */
export function mapLegacyFontPxToCc(px) {
  const n = Number(px)
  if (!(n > 0)) return ESQUEMA_UI_FS.body
  if (n <= 10) return ESQUEMA_UI_FS.micro
  if (n <= 12) return ESQUEMA_UI_FS.caption
  if (n <= 14) return ESQUEMA_UI_FS.sm
  if (n <= 16) return ESQUEMA_UI_FS.body
  if (n <= 18) return ESQUEMA_UI_FS.md
  return ESQUEMA_UI_FS.lg
}
