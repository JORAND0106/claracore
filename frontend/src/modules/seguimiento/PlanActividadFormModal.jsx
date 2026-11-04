import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import CcConfirmModal from '../../components/CcConfirmModal'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import AdjuntosMediaSlider from '../../components/adjuntos/AdjuntosMediaSlider'
import { slidesFromImagenes } from '../../components/adjuntos/adjuntosMedia'
import TemaRichEditor from './TemaRichEditor'
import UserSearchSelect from './UserSearchSelect'
import { bitacoraSheetStyles } from './bitacoraSheetStyles'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
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

function ghost(t) {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${t.border}`,
    background: 'transparent',
    color: t.text,
    cursor: 'pointer',
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    fontFamily: 'inherit',
  }
}

/**
 * Popup creación/edición de actividad del Plan — layout tipo Excel.
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
  const ui = useMemo(() => bitacoraSheetStyles(t), [t])
  const editando = Boolean(actividad?.id)
  const [grupoModo, setGrupoModo] = useState('existente')
  const [grupoId, setGrupoId] = useState(actividad?.grupo_id || '')
  const [grupoNuevo, setGrupoNuevo] = useState('')
  const [titulo, setTitulo] = useState(actividad?.titulo || '')
  const [descripcion, setDescripcion] = useState(actividad?.descripcion || '')
  const [comentario, setComentario] = useState(actividad?.comentario_comite || '')
  const [adjDesc, setAdjDesc] = useState(() => (
    Array.isArray(actividad?.adjuntos_descripcion) ? actividad.adjuntos_descripcion : []
  ))
  const [adjCom, setAdjCom] = useState(() => (
    Array.isArray(actividad?.adjuntos_comentario) ? actividad.adjuntos_comentario : []
  ))
  const [esquemaCampo, setEsquemaCampo] = useState(null) // 'descripcion' | 'comentario'
  const [slideDesc, setSlideDesc] = useState(0)
  const [slideCom, setSlideCom] = useState(0)
  const [solicitanteId, setSolicitanteId] = useState(
    actividad?.solicitante_id || usuario?.id || usuario?.sub || '',
  )
  const [asignados, setAsignados] = useState(() => {
    const a = actividad?.asignaciones || []
    if (a.length) {
      return a.map((x) => ({
        id: Number(x.usuario_id),
        nombre: x.nombre || '',
      })).filter((x) => x.id)
    }
    if (actividad?.asignado_a_id) {
      return [{
        id: Number(actividad.asignado_a_id),
        nombre: actividad.asignado_a_nombre || '',
      }]
    }
    const self = Number(usuario?.id || usuario?.sub || 0)
    if (!self) return []
    const u = usuarios.find((x) => Number(x.id) === self)
    return [{ id: self, nombre: nombreUsuario(u) || 'Yo' }]
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

  const usuariosDisponibles = useMemo(
    () => usuarios.filter((u) => !asignados.some((a) => Number(a.id) === Number(u.id))),
    [usuarios, asignados],
  )

  function addAsignado(u) {
    if (!u?.id) return
    const id = Number(u.id)
    setAsignados((prev) => (
      prev.some((x) => Number(x.id) === id)
        ? prev
        : [...prev, { id, nombre: nombreUsuario(u) }]
    ))
  }

  function removeAsignado(id) {
    setAsignados((prev) => prev.filter((x) => Number(x.id) !== Number(id)))
  }

  function pushEsquema(campo, dataUrl, extras) {
    const calcAdj = Array.isArray(extras?.adjuntos)
      ? extras.adjuntos.map((a) => ({
        nombre: a.nombre,
        data_uri: a.dataUri,
        mime_type: a.mime,
        created_at: new Date().toISOString(),
        pending: true,
        kind: a.kind || 'esquema-calculo',
        origen: a.origen || 'esquema-calculo',
        campo,
      }))
      : []
    const entry = {
      nombre: `esquema-${Date.now()}.png`,
      data_uri: dataUrl,
      mime_type: 'image/png',
      created_at: new Date().toISOString(),
      pending: true,
      kind: 'esquema',
      campo,
    }
    const next = [entry, ...calcAdj]
    if (campo === 'descripcion') setAdjDesc((prev) => [...prev, ...next].slice(0, 16))
    else setAdjCom((prev) => [...prev, ...next].slice(0, 16))
  }

  function buildPayload(confirmarSolape = false) {
    const payload = {
      titulo: titulo.trim(),
      descripcion: isRichTextEmpty(descripcion) ? '' : descripcion,
      comentario_comite: isRichTextEmpty(comentario) ? '' : comentario,
      solicitante_id: Number(solicitanteId) || undefined,
      asignados: asignados.map((a) => {
        const u = usuarios.find((x) => Number(x.id) === Number(a.id))
        return { usuario_id: Number(a.id), nombre: a.nombre || nombreUsuario(u) }
      }),
      prioridad: Number(prioridad),
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      periodicidad,
      periodicidad_hasta: periodicidad !== 'ninguna' ? (periodicidadHasta || null) : null,
      confirmar_solape: confirmarSolape,
      adjuntos_descripcion: adjDesc,
      adjuntos_comentario: adjCom,
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

  const cellInp = {
    ...ui.cellInp,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 32,
  }

  const thLabel = { ...ui.th, width: '12%', whiteSpace: 'nowrap' }
  const tdField = { ...ui.td, verticalAlign: 'top' }

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
          padding: 12,
        }}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editando ? 'Editar actividad' : 'Crear actividad'}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(1100px, 98vw)',
            maxHeight: '86vh',
            overflow: 'auto',
            background: t.bgCard || t.bg || '#fff',
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          }}
        >
          <CcModalBrandHeader theme={t} />
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 'var(--cc-h3)', fontWeight: 800, color: t.text }}>
              {editando ? 'Editar actividad' : 'Nueva actividad'}
            </div>
          </div>

          <div style={{ padding: '12px 16px 16px' }}>
            <div style={ui.sheetWrap}>
              <table style={{ ...ui.sheetTable, tableLayout: 'fixed' }}>
                <tbody>
                  <tr>
                    <th style={thLabel}>Grupo</th>
                    <td style={tdField} colSpan={3}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--cc-sm)', color: t.text }}>
                          <input type="radio" checked={grupoModo === 'existente'} onChange={() => setGrupoModo('existente')} />
                          Existente
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--cc-sm)', color: t.text }}>
                          <input type="radio" checked={grupoModo === 'otro'} onChange={() => setGrupoModo('otro')} />
                          Otro
                        </label>
                      </div>
                      {grupoModo === 'otro' ? (
                        <input
                          style={cellInp}
                          value={grupoNuevo}
                          onChange={(e) => setGrupoNuevo(e.target.value)}
                          placeholder="Nombre del nuevo grupo"
                          list="plan-grupos-sugeridos"
                        />
                      ) : (
                        <select style={cellInp} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
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
                    </td>
                  </tr>

                  <tr>
                    <th style={thLabel}>Actividad</th>
                    <td style={tdField} colSpan={3}>
                      <input
                        style={cellInp}
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                        placeholder="Título"
                        maxLength={500}
                      />
                    </td>
                  </tr>

                  <tr>
                    <th style={thLabel}>Descripción</th>
                    <td style={tdField} colSpan={3}>
                      <TemaRichEditor
                        t={t}
                        value={descripcion}
                        onChange={setDescripcion}
                        minHeight={72}
                        placeholder="Descripción…"
                      />
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                        <button type="button" style={ghost(t)} onClick={() => setEsquemaCampo('descripcion')}>
                          Dibujar esquema
                        </button>
                        {adjDesc.length > 0 && (
                          <button
                            type="button"
                            style={ghost(t)}
                            onClick={() => setAdjDesc((prev) => prev.filter((_, i) => i !== Math.min(slideDesc, prev.length - 1)))}
                          >
                            Quitar adjunto
                          </button>
                        )}
                      </div>
                      {adjDesc.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <AdjuntosMediaSlider
                            t={t}
                            items={slidesFromImagenes(adjDesc, imagenSrc)}
                            index={Math.min(slideDesc, adjDesc.length - 1)}
                            height={140}
                            onIndexChange={setSlideDesc}
                            onClickItem={(slide) => openImageInNewTab(slide.source)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>

                  <tr>
                    <th style={thLabel}>Comentario comité</th>
                    <td style={tdField} colSpan={3}>
                      <TemaRichEditor
                        t={t}
                        value={comentario}
                        onChange={setComentario}
                        minHeight={56}
                        placeholder="Comentario del comité…"
                      />
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                        <button type="button" style={ghost(t)} onClick={() => setEsquemaCampo('comentario')}>
                          Dibujar esquema
                        </button>
                        {adjCom.length > 0 && (
                          <button
                            type="button"
                            style={ghost(t)}
                            onClick={() => setAdjCom((prev) => prev.filter((_, i) => i !== Math.min(slideCom, prev.length - 1)))}
                          >
                            Quitar adjunto
                          </button>
                        )}
                      </div>
                      {adjCom.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <AdjuntosMediaSlider
                            t={t}
                            items={slidesFromImagenes(adjCom, imagenSrc)}
                            index={Math.min(slideCom, adjCom.length - 1)}
                            height={120}
                            onIndexChange={setSlideCom}
                            onClickItem={(slide) => openImageInNewTab(slide.source)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>

                  <tr>
                    <th style={thLabel}>Solicitante</th>
                    <td style={tdField}>
                      <select style={cellInp} value={solicitanteId} onChange={(e) => setSolicitanteId(e.target.value)}>
                        {usuarios.map((u) => (
                          <option key={u.id} value={u.id}>{nombreUsuario(u)}</option>
                        ))}
                      </select>
                    </td>
                    <th style={thLabel}>Prioridad</th>
                    <td style={tdField}>
                      <div
                        style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0' }}
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
                            data-cc-tooltip={p.label}
                            data-cc-tooltip-variant="short"
                            aria-label={`Prioridad ${p.value}: ${p.label}`}
                            onClick={() => setPrioridad(p.value)}
                            style={{
                              width: 24 + p.value * 3,
                              height: 24 + p.value * 2,
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
                        <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                          {PRIORIDADES.find((p) => p.value === prioridad)?.label}
                        </span>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <th style={thLabel}>Asignado(s)</th>
                    <td style={tdField} colSpan={3}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        {asignados.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => removeAsignado(a.id)}
                            title="Quitar"
                            data-cc-tooltip="Quitar"
                            data-cc-tooltip-variant="short"
                            style={{
                              border: `1px solid ${t.primary}`,
                              background: `${t.primary}14`,
                              color: t.text,
                              borderRadius: 999,
                              padding: '4px 10px',
                              fontSize: 'var(--cc-xs)',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            {a.nombre || `#${a.id}`} ×
                          </button>
                        ))}
                      </div>
                      <UserSearchSelect
                        key={`asig-search-${asignados.map((a) => a.id).join('-') || 'empty'}`}
                        t={t}
                        usuarios={usuariosDisponibles}
                        valueId={null}
                        valueNombre=""
                        mode="strict"
                        placeholder={asignados.length ? 'Agregar otro…' : 'Buscar asignado…'}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          fontSize: 'var(--cc-sm)',
                          padding: '6px 8px',
                          borderRadius: 4,
                          border: `1px solid ${ui.border}`,
                          background: t.inputBg || t.bg || '#fff',
                          color: t.text,
                        }}
                        onSelect={addAsignado}
                      />
                    </td>
                  </tr>

                  <tr>
                    <th style={thLabel}>Fecha inicio</th>
                    <td style={tdField}>
                      <input type="date" style={cellInp} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
                    </td>
                    <th style={thLabel}>Fecha fin</th>
                    <td style={tdField}>
                      <input type="date" style={cellInp} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
                    </td>
                  </tr>

                  <tr>
                    <th style={thLabel}>Periodicidad</th>
                    <td style={tdField}>
                      <select style={cellInp} value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
                        {PERIODICIDADES.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </td>
                    <th style={thLabel}>Repetir hasta</th>
                    <td style={tdField}>
                      <input
                        type="date"
                        style={cellInp}
                        value={periodicidadHasta}
                        disabled={periodicidad === 'ninguna'}
                        onChange={(e) => setPeriodicidadHasta(e.target.value)}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {error && (
              <div style={{ color: t.danger || '#dc2626', fontSize: 'var(--cc-sm)', marginTop: 10 }}>{error}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 14px',
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
                  padding: '8px 16px',
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

      {esquemaCampo && (
        <EsquemaEditorModal
          t={t}
          title={esquemaCampo === 'descripcion' ? 'Esquema · Descripción' : 'Esquema · Comentario comité'}
          iaDoc={{
            ambito: 'plan_actividad',
            docKey: `plan-${actividad?.id || 'nueva'}-${esquemaCampo}`,
          }}
          onClose={() => setEsquemaCampo(null)}
          onSave={(dataUrl, extras) => {
            pushEsquema(esquemaCampo, dataUrl, extras)
            setEsquemaCampo(null)
          }}
        />
      )}

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
