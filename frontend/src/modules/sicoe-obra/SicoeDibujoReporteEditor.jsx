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
} from './sicoeDibujoTipos'
import { formatCOP } from '../../utils/formatCOP'

function PanelPropiedadesReferencia({ t, refInfo, onClose }) {
  if (!refInfo) return null
  const items = Array.isArray(refInfo.items) ? refInfo.items : []
  const registros = Array.isArray(refInfo.registros) ? refInfo.registros : []
  return (
    <div
      data-testid="sicoe-dibujo-ref-panel"
      style={{
        position: 'fixed',
        top: 64,
        right: 12,
        zIndex: 14080,
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
      <div style={{ marginTop: 12, fontSize: 'var(--cc-sm)' }} data-testid="sicoe-dibujo-ref-registros">
        <div style={{ fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Registros</div>
        {registros.length ? (
          <ul style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
          >
            {registros.map((reg, idx) => {
              const num = reg?.numero_registro ?? '—'
              const item = reg?.item_numero || '—'
              return (
                <li
                  key={`${num}-${item}-${idx}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '5px 8px',
                    borderRadius: 8,
                    background: t.bgMuted || 'rgba(100,116,139,0.08)',
                    border: `1px solid ${t.border}`,
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}
                >
                  <span>Reg. #{num}</span>
                  <span style={{ color: t.textMuted, fontWeight: 700 }}>{item}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <div style={{ fontWeight: 600, color: t.textMuted }}>—</div>
        )}
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

  return (
    <>
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
        onHuellaDibujoTipoChange={setDibujoTipo}
        referenciasCount={referencias.length}
        initialSceneObjects={initialScene}
        initialCoordRows={initialCoordRows}
        referenciaDibujos={referencias}
        onReferenciaClick={(info) => {
          const rid = Number(info?.reporte_id)
          const full = referencias.find((r) => Number(r?.reporte_id) === rid)
          setRefSeleccionada({
            ...(info || {}),
            ...(full || {}),
            items: full?.items || info?.items || [],
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
