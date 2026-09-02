import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { createPortal } from 'react-dom'
import {
  DOCUMENTO_TIPOS,
  ESTADOS_COLABORADOR,
  HORA_SALIDA_DEFAULT,
  capitalizarNombrePropio,
  emptyAsistenciaRow,
  estadoPermiteFechaRetiro,
  estadoSinJornada,
  parseFechaISO,
  soloDigitosDocumento,
} from './personalAsistenciaHelpers'
import {
  seguimientoModalOverlayStyle,
  seguimientoModalSheetStyle,
  useSeguimientoCompact,
} from './seguimientoShared'

/**
 * Popup de registro/edición de colaborador en asistencia diaria.
 * Se monta con portal a document.body para no heredar overflow/stacking
 * del modal padre del Reporte Diario.
 */
export default function ColaboradorAsistenciaModal({
  t,
  api,
  initial = null,
  catalogHint = null,
  fechaDiario = '',
  disabled = false,
  onClose,
  onSave,
}) {
  const viewportCompact = useSeguimientoCompact()
  const [form, setForm] = useState(() => emptyAsistenciaRow(initial || {
    hora_salida: HORA_SALIDA_DEFAULT,
  }))
  const [cargosOpts, setCargosOpts] = useState([])
  const [subs, setSubs] = useState([])
  const [catalogOpts, setCatalogOpts] = useState([])
  const [nombreOpen, setNombreOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(emptyAsistenciaRow(initial || { hora_salida: HORA_SALIDA_DEFAULT }))
  }, [initial])

  useEffect(() => {
    if (catalogHint && !initial?.nombre) {
      setForm((f) => emptyAsistenciaRow({
        ...f,
        colaborador_id: catalogHint.id ?? catalogHint.colaborador_id ?? null,
        nombre: catalogHint.nombre || '',
        documento_tipo: catalogHint.documento_tipo || 'CC',
        documento_numero: soloDigitosDocumento(catalogHint.documento_numero),
        cargo: catalogHint.cargo || '',
        subcontratista_id: catalogHint.subcontratista_id ?? null,
        subcontratista_nombre: catalogHint.subcontratista_nombre || '',
        fecha_ingreso: parseFechaISO(catalogHint.fecha_ingreso),
        fecha_retiro: parseFechaISO(catalogHint.fecha_retiro),
      }))
    }
  }, [catalogHint, initial])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [cData, sData] = await Promise.all([
          api?.listBitacoraCargos?.() || Promise.resolve(null),
          api?.listSubcontratistasActivos?.() || Promise.resolve([]),
        ])
        if (cancelled) return
        const plantilla = Array.isArray(cData?.plantilla) ? cData.plantilla : []
        setCargosOpts(plantilla.map((p) => p.cargo || p.nombre || p).filter(Boolean))
        setSubs(Array.isArray(sData) ? sData : [])
      } catch {
        if (!cancelled) {
          setCargosOpts([])
          setSubs([])
        }
      }
    })()
    return () => { cancelled = true }
  }, [api])

  useEffect(() => {
    if (!nombreOpen || !api?.listBitacoraColaboradores) return undefined
    const tmr = setTimeout(async () => {
      try {
        const rows = await api.listBitacoraColaboradores(form.nombre || '')
        setCatalogOpts(Array.isArray(rows) ? rows : [])
      } catch {
        setCatalogOpts([])
      }
    }, 200)
    return () => clearTimeout(tmr)
  }, [api, form.nombre, nombreOpen])

  const patch = (p) => setForm((f) => ({ ...f, ...p }))

  const aplicarCatalogo = (row) => {
    patch({
      colaborador_id: row.id ?? row.colaborador_id ?? null,
      nombre: capitalizarNombrePropio(row.nombre || ''),
      documento_tipo: row.documento_tipo || 'CC',
      documento_numero: soloDigitosDocumento(row.documento_numero),
      cargo: row.cargo || form.cargo || '',
      subcontratista_id: row.subcontratista_id ?? null,
      subcontratista_nombre: row.subcontratista_nombre || '',
      fecha_ingreso: parseFechaISO(row.fecha_ingreso) || form.fecha_ingreso || '',
      fecha_retiro: parseFechaISO(row.fecha_retiro) || form.fecha_retiro || '',
      origen: 'catalogo',
    })
    setNombreOpen(false)
    setConfirmNew(null)
  }

  const onEstadoChange = (estado) => {
    const next = { estado }
    if (estadoSinJornada(estado)) {
      next.hora_ingreso = ''
      next.hora_salida = ''
    } else if (!form.hora_salida) {
      next.hora_salida = HORA_SALIDA_DEFAULT
    }
    if (estadoPermiteFechaRetiro(estado)) {
      if (!parseFechaISO(form.fecha_retiro)) {
        next.fecha_retiro = parseFechaISO(fechaDiario) || ''
      }
    }
    patch(next)
  }

  const exactMatch = useMemo(() => {
    const needle = capitalizarNombrePropio(form.nombre).toLowerCase()
    if (!needle) return null
    return catalogOpts.find((r) => capitalizarNombrePropio(r.nombre).toLowerCase() === needle) || null
  }, [catalogOpts, form.nombre])

  const sinJornada = estadoSinJornada(form.estado)
  const retiroEditable = estadoPermiteFechaRetiro(form.estado)

  const guardar = async ({ registrarNuevo = false } = {}) => {
    setError('')
    const nombre = capitalizarNombrePropio(form.nombre)
    if (!nombre) {
      setError('Indique el nombre y apellido del colaborador.')
      return
    }
    if (!String(form.cargo || '').trim()) {
      setError('Indique el cargo.')
      return
    }
    const doc = soloDigitosDocumento(form.documento_numero)
    if (form.documento_numero && !doc) {
      setError('El número de documento solo admite dígitos.')
      return
    }

    const sinJ = estadoSinJornada(form.estado)
    const payload = emptyAsistenciaRow({
      ...form,
      nombre,
      documento_numero: doc,
      fecha_ingreso: parseFechaISO(form.fecha_ingreso),
      fecha_retiro: parseFechaISO(form.fecha_retiro),
      hora_ingreso: sinJ ? '' : (form.hora_ingreso || ''),
      hora_salida: sinJ ? '' : (form.hora_salida || HORA_SALIDA_DEFAULT),
    })

    if (!payload.colaborador_id && !exactMatch && !registrarNuevo && !initial?.colaborador_id) {
      setConfirmNew(nombre)
      return
    }

    setBusy(true)
    try {
      const catalogBody = {
        nombre: payload.nombre,
        documento_tipo: payload.documento_tipo,
        documento_numero: payload.documento_numero,
        cargo: payload.cargo,
        subcontratista_id: payload.subcontratista_id,
        subcontratista_nombre: payload.subcontratista_nombre,
        fecha_ingreso: payload.fecha_ingreso || '',
        fecha_retiro: payload.fecha_retiro || '',
      }

      if (registrarNuevo || (!payload.colaborador_id && !exactMatch)) {
        const row = await api.upsertBitacoraColaborador(catalogBody)
        if (row?.id) payload.colaborador_id = row.id
        if (row?.nombre) payload.nombre = row.nombre
      } else {
        if (exactMatch && !payload.colaborador_id) {
          payload.colaborador_id = exactMatch.id
        }
        // Persistir fechas históricas en catálogo también al editar existente.
        if (api?.upsertBitacoraColaborador) {
          try {
            const row = await api.upsertBitacoraColaborador(catalogBody)
            if (row?.id && !payload.colaborador_id) payload.colaborador_id = row.id
          } catch { /* la asistencia del día igual se guarda */ }
        }
      }

      if (payload.cargo && api?.upsertBitacoraCargo) {
        const known = cargosOpts.some(
          (c) => String(c).toLowerCase() === payload.cargo.toLowerCase(),
        )
        if (!known) {
          try { await api.upsertBitacoraCargo({ nombre: payload.cargo }) } catch { /* ignore */ }
        }
      }

      onSave?.(payload)
      onClose?.()
    } catch (e) {
      setError(e.message || 'No se pudo guardar el colaborador')
    } finally {
      setBusy(false)
      setConfirmNew(null)
    }
  }

  const field = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    background: t.inputBg || t.bg || '#fff',
    color: t.text,
    padding: '9px 10px',
    fontSize: 'var(--cc-sm)',
    fontFamily: 'inherit',
    display: 'block',
    minHeight: 40,
  }
  const fieldDisabled = {
    ...field,
    opacity: 0.65,
    cursor: 'not-allowed',
    background: t.bg || '#f1f5f9',
  }
  const labelStyle = {
    display: 'block',
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    color: t.textMuted,
    marginBottom: 5,
  }
  const hintStyle = {
    marginTop: 4,
    fontSize: 11,
    color: t.textMuted,
    lineHeight: 1.35,
  }
  const btnGhost = {
    border: `1px solid ${t.border}`,
    background: t.bgCard || '#fff',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 700,
    color: t.text,
    fontSize: 'var(--cc-sm)',
  }
  const btnPrimary = {
    border: 'none',
    background: t.primary,
    color: '#fff',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: busy ? 'wait' : 'pointer',
    fontWeight: 700,
    fontSize: 'var(--cc-sm)',
    opacity: busy ? 0.7 : 1,
  }

  const modal = (
    <div
      role="presentation"
      className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
      style={{
        ...seguimientoModalOverlayStyle(viewportCompact),
        zIndex: 12500,
        background: 'rgba(15, 23, 42, 0.55)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initial?.nombre ? 'Editar colaborador' : 'Registrar colaborador'}
        className={
          viewportCompact
            ? 'cc-seguim-modal-sheet cc-bitacora-colaborador-modal'
            : 'cc-seguim-modal-sheet--desktop cc-bitacora-colaborador-modal'
        }
        style={{
          ...seguimientoModalSheetStyle(viewportCompact, { wide: false }),
          width: viewportCompact ? '100%' : 'min(520px, 96vw)',
          maxWidth: viewportCompact ? '100%' : 520,
          background: t.bgCard || '#ffffff',
          border: viewportCompact ? 'none' : `1px solid ${t.border}`,
          boxShadow: t.shadow || '0 20px 50px rgba(15, 23, 42, 0.28)',
          color: t.text,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >        <CcModalBrandHeader theme={t} />

        <div style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          padding: '14px 16px',
          borderBottom: `1px solid ${t.border}`,
          background: t.bgCard || '#fff',
        }}>
          <div style={{ fontWeight: 800, color: t.primary || t.text, fontSize: 'var(--cc-body)' }}>
            {initial?.nombre ? 'Editar colaborador' : 'Registrar colaborador'}
          </div>
          <button type="button" onClick={onClose} style={btnGhost} aria-label="Cerrar">
            Cerrar
          </button>
        </div>

        <div
          className="cc-bitacora-colaborador-modal__body"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '14px 16px',
            background: t.bgCard || '#fff',
          }}
        >
          <div className="cc-bitacora-colaborador-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Nombre y apellido</label>
              <input
                disabled={disabled}
                value={form.nombre}
                placeholder="Ej. Juan Pérez"
                onFocus={() => setNombreOpen(true)}
                onChange={(e) => {
                  patch({
                    nombre: e.target.value,
                    colaborador_id: null,
                  })
                  setNombreOpen(true)
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setNombreOpen(false)
                    patch({ nombre: capitalizarNombrePropio(form.nombre) })
                  }, 180)
                }}
                style={field}
              />
              {nombreOpen && catalogOpts.length > 0 && (
                <div style={{
                  position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%',
                  marginTop: 2,
                  background: t.bgCard || '#fff',
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  maxHeight: 180,
                  overflow: 'auto',
                  boxShadow: t.shadow || '0 8px 24px rgba(0,0,0,0.12)',
                }}>
                  {catalogOpts.slice(0, 12).map((row) => (
                    <button
                      key={row.id || row.nombre}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => aplicarCatalogo(row)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        border: 'none', background: 'transparent', padding: '9px 10px',
                        cursor: 'pointer', color: t.text, fontSize: 'var(--cc-sm)',
                      }}
                    >
                      <strong>{row.nombre}</strong>
                      <span style={{ color: t.textMuted }}>
                        {row.cargo ? ` · ${row.cargo}` : ''}
                        {row.documento_numero ? ` · ${row.documento_tipo || 'CC'} ${row.documento_numero}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              className="cc-bitacora-colaborador-form__row"
              style={{ display: 'grid', gridTemplateColumns: viewportCompact ? '1fr' : '1fr 1.4fr', gap: 12 }}
            >
              <div>
                <label style={labelStyle}>Tipo de documento</label>
                <select
                  disabled={disabled}
                  value={form.documento_tipo || 'CC'}
                  onChange={(e) => patch({ documento_tipo: e.target.value })}
                  style={field}
                >
                  {DOCUMENTO_TIPOS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Número de documento</label>
                <input
                  disabled={disabled}
                  inputMode="numeric"
                  value={form.documento_numero}
                  placeholder="Solo números"
                  onChange={(e) => patch({ documento_numero: soloDigitosDocumento(e.target.value) })}
                  style={field}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Cargo</label>
              <input
                disabled={disabled}
                list="cc-bitacora-cargos-asist"
                value={form.cargo}
                placeholder="Buscar o escribir cargo…"
                onChange={(e) => patch({ cargo: e.target.value })}
                style={field}
              />
              <datalist id="cc-bitacora-cargos-asist">
                {cargosOpts.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label style={labelStyle}>Empresa (subcontratista)</label>
              <select
                disabled={disabled}
                value={form.subcontratista_id != null ? String(form.subcontratista_id) : ''}
                onChange={(e) => {
                  const id = e.target.value
                  const found = subs.find((s) => String(s.id) === id)
                  patch({
                    subcontratista_id: id ? Number(id) : null,
                    subcontratista_nombre: found?.nombre || found?.razon_social || '',
                  })
                }}
                style={field}
              >
                <option value="">— Sin empresa / contratista principal —</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre || s.razon_social || `#${s.id}`}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Estado</label>
              <select
                disabled={disabled}
                value={form.estado || 'activo'}
                onChange={(e) => onEstadoChange(e.target.value)}
                style={field}
              >
                {ESTADOS_COLABORADOR.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>

            <div
              className="cc-bitacora-colaborador-form__row"
              style={{ display: 'grid', gridTemplateColumns: viewportCompact ? '1fr' : '1fr 1fr', gap: 12 }}
            >
              <div>
                <label style={labelStyle}>Fecha de ingreso</label>
                <input
                  disabled={disabled}
                  type="date"
                  value={form.fecha_ingreso || ''}
                  onChange={(e) => patch({ fecha_ingreso: e.target.value })}
                  style={field}
                />
                <div style={hintStyle}>Dato histórico del colaborador en el contrato.</div>
              </div>
              <div>
                <label style={labelStyle}>Fecha de retiro</label>
                <input
                  disabled={disabled || !retiroEditable}
                  type="date"
                  value={form.fecha_retiro || ''}
                  onChange={(e) => patch({ fecha_retiro: e.target.value })}
                  style={retiroEditable && !disabled ? field : fieldDisabled}
                />
                <div style={hintStyle}>
                  {retiroEditable
                    ? 'Editable al marcar Inactivo (por defecto: fecha del diario).'
                    : 'Se habilita al marcar Estado «Inactivo».'}
                </div>
              </div>
            </div>

            <div
              className="cc-bitacora-colaborador-form__row"
              style={{ display: 'grid', gridTemplateColumns: viewportCompact ? '1fr' : '1fr 1fr', gap: 12 }}
            >
              <div>
                <label style={labelStyle}>Hora de ingreso</label>
                <input
                  disabled={disabled || sinJornada}
                  type="time"
                  value={sinJornada ? '' : (form.hora_ingreso || '')}
                  onChange={(e) => patch({ hora_ingreso: e.target.value })}
                  style={sinJornada || disabled ? fieldDisabled : field}
                />
              </div>
              <div>
                <label style={labelStyle}>Hora de salida</label>
                <input
                  disabled={disabled || sinJornada}
                  type="time"
                  value={sinJornada ? '' : (form.hora_salida || HORA_SALIDA_DEFAULT)}
                  onChange={(e) => patch({ hora_salida: e.target.value || HORA_SALIDA_DEFAULT })}
                  style={sinJornada || disabled ? fieldDisabled : field}
                />
              </div>
            </div>
            {sinJornada ? (
              <div style={{ ...hintStyle, marginTop: -6 }}>
                Sin jornada: estado {form.estado === 'incapacitado' ? 'Incapacitado' : 'Inactivo'}
                {' '}no registra horas ni cuenta en el resumen por cargo.
              </div>
            ) : null}

            <div>
              <label style={labelStyle}>Observación</label>
              <input
                disabled={disabled}
                value={form.observacion || ''}
                placeholder="Opcional"
                onChange={(e) => patch({ observacion: e.target.value })}
                style={field}
              />
            </div>
          </div>

          {error ? (
            <div style={{ marginTop: 12, color: '#B91C1C', fontSize: 'var(--cc-sm)', fontWeight: 650 }}>
              {error}
            </div>
          ) : null}

          {confirmNew ? (
            <div style={{
              marginTop: 14, padding: 12, borderRadius: 8,
              border: `1px solid ${t.border}`, background: t.bg || '#f8fafc',
            }}>
              <div style={{ fontSize: 'var(--cc-sm)', marginBottom: 10, color: t.text }}>
                «{confirmNew}» no está en el catálogo. ¿Registrar como nuevo colaborador?
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" disabled={busy} onClick={() => setConfirmNew(null)} style={btnGhost}>
                  Cancelar
                </button>
                <button type="button" disabled={busy} onClick={() => void guardar({ registrarNuevo: true })} style={btnPrimary}>
                  Sí, registrar
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {!confirmNew ? (
          <div
            className="cc-seguim-modal-footer"
            style={{
              flexShrink: 0,
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              padding: '12px 16px',
              borderTop: `1px solid ${t.border}`,
              background: t.bgCard || '#fff',
            }}
          >
            <button type="button" onClick={onClose} style={btnGhost}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void guardar()}
              style={btnPrimary}
            >
              {busy ? 'Guardando…' : 'Guardar en asistencia'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return modal
  return createPortal(modal, document.body)
}
