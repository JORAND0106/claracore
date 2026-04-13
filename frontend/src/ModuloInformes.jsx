import { useState, useEffect } from 'react'

const API = 'https://claracore-backend.azurewebsites.net'

const FS = {
  small:  { base: 11, sub: 10, title: 17, section: 10 },
  normal: { base: 13, sub: 11, title: 20, section: 11 },
  large:  { base: 15, sub: 13, title: 23, section: 12 },
}

export default function ModuloInformes({ t, usuario, token, s, fontSize = 'normal' }) {
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
    fetch(`${API}/informes/${contratoId}/subcontratistas`,
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
    fetch(`${API}/informes/${contratoId}/cortes/${id}`,
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
    fetch(`${API}/informes/${contratoId}/items-corte/${id}`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => setError('Error cargando ítems'))
      .finally(() => setCargandoIt(false))
  }

  // ── Descarga ───────────────────────────────────────────────────────────────
  async function obtenerBlob(url, key) {
    setDescargando(p => ({ ...p, [key]: true })); setError(null)
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${r.status} generando PDF`)
      }
      return await r.blob()
    } catch (e) { setError(e.message); return null }
    finally { setDescargando(p => ({ ...p, [key]: false })) }
  }

  async function verPDF(url, key) {
    const blob = await obtenerBlob(url, key)
    if (!blob) return
    const blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank')
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
  }

  async function descargarPDF(url, filename, key) {
    const blob = await obtenerBlob(url, key)
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
    background: t.card, borderRadius: '10px',
    border: `1px solid ${t.border}`, padding: '18px 20px', marginBottom: '14px'
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
    marginTop: '10px', padding: '8px 12px', borderRadius: '6px',
    background: t.primary + '11', border: `1px solid ${t.primary}33`,
    fontSize: f.sub + 'px', color: t.textMuted,
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px'
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
    gap: '10px', padding: '8px 12px', borderRadius: '6px',
    border: `1px solid ${t.border}`, marginBottom: '6px', background: t.bg
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '8px' }}>

      {/* Título */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: f.title + 'px', fontWeight: '800', color: t.text }}>
          📄 Informes
        </div>
        <div style={{ fontSize: f.sub + 'px', color: t.textMuted, marginTop: '2px' }}>
          Generación de memorias y soportes documentales · Sistema de Gestión de Calidad
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
        <div style={{ fontSize: f.base + 'px', fontWeight: '800', color: t.text, marginBottom: '16px' }}>
          📋 Corte Subcontratista
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
                  Corte Subcontratista
                </div>
                <div style={{ fontSize: f.sub + 'px', color: t.textMuted }}>
                  CC-SUB-001 · Resumen de cantidades por ítem + firmas
                </div>
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
              <button
                style={btnPdf('#0077B6', descargando['corte'])}
                onClick={() => verPDF(
                  `${API}/informes/${contratoId}/pdf/corte-subcontratista/${corteId}`,
                  'corte_prev'
                )}
                disabled={descargando['corte'] || descargando['corte_prev']}
              >
                {descargando['corte_prev'] ? '⏳...' : '👁 Vista Previa'}
              </button>
              <button
                style={btnPdf('#005a8e', descargando['corte'])}
                onClick={() => descargarPDF(
                  `${API}/informes/${contratoId}/pdf/corte-subcontratista/${corteId}`,
                  `CC-SUB-001_Corte${corteSel.consecutivo}.pdf`,
                  'corte'
                )}
                disabled={descargando['corte'] || descargando['corte_prev']}
              >
                {descargando['corte'] ? '⏳...' : '⬇️'}
              </button>
            </div>
            </div>

            {/* CC-SUB-002 — uno por ítem */}
            <div>
              <div style={{ fontSize: f.sub + 'px', fontWeight: '700', color: t.textMuted,
                            letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Memorias Corte Subcontratista (CC-SUB-002) — Un PDF por ítem
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
                          `${API}/informes/${contratoId}/pdf/memoria-item/${corteId}?item_numero=${encodeURIComponent(item.item_numero)}`,
                          key+'_prev'
                        )}
                        disabled={descargando[key] || descargando[key+'_prev']}
                      >
                        {descargando[key+'_prev'] ? '⏳...' : '👁 Ver'}
                      </button>
                      <button
                        style={btnPdf('#007a6e', descargando[key])}
                        onClick={() => descargarPDF(
                          `${API}/informes/${contratoId}/pdf/memoria-item/${corteId}?item_numero=${encodeURIComponent(item.item_numero)}`,
                          `CC-SUB-002_Corte${corteSel.consecutivo}_${(item.item_numero||'').replace('/','_')}.pdf`,
                          key
                        )}
                        disabled={descargando[key] || descargando[key+'_prev']}
                      >
                        {descargando[key] ? '⏳...' : '⬇️'}
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
    </div>
  )
}