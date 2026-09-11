import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import CieloClimaCanvas from '../../components/inicio/CieloClimaCanvas'
import { labelClima } from './bitacoraConstants'
import { bitacoraSheetStyles } from './bitacoraSheetStyles'
import { esFechaPasadaBitacora, pickHourlyClima } from './bitacoraClimaHelpers'

const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'

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
 * Clima compacto: en vivo si la fecha es hoy; histórico Open-Meteo si es atrasada.
 */
export default function BitacoraClimaField({
  t,
  contratoId,
  token,
  fecha = '',
  horaPreferida = '12:00',
  value,
  onChange,
  disabled = false,
  compact = true,
}) {
  const ui = bitacoraSheetStyles(t)
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

      const fechaISO = String(fecha || '').slice(0, 10)
      const past = esFechaPasadaBitacora(fechaISO)
      let preferHour = 12
      try {
        preferHour = Number(String(horaPreferida || '12:00').slice(0, 2))
        if (!Number.isFinite(preferHour)) preferHour = 12
      } catch { preferHour = 12 }

      let next = null
      if (past) {
        const p = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          start_date: fechaISO,
          end_date: fechaISO,
          hourly: 'temperature_2m,weather_code',
          timezone: 'America/Bogota',
        })
        let json = null
        for (const base of [OPEN_METEO_ARCHIVE, OPEN_METEO_FORECAST]) {
          const climaRes = await fetch(`${base}?${p}`)
          if (!climaRes.ok) continue
          json = await climaRes.json()
          if (json?.hourly?.time?.length) break
        }
        if (!json?.hourly) throw new Error('No se pudo consultar el clima histórico')
        next = pickHourlyClima(json.hourly, preferHour)
        if (!next) throw new Error('Sin datos de clima para esa fecha')
      } else {
        const p = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          current: 'temperature_2m,weather_code',
          timezone: 'America/Bogota',
        })
        const climaRes = await fetch(`${OPEN_METEO_FORECAST}?${p}`)
        if (!climaRes.ok) throw new Error('No se pudo consultar el clima')
        const json = await climaRes.json()
        const cur = json?.current
        if (!cur) throw new Error('Respuesta de clima vacía')
        next = {
          clima_codigo: cur.weather_code,
          clima_temp_c: cur.temperature_2m,
          clima_descripcion: labelClima(cur.weather_code),
        }
      }

      onChange?.({
        ...next,
        clima_editado_manual: false,
      })
    } catch (e) {
      setError(e.message || 'Error al cargar clima')
    } finally {
      setLoading(false)
    }
  }

  // Primera carga / cambio de fecha: autocompletar si no hay edición manual.
  useEffect(() => {
    if (disabled) return undefined
    if (value?.clima_editado_manual) return undefined
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId, fecha])

  if (compact) {
    const past = esFechaPasadaBitacora(fecha)
    return (
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        border: `1px solid ${ui.border}`,
        borderRadius: 4,
        overflow: 'hidden',
        minHeight: 36,
        flex: '1 1 220px',
        background: t.bgCard,
        position: 'relative',
      }}>
        <div style={{
          position: 'relative',
          width: 72,
          minHeight: 36,
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          <CieloClimaCanvas
            wmoCode={value?.clima_codigo ?? 0}
            style={{ position: 'absolute', inset: 0 }}
          />
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 6px',
          flex: 1,
          minWidth: 0,
        }}>
          <input
            type="number"
            step="0.1"
            disabled={disabled}
            title="Temperatura °C"
            value={value?.clima_temp_c ?? ''}
            onChange={(e) => onChange?.({
              ...value,
              clima_temp_c: e.target.value === '' ? null : Number(e.target.value),
              clima_editado_manual: true,
            })}
            style={{
              ...ui.cellInp,
              width: 52,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
            }}
          />
          <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 700 }}>°C</span>
          <input
            disabled={disabled}
            value={value?.clima_descripcion || ''}
            onChange={(e) => onChange?.({
              ...value,
              clima_descripcion: e.target.value,
              clima_editado_manual: true,
            })}
            placeholder={past ? 'Clima histórico' : 'Clima'}
            style={{ ...ui.cellInp, flex: 1, minWidth: 0 }}
          />
          {!disabled && (
            <button
              type="button"
              title={past ? 'Actualizar desde clima histórico de la fecha' : 'Actualizar desde clima en vivo'}
              onClick={() => void cargar()}
              disabled={loading}
              style={{ ...ui.clipBtn, opacity: loading ? 0.5 : 1 }}
            >
              {loading ? '…' : '↻'}
            </button>
          )}
        </div>
        {error && (
          <div style={{
            position: 'absolute', bottom: -18, left: 0,
            fontSize: 10, color: '#B91C1C',
          }}>{error}</div>
        )}
      </div>
    )
  }

  return null
}
