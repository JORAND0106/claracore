import { useEffect, useState } from 'react'
import { API_BASE } from '../../apiBase'
import { labelClima } from './bitacoraConstants'

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'

function centroideDesdePlano(data) {
  if (!data) return null
  if (data.centro_lat != null && data.centro_lng != null) {
    return { lat: Number(data.centro_lat), lng: Number(data.centro_lng) }
  }
  const geo = data.plano_geojson || data.geojson || data.plano
  try {
    const g = typeof geo === 'string' ? JSON.parse(geo) : geo
    const coords = []
    const walk = (obj) => {
      if (!obj) return
      if (Array.isArray(obj) && obj.length >= 2 && typeof obj[0] === 'number') {
        coords.push([obj[0], obj[1]])
        return
      }
      if (Array.isArray(obj)) obj.forEach(walk)
      else if (typeof obj === 'object') {
        if (obj.coordinates) walk(obj.coordinates)
        if (obj.features) walk(obj.features)
        if (obj.geometry) walk(obj.geometry)
      }
    }
    walk(g)
    if (!coords.length) return null
    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
    return { lat, lng }
  } catch {
    return null
  }
}

/**
 * Autocompleta clima desde Open-Meteo (mismo origen que el widget de inicio),
 * permitiendo edición manual si el clima real difiere del pronóstico.
 */
export default function BitacoraClimaField({
  t,
  contratoId,
  token,
  value,
  onChange,
  disabled = false,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cargar = async () => {
    if (disabled) return
    setLoading(true)
    setError('')
    try {
      let lat = 4.711
      let lon = -74.0721
      if (contratoId) {
        const h = token ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch(`${API_BASE}/contratos/${contratoId}`, { headers: h })
        if (res.ok) {
          const data = await res.json()
          const c = centroideDesdePlano(data)
          if (c?.lat != null && c?.lng != null) {
            lat = c.lat
            lon = c.lng
          }
        }
      }
      const p = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: 'temperature_2m,weather_code',
        timezone: 'America/Bogota',
      })
      const climaRes = await fetch(`${OPEN_METEO}?${p}`)
      if (!climaRes.ok) throw new Error('No se pudo consultar el clima')
      const json = await climaRes.json()
      const cur = json?.current
      if (!cur) throw new Error('Respuesta de clima vacía')
      onChange?.({
        clima_codigo: cur.weather_code,
        clima_temp_c: cur.temperature_2m,
        clima_descripcion: labelClima(cur.weather_code),
        clima_editado_manual: false,
      })
    } catch (e) {
      setError(e.message || 'Error al cargar clima')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (
      value?.clima_codigo == null
      && value?.clima_temp_c == null
      && !value?.clima_descripcion
      && !disabled
    ) {
      void cargar()
    }
    // solo al montar / cuando aún no hay clima
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId])

  const inp = {
    background: t.bg,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      border: `1px solid ${t.border}`,
      borderRadius: 10,
      padding: 12,
      background: t.bgCard,
    }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
      }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-body)' }}>
          Clima del día
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={loading}
            style={{
              background: t.bg,
              color: t.text,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: '6px 10px',
              fontWeight: 600,
              fontSize: 'var(--cc-sm)',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Consultando…' : 'Actualizar desde clima en vivo'}
          </button>
        )}
      </div>
      {error && (
        <div style={{ color: '#B91C1C', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>{error}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
          Temperatura (°C)
          <input
            type="number"
            step="0.1"
            disabled={disabled}
            value={value?.clima_temp_c ?? ''}
            onChange={(e) => onChange?.({
              ...value,
              clima_temp_c: e.target.value === '' ? null : Number(e.target.value),
              clima_editado_manual: true,
            })}
            style={inp}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
          Código WMO
          <input
            type="number"
            disabled={disabled}
            value={value?.clima_codigo ?? ''}
            onChange={(e) => {
              const code = e.target.value === '' ? null : Number(e.target.value)
              onChange?.({
                ...value,
                clima_codigo: code,
                clima_descripcion: labelClima(code) || value?.clima_descripcion,
                clima_editado_manual: true,
              })
            }}
            style={inp}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)', color: t.textMuted, gridColumn: '1 / -1' }}>
          Descripción
          <input
            disabled={disabled}
            value={value?.clima_descripcion || ''}
            onChange={(e) => onChange?.({
              ...value,
              clima_descripcion: e.target.value,
              clima_editado_manual: true,
            })}
            placeholder="Ej. Parcialmente nublado"
            style={inp}
          />
        </label>
      </div>
      {value?.clima_editado_manual && (
        <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
          Clima editado manualmente (diferente al pronóstico en vivo).
        </div>
      )}
    </div>
  )
}
