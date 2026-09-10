import { useEffect, useRef, useState } from 'react'

const ADD_VALUE = '__add__'

/**
 * Dropdown reutilizable con opción «Agregar otro…».
 * Persiste el nuevo valor vía onAddNew y lo selecciona.
 * Montaje estable (no se redefine dentro del padre) para no perder el foco.
 */
export default function CatalogSelect({
  value = '',
  options = [],
  onChange,
  onAddNew,
  canEdit = true,
  style,
  placeholder = '— Seleccione —',
  addLabel = '— Agregar otro… —',
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const opts = Array.from(new Set((options || []).map((o) => String(o || '').trim()).filter(Boolean)))
  if (value && !opts.includes(value)) opts.unshift(value)

  const commitAdd = async () => {
    const v = draft.trim()
    if (!v || !canEdit) return
    setBusy(true)
    try {
      if (onAddNew) await onAddNew(v)
      onChange?.(v)
      setAdding(false)
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  if (adding) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', width: '100%' }}>
        <input
          ref={inputRef}
          style={{ ...style, flex: 1 }}
          value={draft}
          disabled={!canEdit || busy}
          placeholder="Escriba el nuevo valor"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitAdd()
            }
            if (e.key === 'Escape') {
              setAdding(false)
              setDraft('')
            }
          }}
        />
        <button
          type="button"
          disabled={!canEdit || busy || !draft.trim()}
          onClick={commitAdd}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 'var(--cc-caption)',
            padding: '2px 4px',
            whiteSpace: 'nowrap',
          }}
        >
          OK
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => { setAdding(false); setDraft('') }}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 'var(--cc-caption)',
            padding: '2px 4px',
          }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <select
      style={style}
      value={value || ''}
      disabled={!canEdit}
      onChange={(e) => {
        const v = e.target.value
        if (v === ADD_VALUE) {
          setAdding(true)
          setDraft('')
          return
        }
        onChange?.(v)
      }}
    >
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
      {canEdit && <option value={ADD_VALUE}>{addLabel}</option>}
    </select>
  )
}
