import { useEffect, useMemo, useState } from 'react'
import IdeaClaraModal from './IdeaClaraModal'
import TemaRichEditor from './TemaRichEditor'
import BitacoraAdjuntos from './BitacoraAdjuntos'
import BitacoraClimaField from './BitacoraClimaField'
import EquipoCatalogSelect from './EquipoCatalogSelect'
import { puedeEditarEntradaBitacora } from './bitacoraPermisos'
import {
  CARGOS_PERSONAL,
  EVENTO_TIPOS,
  horaActualBogota,
  hoyISOBogota,
  labelEventoTipo,
  personalPlantillaVacia,
} from './bitacoraConstants'
import { htmlToPlainText, isRichTextEmpty, plainTextToHtml } from './richTextUtils'

function emptyUso() {
  return {
    equipo_id: null,
    equipo_nombre: '',
    tipo: 'equipo',
    operador: '',
    cantidad: 1,
    hora_inicio: '',
    hora_fin: '',
    horas_intermedias: [],
  }
}

function emptyEventoDetalle(tipo) {
  if (tipo === 'incidente_sst') {
    return {
      descripcion_incidente: '',
      lugar: '',
      personas_involucradas: '',
      acciones_inmediatas: '',
      gravedad: 'leve',
      requiere_seguimiento: false,
    }
  }
  if (tipo === 'visita_terceros') {
    return { visitantes: '', entidad: '', motivo: '' }
  }
  return {}
}

/**
 * Editor modal: crear/editar Reporte Diario o crear Reporte de Evento.
 */
