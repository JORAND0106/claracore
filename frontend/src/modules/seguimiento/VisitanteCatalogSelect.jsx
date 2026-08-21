import { useCallback, useEffect, useState } from 'react'
import { mergeAsistentesSearch } from './visitantesEventoHelpers'

/**
 * Autocompletado de asistentes: usuarios ClaraCore del contrato + catálogo reutilizable.
 * Prioriza plataforma; al elegir usuario autodiligencia cargo.
 * onChange({ visitante_id, usuario_id, nombre, cargo, origen })
 */
export default function VisitanteCatalogSelect({
  t,
  api,
  value = '',
  cargo = '',
  onChange,
  disabled = false,
  placeholder = 'Buscar usuario o registrar asistente…',
  inputStyle = null,
  usuariosContrato = null,
}) {
  const [q, setQ] = useState(value || '')
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(null)
  const [busy, setBusy] = useState(false)
  const [usuariosLocal, setUsuariosLocal] = useState(
    Array.isArray(usuariosContrato) ? usuariosContrato : [],
  )

  useEffect(() => {
    if (Array.isArray(usuariosContrato)) {
      setUsuariosLocal(usuariosContrato)
    }
  }, [usuariosContrato])

  const ensureUsuarios = useCallback(async () => {
    if (Array.isArray(usuariosContrato)) return usuariosContrato
    if (usuariosLocal.length || !api?.listUsuarios) return usuariosLocal
    try {
      const rows = await api.listUsuarios()
      const list = Array.isArray(rows) ? rows : []
      setUsuariosLocal(list)
      return list
    } catch {
      return usuariosLocal
    }
  }, [api, usuariosContrato, usuariosLocal])

  const load = useCallback(async (needle) => {
    const users = await ensureUsuarios()
    let catalogo = []
    if (api?.listBitacoraVisitantes) {
      try {
        const rows = await api.listBitacoraVisitantes(needle || '')
        catalogo = Array.isArray(rows) ? rows : []
      } catch {
        catalogo = []
      }
    }
    setOpts(mergeAsistentesSearch(users, catalogo, needle || ''))
  }, [api, ensureUsuarios])

  useEffect(() => {
    setQ(value || '')
  }, [value])

  useEffect(() => {
    if (!open) return undefined
    const tmr = setTimeout(() => { void load(q) }, 200)
    return () => clearTimeout(tmr)
  }, [q, open, load])

  const pick = (row) => {
    const cargoSel = String(row?.cargo || '').trim()
    onChange?.({
      visitante_id: row?.origen === 'catalogo' ? (row.visitante_id ?? row.id ?? null) : null,
      usuario_id: row?.origen === 'plataforma' ? (row.usuario_id ?? row.id ?? null) : null,
      nombre: row?.nombre || '',
      cargo: cargoSel || (row?.origen === 'plataforma' ? cargoSel : (cargo || '')),
      origen: row?.origen || null,
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
        pick({
          origen: 'catalogo',
          id: row.id,
          visitante_id: row.id,
          nombre: row.nombre,
          cargo: row.cargo || cargo || '',
        })
      } else {
        onChange?.({
          visitante_id: null, usuario_id: null,
          nombre: n, cargo: cargo || '', origen: 'catalogo',
        })
        setQ(n)
        setConfirmNew(null)
        setOpen(false)
      }
    } catch (e) {
      setConfirmNew(null)
      alert(e.message || 'No se pudo registrar el asistente')
    } finally {
      setBusy(false)
    }
  }

  const onBlurCommit = () => {
    setTimeout(() => {
      setOpen(false)
      const needle = String(q || '').trim()
      if (!needle) {
        onChange?.({
          visitante_id: null, usuario_id: null, nombre: '', cargo: '', origen: null,
        })
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
          maxHeight: 200, overflowY: 'auto', background: t.bgCard || '#fff',
          border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
        }}>
          {opts.map((o) => (
            <button
              key={o.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              style={{
                display: 'flex', width: '100%', textAlign: 'left', border: 'none',
                background: 'transparent', padding: '8px 10px', cursor: 'pointer',
                color: t.text, fontSize: 'var(--cc-sm)', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                color: o.origen === 'plataforma' ? t.primary : t.textMuted,
                flexShrink: 0,
              }}>
                {o.labelOrigen}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>{o.nombre}</span>
                {o.cargo ? (
                  <span style={{ color: t.textMuted, marginLeft: 6 }}>{o.cargo}</span>
                ) : (
                  o.origen === 'plataforma' ? (
                    <span style={{ color: '#B45309', marginLeft: 6, fontSize: 11 }}>Sin cargo</span>
                  ) : null
                )}
              </span>
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
          ¿Registrar «{confirmNew}» en el catálogo de asistentes?
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
                onChange?.({
                  visitante_id: null, usuario_id: null,
                  nombre: confirmNew, cargo: cargo || '', origen: 'catalogo',
                })
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
