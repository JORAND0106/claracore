/**
 * REFERENCIA DE DISEÑO — Barra de clima módulo Inicio (v1)
 * Guardado: 2026-05-22
 *
 * Versión plana y compacta antes de más volumen y animación.
 * Para restaurar: copiar el JSX/estilos de BarraClimaV1 de vuelta a ModuloInicio.jsx
 * (o importar este componente temporalmente).
 */
import { useState, useEffect } from 'react'
import { API_BASE } from '../../apiBase'
import { getContratoPlanoGeojson } from '../../contratoPlanoGeojsonCache.js'

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const BOGOTA_OFICINA = { nombre: 'Bogotá', lat: 4.711, lon: -74.0721 }

function wmoEmoji(code) {
  const c = Number(code)
  if (c === 0) return '☀️'
  if (c >= 1 && c <= 2) return '⛅'
  if (c === 3) return '☁️'
  if (c >= 61 && c <= 67) return '🌧️'
  if (c >= 80 && c <= 82) return '🌦️'
  return '🌡️'
}

function centroideDesdePlano(data) {
  if (!data) return null
  const gj = data.plano_geojson
  const features = gj?.type === 'FeatureCollection'
    ? (gj.features || [])
    : gj?.type === 'Feature'
      ? [gj]
      : []
  const coords = features.flatMap((f) => {
    const g = f.geometry
    if (g?.type === 'Polygon') return g.coordinates[0]
    if (g?.type === 'MultiPolygon') return g.coordinates.flat(2)
    return []
  })
  if (coords.length) {
    return {
      lat: coords.reduce((s, c) => s + c[1], 0) / coords.length,
      lng: coords.reduce((s, c) => s + c[0], 0) / coords.length,
    }
  }
  if (data.centro_lat != null && data.centro_lng != null) {
    const lat = Number(data.centro_lat)
    const lng = Number(data.centro_lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

async function etiquetaZonaObra(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json&accept-language=es`,
      { headers: { 'Accept-Language': 'es', 'User-Agent': 'ClaraCore/1.0 (inicio clima)' } },
    )
    if (r.ok) {
      const j = await r.json()
      const a = j.address || {}
      const nombre = a.city || a.town || a.municipality || a.village || a.county || a.state_district
      if (nombre) return nombre
    }
  } catch { /* fallback */ }
  if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat.toFixed(3)}, ${lng.toFixed(3)}`
  return 'Zona de obra'
}

/** BarraClima v1 — diseño de referencia */
export function BarraClimaV1({ t, fs, contratoId, token }) {
  const [clima, setClima] = useState(null)
  const [error, setError] = useState(false)
  const [zonaObra, setZonaObra] = useState(null)
  const [cargandoZona, setCargandoZona] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!contratoId) {
      setZonaObra(null)
      return undefined
    }
    setCargandoZona(true)
    getContratoPlanoGeojson(API_BASE, contratoId, token)
      .then(async (data) => {
        if (cancelled) return
        const centro = centroideDesdePlano(data)
        if (!centro) {
          setZonaObra({ nombre: 'Zona de obra', lat: null, lng: null })
          return
        }
        const nombre = await etiquetaZonaObra(centro.lat, centro.lng)
        if (!cancelled) setZonaObra({ nombre, lat: centro.lat, lng: centro.lng })
      })
      .catch(() => {
        if (!cancelled) setZonaObra({ nombre: 'Zona de obra', lat: null, lng: null })
      })
      .finally(() => { if (!cancelled) setCargandoZona(false) })
    return () => { cancelled = true }
  }, [contratoId, token])

  useEffect(() => {
    let cancelled = false
    async function cargar() {
      try {
        const fetchClima = (lat, lon, daily) => {
          const p = new URLSearchParams({
            latitude: String(lat),
            longitude: String(lon),
            current: 'temperature_2m,weather_code',
            timezone: 'America/Bogota',
          })
          if (daily) {
            p.set('daily', 'weather_code,temperature_2m_max')
            p.set('forecast_days', '5')
          }
          return fetch(`${OPEN_METEO}?${p}`).then((r) => (r.ok ? r.json() : null))
        }
        const promesas = [fetchClima(BOGOTA_OFICINA.lat, BOGOTA_OFICINA.lon, false)]
        if (zonaObra?.lat != null && zonaObra?.lng != null) {
          promesas.push(fetchClima(zonaObra.lat, zonaObra.lng, true))
        }
        const resultados = await Promise.all(promesas)
        if (cancelled) return
        const bog = resultados[0]
        const obra = resultados[1] || null
        if (!bog?.current) {
          setError(true)
          return
        }
        setClima({ bogota: bog, obra })
        setError(false)
      } catch {
        if (!cancelled) setError(true)
      }
    }
    if (cargandoZona) return undefined
    cargar()
    const iv = setInterval(cargar, 15 * 60 * 1000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [zonaObra, cargandoZona])

  const bog = clima?.bogota?.current
  const obra = clima?.obra?.current
  const daily = clima?.obra?.daily
  const nombreObra = zonaObra?.nombre || 'Zona de obra'

  return (
    <div style={{
      width: '100%',
      border: `1px solid ${t.border}`,
      borderRadius: '12px',
      background: `linear-gradient(90deg, ${t.primary}12 0%, ${t.bgCard} 55%)`,
      padding: '10px 14px',
      marginBottom: '12px',
      boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
    }}>
      <style>{`
        @keyframes ccPulseLive {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(16,185,129,0.55); }
          50% { opacity: 0.75; transform: scale(1.15); box-shadow: 0 0 0 6px rgba(16,185,129,0); }
        }
      `}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span aria-hidden style={{
            width: '8px', height: '8px', borderRadius: '50%', background: '#10B981',
            animation: 'ccPulseLive 1.8s ease-in-out infinite', flexShrink: 0,
          }} />
          <span style={{ fontSize: fs.sm, fontWeight: '800', color: t.text }}>Clima en vivo</span>
        </div>
        {cargandoZona ? (
          <span style={{ fontSize: fs.autor, color: t.textMuted }}>Ubicando zona de obra…</span>
        ) : error && !clima ? (
          <span style={{ fontSize: fs.autor, color: t.textMuted }}>No se pudo cargar el clima.</span>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: fs.sm, color: t.text }}>
              <span style={{ fontWeight: '700' }}>{BOGOTA_OFICINA.nombre}</span>
              <span style={{ fontSize: fs.autor, color: t.textMuted }}>(oficina)</span>
              <span>{wmoEmoji(bog?.weather_code)}</span>
              <span>{bog?.temperature_2m != null ? `${Math.round(bog.temperature_2m)}°C` : '—'}</span>
            </div>
            {obra ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: fs.sm, color: t.text }}>
                <span style={{ fontWeight: '700' }}>{nombreObra}</span>
                <span style={{ fontSize: fs.autor, color: t.textMuted }}>(obra)</span>
                <span>{wmoEmoji(obra?.weather_code)}</span>
                <span>{obra?.temperature_2m != null ? `${Math.round(obra.temperature_2m)}°C` : '—'}</span>
              </div>
            ) : !cargandoZona && (
              <span style={{ fontSize: fs.autor, color: t.textMuted }}>Obra: sin plano para clima local</span>
            )}
            {daily?.time?.length ? (
              <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px',
                marginLeft: 'auto', fontSize: fs.autor, color: t.textMuted,
              }}>
                <span style={{ fontWeight: '700', color: t.text }}>Pronóstico 5 días · {nombreObra}:</span>
                {daily.time.slice(0, 5).map((dia, i) => (
                  <span key={dia} style={{
                    background: t.bg, border: `1px solid ${t.border}`, borderRadius: '8px',
                    padding: '2px 8px', whiteSpace: 'nowrap',
                  }}>
                    {String(dia).slice(5).replace('-', '/')} {wmoEmoji(daily.weather_code?.[i])}{' '}
                    {daily.temperature_2m_max?.[i] != null ? `${Math.round(daily.temperature_2m_max[i])}°` : '—'}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

export default BarraClimaV1
