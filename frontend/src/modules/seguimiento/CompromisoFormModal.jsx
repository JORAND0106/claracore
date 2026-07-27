import { useMemo, useState } from 'react'
import { nombreUser } from './UserSearchSelect'

export default function CompromisoFormModal({ t, usuario, textoIdea, usuarios = [], onClose, onSubmit }) {
  const [form, setForm] = useState({
    solicitante_id: usuario?.id || '',
    fecha_vencimiento: '',
    hora_vencimiento: '',
    redaccion: textoIdea || '',
  })
  const [asignadosIds, setAsignadosIds] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = usuarios.filter((u) => !asignadosIds.includes(Number(u.id)))
    if (!s) return base.slice(0, 40)
    return base.filter((u) => {
      const n = nombreUser(u).toLowerCase()
      return n.includes(s) || String(u.email || '').toLowerCase().includes(s)
    }).slice(0, 40)
  }, [usuarios, q, asignadosIds])

  const asignados = usuarios.filter((u) => asignadosIds.includes(Number(u.id)))

  const toggle = (id) => {
    const n = Number(id)
    setAsignadosIds((arr) => (arr.includes(n) ? arr.filter((x) => x !== n) : [...arr, n]))
  }

  const guardar = async () => {
    if (!asignadosIds.length || !form.fecha_vencimiento || !form.redaccion.trim()) {
      setError('Seleccione al menos un asignado, vencimiento y redacción.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const sol = usuarios.find((u) => String(u.id) === String(form.solicitante_id)) || usuario
      await onSubmit({
        solicitante_id: Number(form.solicitante_id) || usuario?.id,
        solicitante_nombre: nombreUser(sol),
        asignados: asignados.map((u) => ({
          asignado_a_id: Number(u.id),
          asignado_a_nombre: nombreUser(u),
        })),
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
      style={{
        position: 'fixed', inset: 0, zIndex: 12100,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(620px, 100%)', background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: 20, boxShadow: t.shadow, maxHeight: '92vh', overflow: 'auto',
        }}
      >
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, color: t.text, marginBottom: 12 }}>
          Generar compromiso
        </div>
        <Field t={t} label="Quién solicita">
          <select value={form.solicitante_id} onChange={(e) => set('solicitante_id', e.target.value)} style={inp(t)}>
            <option value={usuario?.id || ''}>{nombreUser(usuario)} (yo)</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{nombreUser(u)}</option>
            ))}
          </select>
        </Field>
        <Field t={t} label="A quién o a quiénes se asigna">
          {asignados.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {asignados.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  style={{
                    border: `1px solid ${t.primary}`, borderRadius: 8, padding: '4px 8px',
                    background: `${t.primary}18`, color: t.text, cursor: 'pointer', fontSize: 'var(--cc-xs)',
                  }}
                >
                  {nombreUser(u)} ✕
                </button>
              ))}
            </div>
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar usuarios…"
            style={{ ...inp(t), marginBottom: 6 }}
          />
          <div style={{
            maxHeight: 160, overflow: 'auto', border: `1px solid ${t.border}`,
            borderRadius: 8, background: t.bg || t.bgCard,
          }}>
            {filtrados.map((u) => (
              <label
                key={u.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  borderBottom: `1px solid ${t.border}`, cursor: 'pointer', fontSize: 'var(--cc-sm)', color: t.text,
                }}
              >
                <input type="checkbox" checked={asignadosIds.includes(Number(u.id))} onChange={() => toggle(u.id)} />
                <span>{nombreUser(u)}</span>
                <span style={{ color: t.textMuted, fontSize: 'var(--cc-xs)' }}>{u.cargo_nombre || u.email || ''}</span>
              </label>
            ))}
            {filtrados.length === 0 && (
              <div style={{ padding: 10, color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin coincidencias</div>
            )}
          </div>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field t={t} label="Fecha de vencimiento">
            <input type="date" value={form.fecha_vencimiento} onChange={(e) => set('fecha_vencimiento', e.target.value)} style={inp(t)} />
          </Field>
          <Field t={t} label="Hora (opcional)">
            <input type="time" value={form.hora_vencimiento} onChange={(e) => set('hora_vencimiento', e.target.value)} style={inp(t)} />
          </Field>
        </div>
        <Field t={t} label="Redacción del compromiso">
          <textarea rows={5} value={form.redaccion} onChange={(e) => set('redaccion', e.target.value)} style={inp(t)} />
        </Field>
        {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={onClose} style={ghost(t)}>Cancelar</button>
          <button type="button" disabled={busy} onClick={guardar} style={primary(t)}>
            {busy ? 'Guardando…' : 'Incorporar compromiso'}
          </button>
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
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
