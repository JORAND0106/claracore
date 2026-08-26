/**
 * Popup integrado: datos de armada + puntos de cartera capturados bajo ella.
 * Permite editar/agregar/eliminar puntos sin salir del contexto de la armada.
 */
import { useEffect, useMemo, useState } from 'react'
import TopoAngularInput from './TopoAngularInput'
import { fmtNum, validarGms } from '../../utils/topografia_angular'

function parseMetrosInput(v) {
  if (v === '' || v == null) return null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function emptyPuntoForm() {
  return {
    tipo_punto: 'auxiliar',
    nombre_punto: '',
    angulo_gms: '',
    angulo_vertical_gms: '',
    distancia: '',
    altura_objetivo: '',
  }
}

function formFromPunto(p) {
  if (!p) return emptyPuntoForm()
  return {
    tipo_punto: p.tipo_punto || 'auxiliar',
    nombre_punto: p.nombre_punto || '',
    angulo_gms: p.angulo_observado_gms ?? '',
    angulo_vertical_gms: p.angulo_vertical_gms ?? '',
    distancia: p.distancia ?? '',
    altura_objetivo: p.altura_objetivo ?? '',
  }
}

function buildPuntoPayload(form, onError) {
  if (!form.nombre_punto.trim()) {
    onError?.({ titulo: 'Nombre del punto', mensaje: 'Escriba el nombre del punto observado.' })
    return null
  }
  if (form.angulo_gms === '' || form.angulo_gms == null) {
    onError?.({ titulo: 'Ángulo requerido', mensaje: 'Ingrese el ángulo horizontal observado (GG.MMSS).' })
    return null
  }
  const angGms = Number(form.angulo_gms)
  if (!Number.isFinite(angGms) || !validarGms(angGms)) {
    onError?.({ titulo: 'Ángulo inválido', mensaje: 'Use formato GG.MMSS (minutos y segundos menores a 60).' })
    return null
  }
  const dist = parseMetrosInput(form.distancia)
  if (form.distancia !== '' && form.distancia != null && dist == null) {
    onError?.({ titulo: 'Distancia inválida', mensaje: 'Ingrese la distancia en metros (use punto o coma decimal).' })
    return null
  }
  if (dist != null && dist < 0) {
    onError?.({ titulo: 'Distancia inválida', mensaje: 'La distancia horizontal no puede ser negativa (metros).' })
    return null
  }
  const av =
    form.angulo_vertical_gms === '' || form.angulo_vertical_gms == null
      ? null
      : Number(form.angulo_vertical_gms)
  return {
    tipo_punto: form.tipo_punto,
    nombre_punto: form.nombre_punto.trim(),
    angulo_gms: angGms,
    angulo_vertical_gms: av != null && Number.isFinite(av) ? av : null,
    distancia: dist,
    altura_objetivo: parseMetrosInput(form.altura_objetivo) ?? 0,
  }
}

export default function PoligonalArmadaEditModal({
  theme,
  armada,
  puntos = [],
  estacionesDisponibles = [],
  visadosDisponibles = [],
  canDelete = false,
  canEditPuntos = true,
  busy = false,
  onSave,
  onDelete,
  onSavePunto,
  onAddPunto,
  onDeletePunto,
  onError,
  onClose,
}) {
  const t = theme || {}
  const [estacion, setEstacion] = useState('')
  const [visado, setVisado] = useState('')
  const [hi, setHi] = useState('')
  /** null | 'new' | punto.id */
  const [modoPunto, setModoPunto] = useState(null)
  const [puntoForm, setPuntoForm] = useState(emptyPuntoForm())

  useEffect(() => {
    if (!armada) return
    setEstacion(armada.estacion_nombre || '')
    setVisado(armada.visado_nombre || '')
    setHi(armada.altura_instrumento == null ? '' : String(armada.altura_instrumento))
  }, [armada])

  const puntosOrdenados = useMemo(() => {
    return [...(puntos || [])].sort((a, b) => (a.orden || 0) - (b.orden || 0))
  }, [puntos])

  // Si el punto en edición desapareció (eliminado), salir del modo edición
  useEffect(() => {
    if (!modoPunto || modoPunto === 'new') return
    if (!puntosOrdenados.some((p) => p.id === modoPunto)) {
      setModoPunto(null)
      setPuntoForm(emptyPuntoForm())
    }
  }, [puntosOrdenados, modoPunto])

  if (!armada) return null

  const inp = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${t.border || '#CBD5E1'}`,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    fontFamily: 'inherit',
    color: t.text || '#0F172A',
    background: '#fff',
  }
  const label = {
    display: 'block',
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    color: t.textMuted || '#64748B',
    marginBottom: 4,
  }
  const th = {
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    color: t.textMuted || '#64748B',
    padding: '6px 6px',
    borderBottom: `1px solid ${t.border || '#E2E8F0'}`,
    whiteSpace: 'nowrap',
  }
  const td = {
    padding: '6px 6px',
    fontSize: 'var(--cc-xs)',
    color: t.text || '#0F172A',
    borderBottom: `1px solid ${t.border || '#F1F5F9'}`,
    verticalAlign: 'top',
  }

  const estOpts = estacionesDisponibles.length
    ? estacionesDisponibles
    : estacion
      ? [{ nombre: estacion }]
      : []
  const visOpts = visadosDisponibles.length
    ? visadosDisponibles
    : visado
      ? [{ nombre: visado }]
      : []

  const handleSaveArmada = () => {
    onSave?.({
      estacion_nombre: estacion.trim(),
      visado_nombre: visado.trim(),
      altura_instrumento: hi === '' ? null : Number(hi),
    })
  }

  const iniciarEditarPunto = (p) => {
    setModoPunto(p.id)
    setPuntoForm(formFromPunto(p))
  }

  const iniciarAgregarPunto = () => {
    setModoPunto('new')
    setPuntoForm(emptyPuntoForm())
  }

  const cancelarPunto = () => {
    setModoPunto(null)
    setPuntoForm(emptyPuntoForm())
  }

  const guardarPunto = async () => {
    const payload = buildPuntoPayload(puntoForm, onError)
    if (!payload) return
    let ok = false
    if (modoPunto === 'new') {
      ok = await onAddPunto?.(payload)
    } else if (modoPunto) {
      ok = await onSavePunto?.(modoPunto, payload)
    }
    if (ok) cancelarPunto()
  }

  const editingPunto = modoPunto && modoPunto !== 'new'
    ? puntosOrdenados.find((p) => p.id === modoPunto)
    : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100035,
        background: t.overlay || 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topo-armada-edit-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 860,
          maxHeight: '92vh',
          overflow: 'auto',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#E2E8F0'}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            background: '#E6F4F5',
            borderBottom: '1px solid #BCE3E6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          <div>
            <div id="topo-armada-edit-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: '#0E7C86' }}>
              Armada #{armada.orden} — estación, visado y puntos capturados
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: '#0E7C86', opacity: 0.85, marginTop: 2 }}>
              Revise la secuencia completa de esta armada en una sola vista
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#64748B' }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Cabecera armada */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label} htmlFor="arm-est">Estación</label>
              <select id="arm-est" value={estacion} onChange={(e) => setEstacion(e.target.value)} style={inp} disabled={busy}>
                <option value="">— Seleccione —</option>
                {estOpts.map((p) => (
                  <option key={p.nombre || p} value={p.nombre || p}>{p.nombre || p}</option>
                ))}
                {estacion && !estOpts.some((p) => (p.nombre || p) === estacion) && (
                  <option value={estacion}>{estacion}</option>
                )}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="arm-vis">Visado (atrás)</label>
              <select id="arm-vis" value={visado} onChange={(e) => setVisado(e.target.value)} style={inp} disabled={busy}>
                <option value="">— Seleccione —</option>
                {visOpts.map((p) => (
                  <option key={p.nombre || p} value={p.nombre || p}>{p.nombre || p}</option>
                ))}
                {visado && !visOpts.some((p) => (p.nombre || p) === visado) && (
                  <option value={visado}>{visado}</option>
                )}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="arm-hi">HI — altura del instrumento (m)</label>
              <input
                id="arm-hi"
                type="number"
                step="0.001"
                value={hi}
                onChange={(e) => setHi(e.target.value)}
                style={inp}
                placeholder="1.500"
                disabled={busy}
              />
            </div>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: t.bgMuted || '#F8FAFC',
                border: `1px solid ${t.border || '#E2E8F0'}`,
                fontSize: 'var(--cc-xs)',
                color: t.textMuted || '#64748B',
                alignSelf: 'end',
              }}
            >
              <div><strong style={{ color: t.text }}>Azimut base:</strong> {armada.base_azimut_texto ?? '—'} (calculado)</div>
              {armada.estacion_coords?.norte != null && (
                <div style={{ marginTop: 4 }}>
                  Est. N {fmtNum(armada.estacion_coords.norte, 3)} E {fmtNum(armada.estacion_coords.este, 3)}
                  {armada.estacion_coords.cota != null ? ` Z ${fmtNum(armada.estacion_coords.cota, 3)}` : ''}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="cc-topo-touch-btn"
              onClick={handleSaveArmada}
              disabled={busy || !estacion.trim() || !visado.trim()}
              style={{
                background: '#0E7C86',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 'var(--cc-sm)',
                fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy || !estacion.trim() || !visado.trim() ? 0.7 : 1,
                minHeight: 40,
              }}
            >
              {busy ? 'Guardando…' : 'Guardar datos de armada'}
            </button>
          </div>

          {/* Puntos capturados */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: t.text, fontSize: 'var(--cc-sm)' }}>
                  Puntos capturados en esta armada ({puntosOrdenados.length})
                </strong>
                <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2 }}>
                  Orden de cartera · revise si falta algún punto en la secuencia
                </div>
              </div>
              {canEditPuntos && (
                <button
                  type="button"
                  onClick={iniciarAgregarPunto}
                  disabled={busy || modoPunto === 'new'}
                  style={{
                    background: '#E6F4F5',
                    color: '#0E7C86',
                    border: '1px solid #BCE3E6',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 'var(--cc-xs)',
                    fontWeight: 700,
                    cursor: busy ? 'default' : 'pointer',
                    minHeight: 36,
                  }}
                >
                  + Agregar punto
                </button>
              )}
            </div>

            {puntosOrdenados.length === 0 && modoPunto !== 'new' ? (
              <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                No hay puntos radiados en esta armada. Use «Agregar punto» para capturar el primero.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', border: `1px solid ${t.border || '#E2E8F0'}`, borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={th}>#</th>
                      <th style={th}>Punto</th>
                      <th style={th}>Tipo</th>
                      <th style={th}>Ang. obs.</th>
                      <th style={th}>Ang. vert.</th>
                      <th style={th}>Dist.</th>
                      <th style={th}>HT</th>
                      <th style={th}>Azimut</th>
                      <th style={th}>N / E / Z</th>
                      {canEditPuntos && <th style={th} />}
                    </tr>
                  </thead>
                  <tbody>
                    {puntosOrdenados.map((p) => {
                      const enEdicion = modoPunto === p.id
                      return (
                        <tr
                          key={p.id || p.orden}
                          style={enEdicion ? { background: 'rgba(14,124,134,0.06)' } : undefined}
                        >
                          <td style={td}>{p.orden ?? '—'}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{p.nombre_punto || '—'}</td>
                          <td style={td}>{p.tipo_punto === 'estacion' ? 'Estación' : 'Auxiliar'}</td>
                          <td style={td}>{p.angulo_observado_texto ?? '—'}</td>
                          <td style={td}>{p.angulo_vertical_texto ?? '—'}</td>
                          <td style={td}>{p.distancia != null ? fmtNum(p.distancia, 3) : '—'}</td>
                          <td style={td}>{p.altura_objetivo != null ? fmtNum(p.altura_objetivo, 3) : '—'}</td>
                          <td style={{ ...td, color: '#0E7C86', fontWeight: 600 }}>{p.azimut_texto ?? '—'}</td>
                          <td style={td}>
                            {p.norte != null ? (
                              <>
                                N {fmtNum(p.norte, 2)}
                                <br />
                                E {fmtNum(p.este, 2)}
                                {p.cota != null && (
                                  <>
                                    <br />
                                    Z {fmtNum(p.cota, 2)}
                                  </>
                                )}
                              </>
                            ) : '—'}
                          </td>
                          {canEditPuntos && (
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                title="Editar punto"
                                disabled={busy}
                                onClick={() => iniciarEditarPunto(p)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#0E7C86',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  marginRight: 6,
                                }}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                title="Eliminar punto"
                                disabled={busy}
                                onClick={() => onDeletePunto?.(p)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                }}
                              >
                                ✕
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Formulario inline editar / agregar punto */}
          {modoPunto && canEditPuntos && (
            <div
              style={{
                border: '1px solid #BCE3E6',
                borderRadius: 10,
                background: '#F0FDFA',
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 800, color: '#0E7C86', marginBottom: 10, fontSize: 'var(--cc-sm)' }}>
                {modoPunto === 'new'
                  ? `Nuevo punto en armada #${armada.orden}`
                  : `Editar punto — ${editingPunto?.nombre_punto || ''}`}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>Punto</label>
                  <input
                    value={puntoForm.nombre_punto}
                    onChange={(e) => setPuntoForm({ ...puntoForm, nombre_punto: e.target.value })}
                    style={inp}
                    disabled={busy}
                    placeholder="Ej. D12"
                  />
                </div>
                <div>
                  <label style={label}>Tipo</label>
                  <select
                    value={puntoForm.tipo_punto}
                    onChange={(e) => setPuntoForm({ ...puntoForm, tipo_punto: e.target.value })}
                    style={inp}
                    disabled={busy}
                  >
                    <option value="auxiliar">Auxiliar</option>
                    <option value="estacion">Estación</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Ángulo observado</label>
                  <TopoAngularInput
                    value={puntoForm.angulo_gms}
                    onChange={(_, v) => setPuntoForm({ ...puntoForm, angulo_gms: v })}
                    disabled={busy}
                  />
                </div>
                <div>
                  <label style={label}>Ángulo vertical</label>
                  <TopoAngularInput
                    value={puntoForm.angulo_vertical_gms}
                    onChange={(_, v) => setPuntoForm({ ...puntoForm, angulo_vertical_gms: v == null || v === '' ? '' : v })}
                    disabled={busy}
                  />
                </div>
                <div>
                  <label style={label}>Distancia (m)</label>
                  <input
                    value={puntoForm.distancia}
                    onChange={(e) => setPuntoForm({ ...puntoForm, distancia: e.target.value })}
                    style={inp}
                    disabled={busy}
                    placeholder="metros"
                  />
                </div>
                <div>
                  <label style={label}>HT (m)</label>
                  <input
                    value={puntoForm.altura_objetivo}
                    onChange={(e) => setPuntoForm({ ...puntoForm, altura_objetivo: e.target.value })}
                    style={inp}
                    disabled={busy}
                    placeholder="0.000"
                  />
                </div>
              </div>
              {editingPunto && (
                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                  HI armada: {armada.altura_instrumento != null ? fmtNum(armada.altura_instrumento, 3) : '—'}
                  {' · '}Azimut actual: {editingPunto.azimut_texto ?? '—'}
                  {' · '}Se recalcula al guardar.
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={cancelarPunto}
                  disabled={busy}
                  style={{
                    background: '#fff',
                    color: t.text || '#334155',
                    border: `1px solid ${t.border || '#CBD5E1'}`,
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 'var(--cc-sm)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    minHeight: 40,
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardarPunto}
                  disabled={busy}
                  style={{
                    background: '#0E7C86',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 'var(--cc-sm)',
                    fontWeight: 700,
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy ? 0.7 : 1,
                    minHeight: 40,
                  }}
                >
                  {busy ? 'Guardando…' : (modoPunto === 'new' ? 'Agregar punto' : 'Guardar punto')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          className="cc-topo-actions-bar"
          style={{
            padding: '4px 18px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            borderTop: `1px solid ${t.border || '#E2E8F0'}`,
          }}
        >
          {canDelete ? (
            <button
              type="button"
              className="cc-topo-touch-btn"
              onClick={onDelete}
              disabled={busy}
              style={{
                background: '#FEE2E2',
                color: '#DC2626',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: '9px 16px',
                fontSize: 'var(--cc-sm)',
                fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
                minHeight: 44,
              }}
            >
              Eliminar armada
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="cc-topo-touch-btn"
            onClick={onClose}
            disabled={busy}
            style={{
              background: '#fff',
              color: t.text || '#334155',
              border: `1px solid ${t.border || '#CBD5E1'}`,
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              minHeight: 44,
              marginLeft: 'auto',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
