import { useCallback, useState } from 'react'

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'bitacora_export'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * Punto de acceso a exportación consolidada de Bitácora por rango.
 * Visible en las pantallas reales (Libro digital / Calendario), no en paneles huérfanos.
 */
export default function BitacoraExportRangoBar({
  t,
  api,
  visible = true,
  initialDesde = '',
  initialHasta = '',
  compact = false,
  variant = 'panel', // 'panel' | 'libro' | 'inline'
}) {
  const [fechaDesde, setFechaDesde] = useState(() => String(initialDesde || '').slice(0, 10))
  const [fechaHasta, setFechaHasta] = useState(() => String(initialHasta || '').slice(0, 10))
  const [formato, setFormato] = useState('pdf')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const exportar = useCallback(async () => {
    if (!api?.exportBitacoraRangoBlob) {
      setError('Exportación no disponible en esta sesión.')
      return
    }
    const d0 = String(fechaDesde || '').slice(0, 10)
    const d1 = String(fechaHasta || '').slice(0, 10)
    if (!d0 || !d1) {
      setError('Indique fecha Desde y Hasta para exportar el rango.')
      return
    }
    if (d1 < d0) {
      setError('La fecha Hasta debe ser posterior o igual a Desde.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { blob, filename } = await api.exportBitacoraRangoBlob(d0, d1, formato)
      triggerDownload(blob, filename)
    } catch (e) {
      setError(e?.message || 'No se pudo exportar el rango')
    } finally {
      setBusy(false)
    }
  }, [api, fechaDesde, fechaHasta, formato])

  if (!visible) return null

  const isLibro = variant === 'libro'
  const inp = {
    background: isLibro ? 'rgba(255,255,255,0.12)' : (t?.bg || '#fff'),
    color: isLibro ? '#fff' : (t?.text || '#111'),
    border: `1px solid ${isLibro ? 'rgba(255,255,255,0.35)' : (t?.border || '#d1d5db')}`,
    borderRadius: 6,
    padding: compact ? '5px 8px' : '7px 10px',
    fontSize: compact ? 12 : 'var(--cc-sm, 13px)',
    colorScheme: isLibro ? 'dark' : undefined,
  }
  const btn = {
    background: isLibro ? 'rgba(255,255,255,0.18)' : (t?.bg || '#fff'),
    color: isLibro ? '#fff' : (t?.text || '#111'),
    border: `1px solid ${isLibro ? 'rgba(255,255,255,0.45)' : (t?.border || '#d1d5db')}`,
    borderRadius: 6,
    padding: compact ? '5px 10px' : '7px 12px',
    fontWeight: 700,
    cursor: busy ? 'wait' : 'pointer',
    fontSize: compact ? 12 : 'var(--cc-sm, 13px)',
    opacity: busy ? 0.75 : 1,
  }
  const labelStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 11,
    color: isLibro ? 'rgba(255,255,255,0.85)' : (t?.textMuted || '#6b7280'),
  }

  return (
    <div
      data-testid="bitacora-export-rango"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        width: variant === 'inline' ? 'auto' : '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'flex-end',
          padding: variant === 'panel' ? 0 : (isLibro ? '8px 12px' : '8px 0'),
          background: isLibro ? 'rgba(0,0,0,0.18)' : 'transparent',
          borderBottom: isLibro ? '1px solid rgba(255,255,255,0.12)' : undefined,
        }}
      >
        {variant !== 'hidden-title' ? (
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: isLibro ? 'rgba(255,255,255,0.95)' : (t?.textMuted || '#6b7280'),
            marginBottom: 2,
            width: '100%',
          }}>
            Exportar rango de Bitácora
          </div>
        ) : null}
        <label style={labelStyle}>
          Desde
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            style={inp}
            aria-label="Fecha desde exportación Bitácora"
          />
        </label>
        <label style={labelStyle}>
          Hasta
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            style={inp}
            aria-label="Fecha hasta exportación Bitácora"
          />
        </label>
        <label style={labelStyle}>
          Formato
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value)}
            style={inp}
            aria-label="Formato de exportación de Bitácora"
          >
            <option value="pdf">PDF</option>
            <option value="docx">Word (.docx)</option>
            <option value="md">Markdown (.md)</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void exportar()}
          style={btn}
          disabled={busy}
          title="Exporta todos los Reportes Diarios del rango (omite días vacíos)"
        >
          {busy ? 'Exportando…' : 'Exportar rango'}
        </button>
      </div>
      {error ? (
        <div
          role="alert"
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            background: isLibro ? 'rgba(254,226,226,0.95)' : '#FEF2F2',
            color: '#991B1B',
            border: '1px solid #FECACA',
            fontSize: 12,
            margin: isLibro ? '0 12px 8px' : 0,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  )
}
