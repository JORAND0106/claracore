/**
 * Editor de dibujo del reporte: tipo Nodo / Línea / Polígono,
 * biblioteca de entidades del esquema y guardado según el tipo.
 * Muestra dibujos de referencia de otros reportes con los mismos ítems.
 */
import { useEffect, useMemo, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import {
  esquemaSceneToGeojson,
  featureHuellaDesdeDibujo,
  originFromDibujoEscena,
  snapshotEntidadDesdeEscena,
} from './sicoeDibujoEscenaGeojson'
import { resolveHuellaMapOrigin } from './sicoeDibujoHuellaOrigin'
import { fetchDibujoReferencias, guardarDibujoReporte } from './sicoeDibujoReporteApi'
import { coordRowsDesdePuntosPortada } from './sicoeDibujoCoordsPortada'
import {
  sugerirTipoDibujo,
  tipoDesdeEscenaGuardada,
  validarEscenaPorTipo,
} from './sicoeDibujoTipos'

export default function SicoeDibujoReporteEditor({
  t,
  API_URL,
  token,
  contratoId,
  reporte,
  esDesarrollador: _esDesarrollador = false,
  onClose,
  onGuardado,
}) {
  const nCoordsPortada = Array.isArray(reporte?.puntos)
    ? reporte.puntos.filter((p) => p && (p.norte != null || p.este != null)).length
    : 0

  const escenaPrev = reporte?.dibujo_escena
  const tipoInicial = tipoDesdeEscenaGuardada(escenaPrev, reporte?.dibujo_geojson)
    || sugerirTipoDibujo(nCoordsPortada)

  const [dibujoTipo, setDibujoTipo] = useState(tipoInicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [referencias, setReferencias] = useState([])
  const [refSeleccionada, setRefSeleccionada] = useState(null)

  useEffect(() => {
    let cancelled = false
    const rid = reporte?.id
    if (!rid || !contratoId || !token) {
      setReferencias([])
      return undefined
    }
    ;(async () => {
      try {
        const data = await fetchDibujoReferencias({
          API_URL,
          contratoId,
          token,
          reporteId: rid,
        })
        if (!cancelled) {
          setReferencias(Array.isArray(data?.referencias) ? data.referencias : [])
        }
      } catch {
        if (!cancelled) setReferencias([])
      }
    })()
    return () => { cancelled = true }
  }, [API_URL, contratoId, token, reporte?.id])

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

  const initialScene = Array.isArray(escenaPrev?.objects)
    ? escenaPrev.objects
    : Array.isArray(escenaPrev)
      ? escenaPrev
      : null

  const titulo = reporte?.dibujo_geojson
    ? `Editar dibujo · Reporte #${reporte?.numero_reporte ?? ''}`
    : `Dibujar reporte #${reporte?.numero_reporte ?? ''}`

  const onSaveHuella = async ({ objects, originLngLat }) => {
    setError('')
    // Preferir ancla Gauss de nodos (idempotente al reabrir/guardar sin cambios).
    const resolved = resolveHuellaMapOrigin({
      objects,
      escena: escenaPrev,
      fallbackLngLat: originLngLat,
    })
    const originFijo = resolved?.lngLat || originLngLat
    if (!originFijo) {
      setError('Active el mapa y dibuje sobre el plano de la obra antes de guardar.')
      throw new Error('Sin origen geográfico')
    }
    const valid = validarEscenaPorTipo(objects, dibujoTipo)
    if (!valid.ok) {
      setError(valid.mensaje)
      throw new Error(valid.mensaje)
    }
    const entidadSnap = dibujoTipo === 'nodo'
      ? (snapshotEntidadDesdeEscena(objects) || escenaPrev?.entidad_biblioteca || null)
      : null
    const fc = esquemaSceneToGeojson(objects, originFijo, {
      reporteId: reporte?.id,
      dibujoTipo,
      entidad: entidadSnap,
    })
    if (!fc.features.length) {
      const msg = validarEscenaPorTipo(objects, dibujoTipo).mensaje
        || 'No se pudo generar la geometría del dibujo.'
      setError(msg)
      throw new Error(msg)
    }
    const feat = featureHuellaDesdeDibujo(fc, {
      reporte_id: reporte?.id,
      dibujo_tipo: dibujoTipo,
    })
    if (!feat) {
      setError('No se pudo convertir el dibujo a huella geográfica.')
      throw new Error('Sin feature')
    }
    const lineaSentidoEje = (objects || []).some((o) => o && o.sentidoEje === true)
    setGuardando(true)
    try {
      const data = await guardarDibujoReporte({
        API_URL,
        contratoId,
        token,
        reporteId: reporte.id,
        dibujoGeojson: fc,
        dibujoEscena: {
          version: 3,
          dibujo_tipo: dibujoTipo,
          linea_sentido_eje: lineaSentidoEje,
          entidad_biblioteca: entidadSnap,
          entidad_id: entidadSnap?.id ?? null,
          entidad_nombre: entidadSnap?.nombre ?? null,
          objects,
          origin_lnglat: originFijo,
        },
        origenLngLat: originFijo,
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
        huellaDibujoTipo={dibujoTipo}
        onHuellaDibujoTipoChange={setDibujoTipo}
        referenciasCount={referencias.length}
        initialSceneObjects={initialScene}
        initialCoordRows={initialCoordRows}
        initialOriginLngLat={originFromDibujoEscena(escenaPrev)}
        initialDibujoEscena={escenaPrev && typeof escenaPrev === 'object' ? escenaPrev : null}
        referenciaDibujos={referencias}
        referenciaPanelInfo={refSeleccionada}
        onReferenciaPanelClose={() => setRefSeleccionada(null)}
        onReferenciaClick={(info) => {
          const rid = Number(info?.reporte_id)
          const full = referencias.find((r) => Number(r?.reporte_id) === rid)
          setRefSeleccionada({
            ...(info || {}),
            ...(full || {}),
            items: full?.items || info?.items || [],
            items_detalle: full?.items_detalle || info?.items_detalle || [],
            registros: full?.registros || info?.registros || [],
            costo_directo: full?.costo_directo ?? info?.costo_directo ?? 0,
            numero_reporte: full?.numero_reporte ?? info?.numero_reporte,
          })
        }}
        onSaveHuella={onSaveHuella}
        onClose={onClose}
        onSave={async () => { /* PNG no aplica en huellaMode */ }}
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
            boxShadow: '0 8px 24px rgba(15,23,42,0.35)',
          }}
        >
          {guardando ? 'Guardando dibujo del reporte…' : error}
        </div>
      )}
    </>
  )
}
