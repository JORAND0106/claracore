import { useCallback, useEffect, useState } from 'react'

/**
 * Catálogo reutilizable de tipo de material por contrato.
 * Patrón: primera vez se registra manualmente, luego se busca y reutiliza
 * (igual que Maquinaria/equipos y contactos externos).
 */
export default function MaterialTipoCatalogSelect({
  t,
  api,
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Buscar o registrar tipo…',
  inputStyle = null,
}) {
  const [q, setQ] = useState(value || '')
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (needle) => {
    if (!api?.listBitacoraTiposMaterial) {
      setOpts([])
      return
    }
    try {
      const rows = await api.listBitacoraTiposMaterial(needle || '')
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
    const nombre = row?.nombre || ''
    onChange?.(nombre)
    setQ(nombre)
    setOpen(false)
    setConfirmNew(null)
  }

  const registrarNuevo = async (nombre) => {
    const n = String(nombre || '').trim()
    if (!n) return
    setBusy(true)
    try {
      const row = await api.upsertBitacoraTipoMaterial({ nombre: n })
      if (row && row.nombre) {
        pick(row)
      } else {
        onChange?.(n)
        setQ(n)
        setConfirmNew(null)
        setOpen(false)
      }
    } catch (e) {
      setConfirmNew(null)
      alert(e.message || 'No se pudo registrar el tipo de material')
    } finally {
      setBusy(false)
    }
  }

  const onBlurCommit = () => {
    setTimeout(() => {
      setOpen(false)
      const needle = String(q || '').trim()
      if (!needle) {
        onChange?.('')
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
          marginTop: 2, maxHeight: 160, overflow: 'auto',
          background: t.bgCard || t.bg, border: `1px solid ${t.border}`, borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 8px', border: 'none', background: 'transparent',
                color: t.text, cursor: 'pointer', fontSize: 'var(--cc-sm)',
              }}
            >
              {o.nombre}
            </button>
          ))}
        </div>
      )}
      {confirmNew && (
        <div style={{
          marginTop: 6, padding: 8, borderRadius: 6,
          border: `1px solid ${t.border}`, background: t.bg,
          fontSize: 11, color: t.text,
        }}>
          «{confirmNew}» no está en el catálogo de este contrato.
          ¿Desea registrarlo para reutilizarlo después?
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void registrarNuevo(confirmNew)}
              style={{
                background: t.primary, color: '#fff', border: 'none',
                borderRadius: 6, padding: '4px 10px', fontWeight: 700, cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {busy ? '…' : 'Registrar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setQ(value || '')
                setConfirmNew(null)
              }}
              style={{
                background: t.bgCard || t.bg, color: t.text, border: `1px solid ${t.border}`,
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11,
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
