import { useEffect, useRef, useState } from 'react'

/**
 * Autocompletado de direcciones (Mapbox Geocoding si hay token; si no, Nominatim).
 */
export default function UbicacionAutocomplete({ t, value, onChange, style }) {
  const [q, setQ] = useState(value || '')
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)
  const wrap = useRef(null)

  useEffect(() => { setQ(value || '') }, [value])

  useEffect(() => {
    const onDoc = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const buscar = (text) => {
    setQ(text)
    onChange?.(text)
    if (timer.current) clearTimeout(timer.current)
    if (!text || text.trim().length < 3) {
      setOpts([])
      setOpen(false)
      return
    }
    timer.current = setTimeout(async () => {
      setBusy(true)
      try {
        const list = await searchPlaces(text.trim())
        setOpts(list)
        setOpen(list.length > 0)
      } catch {
        setOpts([])
      } finally {
        setBusy(false)
      }
    }, 320)
  }

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <input
        value={q}
        onChange={(e) => buscar(e.target.value)}
        onFocus={() => { if (opts.length) setOpen(true) }}
        placeholder="Buscar dirección o lugar…"
        style={style}
        autoComplete="off"
      />
      {busy && (
        <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 'var(--cc-xs)', color: t.textMuted }}>…</div>
      )}
      {open && (
        <div style={{
          position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%',
          background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8,
          boxShadow: t.shadow || '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflow: 'auto',
        }}>
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setQ(o.label)
                onChange?.(o.label, o)
                setOpen(false)
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: 'transparent', padding: '8px 10px', cursor: 'pointer',
                color: t.text, fontSize: 'var(--cc-sm)', borderBottom: `1px solid ${t.border}`,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

async function searchPlaces(query) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (token) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
      + `?access_token=${encodeURIComponent(token)}&country=co&language=es&limit=6&types=address,place,locality,neighborhood,poi`
    const r = await fetch(url)
    if (!r.ok) throw new Error('geocode')
    const j = await r.json()
    return (j.features || []).map((f) => ({
      id: f.id,
      label: f.place_name,
      center: f.center,
    }))
  }
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}`
    + `&format=json&addressdetails=1&limit=6&countrycodes=co&accept-language=es`
  const r = await fetch(url, {
    headers: { 'Accept-Language': 'es', 'User-Agent': 'ClaraCore/1.0 (seguimiento actas)' },
  })
  if (!r.ok) throw new Error('nominatim')
  const j = await r.json()
  return (Array.isArray(j) ? j : []).map((f) => ({
    id: String(f.place_id),
    label: f.display_name,
    center: [Number(f.lon), Number(f.lat)],
  }))
}
