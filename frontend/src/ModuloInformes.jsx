import { useState, useEffect } from 'react'

const API_FALLBACK = 'https://claracore-backend.azurewebsites.net'
/** En `npm run dev`, URL vacía → las peticiones van a 127.0.0.1:5173 y Vite reenvía `/informes` al :8000 (vite.config.js).
 *  Evita "Failed to fetch" por CORS o bloqueos al llamar directo a :8000 desde el navegador.
 *  En build de producción se usa VITE_API_URL. */
const API = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || API_FALLBACK)

const FS = {
  small:  { base: 13, sub: 12, title: 20, section: 12 },
  normal: { base: 16, sub: 14, title: 24, section: 13 },
  large:  { base: 20, sub: 17, title: 30, section: 15 },
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
    const pref = r.status >= 400 ? `[${r.status} ${r.statusText || ''}] `.trim() + ' ' : ''
    try {
      const err = JSON.parse(raw)
      let detail = err.detail
      if (Array.isArray(detail)) {
        detail = detail.map((x) => (typeof x === 'object' && x != null ? (x.msg || JSON.stringify(x)) : String(x))).join(' ')
      } else if (detail != null && typeof detail === 'object') {
        detail = JSON.stringify(detail)
      }
      const body = detail || raw.trim().slice(0, 600)
      return (pref + (body || `HTTP ${r.status}`)).trim()
    } catch {
      const body = raw.trim().slice(0, 900)
      return (pref + (body || `HTTP ${r.status}`)).trim()
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
  /** Biblioteca CCD por contrato (formatos + config de firmas + slots). */
  const [biblioCcd, setBiblioCcd] = useState([])
  const [firmantesCcd, setFirmantesCcd] = useState([])
  const [cfgFirmaCc001, setCfgFirmaCc001] = useState({
    elaboro_nombre: '',
    elaboro_cargo: '',
    reviso_nombre: '',
    reviso_cargo: '',
  })
  const [guardandoFirmaCcd, setGuardandoFirmaCcd] = useState(false)
  /** Por código de formato: panel abierto/cerrado (persistido en localStorage por contrato). */
  const [ccdExpanded, setCcdExpanded] = useState(() => ({}))

  /** Vista previa: PDF en modal (blob). */
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

  const ccdExpandedStorageKey = contratoId != null ? `ccd_biblio_expanded_${contratoId}` : null

  useEffect(() => {
    if (!ccdExpandedStorageKey) {
      setCcdExpanded({})
      return
    }
    try {
      const raw = localStorage.getItem(ccdExpandedStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setCcdExpanded(parsed)
        }
      }
    } catch {
      /* noop */
    }
  }, [ccdExpandedStorageKey])

  function toggleCcdFormato(codigo) {
    if (!ccdExpandedStorageKey) return
    setCcdExpanded((prev) => {
      const next = { ...prev, [codigo]: !prev[codigo] }
      try {
        localStorage.setItem(ccdExpandedStorageKey, JSON.stringify(next))
      } catch {
        /* noop */
      }
      return next
    })
  }

  useEffect(() => {
    if (!contratoId) {
      setBiblioCcd([])
      setFirmantesCcd([])
      return
    }
    const authToken = getAuthToken()
    if (!authToken) return
    Promise.all([
      fetchConFallback(`/informes/${contratoId}/ccd/biblioteca`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : [])),
      fetchConFallback(`/informes/${contratoId}/ccd/firmantes-candidatos`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([bib, cand]) => {
        setBiblioCcd(Array.isArray(bib) ? bib : [])
        setFirmantesCcd(Array.isArray(cand) ? cand : [])
        const cc = (Array.isArray(bib) ? bib : []).find((x) => x.codigo === 'CC-SUB-001')
        const cf = cc?.config_firma
        if (cf && typeof cf === 'object') {
          setCfgFirmaCc001((prev) => ({
            ...prev,
            elaboro_nombre: cf.elaboro_nombre ?? '',
            elaboro_cargo: cf.elaboro_cargo ?? '',
            reviso_nombre: cf.reviso_nombre ?? '',
            reviso_cargo: cf.reviso_cargo ?? '',
          }))
        }
      })
      .catch(() => {
        setBiblioCcd([])
        setFirmantesCcd([])
      })
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

  function cerrarVistaPrevia() {
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return null
    })
  }

  /** Vista previa = mismo PDF que genera el servidor (la ruta JSON fallaba en algunos entornos). */
  async function abrirVistaPreviaCorte() {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !corteId) {
      setVistaPrevia({ fase: 'error', tipo: 'corte', mensaje: 'Selecciona contrato y corte.' })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'corte' }
    })
    setError(null)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const cor = encodeURIComponent(corteId)
    const pathPdf = `/informes/${cid}/pdf/corte-subcontratista/${cor}`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'corte', mensaje: msg })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'corte-pdf', pdfUrl })
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
    if (contratoId == null || contratoId === '' || !corteId) {
      setVistaPrevia({ fase: 'error', tipo: 'memoria', mensaje: 'Selecciona contrato y corte.', itemNumero })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'memoria', itemNumero }
    })
    setError(null)
    const q = encodeURIComponent(itemNumero)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const cor = encodeURIComponent(corteId)
    const pathPdf = `/informes/${cid}/pdf/memoria-item/${cor}?item_numero=${q}`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'memoria', mensaje: msg, itemNumero })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'memoria-pdf', pdfUrl, itemNumero })
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

  function aplicarFirmante(campo, usuarioId) {
    const u = firmantesCcd.find((x) => String(x.id) === String(usuarioId))
    if (!u) {
      if (campo === 'elaboro') {
        setCfgFirmaCc001((p) => ({ ...p, elaboro_nombre: '', elaboro_cargo: '' }))
      } else {
        setCfgFirmaCc001((p) => ({ ...p, reviso_nombre: '', reviso_cargo: '' }))
      }
      return
    }
    if (campo === 'elaboro') {
      setCfgFirmaCc001((p) => ({ ...p, elaboro_nombre: u.nombre_completo, elaboro_cargo: u.cargo }))
    } else {
      setCfgFirmaCc001((p) => ({ ...p, reviso_nombre: u.nombre_completo, reviso_cargo: u.cargo }))
    }
  }

  async function guardarCfgFirmaCc001() {
    const authToken = getAuthToken()
    if (!authToken || !contratoId) return
    setGuardandoFirmaCcd(true)
    setError(null)
    try {
      const r = await fetchConFallback(`/informes/${contratoId}/ccd/config-firma/CC-SUB-001`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cfgFirmaCc001),
      })
      if (!r.ok) {
        const msg = await leerErrorRespuesta(r)
        setError(msg)
        return
      }
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setGuardandoFirmaCcd(false)
    }
  }

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '8px' }}>

      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: f.title + 'px', fontWeight: '800', color: t.text }}>
          Informes
        </div>
        <div style={{ fontSize: f.sub + 'px', color: t.textMuted, marginTop: '2px' }}>
          Vista previa del mismo PDF que genera el servidor (informe de corte y memorias por ítem).
        </div>
        {biblioCcd.length > 0 && (
          <div
            style={{
              marginTop: '12px',
              padding: '12px 14px',
              borderRadius: '8px',
              border: `1px solid ${t.border}`,
              background: t.bg,
              fontSize: f.sub + 'px',
              color: t.textMuted,
            }}
          >
            <div style={{ fontWeight: '700', color: t.text, marginBottom: '10px' }}>Biblioteca de formatos (CCD)</div>
            <div style={{ fontSize: Math.max(11, f.sub - 1) + 'px', color: t.textMuted, marginBottom: '10px' }}>
              Pulsa un formato para ver u ocultar slots y opciones; el estado abierto/cerrado se recuerda en este navegador.
            </div>
            {biblioCcd.map((fmt) => {
              const abierto = !!ccdExpanded[fmt.codigo]
              return (
              <div
                key={fmt.codigo}
                style={{
                  marginBottom: '10px',
                  borderRadius: '8px',
                  border: `1px solid ${t.border}`,
                  overflow: 'hidden',
                  background: t.card,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleCcdFormato(fmt.codigo)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '10px 12px',
                    border: 'none',
                    background: t.bg,
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                >
                  <span>
                    <span style={{ color: t.primary, fontWeight: '800' }}>{fmt.codigo}</span>
                    {fmt.titulo ? ` — ${fmt.titulo}` : ''}
                  </span>
                  <span style={{ color: t.textMuted, fontSize: '14px', flexShrink: 0 }} aria-hidden>
                    {abierto ? '▼' : '▶'}
                  </span>
                </button>
                {abierto && (
                <div style={{ padding: '12px', borderTop: `1px solid ${t.border}` }}>
                {(fmt.slots_firma || []).length > 0 && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: '10px',
                      alignItems: 'start',
                    }}
                  >
                    {(fmt.slots_firma || []).map((slot) => (
                      <div
                        key={slot.id}
                        style={{
                          border: `1px solid ${t.border}`,
                          borderRadius: '8px',
                          padding: '8px 10px',
                          background: t.bg,
                        }}
                      >
                        <div style={{ fontWeight: '800', color: t.text, fontSize: Math.max(11, f.sub - 1) + 'px', marginBottom: '6px' }}>
                          {slot.label}
                        </div>
                        {slot.origen === 'configuracion' && fmt.codigo === 'CC-SUB-001' && (
                          <>
                            {slot.id === 'elaboro' && (
                              <>
                                <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Usuario / cargo (catálogo del contrato)</label>
                                <select
                                  style={{ ...select, fontSize: '13px', marginBottom: '6px' }}
                                  value=""
                                  onChange={(e) => aplicarFirmante('elaboro', e.target.value)}
                                >
                                  <option value="">— Elegir —</option>
                                  {firmantesCcd.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.nombre_completo} ({u.cargo})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  placeholder="Nombre (editable)"
                                  value={cfgFirmaCc001.elaboro_nombre}
                                  onChange={(e) => setCfgFirmaCc001((p) => ({ ...p, elaboro_nombre: e.target.value }))}
                                  style={{ ...select, marginBottom: '6px', fontSize: '13px' }}
                                />
                                <input
                                  placeholder="Cargo"
                                  value={cfgFirmaCc001.elaboro_cargo}
                                  onChange={(e) => setCfgFirmaCc001((p) => ({ ...p, elaboro_cargo: e.target.value }))}
                                  style={{ ...select, fontSize: '13px' }}
                                />
                              </>
                            )}
                            {slot.id === 'reviso' && (
                              <>
                                <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Usuario / cargo (catálogo del contrato)</label>
                                <select
                                  style={{ ...select, fontSize: '13px', marginBottom: '6px' }}
                                  value=""
                                  onChange={(e) => aplicarFirmante('reviso', e.target.value)}
                                >
                                  <option value="">— Elegir —</option>
                                  {firmantesCcd.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.nombre_completo} ({u.cargo})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  placeholder="Nombre (editable)"
                                  value={cfgFirmaCc001.reviso_nombre}
                                  onChange={(e) => setCfgFirmaCc001((p) => ({ ...p, reviso_nombre: e.target.value }))}
                                  style={{ ...select, marginBottom: '6px', fontSize: '13px' }}
                                />
                                <input
                                  placeholder="Cargo"
                                  value={cfgFirmaCc001.reviso_cargo}
                                  onChange={(e) => setCfgFirmaCc001((p) => ({ ...p, reviso_cargo: e.target.value }))}
                                  style={{ ...select, fontSize: '13px' }}
                                />
                              </>
                            )}
                          </>
                        )}
                        {slot.origen === 'subcontratista' && (
                          <div style={{ fontSize: '12px', lineHeight: 1.45 }}>
                            <div style={{ color: t.textMuted, marginBottom: '4px' }}>
                              Automático según el subcontratista elegido abajo en el informe:
                            </div>
                            <div>
                              <b style={{ color: t.text }}>Empresa:</b> {subSel?.razon_social || '—'}
                            </div>
                            <div>
                              <b style={{ color: t.text }}>Representante:</b> {subSel?.nombre_contacto || '—'}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {fmt.codigo === 'CC-SUB-001' && (
                  <button
                    type="button"
                    onClick={guardarCfgFirmaCc001}
                    disabled={guardandoFirmaCcd}
                    style={{
                      marginTop: '10px',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: t.primary,
                      color: '#fff',
                      fontWeight: '700',
                      cursor: guardandoFirmaCcd ? 'not-allowed' : 'pointer',
                      opacity: guardandoFirmaCcd ? 0.7 : 1,
                    }}
                  >
                    {guardandoFirmaCcd ? 'Guardando…' : 'Guardar firmas (Elaboró / Revisó)'}
                  </button>
                )}
                </div>
                )}
              </div>
            )})}
            <div style={{ fontSize: Math.max(11, f.sub - 1) + 'px', marginTop: '4px' }}>
              Las plantillas PDF están en código; la asignación de formatos por contrato podrá filtrarse más adelante.
            </div>
          </div>
        )}
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
          «Vista previa» abre el PDF en una ventana dentro de la página (mismo documento que imprimirías o guardarías).
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

      {/* Modal: vista previa = PDF embebido (misma ruta que descarga el backend).
          Fondos opacos fijos: en producción t.card/t.bg pueden ser transparentes y el modal se mezcla con la página. */}
      {vistaPrevia && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
          }}
          onClick={cerrarVistaPrevia}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '960px',
              height: 'min(92vh, 880px)',
              maxHeight: '92vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '12px',
                flexShrink: 0,
              }}
            >
              <div>
                <div style={{ fontSize: f.title - 2 + 'px', fontWeight: '800', color: '#0f172a' }}>
                  {(vistaPrevia.tipo === 'corte' || vistaPrevia.tipo === 'corte-pdf')
                    ? 'Vista previa · CC-SUB-001 (PDF)'
                    : `Vista previa · CC-SUB-002 (PDF) · ${vistaPrevia.itemNumero || ''}`}
                </div>
                <div style={{ fontSize: f.sub + 'px', color: '#64748b', marginTop: '4px' }}>
                  Mismo formato PDF que genera el sistema. Puedes usar el menú del visor del navegador para imprimir o guardar.
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarVistaPrevia}
                style={{
                  flexShrink: 0,
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  color: '#0f172a',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                Cerrar
              </button>
            </div>

            {vistaPrevia.fase === 'cargando' && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                Generando vista previa PDF…
              </div>
            )}

            {vistaPrevia.fase === 'error' && (
              <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: f.sub + 'px' }}>
                {vistaPrevia.mensaje}
              </div>
            )}

            {vistaPrevia.fase === 'ok' && vistaPrevia.pdfUrl && (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: '#e2e8f0',
                }}
              >
                <iframe
                  title="Vista previa PDF"
                  src={vistaPrevia.pdfUrl}
                  style={{
                    width: '100%',
                    flex: 1,
                    minHeight: 'min(72vh, 640px)',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
