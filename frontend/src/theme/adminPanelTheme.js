/** Tokens de tema alineados con `themes` en App.jsx (claro / oscuro / descanso / automático). */

export const ADMIN_THEME = {
  light: {
    bg: "#F0F9FF",
    bgCard: "#FFFFFF",
    border: "#BAE6FD",
    text: "#0F2942",
    textMuted: "#4A7FA5",
    primary: "#0077B6",
    primaryLight: "#00B4C6",
    shadow: "0 2px 12px rgba(0,119,182,0.10)",
    headerBg: "#FFFFFF",
    inputBg: "#F8FAFC",
  },
  dark: {
    bg: "#0A1628",
    bgCard: "#0F2038",
    border: "#1E3A5F",
    text: "#E0F2FE",
    textMuted: "#7FB3D3",
    primary: "#00B4C6",
    primaryLight: "#00D4E8",
    shadow: "0 2px 12px rgba(0,0,0,0.40)",
    headerBg: "#0F2038",
    inputBg: "#0A1628",
  },
  rest: {
    bg: "#E8E0D5",
    bgCard: "#F2EDE4",
    border: "#C9B8A4",
    text: "#2A2318",
    textMuted: "#5C5346",
    primary: "#0E7490",
    primaryLight: "#14B8A6",
    shadow: "0 2px 12px rgba(42,35,24,0.12)",
    headerBg: "#EDE6DC",
    inputBg: "#FAF6EF",
  },
};

/** Tokens semánticos (éxito / positivo / peligro) — se aplican vía `applyClaraThemeTokens`. */
export const CLARA_THEME_SEMANTIC = {
  light: {
    success: '#047857',
    positive: '#047857',
    danger: '#dc2626',
    successBtnBg: '#047857',
    successBtnText: '#ffffff',
  },
  dark: {
    success: '#fde047',
    positive: '#22d3ee',
    danger: '#f87171',
    successBtnBg: '#fde047',
    successBtnText: '#0f172a',
  },
  rest: {
    success: '#166534',
    positive: '#166534',
    danger: '#DC2626',
    successBtnBg: '#166534',
    successBtnText: '#ffffff',
  },
}

export function applyClaraThemeTokens(activeTheme) {
  const mode = isRestMode(activeTheme) ? 'rest' : isDarkMode(activeTheme) ? 'dark' : 'light'
  const sem = CLARA_THEME_SEMANTIC[mode]
  const root = typeof document !== 'undefined' ? document.documentElement : null
  if (!root) return
  root.dataset.ccTheme = mode
  root.style.setProperty('--cc-color-success', sem.success)
  root.style.setProperty('--cc-color-positive', sem.positive)
  root.style.setProperty('--cc-color-danger', sem.danger)
  root.style.setProperty('--cc-btn-success-bg', sem.successBtnBg)
  root.style.setProperty('--cc-btn-success-text', sem.successBtnText)
}

/** Estilo de botón de acción positiva (legible en claro y oscuro). */
export function btnSuccessStyle(baseBtn = {}) {
  return {
    ...baseBtn,
    background: 'var(--cc-btn-success-bg, var(--cc-color-success))',
    color: 'var(--cc-btn-success-text, #ffffff)',
  }
}

export function tFrom(modeOrTheme, t) {
  if (t && t.text) return t;
  if (modeOrTheme && ADMIN_THEME[modeOrTheme]) return ADMIN_THEME[modeOrTheme];
  return ADMIN_THEME.light;
}

export function isDarkMode(m) {
  return m === "dark";
}

export function isRestMode(m) {
  return m === "rest";
}

export function isLightTheme(m) {
  return m === "light" || m === "rest";
}

/** Tokens tipográficos — reaccionan a Pequeña / Mediana / Grande vía `applyClaraTypography`. */
export const CC_TYPO = {
  caption: "var(--cc-caption)",
  label: "var(--cc-label)",
  sm: "var(--cc-sm)",
  body: "var(--cc-body)",
  input: "var(--cc-input)",
  md: "var(--cc-md)",
  lg: "var(--cc-lg)",
  title: "var(--cc-title)",
  h2: "var(--cc-h2)",
  h1: "var(--cc-h1)",
};

/** Estilo Mapbox acorde al tema activo (claro / oscuro / descanso). */
export function mapboxStyleForTheme(activeTheme) {
  if (isDarkMode(activeTheme)) return "mapbox://styles/mapbox/dark-v11";
  if (isRestMode(activeTheme)) return "mapbox://styles/mapbox/outdoors-v12";
  return "mapbox://styles/mapbox/light-v11";
}

/** Estilos reutilizables del modal de contratos y paneles anidados. */
export function buildContratoUiTheme(activeTheme, tProp) {
  const tok = tFrom(activeTheme, tProp);
  const dark = isDarkMode(activeTheme);
  const rest = isRestMode(activeTheme);
  const font = CC_TYPO;
  return {
    tok,
    dark,
    rest,
    font,
    bg: tok.bgCard,
    border: tok.border,
    text: tok.text,
    textMuted: tok.textMuted,
    primary: tok.primary,
    inputBg: tok.inputBg,
    shadow: dark ? "0 28px 72px rgba(0,0,0,0.55)" : tok.shadow,
    overlay: dark ? "rgba(8, 19, 24, 0.78)" : rest ? "rgba(42, 35, 24, 0.42)" : "rgba(15, 23, 42, 0.48)",
    tabActiveBg: dark ? "rgba(0,175,197,0.18)" : rest ? "rgba(14,116,144,0.14)" : "rgba(0,119,182,0.12)",
    tabBorderActive: dark ? "rgba(0,175,197,0.55)" : `${tok.primary}88`,
    tabBorder: `${tok.border}`,
    dashedBorder: tok.border,
    successBg: dark ? "#0a2a1a" : rest ? "#E8F5E9" : "#ECFDF5",
    successText: 'var(--cc-color-success)',
    errorBg: dark ? "#2a0a0a" : rest ? "#FEE2E2" : "#FEF2F2",
    errorText: dark ? "#f87171" : rest ? "#991B1B" : "#DC2626",
    warnBg: dark ? "#2a1a0a" : rest ? "#FEF3C7" : "#FFFBEB",
    warnText: dark ? "#fbbf24" : rest ? "#92400E" : "#D97706",
    cardSubtle: dark ? "rgba(0,175,197,0.06)" : rest ? "rgba(14,116,144,0.08)" : "rgba(0,119,182,0.06)",
    fileDrop: {
      display: "block",
      background: tok.inputBg,
      border: `2px dashed ${tok.border}`,
      borderRadius: 8,
      padding: "var(--cc-space-3, 10px) var(--cc-space-4, 12px)",
      textAlign: "center",
      cursor: "pointer",
      color: tok.textMuted,
      fontSize: font.sm,
      marginBottom: 12,
    },
    inp: {
      width: "100%",
      background: tok.inputBg,
      border: `1.5px solid ${tok.border}`,
      borderRadius: 8,
      padding: "9px 12px",
      color: tok.text,
      fontSize: font.input,
      outline: "none",
      boxSizing: "border-box",
      marginBottom: 12,
    },
    lbl: {
      fontSize: font.label,
      fontWeight: 700,
      color: tok.textMuted,
      letterSpacing: 1,
      display: "block",
      marginBottom: 4,
    },
    confirmTheme: {
      bgCard: tok.bgCard,
      border: tok.border,
      text: tok.text,
      textMuted: tok.textMuted,
      primary: tok.primary,
      shadow: dark ? "0 24px 64px rgba(0,0,0,0.45)" : tok.shadow,
    },
  };
}
