import { useCallback, useEffect, useState } from 'react'

/**
 * Autocompletado de visitante desde catálogo por contrato.
 * onChange({ visitante_id, nombre, cargo })
 */
export default function VisitanteCatalogSelect({
  t,
  api,
  value = '',
  cargo = '',
  onChange,
  disabled = false,
  placeholder = 'Buscar o registrar visitante…',
  inputStyle = null,
}) {
  const [q, setQ] = useState(value || '')
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (needle) => {
    if (!api?.listBitacoraVisitantes) {
      setOpts([])
      return
    }
    try {
      const rows = await api.listBitacoraVisitantes(needle || '')
      setOpts(Array.isArray(rows) ? rows : [])
    } catch {
      setOpts([])
    }
  }, [api])

  useEffect(() => {
    setQ(value || '')
  }, [value])

  useEffect(() => {
    if (!open) return undefined
    const tmr = setTimeout(() => { void load(q) }, 200)
    return () => clearTimeout(tmr)
  }, [q, open, load])

  const pick = (row) => {
    onChange?.({
      visitante_id: row?.id ?? null,
      nombre: row?.nombre || '',
      cargo: row?.cargo || cargo || '',
    })
    setQ(row?.nombre || '')
    setOpen(false)
    setConfirmNew(null)
  }

  const registrarNuevo = async (nombre) => {
    const n = String(nombre || '').trim()
    if (!n) return
    setBusy(true)
    try {
      const row = await api.upsertBitacoraVisitante({ nombre: n, cargo: cargo || '' })
      if (row && row.nombre) {
        pick(row)
      } else {
        onChange?.({ visitante_id: null, nombre: n, cargo: cargo || '' })
        setQ(n)
        setConfirmNew(null)
        setOpen(false)
      }
    } catch (e) {
      setConfirmNew(null)
      alert(e.message || 'No se pudo registrar el visitante')
    } finally {
      setBusy(false)
    }
  }

  const onBlurCommit = () => {
    setTimeout(() => {
      setOpen(false)
      const needle = String(q || '').trim()
      if (!needle) {
        onChange?.({ visitante_id: null, nombre: '', cargo: cargo || '' })
        return
      }
      const match = opts.find(
        (o) => String(o.nombre || '').toLowerCase() === needle.toLowerCase(),
      )
      if (match) {
        pick(match)
        return
      }
      if (needle === String(value || '').trim()) return
      setConfirmNew(needle)
    }, 150)
  }

  const inp = inputStyle || {
    background: t.bg,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        disabled={disabled}
        value={q}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => { setOpen(true); void load(q) }}
        onBlur={onBlurCommit}
        style={inp}
      />
      {open && opts.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%',
          maxHeight: 180, overflowY: 'auto', background: t.bgCard || '#fff',
          border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
        }}>
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: 'transparent', padding: '8px 10px', cursor: 'pointer',
                color: t.text, fontSize: 'var(--cc-sm)',
              }}
            >
              <span style={{ fontWeight: 700 }}>{o.nombre}</span>
              {o.cargo ? (
                <span style={{ color: t.textMuted, marginLeft: 6 }}>{o.cargo}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      {confirmNew && (
        <div style={{
          marginTop: 6, padding: 8, borderRadius: 8,
          border: `1px solid ${t.border}`, background: t.bg,
          fontSize: 'var(--cc-xs)', color: t.text,
        }}>
          ¿Registrar «{confirmNew}» en el catálogo de visitantes?
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void registrarNuevo(confirmNew)}
              style={{
                border: 'none', borderRadius: 6, padding: '4px 10px',
                background: t.primary, color: '#fff', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Sí, registrar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onChange?.({ visitante_id: null, nombre: confirmNew, cargo: cargo || '' })
                setConfirmNew(null)
              }}
              style={{
                border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 10px',
                background: t.bgCard || '#fff', color: t.text, cursor: 'pointer',
              }}
            >
              Solo esta vez
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmNew(null)}
              style={{
                border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
