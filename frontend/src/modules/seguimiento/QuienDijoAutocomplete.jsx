import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredDropdown } from './useAnchoredDropdown'

/**
 * Texto libre con sugerencias (asistentes del acta) para el campo Interviniente.
 * No exige coincidencia exacta: el valor digitado se conserva.
 */
export default function QuienDijoAutocomplete({
  t,
  value = '',
  options = [],
  onChange,
  disabled = false,
  placeholder = 'Buscar asistente o digitar nombre…',
  style,
}) {
  const reactId = useId()
  const listId = `cc-seg-quien-dijo-${String(reactId).replace(/:/g, '')}`
  const [q, setQ] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    setQ(value || '')
  }, [value])

  const filtrados = useMemo(() => {
    const base = Array.from(new Set(
      (options || []).map((o) => String(o || '').trim()).filter(Boolean),
    ))
    const s = q.trim().toLowerCase()
    if (!s) return base.slice(0, 40)
    return base.filter((n) => n.toLowerCase().includes(s)).slice(0, 40)
  }, [options, q])

  useEffect(() => {
    setHighlight(-1)
  }, [q, open, filtrados.length])

  useEffect(() => {
    if (highlight < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-opt-idx="${highlight}"]`)
    try { el?.scrollIntoView({ block: 'nearest' }) } catch { /* ignore */ }
  }, [highlight])

  const listOpen = !disabled && open && filtrados.length > 0
  const dropdownStyle = useAnchoredDropdown(listOpen, inputRef, { maxHeight: 200 })

  const commit = (text) => {
    const next = String(text || '')
    setQ(next)
    onChange?.(next)
  }

  const pick = (name) => {
    commit(name)
    setOpen(false)
    setHighlight(-1)
  }

  const onKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
        setHighlight(-1)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => {
        const max = Math.max(0, filtrados.length - 1)
        return h < 0 ? 0 : Math.min(max, h + 1)
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => {
        const max = Math.max(0, filtrados.length - 1)
        if (h < 0) return max
        return Math.max(0, h - 1)
      })
      return
    }
    if (e.key === 'Enter' && listOpen && highlight >= 0 && filtrados[highlight]) {
      e.preventDefault()
      pick(filtrados[highlight])
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
          overflow: 'auto',
          boxShadow: t.shadow,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {filtrados.map((name, idx) => (
          <button
            key={`${name}-${idx}`}
            type="button"
            role="option"
            data-opt-idx={idx}
            aria-selected={idx === highlight}
            onPointerDown={(e) => {
              e.preventDefault()
              pick(name)
            }}
            onMouseEnter={() => setHighlight(idx)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              background: idx === highlight ? `${t.primary}28` : 'transparent',
              padding: '8px 10px',
              cursor: 'pointer',
              color: t.text,
              fontSize: 'var(--cc-sm)',
            }}
          >
            {name}
          </button>
        ))}
      </div>,
      document.body,
    )
    : null

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        value={q}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listId}
        autoComplete="off"
        onChange={(e) => {
          const next = e.target.value
          setQ(next)
          onChange?.(next)
          setOpen(true)
        }}
        onFocus={() => { if (!disabled) setOpen(true) }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 160)
        }}
        onKeyDown={onKeyDown}
        style={style}
      />
      {listbox}
    </div>
  )
}
