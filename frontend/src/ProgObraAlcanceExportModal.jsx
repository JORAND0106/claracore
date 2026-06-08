import { useCallback, useEffect, useMemo, useState } from 'react'

const EXPORT_FORMATS = [
  { id: 'xml', label: 'MS Project (XML)' },
  { id: 'excel', label: 'Excel (Curva S)' },
  { id: 'pdf', label: 'PDF (Curva S)' },
]

function pkPctLabel(row) {
  const est = row?.estado_programacion || 'sin_iniciar'
  if (est === 'sin_cantidad') return '—'
  const pct = Number(row?.porcentaje_programado)
  if (!Number.isFinite(pct)) return '—'
  return `${Math.round(pct)}% programado`
}

export default function ProgObraAlcanceExportModal({
  open,
  onClose,
  onConfirm,
  pkRows = [],
  t,
  mode = 'curva',
  busy = false,
}) {
  const [scopeMode, setScopeMode] = useState('all')
  const [selectedPks, setSelectedPks] = useState(() => new Set())
  const [exportFormat, setExportFormat] = useState('xml')

  const sortedRows = useMemo(
    () =>
      [...(pkRows || [])].sort((a, b) =>
        String(a.pk_id || '').localeCompare(String(b.pk_id || ''), undefined, { numeric: true }),
      ),
    [pkRows],
  )

  useEffect(() => {
    if (!open) return
    setScopeMode('all')
    setSelectedPks(new Set())
    setExportFormat('xml')
  }, [open])

  const togglePk = useCallback((pk) => {
    const id = String(pk || '').trim()
    if (!id) return
    setSelectedPks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setScopeMode('specific')
  }, [])

  const canConfirm =
    scopeMode === 'all' || (scopeMode === 'specific' && selectedPks.size > 0)

  const handleConfirm = () => {
    if (!canConfirm || busy) return
    const pkIds =
      scopeMode === 'all' ? null : [...selectedPks].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    onConfirm({
      scope: scopeMode,
      pkIds,
      format: mode === 'export' ? exportFormat : null,
    })
  }

  if (!open) return null

  const title = mode === 'export' ? 'Exportar programación' : 'Ver curva de inversión'
  const question = mode === 'export' ? '¿Qué deseas exportar?' : '¿Qué deseas analizar?'

  return (
    <div
      role="presentation"
      onClick={() => !busy && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prog-alcance-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard,
          borderRadius: 12,
          border: `1px solid ${t.border}`,
          padding: '1.25rem 1.35rem',
          maxWidth: 440,
          width: '100%',
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
          fontSize: 'var(--cc-sm)',
          color: t.text,
        }}
      >
        <div id="prog-alcance-title" style={{ fontWeight: 700, fontSize: 'var(--cc-md)', color: t.primary, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ color: t.textMuted, marginBottom: '0.85rem' }}>{question}</div>

        <hr style={{ border: 'none', borderTop: `1px solid ${t.border}`, margin: '0.65rem 0 0.85rem' }} />

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: '0.65rem',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="radio"
            name="prog-alcance-scope"
            checked={scopeMode === 'all'}
            disabled={busy}
            onChange={() => setScopeMode('all')}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>Programación completa</strong>
            <span style={{ display: 'block', color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
              Todos los tramos
            </span>
          </span>
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: '0.35rem',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="radio"
            name="prog-alcance-scope"
            checked={scopeMode === 'specific'}
            disabled={busy}
            onChange={() => setScopeMode('specific')}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>Tramos específicos</strong>
          </span>
        </label>

        <div
          style={{
            marginLeft: 24,
            marginBottom: mode === 'export' ? '0.85rem' : 0,
            maxHeight: 180,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {sortedRows.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>No hay tramos programables.</div>
          ) : (
            sortedRows.map((row) => {
              const pk = String(row.pk_id || '').trim()
              if (!pk) return null
              const checked = selectedPks.has(pk)
              return (
                <label
                  key={pk}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '3px 6px',
                    borderRadius: 5,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    background: checked ? `${t.primary}10` : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => togglePk(pk)}
                  />
                  <span>
                    PK {pk} · {pkPctLabel(row)}
                  </span>
                </label>
              )
            })
          )}
        </div>

        {mode === 'export' && (
          <>
            <hr style={{ border: 'none', borderTop: `1px solid ${t.border}`, margin: '0.85rem 0' }} />
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Formato</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {EXPORT_FORMATS.map((f) => (
                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: busy ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="radio"
                    name="prog-export-format"
                    checked={exportFormat === f.id}
                    disabled={busy}
                    onChange={() => setExportFormat(f.id)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.15rem' }}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{
              padding: '0.45rem 0.85rem',
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm || busy}
            onClick={handleConfirm}
            style={{
              padding: '0.45rem 0.85rem',
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${t.primary}`,
              background: `${t.primary}12`,
              color: t.primary,
              cursor: !canConfirm || busy ? 'not-allowed' : 'pointer',
              opacity: !canConfirm || busy ? 0.55 : 1,
            }}
          >
            {busy ? 'Exportando…' : mode === 'export' ? 'Exportar' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}
