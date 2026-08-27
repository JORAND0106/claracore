import { useEffect, useMemo, useState } from 'react'
import {
  DOCUMENTO_TIPOS,
  ESTADOS_COLABORADOR,
  HORA_SALIDA_DEFAULT,
  capitalizarNombrePropio,
  emptyAsistenciaRow,
  soloDigitosDocumento,
} from './personalAsistenciaHelpers'
import {
  seguimientoModalOverlayStyle,
  seguimientoModalSheetStyle,
} from './seguimientoShared'

/**
 * Popup de registro/edición de colaborador en asistencia diaria.
 */
export default function ColaboradorAsistenciaModal({
  t,
  api,
  initial = null,
  catalogHint = null,
  disabled = false,
  onClose,
  onSave,
}) {
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
      origen: 'catalogo',
    })
    setNombreOpen(false)
    setConfirmNew(null)
  }

  const exactMatch = useMemo(() => {
    const needle = capitalizarNombrePropio(form.nombre).toLowerCase()
    if (!needle) return null
    return catalogOpts.find((r) => capitalizarNombrePropio(r.nombre).toLowerCase() === needle) || null
  }, [catalogOpts, form.nombre])

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

    const payload = emptyAsistenciaRow({
      ...form,
      nombre,
      documento_numero: doc,
      hora_salida: form.hora_salida || HORA_SALIDA_DEFAULT,
    })

    // Si el nombre no está en catálogo y aún no confirmó registro nuevo.
    if (!payload.colaborador_id && !exactMatch && !registrarNuevo && !initial?.colaborador_id) {
      setConfirmNew(nombre)
      return
    }

    setBusy(true)
    try {
      if (registrarNuevo || (!payload.colaborador_id && !exactMatch)) {
        const row = await api.upsertBitacoraColaborador({
          nombre: payload.nombre,
          documento_tipo: payload.documento_tipo,
          documento_numero: payload.documento_numero,
          cargo: payload.cargo,
          subcontratista_id: payload.subcontratista_id,
          subcontratista_nombre: payload.subcontratista_nombre,
        })
        if (row?.id) payload.colaborador_id = row.id
        if (row?.nombre) payload.nombre = row.nombre
      } else if (exactMatch && !payload.colaborador_id) {
        payload.colaborador_id = exactMatch.id
      }

      // Registrar cargo nuevo en catálogo de cargos si no está.
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
    background: t.bg || t.inputBg || '#fff',
    color: t.text,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    fontFamily: 'inherit',
  }
  const label = {
    display: 'block',
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    color: t.textMuted,
    marginBottom: 4,
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={seguimientoModalOverlayStyle(false)}
      onClick={onClose}
    >
      <div
        style={{
          ...seguimientoModalSheetStyle(false, { wide: false, zIndex: 12000 }),
          maxWidth: 520,
          width: 'min(520px, 96vw)',
          maxHeight: '92vh',
          overflow: 'auto',
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: t.primary || t.text, fontSize: 'var(--cc-body)' }}>
            {initial?.nombre ? 'Editar colaborador' : 'Registrar colaborador'}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: t.textMuted }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <label style={label}>Nombre y apellido</label>
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
                position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%',
                background: t.bgCard || '#fff', border: `1px solid ${t.border}`,
                borderRadius: 8, maxHeight: 180, overflow: 'auto', boxShadow: t.shadow,
              }}>
                {catalogOpts.slice(0, 12).map((row) => (
                  <button
                    key={row.id || row.nombre}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => aplicarCatalogo(row)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      border: 'none', background: 'transparent', padding: '8px 10px',
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
            <div>
              <label style={label}>Tipo de documento</label>
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
              <label style={label}>Número de documento</label>
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
            <label style={label}>Cargo</label>
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
            <label style={label}>Empresa (subcontratista)</label>
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
            <label style={label}>Estado</label>
            <select
              disabled={disabled}
              value={form.estado || 'activo'}
              onChange={(e) => patch({ estado: e.target.value })}
              style={field}
            >
              {ESTADOS_COLABORADOR.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={label}>Hora de ingreso</label>
              <input
                disabled={disabled}
                type="time"
                value={form.hora_ingreso || ''}
                onChange={(e) => patch({ hora_ingreso: e.target.value })}
                style={field}
              />
            </div>
            <div>
              <label style={label}>Hora de salida</label>
              <input
                disabled={disabled}
                type="time"
                value={form.hora_salida || HORA_SALIDA_DEFAULT}
                onChange={(e) => patch({ hora_salida: e.target.value || HORA_SALIDA_DEFAULT })}
                style={field}
              />
            </div>
          </div>

          <div>
            <label style={label}>Observación</label>
            <input
              disabled={disabled}
              value={form.observacion || ''}
              placeholder="Opcional"
              onChange={(e) => patch({ observacion: e.target.value })}
              style={field}
            />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 10, color: '#B91C1C', fontSize: 'var(--cc-sm)', fontWeight: 650 }}>
            {error}
          </div>
        )}

        {confirmNew && (
          <div style={{
            marginTop: 12, padding: 10, borderRadius: 8,
            border: `1px solid ${t.border}`, background: t.bg || '#f8fafc',
          }}>
            <div style={{ fontSize: 'var(--cc-sm)', marginBottom: 8, color: t.text }}>
              «{confirmNew}» no está en el catálogo. ¿Registrar como nuevo colaborador?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" disabled={busy} onClick={() => setConfirmNew(null)} style={{
                border: `1px solid ${t.border}`, background: t.bgCard || '#fff', borderRadius: 8,
                padding: '6px 10px', cursor: 'pointer', fontWeight: 700,
              }}>
                Cancelar
              </button>
              <button type="button" disabled={busy} onClick={() => void guardar({ registrarNuevo: true })} style={{
                border: 'none', background: t.primary, color: '#fff', borderRadius: 8,
                padding: '6px 12px', cursor: 'pointer', fontWeight: 700,
              }}>
                Sí, registrar
              </button>
            </div>
          </div>
        )}

        {!confirmNew && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" onClick={onClose} style={{
              border: `1px solid ${t.border}`, background: t.bgCard || '#fff', borderRadius: 8,
              padding: '8px 12px', cursor: 'pointer', fontWeight: 700, color: t.text,
            }}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void guardar()}
              style={{
                border: 'none', background: t.primary, color: '#fff', borderRadius: 8,
                padding: '8px 14px', cursor: busy ? 'wait' : 'pointer', fontWeight: 700,
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Guardando…' : 'Guardar en asistencia'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
