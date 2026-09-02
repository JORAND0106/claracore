import { useCallback, useEffect, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import PptoFiltroMapaPk from '../presupuesto/PptoFiltroMapaPk'
import { API_BASE } from '../../apiBase'
import { identificarUbicacionMaterial } from './bitacoraMaterialUbicacion'

export { identificarUbicacionMaterial }

async function fetchPkMaestro(contratoId, token) {
  const t = token
    || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token'))
    || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cc_token'))
    || ''
  const r = await fetch(`${API_BASE}/sicoe-obra/${contratoId}/pk-ids`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  })
  if (!r.ok) throw new Error('No se pudo cargar el maestro PK del contrato.')
  const data = await r.json()
  return Array.isArray(data) ? data : []
}

/**
 * Ubicación de material por PK (mismo mapa de polígonos que Cantidades/Presupuesto).
 */
export default function BitacoraMaterialUbicacionModal({
  t,
  token,
  contratoId,
  pkId = '',
  pkLabel = '',
  tramo = '',
  costado = '',
  infraestructura = '',
  readOnly = false,
  onConfirm,
  onClose,
}) {
  const [pkList, setPkList] = useState([])
  const [pkLoading, setPkLoading] = useState(false)
  const [aviso, setAviso] = useState('')
  const [selPkId, setSelPkId] = useState(pkId ? String(pkId) : '')
  const [selLabel, setSelLabel] = useState(pkLabel || '')
  const [selTramo, setSelTramo] = useState(tramo || '')
  const [selCostado, setSelCostado] = useState(costado || '')
  const [selInfra, setSelInfra] = useState(infraestructura || '')
  const [coords, setCoords] = useState({ lat: null, lng: null })

  const cargar = useCallback(async () => {
    if (!contratoId) return
    setPkLoading(true)
    setAviso('')
    try {
      const rows = await fetchPkMaestro(contratoId, token)
      setPkList(rows)
      if (!rows.length) setAviso('No hay PK registrados para este contrato.')
    } catch (e) {
      setPkList([])
      setAviso(e.message || 'Error al cargar maestro PK.')
    } finally {
      setPkLoading(false)
    }
  }, [contratoId, token])

  useEffect(() => { void cargar() }, [cargar])

  const display = selLabel
    || (selPkId && pkList.find((p) => String(p.id) === String(selPkId))?.pk_id)
    || ''

  const limpiarSeleccion = () => {
    setSelPkId('')
    setSelLabel('')
    setSelTramo('')
    setSelCostado('')
    setSelInfra('')
    setCoords({ lat: null, lng: null })
  }

  const onPkPick = (pkVal, meta) => {
    if (readOnly || meta?.screenshotOnly) return
    const identified = identificarUbicacionMaterial(pkVal, pkList, meta?.properties)
    if (!identified.ok) {
      setAviso(identified.error || 'No se pudo identificar el PK del plano.')
      return
    }
    setAviso('')
    setSelPkId(String(identified.ubicacion_pk_id))
    setSelLabel(String(identified.ubicacion_pk || ''))
    setSelTramo(identified.ubicacion_tramo || '')
    setSelCostado(identified.ubicacion_costado || '')
    setSelInfra(identified.ubicacion_infraestructura || '')
    setCoords({
      lat: meta?.lat != null ? Number(meta.lat) : null,
      lng: meta?.lng != null ? Number(meta.lng) : null,
    })
  }

  const btn = {
    border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontWeight: 700, fontSize: 'var(--cc-sm)',
  }

  const detalleSel = [
    display ? `PK: ${display}` : null,
    selTramo ? `Tramo: ${selTramo}` : null,
    selCostado ? `Costado: ${selCostado}` : null,
    selInfra ? `Infra: ${selInfra}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 5600, background: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-label="Ubicación por PK"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 96vw)', height: 'min(720px, 92vh)',
          background: t.bgCard || '#fff', borderRadius: 12,
          border: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderBottom: `1px solid ${t.border}`,
        }}>
          <div>
            <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-sm)' }}>
              Ubicación por PK
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2 }}>
              Seleccione el polígono del plano. Puede cambiar Calle / Relieve / Satélite sin perder el PK.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ ...btn, background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
            Cerrar
          </button>
        </div>

        {aviso ? (
          <div style={{
            margin: '8px 12px 0', padding: '8px 10px', borderRadius: 8,
            background: '#FEF2F2', border: '1px solid #FECACA',
            fontSize: 'var(--cc-caption)', color: '#B91C1C',
          }}>
            {aviso}
          </div>
        ) : null}

        <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
          {pkLoading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted }}>
              Cargando maestro PK…
            </div>
          ) : (
            <PptoFiltroMapaPk
              t={t}
              token={token}
              contratoId={contratoId}
              onPkPick={onPkPick}
              selectedPk={display}
              onClearSelection={limpiarSeleccion}
              height="100%"
              hideCaption
              showBasemapToggle
            />
          )}
        </div>

        <div style={{
          padding: '10px 14px', borderTop: `1px solid ${t.border}`,
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 700, maxWidth: '62%', lineHeight: 1.35 }}>
            {detalleSel || 'Sin PK seleccionado'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!readOnly && (display || pkLabel) && (
              <button
                type="button"
                onClick={() => onConfirm?.({
                  ubicacion_pk: null,
                  ubicacion_pk_id: null,
                  ubicacion_tramo: null,
                  ubicacion_costado: null,
                  ubicacion_infraestructura: null,
                  ubicacion_lat: null,
                  ubicacion_lng: null,
                })}
                style={{ ...btn, background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
              >
                Quitar
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                disabled={!selPkId && !selLabel}
                onClick={() => onConfirm?.({
                  ubicacion_pk: selLabel || display || null,
                  ubicacion_pk_id: selPkId || null,
                  ubicacion_tramo: selTramo || null,
                  ubicacion_costado: selCostado || null,
                  ubicacion_infraestructura: selInfra || null,
                  ubicacion_lat: coords.lat,
                  ubicacion_lng: coords.lng,
                })}
                style={{
                  ...btn, background: t.primary, color: '#fff',
                  opacity: (!selPkId && !selLabel) ? 0.5 : 1,
                }}
              >
                Guardar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
