
import { useState, useEffect } from 'react'

const API = 'https://claracore-backend.azurewebsites.net'

export default function ModuloInformes({ t, usuario, token, s }) {
  const contratoId = usuario?.contrato_id

  const [subs,         setSubs]         = useState([])
  const [subSel,       setSubSel]       = useState(null)
  const [cortes,       setCortes]       = useState([])
  const [corteSel,     setCorteSel]     = useState(null)
  const [items,        setItems]        = useState([])
  const [cargando,     setCargando]     = useState(false)
  const [descargando,  setDescargando]  = useState({})   // { key: true/false }
  const [error,        setError]        = useState(null)

  // ── Cargar subcontratistas al montar ──────────────────────────────────────
  useEffect(() => {
    if (!contratoId) return
    setCargando(true)
    fetch(`${API}/informes/${contratoId}/subcontratistas`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => { setSubs(Array.isArray(d) ? d : []); setCargando(false) })
      .catch(() => { setError('Error cargando subcontratistas'); setCargando(false) })
  }, [contratoId])

  // ── Al seleccionar subcontratista ─────────────────────────────────────────
  function seleccionarSub(sub) {
    setSubSel(sub)
    setCorteSel(null)
    setItems([])
    setError(null)
    setCargando(true)
    fetch(`${API}/informes/${contratoId}/cortes/${sub.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => { setCortes(Array.isArray(d) ? d : []); setCargando(false) })
      .catch(() => { setError('Error cargando cortes'); setCargando(false) })
  }

  // ── Al seleccionar corte ──────────────────────────────────────────────────
  function seleccionarCorte(corte) {
    setCorteSel(corte)
    setItems([])
    setError(null)
    setCargando(true)
    fetch(`${API}/informes/${contratoId}/items-corte/${corte.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setCargando(false) })
      .catch(() => { setError('Error cargando ítems'); setCargando(false) })
  }

  // ── Descarga genérica ─────────────────────────────────────────────────────
  async function descargar(url, filename, key) {
    setDescargando(p => ({ ...p, [key]: true }))
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) throw new Error('Error generando PDF')
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setError(e.message)
    } finally {
      setDescargando(p => ({ ...p, [key]: false }))
    }
  }

  function descargarCorte() {
    const url = `${API}/informes/${contratoId}/pdf/corte-subcontratista/${corteSel.id}`
    const fn  = `CC-SUB-001_Corte${corteSel.consecutivo}_${(subSel.razon_social||'').slice(0,15)}.pdf`
    descargar(url, fn, 'corte')
  }

  function descargarMemoria(item) {
    const url = `${API}/informes/${contratoId}/pdf/memoria-item/${corteSel.id}?item_numero=${encodeURIComponent(item.item_numero)}`
    const fn  = `CC-SUB-002_Corte${corteSel.consecutivo}_${(item.item_numero||'').replace('/','_')}.pdf`
    descargar(url, fn, `mem_${item.item_numero}`)
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const card = {
    background: t.card, borderRadius: '10px', border: `1px solid ${t.border}`,
    padding: '16px', marginBottom: '16px'
  }
  const sectionTitle = {
    fontSize: '11px', fontWeight: '700', color: t.textMuted,
    letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px'
  }
  const badge = (activo) => ({
    display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
    fontSize: '11px', fontWeight: '700',
    background: activo ? t.primary + '22' : t.border,
    color: activo ? t.primary : t.textMuted,
    cursor: 'pointer', border: `1px solid ${activo ? t.primary : 'transparent'}`,
    marginRight: '6px', marginBottom: '6px'
  })
  const btnPdf = (color, disabled) => ({
    padding: '7px 14px', borderRadius: '6px', border: 'none',
    background: disabled ? t.border : color, color: 'white',
    fontWeight: '700', fontSize: '12px', cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px', opacity: disabled ? 0.6 : 1
  })
  const itemRow = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 12px', borderRadius: '6px',
    border: `1px solid ${t.border}`, marginBottom: '6px',
    background: t.bg
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '8px' }}>

      {/* Título módulo */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: t.text }}>📄 Informes</div>
        <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '2px' }}>
          Generación de memorias y soportes documentales
        </div>
      </div>

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'8px',
                      padding:'10px 14px', color:'#dc2626', fontSize:'13px', marginBottom:'14px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* PASO 1 — Subcontratista */}
      <div style={card}>
        <div style={sectionTitle}>1 · Selecciona el Subcontratista</div>
        {cargando && !subSel ? (
          <div style={{ color: t.textMuted, fontSize: '12px' }}>Cargando...</div>
        ) : subs.length === 0 ? (
          <div style={{ color: t.textMuted, fontSize: '12px' }}>No hay subcontratistas activos en este contrato.</div>
        ) : (
          <div>
            {subs.map(sub => (
              <span key={sub.id} style={badge(subSel?.id === sub.id)} onClick={() => seleccionarSub(sub)}>
                🏢 {sub.razon_social}
              </span>
            ))}
          </div>
        )}
        {subSel && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: t.textMuted }}>
            NIT: {subSel.nit || '—'} &nbsp;|&nbsp; Contacto: {subSel.nombre_contacto || '—'}
          </div>
        )}
      </div>

      {/* PASO 2 — Corte */}
      {subSel && (
        <div style={card}>
          <div style={sectionTitle}>2 · Selecciona el Corte</div>
          {cargando && !corteSel ? (
            <div style={{ color: t.textMuted, fontSize: '12px' }}>Cargando...</div>
          ) : cortes.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: '12px' }}>No hay cortes registrados para este subcontratista.</div>
          ) : (
            <div>
              {cortes.map(c => (
                <span key={c.id} style={badge(corteSel?.id === c.id)} onClick={() => seleccionarCorte(c)}>
                  Corte N° {c.consecutivo} &nbsp;·&nbsp;
                  {c.fecha_inicio ? new Date(c.fecha_inicio+'T12:00:00').toLocaleDateString('es-CO') : '?'} →&nbsp;
                  {c.fecha_fin    ? new Date(c.fecha_fin+'T12:00:00').toLocaleDateString('es-CO')    : '?'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PASO 3 — Formatos */}
      {corteSel && (
        <div style={card}>
          <div style={sectionTitle}>3 · Formatos Disponibles</div>

          {/* CC-SUB-001 */}
          <div style={{ ...itemRow, marginBottom: '12px', border: `1px solid ${t.primary}44` }}>
            <div>
              <div style={{ fontWeight: '700', color: t.text, fontSize: '13px' }}>
                📋 Corte Subcontratista
              </div>
              <div style={{ fontSize: '11px', color: t.textMuted, marginTop: '2px' }}>
                CC-SUB-001 &nbsp;·&nbsp; Resumen por ítem con firmas
              </div>
            </div>
            <button
              style={btnPdf('#0077B6', descargando['corte'])}
              onClick={descargarCorte}
              disabled={descargando['corte']}
            >
              {descargando['corte'] ? '⏳ Generando...' : '⬇️ Descargar PDF'}
            </button>
          </div>

          {/* CC-SUB-002 — Memorias por ítem */}
          <div style={{ marginTop: '10px' }}>
            <div style={{ ...sectionTitle, marginBottom: '8px' }}>
              📐 Memorias Corte Subcontratista (CC-SUB-002) — Un PDF por ítem
            </div>
            {cargando ? (
              <div style={{ color: t.textMuted, fontSize: '12px' }}>Cargando ítems...</div>
            ) : items.length === 0 ? (
              <div style={{ color: t.textMuted, fontSize: '12px' }}>
                No hay registros aprobados por el subcontratista en este corte.
              </div>
            ) : (
              items.map(item => {
                const key = `mem_${item.item_numero}`
                return (
                  <div key={item.item_numero} style={itemRow}>
                    <div>
                      <span style={{ fontWeight: '700', color: t.primary, fontSize: '12px' }}>
                        {item.item_numero}
                      </span>
                      <span style={{ color: t.text, fontSize: '12px', marginLeft: '8px' }}>
                        {item.item_descripcion}
                      </span>
                      <span style={{ color: t.textMuted, fontSize: '11px', marginLeft: '6px' }}>
                        [{item.unidad}]
                      </span>
                    </div>
                    <button
                      style={btnPdf('#00A896', descargando[key])}
                      onClick={() => descargarMemoria(item)}
                      disabled={descargando[key]}
                    >
                      {descargando[key] ? '⏳ Generando...' : '⬇️ Memoria PDF'}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}