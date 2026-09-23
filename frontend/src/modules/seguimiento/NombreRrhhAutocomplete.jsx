import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  HINT_REGISTRAR_EN_RRHH,
  filtrarTrabajadoresRrhh,
  nombreCompletoRrhh,
} from './personalAsistenciaHelpers'
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
  /** Se llama al vaciar el input (p. ej. limpiar operador_rrhh_id). */
  onClear,
  /** Texto libre mientras escribe (antes de elegir una opción). */
  onInputChange,
  style,
  placeholder = 'Buscar en RRHH…',
  title = 'Seleccione un colaborador del catálogo de RRHH',
}) {
  const listId = useId()
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
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
        ) : matches.map((trab) => {
          const label = nombreCompletoRrhh(trab)
          const doc = [trab.tipo_documento || 'CC', trab.numero_documento].filter(Boolean).join(' ')
          const meta = [trab.cargo_aspira, trab.empresa_nombre].filter(Boolean).join(' · ')
          return (
            <button
              key={`rrhh-${trab.id}`}
              type="button"
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick?.(trab)
                setQuery(label)
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
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
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          setOpen(true)
          if (!String(next || '').trim()) {
            onClear?.()
          } else {
            onInputChange?.(next)
          }
        }}
        onFocus={() => setOpen(true)}
        style={style}
        title={title}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listVisible}
        aria-controls={listId}
      />
      {listbox}
    </div>
  )
}
