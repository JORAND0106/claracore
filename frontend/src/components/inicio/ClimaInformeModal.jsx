/**
 * Popup: rango Desde/Hasta → descarga Excel del informe de clima (zona de obra).
 */
import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import { API_BASE, apiFetchSignal } from '../../apiBase'

function hoyBogotaISO() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function hace30DiasISO() {
  const hoy = hoyBogotaISO()
  const d = new Date(`${hoy}T12:00:00`)
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function parseFilename(cd, fallback) {
  const m = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(cd || '')
  if (m && m[1]) {
    try {
      return decodeURIComponent(m[1].trim())
    } catch {
      return m[1].trim()
    }
  }
  return fallback
}

export default function ClimaInformeModal({
  t,
  fs,
  contratoId,
  token,
  tieneUbicacionObra,
  onClose,
}) {
  const hoy = useMemo(() => hoyBogotaISO(), [])
  const [desde, setDesde] = useState(() => hace30DiasISO())
  const [hasta, setHasta] = useState(() => hoyBogotaISO())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.bgInput || t.bg || '#fff',
    color: t.text,
    fontSize: fs?.sm || 'var(--cc-sm)',
  }

  const iconBtn = {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: 'transparent',
    color: t.text,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: busy ? 'default' : 'pointer',
    padding: 0,
  }

  async function descargar() {
    setMsg('')
    if (!tieneUbicacionObra) {
      setMsg('Se requiere el plano GeoJSON del contrato para generar el informe.')
      return
    }
    if (!desde || !hasta) {
      setMsg('Indique las fechas Desde y Hasta.')
      return
    }
    if (hasta > hoy || desde > hoy) {
      setMsg('El informe solo incluye fechas hasta hoy. Ajuste el rango sin fechas futuras.')
      return
    }
    if (hasta < desde) {
      setMsg('La fecha Hasta no puede ser anterior a Desde.')
      return
    }
    setBusy(true)
    try {
      const q = new URLSearchParams({ desde, hasta })
      const sig = apiFetchSignal(90000)
      const res = await fetch(
        `${API_BASE}/inicio/${encodeURIComponent(contratoId)}/clima/informe.xlsx?${q}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          ...(sig ? { signal: sig } : {}),
        },
      )
      if (!res.ok) {
        let detail = ''
        try {
          const j = await res.json()
          detail = j?.detail || j?.message || ''
          if (Array.isArray(detail)) detail = detail.map((x) => x?.msg || x).join(' ')
        } catch { /* ignore */ }
        if (res.status === 400 && detail) {
          setMsg(String(detail))
          return
        }
        setMsg(
          detail
            || 'No fue posible consultar el clima en este momento. Intente de nuevo en unos minutos.',
        )
        return
      }
      const buf = await res.arrayBuffer()
      if (!buf || buf.byteLength < 8) {
        setMsg('El archivo generado está vacío. Intente de nuevo.')
        return
      }
      const cd = res.headers.get('Content-Disposition') || ''
      const filename = parseFilename(cd, `informe_clima_${desde}_${hasta}.xlsx`)
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      onClose?.()
    } catch {
      setMsg('No fue posible consultar el clima en este momento. Intente de nuevo en unos minutos.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100080,
        background: t.overlay || 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => { if (!busy) onClose?.() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Informe de clima"
        style={{
          width: 'min(420px, 100%)',
          background: t.bgCard || t.bg || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
        >
          <div>
            <div style={{ fontSize: 'var(--cc-h3)', fontWeight: 800, color: t.text }}>
              Informe de clima
            </div>
            <div style={{ fontSize: fs?.badge || 'var(--cc-xs)', color: t.textMuted, marginTop: 2 }}>
              Zona de obra del contrato activo
            </div>
          </div>
          <button
            type="button"
            title="Cerrar"
            data-cc-tooltip="Cerrar"
            data-cc-tooltip-variant="short"
            aria-label="Cerrar"
            disabled={busy}
            onClick={onClose}
            style={iconBtn}
          >
            <X size={17} strokeWidth={2.2} aria-hidden />
          </button>
        </div>

        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!tieneUbicacionObra ? (
            <p style={{ margin: 0, fontSize: fs?.sm || 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
              Se requiere el plano GeoJSON del contrato para generar el informe.
            </p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: fs?.sm || 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
                Un día por fila · Open-Meteo · hora Colombia
              </p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: fs?.sm, color: t.text, fontWeight: 600 }}>
                Desde
                <input
                  type="date"
                  value={desde}
                  max={hoy}
                  disabled={busy}
                  onChange={(e) => setDesde(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: fs?.sm, color: t.text, fontWeight: 600 }}>
                Hasta
                <input
                  type="date"
                  value={hasta}
                  max={hoy}
                  disabled={busy}
                  onChange={(e) => setHasta(e.target.value)}
                  style={inputStyle}
                />
              </label>
            </>
          )}
          {msg ? (
            <div
              role="alert"
              style={{
                fontSize: fs?.sm || 'var(--cc-sm)',
                color: t.danger || '#b91c1c',
                background: 'color-mix(in srgb, #fecaca 35%, transparent)',
                borderRadius: 8,
                padding: '8px 10px',
                lineHeight: 1.4,
              }}
            >
              {msg}
            </div>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: 'transparent',
                color: t.text,
                cursor: busy ? 'default' : 'pointer',
                fontWeight: 600,
                fontSize: fs?.sm,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || !tieneUbicacionObra}
              onClick={descargar}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: t.primary || '#0284c7',
                color: '#fff',
                cursor: busy || !tieneUbicacionObra ? 'default' : 'pointer',
                fontWeight: 700,
                fontSize: fs?.sm,
                opacity: busy || !tieneUbicacionObra ? 0.65 : 1,
              }}
            >
              {busy ? 'Generando…' : 'Descargar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
