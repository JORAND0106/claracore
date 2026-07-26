import { useMemo, useState } from 'react'

function nombreUser(u) {
  if (!u) return ''
  return `${u.nombre || ''} ${u.apellidos || ''}`.trim() || u.email || `#${u.id}`
}

/**
 * Buscador de usuarios del contrato con autocompletado.
 * mode=strict: solo permite seleccionar usuarios existentes (elaborador).
 * mode=free: permite texto libre + confirmación si no hay match (asistentes).
 */
export default function UserSearchSelect({
  t,
  usuarios = [],
  valueId = null,
  valueNombre = '',
  onSelect,
  onFreeConfirm,
  mode = 'strict',
  placeholder = 'Buscar usuario…',
  style,
}) {
  const [q, setQ] = useState(valueNombre || '')
  const [open, setOpen] = useState(false)
  const [confirmFree, setConfirmFree] = useState(null)

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = !s
      ? usuarios.slice(0, 30)
      : usuarios.filter((u) => {
        const n = nombreUser(u).toLowerCase()
        const e = (u.email || '').toLowerCase()
        const c = (u.cargo_nombre || '').toLowerCase()
        return n.includes(s) || e.includes(s) || c.includes(s)
      }).slice(0, 30)
    return base
  }, [usuarios, q])

  const pick = (u) => {
    setQ(nombreUser(u))
    setOpen(false)
    setConfirmFree(null)
    onSelect?.(u)
  }

  const tryFree = () => {
    if (mode !== 'free') return
    const s = q.trim()
    if (!s) return
    const exact = usuarios.find((u) => nombreUser(u).toLowerCase() === s.toLowerCase())
    if (exact) {
      pick(exact)
      return
    }
    setConfirmFree(s)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setConfirmFree(null)
          if (mode === 'strict' && !e.target.value.trim()) onSelect?.(null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false)
            if (mode === 'free') tryFree()
            if (mode === 'strict') {
              const exact = usuarios.find((u) => nombreUser(u).toLowerCase() === q.trim().toLowerCase())
              if (!exact && valueId) {
                // revert to last selected
                const prev = usuarios.find((u) => Number(u.id) === Number(valueId))
                if (prev) setQ(nombreUser(prev))
                else { setQ(''); onSelect?.(null) }
              } else if (exact) pick(exact)
              else if (!exact) {
                setQ(valueNombre || '')
              }
            }
          }, 180)
        }}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
      />
      {open && filtrados.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%',
          background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8,
          maxHeight: 200, overflow: 'auto', boxShadow: t.shadow,
        }}>
          {filtrados.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(u) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: Number(u.id) === Number(valueId) ? `${t.primary}18` : 'transparent',
                padding: '8px 10px', cursor: 'pointer', color: t.text, fontSize: 'var(--cc-sm)',
              }}
            >
              <div style={{ fontWeight: 600 }}>{nombreUser(u)}</div>
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                {[u.cargo_nombre, u.empresa, u.email].filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </div>
      )}
      {confirmFree && (
        <div style={{
          marginTop: 8, padding: 10, borderRadius: 8,
          border: `1px solid ${t.border}`, background: t.bg || `${t.primary}08`,
          fontSize: 'var(--cc-sm)', color: t.text,
        }}>
          <div style={{ marginBottom: 8 }}>
            «{confirmFree}» no se encuentra en la base de datos de ClaraCore.
            ¿Desea continuar y registrarlo como asistente externo?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{ border: 'none', borderRadius: 8, padding: '6px 12px', background: t.primary, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              onClick={() => {
                onFreeConfirm?.({ nombre: confirmFree })
                setConfirmFree(null)
                setOpen(false)
              }}
            >
              Continuar
            </button>
            <button
              type="button"
              style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 12px', background: 'transparent', color: t.text, cursor: 'pointer' }}
              onClick={() => { setConfirmFree(null); setQ(valueNombre || '') }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export { nombreUser }
