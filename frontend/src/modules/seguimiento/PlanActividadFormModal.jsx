import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { PenLine, Save, Trash2, X } from 'lucide-react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import CcConfirmModal from '../../components/CcConfirmModal'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import AdjuntosMediaSlider from '../../components/adjuntos/AdjuntosMediaSlider'
import { slidesFromImagenes } from '../../components/adjuntos/adjuntosMedia'
import {
  avatarColorFromName,
  inicialesUsuario,
  usuariosFichaTheme,
} from '../../components/ccFichaModalTheme'
import TemaRichEditor from './TemaRichEditor'
import UserSearchSelect from './UserSearchSelect'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
import { isRichTextEmpty } from './richTextUtils'
import { useClaraViewport } from '../../useClaraViewport'

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

function resolveThemeMode(t) {
  if (typeof document !== 'undefined') {
    const ds = document.documentElement?.dataset?.ccTheme
    if (ds === 'dark' || ds === 'rest' || ds === 'light') return ds
  }
  if (t?.mode === 'dark' || t?.mode === 'rest' || t?.mode === 'light') return t.mode
  if (t?.isDark === true) return 'dark'
  return 'light'
}

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

function partsNombre(u, fallbackNombre = '') {
  if (u) {
    return {
      nombre: u.nombre || String(fallbackNombre || '').split(/\s+/)[0] || '',
      apellidos: u.apellidos || String(fallbackNombre || '').split(/\s+/).slice(1).join(' ') || '',
    }
  }
  const bits = String(fallbackNombre || '').trim().split(/\s+/)
  return { nombre: bits[0] || '', apellidos: bits.slice(1).join(' ') || '' }
}

function UserAvatar({ u, nombreFallback = '', ficha, size = 36 }) {
  const parts = partsNombre(u, nombreFallback)
  const initials = inicialesUsuario(parts.nombre, parts.apellidos)
  const bg = avatarColorFromName(parts.nombre, parts.apellidos, ficha.avatarColors)
  const foto = u?.foto_perfil_url || u?.foto_url || u?.avatar_url || ''
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: Math.round(size * 0.28),
        overflow: 'hidden',
        background: foto ? ficha.inputBg : `linear-gradient(145deg, ${bg}, ${ficha.primaryLight || ficha.primary})`,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: Math.max(11, Math.round(size * 0.34)),
        letterSpacing: '0.03em',
        boxShadow: foto ? 'none' : `0 4px 12px ${bg}44`,
        border: `1.5px solid ${ficha.border}`,
        flexShrink: 0,
      }}
    >
      {foto ? (
        <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initials
      )}
    </span>
  )
}

function SectionBlock({ title, ficha, children, last }) {
  return (
    <section style={{ ...ficha.sectionCard, marginBottom: last ? 0 : 14 }}>
      <div style={ficha.sectionTitle}>
        <span style={ficha.sectionDot} aria-hidden />
        {title}
      </div>
      {children}
    </section>
  )
}

