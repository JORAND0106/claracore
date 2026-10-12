import { useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import TareaExcelLayout from './TareaExcelLayout.jsx'
import {
  fechaVencimientoDesdePartes,
  newParteItem,
  partesToPayload,
} from './tareaPartesForm'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import VencimientoIcon from './VencimientoIcon'
import { calcularAvanceTarea } from './tareaAvance'
import { calcularNivelVencimiento } from './vencimientoLevels'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle, useSeguimientoCompact } from './seguimientoShared'

/**
 * Formulario de nueva tarea:
 * - Simple por defecto (solo título).
 * - Puede convertirse en madre agregándole partes (cada una con responsable, fecha, etc.).
 * - Personal o delegada a uno/varios usuarios (asignación formal colectiva a nivel madre).
 */
export default function TareaFormModal({
  t, api, usuario, usuarios = [], onClose, onCreated,
  viewportCompact: viewportCompactProp,
  fechaInicial = null,
}) {
  const viewportCompactHook = useSeguimientoCompact()
  const viewportCompact = viewportCompactProp ?? viewportCompactHook
  const [titulo, setTitulo] = useState('')
  const [partes, setPartes] = useState(() => {
    const f = fechaInicial ? String(fechaInicial).slice(0, 10) : ''
    return f ? [newParteItem({ fecha: f })] : []
  })
  const [destinoTipo, setDestinoTipo] = useState('personal') // 'personal' | 'delegar'
  const [destUsers, setDestUsers] = useState([])
  const [askModo, setAskModo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const duePreview = fechaVencimientoDesdePartes(partes)
  const nivelPreview = duePreview.fecha
    ? calcularNivelVencimiento({
      fechaVencimiento: duePreview.fecha,
      fechaCreacion: new Date().toISOString().slice(0, 10),
    })
    : null
  const avance = calcularAvanceTarea(
    partes.map((p) => ({
      estado_gestion: p.estado_gestion,
      hecho: p.estado_gestion === 'cumplido',
    })),
  )

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
      const personal = destinoTipo !== 'delegar'
      const partesPayload = partesToPayload(partes, { personal, creador: usuario })
      if (partes.length > 0 && partesPayload.length === 0) {
        setError('Indique el título de cada parte')
        setBusy(false)
        return
      }
      if (!personal && partesPayload.length > 0) {
        const sinResp = partesPayload.some((p) => !p.asignado_a_id)
        if (sinResp) {
          setError('Asigne un responsable a cada parte')
          setBusy(false)
          return
        }
      }
      const payload = {
        titulo: titulo.trim(),
        fecha_vencimiento: duePreview.fecha || null,
        hora_vencimiento: duePreview.hora || null,
        campos_libres: {},
      }
      if (partesPayload.length > 0) {
        payload.partes = partesPayload
      }
      if (destinoTipo === 'delegar' && destUsers.length && relacion) {
        payload.relacion_destinatario = relacion
        payload.destinatarios = destUsers.map((u) => ({
          id: u.id,
          nombre: nombreUser(u),
        }))
        payload.destinatario_id = destUsers[0].id
        payload.referido_a_nombre = nombreUser(destUsers[0])
      }
      const row = await api.crearTarea(payload)
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
      // Con partes asignadas a responsables, la madre no exige destinatarios propios.
      const partesConResp = partes.filter((p) => p.asignado_a_id)
      if (!destUsers.length && partesConResp.length === 0) {
        setError('Seleccione destinatario(s) o asigne responsables a las partes')
        return
      }
      if (destUsers.length) {
        setError('')
        setAskModo(true)
        return
      }
      // Solo responsables en partes → crear sin relación madre
      await crearConModo(null)
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
  const cumplimientoPreview = destinoTipo === 'personal'
    ? 'Personal'
    : (multi ? 'Colectivo (pendiente)' : 'Asignación (pendiente)')

  const destinatariosNode = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div
        role="radiogroup"
        aria-label="Destino de la tarea"
        style={{
          display: 'inline-flex',
          flexShrink: 0,
          border: `1px solid ${t.border}`,
          borderRadius: 6,
          overflow: 'hidden',
          background: t.bg || t.bgCard,
          alignSelf: 'flex-start',
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
        <>
          <UserSearchSelect
            key={`dest-search-${destUsers.map((u) => u.id).join('-') || 'empty'}`}
            t={t}
            usuarios={usuarios.filter((u) => !destUsers.some((d) => Number(d.id) === Number(u.id)))}
            valueId={null}
            valueNombre=""
            mode="strict"
            placeholder={destUsers.length ? 'Agregar otro…' : 'Buscar destinatario(s)…'}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontSize: 'var(--cc-xs)',
              padding: '6px 8px',
              borderRadius: 6,
              border: `1px solid ${t.border}`,
              background: t.bg || t.bgCard,
              color: t.text,
              marginBottom: 0,
            }}
            onSelect={(u) => addDest(u)}
          />
          {destUsers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {destUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => removeDest(u.id)}
                  title="Quitar"
                  style={{
                    border: `1px solid ${t.primary}`,
                    borderRadius: 6,
                    padding: '2px 6px',
                    background: `${t.primary}18`,
                    color: t.text,
                    cursor: 'pointer',
                    fontSize: 10,
                  }}
                >
                  {nombreUser(u)} ✕
                </button>
              ))}
            </div>
          )}
          <span style={{ fontSize: 10, color: t.textMuted, lineHeight: 1.3 }}>
            O asigne responsables distintos en cada parte.
          </span>
        </>
      ) : (
        <span style={{ fontSize: 10, color: t.textMuted, lineHeight: 1.3 }}>
          Queda en su bandeja · las partes son suyas
        </span>
      )}
    </div>
  )

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
        <CcModalBrandHeader theme={t} />
        <div className={viewportCompact ? 'cc-seguim-tarea-form cc-seguim-tarea-form--compact' : 'cc-seguim-tarea-form'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 700, color: t.text, marginBottom: 4 }}>
                Nueva tarea
              </div>
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, lineHeight: 1.4 }}>
                Simple por defecto. Agregue partes con + para crear una tarea madre. Puede guardar solo con el título.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                Vence {duePreview.fecha || '—'}{duePreview.hora ? ` ${duePreview.hora}` : ''}
              </span>
              <VencimientoIcon nivel={nivelPreview} showLabel t={t} />
            </div>
          </div>

          <TareaExcelLayout
            t={t}
            mode="create"
            defaultExpanded
            secondLevel="partes"
            titulo={titulo}
            onTituloChange={setTitulo}
            destinatariosNode={destinatariosNode}
            cumplimientoLabel={cumplimientoPreview}
            avance={avance}
            partes={partes}
            onPartesChange={setPartes}
            partesUsuarios={usuarios}
            showParteResponsable={destinoTipo === 'delegar'}
            canNotificar
            partesDefaultFecha={fechaInicial ? String(fechaInicial).slice(0, 10) : ''}
            footerBeforeChecklist={
              destinoTipo === 'delegar' ? (
                <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 8, lineHeight: 1.4 }}>
                  {multi
                    ? 'Con varios destinatarios a nivel madre, la tarea solo queda Cumplida cuando todos confirmen (asignación formal).'
                    : destUsers.length
                      ? 'Al guardar se preguntará si es asignación formal o solo referencia.'
                      : 'Asigne un responsable en cada parte; al abrir la madre verá la carpeta con avance.'}
                </div>
              ) : null
            }
          />

          {askModo && destUsers.length > 0 && destinoTipo === 'delegar' && (
            <div style={{
              marginTop: 14, marginBottom: 8, padding: 12, borderRadius: 8,
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

          {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', marginTop: 8, fontSize: 'var(--cc-sm)' }}>{error}</div>}

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

function segBtn(t, active) {
  return {
    border: 'none',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: active ? 700 : 600,
    background: active ? `${t.primary}22` : 'transparent',
    color: active ? t.primary : t.text,
    minHeight: 28,
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
