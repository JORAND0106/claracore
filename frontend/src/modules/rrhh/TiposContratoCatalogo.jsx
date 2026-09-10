import { useState } from 'react'
import { tFrom } from '../../theme/adminPanelTheme'
import { rrhhSheetCssVars, rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

/**
 * Catálogo configurable de tipos de contrato laboral.
 */
export default function TiposContratoCatalogo({
  theme,
  items = [],
  canAdmin = false,
  onCreate,
  onUpdate,
  busy = false,
}) {
  const tTok = tFrom(theme)
  const ui = rrhhSheetStyles(tTok)
  const S = rrhhUi(theme, tTok)
  const cssVars = rrhhSheetCssVars(tTok)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const agregar = async () => {
    if (!canAdmin || !nombre.trim()) return
    await onCreate?.({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, activo: true })
    setNombre('')
    setDescripcion('')
  }

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)' }}>
      <div style={ui.sectionTitle}>Catálogo de tipos de contrato laboral</div>
      <div style={{ marginBottom: 8, color: tTok.textMuted, fontSize: 'var(--cc-caption)' }}>
        Configurable por el administrador. Al registrar o generar el contrato se selecciona un tipo de este catálogo.
      </div>

      {canAdmin && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            style={{ ...S.input, flex: '1 1 180px' }}
            placeholder="Nuevo tipo (ej. Aprendizaje)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <input
            style={{ ...S.input, flex: '2 1 220px' }}
            placeholder="Descripción (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
          <button type="button" style={S.btnPrimary} disabled={busy || !nombre.trim()} onClick={agregar}>
            Agregar
          </button>
        </div>
      )}

      <div style={ui.sheetWrap}>
        <table style={ui.sheetTable}>
          <thead>
            <tr>
              <th style={{ ...ui.th, width: '8%' }}>Orden</th>
              <th style={{ ...ui.th, width: '28%' }}>Nombre</th>
              <th style={{ ...ui.th, width: '36%' }}>Descripción</th>
              <th style={{ ...ui.th, width: '14%' }}>Estado</th>
              <th style={{ ...ui.th, width: '14%' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td style={ui.td} colSpan={5}>Sin tipos. Se crearán los predeterminados al abrir el módulo.</td></tr>
            )}
            {items.map((row) => (
              <tr key={row.id}>
                <td style={ui.td}>{row.orden}</td>
                <td style={ui.td}>{row.nombre}</td>
                <td style={ui.td}>{row.descripcion || '—'}</td>
                <td style={ui.td}>{row.activo ? 'Activo' : 'Inactivo'}</td>
                <td style={ui.td}>
                  {canAdmin ? (
                    <button
                      type="button"
                      style={S.btnGhost}
                      disabled={busy}
                      onClick={() => onUpdate?.(row.id, { activo: !row.activo })}
                    >
                      {row.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
