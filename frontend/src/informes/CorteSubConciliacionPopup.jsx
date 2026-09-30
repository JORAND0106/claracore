import { useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { formatCOP } from '../utils/formatCOP'
import { UNIDADES_LISTADO_PRECIOS } from '../utils/unidadesListadoPrecios'
import { pathConFiltroSubAprobacion } from '../informesSubAprobacionFiltro'

const fmtMoney = (n) =>
  n == null || n === '' || (typeof n === 'number' && !Number.isFinite(n)) ? '—' : formatCOP(n)

const fmtPct = (p) => {
  if (p == null || p === '') return '—'
  const n = Number(p)
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? `${n}%` : `${n}%`
}

function emptyFila(orden = 0) {
  return {
    orden,
    descripcion: '',
    unidad: '',
    cantidad: '',
    valor_unitario: '',
    costo_total: 0,
    soporte_azure_path: null,
    soporte_nombre: null,
    soporte_mime: null,
    _acOpen: false,
  }
}

function costoFila(cant, vu) {
  const c = Number(cant)
  const v = Number(vu)
  if (!Number.isFinite(c) || !Number.isFinite(v)) return 0
  return Math.round(c * v)
}

/**
 * Popup de conciliación CC-SUB-001 (estructura tipo Excel).
 * props:
 *  - open, onClose
 *  - contratoId, corteId
 *  - filtroSubAprobacion ('todo' | 'aprobado') — mismo selector de Corte y filtro
 *  - fetchConFallback, getAuthToken
 *  - puedeEditarCcd
 *  - onEnviado → callback tras enviar (habilita vista previa)
 *  - onAbrirVistaPrevia, onDescargarConsolidado
 *  - t, fontSize
 */
export default function CorteSubConciliacionPopup({
  open,
  onClose,
  contratoId,
  corteId,
  filtroSubAprobacion = 'aprobado',
  fetchConFallback,
  getAuthToken,
  puedeEditarCcd = false,
  onEnviado,
  onAbrirVistaPrevia,
  onDescargarConsolidado,
  t = {},
  fontSize = 14,
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [filas, setFilas] = useState([emptyFila(0)])
  const [catalogo, setCatalogo] = useState([])
  const [uploadBusyIdx, setUploadBusyIdx] = useState(null)

  const bloqueado = !!data?.bloqueado
  const soloLectura = bloqueado && !puedeEditarCcd

  const pathConciliacion = useCallback(() => {
    return pathConFiltroSubAprobacion(
      `/informes/${encodeURIComponent(contratoId)}/corte-sub/${encodeURIComponent(corteId)}/conciliacion`,
      filtroSubAprobacion,
    )
  }, [contratoId, corteId, filtroSubAprobacion])

  const cargar = useCallback(async () => {
    if (!contratoId || !corteId) return
    const token = getAuthToken?.()
    if (!token) {
      setError('Sesión no autenticada.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await fetchConFallback(pathConciliacion(), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r?.ok) {
        const msg = r ? await r.text() : 'Sin respuesta'
        throw new Error(msg.slice(0, 300) || 'Error al cargar conciliación')
      }
      const j = await r.json()
      setData(j)
      const otros = Array.isArray(j.otros_conceptos) && j.otros_conceptos.length
        ? j.otros_conceptos.map((o, i) => ({
            orden: o.orden ?? i,
            descripcion: o.descripcion || '',
            unidad: o.unidad || '',
            cantidad: o.cantidad ?? '',
            valor_unitario: o.valor_unitario ?? '',
            costo_total: o.costo_total ?? costoFila(o.cantidad, o.valor_unitario),
            soporte_azure_path: o.soporte_azure_path || null,
            soporte_nombre: o.soporte_nombre || null,
            soporte_mime: o.soporte_mime || null,
            _acOpen: false,
          }))
        : [emptyFila(0)]
      setFilas(otros)

      const rc = await fetchConFallback(
        `/informes/${encodeURIComponent(contratoId)}/corte-sub/conceptos-catalogo`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (rc?.ok) {
        const jc = await rc.json()
        setCatalogo(Array.isArray(jc.descripciones) ? jc.descripciones : [])
      }
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [contratoId, corteId, fetchConFallback, getAuthToken, pathConciliacion])

  useEffect(() => {
    if (open) cargar()
  }, [open, cargar])

  const totalOtros = useMemo(
    () => filas.reduce((s, f) => s + costoFila(f.cantidad, f.valor_unitario), 0),
    [filas],
  )
  const subAmort = Number(
    data?.amortizacion?.subtotal_despues_amortizacion
      ?? data?.aiu?.costo_directo_mas_aiu
      ?? 0,
  )
  const granTotalLive = Math.round(subAmort + totalOtros)

  function patchFila(idx, patch) {
    setFilas((prev) =>
      prev.map((f, i) => {
        if (i !== idx) return f
        const next = { ...f, ...patch }
        next.costo_total = costoFila(next.cantidad, next.valor_unitario)
        return next
      }),
    )
  }

  async function buscarCatalogo(q) {
    const token = getAuthToken?.()
    if (!token || !contratoId) return
    try {
      const r = await fetchConFallback(
        `/informes/${encodeURIComponent(contratoId)}/corte-sub/conceptos-catalogo?q=${encodeURIComponent(q || '')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (r?.ok) {
        const j = await r.json()
        setCatalogo(Array.isArray(j.descripciones) ? j.descripciones : [])
      }
    } catch {
      /* noop */
    }
  }

  async function guardar({ enviar = false, reabrir = false } = {}) {
    const token = getAuthToken?.()
    if (!token) {
      setError('Sesión no autenticada.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        enviar: !!enviar,
        reabrir: !!reabrir,
        otros_conceptos: filas
          .filter((f) => String(f.descripcion || '').trim() || Number(f.cantidad) || Number(f.valor_unitario))
          .map((f, i) => ({
            orden: i,
            descripcion: String(f.descripcion || '').trim(),
            unidad: f.unidad || null,
            cantidad: Number(f.cantidad) || 0,
            valor_unitario: Number(f.valor_unitario) || 0,
            costo_total: costoFila(f.cantidad, f.valor_unitario),
            soporte_azure_path: f.soporte_azure_path || null,
            soporte_nombre: f.soporte_nombre || null,
            soporte_mime: f.soporte_mime || null,
          })),
      }
      const r = await fetchConFallback(pathConciliacion(), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!r?.ok) {
        let msg = 'No se pudo guardar'
        try {
          const j = await r.json()
          msg = j.detail || JSON.stringify(j)
        } catch {
          msg = (await r.text())?.slice(0, 300) || msg
        }
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      await cargar()
      if (enviar) onEnviado?.()
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  async function onUploadSoporte(idx, file) {
    if (!file || soloLectura || bloqueado) return
    const token = getAuthToken?.()
    if (!token) return
    const okTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (file.type && !okTypes.includes(file.type) && !/\.(pdf|jpe?g|png)$/i.test(file.name || '')) {
      setError('Solo se aceptan PDF, JPG, JPEG o PNG (no Office).')
      return
    }
    setUploadBusyIdx(idx)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const r = await fetchConFallback(
        `/informes/${encodeURIComponent(contratoId)}/corte-sub/${encodeURIComponent(corteId)}/otros-conceptos/soporte`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        },
      )
      if (!r?.ok) {
        const msg = (await r.text())?.slice(0, 240) || 'Error al subir'
        throw new Error(msg)
      }
      const j = await r.json()
      patchFila(idx, {
        soporte_azure_path: j.soporte_azure_path,
        soporte_nombre: j.soporte_nombre,
        soporte_mime: j.soporte_mime,
      })
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setUploadBusyIdx(null)
    }
  }

  if (!open) return null

  const lineas = data?.aiu_lineas || []
  const filtroLbl = filtroSubAprobacion === 'todo' ? 'Todo' : 'Aprobado'
  const sheet = {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: Math.max(11, fontSize - 2),
  }
  const th = {
    border: '1px solid #94a3b8',
    background: '#e2e8f0',
    padding: '4px 6px',
    textAlign: 'left',
    fontWeight: 700,
  }
  const td = {
    border: '1px solid #94a3b8',
    padding: '3px 6px',
    verticalAlign: 'middle',
  }
  const inp = {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 'inherit',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conciliación corte de subcontratista"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        style={{
          width: 'min(980px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '10px 14px 0',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <CcModalBrandHeader theme={t} />
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              Conciliación · Corte de subcontratista
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
              {bloqueado ? 'Enviado (bloqueado)' : 'Borrador — complete AIU y otros conceptos'}
              {' · '}Registros: {filtroLbl}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: '#64748b',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '12px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '8px 10px', borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}
          {loading && <div style={{ color: '#64748b' }}>Cargando conciliación…</div>}

          {!loading && data && (
            <>
              <section>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e3a8a' }}>1. Resumen del corte</h3>
                {(data.items_sin_precio || []).length > 0 && (
                  <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px 10px', borderRadius: 8, fontSize: 12, marginBottom: 8, fontWeight: 600 }}>
                    Ítems sin precio en el listado del subcontratista:{' '}
                    {(data.items_sin_precio || []).join(', ')}
                  </div>
                )}
                <table style={sheet}>
                  <tbody>
                    {lineas.map((ln) => {
                      const label =
                        ln.key === 'cd'
                          ? 'Costo Directo'
                          : ln.key === 'cd_aiu'
                            ? 'Costo Directo + AIU'
                            : `${ln.nombre} ${ln.abrev} (${fmtPct(ln.pct)})`
                      const strong = ln.key === 'cd_aiu'
                      return (
                        <tr key={ln.key} style={{ background: strong ? '#dbeafe' : undefined }}>
                          <td style={{ ...td, fontWeight: strong ? 700 : 500 }}>{label}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, width: 140 }}>
                            {fmtMoney(ln.valor)}
                          </td>
                        </tr>
                      )
                    })}
                    {(data.amortizacion_lineas || []).map((ln) => {
                      let label = ln.nombre
                      if (ln.key === 'amort_pres') {
                        label = ln.pct != null && ln.pct !== ''
                          ? `Amortización presente corte (${fmtPct(ln.pct)})`
                          : 'Amortización presente corte'
                      }
                      const strong = ln.key === 'sub_amort'
                      return (
                        <tr key={ln.key} style={{ background: strong ? '#fef3c7' : '#fffbeb' }}>
                          <td style={{ ...td, fontWeight: strong ? 700 : 500 }}>{label}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, width: 140 }}>
                            {fmtMoney(ln.valor)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>

              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14, color: '#1e3a8a' }}>2. Otros conceptos</h3>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Sin AIU ni IVA — solo costo total</span>
                  {!soloLectura && !bloqueado && (
                    <button
                      type="button"
                      onClick={() => setFilas((p) => [...p, emptyFila(p.length)])}
                      style={{
                        marginLeft: 'auto',
                        border: '1px solid #94a3b8',
                        background: '#f8fafc',
                        borderRadius: 6,
                        padding: '4px 10px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      + Fila
                    </button>
                  )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={sheet}>
                    <thead>
                      <tr>
                        <th style={{ ...th, minWidth: 200 }}>Descripción</th>
                        <th style={{ ...th, width: 90 }}>Und</th>
                        <th style={{ ...th, width: 90 }}>Cantidad</th>
                        <th style={{ ...th, width: 110 }}>V. unitario</th>
                        <th style={{ ...th, width: 110 }}>Costo total</th>
                        <th style={{ ...th, width: 120 }}>Soporte</th>
                        <th style={{ ...th, width: 40 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f, idx) => {
                        const sugerencias = (catalogo || []).filter(
                          (d) =>
                            !f.descripcion ||
                            String(d).toLowerCase().includes(String(f.descripcion).toLowerCase()),
                        ).slice(0, 8)
                        return (
                          <tr key={idx}>
                            <td style={{ ...td, position: 'relative' }}>
                              <input
                                style={inp}
                                disabled={soloLectura || bloqueado}
                                value={f.descripcion}
                                placeholder="Buscar o escribir…"
                                onChange={(e) => {
                                  patchFila(idx, { descripcion: e.target.value, _acOpen: true })
                                  buscarCatalogo(e.target.value)
                                }}
                                onFocus={() => {
                                  patchFila(idx, { _acOpen: true })
                                  buscarCatalogo(f.descripcion)
                                }}
                                onBlur={() => setTimeout(() => patchFila(idx, { _acOpen: false }), 150)}
                              />
                              {f._acOpen && sugerencias.length > 0 && !(soloLectura || bloqueado) && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    top: '100%',
                                    zIndex: 5,
                                    background: '#fff',
                                    border: '1px solid #94a3b8',
                                    borderRadius: 6,
                                    maxHeight: 140,
                                    overflow: 'auto',
                                    boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                                  }}
                                >
                                  {sugerencias.map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'left',
                                        border: 'none',
                                        background: 'transparent',
                                        padding: '6px 8px',
                                        cursor: 'pointer',
                                      }}
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        patchFila(idx, { descripcion: s, _acOpen: false })
                                      }}
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td style={td}>
                              <select
                                style={inp}
                                disabled={soloLectura || bloqueado}
                                value={f.unidad || ''}
                                onChange={(e) => patchFila(idx, { unidad: e.target.value })}
                              >
                                <option value="">—</option>
                                {UNIDADES_LISTADO_PRECIOS.map((u) => (
                                  <option key={u} value={u}>{u}</option>
                                ))}
                              </select>
                            </td>
                            <td style={td}>
                              <input
                                style={{ ...inp, textAlign: 'right' }}
                                type="number"
                                step="any"
                                disabled={soloLectura || bloqueado}
                                value={f.cantidad}
                                onChange={(e) => patchFila(idx, { cantidad: e.target.value })}
                              />
                            </td>
                            <td style={td}>
                              <input
                                style={{ ...inp, textAlign: 'right' }}
                                type="number"
                                step="any"
                                disabled={soloLectura || bloqueado}
                                value={f.valor_unitario}
                                onChange={(e) => patchFila(idx, { valor_unitario: e.target.value })}
                              />
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                              {fmtMoney(costoFila(f.cantidad, f.valor_unitario))}
                            </td>
                            <td style={td}>
                              {f.soporte_nombre ? (
                                <span style={{ fontSize: 11, color: '#166534' }} title={f.soporte_nombre}>
                                  ✓ {String(f.soporte_nombre).slice(0, 18)}
                                </span>
                              ) : (
                                <label
                                  style={{
                                    cursor: soloLectura || bloqueado ? 'not-allowed' : 'pointer',
                                    color: '#1d4ed8',
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  {uploadBusyIdx === idx ? '…' : '📎'}
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                    style={{ display: 'none' }}
                                    disabled={soloLectura || bloqueado || uploadBusyIdx != null}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      e.target.value = ''
                                      if (file) onUploadSoporte(idx, file)
                                    }}
                                  />
                                </label>
                              )}
                            </td>
                            <td style={td}>
                              {!(soloLectura || bloqueado) && filas.length > 1 && (
                                <button
                                  type="button"
                                  title="Eliminar fila"
                                  onClick={() => setFilas((p) => p.filter((_, i) => i !== idx))}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#b91c1c',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <table style={sheet}>
                  <tbody>
                    <tr style={{ background: '#1e40af', color: '#fff' }}>
                      <td style={{ ...td, fontWeight: 800, borderColor: '#1e3a8a' }}>3. Gran total</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, width: 160, borderColor: '#1e3a8a' }}>
                        {fmtMoney(bloqueado ? data.gran_total : granTotalLive)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                {bloqueado && (
                  <>
                    <button
                      type="button"
                      onClick={() => onAbrirVistaPrevia?.()}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #94a3b8',
                        background: '#fff',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Vista previa
                    </button>
                    <button
                      type="button"
                      onClick={() => onDescargarConsolidado?.()}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #1e40af',
                        background: '#eff6ff',
                        color: '#1e3a8a',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Descarga consolidada
                    </button>
                    {puedeEditarCcd && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => guardar({ reabrir: true })}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: '1px solid #b45309',
                          background: '#fffbeb',
                          color: '#92400e',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Reabrir
                      </button>
                    )}
                  </>
                )}
                {!bloqueado && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => guardar({ enviar: false })}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #94a3b8',
                        background: '#f8fafc',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Guardar borrador
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => guardar({ enviar: true })}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#1e40af',
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 800,
                      }}
                    >
                      {saving ? 'Enviando…' : 'Enviar'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
