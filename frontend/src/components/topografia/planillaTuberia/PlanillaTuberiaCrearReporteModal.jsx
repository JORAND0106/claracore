/**
 * Popup: Crear reporte SICOE Obra desde planilla de tubería.
 * Solo pide lo no derivado: Subcontratista, Inspector, Capítulo, Nodo ini/fin (editable).
 */
import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../../../apiBase'

export default function PlanillaTuberiaCrearReporteModal({
  open,
  onClose,
  onCreated,
  contratoId,
  token,
  planilla,
  absInicioDefault,
  absFinalDefault,
  lineasPreview = [],
  apiCrear,
  ui,
}) {
  const [subs, setSubs] = useState([])
  const [insps, setInsps] = useState([])
  const [caps, setCaps] = useState([])
  const [subId, setSubId] = useState('')
  const [inspId, setInspId] = useState('')
  const [capitulo, setCapitulo] = useState('')
  const [nodoIni, setNodoIni] = useState('')
  const [nodoFin, setNodoFin] = useState('')
  const [absIni, setAbsIni] = useState('')
  const [absFin, setAbsFin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [qSub, setQSub] = useState('')
  const [qInsp, setQInsp] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    setSubId('')
    setInspId('')
    setCapitulo('')
    setQSub('')
    setQInsp('')
    const a0 = absInicioDefault != null ? String(absInicioDefault) : ''
    const a1 = absFinalDefault != null ? String(absFinalDefault) : ''
    setAbsIni(a0)
    setAbsFin(a1)
    setNodoIni(a0)
    setNodoFin(a1)
  }, [open, absInicioDefault, absFinalDefault, planilla?.id])

  useEffect(() => {
    if (!open || !contratoId || !token) return
    const hdrs = { Authorization: `Bearer ${token}` }
    let cancelled = false
    ;(async () => {
      try {
        const [s, i, c] = await Promise.all([
          fetch(`${API_BASE}/sicoe-obra/${contratoId}/subcontratistas-activos`, { headers: hdrs }).then((r) => r.json()),
          fetch(`${API_BASE}/sicoe-obra/${contratoId}/inspectores`, { headers: hdrs }).then((r) => r.json()),
          fetch(`${API_BASE}/sicoe-obra/${contratoId}/filtros/capitulos`, { headers: hdrs }).then((r) => r.json()),
        ])
        if (cancelled) return
        setSubs(Array.isArray(s) ? s : [])
        setInsps(Array.isArray(i) ? i : [])
        const capList = Array.isArray(c)
          ? c.map((x) => (typeof x === 'string' ? x : (x?.capitulo || x?.nombre || ''))).filter(Boolean)
          : []
        setCaps(capList)
      } catch (e) {
        if (!cancelled) setErr(e.message || 'No se pudieron cargar catálogos SICOE')
      }
    })()
    return () => { cancelled = true }
  }, [open, contratoId, token])

  const subsF = useMemo(() => {
    const q = qSub.trim().toLowerCase()
    if (!q) return subs
    return subs.filter((s) => String(s.nombre || '').toLowerCase().includes(q))
  }, [subs, qSub])

  const inspsF = useMemo(() => {
    const q = qInsp.trim().toLowerCase()
    if (!q) return insps
    return insps.filter((s) => String(s.nombre || '').toLowerCase().includes(q))
  }, [insps, qInsp])

  if (!open) return null

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${ui?.border || '#cbd5e1'}`,
    background: ui?.inputBg || '#fff',
    color: ui?.text || '#0f172a',
    fontSize: 'var(--cc-sm)',
    boxSizing: 'border-box',
  }
  const labelStyle = {
    display: 'block',
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    color: ui?.textMuted || '#64748b',
    marginBottom: 4,
  }

  const crear = async () => {
    if (!subId) { setErr('Seleccione subcontratista'); return }
    if (!inspId) { setErr('Seleccione inspector'); return }
    if (!String(capitulo || '').trim()) { setErr('Seleccione capítulo'); return }
    setBusy(true); setErr('')
    try {
      const numOrNull = (v) => {
        if (v === '' || v == null) return null
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      const res = await apiCrear({
        subcontratista_id: Number(subId),
        inspector_id: Number(inspId),
        capitulo: String(capitulo).trim(),
        nodo_ini: nodoIni.trim() || null,
        nodo_fin: nodoFin.trim() || null,
        abs_inicio: numOrNull(absIni),
        abs_final: numOrNull(absFin),
      })
      onCreated?.(res)
      onClose?.()
    } catch (e) {
      setErr(e.message || 'No se pudo crear el reporte')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crear reporte SICOE Obra"
      style={{
        position: 'fixed', inset: 0, zIndex: 12000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: ui?.cardBg || '#fff',
          borderRadius: 12,
          border: `1px solid ${ui?.border || '#e2e8f0'}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          padding: 16,
          color: ui?.text || '#0f172a',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)' }}>Crear reporte SICOE Obra</div>
            <div style={{ fontSize: 'var(--cc-xs)', color: ui?.textMuted || '#64748b', marginTop: 2 }}>
              Nombre: <b>{planilla?.nombre || '—'}</b>
              {planilla?.pk_id ? <> · PK {planilla.pk_id}</> : null}
              {planilla?.costado ? <> · {planilla.costado}</> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: ui?.textMuted }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Subcontratista *</label>
            <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="Buscar…" value={qSub} onChange={(e) => setQSub(e.target.value)} />
            <select style={inputStyle} value={subId} onChange={(e) => setSubId(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {subsF.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Inspector *</label>
            <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="Buscar…" value={qInsp} onChange={(e) => setQInsp(e.target.value)} />
            <select style={inputStyle} value={inspId} onChange={(e) => setInspId(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {inspsF.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Capítulo *</label>
            <select style={inputStyle} value={capitulo} onChange={(e) => setCapitulo(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {caps.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Nodo inicio (abscisa)</label>
              <input style={inputStyle} value={nodoIni} onChange={(e) => setNodoIni(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Nodo fin (abscisa)</label>
              <input style={inputStyle} value={nodoFin} onChange={(e) => setNodoFin(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Abs. inicio</label>
              <input style={inputStyle} type="number" step="any" value={absIni} onChange={(e) => setAbsIni(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Abs. final</label>
              <input style={inputStyle} type="number" step="any" value={absFin} onChange={(e) => setAbsFin(e.target.value)} />
            </div>
          </div>

          {lineasPreview.length > 0 && (
            <div style={{
              border: `1px solid ${ui?.border || '#e2e8f0'}`,
              borderRadius: 8,
              padding: 8,
              fontSize: 'var(--cc-xs)',
              maxHeight: 140,
              overflow: 'auto',
              background: ui?.inputBg || '#f8fafc',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                Se generarán {lineasPreview.length} registro(s) en «Sin Asignar Ítem»:
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {lineasPreview.slice(0, 12).map((l, i) => (
                  <li key={`${l.codigo}-${i}`}>{l.nombre} — {l.cantidad} {l.unidad || ''}</li>
                ))}
                {lineasPreview.length > 12 && <li>… y {lineasPreview.length - 12} más</li>}
              </ul>
            </div>
          )}

          {err && (
            <div style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: 8, padding: 8, fontSize: 'var(--cc-sm)' }}>
              {err}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" disabled={busy} onClick={onClose} style={{
              padding: '8px 14px', borderRadius: 8, border: `1px solid ${ui?.border || '#cbd5e1'}`,
              background: '#fff', cursor: 'pointer', fontWeight: 600,
            }}>
              Cancelar
            </button>
            <button type="button" disabled={busy} onClick={crear} style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: ui?.accent || '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 700,
            }}>
              {busy ? 'Creando…' : 'Crear reporte'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
