/**
 * Popup: Asociar planilla de tubería a un reporte SICOE Obra ya existente.
 * Buscador/autocomplete de reportes existentes (preview Nº & Descripción & Abs).
 * Solo adjunta planilla + actualiza fotos, coordenadas y gráfico.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE } from '../../../apiBase'
import EsquemaEditorModal from '../../esquema/EsquemaEditorModal'
import {
  CREAR_REPORTE_ESQUEMA_Z_INDEX,
  CREAR_REPORTE_Z_INDEX,
} from './PlanillaTuberiaCrearReporteModal'
import {
  filtrarReportesSicoeAutocomplete,
  formatoPreviewReporteSicoe,
} from './planillaTuberiaUtils'

async function fetchReportesBuscar(contratoId, token, params = {}) {
  const q = new URLSearchParams()
  q.set('limit', String(params.limit ?? 100))
  q.set('offset', String(params.offset ?? 0))
  if (params.numero_reporte != null && params.numero_reporte !== '') {
    q.set('numero_reporte', String(params.numero_reporte))
  }
  const res = await fetch(
    `${API_BASE}/sicoe-obra/${contratoId}/reportes/buscar?${q}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t || `No se pudieron cargar reportes (${res.status})`)
  }
  const data = await res.json()
  return Array.isArray(data?.reportes) ? data.reportes : (Array.isArray(data) ? data : [])
}

function mergeReportes(prev, extra) {
  const map = new Map()
  for (const r of [...(prev || []), ...(extra || [])]) {
    if (!r || r.id == null) continue
    map.set(String(r.id), r)
  }
  return Array.from(map.values()).sort(
    (a, b) => Number(b.numero_reporte || 0) - Number(a.numero_reporte || 0),
  )
}

export default function PlanillaTuberiaAsociarReporteModal({
  open,
  onClose,
  onAsociado,
  contratoId,
  token,
  planilla,
  absInicioDefault,
  absFinalDefault,
  lineasPreview = [],
  apiAsociar,
  ui,
  logoUrl,
  contratoMeta,
  coordsWgs84Inicio = null,
  coordsWgs84Fin = null,
  seedTramoGk = null,
}) {
  const [reportes, setReportes] = useState([])
  const [cargandoLista, setCargandoLista] = useState(false)
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const [esquemaDataUri, setEsquemaDataUri] = useState(null)
  const wrapRef = useRef(null)
  const pickingRef = useRef(false)
  const reactId = useId()
  const listId = `cc-topo-asociar-rep-${String(reactId).replace(/:/g, '')}`

  useEffect(() => {
    if (!open) return
    setErr('')
    setQuery('')
    setSelected(null)
    setListOpen(false)
    setHighlight(-1)
    setEsquemaOpen(false)
    setEsquemaDataUri(null)
    setReportes([])
  }, [open, planilla?.id])

  // Carga inicial de reportes existentes (SICOE Obra).
  useEffect(() => {
    if (!open || !contratoId || !token) return undefined
    let cancelled = false
    setCargandoLista(true)
    ;(async () => {
      try {
        const lista = await fetchReportesBuscar(contratoId, token, { limit: 100, offset: 0 })
        if (!cancelled) setReportes(lista)
      } catch (e) {
        if (!cancelled) {
          setErr(e?.message || 'No se pudieron cargar los reportes SICOE')
          setReportes([])
        }
      } finally {
        if (!cancelled) setCargandoLista(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, contratoId, token])

  // Si digita un número exacto que no está en la página cargada, consultar por Nº.
  useEffect(() => {
    if (!open || !contratoId || !token) return undefined
    const raw = String(query || '').trim()
    if (!/^\d+$/.test(raw)) return undefined
    const num = Number(raw)
    if (!Number.isFinite(num) || num <= 0) return undefined
    let cancelled = false
    const t = window.setTimeout(() => {
      ;(async () => {
        try {
          const extra = await fetchReportesBuscar(contratoId, token, {
            limit: 10,
            numero_reporte: num,
          })
          if (cancelled || !extra.length) return
          setReportes((prev) => {
            if (prev.some((r) => Number(r.numero_reporte) === num)) return prev
            return mergeReportes(prev, extra)
          })
        } catch {
          /* ignore — el listado base sigue disponible */
        }
      })()
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, contratoId, token, query])

  const filtrados = useMemo(
    () => filtrarReportesSicoeAutocomplete(reportes, query, 40),
    [reportes, query],
  )

  useEffect(() => {
    setHighlight(-1)
  }, [query, listOpen])

  useEffect(() => {
    if (!listOpen) return undefined
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setListOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [listOpen])

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

  const pick = (rep) => {
    if (!rep) return
    pickingRef.current = true
    setSelected(rep)
    setQuery(formatoPreviewReporteSicoe(rep))
    setListOpen(false)
    setHighlight(-1)
    setErr('')
    window.setTimeout(() => { pickingRef.current = false }, 0)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (listOpen) { e.preventDefault(); setListOpen(false); setHighlight(-1) }
      return
    }
    if (!listOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setListOpen(true)
      return
    }
    if (!listOpen || !filtrados.length) return
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

  const esquemaListo = Boolean(esquemaDataUri)
  const reporteOk = selected?.id != null && selected?.numero_reporte != null
  const puedeAsociar = esquemaListo && reporteOk

  const asociar = async () => {
    if (!puedeAsociar || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await apiAsociar?.({
        reporte_id: Number(selected.id),
        numero_reporte: Number(selected.numero_reporte),
        esquema_data_uri: esquemaDataUri,
      })
      onAsociado?.(res)
      onClose?.()
    } catch (e) {
      const msg = e?.message || (typeof e === 'string' ? e : 'No se pudo asociar al reporte')
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const cellBorder = `1px solid ${ui?.border || '#cbd5e1'}`
  const logoSrc = logoUrl || null
  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${ui?.border || '#cbd5e1'}`,
    background: ui?.inputBg || '#fff',
    fontSize: 'var(--cc-sm)',
    color: ui?.text || '#0f172a',
  }

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Asociar a reporte SICOE Obra"
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
        data-asociar-reporte-popup
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: ui?.cardBg || '#fff',
          borderRadius: 12,
          border: `1px solid ${ui?.border || '#e2e8f0'}`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          color: ui?.text || '#0f172a',
        }}
      >
        <div style={{ padding: 14, borderBottom: `1px solid ${ui?.border || '#e2e8f0'}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{
                  width: 72, border: cellBorder, padding: 6, textAlign: 'center',
                  background: '#f8fafc',
                }}
                >
                  {logoSrc ? (
                    <img src={logoSrc} alt="Logo" style={{ maxHeight: 44, maxWidth: 64, objectFit: 'contain' }} />
                  ) : (
                    <div style={{ fontSize: 9, fontWeight: 700, color: ui?.textMuted || '#64748b' }}>LOGO</div>
                  )}
                </td>
                <td style={{ border: cellBorder, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)' }}>
                    Asociar a reporte existente
                  </div>
                  <div style={{ fontSize: 'var(--cc-xs)', color: ui?.textMuted || '#64748b', marginTop: 2 }}>
                    Planilla de tubería · sin actualizar cantidades
                  </div>
                </td>
                <td style={{
                  width: '28%', border: cellBorder, padding: '6px 8px',
                  fontSize: 'var(--cc-xxs)', color: ui?.textMuted || '#475569', textAlign: 'right',
                }}
                >
                  <div style={{ fontWeight: 700, color: ui?.text || '#0f172a' }}>INF-ING - TOP - SICOE</div>
                  <div>{contratoMeta?.numero || `Contrato ${contratoId}`}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 'var(--cc-xs)',
            color: '#1e3a8a',
            lineHeight: 1.45,
          }}
          >
            Busque y seleccione un reporte existente de SICOE Obra. Al asociar
            se vinculará la planilla <strong>{planilla?.nombre || '—'}</strong>,
            se reemplazarán coordenadas y se actualizarán fotos/gráfico.
            {' '}<strong>No se modifican cantidades ni se crean registros nuevos.</strong>
          </div>

          <div ref={wrapRef} style={{ position: 'relative' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--cc-sm)' }}>
                Reporte SICOE Obra *
              </span>
              <input
                type="search"
                autoComplete="off"
                spellCheck={false}
                disabled={busy || cargandoLista}
                placeholder={
                  cargandoLista
                    ? 'Cargando reportes…'
                    : 'Buscar por Nº, descripción o abscisa…'
                }
                value={query}
                data-asociar-numero-reporte
                data-asociar-reporte-buscar
                aria-autocomplete="list"
                aria-expanded={listOpen}
                aria-controls={listId}
                style={inputStyle}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setListOpen(true)
                  if (selected) setSelected(null)
                }}
                onFocus={() => setListOpen(true)}
                onBlur={() => {
                  if (pickingRef.current) return
                  // Mantener lista un instante para permitir click
                }}
                onKeyDown={onKeyDown}
              />
            </label>
            {listOpen && (
              <ul
                id={listId}
                role="listbox"
                data-asociar-reporte-sugerencias
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '100%',
                  marginTop: 4,
                  maxHeight: 240,
                  overflow: 'auto',
                  listStyle: 'none',
                  padding: 4,
                  margin: 0,
                  zIndex: 5,
                  background: ui?.cardBg || '#fff',
                  border: `1px solid ${ui?.border || '#e2e8f0'}`,
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
                }}
              >
                {filtrados.length === 0 ? (
                  <li style={{
                    padding: '8px 10px',
                    fontSize: 'var(--cc-xs)',
                    color: ui?.textMuted || '#64748b',
                  }}
                  >
                    {cargandoLista
                      ? 'Cargando…'
                      : (query.trim()
                        ? 'Sin coincidencias — verifique que el reporte exista en SICOE Obra'
                        : 'Escriba para filtrar reportes existentes')}
                  </li>
                ) : filtrados.map((rep, idx) => {
                  const label = formatoPreviewReporteSicoe(rep)
                  const active = idx === highlight
                    || (selected && String(selected.id) === String(rep.id))
                  return (
                    <li
                      key={rep.id}
                      role="option"
                      aria-selected={active}
                      data-asociar-reporte-opcion
                      data-numero-reporte={rep.numero_reporte}
                      onMouseDown={(e) => { e.preventDefault(); pick(rep) }}
                      onMouseEnter={() => setHighlight(idx)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 'var(--cc-xs)',
                        lineHeight: 1.35,
                        background: active ? (ui?.accentSoft || '#eff6ff') : 'transparent',
                        color: ui?.text || '#0f172a',
                        fontWeight: selected && String(selected.id) === String(rep.id) ? 700 : 500,
                      }}
                    >
                      {label}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {selected && (
            <div
              data-asociar-reporte-seleccionado
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 'var(--cc-xs)',
                color: '#166534',
                lineHeight: 1.4,
              }}
            >
              <strong>Seleccionado:</strong>{' '}
              {formatoPreviewReporteSicoe(selected)}
            </div>
          )}

          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', marginBottom: 6 }}>
              Esquema del tramo *
            </div>
            <button
              type="button"
              data-asociar-esquema-btn
              onClick={() => setEsquemaOpen(true)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${esquemaListo ? '#86efac' : (ui?.border || '#cbd5e1')}`,
                background: esquemaListo ? '#dcfce7' : (ui?.accentSoft || '#eff6ff'),
                color: esquemaListo ? '#166534' : (ui?.accent || '#2563eb'),
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {esquemaListo ? 'Esquema listo — editar' : 'Generar / adjuntar esquema'}
            </button>
            {!esquemaListo && (
              <div style={{ marginTop: 6, fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                Obligatorio para actualizar el gráfico del reporte.
              </div>
            )}
          </div>

          {lineasPreview.length > 0 && (
            <div style={{ fontSize: 'var(--cc-xs)', color: ui?.textMuted || '#64748b' }}>
              Fotos a sincronizar ({lineasPreview.length} línea(s) con cantidad ≠ 0):
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {lineasPreview.slice(0, 8).map((l) => (
                  <li key={`${l.codigo || l.nombre}`}>{l.nombre || l.codigo}</li>
                ))}
                {lineasPreview.length > 8 && <li>… y {lineasPreview.length - 8} más</li>}
              </ul>
            </div>
          )}

          {err && (
            <div style={{
              color: '#b91c1c', background: '#fef2f2', borderRadius: 8,
              padding: 8, fontSize: 'var(--cc-sm)',
            }}
            >
              {err}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              style={{
                padding: '8px 14px', borderRadius: 8,
                border: `1px solid ${ui?.border || '#cbd5e1'}`,
                background: '#fff', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || !puedeAsociar}
              onClick={asociar}
              data-asociar-reporte-submit
              title={
                !reporteOk
                  ? 'Seleccione un reporte existente de la lista'
                  : (!esquemaListo ? 'Genere y guarde el esquema del tramo primero' : undefined)
              }
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: ui?.accent || '#2563eb', color: '#fff',
                cursor: (busy || !puedeAsociar) ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                opacity: !puedeAsociar ? 0.55 : 1,
              }}
            >
              {busy ? 'Asociando…' : 'Asociar planilla'}
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
            title="Esquema del tramo — asociar a reporte"
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
