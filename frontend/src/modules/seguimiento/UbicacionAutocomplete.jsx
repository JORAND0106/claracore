import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredDropdown } from './useAnchoredDropdown'

/**
 * Autocompletado de direcciones en Colombia.
 * Combina Mapbox (si hay token), Nominatim y Photon para ampliar cobertura.
 *
 * Sugerencias en portal (fixed) para no quedar recortadas por overflow:auto
 * del modal de acta (pestaña Encabezado).
 */
export default function UbicacionAutocomplete({ t, value, onChange, style }) {
  const [q, setQ] = useState(value || '')
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)
  const wrap = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const listOpen = open && opts.length > 0
  const dropdownStyle = useAnchoredDropdown(listOpen, inputRef, { maxHeight: 280 })

  useEffect(() => { setQ(value || '') }, [value])

  useEffect(() => {
    const onDoc = (e) => {
      if (wrap.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const buscar = (text) => {
    setQ(text)
    onChange?.(text)
    if (timer.current) clearTimeout(timer.current)
    if (!text || text.trim().length < 2) {
      setOpts([])
      setOpen(false)
      return
    }
    timer.current = setTimeout(async () => {
      setBusy(true)
      try {
        const list = await searchPlacesColombia(text.trim())
        setOpts(list)
        setOpen(list.length > 0)
      } catch {
        setOpts([])
      } finally {
        setBusy(false)
      }
    }, 280)
  }

  const listbox = listOpen && dropdownStyle && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={listRef}
        style={{
          ...dropdownStyle,
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          boxShadow: t.shadow || '0 8px 24px rgba(0,0,0,0.12)',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
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
      </div>,
      document.body,
    )
    : null

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => buscar(e.target.value)}
        onFocus={() => { if (opts.length) setOpen(true) }}
        placeholder="Buscar dirección, barrio, municipio o lugar en Colombia…"
        style={style}
        autoComplete="off"
      />
      {busy && (
        <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 'var(--cc-xs)', color: t.textMuted }}>…</div>
      )}
      {listbox}
    </div>
  )
}

function dedupe(list) {
  const seen = new Set()
  const out = []
  for (const item of list) {
    const key = String(item.label || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

async function searchPlacesColombia(query) {
  const q = query.includes('Colombia') || query.includes('colombia')
    ? query
    : `${query}, Colombia`
  const results = await Promise.allSettled([
    searchMapbox(q),
    searchNominatim(q),
    searchPhoton(q),
  ])
  const merged = []
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) merged.push(...r.value)
  }
  return dedupe(merged).slice(0, 15)
}

async function searchMapbox(query) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token) return []
  // Sin filtro types restrictivo para reconocer más lugares (vías, veredas, POI, regiones).
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
    + `?access_token=${encodeURIComponent(token)}`
    + `&country=co&language=es&limit=10`
    + `&proximity=-74.0721,4.7110` // Bogotá como sesgo geográfico
  const r = await fetch(url)
  if (!r.ok) throw new Error('geocode')
  const j = await r.json()
  return (j.features || []).map((f) => ({
    id: `mb-${f.id}`,
    label: f.place_name,
    center: f.center,
    source: 'mapbox',
  }))
}

async function searchNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}`
    + `&format=json&addressdetails=1&limit=10&countrycodes=co&accept-language=es`
  const r = await fetch(url, {
    headers: { 'Accept-Language': 'es', 'User-Agent': 'ClaraCore/1.0 (seguimiento actas)' },
  })
  if (!r.ok) throw new Error('nominatim')
  const j = await r.json()
  return (Array.isArray(j) ? j : []).map((f) => ({
    id: `nom-${f.place_id}`,
    label: f.display_name,
    center: [Number(f.lon), Number(f.lat)],
    source: 'nominatim',
  }))
}

async function searchPhoton(query) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}`
    + `&limit=10&lang=es&lat=4.711&lon=-74.072`
  const r = await fetch(url)
  if (!r.ok) throw new Error('photon')
  const j = await r.json()
  return (j.features || [])
    .filter((f) => {
      const cc = f.properties?.countrycode || f.properties?.country
      if (!cc) return true
      return String(cc).toLowerCase() === 'co' || String(cc).toLowerCase().includes('colombia')
    })
    .map((f, i) => {
      const p = f.properties || {}
      const parts = [p.name, p.street, p.housenumber, p.district, p.city, p.county, p.state, p.country]
        .filter(Boolean)
      const label = parts.length ? [...new Set(parts)].join(', ') : (p.name || query)
      const coords = f.geometry?.coordinates || []
      return {
        id: `ph-${p.osm_id || i}-${label}`,
        label,
        center: coords,
        source: 'photon',
      }
    })
}
