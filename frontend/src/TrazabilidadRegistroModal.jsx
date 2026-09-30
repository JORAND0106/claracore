import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from './components/CcModalBrandHeader'
import { pptoSheetStyles, pptoSheetCssVars } from './modules/presupuesto/pptoSheetStyles'
import {
  fmtAuditVal,
  presentarEvento,
  etiquetaCampo,
} from './trazabilidadPresentacion'

function SheetTable({ sheet, children, minWidth = 480 }) {
  return (
    <div style={{ ...sheet.sheetWrap, marginTop: 'var(--cc-space-2)', borderRadius: 4 }}>
      <table style={{ ...sheet.sheetTable, minWidth, tableLayout: 'auto' }}>
        {children}
      </table>
    </div>
  )
}

function SectionTitle({ children, sheet, color }) {
  return (
    <div
      style={{
        fontSize: 'var(--cc-caption)',
        fontWeight: 800,
        color: color || sheet.primary,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginTop: 'var(--cc-space-3)',
        marginBottom: 2,
      }}
    >
      {children}
    </div>
  )
}

function KvTable({ sheet, rows, t }) {
  if (!rows?.length) return null
  return (
    <SheetTable sheet={sheet} minWidth={360}>
      <thead>
        <tr>
          <th style={{ ...sheet.th, width: '32%' }}>Propiedad</th>
          <th style={sheet.th}>Valor</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key || r.label}>
            <td style={{ ...sheet.td, fontWeight: 700, color: t.text, whiteSpace: 'nowrap' }}>
              {r.label}
            </td>
            <td style={{ ...sheet.td, wordBreak: 'break-word' }}>
              {fmtAuditVal(r.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </SheetTable>
  )
}

function GridTable({ sheet, table, t }) {
  if (!table?.rows?.length) return null
  const cols = table.columns || []
  return (
    <SheetTable sheet={sheet} minWidth={Math.max(480, 80 + cols.length * 110)}>
      <thead>
        <tr>
          <th style={{ ...sheet.th, width: 40 }}>#</th>
          {cols.map((c, i) => (
            <th key={c} style={sheet.th}>
              {(table.columnLabels && table.columnLabels[i]) || etiquetaCampo(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row._i}>
            <td style={{ ...sheet.tdMuted, textAlign: 'center' }}>{row._i}</td>
            {cols.map((c) => (
              <td key={c} style={{ ...sheet.td, wordBreak: 'break-word' }}>
                {fmtAuditVal(row[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </SheetTable>
  )
}

function ObjectTableBlock({ sheet, table, t }) {
  if (!table) return null
  return (
    <div>
      {table.title ? <SectionTitle sheet={sheet}>{table.title}</SectionTitle> : null}
      {table.kind === 'grid' ? (
        <GridTable sheet={sheet} table={table} t={t} />
      ) : (
        <KvTable sheet={sheet} rows={table.rows} t={t} />
      )}
    </div>
  )
}

function CambiosTable({ sheet, cambios, t }) {
  if (!cambios?.length) return null
  return (
    <div>
      <SectionTitle sheet={sheet}>
        Campos modificados ({cambios.length})
      </SectionTitle>
      <SheetTable sheet={sheet} minWidth={560}>
        <thead>
          <tr>
            <th style={{ ...sheet.th, width: '28%' }}>Campo</th>
            <th style={sheet.th}>Anterior</th>
            <th style={sheet.th}>Nuevo</th>
          </tr>
        </thead>
        <tbody>
          {cambios.map((c) => (
            <tr key={c.key}>
              <td style={{ ...sheet.td, fontWeight: 700, color: t.text }}>
                {c.pathLabel || c.label}
              </td>
              <td
                style={{
                  ...sheet.td,
                  color: '#B45309',
                  wordBreak: 'break-word',
                  background: 'rgba(180,83,9,0.06)',
                }}
              >
                {fmtAuditVal(c.before)}
              </td>
              <td
                style={{
                  ...sheet.td,
                  color: 'var(--cc-color-success, #15803d)',
                  fontWeight: 600,
                  wordBreak: 'break-word',
                  background: 'rgba(22,163,74,0.06)',
                }}
              >
                {fmtAuditVal(c.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </SheetTable>
    </div>
  )
}

function EventoCard({ evento, sheet, t }) {
  return (
    <div
      style={{
        background: t.bgCard,
        border: `1px solid ${sheet.border}`,
        borderRadius: 6,
        padding: 'var(--cc-space-2) var(--cc-space-3) var(--cc-space-3)',
        marginBottom: 'var(--cc-space-3)',
      }}
    >
      <SheetTable sheet={sheet} minWidth={640}>
        <thead>
          <tr>
            <th style={sheet.th}>Acción</th>
            <th style={sheet.th}>Usuario</th>
            <th style={sheet.th}>Módulo</th>
            <th style={sheet.th}>Ámbito</th>
            <th style={sheet.th}>Severidad</th>
            <th style={sheet.th}>Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...sheet.td, fontWeight: 800, color: t.primary, whiteSpace: 'nowrap' }}>
              {evento.accion}
            </td>
            <td style={sheet.td}>{evento.usuario}</td>
            <td style={sheet.td}>{evento.modulo}</td>
            <td style={{ ...sheet.td, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 'var(--cc-caption)' }}>
              {evento.ambito}
            </td>
            <td style={sheet.tdMuted}>{evento.severidad || '—'}</td>
            <td style={{ ...sheet.td, whiteSpace: 'nowrap' }}>{evento.fecha}</td>
          </tr>
        </tbody>
      </SheetTable>

      {evento.scalarRows.length > 0 && (
        <div>
          <SectionTitle sheet={sheet}>Detalle</SectionTitle>
          <KvTable sheet={sheet} rows={evento.scalarRows} t={t} />
        </div>
      )}

      {evento.objectTables.map((tbl, i) => (
        <ObjectTableBlock key={`${tbl.title || 'obj'}-${i}`} sheet={sheet} table={tbl} t={t} />
      ))}

      <CambiosTable sheet={sheet} cambios={evento.cambios} t={t} />

      {(evento.beforeTable || evento.afterTable) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: evento.beforeTable && evento.afterTable ? '1fr 1fr' : '1fr',
            gap: 'var(--cc-space-3)',
            marginTop: 'var(--cc-space-2)',
          }}
        >
          {evento.beforeTable && <ObjectTableBlock sheet={sheet} table={evento.beforeTable} t={t} />}
          {evento.afterTable && <ObjectTableBlock sheet={sheet} table={evento.afterTable} t={t} />}
        </div>
      )}

      {(evento.fallbackAntes != null || evento.fallbackNuevo != null) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--cc-space-2)',
            marginTop: 'var(--cc-space-2)',
          }}
        >
          <div>
            <SectionTitle sheet={sheet}>Valor anterior</SectionTitle>
            <div style={{ ...sheet.td, border: `1px solid ${sheet.border}`, wordBreak: 'break-word' }}>
              {evento.fallbackAntes ?? '—'}
            </div>
          </div>
          <div>
            <SectionTitle sheet={sheet}>Valor nuevo</SectionTitle>
            <div style={{ ...sheet.td, border: `1px solid ${sheet.border}`, wordBreak: 'break-word' }}>
              {evento.fallbackNuevo ?? '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Historial de auditoría de una entidad (GET /logs/entidad/...).
 * Compartido por Presupuesto, SICOE, Topografía, Almacén, etc.
 * Presentación tipo Excel: cabecera por evento + tablas Propiedad/Valor y Campo/Anterior/Nuevo.
 */
export default function TrazabilidadRegistroModal({
  apiBase,
  token,
  entidadTipo,
  entidadId,
  titulo,
  theme,
  onClose,
}) {
  const t = theme
  const sheet = useMemo(() => pptoSheetStyles(t), [t])
  const cssVars = useMemo(() => pptoSheetCssVars(t), [t])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entidadTipo || entidadId == null || entidadId === '') {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(
      `${apiBase}/logs/entidad/${encodeURIComponent(entidadTipo)}/${encodeURIComponent(String(entidadId))}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [apiBase, token, entidadTipo, entidadId])

  const fmtFecha = (iso) => {
    if (!iso) return '—'
    try {
      const utc = iso.endsWith('Z') ? iso : `${iso}Z`
      return new Date(utc).toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Bogota',
      })
    } catch {
      return iso
    }
  }

  const eventos = useMemo(
    () => (Array.isArray(rows) ? rows.map((h) => presentarEvento(h, { fmtFecha })) : []),
    [rows],
  )

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 100002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...cssVars,
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 'var(--cc-space-4) var(--cc-space-5)',
          width: 'min(1280px, 98vw)',
          maxWidth: '98vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: t.shadow || '0 20px 60px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={theme} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 'var(--cc-space-3)',
            gap: 'var(--cc-space-3)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--cc-title)',
                fontWeight: 800,
                color: t.text,
                lineHeight: 1.25,
              }}
            >
              📜 Trazabilidad
            </div>
            <div
              style={{
                fontSize: 'var(--cc-sm)',
                color: t.textMuted,
                marginTop: 'var(--cc-space-1)',
                lineHeight: 1.35,
              }}
            >
              {titulo}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 'var(--cc-lg)',
              cursor: 'pointer',
              color: t.textMuted,
              lineHeight: 1,
              padding: 'var(--cc-space-1)',
            }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--cc-space-5)',
              color: t.textMuted,
              fontSize: 'var(--cc-sm)',
            }}
          >
            Cargando historial…
          </div>
        ) : eventos.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--cc-space-5)',
              color: t.textMuted,
              fontSize: 'var(--cc-sm)',
            }}
          >
            Aún no hay eventos de auditoría para este registro.
          </div>
        ) : (
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {eventos.map((ev) => (
              <EventoCard key={ev.id} evento={ev} sheet={sheet} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
