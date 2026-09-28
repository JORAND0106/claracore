/**
 * Estilos de grilla tipo Excel para el módulo Informes
 * (mismo lenguaje visual que Presupuesto / Bitácora / RRHH / Topografía).
 * Paleta: solo azules de la plataforma (primary / primaryLight del tema activo).
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

function parseHex(hex, fallback = '0077B6') {
  const raw = String(hex || '').replace('#', '')
  return /^[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback
}

function mixHex(aHex, bHex, t) {
  const a = parseHex(aHex)
  const b = parseHex(bHex, 'ffffff')
  const mix = (c1, c2) => Math.round(c1 * (1 - t) + c2 * t)
  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  const ar = parseInt(a.slice(0, 2), 16)
  const ag = parseInt(a.slice(2, 4), 16)
  const ab = parseInt(a.slice(4, 6), 16)
  const br = parseInt(b.slice(0, 2), 16)
  const bg = parseInt(b.slice(2, 4), 16)
  const bb = parseInt(b.slice(4, 6), 16)
  return `#${toHex(mix(ar, br))}${toHex(mix(ag, bg))}${toHex(mix(ab, bb))}`
}

function sheetHeaderTint(primaryHex, baseHex) {
  return mixHex(primaryHex || '#0077B6', baseHex || '#ffffff', 0.82)
}

function groupAccentTint(accentHex, baseHex) {
  return mixHex(accentHex || '#0077B6', baseHex || '#ffffff', 0.78)
}

/**
 * Escala de azules del tema: de más profundo a más claro, solo familia primary/primaryLight.
 * Así cada grupo se distingue sin salir de la paleta ClaraCore en Claro/Oscuro/Auto/Descansar.
 */
export function resolveInformesBlueScale(t) {
  const primary = t?.primary || '#0077B6'
  const light = t?.primaryLight || '#00B4C6'
  const bgCard = t?.bgCard || '#ffffff'
  const darkAnchor = hexLuminance(bgCard) < 0.45
    ? mixHex(primary, '#000000', 0.35)
    : mixHex(primary, '#0A1628', 0.45)
  return {
    /** Más profundo — Subcontratista */
    deep: darkAnchor,
    /** Oscuro — Semanales */
    dark: mixHex(primary, darkAnchor, 0.35),
    /** Primary de plataforma — Biblioteca CCD */
    mid: primary,
    /** Primary→light — Gerencia */
    midBright: mixHex(primary, light, 0.4),
    /** Intermedio — Preacta mensual */
    bright: mixHex(primary, light, 0.7),
    /** Más claro (primaryLight) — Entidades */
    light,
  }
}

/** Textos informativos: misma estructura (propósito + uso), sin describir la UI, sin negrita. */
const INFO = {
  root:
    'Genere los informes oficiales del contrato: cortes de subcontratista, ejecución semanal y mensual, gerencia y formatos de entidades externas. Configure firmas y estilos en la Biblioteca CCD y elija el grupo según el periodo o alcance que requiera.',
  biblio:
    'Defina quién elabora, revisa y aprueba cada plantilla CCD y, si aplica, los colores del PDF. Los cambios se guardan por contrato y se aplican al generar vista previa o descargas.',
  sub:
    'Obtenga el corte de cantidades y las memorias fotográficas por subcontratista. Seleccione subcontratista, corte y filtro de aprobación; luego abra el formato para vista previa, descarga o firma.',
  sem:
    'Consulte el resumen de ejecución y las memorias de una semana de aprobación. Elija la semana del contrato y abra el informe o las memorias del periodo seleccionado.',
  ger:
    'Compare el avance de obra por acta RPO con la matriz de costos del periodo. El acta de contexto se toma automáticamente de SICOE; abra el formato para vista previa, PDF con sello o registro de firma.',
  mes:
    'Genere la preacta mensual y las memorias asociadas a un acta RPO. Seleccione el acta y el nivel de aprobación; el costo directo sigue la cascada de la plataforma.',
  ent:
    'Elabore formatos exigidos por entidades contratantes (por ejemplo FO-IDU-EO-04). Indique supervisor, subsistema y acta RPO para vista previa y PDF con sello.',
}

