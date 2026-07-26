import { useEffect, useRef, useState } from 'react'
import PriorityStars from './PriorityStars'

function nombreUser(u) {
  if (!u) return ''
  return `${u.nombre || ''} ${u.apellidos || ''}`.trim() || u.email || `#${u.id}`
}

/** Formulario de tarea personal con Ctrl+V de imágenes. */
export default function TareaFormModal({ t, api, usuario, usuarios = [], onClose, onCreated }) {
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    fecha_vencimiento: '',
    prioridad: 0,
    destinatario_tentativo_id: '',
    campos_libres: { notas: '' },
  })
  const [pendientesImg, setPendientesImg] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const zoneRef = useRef(null)

  useEffect(() => {
    const el = zoneRef.current
    if (!el) return
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type?.startsWith('image/')) {
          e.preventDefault()
          const file = it.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            setPendientesImg((arr) => [
              ...arr,
              { nombre: file.name || `pegado-${Date.now()}.png`, data_uri: reader.result, mime_type: file.type },
            ])
          }
          reader.readAsDataURL(file)
        }
      }
    }
    el.addEventListener('paste', onPaste)
    return () => el.removeEventListener('paste', onPaste)
  }, [])

  const guardar = async () => {
    if (!form.titulo.trim()) {
      setError('Indique un título')
      return
    }
    setBusy(true)
    setError('')
    try {
      const dest = usuarios.find((u) => String(u.id) === String(form.destinatario_tentativo_id))
      const row = await api.crearTarea({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion,
        fecha_vencimiento: form.fecha_vencimiento || null,
        campos_libres: {
          ...(form.campos_libres || {}),
          notas: form.campos_libres?.notas || '',
          prioridad: form.prioridad || 0,
          destinatario_tentativo_id: dest ? dest.id : null,
          destinatario_tentativo_nombre: dest ? nombreUser(dest) : null,
        },
      })
      for (const im of pendientesImg) {
        await api.pegarImagenTarea(row.id, {
          nombre: im.nombre,
          data_base64: im.data_uri,
          mime_type: im.mime_type,
        })
      }
      onCreated?.(row)
      onClose?.()
    } catch (e) {
      setError(e.message || 'No se pudo crear')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 11000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        ref={zoneRef}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(820px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: '28px 28px 22px',
          outline: 'none',
          boxShadow: t.shadow,
        }}
      >
        <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 700, color: t.text, marginBottom: 6 }}>
          Nueva tarea personal
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 20, lineHeight: 1.45 }}>
          Organice pendientes propios. Pegue imágenes con Ctrl+V dentro de esta ventana.
          Un destinatario tentativo es solo una nota de interés: no crea compromiso ni envía notificaciones.
        </div>

        <label style={lbl(t)}>Título</label>
        <input
          value={form.titulo}
          onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
          style={{ ...inp(t), marginBottom: 14 }}
          placeholder="¿Qué hay que hacer?"
        />

        <label style={lbl(t)}>Descripción</label>
        <textarea
          rows={5}
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          style={{ ...inp(t), marginBottom: 14, minHeight: 120, resize: 'vertical' }}
          placeholder="Detalle, contexto o pasos…"
        />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 14,
        }}>
          <div>
            <label style={lbl(t)}>Prioridad</label>
            <div style={{ padding: '8px 0' }}>
              <PriorityStars
                t={t}
                value={form.prioridad}
                onChange={(prioridad) => setForm((f) => ({ ...f, prioridad }))}
              />
            </div>
          </div>
          <div>
            <label style={lbl(t)}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" title="Fecha de entrega o cumplimiento">📅</span>
                Fecha de vencimiento
                <span
                  title="Fecha de entrega o cumplimiento del pendiente — no es una fecha informativa cualquiera."
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    border: `1px solid ${t.border}`,
                    fontSize: 11,
                    color: t.textMuted,
                    cursor: 'help',
                    fontWeight: 700,
                  }}
                >
                  ?
                </span>
              </span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                aria-hidden="true"
                title="Fecha de entrega o cumplimiento del pendiente"
                style={{ fontSize: '1.2rem', lineHeight: 1 }}
              >
                📅
              </span>
              <input
                type="date"
                value={form.fecha_vencimiento}
                onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
                style={{ ...inp(t), flex: 1 }}
                title="Fecha de entrega o cumplimiento del pendiente — no es una fecha informativa cualquiera."
              />
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 4 }}>
              Opcional. Corresponde a la fecha de entrega o cumplimiento.
            </div>
          </div>
        </div>

        <label style={lbl(t)}>Destinatario tentativo (opcional)</label>
        <select
          value={form.destinatario_tentativo_id}
          onChange={(e) => setForm((f) => ({ ...f, destinatario_tentativo_id: e.target.value }))}
          style={{ ...inp(t), marginBottom: 6 }}
        >
          <option value="">Nadie en particular</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{nombreUser(u)}</option>
          ))}
        </select>
        <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 14, lineHeight: 1.4 }}>
          Indica a quién podría interesar o involucrar esta tarea. No la convierte en compromiso formal
          ni dispara notificaciones obligatorias.
        </div>

        <label style={lbl(t)}>Notas libres</label>
        <input
          value={form.campos_libres.notas || ''}
          onChange={(e) => setForm((f) => ({ ...f, campos_libres: { ...f.campos_libres, notas: e.target.value } }))}
          style={{ ...inp(t), marginBottom: 14 }}
          placeholder="Recordatorios, enlaces, etc."
        />

        {pendientesImg.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            {pendientesImg.map((im, i) => (
              <img key={i} src={im.data_uri} alt="" style={{ maxWidth: 120, maxHeight: 90, borderRadius: 8, border: `1px solid ${t.border}` }} />
            ))}
          </div>
        )}

        {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', marginTop: 4, fontSize: 'var(--cc-sm)' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={ghost(t)}>Cancelar</button>
          <button type="button" disabled={busy} onClick={guardar} style={primary(t)}>
            {busy ? 'Guardando…' : 'Crear tarea'}
          </button>
        </div>
      </div>
    </div>
  )
}

function lbl(t) {
  return {
    display: 'block',
    fontSize: 'var(--cc-label)',
    color: t.textMuted,
    fontWeight: 600,
    marginBottom: 6,
  }
}
function inp(t) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 'var(--cc-input)',
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.bg || t.bgCard,
    color: t.text,
  }
}
function primary(t) {
  return {
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    cursor: 'pointer',
    background: t.primary,
    color: '#fff',
    fontWeight: 700,
    fontSize: 'var(--cc-sm)',
  }
}
function ghost(t) {
  return {
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '10px 16px',
    cursor: 'pointer',
    background: 'transparent',
    color: t.text,
    fontSize: 'var(--cc-sm)',
  }
}
