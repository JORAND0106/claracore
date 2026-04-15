import { useState, useEffect } from 'react'

const API_RAW = import.meta.env.VITE_API_URL || 'https://claracore-backend.azurewebsites.net'
const ES_LOCAL = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const API = ES_LOCAL ? '' : API_RAW
const API_FALLBACK = 'https://claracore-backend.azurewebsites.net'

const FS = {
  small:  { base: 13, sub: 12, title: 20, section: 12 },
  normal: { base: 16, sub: 14, title: 24, section: 13 },
  large:  { base: 20, sub: 17, title: 30, section: 15 },
}

function fmtMoney(n) {
  if (n == null || n === '') return '—'
  const x = Number(n)
  if (Number.isNaN(x)) return String(n)
  return `$ ${x.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

function fmtQty(n) {
  if (n == null || n === '') return '—'
  const x = Number(n)
  if (Number.isNaN(x)) return String(n)
  return x.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

function fmtFechaIso(d) {
  if (!d) return '—'
  try {
    const s = String(d).slice(0, 10)
    return new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(d)
  }
}

export default function ModuloInformes({ t, usuario, token, s, fontSize = 'normal' }) {
  const getAuthToken = () =>
    token ||
    localStorage.getItem('cc_token') ||
    sessionStorage.getItem('cc_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('token') ||
    sessionStorage.getItem('access_token') ||
    ''

  const toPath = (pathOrUrl) => {
    if (!pathOrUrl) return ''
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      try {
        const u = new URL(pathOrUrl)
        return `${u.pathname}${u.search || ''}`
      } catch {
        return pathOrUrl
      }
    }
    return pathOrUrl
  }

  async function fetchConFallback(pathOrUrl, options = {}) {
    const path = toPath(pathOrUrl)
    const principal = path.startsWith('http') ? path : `${API}${path}`
    try {
      return await fetch(principal, options)
    } catch (e) {
      const esErrorRed = e instanceof TypeError || String(e?.message || '').toLowerCase().includes('failed to fetch')
      if (!esErrorRed || API === API_FALLBACK) throw e
      const alterna = path.startsWith('http') ? path.replace(API, API_FALLBACK) : `${API_FALLBACK}${path}`
      return await fetch(alterna, options)
    }
  }

  async function leerErrorRespuesta(r) {
    const raw = await r.text()
    try {
      const err = JSON.parse(raw)
      let detail = err.detail
      if (Array.isArray(detail)) {
        detail = detail.map((x) => (typeof x === 'object' && x != null ? (x.msg || JSON.stringify(x)) : String(x))).join(' ')
      } else if (detail != null && typeof detail === 'object') {
        detail = JSON.stringify(detail)
      }
      return detail || raw.trim().slice(0, 600) || `HTTP ${r.status}`
    } catch {
      return raw.trim().slice(0, 900) || `HTTP ${r.status}`
    }
  }

  const f          = FS[fontSize] || FS.normal
  const contratoId = usuario?.contrato_id

  const [subs,        setSubs]        = useState([])
  const [subId,       setSubId]       = useState('')
  const [cortes,      setCortes]      = useState([])
  const [corteId,     setCorteId]     = useState('')
  const [items,       setItems]       = useState([])
  const [cargandoSub, setCargandoSub] = useState(false)
  const [cargandoCor, setCargandoCor] = useState(false)
  const [cargandoIt,  setCargandoIt]  = useState(false)
  const [error,       setError]       = useState(null)

  /** Vista previa solo en plataforma (JSON → modal). Sin PDF ni descarga. */
  const [vistaPrevia, setVistaPrevia] = useState(null)
  // null | { fase:'cargando', tipo } | { fase:'ok', tipo, datos } | { fase:'error', tipo, mensaje }

  const subSel   = subs.find(s => String(s.id) === subId)   || null
  const corteSel = cortes.find(c => String(c.id) === corteId) || null

  useEffect(() => {
    if (!contratoId) return
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada. Ingresa de nuevo para generar informes.')
      return
    }
    setCargandoSub(true); setError(null)
    fetchConFallback(`/informes/${contratoId}/subcontratistas`,
      { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => { setSubs(Array.isArray(d) ? d : []) })
      .catch(() => setError('Error cargando subcontratistas'))
      .finally(() => setCargandoSub(false))
  }, [contratoId])

  function onSubChange(e) {
    const id = e.target.value
    setSubId(id); setCorteId(''); setCortes([]); setItems([]); setError(null)
    if (!id) return
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada. Ingresa de nuevo para generar informes.')
      return
    }
    setCargandoCor(true)
    fetchConFallback(`/informes/${contratoId}/cortes/${id}`,
      { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => setCortes(Array.isArray(d) ? d : []))
      .catch(() => setError('Error cargando cortes'))
      .finally(() => setCargandoCor(false))
  }

  function onCorteChange(e) {
    const id = e.target.value
    setCorteId(id); setItems([]); setError(null)
    if (!id) return
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada. Ingresa de nuevo para generar informes.')
      return
    }
    setCargandoIt(true)
    fetchConFallback(`/informes/${contratoId}/items-corte/${id}`,
      { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => setError('Error cargando ítems'))
      .finally(() => setCargandoIt(false))
  }

  async function abrirVistaPreviaCorte() {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    setVistaPrevia({ fase: 'cargando', tipo: 'corte' })
    setError(null)
    try {
      const r = await fetchConFallback(
        `/informes/${contratoId}/datos/corte-subcontratista/${corteId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (!r.ok) {
        const msg = await leerErrorRespuesta(r)
        setVistaPrevia({ fase: 'error', tipo: 'corte', mensaje: msg })
        return
      }
      const datos = await r.json()
      setVistaPrevia({ fase: 'ok', tipo: 'corte', datos })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'corte', mensaje: msg })
    }
  }

  async function abrirVistaPreviaMemoria(itemNumero) {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    setVistaPrevia({ fase: 'cargando', tipo: 'memoria', itemNumero })
    setError(null)
    try {
      const q = encodeURIComponent(itemNumero)
      const r = await fetchConFallback(
        `/informes/${contratoId}/datos/memoria-item/${corteId}?item_numero=${q}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (!r.ok) {
        const msg = await leerErrorRespuesta(r)
        setVistaPrevia({ fase: 'error', tipo: 'memoria', mensaje: msg, itemNumero })
        return
      }
      const datos = await r.json()
      setVistaPrevia({ fase: 'ok', tipo: 'memoria', datos, itemNumero })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'memoria', mensaje: msg, itemNumero })
    }
  }

  const fmtFecha = d => d
    ? new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })
    : '?'

  const card = {
    background: t.card, borderRadius: '12px',
    border: `1px solid ${t.border}`, padding: '20px', marginBottom: '14px',
    boxShadow: `0 10px 24px ${t.border}33`
  }
  const sectionTitle = {
    fontSize: f.base + 'px', fontWeight: '800', color: t.text, marginBottom: '14px'
  }
  const label = {
    display: 'block', fontSize: f.sub + 'px', fontWeight: '700',
    color: t.textMuted, letterSpacing: '0.8px', textTransform: 'uppercase',
    marginBottom: '8px'
  }
  const select = {
    width: '100%', padding: '9px 12px', borderRadius: '7px',
    border: `1px solid ${t.border}`, background: t.bg,
    color: t.text, fontSize: f.base + 'px', outline: 'none',
    cursor: 'pointer'
  }
  const infoBox = {
    marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
    background: t.primary + '11', border: `1px solid ${t.primary}33`,
    fontSize: f.sub + 'px', color: t.textMuted,
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '4px 10px'
  }
  const btnVer = (dis) => ({
    padding: '8px 16px', borderRadius: '7px', border: 'none',
    background: dis ? t.border : t.primary, color: 'white',
    fontWeight: '700', fontSize: f.sub + 'px',
    cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.6 : 1,
    whiteSpace: 'nowrap', flexShrink: 0
  })
  const itemRow = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '10px', padding: '10px 12px', borderRadius: '8px',
    border: `1px solid ${t.border}`, marginBottom: '8px', background: t.bg
  }
  const roadmapCard = {
    border: `1px dashed ${t.border}`,
    borderRadius: '10px',
    padding: '12px',
    background: t.bg
  }

  const th = {
    textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${t.border}`,
    fontSize: f.sub + 'px', color: t.textMuted, fontWeight: '700'
  }
  const td = {
    padding: '8px 10px', borderBottom: `1px solid ${t.border}44`,
    fontSize: f.sub + 'px', color: t.text, verticalAlign: 'top'
  }

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '8px' }}>

      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: f.title + 'px', fontWeight: '800', color: t.text }}>
          Informes
        </div>
        <div style={{ fontSize: f.sub + 'px', color: t.textMuted, marginTop: '2px' }}>
          Memorias de soporte: vista previa dentro de la plataforma (sin descarga de PDF).
        </div>
      </div>

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'8px',
                      padding:'10px 14px', color:'#dc2626', fontSize: f.sub + 'px', marginBottom:'14px' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={card}>
        <div style={sectionTitle}>
          Formato activo: Corte Subcontratista
        </div>
        <div style={{ color: t.textMuted, fontSize: f.sub + 'px', marginBottom: '14px' }}>
          Usa «Vista previa» para revisar el contenido aquí. No se genera ni descarga PDF desde esta pantalla.
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={label}>Subcontratista</label>
          <select
            style={select}
            value={subId}
            onChange={onSubChange}
            disabled={cargandoSub}
          >
            <option value=''>
              {cargandoSub ? 'Cargando...' : subs.length === 0 ? 'Sin subcontratistas' : '— Selecciona —'}
            </option>
            {subs.map(s => (
              <option key={s.id} value={s.id}>{s.razon_social}</option>
            ))}
          </select>
          {subSel && (
            <div style={infoBox}>
              <span><b>NIT:</b> {subSel.nit || '—'}</span>
              <span><b>Contacto:</b> {subSel.nombre_contacto || '—'}</span>
              <span><b>Tel:</b> {subSel.telefono || '—'}</span>
            </div>
          )}
        </div>

        {subId && (
          <div style={{ marginBottom: '14px' }}>
            <label style={label}>Corte</label>
            <select
              style={select}
              value={corteId}
              onChange={onCorteChange}
              disabled={cargandoCor}
            >
              <option value=''>
                {cargandoCor ? 'Cargando cortes...' : cortes.length === 0 ? 'Sin cortes registrados' : '— Selecciona el corte —'}
              </option>
              {cortes.map(c => (
                <option key={c.id} value={c.id}>
                  Corte N° {c.consecutivo} · {fmtFecha(c.fecha_inicio)} → {fmtFecha(c.fecha_fin)} · {(c.tipo_periodo || '').toUpperCase()}
                </option>
              ))}
            </select>
            {corteSel && (
              <div style={infoBox}>
                <span><b>Período:</b> {fmtFecha(corteSel.fecha_inicio)} → {fmtFecha(corteSel.fecha_fin)}</span>
                <span><b>Tipo:</b> {(corteSel.tipo_periodo || '').toUpperCase()}</span>
                <span><b>Corte N°:</b> {corteSel.consecutivo}</span>
              </div>
            )}
          </div>
        )}

        {corteId && (
          <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            <div style={itemRow}>
              <div>
                <div style={{ fontWeight: '700', color: t.text, fontSize: f.base + 'px' }}>
                  Informe de Corte (CC-SUB-001)
                </div>
                <div style={{ fontSize: f.sub + 'px', color: t.textMuted }}>
                  Resumen por ítem, subtotal y datos de contrato / subcontratista
                </div>
              </div>
              <button
                type="button"
                style={btnVer(vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte')}
                onClick={abrirVistaPreviaCorte}
                disabled={vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte'}
              >
                {vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte' ? '⏳ Cargando…' : '📋 Vista previa'}
              </button>
            </div>

            <div>
              <div style={{ fontSize: f.sub + 'px', fontWeight: '700', color: t.textMuted,
                            letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Memorias por ítem (CC-SUB-002)
              </div>
              {cargandoIt ? (
                <div style={{ color: t.textMuted, fontSize: f.sub + 'px' }}>Cargando ítems...</div>
              ) : items.length === 0 ? (
                <div style={{ color: t.textMuted, fontSize: f.sub + 'px' }}>
                  No hay registros aprobados por el subcontratista en este corte.
                </div>
              ) : (
                items.map(item => {
                  const busy = vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'memoria' && vistaPrevia?.itemNumero === item.item_numero
                  return (
                    <div key={item.item_numero} style={itemRow}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: '700', color: t.primary, fontSize: f.base + 'px' }}>
                          {item.item_numero}
                        </span>
                        <span style={{ color: t.text, fontSize: f.base + 'px', marginLeft: '8px' }}>
                          {item.item_descripcion}
                        </span>
                        <span style={{ color: t.textMuted, fontSize: f.sub + 'px', marginLeft: '6px' }}>
                          [{item.unidad}]
                        </span>
                      </div>
                      <button
                        type="button"
                        style={btnVer(busy)}
                        onClick={() => abrirVistaPreviaMemoria(item.item_numero)}
                        disabled={busy}
                      >
                        {busy ? '⏳…' : '📋 Vista previa'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={sectionTitle}>Formatos siguientes (planeados)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
          <div style={roadmapCard}>
            <div style={{ fontWeight: 700, color: t.text, marginBottom: '4px' }}>Preacta semanal + memorias semanales</div>
            <div style={{ fontSize: f.sub + 'px', color: t.textMuted }}>Estado: pendiente de implementacion visual y flujo.</div>
          </div>
          <div style={roadmapCard}>
            <div style={{ fontWeight: 700, color: t.text, marginBottom: '4px' }}>Preacta mensual</div>
            <div style={{ fontSize: f.sub + 'px', color: t.textMuted }}>Estado: pendiente de estructura documental.</div>
          </div>
          <div style={roadmapCard}>
            <div style={{ fontWeight: 700, color: t.text, marginBottom: '4px' }}>Memorias mensuales Entidad</div>
            <div style={{ fontSize: f.sub + 'px', color: t.textMuted }}>Estado: pendiente de layout de detalle y evidencias.</div>
          </div>
          <div style={roadmapCard}>
            <div style={{ fontWeight: 700, color: t.text, marginBottom: '4px' }}>Informe de gerencia</div>
            <div style={{ fontSize: f.sub + 'px', color: t.textMuted }}>Estado: pendiente de definicion de indicadores.</div>
          </div>
        </div>
      </div>

      {/* Modal vista previa (solo HTML en app; no PDF) */}
      {vistaPrevia && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}
          onClick={() => setVistaPrevia(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '960px', maxHeight: '90vh', overflow: 'auto',
              background: t.card, color: t.text,
              borderRadius: '14px', border: `1px solid ${t.border}`,
              boxShadow: '0 24px 48px rgba(0,0,0,0.25)', padding: '20px 22px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: f.title - 2 + 'px', fontWeight: '800' }}>
                  {vistaPrevia.tipo === 'corte' ? 'Vista previa · CC-SUB-001' : `Vista previa · CC-SUB-002 · ${vistaPrevia.itemNumero || ''}`}
                </div>
                <div style={{ fontSize: f.sub + 'px', color: t.textMuted, marginTop: '4px' }}>
                  Solo consulta en plataforma. No hay archivo PDF ni botón de descarga.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVistaPrevia(null)}
                style={{
                  flexShrink: 0, padding: '8px 14px', borderRadius: '8px', border: `1px solid ${t.border}`,
                  background: t.bg, color: t.text, fontWeight: '700', cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>

            {vistaPrevia.fase === 'cargando' && (
              <div style={{ padding: '32px', textAlign: 'center', color: t.textMuted }}>Cargando datos…</div>
            )}

            {vistaPrevia.fase === 'error' && (
              <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: f.sub + 'px' }}>
                {vistaPrevia.mensaje}
              </div>
            )}

            {vistaPrevia.fase === 'ok' && vistaPrevia.tipo === 'corte' && vistaPrevia.datos && (
              <div style={{ fontSize: f.sub + 'px' }}>
                {(() => {
                  const d = vistaPrevia.datos
                  const c = d.contrato || {}
                  const su = d.sub || {}
                  const co = d.corte || {}
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                        <div><span style={{ color: t.textMuted }}>Contrato</span><br /><b>{c.numero || '—'}</b></div>
                        <div><span style={{ color: t.textMuted }}>Contratista</span><br />{c.contratista || '—'}</div>
                        <div><span style={{ color: t.textMuted }}>Interventoría</span><br />{c.interventoria || '—'}</div>
                        <div><span style={{ color: t.textMuted }}>Subcontratista</span><br /><b>{(su.razon_social || '').toUpperCase()}</b></div>
                        <div><span style={{ color: t.textMuted }}>NIT sub</span><br />{su.nit || '—'}</div>
                        <div><span style={{ color: t.textMuted }}>Corte N°</span><br /><b>{co.consecutivo ?? '—'}</b></div>
                        <div><span style={{ color: t.textMuted }}>Período</span><br />
                          {fmtFechaIso(co.fecha_inicio)} → {fmtFechaIso(co.fecha_fin)}
                        </div>
                      </div>
                      <div style={{ marginBottom: '12px', color: t.textMuted }}>
                        Generado en sesión: <b style={{ color: t.text }}>{d.usuario_nombre}</b> · {d.usuario_cargo || '—'}
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={th}>Ítem</th>
                              <th style={th}>Und</th>
                              <th style={{ ...th, textAlign: 'right' }}>Cantidad</th>
                              <th style={{ ...th, textAlign: 'right' }}>Vlr unit.</th>
                              <th style={{ ...th, textAlign: 'right' }}>Costo dir.</th>
                              <th style={th}>Descripción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(d.items || []).map((row, i) => (
                              <tr key={i}>
                                <td style={td}>{row.item_numero}</td>
                                <td style={td}>{row.unidad}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmtQty(row.cantidad)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(row.vlr_unitario_sub)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(row.costo_directo)}</td>
                                <td style={td}>{row.item_descripcion}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: '14px', textAlign: 'right', fontWeight: '800', fontSize: f.base + 'px' }}>
                        Subtotal: {fmtMoney(d.total_costo)}
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

            {vistaPrevia.fase === 'ok' && vistaPrevia.tipo === 'memoria' && vistaPrevia.datos && (
              <div style={{ fontSize: f.sub + 'px' }}>
                {(() => {
                  const d = vistaPrevia.datos
                  const c = d.contrato || {}
                  const su = d.sub || {}
                  const co = d.corte || {}
                  const ii = d.item_info || {}
                  const regs = d.registros || []
                  return (
                    <>
                      <div style={{ marginBottom: '12px' }}>
                        <b style={{ fontSize: f.base + 'px', color: t.primary }}>{ii.item_numero}</b>
                        <span style={{ marginLeft: '8px' }}>{ii.item_descripcion}</span>
                        <span style={{ color: t.textMuted, marginLeft: '8px' }}>[{ii.unidad}]</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                        <div><span style={{ color: t.textMuted }}>Contrato</span><br />{c.numero || '—'}</div>
                        <div><span style={{ color: t.textMuted }}>Subcontratista</span><br />{su.razon_social || '—'}</div>
                        <div><span style={{ color: t.textMuted }}>Corte</span><br />{co.consecutivo ?? '—'}</div>
                        <div><span style={{ color: t.textMuted }}>Período</span><br />{fmtFechaIso(co.fecha_inicio)} → {fmtFechaIso(co.fecha_fin)}</div>
                      </div>
                      <div style={{ marginBottom: '12px', color: t.textMuted }}>
                        Sesión: <b style={{ color: t.text }}>{d.usuario_nombre}</b> · {d.usuario_cargo || '—'}
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: f.sub - 1 + 'px' }}>
                          <thead>
                            <tr>
                              <th style={th}>N°</th>
                              <th style={th}>Abs ini</th>
                              <th style={th}>Abs fin</th>
                              <th style={th}>PK</th>
                              <th style={th}>Calzada</th>
                              <th style={{ ...th, textAlign: 'right' }}>L</th>
                              <th style={{ ...th, textAlign: 'right' }}>A</th>
                              <th style={{ ...th, textAlign: 'right' }}>E</th>
                              <th style={{ ...th, textAlign: 'right' }}>Cant</th>
                              <th style={th}>Obs.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {regs.map((r, i) => (
                              <tr key={i}>
                                <td style={td}>{r.numero_registro ?? '—'}</td>
                                <td style={td}>{r.abs_inicio ?? '—'}</td>
                                <td style={td}>{r.abs_final ?? '—'}</td>
                                <td style={td}>{(r.pk_ids && r.pk_ids.pk_id) != null ? r.pk_ids.pk_id : '—'}</td>
                                <td style={td}>{r.calzada ?? '—'}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmtQty(r.longitud)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmtQty(r.ancho)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmtQty(r.espesor)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmtQty(r.cantidad ?? r.cantidad_total)}</td>
                                <td style={td}>{r.observacion || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
