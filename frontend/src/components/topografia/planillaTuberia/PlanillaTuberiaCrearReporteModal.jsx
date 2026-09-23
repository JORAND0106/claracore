/**
 * Popup: Crear reporte SICOE Obra desde planilla de tubería.
 * Solo pide lo no derivado: Subcontratista, Inspector, Capítulo, Nodo ini/fin (editable).
 * Exige esquema del tramo (EsquemaEditorModal) antes de confirmar.
 * z-index > editor de planilla (100030) y selector PK (100050).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE } from '../../../apiBase'
import EsquemaEditorModal from '../../esquema/EsquemaEditorModal'
import { filtrarCapitulosPorTipoPlanilla } from './planillaTuberiaCrearReporteUi'

/** Por encima del editor de planilla (100030) y del mapa PK (100050). */
export const CREAR_REPORTE_Z_INDEX = 100060
/** Por encima del propio popup Crear reporte. */
export const CREAR_REPORTE_ESQUEMA_Z_INDEX = 100070

/**
 * Autocomplete de catálogo {id, nombre}: un solo input con sugerencias (sin dropdown aparte).
 * Patrón alineado con UserSearchSelect / ReceptorObraSelector (lista predictiva al escribir).
 */
function CatalogAutocomplete({
  label,
  required,
  items = [],
  valueId,
  onSelect,
  placeholder = 'Buscar…',
  disabled,
  inputStyle,
  labelStyle,
  ui,
}) {
  const reactId = useId()
  const listId = `cc-topo-cat-${String(reactId).replace(/:/g, '')}`
  const selected = items.find((x) => String(x.id) === String(valueId || ''))
  const [q, setQ] = useState(selected?.nombre || '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const wrapRef = useRef(null)
  const pickingRef = useRef(false)

  useEffect(() => {
    setQ(selected?.nombre || '')
  }, [selected?.nombre, valueId])

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = !s
      ? items.slice(0, 40)
      : items.filter((it) => String(it.nombre || '').toLowerCase().includes(s)).slice(0, 40)
    return base
  }, [items, q])

  useEffect(() => {
    setHighlight(-1)
  }, [q, open])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (it) => {
    pickingRef.current = true
    setQ(it.nombre || '')
    setOpen(false)
    setHighlight(-1)
    onSelect?.(it)
    window.setTimeout(() => { pickingRef.current = false }, 0)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); setHighlight(-1) }
      return
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (!open || !filtrados.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % filtrados.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? filtrados.length - 1 : h - 1))
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault()
      pick(filtrados[highlight])
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label style={labelStyle}>
        {label}{required ? ' *' : ''}
      </label>
      <input
        type="search"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={q}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        style={inputStyle}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          if (valueId) onSelect?.(null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            if (pickingRef.current) return
            setOpen(false)
            if (valueId && selected) setQ(selected.nombre || '')
          }, 120)
        }}
        onKeyDown={onKeyDown}
      />
      {open && filtrados.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            margin: '4px 0 0',
            padding: 4,
            listStyle: 'none',
            maxHeight: 200,
            overflowY: 'auto',
            background: ui?.cardBg || '#fff',
            border: `1px solid ${ui?.border || '#cbd5e1'}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
            zIndex: 2,
          }}
        >
          {filtrados.map((it, idx) => (
            <li
              key={it.id}
              role="option"
              aria-selected={String(it.id) === String(valueId || '')}
              onMouseDown={(e) => { e.preventDefault(); pick(it) }}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 'var(--cc-sm)',
                background: idx === highlight ? (ui?.accentSoft || '#eff6ff') : 'transparent',
                color: ui?.text || '#0f172a',
                fontWeight: String(it.id) === String(valueId || '') ? 700 : 500,
              }}
            >
              {it.nombre}
            </li>
          ))}
        </ul>
      )}
      {open && !filtrados.length && q.trim() && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4,
          padding: '8px 10px', fontSize: 'var(--cc-xs)', color: ui?.textMuted || '#64748b',
          background: ui?.cardBg || '#fff', border: `1px solid ${ui?.border || '#e2e8f0'}`,
          borderRadius: 8, zIndex: 2,
        }}
        >
          Sin coincidencias
        </div>
      )}
    </div>
  )
}

function fmtAbs(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return String(n)
}

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
  logoUrl,
  contratoMeta,
  /** { lon, lat } inicio WGS84 (detalle.coords_wgs84) */
  coordsWgs84Inicio = null,
  /** { lon, lat } fin WGS84 (detalle.coords_wgs84_fin) */
  coordsWgs84Fin = null,
  /** Magna GK para sembrar nodos Inicio/Fin en el lienzo */
  seedTramoGk = null,
}) {
  const [subs, setSubs] = useState([])
  const [insps, setInsps] = useState([])
  const [caps, setCaps] = useState([])
  const [subId, setSubId] = useState('')
  const [inspId, setInspId] = useState('')
  const [capitulo, setCapitulo] = useState('')
  const [nodoIni, setNodoIni] = useState('')
  const [nodoFin, setNodoFin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const [esquemaDataUri, setEsquemaDataUri] = useState(null)

  useEffect(() => {
    if (!open) return
    setErr('')
    setSubId('')
    setInspId('')
    setCapitulo('')
    setEsquemaOpen(false)
    setEsquemaDataUri(null)
    const a0 = fmtAbs(absInicioDefault)
    const a1 = fmtAbs(absFinalDefault)
    setNodoIni(a0)
    setNodoFin(a1)
  }, [open, absInicioDefault, absFinalDefault, planilla?.id])

  const mapLocation = useMemo(() => {
    const ini = coordsWgs84Inicio && typeof coordsWgs84Inicio === 'object' ? coordsWgs84Inicio : null
    const fin = coordsWgs84Fin && typeof coordsWgs84Fin === 'object' ? coordsWgs84Fin : null
    const latIni = Number(ini?.lat ?? ini?.latitude)
    const lngIni = Number(ini?.lng ?? ini?.lon ?? ini?.longitude)
    const latFin = Number(fin?.lat ?? fin?.latitude)
    const lngFin = Number(fin?.lng ?? fin?.lon ?? fin?.longitude)
    const out = {
      lat: Number.isFinite(latIni) ? latIni : undefined,
      lng: Number.isFinite(lngIni) ? lngIni : undefined,
      pkId: planilla?.pk_id || '',
      absInicio: absInicioDefault,
      absFinal: absFinalDefault,
    }
    if (Number.isFinite(latIni) && Number.isFinite(lngIni)) {
      out.tramoInicio = { lat: latIni, lng: lngIni, label: 'Inicio' }
    }
    if (Number.isFinite(latFin) && Number.isFinite(lngFin)) {
      out.tramoFin = { lat: latFin, lng: lngFin, label: 'Fin' }
    }
    return out
  }, [coordsWgs84Inicio, coordsWgs84Fin, planilla?.pk_id, absInicioDefault, absFinalDefault])

  const seedTramo = useMemo(() => {
    const s = seedTramoGk && typeof seedTramoGk === 'object' ? seedTramoGk : null
    if (!s) return null
    const nIni = Number(s.norteIni ?? s.norte_abs_inicial)
    const eIni = Number(s.esteIni ?? s.este_abs_inicial)
    const nFin = Number(s.norteFin ?? s.norte_abs_final)
    const eFin = Number(s.esteFin ?? s.este_abs_final)
    if (![nIni, eIni, nFin, eFin].every(Number.isFinite)) return null
    return { norteIni: nIni, esteIni: eIni, norteFin: nFin, esteFin: eFin }
  }, [seedTramoGk])

  const esquemaListo = Boolean(esquemaDataUri)

  useEffect(() => {
    if (!open || !contratoId || !token) return
    const hdrs = { Authorization: `Bearer ${token}` }
    let cancelled = false
    ;(async () => {
      try {
        const [rs, ri, rc] = await Promise.all([
          fetch(`${API_BASE}/sicoe-obra/${contratoId}/subcontratistas-activos`, { headers: hdrs }),
          fetch(`${API_BASE}/sicoe-obra/${contratoId}/inspectores`, { headers: hdrs }),
          fetch(`${API_BASE}/sicoe-obra/${contratoId}/filtros/capitulos`, { headers: hdrs }),
        ])
        if (cancelled) return
        if (!rs.ok || !ri.ok || !rc.ok) {
          throw new Error('No se pudieron cargar catálogos SICOE')
        }
        const [s, i, c] = await Promise.all([rs.json(), ri.json(), rc.json()])
        if (cancelled) return
        setSubs(Array.isArray(s) ? s : [])
        setInsps(Array.isArray(i) ? i : [])
        const capList = Array.isArray(c)
          ? c.map((x) => (typeof x === 'string' ? x : (x?.capitulo || x?.nombre || ''))).filter(Boolean)
          : []
        setCaps(filtrarCapitulosPorTipoPlanilla(capList, planilla?.tipo))
      } catch (e) {
        if (!cancelled) {
          setSubs([])
          setInsps([])
          setCaps([])
          setErr(e.message || 'No se pudieron cargar catálogos SICOE')
        }
      }
    })()
    return () => { cancelled = true }
  }, [open, contratoId, token, planilla?.tipo])

  useEffect(() => {
    if (!capitulo) return
    if (caps.length && !caps.includes(capitulo)) setCapitulo('')
  }, [caps, capitulo])

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
  const cellBorder = `1px solid ${ui?.border || '#94a3b8'}`
  const logoSrc = String(logoUrl || '').trim()
  const meta = contratoMeta && typeof contratoMeta === 'object' ? contratoMeta : {}

  const crear = async () => {
    if (!subId) { setErr('Seleccione subcontratista'); return }
    if (!inspId) { setErr('Seleccione inspector'); return }
    if (!String(capitulo || '').trim()) { setErr('Seleccione capítulo'); return }
    if (!esquemaListo) {
      setErr('Genere y guarde el esquema del tramo (Inicio → Fin) antes de crear el reporte.')
      return
    }
    setBusy(true); setErr('')
    try {
      const numOrNull = (v) => {
        if (v === '' || v == null) return null
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      // Nodo inicio/fin = abscisas min/max (autodiligenciadas); también van a abs_inicio/abs_final.
      const absIni = numOrNull(nodoIni)
      const absFin = numOrNull(nodoFin)
      const res = await apiCrear({
        subcontratista_id: Number(subId),
        inspector_id: Number(inspId),
        capitulo: String(capitulo).trim(),
        nodo_ini: String(nodoIni).trim() || null,
        nodo_fin: String(nodoFin).trim() || null,
        abs_inicio: absIni,
        abs_final: absFin,
        esquema_data_uri: esquemaDataUri || null,
      })
      onCreated?.(res)
      onClose?.()
    } catch (e) {
      setErr(e.message || 'No se pudo crear el reporte')
    } finally {
      setBusy(false)
    }
  }

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crear reporte SICOE Obra"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: CREAR_REPORTE_Z_INDEX,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}
    >
      <div
        data-crear-reporte-popup
        style={{
          width: 'min(980px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: ui?.cardBg || '#fff',
          borderRadius: 12,
          border: `1px solid ${ui?.border || '#e2e8f0'}`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          color: ui?.text || '#0f172a',
        }}
      >
        {/* Encabezado tipo documento / PDF planilla */}
        <div style={{ padding: 14, borderBottom: `1px solid ${ui?.border || '#e2e8f0'}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{
                  width: 72, border: cellBorder, padding: 6, textAlign: 'center', verticalAlign: 'middle',
                  background: '#f8fafc',
                }}
                >
                  {logoSrc ? (
                    <img
                      src={logoSrc}
                      alt="Logo contratista"
                      style={{ maxHeight: 44, maxWidth: 64, objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{
                      fontSize: 9, fontWeight: 700, color: ui?.textMuted || '#64748b',
                      lineHeight: 1.2, padding: '6px 2px',
                    }}
                    >
                      LOGO
                    </div>
                  )}
                </td>
                <td style={{
                  border: cellBorder, padding: '8px 10px', textAlign: 'center', verticalAlign: 'middle',
                }}
                >
                  <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', letterSpacing: '0.01em' }}>
                    Crear reporte SICOE Obra
                  </div>
                  <div style={{ fontSize: 'var(--cc-xs)', color: ui?.textMuted || '#64748b', marginTop: 2 }}>
                    Desde planilla de tubería · Topografía
                  </div>
                </td>
                <td style={{
                  width: '28%', border: cellBorder, padding: '6px 8px', verticalAlign: 'top',
                  fontSize: 'var(--cc-xxs)', color: ui?.textMuted || '#475569',
                }}
                >
                  <div style={{ fontWeight: 700, textAlign: 'right', color: ui?.text || '#0f172a' }}>
                    INF-ING - TOP - SICOE
                  </div>
                  <div style={{ marginTop: 4, textAlign: 'right' }}>
                    {new Date().toLocaleDateString('es-CO')}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{
            marginTop: 8,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            fontSize: 'var(--cc-xs)',
            border: cellBorder,
            borderRadius: 6,
            padding: '8px 10px',
            background: '#f8fafc',
          }}
          >
            <div>
              <span style={{ color: ui?.textMuted || '#64748b', fontWeight: 700 }}>Planilla: </span>
              <b>{planilla?.nombre || '—'}</b>
            </div>
            <div>
              <span style={{ color: ui?.textMuted || '#64748b', fontWeight: 700 }}>Tipo: </span>
              {planilla?.tipo || '—'}
            </div>
            <div>
              <span style={{ color: ui?.textMuted || '#64748b', fontWeight: 700 }}>PK / ID: </span>
              {planilla?.pk_id || '—'}
              {planilla?.costado ? ` · ${planilla.costado}` : ''}
            </div>
            <div>
              <span style={{ color: ui?.textMuted || '#64748b', fontWeight: 700 }}>Contrato: </span>
              {meta.numero || meta.nombre || '—'}
            </div>
          </div>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            data-crear-reporte-grid
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              alignItems: 'start',
            }}
          >
            <CatalogAutocomplete
              label="Subcontratista"
              required
              items={subs}
              valueId={subId}
              onSelect={(it) => setSubId(it?.id != null ? String(it.id) : '')}
              placeholder="Escriba para buscar subcontratista…"
              disabled={busy}
              inputStyle={inputStyle}
              labelStyle={labelStyle}
              ui={ui}
            />
            <CatalogAutocomplete
              label="Inspector"
              required
              items={insps}
              valueId={inspId}
              onSelect={(it) => setInspId(it?.id != null ? String(it.id) : '')}
              placeholder="Escriba para buscar inspector…"
              disabled={busy}
              inputStyle={inputStyle}
              labelStyle={labelStyle}
              ui={ui}
            />
            <div>
              <label style={labelStyle}>Capítulo *</label>
              <select
                style={inputStyle}
                value={capitulo}
                disabled={busy}
                onChange={(e) => setCapitulo(e.target.value)}
                data-capitulo-filtrado-tipo={String(planilla?.tipo || '').toUpperCase() || undefined}
              >
                <option value="">— Seleccionar —</option>
                {caps.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {planilla?.tipo && (
                <div style={{ fontSize: 'var(--cc-xxs)', color: ui?.textMuted || '#64748b', marginTop: 4 }}>
                  Filtrado por tipo de planilla: {planilla.tipo}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Nodo / abscisa inicio</label>
              <input
                style={inputStyle}
                type="number"
                step="any"
                inputMode="decimal"
                disabled={busy}
                value={nodoIni}
                onChange={(e) => setNodoIni(e.target.value)}
                title="Autodiligenciado con el mínimo de abscisa de la cartera"
              />
            </div>
            <div>
              <label style={labelStyle}>Nodo / abscisa fin</label>
              <input
                style={inputStyle}
                type="number"
                step="any"
                inputMode="decimal"
                disabled={busy}
                value={nodoFin}
                onChange={(e) => setNodoFin(e.target.value)}
                title="Autodiligenciado con el máximo de abscisa de la cartera"
              />
            </div>
          </div>
          {(absInicioDefault != null || absFinalDefault != null) && (
            <div style={{ fontSize: 'var(--cc-xxs)', color: ui?.textMuted || '#64748b', marginTop: -4 }}>
              Valores tomados de la cartera (mín. {fmtAbs(absInicioDefault) || '—'} · máx. {fmtAbs(absFinalDefault) || '—'}). Puede editarlos.
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(260px, 1fr) minmax(280px, 1.2fr)',
              gap: 12,
              alignItems: 'stretch',
            }}
          >
            <div
              data-esquema-tramo-obligatorio
              style={{
                border: `1px solid ${esquemaListo ? '#86efac' : (ui?.border || '#e2e8f0')}`,
                borderRadius: 8,
                padding: 10,
                background: esquemaListo ? '#f0fdf4' : (ui?.inputBg || '#f8fafc'),
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', marginBottom: 4 }}>
                Esquema del tramo *
              </div>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui?.textMuted || '#64748b', marginBottom: 8 }}>
                Obligatorio. Se abre el editor de Esquemas con el mapa y los puntos Inicio / Fin (WGS84) unidos por una flecha.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setErr(''); setEsquemaOpen(true) }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: ui?.accent || '#2563eb',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontSize: 'var(--cc-sm)',
                  }}
                >
                  {esquemaListo ? '✎ Revisar / regenerar esquema' : '✎ Generar esquema del tramo'}
                </button>
                <span style={{
                  fontSize: 'var(--cc-xs)',
                  fontWeight: 700,
                  color: esquemaListo ? '#166534' : '#b45309',
                }}
                >
                  {esquemaListo ? 'Esquema guardado' : 'Pendiente de generar'}
                </span>
              </div>
              {esquemaListo && esquemaDataUri && (
                <img
                  src={esquemaDataUri}
                  alt="Vista previa esquema del tramo"
                  style={{
                    display: 'block',
                    marginTop: 8,
                    maxWidth: '100%',
                    maxHeight: 120,
                    objectFit: 'contain',
                    borderRadius: 6,
                    border: `1px solid ${ui?.border || '#e2e8f0'}`,
                    background: '#fff',
                  }}
                />
              )}
            </div>

            {lineasPreview.length > 0 ? (
              <div style={{
                border: `1px solid ${ui?.border || '#e2e8f0'}`,
                borderRadius: 8,
                padding: 8,
                fontSize: 'var(--cc-xs)',
                maxHeight: 200,
                overflow: 'auto',
                background: ui?.inputBg || '#f8fafc',
              }}
              >
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
            ) : (
              <div style={{
                border: `1px dashed ${ui?.border || '#e2e8f0'}`,
                borderRadius: 8,
                padding: 12,
                fontSize: 'var(--cc-xs)',
                color: ui?.textMuted || '#64748b',
              }}
              >
                Sin líneas con cantidad ≠ 0 para generar registros.
              </div>
            )}
          </div>

          {err && (
            <div style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: 8, padding: 8, fontSize: 'var(--cc-sm)' }}>
              {err}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              style={{
                padding: '8px 14px', borderRadius: 8, border: `1px solid ${ui?.border || '#cbd5e1'}`,
                background: '#fff', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || !esquemaListo}
              onClick={crear}
              title={!esquemaListo ? 'Genere y guarde el esquema del tramo primero' : undefined}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: ui?.accent || '#2563eb', color: '#fff',
                cursor: (busy || !esquemaListo) ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                opacity: !esquemaListo ? 0.55 : 1,
              }}
            >
              {busy ? 'Creando…' : 'Crear reporte'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {createPortal(overlay, document.body)}
      {esquemaOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: CREAR_REPORTE_ESQUEMA_Z_INDEX }}>
          <EsquemaEditorModal
            t={ui?.t || {
              bg: ui?.cardBg || '#fff',
              text: ui?.text || '#0f172a',
              textMuted: ui?.textMuted || '#64748b',
              border: ui?.border || '#e2e8f0',
              primary: ui?.accent || '#2563eb',
            }}
            title="Esquema del tramo — planilla de tubería"
            contratoId={contratoId}
            mapLocation={mapLocation}
            seedTramo={seedTramo}
            autoActivateMap
            onClose={() => setEsquemaOpen(false)}
            onSave={async (dataUrl) => {
              if (!dataUrl) {
                setErr('El esquema no devolvió imagen. Guarde de nuevo.')
                return
              }
              setEsquemaDataUri(dataUrl)
              setEsquemaOpen(false)
              setErr('')
            }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}
