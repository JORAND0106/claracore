import { useState } from 'react'
import TareaChecklistEditor from './TareaChecklistEditor'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import VencimientoIcon from './VencimientoIcon'
import { calcularNivelVencimiento, fechaVencimientoEfectiva } from './vencimientoLevels'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle, useSeguimientoCompact } from './seguimientoShared'

/** Crear tarea personal: basta el título; la checklist se puede completar después. */
export default function TareaFormModal({ t, api, usuario, usuarios = [], onClose, onCreated, viewportCompact: viewportCompactProp }) {
  const viewportCompactHook = useSeguimientoCompact()
  const viewportCompact = viewportCompactProp ?? viewportCompactHook
  const [titulo, setTitulo] = useState('')
  const [checklist, setChecklist] = useState([])
  const [destUser, setDestUser] = useState(null)
  const [askModo, setAskModo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const duePreview = fechaVencimientoEfectiva({ origen: 'tarea', campos_libres: { checklist } })
  const nivelPreview = duePreview.fecha
    ? calcularNivelVencimiento({
      fechaVencimiento: duePreview.fecha,
      fechaCreacion: new Date().toISOString().slice(0, 10),
    })
    : null

  const uploadPendientes = async (rowId, items) => {
    for (const it of items) {
      if (it.imagen?.pending && it.imagen?.data_uri) {
        await api.pegarImagenTarea(rowId, {
          nombre: it.imagen.nombre || `checklist-${it.id}.png`,
          data_base64: it.imagen.data_uri,
          mime_type: it.imagen.mime_type || 'image/png',
          destino: 'checklist',
          checklist_id: it.id,
        })
      }
      if (it.esquema?.pending && it.esquema?.data_uri) {
        await api.pegarImagenTarea(rowId, {
          nombre: it.esquema.nombre || `esquema-${it.id}.png`,
          data_base64: it.esquema.data_uri,
          mime_type: 'image/png',
          destino: 'checklist_esquema',
          checklist_id: it.id,
        })
      }
    }
  }

  const crearConModo = async (relacion) => {
    setBusy(true)
    setError('')
    try {
      const checklistClean = checklist.map((it) => ({
        id: it.id,
        texto: it.texto || '',
        hecho: !!it.hecho,
        estado_gestion: it.estado_gestion || (it.hecho ? 'cumplido' : 'abierto'),
        fecha: it.fecha || null,
        hora: it.hora || null,
        notas: it.notas || '',
        enlace: it.enlace || '',
        comentarios: Array.isArray(it.comentarios) ? it.comentarios : [],
      }))
      const payload = {
        titulo: titulo.trim(),
        fecha_vencimiento: duePreview.fecha || null,
        hora_vencimiento: duePreview.hora || null,
        campos_libres: { checklist: checklistClean },
      }
      if (destUser && relacion) {
        payload.relacion_destinatario = relacion
        payload.destinatario_id = destUser.id
        payload.referido_a_nombre = nombreUser(destUser)
      }
      const row = await api.crearTarea(payload)
      await uploadPendientes(row.id, checklist)
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
    if (!titulo.trim()) {
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
      className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
      style={seguimientoModalOverlayStyle(viewportCompact)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={viewportCompact ? 'cc-seguim-modal-sheet cc-seguim-modal-sheet--wide' : 'cc-seguim-modal-sheet--desktop'}
        style={{
          ...seguimientoModalSheetStyle(viewportCompact, { wide: true }),
          background: t.bgCard,
          border: viewportCompact ? 'none' : `1px solid ${t.border}`,
          boxShadow: t.shadow,
          padding: viewportCompact ? undefined : '28px 28px 22px',
        }}
      >
        <div className={viewportCompact ? 'cc-seguim-tarea-form cc-seguim-tarea-form--compact' : 'cc-seguim-tarea-form'}>
        <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 700, color: t.text, marginBottom: 6 }}>
          Nueva tarea personal
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 20, lineHeight: 1.45 }}>
          Puede crear la tarea solo con el título y, cuando quiera, agregar sub-ítems con imagen,
          esquema, notas y enlace propios de cada uno.
        </div>

        <label style={lbl(t)}>Título</label>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          style={{ ...inp(t), marginBottom: 14 }}
          placeholder="¿Qué hay que hacer?"
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...lbl(t), marginBottom: 0 }}>Checklist</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
              Vence {duePreview.fecha || '—'}{duePreview.hora ? ` ${duePreview.hora}` : ''}
            </span>
            <VencimientoIcon nivel={nivelPreview} showLabel t={t} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <TareaChecklistEditor t={t} value={checklist} onChange={setChecklist} usuario={usuario} />
        </div>

        <label style={lbl(t)}>Destinatario (opcional)</label>
        <UserSearchSelect
          t={t}
          usuarios={usuarios}
          mode="strict"
          placeholder="Buscar usuario del contrato…"
          style={{ ...inp(t), marginBottom: 6 }}
          onSelect={(u) => setDestUser(u)}
        />
        <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 14, lineHeight: 1.4 }}>
          Al guardar se le preguntará si es asignación formal o solo referencia.
        </div>

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

        <div className="cc-seguim-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={ghost(t)}>Cancelar</button>
          <button type="button" disabled={busy} onClick={guardar} style={primary(t)}>
            {busy ? 'Guardando…' : 'Crear tarea'}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}

function lbl(t) {
  return { display: 'block', fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 6 }
}
function inp(t) {
  return {
    width: '100%', boxSizing: 'border-box', fontSize: 'var(--cc-input)',
    padding: '10px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bg || t.bgCard, color: t.text,
  }
}
function primary(t) {
  return {
    border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer',
    background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)',
  }
}
function ghost(t) {
  return {
    border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 16px',
    cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)',
  }
}
