import { useCallback, useEffect, useState } from 'react'

/**
 * Catálogo reutilizable de maquinaria/equipos/volquetas por contrato.
 * Patrón: primera vez se registra manualmente, luego se busca y reutiliza
 * (igual que contactos externos en actas).
 */
export default function EquipoCatalogSelect({
  t,
  api,
  value = '',
  equipoId = null,
  onChange,
  disabled = false,
  placeholder = 'Buscar o registrar equipo…',
}) {
  const [q, setQ] = useState(value || '')
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (needle) => {
    try {
      const rows = await api.listBitacoraEquipos(needle || '')
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
      equipo_id: row.id,
      equipo_nombre: row.nombre,
      tipo: row.tipo,
    })
    setQ(row.nombre)
    setOpen(false)
    setConfirmNew(null)
  }

  const registrarNuevo = async (nombre) => {
    const n = String(nombre || '').trim()
    if (!n) return
    setBusy(true)
    try {
      const row = await api.upsertBitacoraEquipo({ nombre: n, tipo: 'equipo' })
      pick(row)
    } catch (e) {
      setConfirmNew(null)
      alert(e.message || 'No se pudo registrar el equipo')
    } finally {
      setBusy(false)
    }
  }

  const onBlurCommit = () => {
    setTimeout(() => {
      setOpen(false)
      const needle = String(q || '').trim()
      if (!needle) {
        onChange?.({ equipo_id: null, equipo_nombre: '', tipo: 'equipo' })
        return
      }
      const match = opts.find(
        (o) => String(o.nombre || '').toLowerCase() === needle.toLowerCase(),
      )
      if (match) {
        pick(match)
        return
      }
      if (equipoId && needle === value) return
      setConfirmNew(needle)
    }, 150)
  }

  const inp = {
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
          marginTop: 4, maxHeight: 180, overflow: 'auto',
          background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8,
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
                padding: '8px 10px', border: 'none', background: 'transparent',
                color: t.text, cursor: 'pointer', fontSize: 'var(--cc-sm)',
              }}
            >
              {o.nombre}
              <span style={{ color: t.textMuted, marginLeft: 6 }}>· {o.tipo || 'equipo'}</span>
            </button>
          ))}
        </div>
      )}
      {confirmNew && (
        <div style={{
          marginTop: 8, padding: 10, borderRadius: 8,
          border: `1px solid ${t.border}`, background: t.bg,
          fontSize: 'var(--cc-sm)', color: t.text,
        }}>
          «{confirmNew}» no está en el catálogo de este contrato.
          ¿Desea registrarlo para reutilizarlo después?
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void registrarNuevo(confirmNew)}
              style={{
                background: t.primary, color: '#fff', border: 'none',
                borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {busy ? '…' : 'Registrar'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmNew(null)}
              style={{
                background: t.bgCard, color: t.text, border: `1px solid ${t.border}`,
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
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
