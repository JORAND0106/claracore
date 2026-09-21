/**
 * Grilla tipo Excel para captura de datos en Topografía.
 * Encabezados de columna + fila(s) de celdas compactas (mismo criterio que Bitácora / SicoeObra).
 * Con `compact`, apila campos en pares verticales (móvil) sin scroll horizontal.
 * Con `groups`, renderiza varias filas/bloques etiquetados (p. ej. cabecera de planilla).
 */
import { topoSheetStyles } from './topoSheetStyles'

function HeaderHelp({ ayuda }) {
  if (!ayuda) return null
  return (
    <span
      title={ayuda}
      aria-label={ayuda}
      style={{
        display: 'inline-flex',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: '#94a3b8',
        color: '#fff',
        fontSize: 8,
        fontWeight: 700,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'help',
        flexShrink: 0,
        textTransform: 'none',
        letterSpacing: 0,
      }}
    >
      ?
    </span>
  )
}

/**
 * Campo etiquetado (label arriba, valor abajo).
 */
function CompactField({ col, cell, sheet }) {
  const full = Boolean(col.compactFull)
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
        gridColumn: full ? '1 / -1' : undefined,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 'var(--cc-xxs)',
          fontWeight: 800,
          color: sheet.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          lineHeight: 1.2,
        }}
      >
        {col.label}
        <HeaderHelp ayuda={col.ayuda} />
      </span>
      <div
        style={{
          border: `1px solid ${sheet.border}`,
          borderRadius: 8,
          background: sheet.bgCard,
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
          padding: '2px 6px',
          boxSizing: 'border-box',
        }}
      >
        {cell}
      </div>
    </label>
  )
}

function FieldsGrid({ columns, cells, sheet, compact }) {
  const gridStyle = compact
    ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, alignItems: 'start' }
    : { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 10, alignItems: 'start' }
  return (
    <div style={gridStyle}>
      {columns.map((col, i) => (
        <CompactField key={col.key || i} col={col} cell={(cells || [])[i]} sheet={sheet} />
      ))}
    </div>
  )
}

function GroupsLayout({ title, groups, sheet, compact, style, className }) {
  return (
    <div style={{ marginBottom: 12, ...style }} className={className}>
      {title ? <div style={sheet.sectionTitle}>{title}</div> : null}
      <div
        style={{
          ...sheet.sheetWrap,
          overflow: 'visible',
          borderRadius: 10,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
        className="cc-topo-sheet-groups"
      >
        {groups.map((group, gi) => (
          <div key={group.key || group.title || gi} className="cc-topo-sheet-group">
            {group.title ? (
              <div
                style={{
                  fontSize: 'var(--cc-xxs)',
                  fontWeight: 800,
                  color: sheet.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 8,
                  paddingBottom: 4,
                  borderBottom: `1px solid ${sheet.border}`,
                }}
              >
                {group.title}
              </div>
            ) : null}
            <FieldsGrid
              columns={group.columns || []}
              cells={group.cells || []}
              sheet={sheet}
              compact={compact}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} [props.t] Tema (border, text, …). Si no se pasa, usa defaults.
 * @param {string} [props.title] Título de sección sobre la grilla.
 * @param {{ key: string, label: string, ayuda?: string, width?: string|number, compactFull?: boolean }[]} [props.columns]
 * @param {import('react').ReactNode[]} [props.cells] Celdas de una sola fila (mismo orden que columns).
 * @param {{ key?: string, title?: string, columns: object[], cells: import('react').ReactNode[] }[]} [props.groups]
 *        Bloques multilínea con etiqueta visible (desktop y móvil). Si hay groups, se ignora columns/cells.
 * @param {import('react').ReactNode} [props.children] Filas personalizadas (<tr>…). Si hay children, se ignora cells.
 * @param {string|number} [props.minWidth]
 * @param {boolean} [props.compact] Layout vertical/pares para móvil (sin tabla horizontal).
 * @param {object} [props.style]
 * @param {object} [props.tableStyle]
 * @param {string} [props.className]
 * @param {object} [props.sheet] Estilos precalculados (opcional; evita recalcular en bucles).
 */
export default function TopoExcelSheet({
  t,
  title,
  columns = [],
  cells,
  groups,
  children,
  minWidth,
  compact = false,
  style,
  tableStyle,
  className = '',
  sheet: sheetProp,
}) {
  const sheet = sheetProp || topoSheetStyles(t)

  if (Array.isArray(groups) && groups.length > 0) {
    return (
      <GroupsLayout
        title={title}
        groups={groups}
        sheet={sheet}
        compact={compact}
        style={style}
        className={className}
      />
    )
  }

  if (compact && !children) {
    return (
      <div style={{ marginBottom: 12, ...style }} className={className}>
        {title ? <div style={sheet.sectionTitle}>{title}</div> : null}
        <div
          style={{
            ...sheet.sheetWrap,
            overflow: 'visible',
            borderRadius: 10,
            padding: 10,
          }}
          className="cc-topo-sheet-compact"
        >
          <FieldsGrid columns={columns} cells={cells} sheet={sheet} compact />
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 12, ...style }} className={className}>
      {title ? <div style={sheet.sectionTitle}>{title}</div> : null}
      <div style={sheet.sheetWrap} className="cc-topo-table-scroll">
        <table
          style={{
            ...sheet.sheetTable,
            tableLayout: minWidth ? 'auto' : sheet.sheetTable.tableLayout,
            minWidth: minWidth || undefined,
            ...tableStyle,
          }}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    ...sheet.th,
                    ...(col.width != null ? { width: col.width } : null),
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    <HeaderHelp ayuda={col.ayuda} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {children || (
              <tr>
                {(cells || []).map((cell, i) => (
                  <td key={columns[i]?.key || i} style={sheet.td}>
                    {cell}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export { topoSheetStyles, HeaderHelp }
