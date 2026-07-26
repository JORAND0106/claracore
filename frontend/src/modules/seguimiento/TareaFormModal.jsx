import { useEffect, useRef, useState } from 'react'

/** Formulario de tarea personal con Ctrl+V de imágenes. */
export default function TareaFormModal({ t, api, onClose, onCreated }) {
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    fecha_vencimiento: '',
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
      const row = await api.crearTarea({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion,
        fecha_vencimiento: form.fecha_vencimiento || null,
        campos_libres: form.campos_libres,
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
          width: 'min(560px, 100%)', background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: 20, outline: 'none',
        }}
      >
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, color: t.text, marginBottom: 4 }}>
          Nueva tarea personal
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 12 }}>
          Pegue imágenes con Ctrl+V dentro de esta ventana.
        </div>

        <label style={lbl(t)}>Título</label>
        <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} style={inp(t)} />

        <label style={{ ...lbl(t), marginTop: 10 }}>Descripción / campos libres</label>
        <textarea
          rows={4}
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          style={inp(t)}
        />

        <label style={{ ...lbl(t), marginTop: 10 }}>Notas libres</label>
        <input
          value={form.campos_libres.notas || ''}
          onChange={(e) => setForm((f) => ({ ...f, campos_libres: { ...f.campos_libres, notas: e.target.value } }))}
          style={inp(t)}
        />

        <label style={{ ...lbl(t), marginTop: 10 }}>Vencimiento (opcional)</label>
        <input
          type="date"
          value={form.fecha_vencimiento}
          onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
          style={inp(t)}
        />

        {pendientesImg.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {pendientesImg.map((im, i) => (
              <img key={i} src={im.data_uri} alt="" style={{ maxWidth: 96, maxHeight: 72, borderRadius: 6, border: `1px solid ${t.border}` }} />
            ))}
          </div>
        )}

        {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', marginTop: 8, fontSize: 'var(--cc-sm)' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={ghost(t)}>Cancelar</button>
          <button type="button" disabled={busy} onClick={guardar} style={primary(t)}>
            {busy ? 'Guardando…' : 'Crear tarea'}
          </button>
        </div>
      </div>
    </div>
  )
}

function lbl(t) { return { display: 'block', fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 4 } }
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
