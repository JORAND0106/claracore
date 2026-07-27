import { useEffect, useId, useMemo, useState } from 'react'

function nombreUser(u) {
  if (!u) return ''
  return `${u.nombre || ''} ${u.apellidos || ''}`.trim() || u.email || `#${u.id}`
}

/**
 * Atributos anti-autofill para iOS/iPadOS/Safari/Chrome:
 * el SO no debe tratar este campo como correo/contacto guardado.
 */
export const USER_SEARCH_ANTIAUTOFILL = {
  type: 'search',
  inputMode: 'search',
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
}

/**
 * Buscador de usuarios del contrato con autocompletado de plataforma.
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
  const reactId = useId()
  const fieldName = `cc_seg_user_search_${String(reactId).replace(/:/g, '')}`
  const [q, setQ] = useState(valueNombre || '')
  const [open, setOpen] = useState(false)
  const [confirmFree, setConfirmFree] = useState(null)
  // iOS muestra contactos al enfocar inputs editables; readonly hasta el primer focus lo evita.
  const [iosGuard, setIosGuard] = useState(true)

  useEffect(() => {
    setQ(valueNombre || '')
  }, [valueNombre, valueId])

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = !s
      ? usuarios.slice(0, 30)
      : usuarios.filter((u) => {
        const n = nombreUser(u).toLowerCase()
        const e = (u.email || '').toLowerCase()
        const c = (u.cargo_nombre || '').toLowerCase()
        const emp = (u.empresa || '').toLowerCase()
        return n.includes(s) || e.includes(s) || c.includes(s) || emp.includes(s)
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
    <div style={{ position: 'relative' }} data-form-type="other">
      {/* honeypot: despista gestores de contraseñas / autofill de contacto */}
      <input
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="username"
        value=""
        readOnly
        style={{
          position: 'absolute',
          opacity: 0,
          height: 0,
          width: 0,
          pointerEvents: 'none',
          border: 0,
          padding: 0,
        }}
      />
      <input
        {...USER_SEARCH_ANTIAUTOFILL}
        id={fieldName}
        name={fieldName}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${fieldName}-list`}
        value={q}
        readOnly={iosGuard}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setConfirmFree(null)
          if (mode === 'strict' && !e.target.value.trim()) onSelect?.(null)
        }}
        onFocus={(e) => {
          if (iosGuard) setIosGuard(false)
          setOpen(true)
          // Algunos WebKit mantienen el caret al quitar readOnly en el mismo tick
          window.setTimeout(() => {
            try { e.target.removeAttribute('readonly') } catch { /* ignore */ }
          }, 0)
        }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false)
            if (mode === 'free') tryFree()
            if (mode === 'strict') {
              const exact = usuarios.find((u) => nombreUser(u).toLowerCase() === q.trim().toLowerCase())
              if (!exact && valueId) {
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
      />
      {open && filtrados.length > 0 && (
        <div
          id={`${fieldName}-list`}
          role="listbox"
          style={{
            position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%',
            background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8,
            maxHeight: 200, overflow: 'auto', boxShadow: t.shadow,
          }}
        >
          {filtrados.map((u) => (
            <button
              key={u.es_externo ? `ext-${u.externo_id}` : u.id}
              type="button"
              role="option"
              onMouseDown={(e) => { e.preventDefault(); pick(u) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: Number(u.id) === Number(valueId) ? `${t.primary}18` : 'transparent',
                padding: '8px 10px', cursor: 'pointer', color: t.text, fontSize: 'var(--cc-sm)',
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {nombreUser(u)}
                {u.es_externo ? (
                  <span style={{ marginLeft: 6, fontWeight: 600, fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                    · Externo
                  </span>
                ) : null}
              </div>
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
