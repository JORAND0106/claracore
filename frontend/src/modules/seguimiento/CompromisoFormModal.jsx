import { useMemo, useState } from 'react'
import { nombreUser } from './UserSearchSelect'
import { numeroActaLabel } from './seguimientoTheme'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle, useSeguimientoCompact } from './seguimientoShared'

/**
 * Formulario para generar compromiso(s) desde una idea de acta.
 * Asignables: usuarios de plataforma + asistentes externos del acta actual.
 * Origen atribuido al acta/comité (no al operador del formulario).
 */
export default function CompromisoFormModal({
  t,
  usuario,
  textoIdea,
  usuarios = [],
  asistentesActa = [],
  actaConsecutivo = null,
  onClose,
  onSubmit,
  viewportCompact: viewportCompactProp,
}) {
  const viewportCompactHook = useSeguimientoCompact()
  const viewportCompact = viewportCompactProp ?? viewportCompactHook
  const [form, setForm] = useState({
    fecha_vencimiento: '',
    hora_vencimiento: '',
    redaccion: textoIdea || '',
  })
  const [asignadosKeys, setAsignadosKeys] = useState([])
  const [q, setQ] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const origenLabel = useMemo(() => {
    if (actaConsecutivo != null && actaConsecutivo !== '') {
      return `Compromiso de Comité · ${numeroActaLabel(actaConsecutivo)}`
    }
    return 'Compromiso de Comité'
  }, [actaConsecutivo])

  /** Clave estable para mezcla usuarios / externos. */
  const keyOf = (u) => {
    if (!u) return ''
    if (u.es_externo || u.externo_id != null || Number(u.id) < 0) {
      const eid = u.externo_id != null ? u.externo_id : (Number(u.id) < 0 ? Math.abs(Number(u.id)) : null)
      return eid != null ? `ext-${eid}` : `ext-nom-${(u.nombre || '').trim().toLowerCase()}`
    }
    return `usr-${u.id}`
  }

  const pool = useMemo(() => {
    const byKey = new Map()
    for (const u of usuarios || []) {
      if (!u) continue
      if (u.es_externo || Number(u.id) < 0) continue // externos del catálogo: solo si están en el acta
      if (!(Number(u.id) > 0)) continue
      byKey.set(keyOf(u), {
        ...u,
        es_externo: false,
        _key: keyOf(u),
      })
    }
    for (const a of asistentesActa || []) {
      const nombre = (a.nombre || '').trim()
      if (!nombre) continue
      if (a.usuario_id && Number(a.usuario_id) > 0) {
        const k = `usr-${a.usuario_id}`
        if (!byKey.has(k)) {
          byKey.set(k, {
            id: Number(a.usuario_id),
            nombre,
            apellidos: '',
            email: a.email || '',
            cargo_nombre: a.cargo || '',
            empresa: a.entidad || '',
            es_externo: false,
            _key: k,
          })
        }
        continue
      }
      const eid = a.externo_id != null ? Number(a.externo_id) : null
      const synId = eid != null ? -eid : null
      const k = eid != null ? `ext-${eid}` : `ext-nom-${nombre.toLowerCase()}`
      byKey.set(k, {
        id: synId,
        externo_id: eid,
        nombre,
        apellidos: '',
        email: a.email || '',
        cargo_nombre: a.cargo || '',
        empresa: a.entidad || '',
        es_externo: true,
        _key: k,
      })
    }
    return Array.from(byKey.values())
  }, [usuarios, asistentesActa])

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    const basePool = pool.filter((u) => !asignadosKeys.includes(u._key))
    const base = !s
      ? basePool.slice(0, 50)
      : basePool.filter((u) => {
        const n = nombreUser(u).toLowerCase()
        return n.includes(s)
          || String(u.email || '').toLowerCase().includes(s)
          || String(u.cargo_nombre || '').toLowerCase().includes(s)
          || String(u.empresa || '').toLowerCase().includes(s)
      }).slice(0, 50)
    return base
  }, [pool, q, asignadosKeys])

  const asignados = pool.filter((u) => asignadosKeys.includes(u._key))

  const toggle = (uOrKey) => {
    const k = typeof uOrKey === 'string' ? uOrKey : keyOf(uOrKey)
    setAsignadosKeys((arr) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]))
  }

  const onSearchKeyDown = (e) => {
    if (!filtrados.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => {
        const max = filtrados.length - 1
        return h < 0 ? 0 : Math.min(max, h + 1)
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => {
        const max = filtrados.length - 1
        if (h < 0) return max
        return Math.max(0, h - 1)
      })
    } else if (e.key === 'Enter' && highlight >= 0 && filtrados[highlight]) {
      e.preventDefault()
      toggle(filtrados[highlight])
      setHighlight(-1)
      setQ('')
    }
  }

  const guardar = async () => {
    if (!asignadosKeys.length || !form.fecha_vencimiento || !form.redaccion.trim()) {
      setError('Seleccione al menos un asignado, vencimiento y redacción.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit({
        solicitante_id: usuario?.id || null,
        solicitante_nombre: origenLabel,
        asignados: asignados.map((u) => {
          if (u.es_externo) {
            return {
              asignado_a_id: null,
              asignado_externo_id: u.externo_id != null ? Number(u.externo_id) : null,
              asignado_a_nombre: nombreUser(u),
              es_externo: true,
              asignado_cargo: u.cargo_nombre || null,
              asignado_entidad: u.empresa || null,
              asignado_email: u.email || null,
            }
          }
          return {
            asignado_a_id: Number(u.id),
            asignado_a_nombre: nombreUser(u),
            es_externo: false,
          }
        }),
        fecha_vencimiento: form.fecha_vencimiento,
        hora_vencimiento: form.hora_vencimiento || null,
        redaccion: form.redaccion.trim(),
        titulo: form.redaccion.trim().slice(0, 200),
        descripcion: form.redaccion.trim(),
      })
    } catch (e) {
      setError(e.message || 'No se pudo crear')
      setBusy(false)
      return
    }
    setBusy(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
      style={{ ...seguimientoModalOverlayStyle(viewportCompact), zIndex: 12100 }}
    >
      <div
        className={viewportCompact ? 'cc-seguim-modal-sheet' : 'cc-seguim-modal-sheet--desktop'}
        style={{
          ...seguimientoModalSheetStyle(viewportCompact),
          width: viewportCompact ? '100%' : 'min(620px, 100%)',
          background: t.bgCard,
          border: viewportCompact ? 'none' : `1px solid ${t.border}`,
          boxShadow: t.shadow,
        }}
      >
        <div className={viewportCompact ? 'cc-seguim-compromiso-form cc-seguim-compromiso-form--compact' : 'cc-seguim-compromiso-form'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, color: t.text }}>
            Generar compromiso
          </div>
          <button type="button" onClick={onClose} style={ghost(t)}>Cerrar</button>
        </div>
        <Field t={t} label="Origen">
          <div style={{
            ...inp(t),
            display: 'flex',
            alignItems: 'center',
            minHeight: 40,
            fontWeight: 600,
            color: t.primary,
            background: `${t.primary}10`,
          }}
          >
            {origenLabel}
          </div>
        </Field>
        <Field t={t} label="A quién o a quiénes se asigna">
          {asignados.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {asignados.map((u) => (
                <button
                  key={u._key}
                  type="button"
                  onClick={() => toggle(u)}
                  style={{
                    border: `1px solid ${t.primary}`, borderRadius: 8, padding: '4px 8px',
                    background: `${t.primary}18`, color: t.text, cursor: 'pointer', fontSize: 'var(--cc-xs)',
                  }}
                >
                  {nombreUser(u)}
                  {u.es_externo ? ' · Ext' : ''}
                  {' '}✕
                </button>
              ))}
            </div>
          )}
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setHighlight(-1) }}
            onKeyDown={onSearchKeyDown}
            placeholder="Buscar usuarios o asistentes externos… (↑↓ y Enter)"
            style={{ ...inp(t), marginBottom: 6 }}
          />
          <div style={{
            maxHeight: 160, overflow: 'auto', border: `1px solid ${t.border}`,
            borderRadius: 8, background: t.bg || t.bgCard,
          }}
          >
            {filtrados.map((u, idx) => (
              <label
                key={u._key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  borderBottom: `1px solid ${t.border}`, cursor: 'pointer', fontSize: 'var(--cc-sm)', color: t.text,
                  background: idx === highlight ? `${t.primary}18` : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={asignadosKeys.includes(u._key)}
                  onChange={() => toggle(u)}
                />
                <span style={{ fontWeight: 600 }}>{nombreUser(u)}</span>
                {u.es_externo ? (
                  <span style={{
                    fontSize: 'var(--cc-xs)',
                    fontWeight: 700,
                    color: t.textMuted,
                    border: `1px solid ${t.border}`,
                    borderRadius: 6,
                    padding: '1px 6px',
                  }}
                  >
                    Externo
                  </span>
                ) : null}
                <span style={{ color: t.textMuted, fontSize: 'var(--cc-xs)' }}>
                  {[u.cargo_nombre, u.empresa, u.email].filter(Boolean).join(' · ')}
                </span>
              </label>
            ))}
            {filtrados.length === 0 && (
              <div style={{ padding: 10, color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin coincidencias</div>
            )}
          </div>
        </Field>
        <div className="cc-seguim-datetime-stack">
          <Field t={t} label="Fecha de vencimiento">
            <input
              type="date"
              className="cc-seguim-datetime cc-seguim-datetime--fecha"
              value={form.fecha_vencimiento}
              onChange={(e) => set('fecha_vencimiento', e.target.value)}
              style={dateTimeInp(t)}
            />
          </Field>
          <Field t={t} label="Hora (opcional)">
            <input
              type="time"
              className="cc-seguim-datetime cc-seguim-datetime--hora"
              value={form.hora_vencimiento}
              onChange={(e) => set('hora_vencimiento', e.target.value)}
              style={{ ...dateTimeInp(t), maxWidth: 140 }}
            />
          </Field>
        </div>
        <Field t={t} label="Redacción del compromiso">
          <textarea rows={5} value={form.redaccion} onChange={(e) => set('redaccion', e.target.value)} style={inp(t)} />
        </Field>
        {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)' }}>{error}</div>}
        <div className="cc-seguim-modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={onClose} style={ghost(t)}>Cancelar</button>
          <button type="button" disabled={busy} onClick={guardar} style={primary(t)}>
            {busy ? 'Guardando…' : 'Incorporar compromiso'}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}

function Field({ t, label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
function inp(t) {
  return {
    width: '100%', boxSizing: 'border-box', fontSize: 'var(--cc-input)',
    padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bg || t.bgCard, color: t.text,
  }
}
function dateTimeInp(t) {
  return {
    ...inp(t),
    padding: '5px 8px',
    fontSize: 'var(--cc-sm)',
    borderRadius: 6,
    lineHeight: 1.25,
    minHeight: 0,
    height: 32,
    fontWeight: 400,
  }
}
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
