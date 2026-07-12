import PptoFiltroMapaPk from '../modules/presupuesto/PptoFiltroMapaPk'

/**
 * Vista de solo lectura del plano PK (Mapbox compartido con SICOE Obra).
 * Resalta el PK seleccionado y centra/zoom al sector (como reporte SICOE).
 */
export default function AlmacenItemMapaPreview({
  t,
  token,
  contratoId,
  pkLabel,
  height = 220,
}) {
  if (!contratoId || !pkLabel) return null

  return (
    <div
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${t?.border || '#e2e8f0'}`,
        pointerEvents: 'none',
      }}
      aria-hidden
    >
      <PptoFiltroMapaPk
        t={t}
        token={token}
        contratoId={contratoId}
        selectedPk={pkLabel}
        zoomToSelected
        hideCaption
        onPkPick={() => {}}
        onClearSelection={() => {}}
        height={height}
      />
    </div>
  )
}
