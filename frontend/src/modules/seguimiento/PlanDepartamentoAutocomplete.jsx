import { useEffect, useId, useMemo, useRef, useState } from 'react'
import CcAnchoredListbox from '../../components/CcAnchoredListbox'

const OTRO_ID = '__otro__'

/**
 * Autocompletado único de Departamento (Plan de actividades).
 * Sin radios Existente/Otro: el listado de departamentos del contrato
 * termina siempre con la opción «Otro»; al elegirla se escribe el nombre
 * nuevo en el mismo campo. Listbox en portal (siempre al frente del popup).
 */
export default function PlanDepartamentoAutocomplete({
  t,
  grupos = [],
  grupoId = '',
  grupoNombre = '',
  onChange,
  inputStyle = null,
  disabled = false,
  placeholder = 'Buscar o elegir departamento…',
}) {
  const listId = useId()
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [modoOtro, setModoOtro] = useState(false)
  const [highlight, setHighlight] = useState(-1)

  const options = useMemo(
    () => (Array.isArray(grupos) ? grupos : []).filter((g) => g && (g.id != null || g.nombre)),
    [grupos],
  )

  // Sync texto desde props (edición / selección existente).
  useEffect(() => {
    if (modoOtro) return
    if (grupoId) {
      const g = options.find((x) => Number(x.id) === Number(grupoId))
      setQ(g?.nombre || grupoNombre || '')
      return
    }
    if (grupoNombre) {
      setQ(grupoNombre)
      setModoOtro(true)
    }
  }, [grupoId, grupoNombre, options, modoOtro])

  const filtered = useMemo(() => {
    const needle = String(q || '').trim().toLowerCase()
    if (!needle || modoOtro) return options
    return options.filter((g) => String(g.nombre || '').toLowerCase().includes(needle))
  }, [options, q, modoOtro])

  const rows = useMemo(
    () => [...filtered, { id: OTRO_ID, nombre: 'Otro', __otro: true }],
    [filtered],
  )

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return
      // Clicks dentro del portal listbox (fuera del wrap)
      const portal = document.getElementById(listId)
      if (portal?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [listId])

  useEffect(() => {
    setHighlight(-1)
  }, [q, open, rows.length])

  const emitExistente = (g) => {
    setModoOtro(false)
    setQ(g.nombre || '')
    setOpen(false)
    onChange?.({
      grupoId: g.id,
      grupoNombre: g.nombre || '',
      esOtro: false,
    })
  }

  const emitOtro = (texto) => {
    setModoOtro(true)
    const nombre = texto == null ? '' : String(texto)
    if (texto != null) setQ(nombre)
    onChange?.({
      grupoId: '',
      grupoNombre: String(nombre || '').trim(),
      esOtro: true,
    })
  }

  const pick = (row) => {
    if (row?.__otro || row?.id === OTRO_ID) {
      setOpen(false)
      setModoOtro(true)
      setQ('')
      onChange?.({ grupoId: '', grupoNombre: '', esOtro: true })
      requestAnimationFrame(() => {
        try { inputRef.current?.focus() } catch { /* ignore */ }
      })
      return
    }
    emitExistente(row)
  }

  const onInput = (text) => {
    setQ(text)
    setOpen(true)
    if (modoOtro) {
      emitOtro(text)
      return
    }
    // Escritura libre mientras filtra: si coincide exacto con un existente, úsalo.
    const exact = options.find(
      (g) => String(g.nombre || '').trim().toLowerCase() === String(text || '').trim().toLowerCase(),
    )
    if (exact) {
      onChange?.({
        grupoId: exact.id,
        grupoNombre: exact.nombre || '',
        esOtro: false,
      })
      return
    }
    // Texto parcial sin match exacto: aún no es «Otro» hasta elegir la opción.
    onChange?.({
      grupoId: '',
      grupoNombre: String(text || '').trim(),
      esOtro: false,
    })
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min((h < 0 ? -1 : h) + 1, rows.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Enter' && open && highlight >= 0 && rows[highlight]) {
      e.preventDefault()
      pick(rows[highlight])
    }
  }

  const theme = t || {}
  const itemBase = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    border: 'none',
    background: 'transparent',
    color: theme.text || '#0f172a',
    fontSize: 'var(--cc-sm)',
    cursor: 'pointer',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Departamento"
        disabled={disabled}
        value={q}
        placeholder={modoOtro ? 'Nombre del nuevo departamento' : placeholder}
        style={inputStyle || undefined}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      <CcAnchoredListbox
        open={open && !disabled}
        anchorRef={inputRef}
        t={theme}
        id={listId}
        maxHeight={260}
        data-testid="plan-departamento-listbox"
      >
        {rows.map((row, idx) => {
          const esOtro = !!row.__otro
          const active = idx === highlight
          return (
            <button
              key={esOtro ? OTRO_ID : `g-${row.id}`}
              type="button"
              role="option"
              aria-selected={active}
              data-opt-idx={idx}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(row)
              }}
              style={{
                ...itemBase,
                background: active
                  ? `color-mix(in srgb, ${theme.primary || '#0284c7'} 14%, transparent)`
                  : 'transparent',
                fontWeight: esOtro ? 700 : 500,
                borderTop: esOtro ? `1px solid ${theme.border || '#e2e8f0'}` : undefined,
                color: esOtro ? (theme.primary || '#0284c7') : itemBase.color,
              }}
            >
              {esOtro ? 'Otro…' : (row.nombre || '—')}
            </button>
          )
        })}
      </CcAnchoredListbox>
    </div>
  )
}
