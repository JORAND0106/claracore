import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredDropdown } from './useAnchoredDropdown'

/**
 * Autocompletado de direcciones en Colombia.
 * Combina Mapbox (si hay token), Nominatim y Photon para ampliar cobertura.
 *
 * Sugerencias en portal (fixed) para no quedar recortadas por overflow:auto
 * del modal de acta (pestaña Encabezado).
 * Los fallos de red/CORS de geocoders externos se silencian (no rompen el acta).
 */
export default function UbicacionAutocomplete({ t, value, onChange, style }) {
  const listId = useId()
  const [q, setQ] = useState(value || '')
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const timer = useRef(null)
  const abortRef = useRef(null)
  const wrap = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const reqSeq = useRef(0)

  const listOpen = open && opts.length > 0
  const dropdownStyle = useAnchoredDropdown(listOpen, inputRef, { maxHeight: 280 })

  useEffect(() => { setQ(value || '') }, [value])

  useEffect(() => {
    const onDoc = (e) => {
      if (wrap.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      if (timer.current) clearTimeout(timer.current)
      try { abortRef.current?.abort() } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    setHighlight(-1)
  }, [q, open, opts.length])

  useEffect(() => {
    if (highlight < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-opt-idx="${highlight}"]`)
    try { el?.scrollIntoView({ block: 'nearest' }) } catch { /* ignore */ }
  }, [highlight])

  const pick = (o) => {
    setQ(o.label)
    onChange?.(o.label, o)
    setOpen(false)
    setHighlight(-1)
  }

  const buscar = (text) => {
    setQ(text)
    onChange?.(text)
    if (timer.current) clearTimeout(timer.current)
    try { abortRef.current?.abort() } catch { /* ignore */ }
    if (!text || text.trim().length < 2) {
      setOpts([])
      setOpen(false)
      setBusy(false)
      return
    }
    timer.current = setTimeout(async () => {
      const seq = ++reqSeq.current
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null
      abortRef.current = ac
      setBusy(true)
      try {
        const list = await searchPlacesColombia(text.trim(), ac?.signal)
        if (seq !== reqSeq.current) return
        setOpts(list)
        setOpen(list.length > 0)
      } catch (e) {
        if (e?.name === 'AbortError') return
        if (seq !== reqSeq.current) return
        setOpts([])
      } finally {
        if (seq === reqSeq.current) setBusy(false)
      }
    }, 280)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open && opts.length) setOpen(true)
      setHighlight((h) => {
        const max = Math.max(0, opts.length - 1)
        return h < 0 ? 0 : Math.min(max, h + 1)
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open && opts.length) setOpen(true)
      setHighlight((h) => {
        const max = Math.max(0, opts.length - 1)
        if (h < 0) return max
        return Math.max(0, h - 1)
      })
      return
    }
    if (e.key === 'Enter' && listOpen && highlight >= 0 && opts[highlight]) {
      e.preventDefault()
      pick(opts[highlight])
    }
  }

  const listbox = listOpen && dropdownStyle && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={listRef}
        id={listId}
        role="listbox"
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
        {opts.map((o, idx) => (
          <button
            key={o.id}
            type="button"
            role="option"
            data-opt-idx={idx}
            aria-selected={idx === highlight}
            onPointerDown={(e) => {
              e.preventDefault()
              pick(o)
            }}
            onMouseEnter={() => setHighlight(idx)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', border: 'none',
              background: idx === highlight ? `${t.primary}28` : 'transparent',
              padding: '8px 10px', cursor: 'pointer',
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
        onKeyDown={onKeyDown}
        onFocus={() => { if (opts.length) setOpen(true) }}
        placeholder="Buscar dirección, barrio, municipio o lugar en Colombia…"
        style={style}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listId}
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

async function safeGeocode(fn) {
  try {
    return await fn()
  } catch {
    return []
  }
}

async function searchPlacesColombia(query, signal) {
  const q = query.includes('Colombia') || query.includes('colombia')
    ? query
    : `${query}, Colombia`
  const results = await Promise.all([
    safeGeocode(() => searchMapbox(q, signal)),
    safeGeocode(() => searchNominatim(q, signal)),
    safeGeocode(() => searchPhoton(q, signal)),
  ])
  const merged = []
  for (const r of results) {
    if (Array.isArray(r)) merged.push(...r)
  }
  return dedupe(merged).slice(0, 15)
}

async function searchMapbox(query, signal) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token) return []
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
    + `?access_token=${encodeURIComponent(token)}`
    + `&country=co&language=es&limit=10`
    + `&proximity=-74.0721,4.7110`
  const r = await fetch(url, signal ? { signal } : undefined)
  if (!r.ok) return []
  const j = await r.json()
  return (j.features || []).map((f) => ({
    id: `mb-${f.id}`,
    label: f.place_name,
    center: f.center,
    source: 'mapbox',
  }))
}

async function searchNominatim(query, signal) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}`
    + `&format=json&addressdetails=1&limit=10&countrycodes=co&accept-language=es`
  const r = await fetch(url, {
    headers: { 'Accept-Language': 'es', 'User-Agent': 'ClaraCore/1.0 (seguimiento actas)' },
    ...(signal ? { signal } : {}),
  })
  if (!r.ok) return []
  const j = await r.json()
  return (Array.isArray(j) ? j : []).map((f) => ({
    id: `nom-${f.place_id}`,
    label: f.display_name,
    center: [Number(f.lon), Number(f.lat)],
    source: 'nominatim',
  }))
}

async function searchPhoton(query, signal) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}`
    + `&limit=10&lang=es&lat=4.711&lon=-74.072`
  const r = await fetch(url, signal ? { signal } : undefined)
  if (!r.ok) return []
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
