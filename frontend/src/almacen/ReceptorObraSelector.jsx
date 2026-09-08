import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAlmacenApi, useAlmacenTheme } from './almacenShared'

/**
 * Autocomplete «Quién recibe en obra».
 * Solo roles operativo contratista / contratista (nunca interventoría ni gerencial).
 * Dropdown en portal: el modal de Salida usa overflow y recortaría un menú absolute.
 */
export default function ReceptorObraSelector({ value, onChange, disabled }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [menuPos, setMenuPos] = useState(null)
  const timer = useRef(null)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)

  const search = useCallback((q) => {
    setLoading(true)
    setErrorMsg('')
    api.searchUsuariosReceptorObra(q)
      .then((rows) => {
        setOptions(Array.isArray(rows) ? rows : [])
      })
      .catch((e) => {
        setOptions([])
        setErrorMsg(e?.message || 'No se pudo cargar el listado de usuarios.')
      })
      .finally(() => setLoading(false))
  }, [api])

  useEffect(() => {
    if (value?.label) setQuery(value.label)
  }, [value?.label])

  useEffect(() => {
    search('')
  }, [search])

  const updateMenuPos = useCallback(() => {
    const el = inputRef.current || wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + 2,
      left: rect.left,
      width: Math.max(rect.width, 260),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return undefined
    }
    updateMenuPos()
    const onScroll = () => updateMenuPos()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, updateMenuPos, options.length, loading])

  const pick = (u) => {
    onChange?.({ id: u.id, label: u.label })
    setQuery(u.label)
    setOpen(false)
  }

  const onInput = (e) => {
    const v = e.target.value
    setQuery(v)
    setOpen(true)
    if (value?.id && v === value.label) return
    onChange?.(null)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 220)
  }

  const onBlur = () => {
    setTimeout(() => {
      setOpen(false)
      if (!value?.id && query.trim()) {
        const exact = options.find(
          (o) => o.label?.toLowerCase() === query.trim().toLowerCase(),
        )
        if (exact) pick(exact)
      }
    }, 180)
  }

  const dropdown = open && !disabled && menuPos && typeof document !== 'undefined'
    ? createPortal(
      <div
        data-testid="receptor-obra-dropdown"
        style={{
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          zIndex: 100080,
          maxHeight: 260,
          overflowY: 'auto',
          background: ui.card?.background || '#fff',
          color: ui.text,
          border: `1px solid ${ui.border || '#e2e8f0'}`,
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        }}
      >
        {loading ? (
          <div style={{ padding: '10px 12px', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Cargando usuarios…
          </div>
        ) : errorMsg ? (
          <div style={{ padding: '10px 12px', fontSize: 'var(--cc-xs)', color: '#991b1b' }}>
            {errorMsg}
          </div>
        ) : options.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            {query.trim()
              ? 'Sin coincidencias. Solo usuarios operativo contratista o contratista.'
              : 'No hay usuarios operativos/contratista disponibles en este contrato.'}
          </div>
        ) : (
          options.map((o) => (
            <button
              key={o.id}
              type="button"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                border: 'none',
                borderBottom: `1px solid ${ui.border || '#e2e8f0'}22`,
                background: value?.id === o.id ? ui.accentSoft : 'transparent',
                cursor: 'pointer',
                fontSize: 'var(--cc-sm)',
                color: ui.text,
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
            >
              <div style={{ fontWeight: 600 }}>{o.label}</div>
              {o.rol_nombre && (
                <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{o.rol_nombre}</div>
              )}
            </button>
          ))
        )}
      </div>,
      document.body,
    )
    : null

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        style={ui.input}
        value={query}
        disabled={disabled}
        placeholder="Buscar usuario operativo o contratista…"
        onChange={onInput}
        onFocus={() => { setOpen(true); search(query) }}
        onBlur={onBlur}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {dropdown}
    </div>
  )
}
