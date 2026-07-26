import { useState } from 'react'

export default function CompromisoFormModal({ t, usuario, textoIdea, usuarios = [], onClose, onSubmit }) {
  const [form, setForm] = useState({
    solicitante_id: usuario?.id || '',
    asignado_a_id: '',
    fecha_vencimiento: '',
    redaccion: textoIdea || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const guardar = async () => {
    if (!form.asignado_a_id || !form.fecha_vencimiento || !form.redaccion.trim()) {
      setError('Complete solicitante, asignado, vencimiento y redacción.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const asig = usuarios.find((u) => String(u.id) === String(form.asignado_a_id))
      const sol = usuarios.find((u) => String(u.id) === String(form.solicitante_id)) || usuario
      await onSubmit({
        solicitante_id: Number(form.solicitante_id) || usuario?.id,
        solicitante_nombre: nombreUser(sol),
        asignado_a_id: Number(form.asignado_a_id),
        asignado_a_nombre: nombreUser(asig),
        fecha_vencimiento: form.fecha_vencimiento,
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
          width: 'min(560px, 100%)', background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: 20, boxShadow: t.shadow,
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
        <Field t={t} label="A quién se asigna">
          <select value={form.asignado_a_id} onChange={(e) => set('asignado_a_id', e.target.value)} style={inp(t)}>
            <option value="">Seleccione…</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{nombreUser(u)}</option>
            ))}
          </select>
        </Field>
        <Field t={t} label="Fecha de vencimiento">
          <input type="date" value={form.fecha_vencimiento} onChange={(e) => set('fecha_vencimiento', e.target.value)} style={inp(t)} />
        </Field>
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
function nombreUser(u) {
  if (!u) return ''
  return `${u.nombre || ''} ${u.apellidos || ''}`.trim() || u.email || `#${u.id}`
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
