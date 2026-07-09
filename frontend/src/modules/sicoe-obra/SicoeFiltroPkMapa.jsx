import { useState } from 'react'
import PptoFiltroMapaPk from '../presupuesto/PptoFiltroMapaPk'
import { buscarPkMaestroPorValorPlano } from './sicoePkResolver'

/**
 * Selector de PK por mapa (polígono del plano), no por número manual.
 */
export default function SicoeFiltroPkMapa({
  t,
  token,
  contratoId,
  pkList = [],
  pkIdSeleccionado = '',
  pkLabel = '',
  onSeleccionar,
  onLimpiar,
  compact = false,
}) {
  const [mapaOpen, setMapaOpen] = useState(false)
  const [pkMapaAviso, setPkMapaAviso] = useState('')

  const pkDisplay = pkLabel || (pkIdSeleccionado && pkList?.length
    ? (pkList.find((p) => String(p.id) === String(pkIdSeleccionado))?.pk_id || `ID ${pkIdSeleccionado}`)
    : '')

  const resolverPkId = (pkVal, meta) => {
    console.log('[pkVal]', pkVal)
    const v = String(pkVal || '').trim()
    if (!v) return
    const row = buscarPkMaestroPorValorPlano(v, pkList)
    if (row?.id == null) {
      setPkMapaAviso(`No se encontró «${v}» en el maestro PK del contrato.`)
      return
    }
    setPkMapaAviso('')
    onSeleccionar?.({
      pk_id_id: String(row.id),
      pk_label: String(row.pk_id || row.civ || v),
      coordLat: meta?.lat ?? null,
      coordLng: meta?.lng ?? null,
      mapaScreenshot: meta?.screenshot ?? null,
      screenshotOnly: !!meta?.screenshotOnly,
    })
    if (!meta?.screenshotOnly) setMapaOpen(false)
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

  return (
    <div style={compact ? { display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 } : undefined}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: compact ? 0 : 8 }}>
        <button
          type="button"
          onClick={() => { setPkMapaAviso(''); setMapaOpen(true) }}
          style={{ ...btnSec, background: `${t.primary}18`, borderColor: t.primary, color: t.primary, fontWeight: 700 }}
        >
          🗺️ {compact ? 'PK mapa' : 'Seleccionar PK en mapa'}
        </button>
        {pkIdSeleccionado ? (
          <>
            <span style={{ fontSize: 'var(--cc-sm)', color: t.primary, fontWeight: 700 }}>{pkDisplay}</span>
            <button type="button" onClick={() => { onLimpiar?.(); setMapaOpen(false) }} style={{ ...btnSec, color: '#ef4444', borderColor: '#ef444466', padding: '4px 8px' }}>
              ×
            </button>
          </>
        ) : null}
      </div>
      {!compact && !pkDisplay ? (
        <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
          Pulse el botón y haga clic en el polígono del plano para filtrar por esa ubicación.
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
            <div style={{ flex: 1, minHeight: 0 }}>
              <PptoFiltroMapaPk
                t={t}
                token={token}
                contratoId={contratoId}
                onPkPick={resolverPkId}
                selectedPk={pkDisplay}
                onClearSelection={onLimpiar}
                height="100%"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
