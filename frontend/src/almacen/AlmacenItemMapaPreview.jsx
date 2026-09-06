import PptoFiltroMapaPk from '../modules/presupuesto/PptoFiltroMapaPk'

/**
 * Vista del plano PK (Mapbox compartido con SICOE Obra).
 * Por defecto es solo lectura; con `interactive` permite pan/zoom táctil y capa satelital.
 */
export default function AlmacenItemMapaPreview({
  t,
  token,
  contratoId,
  pkLabel,
  height = 220,
  interactive = false,
  showBasemapToggle = false,
  initialBasemap = null,
}) {
  if (!contratoId || !pkLabel) return null

  return (
    <div
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${t?.border || '#e2e8f0'}`,
        // Solo bloquea gestos en modo preview estático.
        pointerEvents: interactive ? 'auto' : 'none',
        touchAction: interactive ? 'manipulation' : undefined,
        minHeight: typeof height === 'number' ? height : undefined,
        height: typeof height === 'string' ? height : undefined,
      }}
      aria-hidden={!interactive}
      role={interactive ? 'application' : undefined}
      aria-label={interactive ? 'Mapa de ubicación interactivo' : undefined}
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
        showBasemapToggle={Boolean(interactive && showBasemapToggle)}
        initialBasemap={interactive ? (initialBasemap || undefined) : undefined}
      />
    </div>
  )
}
