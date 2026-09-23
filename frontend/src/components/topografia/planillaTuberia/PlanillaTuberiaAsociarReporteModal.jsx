/**
 * Popup: Asociar planilla de tubería a un reporte SICOE Obra ya existente.
 * Solo adjunta planilla + actualiza fotos, coordenadas y gráfico.
 * No crea registros ni modifica cantidades.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import EsquemaEditorModal from '../../esquema/EsquemaEditorModal'
import {
  CREAR_REPORTE_ESQUEMA_Z_INDEX,
  CREAR_REPORTE_Z_INDEX,
} from './PlanillaTuberiaCrearReporteModal'

export default function PlanillaTuberiaAsociarReporteModal({
  open,
  onClose,
  onAsociado,
  contratoId,
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
  const [numeroReporte, setNumeroReporte] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const [esquemaDataUri, setEsquemaDataUri] = useState(null)

  useEffect(() => {
    if (!open) return
    setErr('')
    setNumeroReporte('')
    setEsquemaOpen(false)
    setEsquemaDataUri(null)
  }, [open, planilla?.id])

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
  const numOk = Number.isFinite(Number(numeroReporte)) && Number(numeroReporte) > 0
  const puedeAsociar = esquemaListo && numOk

  const asociar = async () => {
    if (!puedeAsociar || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await apiAsociar?.({
        numero_reporte: Number(numeroReporte),
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
          width: 'min(640px, 100%)',
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
            Se vinculará la planilla <strong>{planilla?.nombre || '—'}</strong> al reporte indicado.
            Se reemplazarán las coordenadas topográficas y se actualizarán fotos y gráfico
            de los registros existentes. <strong>No se modifican cantidades ni se crean registros nuevos.</strong>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--cc-sm)' }}>Nº reporte SICOE *</span>
            <input
              type="number"
              min={1}
              step={1}
              value={numeroReporte}
              onChange={(e) => setNumeroReporte(e.target.value)}
              placeholder="Ej. 128"
              data-asociar-numero-reporte
              style={inputStyle}
            />
          </label>

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
                !numOk
                  ? 'Indique el número de reporte'
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
