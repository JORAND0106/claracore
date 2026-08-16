import { useCallback, useState } from 'react'
import PptoFiltroMapaPk from '../modules/presupuesto/PptoFiltroMapaPk'
import { API_BASE } from '../apiBase'
import { resolverPkMaestroAlmacen } from './almacenPkResolver'

async function fetchPkMaestro(contratoId, token) {
  const t = token
    || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token'))
    || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cc_token'))
    || ''
  const r = await fetch(`${API_BASE}/sicoe-obra/${contratoId}/pk-ids`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  })
  if (!r.ok) {
    throw new Error('No se pudo cargar el maestro PK del contrato.')
  }
  const data = await r.json()
  return Array.isArray(data) ? data : []
}

/**
 * Selector de PK-ID para solicitudes de Almacén.
 * Consume el plano compartido (PptoFiltroMapaPk) con resolución propia del maestro PK.
 */
export default function AlmacenPkMapaSelector({
  t,
  token,
  contratoId,
  pkIdSeleccionado = '',
  pkLabel = '',
  onSeleccionar,
  onLimpiar,
  compact = false,
}) {
  const [mapaOpen, setMapaOpen] = useState(false)
  const [pkMapaAviso, setPkMapaAviso] = useState('')
  const [pkList, setPkList] = useState([])
  const [pkLoading, setPkLoading] = useState(false)

  const cargarMaestro = useCallback(async () => {
    if (!contratoId) return []
    setPkLoading(true)
    try {
      const rows = await fetchPkMaestro(contratoId, token)
      setPkList(rows)
      return rows
    } catch (e) {
      setPkList([])
      setPkMapaAviso(e.message || 'Error al cargar maestro PK.')
      return []
    } finally {
      setPkLoading(false)
    }
  }, [contratoId, token])

  const pkDisplay = pkLabel || (pkIdSeleccionado && pkList.length
    ? (pkList.find((p) => String(p.id) === String(pkIdSeleccionado))?.pk_id || pkLabel || `ID ${pkIdSeleccionado}`)
    : '')

  const abrirMapa = async () => {
    setPkMapaAviso('')
    setMapaOpen(true)
    const rows = await cargarMaestro()
    if (!rows.length) {
      setPkMapaAviso('No hay PK-ID registrados para este contrato. Verifique el maestro PK en SICOE Obra.')
    }
  }

  const resolverPkId = (pkVal, meta) => {
    if (meta?.screenshotOnly) return
    const result = resolverPkMaestroAlmacen(pkVal, pkList, meta?.properties)
    if (!result.ok) {
      setPkMapaAviso(result.error)
      return
    }
    setPkMapaAviso('')
    onSeleccionar?.({
      pk_id_id: result.pk_id_id,
      pk_label: result.pk_label,
      pk_id: result.pk_label,
      tramo: result.tramo || '',
      coordLat: meta?.lat ?? null,
      coordLng: meta?.lng ?? null,
    })
    setMapaOpen(false)
  }

  const btnSec = {
    background: 'transparent',
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 'var(--cc-sm)',
    fontWeight: 600,
    color: t.text,
    cursor: 'pointer',
  }

  const seleccionado = Boolean(pkIdSeleccionado || pkLabel)

  return (
    <div style={compact ? { display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 } : undefined}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: compact ? 0 : 8 }}>
        <button
          type="button"
          onClick={abrirMapa}
          disabled={!contratoId || pkLoading}
          style={{ ...btnSec, background: `${t.primary}18`, borderColor: t.primary, color: t.primary, fontWeight: 700, opacity: pkLoading ? 0.6 : 1 }}
        >
          🗺️ {compact ? 'PK mapa' : 'Seleccionar PK en mapa'}
        </button>
        {seleccionado ? (
          <>
            <span style={{ fontSize: 'var(--cc-sm)', color: t.primary, fontWeight: 700 }}>{pkDisplay || pkLabel}</span>
            <button
              type="button"
              onClick={() => { onLimpiar?.(); setMapaOpen(false); setPkMapaAviso('') }}
              style={{ ...btnSec, color: '#ef4444', borderColor: '#ef444466', padding: '4px 8px' }}
            >
              ×
            </button>
          </>
        ) : null}
      </div>
      {!compact && !pkDisplay && !pkLabel ? (
        <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
          Pulse el botón y haga clic en el polígono del plano para elegir la ubicación.
        </div>
      ) : null}
      {mapaOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4600,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setMapaOpen(false)}
        >
          <div
            style={{
              width: 'min(520px, 94vw)',
              height: '100%',
              background: t.bgCard,
              borderLeft: `1px solid ${t.border}`,
              display: 'flex',
              flexDirection: 'column',
              padding: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text }}>Plano · selección PK</div>
              <button type="button" onClick={() => setMapaOpen(false)} style={btnSec}>
                Cerrar
              </button>
            </div>
            {pkMapaAviso ? (
              <div style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 'var(--cc-caption)', color: '#B91C1C', lineHeight: 1.4 }}>
                {pkMapaAviso}
              </div>
            ) : null}
            {pkLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
                Cargando maestro PK…
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0 }}>
                <PptoFiltroMapaPk
                  t={t}
                  token={token}
                  contratoId={contratoId}
                  onPkPick={resolverPkId}
                  selectedPk={pkDisplay || pkLabel}
                  onClearSelection={onLimpiar}
                  height="100%"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
