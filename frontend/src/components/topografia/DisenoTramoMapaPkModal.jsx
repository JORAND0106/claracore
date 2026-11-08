/**
 * Selección de uno o varios pk_ID en el mapa para crear un tramo en Configuración DG.
 * Reutiliza el maestro PK y el mapa de polígonos de Bitácora/Presupuesto.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import PptoFiltroMapaPk from '../../modules/presupuesto/PptoFiltroMapaPk'
import { API_BASE } from '../../apiBase'
import { identificarUbicacionMaterial } from '../../modules/seguimiento/bitacoraMaterialUbicacion'

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
 * @param {{
 *   t: object, token?: string, contratoId: string|number,
 *   zIndex?: number,
 *   initialPks?: Array<object>,
 *   onConfirm: (pks: Array<object>) => void,
 *   onClose: () => void,
 * }} props
 */
export default function DisenoTramoMapaPkModal({
  t,
  token,
  contratoId,
  zIndex = 100050,
  initialPks = [],
  onConfirm,
  onClose,
}) {
  const [pkList, setPkList] = useState([])
  const [pkLoading, setPkLoading] = useState(false)
  const [aviso, setAviso] = useState('')
  const [seleccion, setSeleccion] = useState(() => {
    const map = new Map()
    ;(initialPks || []).forEach((p) => {
      const id = String(p.pk_id || p.ubicacion_pk_id || '')
      if (id) map.set(id, p)
    })
    return map
  })

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

  const labelsSeleccionados = useMemo(
    () => [...seleccion.values()].map((p) => p.pk_label || p.ubicacion_pk || p.pk_id).filter(Boolean),
    [seleccion],
  )

  const onPkPick = (pkVal, meta) => {
    if (meta?.screenshotOnly) return
    const identified = identificarUbicacionMaterial(pkVal, pkList, meta?.properties)
    if (!identified.ok) {
      setAviso(identified.error || 'No se pudo identificar el PK del plano.')
      return
    }
    setAviso('')
    const id = String(identified.ubicacion_pk_id)
    setSeleccion((prev) => {
      const next = new Map(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.set(id, {
          pk_id: id,
          pk_label: identified.ubicacion_pk || '',
          ubicacion_pk: identified.ubicacion_pk || '',
          ubicacion_pk_id: id,
          tramo_plataforma: identified.ubicacion_tramo || '',
          ubicacion_tramo: identified.ubicacion_tramo || '',
          costado: identified.ubicacion_costado || '',
          ubicacion_costado: identified.ubicacion_costado || '',
          infraestructura: identified.ubicacion_infraestructura || '',
          ubicacion_infraestructura: identified.ubicacion_infraestructura || '',
          lat: meta?.lat != null ? Number(meta.lat) : null,
          lng: meta?.lng != null ? Number(meta.lng) : null,
          ubicacion_lat: meta?.lat != null ? Number(meta.lat) : null,
          ubicacion_lng: meta?.lng != null ? Number(meta.lng) : null,
        })
      }
      return next
    })
  }

  const btn = {
    border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontWeight: 700, fontSize: 'var(--cc-sm)',
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex, background: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-label="Seleccionar pk_ID del tramo"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 96vw)', height: 'min(760px, 94vh)',
          background: t.bgCard || '#fff', borderRadius: 12,
          border: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 20px 50px rgba(15,23,42,0.25)',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderBottom: `1px solid ${t.border}`, gap: 8,
        }}>
          <div>
            <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-sm)' }}>
              Seleccionar pk_ID del tramo
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2 }}>
              Pulse uno o varios polígonos. Volver a pulsar quita el PK. Luego continue para definir abscisas y estructura.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar mapa"
            aria-label="Cerrar mapa"
            style={{ ...btn, background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
          >
            ✕
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
              selectedPk={labelsSeleccionados}
              onClearSelection={() => setSeleccion(new Map())}
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
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 700, maxWidth: '58%', lineHeight: 1.35 }}>
            {seleccion.size
              ? `${seleccion.size} PK: ${labelsSeleccionados.slice(0, 6).join(', ')}${labelsSeleccionados.length > 6 ? '…' : ''}`
              : 'Sin PK seleccionado'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {seleccion.size > 0 && (
              <button
                type="button"
                title="Limpiar selección"
                aria-label="Limpiar selección"
                onClick={() => setSeleccion(new Map())}
                style={{ ...btn, background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              disabled={!seleccion.size}
              title="Continuar con los PK seleccionados"
              aria-label="Continuar con los PK seleccionados"
              onClick={() => onConfirm?.([...seleccion.values()])}
              style={{
                ...btn, background: t.primary, color: '#fff',
                opacity: !seleccion.size ? 0.5 : 1,
              }}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
