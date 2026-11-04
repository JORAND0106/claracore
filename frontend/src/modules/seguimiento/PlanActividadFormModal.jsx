import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import CcConfirmModal from '../../components/CcConfirmModal'
import TemaRichEditor from './TemaRichEditor'
import { isRichTextEmpty } from './richTextUtils'

const PRIORIDADES = [
  { value: 1, label: 'Muy suave', color: '#86efac' },
  { value: 2, label: 'Suave', color: '#a3e635' },
  { value: 3, label: 'Media', color: '#facc15' },
  { value: 4, label: 'Alta', color: '#fb923c' },
  { value: 5, label: 'Crítica', color: '#ef4444' },
]

const PERIODICIDADES = [
  { value: 'ninguna', label: 'Ninguna' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
]

function nombreUsuario(u) {
  if (!u) return ''
  return (
    u.nombre_completo
    || `${u.nombre || ''} ${u.apellidos || ''}`.trim()
    || u.nombre
    || u.email
    || `#${u.id}`
  )
}

/**
 * Popup creación/edición de actividad del Plan.
 */
export default function PlanActividadFormModal({
  t,
  api,
  usuario,
  actividad = null,
  usuarios = [],
  grupos = [],
  actaId = null,
  ideaId = null,
  onClose,
  onSaved,
}) {
  const editando = Boolean(actividad?.id)
  const [grupoModo, setGrupoModo] = useState('existente')
  const [grupoId, setGrupoId] = useState(actividad?.grupo_id || '')
  const [grupoNuevo, setGrupoNuevo] = useState('')
  const [titulo, setTitulo] = useState(actividad?.titulo || '')
  const [descripcion, setDescripcion] = useState(actividad?.descripcion || '')
  const [comentario, setComentario] = useState(actividad?.comentario_comite || '')
  const [solicitanteId, setSolicitanteId] = useState(
    actividad?.solicitante_id || usuario?.id || usuario?.sub || '',
  )
  const [asignados, setAsignados] = useState(() => {
    const a = actividad?.asignaciones || []
    if (a.length) return a.map((x) => Number(x.usuario_id)).filter(Boolean)
    if (actividad?.asignado_a_id) return [Number(actividad.asignado_a_id)]
    const self = Number(usuario?.id || usuario?.sub || 0)
    return self ? [self] : []
  })
  const [prioridad, setPrioridad] = useState(Number(actividad?.prioridad || 3))
  const [fechaInicio, setFechaInicio] = useState(actividad?.fecha_inicio || '')
  const [fechaFin, setFechaFin] = useState(actividad?.fecha_fin || '')
  const [periodicidad, setPeriodicidad] = useState(actividad?.periodicidad || 'ninguna')
  const [periodicidadHasta, setPeriodicidadHasta] = useState(actividad?.periodicidad_hasta || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [solapes, setSolapes] = useState(null)

  useEffect(() => {
    if (!grupos.length) return
    if (!grupoId && grupos[0]?.id) setGrupoId(grupos[0].id)
  }, [grupos, grupoId])

  const grupoOptions = useMemo(
    () => (Array.isArray(grupos) ? grupos : []),
    [grupos],
  )

  function toggleAsignado(uid) {
    const n = Number(uid)
    setAsignados((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]))
  }

  function buildPayload(confirmarSolape = false) {
    const payload = {
      titulo: titulo.trim(),
      descripcion: isRichTextEmpty(descripcion) ? '' : descripcion,
      comentario_comite: isRichTextEmpty(comentario) ? '' : comentario,
      solicitante_id: Number(solicitanteId) || undefined,
      asignados: asignados.map((id) => {
        const u = usuarios.find((x) => Number(x.id) === Number(id))
        return { usuario_id: Number(id), nombre: nombreUsuario(u) }
      }),
      prioridad: Number(prioridad),
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      periodicidad,
      periodicidad_hasta: periodicidad !== 'ninguna' ? (periodicidadHasta || null) : null,
      confirmar_solape: confirmarSolape,
    }
    if (grupoModo === 'otro') {
      payload.grupo_nombre = grupoNuevo.trim()
    } else {
      payload.grupo_id = Number(grupoId) || undefined
      const g = grupoOptions.find((x) => Number(x.id) === Number(grupoId))
      if (g) payload.grupo_nombre = g.nombre
    }
    if (actaId) payload.acta_id = Number(actaId)
    if (ideaId) payload.idea_id = Number(ideaId)
    return payload
  }

  async function submit(confirmarSolape = false) {
    setError('')
    if (!titulo.trim()) {
      setError('Indique el título de la actividad.')
      return
    }
    if (grupoModo === 'otro' && !grupoNuevo.trim()) {
      setError('Escriba el nombre del nuevo grupo.')
      return
    }
    if (grupoModo !== 'otro' && !grupoId && !grupoOptions.length) {
      setError('Cree un grupo o elija «Otro».')
      return
    }
    if (!asignados.length) {
      setError('Seleccione al menos un asignado.')
      return
    }
    if (periodicidad !== 'ninguna' && !periodicidadHasta) {
      setError('Indique hasta qué fecha se repite.')
      return
    }
    setSaving(true)
    try {
      const payload = buildPayload(confirmarSolape)
      const row = editando
        ? await api.updatePlanActividad(actividad.id, payload)
        : await api.createPlanActividad(payload)
      if (row?.requiere_confirmacion_solape) {
        setSolapes(row.solapes || [])
        return
      }
      onSaved?.(row)
      onClose?.()
    } catch (e) {
      setError(e?.message || 'No se pudo guardar la actividad.')
    } finally {
      setSaving(false)
    }
  }

  const fieldLabel = { fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 4 }
  const input = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.bgCard || t.bg || '#fff',
    color: t.text,
    fontSize: 'var(--cc-sm)',
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100040,
          background: t.overlay || 'rgba(15,23,42,0.48)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editando ? 'Editar actividad' : 'Crear actividad'}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(720px, 100%)',
            maxHeight: '92vh',
            overflow: 'auto',
            background: t.bgCard || t.bg || '#fff',
            border: `1px solid ${t.border}`,
            borderRadius: 14,
            boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          }}
        >
          <CcModalBrandHeader theme={t} />
          <div style={{ padding: '14px 18px 8px', borderBottom: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 'var(--cc-h3)', fontWeight: 800, color: t.text }}>
              {editando ? 'Editar actividad' : 'Nueva actividad'}
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
              Plan de actividades · hora Colombia
            </div>
          </div>

          <div style={{ padding: 18, display: 'grid', gap: 14 }}>
            <div>
              <div style={fieldLabel}>Grupo</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: t.text, fontSize: 'var(--cc-sm)' }}>
                  <input
                    type="radio"
                    checked={grupoModo === 'existente'}
                    onChange={() => setGrupoModo('existente')}
                  />
                  Existente
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: t.text, fontSize: 'var(--cc-sm)' }}>
                  <input
                    type="radio"
                    checked={grupoModo === 'otro'}
                    onChange={() => setGrupoModo('otro')}
                  />
                  Otro
                </label>
              </div>
              {grupoModo === 'otro' ? (
                <input
                  style={input}
                  value={grupoNuevo}
                  onChange={(e) => setGrupoNuevo(e.target.value)}
                  placeholder="Nombre del nuevo grupo"
                  list="plan-grupos-sugeridos"
                />
              ) : (
                <select
                  style={input}
                  value={grupoId}
                  onChange={(e) => setGrupoId(e.target.value)}
                >
                  <option value="">Seleccione…</option>
                  {grupoOptions.map((g) => (
                    <option key={g.id} value={g.id}>{g.nombre}</option>
                  ))}
                </select>
              )}
              <datalist id="plan-grupos-sugeridos">
                {grupoOptions.map((g) => (
                  <option key={g.id} value={g.nombre} />
                ))}
              </datalist>
            </div>

            <div>
              <div style={fieldLabel}>Actividad</div>
              <input
                style={input}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título de la actividad"
                maxLength={500}
              />
            </div>

            <div>
              <div style={fieldLabel}>Descripción</div>
              <TemaRichEditor
                t={t}
                value={descripcion}
                onChange={setDescripcion}
                minHeight={100}
                placeholder="Descripción con viñetas, numeración o tabla…"
              />
            </div>

            <div>
              <div style={fieldLabel}>Comentario comité</div>
              <TemaRichEditor
                t={t}
                value={comentario}
                onChange={setComentario}
                minHeight={80}
                placeholder="Comentario del comité…"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={fieldLabel}>Solicitante</div>
                <select
                  style={input}
                  value={solicitanteId}
                  onChange={(e) => setSolicitanteId(e.target.value)}
                >
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>{nombreUsuario(u)}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={fieldLabel}>Prioridad</div>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    padding: '6px 0',
                  }}
                  role="slider"
                  aria-valuenow={prioridad}
                  aria-valuemin={1}
                  aria-valuemax={5}
                >
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      title={p.label}
                      aria-label={`Prioridad ${p.value}: ${p.label}`}
                      onClick={() => setPrioridad(p.value)}
                      style={{
                        width: 28 + p.value * 4,
                        height: 28 + p.value * 2,
                        borderRadius: 999,
                        border: prioridad === p.value ? `2px solid ${t.text}` : `1px solid ${t.border}`,
                        background: p.color,
                        cursor: 'pointer',
                        transition: 'transform 160ms ease, box-shadow 160ms ease',
                        transform: prioridad === p.value ? 'scale(1.08)' : 'scale(1)',
                        boxShadow: prioridad === p.value ? `0 0 0 3px ${p.color}55` : 'none',
                      }}
                    />
                  ))}
                  <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginLeft: 4 }}>
                    {PRIORIDADES.find((p) => p.value === prioridad)?.label}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div style={fieldLabel}>Asignado(s)</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 6,
                maxHeight: 140,
                overflow: 'auto',
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: 8,
              }}
              >
                {usuarios.map((u) => {
                  const checked = asignados.includes(Number(u.id))
                  return (
                    <label
                      key={u.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 'var(--cc-sm)',
                        color: t.text,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAsignado(u.id)}
                      />
                      {nombreUsuario(u)}
                    </label>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <div style={fieldLabel}>Fecha inicio</div>
                <input type="date" style={input} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </div>
              <div>
                <div style={fieldLabel}>Fecha fin</div>
                <input type="date" style={input} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </div>
              <div>
                <div style={fieldLabel}>Periodicidad</div>
                <select style={input} value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
                  {PERIODICIDADES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {periodicidad !== 'ninguna' && (
              <div>
                <div style={fieldLabel}>Repetir hasta</div>
                <input
                  type="date"
                  style={input}
                  value={periodicidadHasta}
                  onChange={(e) => setPeriodicidadHasta(e.target.value)}
                />
              </div>
            )}

            {error && (
              <div style={{ color: t.danger || '#dc2626', fontSize: 'var(--cc-sm)' }}>{error}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: 'transparent',
                  color: t.text,
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => submit(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: t.primary,
                  color: '#fff',
                  cursor: saving ? 'wait' : 'pointer',
                  fontWeight: 800,
                }}
              >
                {saving ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Crear actividad')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {solapes && (
        <CcConfirmModal
          theme={t}
          tipo="warn"
          titulo="Alerta de solape de fechas"
          confirmar="Continuar y guardar"
          cancelar="Volver a ajustar"
          zIndex={100050}
          procesando={saving}
          onCancel={() => setSolapes(null)}
          onConfirm={() => {
            setSolapes(null)
            submit(true)
          }}
        >
          <div style={{ fontSize: 'var(--cc-sm)', color: t.text }}>
            Esta actividad se cruza con otras del mismo asignado. La alerta es informativa y no impide guardar.
          </div>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 'var(--cc-sm)', color: t.text }}>
            {(solapes || []).slice(0, 12).map((s) => (
              <li key={`${s.item_id}-${s.fecha_inicio}`}>
                <strong>{s.titulo}</strong>
                {' · '}
                {s.fecha_inicio}
                {s.fecha_fin && s.fecha_fin !== s.fecha_inicio ? ` → ${s.fecha_fin}` : ''}
                {s.prioridad != null ? ` · prioridad ${s.prioridad}` : ''}
              </li>
            ))}
          </ul>
        </CcConfirmModal>
      )}
    </>
  )
}
