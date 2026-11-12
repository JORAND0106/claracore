import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  HINT_REGISTRAR_EN_RRHH,
  filtrarTrabajadoresRrhh,
  nombreCompletoRrhh,
} from './personalAsistenciaHelpers'
import { focusAdjacentBitacoraCell } from './bitacoraExcelNav'
import { useAnchoredDropdown } from './useAnchoredDropdown'

/**
 * Autocompletado de nombre contra catálogo RRHH del contrato.
 * Desplegable en portal (fixed): la grilla Personal usa sheetWrap con
 * overflow:auto y un absolute interno quedaba totalmente recortado.
 */
export default function NombreRrhhAutocomplete({
  t,
  value,
  catalogo = [],
  excludeIds = [],
  disabled = false,
  onPick,
  style,
  ...navAttrs
}) {
  const listId = useId()
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const matches = useMemo(
    () => filtrarTrabajadoresRrhh(catalogo, query, excludeIds).slice(0, 12),
    [catalogo, query, excludeIds],
  )

  useEffect(() => {
    setHi(0)
  }, [query, open])

  const pickTrab = (trab, { advance = false } = {}) => {
    const label = nombreCompletoRrhh(trab)
    onPick?.(trab)
    setQuery(label)
    setOpen(false)
    if (advance && inputRef.current) {
      // Tras seleccionar, avanzar a la siguiente celda Excel.
      requestAnimationFrame(() => focusAdjacentBitacoraCell(inputRef.current, 1))
    }
  }

  const showEmptyHint = open && !disabled
    && String(query || '').trim().length >= 1
    && matches.length === 0
  const listVisible = !disabled && open && (matches.length > 0 || showEmptyHint)
  const dropdownStyle = useAnchoredDropdown(listVisible, inputRef, { maxHeight: 220 })

  const listbox = listVisible && dropdownStyle && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        style={{
          ...dropdownStyle,
          overflowY: 'auto',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {showEmptyHint ? (
          <div style={{
            padding: '10px 12px',
            fontSize: 'var(--cc-caption)',
            color: t.textMuted,
            lineHeight: 1.35,
          }}>
            {HINT_REGISTRAR_EN_RRHH}
          </div>
        ) : matches.map((trab, i) => {
          const label = nombreCompletoRrhh(trab)
          const doc = [trab.tipo_documento || 'CC', trab.numero_documento].filter(Boolean).join(' ')
          const meta = [trab.cargo_aspira, trab.empresa_nombre].filter(Boolean).join(' · ')
          const active = i === hi
          return (
            <button
              key={`rrhh-${trab.id}`}
              type="button"
              role="option"
              aria-selected={active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHi(i)}
              onClick={() => pickTrab(trab, { advance: true })}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: active ? (t.primary ? `${t.primary}18` : '#e0f2fe') : 'transparent',
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: `1px solid ${t.border}`,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 'var(--cc-xs)', color: t.text }}>{label}</div>
              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                {[doc, meta].filter(Boolean).join(' · ')}
              </div>
            </button>
          )
        })}
      </div>,
      document.body,
    )
    : null

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Buscar en RRHH…"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!listVisible || matches.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHi((h) => Math.min(h + 1, matches.length - 1))
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHi((h) => Math.max(h - 1, 0))
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            const trab = matches[hi] || matches[0]
            if (trab) pickTrab(trab, { advance: true })
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
          }
        }}
        style={style}
        title="Seleccione un colaborador del catálogo de RRHH"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listVisible}
        aria-controls={listId}
        {...navAttrs}
      />
      {listbox}
    </div>
  )
}
