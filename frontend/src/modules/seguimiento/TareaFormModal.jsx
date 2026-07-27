import { useState } from 'react'
import TareaChecklistEditor from './TareaChecklistEditor'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import VencimientoIcon from './VencimientoIcon'
import { calcularNivelVencimiento, fechaVencimientoEfectiva } from './vencimientoLevels'

/**
 * Formulario de nueva tarea:
 * - Personal (para el creador) o delegada/asignada a un usuario de la plataforma.
 * - Si se delega, al guardar se elige asignación formal vs solo referencia.
 */
export default function TareaFormModal({ t, api, usuario, usuarios = [], onClose, onCreated }) {
  const [titulo, setTitulo] = useState('')
  const [checklist, setChecklist] = useState([])
  const [destinoTipo, setDestinoTipo] = useState('personal') // 'personal' | 'delegar'
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
      if (destinoTipo === 'delegar' && destUser && relacion) {
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
    if (destinoTipo === 'delegar') {
      if (!destUser) {
        setError('Seleccione el usuario destinatario o marque la tarea como personal')
        return
      }
      setError('')
      setAskModo(true)
      return
    }
    await crearConModo(null)
  }

  const elegirPersonal = () => {
    setDestinoTipo('personal')
    setDestUser(null)
    setAskModo(false)
    setError('')
  }

  const elegirDelegar = () => {
    setDestinoTipo('delegar')
    setAskModo(false)
    setError('')
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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1640px, 98vw)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: '28px 28px 22px',
          boxShadow: t.shadow,
        }}
      >
        <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 700, color: t.text, marginBottom: 6 }}>
          Nueva tarea
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
          autoComplete="off"
        />

        {/* Personal | Delegar en una sola línea; destinatario solo si Delegar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
        }}>
          <div
            role="radiogroup"
            aria-label="Destino de la tarea"
            style={{
              display: 'inline-flex',
              flexShrink: 0,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              overflow: 'hidden',
              background: t.bg || t.bgCard,
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={destinoTipo === 'personal'}
              onClick={elegirPersonal}
              style={segBtn(t, destinoTipo === 'personal')}
            >
              Personal
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={destinoTipo === 'delegar'}
              onClick={elegirDelegar}
              style={{
                ...segBtn(t, destinoTipo === 'delegar'),
                borderLeft: `1px solid ${t.border}`,
              }}
            >
              Delegar
            </button>
          </div>
          {destinoTipo === 'delegar' ? (
            <div style={{ flex: '1 1 240px', minWidth: 200, maxWidth: '100%' }}>
              <UserSearchSelect
                t={t}
                usuarios={usuarios}
                valueId={destUser?.id}
                valueNombre={destUser ? nombreUser(destUser) : ''}
                mode="strict"
                placeholder="Buscar destinatario…"
                style={{ ...inp(t), marginBottom: 0 }}
                onSelect={(u) => setDestUser(u)}
              />
            </div>
          ) : (
            <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, lineHeight: 1.35 }}>
              Queda en su bandeja. Elija Delegar para asignar a otro usuario.
            </span>
          )}
        </div>
        {destinoTipo === 'delegar' && (
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: -10, marginBottom: 14, lineHeight: 1.4 }}>
            Al guardar se preguntará si es asignación formal o solo referencia.
          </div>
        )}

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

        {askModo && destUser && destinoTipo === 'delegar' && (
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
  return { display: 'block', fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 6 }
}
function segBtn(t, active) {
  return {
    border: 'none',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 'var(--cc-sm)',
    fontWeight: active ? 700 : 600,
    background: active ? `${t.primary}22` : 'transparent',
    color: active ? t.primary : t.text,
    minHeight: 36,
  }
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
