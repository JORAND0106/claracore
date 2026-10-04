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
  snapshotEntidadDesdeEscena,
} from './sicoeDibujoEscenaGeojson'
import { fetchDibujoReferencias, guardarDibujoReporte } from './sicoeDibujoReporteApi'
import { coordRowsDesdePuntosPortada } from './sicoeDibujoCoordsPortada'
import {
  sugerirTipoDibujo,
  tipoDesdeEscenaGuardada,
  validarEscenaPorTipo,
  DIBUJO_TIPOS,
} from './sicoeDibujoTipos'
import { formatCOP } from '../../utils/formatCOP'

const LABELS = { nodo: 'Nodo', linea: 'Línea', poligono: 'Polígono' }

function PanelPropiedadesReferencia({ t, refInfo, onClose }) {
  if (!refInfo) return null
  const items = Array.isArray(refInfo.items) ? refInfo.items : []
  return (
    <div
      data-testid="sicoe-dibujo-ref-panel"
      style={{
        position: 'fixed',
        top: 64,
        right: 12,
        zIndex: 14060,
        width: 'min(300px, calc(100vw - 24px))',
        maxHeight: 'min(70vh, 420px)',
        overflow: 'auto',
        background: t.bgCard || 'rgba(255,255,255,0.97)',
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(15,23,42,0.22)',
        padding: '12px 14px',
        color: t.text,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, letterSpacing: '0.04em' }}>
            REFERENCIA
          </div>
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, marginTop: 2 }}>
            Reporte #{refInfo.numero_reporte ?? refInfo.reporte_id ?? '—'}
          </div>
        </div>
        <button
          type="button"
          aria-label="Cerrar propiedades"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            width: 32,
            height: 32,
            cursor: 'pointer',
            color: t.text,
            fontWeight: 800,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ marginTop: 12, fontSize: 'var(--cc-sm)' }}>
        <div style={{ fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>Ítems</div>
        <div style={{ fontWeight: 600, lineHeight: 1.4 }}>
          {items.length ? items.join(', ') : '—'}
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 'var(--cc-sm)' }}>
        <div style={{ fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>Valor del reporte</div>
        <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {formatCOP(Number(refInfo.costo_directo) || 0)}
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.35 }}>
        Solo lectura · no modifica su dibujo en curso
      </div>
    </div>
  )
}

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
    if (!originLngLat) {
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
    const fc = esquemaSceneToGeojson(objects, originLngLat, {
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
          entidad_biblioteca: entidadSnap,
          entidad_id: entidadSnap?.id ?? null,
          entidad_nombre: entidadSnap?.nombre ?? null,
          objects,
          origin_lnglat: originLngLat,
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

  const barBtn = (active) => ({
    background: active ? t.primary : (t.bgCard || '#fff'),
    color: active ? '#fff' : t.text,
    border: active ? 'none' : `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '7px 12px',
    fontWeight: 800,
    fontSize: 'var(--cc-sm)',
    cursor: 'pointer',
  })

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 14050,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '96vw',
          padding: '8px 12px',
          borderRadius: 12,
          background: t.bgCard || 'rgba(255,255,255,0.96)',
          border: `1px solid ${t.border}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}
        data-testid="sicoe-dibujo-tipo-bar"
      >
        <span style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', color: t.textMuted }}>Tipo:</span>
        {DIBUJO_TIPOS.map((tipo) => (
          <button
            key={tipo}
            type="button"
            data-testid={`sicoe-dibujo-tipo-${tipo}`}
            aria-pressed={dibujoTipo === tipo}
            onClick={() => setDibujoTipo(tipo)}
            style={barBtn(dibujoTipo === tipo)}
          >
            {LABELS[tipo]}
          </button>
        ))}
        {referencias.length > 0 && (
          <span
            style={{
              fontSize: 'var(--cc-caption)',
              fontWeight: 700,
              color: t.textMuted,
              borderLeft: `1px solid ${t.border}`,
              paddingLeft: 8,
              marginLeft: 2,
            }}
            title="Dibujos de otros reportes con los mismos ítems (solo lectura)"
          >
            {referencias.length} ref.
          </span>
        )}
      </div>

      <PanelPropiedadesReferencia
        t={t}
        refInfo={refSeleccionada}
        onClose={() => setRefSeleccionada(null)}
      />

      <EsquemaEditorModal
        t={t}
        title={titulo}
        contratoId={contratoId}
        mapLocation={mapLocation}
        autoActivateMap
        huellaMode
        huellaDibujoTipo={dibujoTipo}
        initialSceneObjects={initialScene}
        initialCoordRows={initialCoordRows}
        referenciaDibujos={referencias}
        onReferenciaClick={(info) => setRefSeleccionada(info)}
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
