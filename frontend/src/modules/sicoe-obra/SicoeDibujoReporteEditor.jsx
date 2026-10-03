/**
 * Editor de dibujo del reporte: tipo Nodo / Línea / Polígono,
 * biblioteca de bloques y guardado según el tipo.
 */
import { useEffect, useMemo, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import {
  esquemaSceneToGeojson,
  featureHuellaDesdeDibujo,
} from './sicoeDibujoEscenaGeojson'
import { guardarDibujoReporte } from './sicoeDibujoReporteApi'
import { coordRowsDesdePuntosPortada } from './sicoeDibujoCoordsPortada'
import {
  sugerirTipoDibujo,
  tipoDesdeEscenaGuardada,
  validarEscenaPorTipo,
  DIBUJO_TIPOS,
} from './sicoeDibujoTipos'
import { snapshotBloque } from './sicoeBloquesNodo'
import { listarBloquesNodo } from './sicoeBloquesNodoApi'
import SicoeBloquesNodoAdminModal from './SicoeBloquesNodoAdminModal'

const LABELS = { nodo: 'Nodo', linea: 'Línea', poligono: 'Polígono' }

export default function SicoeDibujoReporteEditor({
  t,
  API_URL,
  token,
  contratoId,
  reporte,
  esDesarrollador = false,
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
  const [bloques, setBloques] = useState([])
  const [bloqueId, setBloqueId] = useState(escenaPrev?.bloque_nodo_id || escenaPrev?.bloque_nodo?.id || null)
  const [rotacionDeg, setRotacionDeg] = useState(Number(escenaPrev?.bloque_rotacion_deg) || 0)
  const [adminOpen, setAdminOpen] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargarBloques = async () => {
    try {
      const data = await listarBloquesNodo({ API_URL, contratoId, token })
      const list = Array.isArray(data?.bloques) ? data.bloques : []
      setBloques(list)
      setBloqueId((prev) => {
        if (prev && list.some((b) => String(b.id) === String(prev))) return prev
        if (escenaPrev?.bloque_nodo_id && list.some((b) => String(b.id) === String(escenaPrev.bloque_nodo_id))) {
          return escenaPrev.bloque_nodo_id
        }
        return list[0]?.id ?? null
      })
    } catch {
      setBloques([])
    }
  }

  useEffect(() => { void cargarBloques() }, [API_URL, contratoId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const bloqueSel = useMemo(() => {
    const fromList = bloques.find((b) => String(b.id) === String(bloqueId))
    if (fromList) return snapshotBloque(fromList)
    if (escenaPrev?.bloque_nodo) return snapshotBloque(escenaPrev.bloque_nodo)
    return null
  }, [bloques, bloqueId, escenaPrev])

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
    if (dibujoTipo === 'nodo' && !bloqueSel) {
      setError('Elija un bloque de la biblioteca para dibujar el nodo a tamaño real.')
      throw new Error('Sin bloque')
    }
    const fc = esquemaSceneToGeojson(objects, originLngLat, {
      reporteId: reporte?.id,
      dibujoTipo,
      bloque: dibujoTipo === 'nodo' ? bloqueSel : null,
      rotacionDeg: dibujoTipo === 'nodo' ? rotacionDeg : 0,
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
          version: 2,
          dibujo_tipo: dibujoTipo,
          bloque_nodo_id: dibujoTipo === 'nodo' ? (bloqueSel?.id ?? null) : null,
          bloque_nodo: dibujoTipo === 'nodo' ? bloqueSel : null,
          bloque_rotacion_deg: dibujoTipo === 'nodo' ? Number(rotacionDeg) || 0 : 0,
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
        {dibujoTipo === 'nodo' && (
          <>
            <select
              data-testid="sicoe-dibujo-bloque-sel"
              value={bloqueId ?? ''}
              onChange={(e) => setBloqueId(e.target.value || null)}
              style={{
                maxWidth: 220,
                padding: '6px 8px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.text,
                fontWeight: 700,
                fontSize: 'var(--cc-sm)',
              }}
            >
              {bloques.length === 0 && <option value="">Sin bloques — administre la biblioteca</option>}
              {bloques.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre} ({b.ancho_m}×{b.alto_m} m)
                </option>
              ))}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)', fontWeight: 700 }}>
              Giro
              <input
                data-testid="sicoe-dibujo-bloque-rot"
                type="number"
                step="5"
                value={rotacionDeg}
                onChange={(e) => setRotacionDeg(Number(e.target.value) || 0)}
                style={{
                  width: 72,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  fontWeight: 700,
                }}
              />
              °
            </label>
            <button type="button" onClick={() => setAdminOpen(true)} style={barBtn(false)}>
              Biblioteca…
            </button>
          </>
        )}
      </div>

      <EsquemaEditorModal
        t={t}
        title={titulo}
        contratoId={contratoId}
        mapLocation={mapLocation}
        autoActivateMap
        huellaMode
        huellaDibujoTipo={dibujoTipo}
        huellaBloque={dibujoTipo === 'nodo' ? bloqueSel : null}
        huellaBloqueRotacion={dibujoTipo === 'nodo' ? rotacionDeg : 0}
        initialSceneObjects={initialScene}
        initialCoordRows={initialCoordRows}
        onSaveHuella={onSaveHuella}
        onClose={onClose}
        onSave={async () => { /* PNG no aplica en huellaMode */ }}
      />

      {adminOpen && (
        <SicoeBloquesNodoAdminModal
          t={t}
          API_URL={API_URL}
          token={token}
          contratoId={contratoId}
          esDesarrollador={esDesarrollador}
          onClose={() => setAdminOpen(false)}
          onChanged={() => { void cargarBloques() }}
        />
      )}

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
