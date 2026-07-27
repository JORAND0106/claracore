import { useState } from 'react'
import TareaChecklistEditor from './TareaChecklistEditor'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import VencimientoIcon from './VencimientoIcon'
import { calcularNivelVencimiento, fechaVencimientoEfectiva } from './vencimientoLevels'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle, useSeguimientoCompact } from './seguimientoShared'

<<<<<<< HEAD
/** Crear tarea personal: basta el título; la checklist se puede completar después. */
export default function TareaFormModal({ t, api, usuario, usuarios = [], onClose, onCreated, viewportCompact: viewportCompactProp }) {
  const viewportCompactHook = useSeguimientoCompact()
  const viewportCompact = viewportCompactProp ?? viewportCompactHook
=======
/**
 * Formulario de nueva tarea:
 * - Personal o delegada a uno/varios usuarios (asignación formal colectiva).
 * - Referencia sigue siendo un solo destinatario (fuera del multi-cumplimiento).
 */
export default function TareaFormModal({ t, api, usuario, usuarios = [], onClose, onCreated }) {
>>>>>>> 094437974045b7bc4c92efb8fa8fc95aa36a97a5
  const [titulo, setTitulo] = useState('')
  const [checklist, setChecklist] = useState([])
  const [destinoTipo, setDestinoTipo] = useState('personal') // 'personal' | 'delegar'
  const [destUsers, setDestUsers] = useState([])
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

  const addDest = (u) => {
    if (!u) return
    setDestUsers((arr) => {
      if (arr.some((x) => Number(x.id) === Number(u.id))) return arr
      return [...arr, u]
    })
  }

  const removeDest = (id) => {
    setDestUsers((arr) => arr.filter((x) => Number(x.id) !== Number(id)))
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
      if (destinoTipo === 'delegar' && destUsers.length && relacion) {
        payload.relacion_destinatario = relacion
        payload.destinatarios = destUsers.map((u) => ({
          id: u.id,
          nombre: nombreUser(u),
        }))
        // Compat legado (primer destinatario)
        payload.destinatario_id = destUsers[0].id
        payload.referido_a_nombre = nombreUser(destUsers[0])
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
      if (!destUsers.length) {
        setError('Seleccione al menos un destinatario o marque la tarea como personal')
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
    setDestUsers([])
    setAskModo(false)
    setError('')
  }

  const elegirDelegar = () => {
    setDestinoTipo('delegar')
    setAskModo(false)
    setError('')
  }

  const multi = destUsers.length > 1
  const nombresDest = destUsers.map((u) => nombreUser(u)).join(', ')

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

        {/* Personal | Delegar en una sola línea; destinatarios solo si Delegar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
        }}
        >
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
                key={`dest-search-${destUsers.map((u) => u.id).join('-') || 'empty'}`}
                t={t}
                usuarios={usuarios.filter((u) => !destUsers.some((d) => Number(d.id) === Number(u.id)))}
                valueId={null}
                valueNombre=""
                mode="strict"
                placeholder={destUsers.length ? 'Agregar otro destinatario…' : 'Buscar destinatario(s)…'}
                style={{ ...inp(t), marginBottom: 0 }}
                onSelect={(u) => addDest(u)}
              />
            </div>
          ) : (
            <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, lineHeight: 1.35 }}>
              Queda en su bandeja. Elija Delegar para asignar a uno o varios usuarios.
            </span>
          )}
        </div>
        {destinoTipo === 'delegar' && destUsers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {destUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => removeDest(u.id)}
                title="Quitar"
                style={{
                  border: `1px solid ${t.primary}`,
                  borderRadius: 8,
                  padding: '4px 8px',
                  background: `${t.primary}18`,
                  color: t.text,
                  cursor: 'pointer',
                  fontSize: 'var(--cc-xs)',
                }}
              >
                {nombreUser(u)} ✕
              </button>
            ))}
          </div>
        )}
        {destinoTipo === 'delegar' && (
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 14, lineHeight: 1.4 }}>
            {multi
              ? 'Con varios destinatarios la tarea solo queda Cumplida cuando todos confirmen su parte (asignación formal).'
              : 'Al guardar se preguntará si es asignación formal o solo referencia.'}
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

        {askModo && destUsers.length > 0 && destinoTipo === 'delegar' && (
          <div style={{
            marginBottom: 14, padding: 12, borderRadius: 8,
            border: `1px solid ${t.border}`, background: t.bg || `${t.primary}08`,
            fontSize: 'var(--cc-sm)', color: t.text,
          }}
          >
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              {multi
                ? `¿Asignar formalmente a ${destUsers.length} destinatarios (${nombresDest})?`
                : `¿Asignar formalmente a ${nombresDest} o solo enviarla como referencia?`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" disabled={busy} style={primary(t)} onClick={() => crearConModo('asignacion')}>
                Asignación formal{multi ? ' (cumplimiento colectivo)' : ''}
              </button>
              {!multi && (
                <button type="button" disabled={busy} style={ghost(t)} onClick={() => crearConModo('referencia')}>
                  Solo referencia
                </button>
              )}
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
