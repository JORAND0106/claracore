import { useEffect, useMemo, useRef, useState } from 'react'
import { MUNICIPIOS_COLOMBIA } from '../../data/municipiosColombia.js'

/**
 * Autocompletar municipios de Colombia con navegación por teclado.
 */
export default function MunicipioAutocomplete({
  value = '',
  onChange,
  disabled = false,
  style,
  placeholder = 'Buscar municipio…',
  maxSuggestions = 12,
}) {
  const [q, setQ] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    setQ(value || '')
  }, [value])

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) {
        setOpen(false)
        setActive(-1)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const suggestions = useMemo(() => {
    const needle = String(q || '').trim().toLowerCase()
    if (needle.length < 2) return []
    const out = []
    for (const m of MUNICIPIOS_COLOMBIA) {
      if (m.toLowerCase().includes(needle)) {
        out.push(m)
        if (out.length >= maxSuggestions) break
      }
    }
    return out
  }, [q, maxSuggestions])

  useEffect(() => {
    setActive((prev) => {
      if (!suggestions.length) return -1
      if (prev < 0) return prev
      return Math.min(prev, suggestions.length - 1)
    })
  }, [suggestions])

  useEffect(() => {
    if (active < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${active}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const pick = (s) => {
    setQ(s)
    onChange?.(s)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      if (!suggestions.length) return
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i < 0 ? 0 : Math.min(i + 1, suggestions.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      if (!suggestions.length) return
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i <= 0 ? 0 : i - 1))
      return
    }
    if (e.key === 'Enter') {
      if (open && active >= 0 && suggestions[active]) {
        e.preventDefault()
        pick(suggestions[active])
      }
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        style={style}
        value={q}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `mun-opt-${active}` : undefined}
        onChange={(e) => {
          const v = e.target.value
          setQ(v)
          onChange?.(v)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && !disabled && suggestions.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 2,
            maxHeight: 180,
            overflowY: 'auto',
            background: 'var(--cc-bg-card, #fff)',
            border: '1px solid var(--cc-border, #e2e8f0)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          }}
        >
          {suggestions.map((s, idx) => (
            <button
              key={s}
              id={`mun-opt-${idx}`}
              data-idx={idx}
              type="button"
              role="option"
              aria-selected={idx === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(idx)}
              onClick={() => pick(s)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: idx === active ? 'rgba(0,119,182,0.12)' : 'transparent',
                padding: '7px 10px',
                fontSize: 'var(--cc-sm)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'inherit',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
