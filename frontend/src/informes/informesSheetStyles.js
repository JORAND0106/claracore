/**
 * Estilos de grilla tipo Excel para el módulo Informes
 * (mismo lenguaje visual que Presupuesto / Bitácora / RRHH / Topografía).
 * Tipografía vía --cc-*; colores desde el tema activo `t`.
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

/** Mezcla accent (~22 %) sobre bgCard para identidad de grupo sin romper el tema. */
function groupAccentTint(accentHex, baseHex) {
  const aRaw = String(accentHex || '#0077B6').replace('#', '')
  const bRaw = String(baseHex || '#ffffff').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(aRaw)) return sheetHeaderTint('#0077B6', baseHex)
  const base = /^[0-9a-fA-F]{6}$/.test(bRaw) ? bRaw : 'ffffff'
  const ar = parseInt(aRaw.slice(0, 2), 16)
  const ag = parseInt(aRaw.slice(2, 4), 16)
  const ab = parseInt(aRaw.slice(4, 6), 16)
  const br = parseInt(base.slice(0, 2), 16)
  const bg = parseInt(base.slice(2, 4), 16)
  const bb = parseInt(base.slice(4, 6), 16)
  const mix = (c, b) => Math.round(c * 0.22 + b * 0.78)
  const toHex = (n) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(ar, br))}${toHex(mix(ag, bg))}${toHex(mix(ab, bb))}`
}

/** Identidad visual por grupo (armónica con temas; no fija modo claro/oscuro). */
export const INFORMES_GRUPOS = {
  sub: {
    id: 'sub',
    label: 'Formatos Subcontratista',
    accent: '#0d9488',
    info:
      'Corte y memorias por subcontratista. Elija subcontratista y corte; cada fila de la tabla abre un formato con vista previa, descargas y firmas.',
  },
  sem: {
    id: 'sem',
    label: 'Formatos Semanales',
    accent: '#d97706',
    info:
      'Conciliación por semana de aprobación (CC-SEM-001 / CC-SEM-002). Seleccione la semana y genere el resumen o las memorias del periodo.',
  },
  ger: {
    id: 'ger',
    label: 'Informe de gerencia',
    accent: '#7c3aed',
    info:
      'Comparativo de avance por acta RPO (CC-GER-001). El acta presente se toma del periodo de la matriz SICOE; no requiere selector manual.',
  },
  mes: {
    id: 'mes',
    label: 'Preacta mensual',
    accent: '#2563eb',
    info:
      'Ejecución mensual por acta RPO (CC-MES-001 / CC-MES-002). Elija acta y nivel de aprobación; el costo directo sigue la cascada de la plataforma.',
  },
  ent: {
    id: 'ent',
    label: 'Formatos Entidades Externas',
    accent: '#059669',
    info:
      'Formatos de entidades contratantes (p. ej. FO-IDU-EO-04-V2). Configure supervisor, subsistema y acta; genere vista previa y PDF con sello.',
  },
}

export function informesSheetCssVars(t, accent) {
  const ui = informesSheetStyles(t, accent)
  return {
    '--cc-sheet-grid-border': ui.border,
    '--cc-primary': t?.primary || '#0077B6',
    '--cc-bg-card': t?.bgCard || '#ffffff',
    '--cc-input-bg': t?.inputBg || t?.bg || '#f8fafc',
    '--cc-text': t?.text || '#0f172a',
    '--cc-text-muted': t?.textMuted || '#64748b',
    '--cc-border': t?.border || '#e2e8f0',
    '--cc-informes-sheet-header-bg': ui.headerBg,
    '--cc-informes-group-accent': ui.accent,
  }
}

export function informesSheetStyles(t, accentHex) {
  const text = t?.text || '#0f172a'
  const textMuted = t?.textMuted || '#64748b'
  const bgCard = t?.bgCard || '#ffffff'
  const inputBg = t?.inputBg || t?.bg || '#f8fafc'
  const primary = t?.primary || '#0077B6'
  const bg = t?.bg || inputBg
  const accent = accentHex || primary
  const border =
    t?.sheetGridBorder ||
    (hexLuminance(bgCard) < 0.45 ? t?.textMuted || '#7FB3D3' : SHEET_CELL_BORDER)
  const headerBg = t?.sheetHeaderBg || groupAccentTint(accent, bgCard)
  const headerColor = t?.sheetHeaderColor || accent
  const darkish = hexLuminance(bgCard) < 0.45
  /** Texto informativo: sin negrita; más tamaño y contraste que textMuted. */
  const infoColor = darkish
    ? (t?.text || '#e2e8f0')
    : (hexLuminance(accent) < 0.35 ? accent : '#0f172a')

  return {
    border,
    text,
    textMuted,
    bgCard,
    bg,
    primary,
    accent,
    inputBg,
    headerBg,
    headerColor,
    infoColor,
    sheetWrap: {
      overflow: 'auto',
      border: `1px solid ${border}`,
      background: bgCard,
      borderRadius: 4,
      WebkitOverflowScrolling: 'touch',
    },
    sheetTable: {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      minWidth: 0,
    },
    th: {
      textAlign: 'left',
      padding: '7px 8px',
      fontSize: 'var(--cc-caption)',
      fontWeight: 800,
      color: headerColor,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
      border: `1px solid ${border}`,
      background: headerBg,
      lineHeight: 1.25,
    },
    td: {
      padding: '7px 8px',
      fontSize: 'var(--cc-sm)',
      color: text,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      lineHeight: 1.4,
      background: 'transparent',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
    },
    tdLabel: {
      padding: '8px 10px',
      fontSize: 'var(--cc-caption)',
      fontWeight: 800,
      color: headerColor,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      border: `1px solid ${border}`,
      background: headerBg,
      verticalAlign: 'middle',
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
      width: '28%',
      maxWidth: 180,
    },
    tdMuted: {
      padding: '7px 8px',
      fontSize: 'var(--cc-sm)',
      color: textMuted,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      lineHeight: 1.4,
      background: 'transparent',
    },
    cellSelect: {
      width: '100%',
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: text,
      fontSize: 'var(--cc-input)',
      padding: '6px 4px',
      minHeight: 36,
      fontFamily: 'inherit',
      cursor: 'pointer',
      lineHeight: 1.35,
    },
    cellInp: {
      width: '100%',
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: text,
      fontSize: 'var(--cc-input)',
      padding: '6px 4px',
      minHeight: 36,
      fontFamily: 'inherit',
      lineHeight: 1.35,
    },
    /** Panel de grupo con franja de acento lateral. */
    groupPanel: {
      marginTop: 14,
      marginBottom: 4,
      border: `1px solid ${border}`,
      borderLeft: `5px solid ${accent}`,
      borderRadius: 4,
      background: bgCard,
      overflow: 'hidden',
      boxShadow: `0 1px 0 ${border}`,
    },
    groupHead: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '10px 12px',
      border: 'none',
      borderBottom: `1px solid ${border}`,
      background: headerBg,
      cursor: 'pointer',
      textAlign: 'left',
      font: 'inherit',
      color: text,
    },
    groupTitle: {
      fontSize: 'var(--cc-body)',
      fontWeight: 800,
      color: headerColor,
      letterSpacing: '0.02em',
      lineHeight: 1.25,
    },
    /** Franja informativa: sin negrita; tipografía más grande y contraste alto. */
    infoBand: {
      margin: 0,
      padding: '12px 14px',
      borderBottom: `1px solid ${border}`,
      background: darkish ? `${accent}22` : `${accent}14`,
      color: infoColor,
      fontSize: 'var(--cc-body)',
      fontWeight: 400,
      lineHeight: 1.55,
      letterSpacing: '0.01em',
    },
    zoneWrap: {
      margin: '10px 12px',
      border: `1px solid ${border}`,
      borderRadius: 4,
      background: bg,
      overflow: 'hidden',
    },
    zoneBar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '7px 10px',
      borderBottom: `1px solid ${border}`,
      background: headerBg,
      color: headerColor,
      fontWeight: 800,
      fontSize: 'var(--cc-caption)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    zoneBody: {
      padding: '10px 10px',
    },
    breadcrumbBar: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '6px 10px',
      padding: '8px 12px',
      marginBottom: 12,
      border: `1px solid ${border}`,
      borderRadius: 4,
      background: headerBg,
      color: text,
      fontSize: 'var(--cc-sm)',
      lineHeight: 1.4,
    },
    breadcrumbSep: {
      color: textMuted,
      userSelect: 'none',
    },
    breadcrumbLink: {
      border: 'none',
      background: 'transparent',
      color: headerColor,
      cursor: 'pointer',
      font: 'inherit',
      fontWeight: 700,
      padding: 0,
      textDecoration: 'underline',
      textUnderlineOffset: 2,
    },
    breadcrumbCurrent: {
      color: text,
      fontWeight: 700,
    },
    backBtn: {
      marginLeft: 'auto',
      border: `1px solid ${border}`,
      background: bgCard,
      color: headerColor,
      cursor: 'pointer',
      fontSize: 'var(--cc-sm)',
      fontWeight: 700,
      padding: '5px 10px',
      borderRadius: 4,
      fontFamily: 'inherit',
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
    },
    formatRowBtn: {
      border: 'none',
      background: 'transparent',
      color: headerColor,
      cursor: 'pointer',
      fontSize: 'var(--cc-sm)',
      fontWeight: 700,
      padding: '4px 8px',
      fontFamily: 'inherit',
      textDecoration: 'underline',
      textUnderlineOffset: 2,
    },
  }
}
