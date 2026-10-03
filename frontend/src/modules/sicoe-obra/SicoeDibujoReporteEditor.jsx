/**
 * Editor de dibujo del reporte: reutiliza EsquemaEditorModal (mapa + unir + estilos)
 * y guarda GeoJSON + escena como huella del reporte.
 */
import { useMemo, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import {
  esquemaSceneToGeojson,
  featureHuellaDesdeDibujo,
} from './sicoeDibujoEscenaGeojson'
import { guardarDibujoReporte } from './sicoeDibujoReporteApi'
import { coordRowsDesdePuntosPortada } from './sicoeDibujoCoordsPortada'

export default function SicoeDibujoReporteEditor({
  t,
  API_URL,
  token,
  contratoId,
  reporte,
  onClose,
  onGuardado,
}) {
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const mapLocation = useMemo(() => {
    const lat = Number(reporte?.coord_lat)
    const lng = Number(reporte?.coord_lng)
    const loc = {}
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      loc.lat = lat
      loc.lng = lng
    }
    if (reporte?.pk_id_id != null) loc.pkId = String(reporte.pk_id_id)
    if (reporte?.abs_inicio != null) loc.absInicio = reporte.abs_inicio
    if (reporte?.abs_final != null) loc.absFinal = reporte.abs_final
    return Object.keys(loc).length ? loc : null
  }, [reporte])

  const initialCoordRows = useMemo(
    () => coordRowsDesdePuntosPortada(reporte?.puntos),
    [reporte?.puntos],
  )

  const initialScene = Array.isArray(reporte?.dibujo_escena?.objects)
    ? reporte.dibujo_escena.objects
    : Array.isArray(reporte?.dibujo_escena)
      ? reporte.dibujo_escena
      : null

  const titulo = reporte?.dibujo_geojson
    ? `Editar dibujo · Reporte #${reporte?.numero_reporte ?? ''}`
    : `Dibujar reporte #${reporte?.numero_reporte ?? ''}`

  const onSaveHuella = async ({ objects, originLngLat }) => {
    setError('')
    if (!originLngLat) {
      setError('Active el mapa y dibuje sobre el plano de la obra antes de guardar.')
      throw new Error('Sin origen geográfico')
    }
    const fc = esquemaSceneToGeojson(objects, originLngLat, { reporteId: reporte?.id })
    if (!fc.features.length) {
      setError('Dibuje al menos una forma cerrada (polilínea cerrada, rectángulo o triángulo).')
      throw new Error('Sin geometrías')
    }
    const feat = featureHuellaDesdeDibujo(fc, { reporte_id: reporte?.id })
    if (!feat) {
      setError('No se pudo convertir el dibujo a huella geográfica.')
      throw new Error('Sin feature')
    }
    setGuardando(true)
    try {
      const data = await guardarDibujoReporte({
        API_URL,
        contratoId,
        token,
        reporteId: reporte.id,
        dibujoGeojson: fc,
        dibujoEscena: {
          objects,
          origin_lnglat: originLngLat,
          version: 1,
        },
        origenLngLat: originLngLat,
      })
      onGuardado?.(data)
      onClose?.()
    } catch (e) {
      setError(e?.message || 'No se pudo guardar el dibujo')
      throw e
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <EsquemaEditorModal
        t={t}
        title={titulo}
        contratoId={contratoId}
        mapLocation={mapLocation}
        autoActivateMap
        huellaMode
        initialSceneObjects={initialScene}
        initialCoordRows={initialCoordRows}
        onSaveHuella={onSaveHuella}
        onClose={onClose}
        onSave={async () => {
          /* PNG no se usa en este flujo; huellaMode guarda vía onSaveHuella */
        }}
      />
      {(error || guardando) && (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 14000,
            maxWidth: 520,
            margin: '0 auto',
            background: error ? '#dc2626' : t.primary,
            color: '#fff',
            borderRadius: 10,
            padding: '10px 14px',
            fontWeight: 700,
            fontSize: 'var(--cc-sm)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {guardando ? 'Guardando dibujo del reporte…' : error}
        </div>
      )}
    </>
  )
}