export default function BitacoraEntradaEditor({
  t,
  api,
  usuario,
  token,
  contratoId,
  permisos,
  modo, // 'diario' | 'evento' | 'ver'
  entrada = null,
  onClose,
  onSaved,
}) {
  const esNuevo = !entrada?.id
  const tipo = entrada?.tipo || (modo === 'evento' ? 'evento' : 'diario')
  const editable = useMemo(() => {
    if (esNuevo) return Boolean(permisos?.crear)
    return puedeEditarEntradaBitacora(entrada, permisos)
  }, [esNuevo, entrada, permisos])

  const [fecha, setFecha] = useState(entrada?.fecha || hoyISOBogota())
  const [horaInicio, setHoraInicio] = useState(
    String(entrada?.hora_inicio_labores || '').slice(0, 5) || horaActualBogota(),
  )
  const [clima, setClima] = useState({
    clima_codigo: entrada?.clima_codigo ?? null,
    clima_temp_c: entrada?.clima_temp_c ?? null,
    clima_descripcion: entrada?.clima_descripcion || '',
    clima_editado_manual: Boolean(entrada?.clima_editado_manual),
  })
  const [personal, setPersonal] = useState(() => {
    const base = personalPlantillaVacia()
    const prev = Array.isArray(entrada?.personal) ? entrada.personal : []
    return base.map((row) => {
      const found = prev.find((p) => String(p.cargo).toLowerCase() === row.cargo.toLowerCase())
      return found
        ? { ...row, cantidad: found.cantidad || 0, cargo_otro: found.cargo_otro || '' }
        : row
    })
  })
  const [usos, setUsos] = useState(
    Array.isArray(entrada?.equipos_uso) && entrada.equipos_uso.length
      ? entrada.equipos_uso.map((u) => ({
        ...emptyUso(),
        ...u,
        hora_inicio: String(u.hora_inicio || '').slice(0, 5),
        hora_fin: String(u.hora_fin || '').slice(0, 5),
        horas_intermedias: Array.isArray(u.horas_intermedias)
          ? u.horas_intermedias.map((h) => ({
            hora: String(h.hora || '').slice(0, 5),
            nota: h.nota || '',
          }))
          : [],
      }))
      : [emptyUso()],
  )
  const [eventoTipo, setEventoTipo] = useState(entrada?.evento_tipo || 'reporte_actividades')
  const [eventoDetalle, setEventoDetalle] = useState(
    entrada?.evento_detalle && typeof entrada.evento_detalle === 'object'
      ? { ...emptyEventoDetalle(entrada.evento_tipo), ...entrada.evento_detalle }
      : emptyEventoDetalle('reporte_actividades'),
  )
  const [cuerpoHtml, setCuerpoHtml] = useState(entrada?.cuerpo_html || '')
  const [imagenes, setImagenes] = useState(Array.isArray(entrada?.imagenes) ? entrada.imagenes : [])
  const [localId, setLocalId] = useState(entrada?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [claraOpen, setClaraOpen] = useState(false)

  useEffect(() => {
    setEventoDetalle((d) => ({ ...emptyEventoDetalle(eventoTipo), ...d }))
  }, [eventoTipo])

  const inp = {
    background: t.bg,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    width: '100%',
    boxSizing: 'border-box',
  }
  const label = { fontSize: 'var(--cc-sm)', color: t.textMuted, display: 'flex', flexDirection: 'column', gap: 4 }
  const btnPrimary = {
    background: t.primary, color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 14px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
  }
  const btnGhost = {
    background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '8px 14px', fontWeight: 600, cursor: 'pointer',
  }

  const setPersonalCantidad = (cargo, cantidad) => {
    setPersonal((rows) => rows.map((r) => (
      r.cargo === cargo ? { ...r, cantidad: Number(cantidad) || 0 } : r
    )))
  }

  const guardarDiario = async ({ cerrar = false } = {}) => {
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      const personalPayload = personal
        .filter((p) => Number(p.cantidad) > 0)
        .map((p) => ({
          cargo: p.cargo,
          cantidad: Number(p.cantidad) || 0,
          ...(p.cargo === 'Otro' && p.cargo_otro ? { cargo_otro: p.cargo_otro } : {}),
        }))
      const usosPayload = usos
        .filter((u) => String(u.equipo_nombre || '').trim())
        .map((u, i) => ({
          equipo_id: u.equipo_id,
          equipo_nombre: u.equipo_nombre,
          tipo: u.tipo || 'equipo',
          operador: u.operador || '',
          cantidad: Number(u.cantidad) || 1,
          hora_inicio: u.hora_inicio || null,
          hora_fin: u.hora_fin || null,
          horas_intermedias: (u.horas_intermedias || []).filter((h) => h.hora),
          orden: i,
        }))
      const payload = {
        fecha,
        hora_inicio_labores: horaInicio || null,
        ...clima,
        personal: personalPayload,
        equipos_uso: usosPayload,
        cuerpo_html: cuerpoHtml,
      }
      let row
      if (localId == null) {
        row = await api.createBitacoraDiario(payload)
        setLocalId(row.id)
      } else {
        row = await api.updateBitacoraEntrada(localId, payload)
      }
      // Subir pendientes
      const pending = (imagenes || []).filter((im) => im.pending && im.data_uri)
      for (const im of pending) {
        row = await api.pegarImagenBitacora(row.id, {
          nombre: im.nombre || `foto-${Date.now()}.png`,
          data_base64: im.data_uri,
          mime_type: im.mime_type || 'image/png',
          origen: im.origen || 'archivo',
        })
      }
      if (cerrar) {
        row = await api.cerrarBitacoraDiario(row.id)
        setOkMsg('Reporte Diario cerrado. Queda inmutable.')
      } else {
        setOkMsg('Reporte Diario guardado.')
      }
      setImagenes(Array.isArray(row.imagenes) ? row.imagenes : [])
      onSaved?.(row)
      if (cerrar) onClose?.()
    } catch (e) {
      setError(e.message || 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const crearEvento = async () => {
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      if (isRichTextEmpty(cuerpoHtml) && eventoTipo === 'reporte_actividades') {
        throw new Error('Describa las actividades del día en el texto libre')
      }
      let row = await api.createBitacoraEvento({
        fecha,
        evento_tipo: eventoTipo,
        evento_detalle: eventoDetalle,
        cuerpo_html: cuerpoHtml,
        imagenes: (imagenes || [])
          .filter((im) => im.data_uri || im.data_base64 || im.blob_path || im.url)
          .map((im) => ({
            nombre: im.nombre || `foto-${Date.now()}.png`,
            data_uri: im.data_uri || im.data_base64 || undefined,
            blob_path: im.blob_path || undefined,
            url: im.url || undefined,
            content_hash: im.content_hash || undefined,
            mime_type: im.mime_type || 'image/png',
            origen: im.origen || 'archivo',
          })),
      })
      setOkMsg('Reporte de Evento registrado (inmutable).')
      onSaved?.(row)
      onClose?.()
    } catch (e) {
      setError(e.message || 'No se pudo crear el evento')
    } finally {
      setBusy(false)
    }
  }

  const titulo = tipo === 'evento'
    ? (esNuevo ? 'Nuevo Reporte de Evento' : `Evento · ${labelEventoTipo(entrada?.evento_tipo)}`)
    : (esNuevo ? 'Nuevo Reporte Diario' : `Reporte Diario · ${entrada?.fecha || fecha}`)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 11000,
      background: 'rgba(15,23,42,0.45)',
      display: 'grid', placeItems: 'center', padding: 12,
    }}>
      <div style={{
        width: 'min(920px, 100%)', maxHeight: '92vh', overflow: 'auto',
        background: t.bgCard, borderRadius: 14, border: `1px solid ${t.border}`,
        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 2,
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: `1px solid ${t.border}`,
          background: t.bgCard,
        }}>
          <div>
            <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-h2)' }}>{titulo}</div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
              {tipo === 'diario'
                ? (editable
                  ? 'Puede complementar mientras esté abierto. Al cerrar queda inmutable.'
                  : 'Cerrado / bloqueado — solo lectura (excepto Desarrollador).')
                : 'Inmutable desde su creación.'}
            </div>
          </div>
          <button type="button" onClick={onClose} style={btnGhost}>Cerrar</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{
              background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA',
              borderRadius: 8, padding: '8px 10px', fontSize: 'var(--cc-sm)',
            }}>{error}</div>
          )}
          {okMsg && (
            <div style={{
              background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0',
              borderRadius: 8, padding: '8px 10px', fontSize: 'var(--cc-sm)',
            }}>{okMsg}</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label style={label}>
              Fecha
              <input
                type="date"
                disabled={!editable || (tipo === 'diario' && localId != null)}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                style={inp}
              />
            </label>
            {tipo === 'diario' && (
              <label style={label}>
                Hora inicio de labores
                <input
                  type="time"
                  disabled={!editable}
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  style={inp}
                />
              </label>
            )}
            {entrada?.created_by_nombre && (
              <label style={label}>
                Registrado por
                <div style={{ ...inp, background: t.bgCard }}>
                  {entrada.created_by_nombre}
                  {entrada.created_by_rol ? ` · ${entrada.created_by_rol}` : ''}
                </div>
              </label>
            )}
          </div>

          {tipo === 'diario' && (
            <>
              <BitacoraClimaField
                t={t}
                contratoId={contratoId}
                token={token}
                value={clima}
                onChange={setClima}
                disabled={!editable}
              />

              <div style={{
                border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, background: t.bg,
              }}>
                <div style={{ fontWeight: 700, color: t.text, marginBottom: 10 }}>Personal en obra (por cantidad)</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {personal.map((row) => (
                    <div key={row.cargo} style={{
                      display: 'grid',
                      gridTemplateColumns: row.cargo === 'Otro' ? '1fr 1fr 100px' : '1fr 100px',
                      gap: 8, alignItems: 'center',
                    }}>
                      <div style={{ color: t.text, fontSize: 'var(--cc-sm)', fontWeight: 600 }}>{row.cargo}</div>
                      {row.cargo === 'Otro' && (
                        <input
                          disabled={!editable}
                          placeholder="¿Cuál?"
                          value={row.cargo_otro || ''}
                          onChange={(e) => setPersonal((rows) => rows.map((r) => (
                            r.cargo === 'Otro' ? { ...r, cargo_otro: e.target.value } : r
                          )))}
                          style={inp}
                        />
                      )}
                      <input
                        type="number"
                        min={0}
                        disabled={!editable}
                        value={row.cantidad}
                        onChange={(e) => setPersonalCantidad(row.cargo, e.target.value)}
                        style={inp}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                  Cargos: {CARGOS_PERSONAL.join(', ')}. Sin identificación individual por nombre.
                </div>
              </div>

              <div style={{
                border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, background: t.bg,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10, gap: 8, flexWrap: 'wrap',
                }}>
                  <div style={{ fontWeight: 700, color: t.text }}>Maquinaria, equipos y volquetas</div>
                  {editable && (
                    <button type="button" onClick={() => setUsos((u) => [...u, emptyUso()])} style={btnGhost}>
                      + Agregar equipo
                    </button>
                  )}
                </div>
                {usos.map((u, idx) => (
                  <div key={idx} style={{
                    border: `1px solid ${t.border}`, borderRadius: 10, padding: 10,
                    marginBottom: 10, background: t.bgCard,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                      <label style={label}>
                        Equipo / máquina
                        <EquipoCatalogSelect
                          t={t}
                          api={api}
                          disabled={!editable}
                          value={u.equipo_nombre}
                          equipoId={u.equipo_id}
                          onChange={(sel) => setUsos((rows) => rows.map((r, i) => (
                            i === idx ? { ...r, ...sel } : r
                          )))}
                        />
                      </label>
                      <label style={label}>
                        Operador
                        <input
                          disabled={!editable}
                          value={u.operador || ''}
                          onChange={(e) => setUsos((rows) => rows.map((r, i) => (
                            i === idx ? { ...r, operador: e.target.value } : r
                          )))}
                          style={inp}
                        />
                      </label>
                      <label style={label}>
                        Cantidad
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          disabled={!editable}
                          value={u.cantidad}
                          onChange={(e) => setUsos((rows) => rows.map((r, i) => (
                            i === idx ? { ...r, cantidad: e.target.value } : r
                          )))}
                          style={inp}
                        />
                      </label>
                      <label style={label}>
                        Hora inicio
                        <input
                          type="time"
                          disabled={!editable}
                          value={u.hora_inicio || ''}
                          onChange={(e) => setUsos((rows) => rows.map((r, i) => (
                            i === idx ? { ...r, hora_inicio: e.target.value } : r
                          )))}
                          style={inp}
                        />
                      </label>
                      <label style={label}>
                        Hora fin
                        <input
                          type="time"
                          disabled={!editable}
                          value={u.hora_fin || ''}
                          onChange={(e) => setUsos((rows) => rows.map((r, i) => (
                            i === idx ? { ...r, hora_fin: e.target.value } : r
                          )))}
                          style={inp}
                        />
                      </label>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 6 }}>
                        Horas intermedias (paradas durante la jornada)
                      </div>
                      {(u.horas_intermedias || []).map((h, hi) => (
                        <div key={hi} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                          <input
                            type="time"
                            disabled={!editable}
                            value={h.hora || ''}
                            onChange={(e) => setUsos((rows) => rows.map((r, i) => {
                              if (i !== idx) return r
                              const horas = [...(r.horas_intermedias || [])]
                              horas[hi] = { ...horas[hi], hora: e.target.value }
                              return { ...r, horas_intermedias: horas }
                            }))}
                            style={{ ...inp, maxWidth: 140 }}
                          />
                          <input
                            disabled={!editable}
                            placeholder="Nota (opcional)"
                            value={h.nota || ''}
                            onChange={(e) => setUsos((rows) => rows.map((r, i) => {
                              if (i !== idx) return r
                              const horas = [...(r.horas_intermedias || [])]
                              horas[hi] = { ...horas[hi], nota: e.target.value }
                              return { ...r, horas_intermedias: horas }
                            }))}
                            style={inp}
                          />
                          {editable && (
                            <button
                              type="button"
                              onClick={() => setUsos((rows) => rows.map((r, i) => {
                                if (i !== idx) return r
                                return {
                                  ...r,
                                  horas_intermedias: (r.horas_intermedias || []).filter((_, j) => j !== hi),
                                }
                              }))}
                              style={btnGhost}
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      ))}
                      {editable && (
                        <button
                          type="button"
                          onClick={() => setUsos((rows) => rows.map((r, i) => (
                            i === idx
                              ? { ...r, horas_intermedias: [...(r.horas_intermedias || []), { hora: '', nota: '' }] }
                              : r
                          )))}
                          style={btnGhost}
                        >
                          + Hora intermedia
                        </button>
                      )}
                    </div>
                    {editable && usos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setUsos((rows) => rows.filter((_, i) => i !== idx))}
                        style={{ ...btnGhost, marginTop: 8, color: '#B91C1C' }}
                      >
                        Quitar equipo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {tipo === 'evento' && (
            <>
              <label style={label}>
                Tipo de evento
                <select
                  disabled={!esNuevo}
                  value={eventoTipo}
                  onChange={(e) => {
                    setEventoTipo(e.target.value)
                    setEventoDetalle(emptyEventoDetalle(e.target.value))
                  }}
                  style={inp}
                >
                  {EVENTO_TIPOS.map((x) => (
                    <option key={x.value} value={x.value}>{x.label}</option>
                  ))}
                </select>
              </label>

              {eventoTipo === 'incidente_sst' && (
                <div style={{
                  border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, background: t.bg,
                  display: 'grid', gap: 8,
                }}>
                  <div style={{ fontWeight: 700, color: t.text }}>
                    Incidente de seguridad (SST)
                    <span style={{ fontWeight: 500, color: t.textMuted, marginLeft: 8, fontSize: 'var(--cc-sm)' }}>
                      Independiente del módulo Auditor SST (IA)
                    </span>
                  </div>
                  {[
                    ['descripcion_incidente', 'Descripción del incidente'],
                    ['lugar', 'Lugar'],
                    ['personas_involucradas', 'Personas involucradas'],
                    ['acciones_inmediatas', 'Acciones inmediatas'],
                  ].map(([key, lab]) => (
                    <label key={key} style={label}>
                      {lab}
                      <textarea
                        disabled={!editable && !esNuevo}
                        rows={key === 'descripcion_incidente' || key === 'acciones_inmediatas' ? 3 : 2}
                        value={eventoDetalle[key] || ''}
                        onChange={(e) => setEventoDetalle((d) => ({ ...d, [key]: e.target.value }))}
                        style={{ ...inp, resize: 'vertical' }}
                      />
                    </label>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label style={label}>
                      Gravedad
                      <select
                        disabled={!editable && !esNuevo}
                        value={eventoDetalle.gravedad || 'leve'}
                        onChange={(e) => setEventoDetalle((d) => ({ ...d, gravedad: e.target.value }))}
                        style={inp}
                      >
                        <option value="leve">Leve</option>
                        <option value="moderada">Moderada</option>
                        <option value="grave">Grave</option>
                      </select>
                    </label>
                    <label style={{
                      ...label, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22,
                    }}>
                      <input
                        type="checkbox"
                        disabled={!editable && !esNuevo}
                        checked={Boolean(eventoDetalle.requiere_seguimiento)}
                        onChange={(e) => setEventoDetalle((d) => ({
                          ...d, requiere_seguimiento: e.target.checked,
                        }))}
                      />
                      Requiere seguimiento
                    </label>
                  </div>
                </div>
              )}

              {eventoTipo === 'visita_terceros' && (
                <div style={{
                  border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, background: t.bg,
                  display: 'grid', gap: 8,
                }}>
                  {[
                    ['visitantes', 'Visitantes'],
                    ['entidad', 'Entidad / empresa'],
                    ['motivo', 'Motivo de la visita'],
                  ].map(([key, lab]) => (
                    <label key={key} style={label}>
                      {lab}
                      <input
                        disabled={!editable && !esNuevo}
                        value={eventoDetalle[key] || ''}
                        onChange={(e) => setEventoDetalle((d) => ({ ...d, [key]: e.target.value }))}
                        style={inp}
                      />
                    </label>
                  ))}
                </div>
              )}

              {eventoTipo === 'reporte_actividades' && (
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                  Texto libre de lo ejecutado en obra. Sin relación con cantidades ni SicoeObra.
                </div>
              )}
            </>
          )}

          <div>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 8,
            }}>
              <div style={{ fontWeight: 700, color: t.text }}>
                {tipo === 'evento' ? 'Texto del reporte' : 'Observaciones / notas del día'}
              </div>
              {(editable || esNuevo) && (
                <button type="button" onClick={() => setClaraOpen(true)} style={btnGhost}>
                  Redactar con Clara
                </button>
              )}
            </div>
            <TemaRichEditor
              t={t}
              value={cuerpoHtml}
              onChange={setCuerpoHtml}
              editable={editable || esNuevo}
              minHeight={140}
              placeholder={
                tipo === 'evento'
                  ? 'Describa el evento…'
                  : 'Notas adicionales del reporte diario (opcional)…'
              }
            />
          </div>

          <BitacoraAdjuntos
            t={t}
            api={api}
            imagenes={imagenes}
            onChange={setImagenes}
            disabled={!(editable || esNuevo)}
            entradaId={localId}
            onUploadPersisted={localId != null ? async (body) => {
              const row = await api.pegarImagenBitacora(localId, body)
              setImagenes(Array.isArray(row.imagenes) ? row.imagenes : [])
              onSaved?.(row)
            } : undefined}
          />

          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end',
            borderTop: `1px solid ${t.border}`, paddingTop: 12,
          }}>
            {tipo === 'diario' && editable && (
              <>
                <button type="button" disabled={busy} onClick={() => void guardarDiario()} style={btnPrimary}>
                  Guardar
                </button>
                <button
                  type="button"
                  disabled={busy || localId == null}
                  onClick={() => {
                    if (!window.confirm('¿Cerrar el Reporte Diario? Quedará inmutable de forma permanente.')) return
                    void guardarDiario({ cerrar: true })
                  }}
                  style={{ ...btnPrimary, background: '#0F766E' }}
                  title={localId == null ? 'Guarde primero el reporte' : 'Equivalente a Marcar como Realizada'}
                >
                  Cerrar reporte
                </button>
              </>
            )}
            {tipo === 'diario' && !editable && permisos?.esDesarrollador && entrada?.estado === 'cerrado' && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const row = await api.revertirBitacoraDiario(localId)
                    onSaved?.(row)
                    setOkMsg('Reporte reabierto (Desarrollador).')
                  } catch (e) {
                    setError(e.message || 'No se pudo revertir')
                  } finally {
                    setBusy(false)
                  }
                }}
                style={btnGhost}
              >
                Reabrir (Desarrollador)
              </button>
            )}
            {tipo === 'evento' && esNuevo && permisos?.crear && (
              <button type="button" disabled={busy} onClick={() => void crearEvento()} style={btnPrimary}>
                Registrar evento
              </button>
            )}
            {permisos?.esDesarrollador && localId != null && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm('¿Eliminar definitivamente esta entrada?')) return
                  setBusy(true)
                  try {
                    await api.deleteBitacoraEntrada(localId)
                    onSaved?.(null)
                    onClose?.()
                  } catch (e) {
                    setError(e.message || 'No se pudo eliminar')
                  } finally {
                    setBusy(false)
                  }
                }}
                style={{ ...btnGhost, color: '#B91C1C' }}
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>

      {claraOpen && (
        <IdeaClaraModal
          t={t}
          api={api}
          textoInicial={htmlToPlainText(cuerpoHtml)}
          onClose={() => setClaraOpen(false)}
          aplicarLabel="Aplicar al reporte"
          subtitulo="Mejore la redacción del texto de la bitácora con Clara."
          textoLabel="Texto del reporte"
          modo="redaccion"
          zIndex={14000}
          onEnviarAlActa={(texto) => {
            setCuerpoHtml(plainTextToHtml(texto))
            setClaraOpen(false)
          }}
        />
      )}
    </div>
  )
}
