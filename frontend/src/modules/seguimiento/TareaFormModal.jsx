import { useEffect, useRef, useState } from 'react'
import DibujoCanvas from './DibujoCanvas'
import TareaChecklistEditor, { newChecklistItem } from './TareaChecklistEditor'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import VencimientoIcon from './VencimientoIcon'
import { calcularNivelVencimiento, fechaVencimientoEfectiva } from './vencimientoLevels'

/** Formulario de tarea personal: checklist con fechas/capturas, Ctrl+V y dibujo a mano. */
export default function TareaFormModal({ t, api, usuario, usuarios = [], onClose, onCreated }) {
  const [form, setForm] = useState({
    titulo: '',
    destinatario_id: '',
    campos_libres: { notas: '' },
  })
  const [checklist, setChecklist] = useState([newChecklistItem()])
  const [destUser, setDestUser] = useState(null)
  const [askModo, setAskModo] = useState(false)
  const [pendientesImg, setPendientesImg] = useState([])
  const [pendientesDibujo, setPendientesDibujo] = useState([])
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

  const duePreview = fechaVencimientoEfectiva({ origen: 'tarea', campos_libres: { checklist } })
  const nivelPreview = duePreview.fecha
    ? calcularNivelVencimiento({
      fechaVencimiento: duePreview.fecha,
      fechaCreacion: new Date().toISOString().slice(0, 10),
    })
    : null

  const crearConModo = async (relacion) => {
    setBusy(true)
    setError('')
    try {
      const checklistClean = checklist.map((it) => ({
        id: it.id,
        texto: it.texto || '',
        hecho: !!it.hecho,
        fecha: it.fecha || null,
        hora: it.hora || null,
        // imagen se sube después para no inflar el POST inicial
      }))
      const payload = {
        titulo: form.titulo.trim(),
        fecha_vencimiento: duePreview.fecha || null,
        hora_vencimiento: duePreview.hora || null,
        campos_libres: {
          notas: form.campos_libres?.notas || '',
          checklist: checklistClean,
        },
      }
      if (destUser && relacion) {
        payload.relacion_destinatario = relacion
        payload.destinatario_id = destUser.id
        payload.referido_a_nombre = nombreUser(destUser)
      }
      const row = await api.crearTarea(payload)

      for (const it of checklist) {
        if (it.imagen?.data_uri || it.imagen?.pending) {
          await api.pegarImagenTarea(row.id, {
            nombre: it.imagen.nombre || `checklist-${it.id}.png`,
            data_base64: it.imagen.data_uri,
            mime_type: it.imagen.mime_type || 'image/png',
            destino: 'checklist',
            checklist_id: it.id,
          })
        }
      }
      for (const im of pendientesImg) {
        await api.pegarImagenTarea(row.id, {
          nombre: im.nombre,
          data_base64: im.data_uri,
          mime_type: im.mime_type,
          destino: 'adjunto',
        })
      }
      for (const dib of pendientesDibujo) {
        await api.pegarImagenTarea(row.id, {
          nombre: dib.nombre || `dibujo-${Date.now()}.png`,
          data_base64: dib.data_uri,
          mime_type: 'image/png',
          destino: 'dibujo',
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
    if (!checklist.some((it) => (it.texto || '').trim())) {
      setError('Agregue al menos un sub-ítem con texto')
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
          width: 'min(1640px, 98vw)',
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
          Descomponga la tarea en sub-ítems con fecha, hora y captura propias. El nivel de vencimiento
          de la bandeja usa siempre el sub-ítem más próximo. Pegue imágenes adjuntas con Ctrl+V.
        </div>

        <label style={lbl(t)}>Título</label>
        <input
          value={form.titulo}
          onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
          style={{ ...inp(t), marginBottom: 14 }}
          placeholder="¿Qué hay que hacer?"
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...lbl(t), marginBottom: 0 }}>Checklist / descripción</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
              Vence {duePreview.fecha || '—'}{duePreview.hora ? ` ${duePreview.hora}` : ''}
            </span>
            <VencimientoIcon nivel={nivelPreview} showLabel t={t} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <TareaChecklistEditor t={t} value={checklist} onChange={setChecklist} />
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

        <label style={lbl(t)}>Dibujo a mano</label>
        <div style={{ marginBottom: 14 }}>
          <DibujoCanvas
            t={t}
            onSave={(dataUrl) => {
              setPendientesDibujo((arr) => [
                ...arr,
                { nombre: `dibujo-${Date.now()}.png`, data_uri: dataUrl, mime_type: 'image/png' },
              ])
            }}
          />
          {pendientesDibujo.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              {pendientesDibujo.map((im, i) => (
                <img key={i} src={im.data_uri} alt="" style={{ maxWidth: 140, maxHeight: 100, borderRadius: 8, border: `1px solid ${t.border}` }} />
              ))}
            </div>
          )}
        </div>

        {pendientesImg.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={lbl(t)}>Imágenes adjuntas (Ctrl+V)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {pendientesImg.map((im, i) => (
                <img key={i} src={im.data_uri} alt="" style={{ maxWidth: 120, maxHeight: 90, borderRadius: 8, border: `1px solid ${t.border}` }} />
              ))}
            </div>
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
