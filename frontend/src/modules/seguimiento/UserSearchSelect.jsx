import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredDropdown } from './useAnchoredDropdown'

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
 *
 * El listado se renderiza en portal (fixed) para no quedar recortado por
 * overflow:auto del modal de acta / otros sheets de Seguimiento.
 * Soporta flechas ↑/↓ y Enter para seleccionar.
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
  const [highlight, setHighlight] = useState(-1)
  // iOS muestra contactos al enfocar inputs editables; readonly hasta el primer focus lo evita.
  const [iosGuard, setIosGuard] = useState(true)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const pickingRef = useRef(false)
  const qRef = useRef(q)
  qRef.current = q

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

  useEffect(() => {
    setHighlight(-1)
  }, [q, open, filtrados.length])

  useEffect(() => {
    if (highlight < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-opt-idx="${highlight}"]`)
    try { el?.scrollIntoView({ block: 'nearest' }) } catch { /* ignore */ }
  }, [highlight])

  const listOpen = open && filtrados.length > 0
  const dropdownStyle = useAnchoredDropdown(listOpen, inputRef, { maxHeight: 200 })
  const activeOptId = listOpen && highlight >= 0 ? `${fieldName}-opt-${highlight}` : undefined

  const pick = (u) => {
    pickingRef.current = true
    setQ(nombreUser(u))
    setOpen(false)
    setConfirmFree(null)
    setHighlight(-1)
    onSelect?.(u)
    window.setTimeout(() => { pickingRef.current = false }, 0)
  }

  const tryFree = () => {
    if (mode !== 'free') return
    const s = qRef.current.trim()
    if (!s) return
    const exact = usuarios.find((u) => nombreUser(u).toLowerCase() === s.toLowerCase())
    if (exact) {
      pick(exact)
      return
    }
    setConfirmFree(s)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
        setHighlight(-1)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => {
        const max = Math.max(0, filtrados.length - 1)
        return h < 0 ? 0 : Math.min(max, h + 1)
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => {
        const max = Math.max(0, filtrados.length - 1)
        if (h < 0) return max
        return Math.max(0, h - 1)
      })
      return
    }
    if (e.key === 'Enter') {
      if (listOpen && highlight >= 0 && filtrados[highlight]) {
        e.preventDefault()
        pick(filtrados[highlight])
        return
      }
      if (mode === 'free' && qRef.current.trim()) {
        e.preventDefault()
        setOpen(false)
        tryFree()
      }
    }
  }

  const listbox = listOpen && dropdownStyle && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={listRef}
        id={`${fieldName}-list`}
        role="listbox"
        style={{
          ...dropdownStyle,
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          overflow: 'auto',
          boxShadow: t.shadow,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {filtrados.map((u, idx) => {
          const selected = Number(u.id) === Number(valueId)
          const active = idx === highlight
          return (
            <button
              key={u.es_externo ? `ext-${u.externo_id}` : u.id}
              id={`${fieldName}-opt-${idx}`}
              data-opt-idx={idx}
              type="button"
              role="option"
              aria-selected={active || selected}
              onPointerDown={(e) => {
                // Evita blur del input antes del pick (doble toque en iPad / clic perdido).
                e.preventDefault()
                pick(u)
              }}
              onMouseEnter={() => setHighlight(idx)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: active
                  ? `${t.primary}28`
                  : selected
                    ? `${t.primary}18`
                    : 'transparent',
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
          )
        })}
      </div>,
      document.body,
    )
    : null

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
        ref={inputRef}
        id={fieldName}
        name={fieldName}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={`${fieldName}-list`}
        aria-activedescendant={activeOptId}
        value={q}
        readOnly={iosGuard}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setConfirmFree(null)
          if (mode === 'strict' && !e.target.value.trim()) onSelect?.(null)
        }}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          if (iosGuard) setIosGuard(false)
          setOpen(true)
          // Algunos WebKit mantienen el caret al quitar readOnly en el mismo tick
          window.setTimeout(() => {
            try { e.target.removeAttribute('readonly') } catch { /* ignore */ }
          }, 0)
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (pickingRef.current) {
              setOpen(false)
              return
            }
            // Clic en otro control del formulario: no forzar confirmación de texto libre.
            const active = document.activeElement
            if (active && active !== inputRef.current) {
              const tag = (active.tagName || '').toLowerCase()
              if (tag === 'button' || tag === 'a' || active.getAttribute?.('role') === 'tab') {
                setOpen(false)
                return
              }
            }
            setOpen(false)
            if (mode === 'free') tryFree()
            if (mode === 'strict') {
              const cur = qRef.current
              const exact = usuarios.find((u) => nombreUser(u).toLowerCase() === cur.trim().toLowerCase())
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
      {listbox}
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
              onMouseDown={(e) => e.preventDefault()}
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
              onMouseDown={(e) => e.preventDefault()}
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