/**
 * Metadatos de grupos con acentos resueltos desde el tema.
 * Conserva `INFORMES_GRUPOS` estático como fallback (tema claro ClaraCore).
 */
export function getInformesGrupos(t) {
  const scale = resolveInformesBlueScale(t)
  return {
    biblio: {
      id: 'biblio',
      label: 'Biblioteca CCD',
      accent: scale.mid,
      info: INFO.biblio,
    },
    sub: {
      id: 'sub',
      label: 'Formatos Subcontratista',
      accent: scale.deep,
      info: INFO.sub,
    },
    sem: {
      id: 'sem',
      label: 'Formatos Semanales',
      accent: scale.dark,
      info: INFO.sem,
    },
    ger: {
      id: 'ger',
      label: 'Informe de gerencia',
      accent: scale.midBright,
      info: INFO.ger,
    },
    mes: {
      id: 'mes',
      label: 'Preacta mensual',
      accent: scale.bright,
      info: INFO.mes,
    },
    ent: {
      id: 'ent',
      label: 'Formatos Entidades Externas',
      accent: scale.light,
      info: INFO.ent,
    },
  }
}

/** Fallback estático (tema claro) para imports que no reciben `t`. */
export const INFORMES_GRUPOS = getInformesGrupos({
  primary: '#0077B6',
  primaryLight: '#00B4C6',
  bgCard: '#FFFFFF',
})

export const INFORMES_INTRO = INFO.root

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
      padding: '8px 10px',
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
      padding: '8px 10px',
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
      padding: '8px 10px',
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
    /** Separación contundente entre grupos (espacio amplio + borde grueso + acento). */
    groupPanel: {
      marginTop: 40,
      marginBottom: 14,
      border: `2px solid ${border}`,
      borderLeft: `8px solid ${accent}`,
      borderRadius: 4,
      background: bgCard,
      overflow: 'hidden',
      boxShadow: `0 6px 20px ${accent}22`,
    },
    groupHead: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '16px 18px',
      border: 'none',
      borderBottom: `2px solid ${border}`,
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
      letterSpacing: '0.03em',
      lineHeight: 1.3,
      textTransform: 'uppercase',
    },
    /** Franja informativa: sin negrita; tipografía más grande y contraste alto. */
    infoBand: {
      margin: 0,
      padding: '14px 16px',
      borderBottom: `1px solid ${border}`,
      background: darkish ? `${accent}28` : `${accent}16`,
      color: infoColor,
      fontSize: 'var(--cc-body)',
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: '0.01em',
    },
    zoneWrap: {
      margin: '20px 14px 16px',
      border: `2px solid ${border}`,
      borderRadius: 4,
      background: bg,
      overflow: 'hidden',
    },
    zoneBar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '10px 12px',
      borderBottom: `2px solid ${border}`,
      background: headerBg,
      color: headerColor,
      fontWeight: 800,
      fontSize: 'var(--cc-caption)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    zoneBody: {
      padding: '14px 12px',
    },
    breadcrumbBar: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '6px 10px',
      padding: '10px 14px',
      marginBottom: 20,
      border: `1px solid ${border}`,
      borderLeft: `5px solid ${accent}`,
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
    /** Título de tipo dentro de Biblioteca (ClaraCore vs Entidades). */
    typeSectionTitle: {
      margin: '24px 14px 12px',
      padding: '10px 12px',
      border: `2px solid ${border}`,
      borderLeft: `6px solid ${accent}`,
      background: headerBg,
      color: headerColor,
      fontWeight: 800,
      fontSize: 'var(--cc-caption)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    /** Fila/acordeón de plantilla dentro de Biblioteca (celdas Excel). */
    biblioFmtWrap: {
      margin: '0 14px 12px',
      border: `1px solid ${border}`,
      borderRadius: 4,
      background: bgCard,
      overflow: 'hidden',
    },
    biblioFmtHead: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      padding: '10px 12px',
      border: 'none',
      background: headerBg,
      cursor: 'pointer',
      textAlign: 'left',
      font: 'inherit',
      color: text,
    },
    biblioFmtBody: {
      padding: 12,
      borderTop: `1px solid ${border}`,
      background: bgCard,
    },
  }
}
