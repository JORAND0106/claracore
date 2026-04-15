import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'https://claracore-backend.azurewebsites.net'
const API_FALLBACK = 'https://claracore-backend.azurewebsites.net'

const FS = {
  small:  { base: 13, sub: 12, title: 20, section: 12 },
  normal: { base: 16, sub: 14, title: 24, section: 13 },
  large:  { base: 20, sub: 17, title: 30, section: 15 },
}

export default function ModuloInformes({ t, usuario, token, s, fontSize = 'normal' }) {
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
  const [descargando, setDescargando] = useState({})
  const [error,       setError]       = useState(null)

  const subSel   = subs.find(s => String(s.id) === subId)   || null
  const corteSel = cortes.find(c => String(c.id) === corteId) || null

  // ── Cargar subcontratistas ─────────────────────────────────────────────────
  useEffect(() => {
    if (!contratoId) return
    setCargandoSub(true); setError(null)
    fetchConFallback(`/informes/${contratoId}/subcontratistas`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setSubs(Array.isArray(d) ? d : []) })
      .catch(() => setError('Error cargando subcontratistas'))
      .finally(() => setCargandoSub(false))
  }, [contratoId])

  // ── Al cambiar subcontratista ──────────────────────────────────────────────
  function onSubChange(e) {
    const id = e.target.value
    setSubId(id); setCorteId(''); setCortes([]); setItems([]); setError(null)
    if (!id) return
    setCargandoCor(true)
    fetchConFallback(`/informes/${contratoId}/cortes/${id}`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setCortes(Array.isArray(d) ? d : []))
      .catch(() => setError('Error cargando cortes'))
      .finally(() => setCargandoCor(false))
  }

  // ── Al cambiar corte ───────────────────────────────────────────────────────
  function onCorteChange(e) {
    const id = e.target.value
    setCorteId(id); setItems([]); setError(null)
    if (!id) return
    setCargandoIt(true)
    fetchConFallback(`/informes/${contratoId}/items-corte/${id}`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => setError('Error cargando ítems'))
      .finally(() => setCargandoIt(false))
  }

  // ── Descarga ───────────────────────────────────────────────────────────────
  async function obtenerBlob(path, key) {
    setDescargando(p => ({ ...p, [key]: true })); setError(null)
    try {
      const r = await fetchConFallback(path, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${r.status} generando PDF`)
      }
      return await r.blob()
    } catch (e) {
      const msg = String(e?.message || '')
      if (msg.toLowerCase().includes('failed to fetch')) {
        setError(`No se pudo conectar al servidor de informes. Verifica red/CORS/API (${API} | ${API_FALLBACK}).`)
      } else {
        setError(msg || 'Error desconocido generando PDF')
      }
      return null
    }
    finally { setDescargando(p => ({ ...p, [key]: false })) }
  }

  async function verPDF(path, key) {
    const blob = await obtenerBlob(path, key)
    if (!blob) return
    const blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank')
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
  }

  async function descargarPDF(path, filename, key) {
    const blob = await obtenerBlob(path, key)
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename; a.click()
    URL.revokeObjectURL(a.href)
  }

  const fmtFecha = d => d
    ? new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })
    : '?'

  // ── Estilos ────────────────────────────────────────────────────────────────
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
  const btnPdf = (color, dis) => ({
    padding: '8px 16px', borderRadius: '7px', border: 'none',
    background: dis ? t.border : color, color: 'white',
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '8px' }}>

      {/* Título */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: f.title + 'px', fontWeight: '800', color: t.text }}>
          Informes
        </div>
        <div style={{ fontSize: f.sub + 'px', color: t.textMuted, marginTop: '2px' }}>
          Centro de formatos de control documental del subcontratista
        </div>
      </div>

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'8px',
                      padding:'10px 14px', color:'#dc2626', fontSize: f.sub + 'px', marginBottom:'14px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── CARD CORTE SUBCONTRATISTA ── */}
      <div style={card}>
        <div style={sectionTitle}>
          Formato activo: Corte Subcontratista
        </div>
        <div style={{ color: t.textMuted, fontSize: f.sub + 'px', marginBottom: '14px' }}>
          Plantilla alineada al formato institucional de informe y memorias para corte de subcontratista.
        </div>

        {/* Subcontratista */}
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

        {/* Corte */}
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

        {/* Botones de descarga */}
        {corteId && (
          <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* CC-SUB-001 */}
            <div style={itemRow}>
              <div>
                <div style={{ fontWeight: '700', color: t.text, fontSize: f.base + 'px' }}>
                  Informe de Corte
                </div>
                <div style={{ fontSize: f.sub + 'px', color: t.textMuted }}>
                  CC-SUB-001 · Resumen por item + subtotal + aprobaciones
                </div>
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
              <button
                style={btnPdf('#0077B6', descargando['corte'])}
                onClick={() => verPDF(
                  `/informes/${contratoId}/pdf/corte-subcontratista/${corteId}`,
                  'corte_prev'
                )}
                disabled={descargando['corte'] || descargando['corte_prev']}
              >
                {descargando['corte_prev'] ? '⏳...' : '👁 Vista Previa'}
              </button>
                  <button
                style={btnPdf('#005a8e', descargando['corte'])}
                onClick={() => descargarPDF(
                  `/informes/${contratoId}/pdf/corte-subcontratista/${corteId}`,
                  `CC-SUB-001_Corte${corteSel.consecutivo}.pdf`,
                  'corte'
                )}
                disabled={descargando['corte'] || descargando['corte_prev']}
              >
                {descargando['corte'] ? '⏳...' : '⬇ Descargar'}
              </button>
            </div>
            </div>

            {/* CC-SUB-002 — uno por ítem */}
            <div>
              <div style={{ fontSize: f.sub + 'px', fontWeight: '700', color: t.textMuted,
                            letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Memorias Corte Subcontratista (CC-SUB-002) — un PDF por item
              </div>
              {cargandoIt ? (
                <div style={{ color: t.textMuted, fontSize: f.sub + 'px' }}>Cargando ítems...</div>
              ) : items.length === 0 ? (
                <div style={{ color: t.textMuted, fontSize: f.sub + 'px' }}>
                  No hay registros aprobados por el subcontratista en este corte.
                </div>
              ) : (
                items.map(item => {
                  const key = `mem_${item.item_numero}`
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
                      <div style={{ display:'flex', gap:'8px' }}>
                      <button
                        style={btnPdf('#00A896', descargando[key+'_prev'])}
                        onClick={() => verPDF(
                          `/informes/${contratoId}/pdf/memoria-item/${corteId}?item_numero=${encodeURIComponent(item.item_numero)}`,
                          key+'_prev'
                        )}
                        disabled={descargando[key] || descargando[key+'_prev']}
                      >
                        {descargando[key+'_prev'] ? '⏳...' : '👁 Ver'}
                      </button>
                      <button
                        style={btnPdf('#007a6e', descargando[key])}
                        onClick={() => descargarPDF(
                          `/informes/${contratoId}/pdf/memoria-item/${corteId}?item_numero=${encodeURIComponent(item.item_numero)}`,
                          `CC-SUB-002_Corte${corteSel.consecutivo}_${(item.item_numero||'').replace('/','_')}.pdf`,
                          key
                        )}
                        disabled={descargando[key] || descargando[key+'_prev']}
                      >
                        {descargando[key] ? '⏳...' : '⬇ Descargar'}
                      </button>
                    </div>
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
    </div>
  )
}