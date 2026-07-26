import { useEffect, useRef, useState } from 'react'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import VencimientoIcon from './VencimientoIcon'
import { calcularNivelVencimiento } from './vencimientoLevels'

/** Formulario de tarea personal con Ctrl+V de imágenes y destino formal/referencia. */
export default function TareaFormModal({ t, api, usuario, usuarios = [], onClose, onCreated }) {
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    fecha_vencimiento: '',
    hora_vencimiento: '',
    destinatario_id: '',
    campos_libres: { notas: '' },
  })
  const [destUser, setDestUser] = useState(null)
  const [askModo, setAskModo] = useState(false)
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

  const nivelPreview = form.fecha_vencimiento
    ? calcularNivelVencimiento({
      fechaVencimiento: form.fecha_vencimiento,
      fechaCreacion: new Date().toISOString().slice(0, 10),
    })
    : null

  const crearConModo = async (relacion) => {
    setBusy(true)
    setError('')
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion,
        fecha_vencimiento: form.fecha_vencimiento || null,
        hora_vencimiento: form.hora_vencimiento || null,
        campos_libres: {
          ...(form.campos_libres || {}),
          notas: form.campos_libres?.notas || '',
        },
      }
      if (destUser && relacion) {
        payload.relacion_destinatario = relacion
        payload.destinatario_id = destUser.id
        payload.referido_a_nombre = nombreUser(destUser)
      }
      const row = await api.crearTarea(payload)
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
      setAskModo(false)
    }
  }

  const guardar = async () => {
    if (!form.titulo.trim()) {
      setError('Indique un título')
      return
    }
    if (destUser) {
      setAskModo(true)
      return
    }
    await crearConModo(null)
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
          Organice pendientes propios. Pegue imágenes con Ctrl+V. El nivel de vencimiento reemplaza la prioridad por estrellas.
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 14,
        }}>
          <div>
            <label style={lbl(t)}>Fecha de vencimiento</label>
            <input
              type="date"
              value={form.fecha_vencimiento}
              onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
              style={inp(t)}
            />
          </div>
          <div>
            <label style={lbl(t)}>Hora de entrega (opcional)</label>
            <input
              type="time"
              value={form.hora_vencimiento}
              onChange={(e) => setForm((f) => ({ ...f, hora_vencimiento: e.target.value }))}
              style={inp(t)}
            />
          </div>
          <div>
            <label style={lbl(t)}>Nivel de vencimiento</label>
            <div style={{ paddingTop: 8 }}>
              <VencimientoIcon nivel={nivelPreview} showLabel t={t} />
            </div>
          </div>
        </div>

        <label style={lbl(t)}>Destinatario (opcional)</label>
        <UserSearchSelect
          t={t}
          usuarios={usuarios}
          mode="strict"
          placeholder="Buscar usuario del contrato…"
          style={{ ...inp(t), marginBottom: 6 }}
          onSelect={(u) => {
            setDestUser(u)
            setForm((f) => ({ ...f, destinatario_id: u?.id || '' }))
          }}
        />
        <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 14, lineHeight: 1.4 }}>
          Al guardar se le preguntará si es asignación formal o solo referencia. En ambos casos permanece en su bandeja.
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

        {askModo && destUser && (
          <div style={{
            marginBottom: 14, padding: 12, borderRadius: 8,
            border: `1px solid ${t.border}`, background: t.bg || `${t.primary}08`,
            fontSize: 'var(--cc-sm)', color: t.text,
          }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              ¿Asignar formalmente a {nombreUser(destUser)} o solo enviarla como referencia?
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" disabled={busy} style={primary(t)} onClick={() => crearConModo('asignacion')}>
                Asignación formal
              </button>
              <button type="button" disabled={busy} style={ghost(t)} onClick={() => crearConModo('referencia')}>
                Solo referencia
              </button>
              <button type="button" style={ghost(t)} onClick={() => setAskModo(false)}>Cancelar</button>
            </div>
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