function IconBtn({ title, onClick, disabled, children, ficha, compact, variant = 'ghost' }) {
  const size = compact ? 44 : 40
  const primary = ficha.primary
  const styles = variant === 'primary'
    ? {
      background: primary,
      borderColor: primary,
      color: '#fff',
    }
    : variant === 'danger'
      ? {
        background: `${ficha.dangerColor}14`,
        borderColor: `${ficha.dangerColor}55`,
        color: ficha.dangerColor,
      }
      : {
        background: ficha.closeBtn?.background || 'transparent',
        borderColor: ficha.border,
        color: primary,
      }
  return (
    <button
      type="button"
      title={title}
      data-cc-tooltip={title}
      data-cc-tooltip-variant="short"
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: 10,
        border: '1px solid',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        padding: 0,
        fontFamily: 'inherit',
        transition: 'transform 140ms ease, box-shadow 140ms ease',
        ...styles,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Popup creación/edición de actividad del Plan.
 * Misma familia visual que la ficha de Gestión de Usuarios.
 * Conserva campos, editores, esquemas, solapes y validaciones.
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
  const vp = useClaraViewport()
  /** Solo celular (incl. landscape de teléfono): columna vertical. Tablet+ → filas horizontales. */
  const phoneLayout = Boolean(vp.isMobile || vp.isLandscapeMobile)
  const wideLayout = !phoneLayout
  const themeMode = resolveThemeMode(t)
  const ficha = useMemo(() => usuariosFichaTheme(themeMode, t), [themeMode, t])
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
  const [esquemaCampo, setEsquemaCampo] = useState(null)
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

  const solicitante = useMemo(
    () => usuarios.find((u) => Number(u.id) === Number(solicitanteId)) || null,
    [usuarios, solicitanteId],
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
      setError('Escriba el nombre del nuevo departamento.')
      return
    }
    if (grupoModo !== 'otro' && !grupoId && !grupoOptions.length) {
      setError('Cree un departamento o elija «Otro».')
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

  const fieldInput = {
    ...ficha.select,
    borderRadius: 8,
    fontWeight: 600,
  }

  const grid2 = {
    display: 'grid',
    gridTemplateColumns: phoneLayout ? '1fr' : '1fr 1fr',
    gap: 10,
  }
  const gridSide = {
    display: 'grid',
    gridTemplateColumns: wideLayout ? '1fr 1fr' : '1fr',
    gap: wideLayout ? 12 : 0,
    alignItems: 'stretch',
  }

  const label = {
    display: 'block',
    fontSize: 'var(--cc-caption)',
    fontWeight: 700,
    color: ficha.textMuted,
    marginBottom: 6,
    letterSpacing: '0.02em',
  }

  const modalNode = (
    <>
      <div
        style={{
          ...ficha.overlay,
          zIndex: 100060,
          padding: phoneLayout ? 0 : 12,
        }}
        role="presentation"
        data-cc-plan-actividad-form-overlay="1"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cc-plan-actividad-form-title"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: phoneLayout ? '100%' : (wideLayout ? 'min(1280px, 98vw)' : 'min(920px, 98vw)'),
            maxHeight: phoneLayout ? '100dvh' : '94vh',
            height: phoneLayout ? '100dvh' : undefined,
            borderRadius: phoneLayout ? 0 : 16,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontSize: 'var(--cc-sm)',
            color: ficha.text,
            fontFamily: 'inherit',
            ...ficha.modal,
          }}
        >
          <CcModalBrandHeader theme={t} />

          <div style={{ ...ficha.hero, flexShrink: 0 }}>
            <div style={ficha.heroAccent} aria-hidden />
            <div
              style={{
                padding: phoneLayout ? '14px 14px 16px' : '12px 18px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: phoneLayout ? 12 : 16,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  id="cc-plan-actividad-form-title"
                  style={{
                    fontSize: 'var(--cc-h2)',
                    fontWeight: 800,
                    color: ficha.text,
                    lineHeight: 1.2,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {editando ? 'Editar actividad' : 'Nueva actividad'}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 10,
                  }}
                >
                  <span style={ficha.pill('primary')}>Plan de actividades</span>
                  <span style={ficha.pill(prioridad >= 4 ? 'rechazado' : prioridad <= 2 ? 'aprobado' : 'pendiente')}>
                    Prioridad {prioridad}
                    {' · '}
                    {PRIORIDADES.find((p) => p.value === prioridad)?.label}
                  </span>
                </div>
              </div>
              <IconBtn title="Cerrar" ficha={ficha} compact={phoneLayout} onClick={onClose}>
                <X size={18} strokeWidth={2.25} aria-hidden />
              </IconBtn>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: phoneLayout
                ? '12px 12px max(16px, env(safe-area-inset-bottom))'
                : '12px 16px 14px',
              WebkitOverflowScrolling: 'touch',
              background: themeMode === 'dark'
                ? 'rgba(0,0,0,0.12)'
                : themeMode === 'rest'
                  ? 'rgba(42,35,24,0.03)'
                  : 'rgba(0,119,182,0.03)',
            }}
          >
            <SectionBlock title="Departamento" ficha={ficha}>
              <div style={{ ...grid2, marginBottom: 0 }}>
                <div>
                  <label style={label}>Departamento</label>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: ficha.text, fontSize: 'var(--cc-sm)' }}>
                      <input type="radio" checked={grupoModo === 'existente'} onChange={() => setGrupoModo('existente')} />
                      Existente
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: ficha.text, fontSize: 'var(--cc-sm)' }}>
                      <input type="radio" checked={grupoModo === 'otro'} onChange={() => setGrupoModo('otro')} />
                      Otro
                    </label>
                  </div>
                  {grupoModo === 'otro' ? (
                    <input
                      style={fieldInput}
                      value={grupoNuevo}
                      onChange={(e) => setGrupoNuevo(e.target.value)}
                      placeholder="Nombre del nuevo departamento"
                      list="plan-grupos-sugeridos"
                    />
                  ) : (
                    <select style={fieldInput} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
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
                  <label style={label}>Actividad</label>
                  <input
                    style={fieldInput}
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Título"
                    maxLength={500}
                  />
                </div>
              </div>
            </SectionBlock>

            <SectionBlock title="Contenido" ficha={ficha}>
              <div style={gridSide}>
                <div style={{ marginBottom: phoneLayout ? 12 : 0, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <label style={{ ...label, marginBottom: 0 }}>Descripción</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <IconBtn
                        title="Dibujar esquema"
                        ficha={ficha}
                        compact={phoneLayout}
                        onClick={() => setEsquemaCampo('descripcion')}
                      >
                        <PenLine size={16} strokeWidth={2.1} aria-hidden />
                      </IconBtn>
                      {adjDesc.length > 0 && (
                        <IconBtn
                          title="Quitar adjunto"
                          ficha={ficha}
                          compact={phoneLayout}
                          variant="danger"
                          onClick={() => setAdjDesc((prev) => prev.filter((_, i) => i !== Math.min(slideDesc, prev.length - 1)))}
                        >
                          <Trash2 size={16} strokeWidth={2.1} aria-hidden />
                        </IconBtn>
                      )}
                    </div>
                  </div>
                  <TemaRichEditor
                    t={t}
                    value={descripcion}
                    onChange={setDescripcion}
                    minHeight={phoneLayout ? 72 : (wideLayout ? 110 : 88)}
                    placeholder="Descripción…"
                  />
                  {adjDesc.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <AdjuntosMediaSlider
                        t={t}
                        items={slidesFromImagenes(adjDesc, imagenSrc)}
                        index={Math.min(slideDesc, adjDesc.length - 1)}
                        height={wideLayout ? 100 : 140}
                        onIndexChange={setSlideDesc}
                        onClickItem={(slide) => openImageInNewTab(slide.source)}
                      />
                    </div>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <label style={{ ...label, marginBottom: 0 }}>Comentario comité</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <IconBtn
                        title="Dibujar esquema"
                        ficha={ficha}
                        compact={phoneLayout}
                        onClick={() => setEsquemaCampo('comentario')}
                      >
                        <PenLine size={16} strokeWidth={2.1} aria-hidden />
                      </IconBtn>
                      {adjCom.length > 0 && (
                        <IconBtn
                          title="Quitar adjunto"
                          ficha={ficha}
                          compact={phoneLayout}
                          variant="danger"
                          onClick={() => setAdjCom((prev) => prev.filter((_, i) => i !== Math.min(slideCom, prev.length - 1)))}
                        >
                          <Trash2 size={16} strokeWidth={2.1} aria-hidden />
                        </IconBtn>
                      )}
                    </div>
                  </div>
                  <TemaRichEditor
                    t={t}
                    value={comentario}
                    onChange={setComentario}
                    minHeight={phoneLayout ? 56 : (wideLayout ? 110 : 72)}
                    placeholder="Comentario del comité…"
                  />
                  {adjCom.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <AdjuntosMediaSlider
                        t={t}
                        items={slidesFromImagenes(adjCom, imagenSrc)}
                        index={Math.min(slideCom, adjCom.length - 1)}
                        height={wideLayout ? 100 : 120}
                        onIndexChange={setSlideCom}
                        onClickItem={(slide) => openImageInNewTab(slide.source)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </SectionBlock>

            <div style={gridSide}>
              <SectionBlock title="Personas" ficha={ficha} last={!phoneLayout}>
                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div>
                    <label style={label}>Solicitante</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <UserAvatar u={solicitante} ficha={ficha} size={phoneLayout ? 40 : 36} />
                      <select
                        style={{ ...fieldInput, flex: 1 }}
                        value={solicitanteId}
                        onChange={(e) => setSolicitanteId(e.target.value)}
                      >
                        {usuarios.map((u) => (
                          <option key={u.id} value={u.id}>{nombreUsuario(u)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={label}>Prioridad</label>
                    <div
                      style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', minHeight: 36 }}
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
                            width: 22 + p.value * 3,
                            height: 22 + p.value * 2,
                            borderRadius: 999,
                            border: prioridad === p.value
                              ? `2px solid ${ficha.text}`
                              : `1px solid ${ficha.border}`,
                            background: p.color,
                            cursor: 'pointer',
                            transition: 'transform 160ms ease, box-shadow 160ms ease',
                            transform: prioridad === p.value ? 'scale(1.08)' : 'scale(1)',
                            boxShadow: prioridad === p.value
                              ? `0 0 0 3px ${ficha.primary}44`
                              : 'none',
                          }}
                        />
                      ))}
                      <span style={{ fontSize: 'var(--cc-sm)', color: ficha.textMuted, fontWeight: 600 }}>
                        {PRIORIDADES.find((p) => p.value === prioridad)?.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={label}>Asignado(s)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {asignados.map((a) => {
                      const u = usuarios.find((x) => Number(x.id) === Number(a.id))
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => removeAsignado(a.id)}
                          title="Quitar"
                          data-cc-tooltip="Quitar"
                          data-cc-tooltip-variant="short"
                          style={{
                            ...ficha.pill('primary'),
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            gap: 8,
                            padding: '4px 10px 4px 4px',
                          }}
                        >
                          <UserAvatar u={u} nombreFallback={a.nombre} ficha={ficha} size={24} />
                          <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.nombre || `#${a.id}`}
                          </span>
                          <X size={12} strokeWidth={2.4} aria-hidden />
                        </button>
                      )
                    })}
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
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: `1px solid ${ficha.border}`,
                      background: ficha.inputBg,
                      color: ficha.text,
                      fontWeight: 600,
                    }}
                    onSelect={addAsignado}
                  />
                </div>
              </SectionBlock>

              <SectionBlock title="Fechas y periodicidad" ficha={ficha} last>
                <div style={{ ...grid2, marginBottom: 10 }}>
                  <div>
                    <label style={label}>Fecha inicio</label>
                    <input type="date" style={fieldInput} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
                  </div>
                  <div>
                    <label style={label}>Fecha fin</label>
                    <input type="date" style={fieldInput} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
                  </div>
                </div>
                <div style={grid2}>
                  <div>
                    <label style={label}>Periodicidad</label>
                    <select style={fieldInput} value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
                      {PERIODICIDADES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={label}>Repetir hasta</label>
                    <input
                      type="date"
                      style={{
                        ...fieldInput,
                        opacity: periodicidad === 'ninguna' ? 0.55 : 1,
                      }}
                      value={periodicidadHasta}
                      disabled={periodicidad === 'ninguna'}
                      onChange={(e) => setPeriodicidadHasta(e.target.value)}
                    />
                  </div>
                </div>
              </SectionBlock>
            </div>

            {error && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${ficha.dangerColor}55`,
                  background: `${ficha.dangerColor}14`,
                  color: ficha.dangerColor,
                  fontSize: 'var(--cc-sm)',
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div style={ficha.foot}>
            <IconBtn title="Cancelar" ficha={ficha} compact={phoneLayout} onClick={onClose}>
              <X size={18} strokeWidth={2.2} aria-hidden />
            </IconBtn>
            <IconBtn
              title={saving ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Crear actividad')}
              ficha={ficha}
              compact={phoneLayout}
              variant="primary"
              disabled={saving}
              onClick={() => submit(false)}
            >
              <Save size={18} strokeWidth={2.2} aria-hidden />
            </IconBtn>
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
          zIndex={100070}
          procesando={saving}
          onCancel={() => setSolapes(null)}
          onConfirm={() => {
            setSolapes(null)
            submit(true)
          }}
        >
          <div style={{ fontSize: 'var(--cc-sm)', color: ficha.text }}>
            Esta actividad se cruza con otras del mismo asignado. La alerta es informativa y no impide guardar.
          </div>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 'var(--cc-sm)', color: ficha.text }}>
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

  if (typeof document === 'undefined') return modalNode
  return createPortal(modalNode, document.body)
}
