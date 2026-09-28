/**
 * Piezas de presentación Excel para Informes (sin lógica de negocio).
 */
import { INFORMES_GRUPOS, informesSheetStyles, informesSheetCssVars } from './informesSheetStyles'

export { INFORMES_GRUPOS, informesSheetStyles, informesSheetCssVars }

/** Barra de ubicación: Informes › Grupo › Formato + volver. */
export function InformesBreadcrumb({
  sheet,
  crumbs = [],
  onGoRoot,
  onGoGrupo,
  onBack,
  backLabel = '← Volver al grupo',
}) {
  return (
    <nav aria-label="Ubicación en Informes" style={sheet.breadcrumbBar}>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={`${c.kind}-${c.label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span style={sheet.breadcrumbSep} aria-hidden>›</span>}
            {isLast ? (
              <span style={sheet.breadcrumbCurrent}>{c.label}</span>
            ) : c.kind === 'root' ? (
              <button type="button" style={sheet.breadcrumbLink} onClick={onGoRoot}>
                {c.label}
              </button>
            ) : c.kind === 'grupo' ? (
              <button type="button" style={sheet.breadcrumbLink} onClick={() => onGoGrupo?.(c.grupoId)}>
                {c.label}
              </button>
            ) : (
              <span style={sheet.breadcrumbCurrent}>{c.label}</span>
            )}
          </span>
        )
      })}
      {onBack && (
        <button type="button" style={sheet.backBtn} onClick={onBack}>
          {backLabel}
        </button>
      )}
    </nav>
  )
}

/** Contenedor de grupo con identidad (acento + cabecera + franja informativa). */
export function InformesGrupoPanel({
  sheet,
  grupoMeta,
  abierto,
  onToggle,
  children,
  styleVars,
}) {
  return (
    <section
      style={{ ...sheet.groupPanel, ...styleVars }}
      aria-labelledby={`informes-grupo-${grupoMeta.id}-title`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        style={sheet.groupHead}
      >
        <span style={{ minWidth: 0 }}>
          <div id={`informes-grupo-${grupoMeta.id}-title`} style={sheet.groupTitle}>
            {grupoMeta.label}
          </div>
        </span>
        <span style={{ color: sheet.textMuted, fontSize: 'var(--cc-body)', flexShrink: 0 }} aria-hidden>
          {abierto ? '▼' : '▶'}
        </span>
      </button>
      {abierto && (
        <>
          <div style={sheet.infoBand} role="note">
            {grupoMeta.info}
          </div>
          <div style={{ padding: '4px 0 12px' }}>{children}</div>
        </>
      )}
    </section>
  )
}

/** Zona delimitada (Parámetros / Formatos / Acciones / Vista). */
export function InformesZona({ sheet, titulo, children, right }) {
  return (
    <div style={sheet.zoneWrap}>
      <div style={sheet.zoneBar}>
        <span>{titulo}</span>
        {right || null}
      </div>
      <div style={sheet.zoneBody}>{children}</div>
    </div>
  )
}

/** Tabla de parámetros etiqueta | control (celdas Excel). */
export function InformesParamTable({ sheet, rows }) {
  return (
    <div style={sheet.sheetWrap}>
      <table style={sheet.sheetTable}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td style={sheet.tdLabel}>{row.label}</td>
              <td style={sheet.td}>{row.control}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Listado de formatos del grupo en tabla Excel. */
export function InformesFormatosTable({ sheet, formatos, formatoActivoCodigo, onAbrir }) {
  return (
    <div style={{ ...sheet.sheetWrap, overflowX: 'auto' }}>
      <table style={{ ...sheet.sheetTable, minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ ...sheet.th, width: '14%' }}>Código</th>
            <th style={{ ...sheet.th, width: '26%' }}>Nombre</th>
            <th style={{ ...sheet.th, width: '34%' }}>Descripción</th>
            <th style={{ ...sheet.th, width: '16%' }}>Descargas</th>
            <th style={{ ...sheet.th, width: '10%' }}>Abrir</th>
          </tr>
        </thead>
        <tbody>
          {formatos.map((f) => {
            const activo = formatoActivoCodigo === f.codigo
            return (
              <tr
                key={f.codigo}
                style={activo ? { background: `${sheet.accent}18` } : undefined}
              >
                <td style={{ ...sheet.td, fontWeight: 700, color: sheet.headerColor }}>{f.codigo}</td>
                <td style={sheet.td}>{f.nombre}</td>
                <td style={sheet.tdMuted}>{f.descripcion}</td>
                <td style={sheet.tdMuted}>{f.descargas}</td>
                <td style={sheet.td}>
                  <button
                    type="button"
                    style={sheet.formatRowBtn}
                    aria-pressed={activo}
                    onClick={() => onAbrir?.(f.codigo)}
                  >
                    {activo ? 'Abierto' : 'Abrir'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
