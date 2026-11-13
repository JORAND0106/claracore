/**
 * Editor de dibujo del reporte: tipo Nodo / Línea / Polígono,
 * biblioteca de entidades del esquema y guardado según el tipo.
 * Muestra dibujos de referencia de otros reportes con los mismos ítems.
 * C-OUT-23: puente opcional dibujo → gráfico asignable a registros.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import { presentEsquemaExportPopup } from '../../components/esquema/esquemaExportHost'
import { applyEsquemaSaveBundle } from '../../components/esquema/applyEsquemaSaveBundle'
import { composeEsquemaPdf } from '../../components/esquema/esquemaExportPdf'
import { composeEsquemaDxf, esquemaDxfToDataUri } from '../../components/esquema/esquemaExportDxf'
import { prepararEsquemaParaUpload } from '../../comprimirImagen.js'
import {
  esquemaSceneToGeojson,
  featureHuellaDesdeDibujo,
  originFromDibujoEscena,
  snapshotEntidadDesdeEscena,
} from './sicoeDibujoEscenaGeojson'
import { resolveHuellaMapOrigin } from './sicoeDibujoHuellaOrigin'
import { fetchDibujoReferencias, guardarDibujoReporte, sincronizarPuntosTopoDesdeDibujo } from './sicoeDibujoReporteApi'
import {
  coordRowsDesdePuntosPortada,
  puntosPortadaDesdeCoordRows,
} from './sicoeDibujoCoordsPortada'
import {
  sugerirTipoDibujo,
  tipoDesdeEscenaGuardada,
  validarEscenaPorTipo,
} from './sicoeDibujoTipos'
import {
  conLinkDibujoGrafico,
  DIBUJO_GRAFICO_NOMBRE_DEFAULT,
  planPuenteDibujoGrafico,
} from './sicoeDibujoComoGrafico.js'
import {
  buildEsquemaHistorialEntrada,
  nuevoEsquemaId,
  planificarActualizacionVersionEsquema,
  planificarAsignacionEsquema,
} from './sicoeEsquemasReporte.js'
import { dataUriEsquemaAFile } from './sicoeGraficosHelpers.js'
import { subscribeDibujoReporteActualizado } from './sicoeDibujoActualizado'
import SicoeEsquemaAsignarPopup from './SicoeEsquemaAsignarPopup'

async function nextGraficoNumero(API_URL, contratoId, hdrs) {
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/next-grafico`, {
    method: 'POST', headers: hdrs,
  })
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  const j = await res.json()
  if (typeof j === 'number') return j
  if (j?.numero != null) return Number(j.numero)
  if (Array.isArray(j) && j[0] != null) return Number(j[0]?.numero ?? j[0])
  throw new Error('No se obtuvo el consecutivo de gráfico')
}

async function uploadGraficoPng(API_URL, contratoId, hdrs, file, numero) {
  const prepared = await prepararEsquemaParaUpload(file)
  const fd = new FormData()
  fd.append('file', prepared)
  fd.append('numero', String(numero))
  fd.append('descripcion', '')
  const up = await fetch(`${API_URL}/sicoe-obra/${contratoId}/upload-grafico`, {
    method: 'POST',
    headers: { Authorization: hdrs.Authorization },
    body: fd,
  })
  if (!up.ok) throw new Error(await up.text() || `HTTP ${up.status}`)
  return up.json()
}

async function putRegistro(API_URL, contratoId, hdrs, registroId, body) {
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/${registroId}`, {
    method: 'PUT',
    headers: { ...hdrs, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  const data = await res.json().catch(() => null)
  return Array.isArray(data) ? data[0] : data
}

function CcOfferPopup({ t, title, onYes, onNo }) {
  const ui = {
    text: t?.text || '#0f172a',
    muted: t?.textMuted || '#64748b',
    border: t?.border || '#e2e8f0',
    primary: t?.primary || '#0f766e',
    bg: t?.bgCard || '#fff',
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="sicoe-dibujo-offer-grafico"
      style={{
        position: 'fixed', inset: 0, zIndex: 14500,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        background: ui.bg, border: `1px solid ${ui.border}`, borderRadius: 14,
        padding: '20px 22px', width: 'min(420px, 96vw)',
        boxShadow: '0 16px 40px rgba(15,23,42,0.28)',
      }}
      >
        <div style={{ fontWeight: 800, color: ui.text, fontSize: 16, marginBottom: 8 }}>
          {title || '¿Guardar también como gráfico?'}
        </div>
        <div style={{ color: ui.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.4 }}>
          El dibujo ya quedó guardado. Puede crear un gráfico asignable a registros del reporte.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="sicoe-dibujo-offer-no"
            onClick={onNo}
            style={{
              background: 'transparent', border: `1px solid ${ui.border}`, borderRadius: 8,
              padding: '10px 14px', fontWeight: 700, cursor: 'pointer', color: ui.text,
            }}
          >
            No
          </button>
          <button
            type="button"
            data-testid="sicoe-dibujo-offer-si"
            onClick={onYes}
            style={{
              background: ui.primary, border: 'none', borderRadius: 8,
              padding: '10px 14px', fontWeight: 700, cursor: 'pointer', color: '#fff',
            }}
          >
            Sí
          </button>
        </div>
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
  registros = [],
  isSellado = () => false,
  onRegistrosPatched,
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
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [referencias, setReferencias] = useState([])
  const [refSeleccionada, setRefSeleccionada] = useState(null)
  const [refsReloadNonce, setRefsReloadNonce] = useState(0)

  const [offerOpen, setOfferOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignErr, setAssignErr] = useState('')
  const [busyGrafico, setBusyGrafico] = useState(false)
  const pendingBridgeRef = useRef(null)

  const hdrs = useMemo(() => ({
    Authorization: `Bearer ${token || ''}`,
  }), [token])

  useEffect(() => {
    if (!contratoId) return undefined
    return subscribeDibujoReporteActualizado((detail) => {
      if (detail?.contratoId != null && Number(detail.contratoId) !== Number(contratoId)) return
      // Otro reporte del contrato cambió su dibujo: refrescar capas de referencia.
      if (detail?.reporteId != null && String(detail.reporteId) === String(reporte?.id)) return
      setRefsReloadNonce((n) => n + 1)
    })
  }, [contratoId, reporte?.id])

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
  }, [API_URL, contratoId, token, reporte?.id, refsReloadNonce])

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

  const cerrarTrasPuente = (payload) => {
    onGuardado?.(payload)
    onClose?.()
  }

  const ofrecerExportar = async ({ dataUrl, extras, nombre }) => {
    try {
      let pdf = extras?.exports?.pdf || null
      let dxf = extras?.exports?.dxf || null
      if (!pdf && dataUrl) {
        try {
          pdf = await composeEsquemaPdf({
            title: nombre,
            esquemaPng: dataUrl,
            adjuntos: [],
          })
        } catch { /* optional */ }
      }
      if (!dxf && extras?.scene) {
        try {
          const built = composeEsquemaDxf(extras.scene)
          dxf = esquemaDxfToDataUri(built?.dxf || built)
        } catch { /* optional */ }
      }
      void presentEsquemaExportPopup({
        t,
        title: nombre,
        pdf,
        dxf,
      })
      if (token && contratoId != null) {
        void applyEsquemaSaveBundle(dataUrl, { ...extras, exports: { pdf, dxf } }, {
          commitImage: async () => {},
          uploadToCloud: true,
          token,
          folder: {
            contratoId,
            modulo: 'sicoe-obra',
            reporteId: reporte?.id ?? reporte?.numero_reporte,
            reporteNombre: `reporte-${reporte?.numero_reporte ?? reporte?.id ?? ''}`,
            registroId: `esquema-${extras?.entradaNumero ?? 'dibujo'}`,
            registroNombre: nombre,
          },
        }).catch(() => {})
      }
    } catch { /* Exportar no bloquea */ }
  }

  const uploadEntradaGrafico = async ({
    dataUrl, nombre, esquemaId, numero, scene,
  }) => {
    const file = await dataUriEsquemaAFile(dataUrl, 'dibujo-reporte')
    if (!file) throw new Error('No se pudo generar el gráfico del dibujo')
    const eid = esquemaId || nuevoEsquemaId()
    let num = numero
    if (num == null) num = await nextGraficoNumero(API_URL, contratoId, hdrs)
    const up = await uploadGraficoPng(API_URL, contratoId, hdrs, file, num)
    if (!up?.url) throw new Error('No se pudo subir el gráfico del dibujo')
    const entrada = buildEsquemaHistorialEntrada({
      url: up.url,
      numero: up.numero ?? num,
      nombre,
      esquemaId: eid,
      scene,
      reporteId: reporte?.id,
      dibujoReporte: true,
    })
    return entrada
  }

  const aplicarPatches = async (patches) => {
    const applied = []
    for (const p of patches) {
      const rid = p.registro?.id
      if (rid == null || String(rid).startsWith('local_')) continue
      const saved = await putRegistro(API_URL, contratoId, hdrs, rid, p.body)
      applied.push({
        id: rid,
        ...p.body,
        ...(saved?.grafico_url != null ? { grafico_url: saved.grafico_url } : {}),
        ...(saved?.grafico_numero != null ? { grafico_numero: saved.grafico_numero } : {}),
        ...(saved?.grafico_descripcion != null ? { grafico_descripcion: saved.grafico_descripcion } : {}),
        ...(Array.isArray(saved?.graficos_historial)
          ? { graficos_historial: saved.graficos_historial }
          : {}),
      })
    }
    if (!applied.length && patches.length) {
      throw new Error('No se pudo asignar el gráfico')
    }
    onRegistrosPatched?.(applied)
    return applied
  }

  const persistirLinkEnDibujo = async ({
    dibujoEscenaBase, dibujoGeojson, origenLngLat, link, puntosGuardados, dataPrev,
  }) => {
    const escenaConLink = conLinkDibujoGrafico(dibujoEscenaBase, link)
    try {
      const data = await guardarDibujoReporte({
        API_URL,
        contratoId,
        token,
        reporteId: reporte.id,
        dibujoGeojson,
        dibujoEscena: escenaConLink,
        origenLngLat,
      })
      return {
        ...(dataPrev || {}),
        ...(data || {}),
        reporte: {
          ...(dataPrev?.reporte || {}),
          ...(data?.reporte || {}),
          dibujo_escena: escenaConLink,
          puntos: puntosGuardados,
        },
        puntos: puntosGuardados,
      }
    } catch {
      // El gráfico ya está en registros; el link es best-effort.
      return {
        ...(dataPrev || {}),
        reporte: {
          ...(dataPrev?.reporte || {}),
          dibujo_escena: escenaConLink,
          puntos: puntosGuardados,
        },
        puntos: puntosGuardados,
      }
    }
  }

  const onSaveHuella = async ({
    objects,
    originLngLat,
    coordRows = null,
    captureVistaPng = null,
    collectSceneSnapshot = null,
  }) => {
    setError('')
    setAviso('')
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
    const lineaSentidoEje = (objects || []).some((o) => (
      o && o.sentidoEje === true && !(o.type === 'polilinea' && o.closed)
    ))
    const poligonoSentidoEje = (objects || []).some((o) => (
      o && o.sentidoEje === true && o.type === 'polilinea' && o.closed
    ))
    const puntosPortada = puntosPortadaDesdeCoordRows(coordRows)
    const dibujoEscenaBase = {
      version: 3,
      dibujo_tipo: dibujoTipo,
      linea_sentido_eje: lineaSentidoEje,
      poligono_sentido_eje: poligonoSentidoEje,
      entidad_biblioteca: entidadSnap,
      entidad_id: entidadSnap?.id ?? null,
      entidad_nombre: entidadSnap?.nombre ?? null,
      objects,
      origin_lnglat: originFijo,
      ...(escenaPrev?.grafico ? { grafico: escenaPrev.grafico } : {}),
      ...(escenaPrev?.dibujo_grafico ? { dibujo_grafico: escenaPrev.dibujo_grafico } : {}),
    }

    setGuardando(true)
    setError('')
    try {
      const data = await guardarDibujoReporte({
        API_URL,
        contratoId,
        token,
        reporteId: reporte.id,
        dibujoGeojson: fc,
        dibujoEscena: dibujoEscenaBase,
        origenLngLat: originFijo,
      })
      let puntosGuardados = puntosPortada
      try {
        puntosGuardados = await sincronizarPuntosTopoDesdeDibujo({
          API_URL,
          contratoId,
          token,
          reporteId: reporte.id,
          puntos: puntosPortada,
        })
      } catch (topoErr) {
        const rawTopo = String(topoErr?.message || topoErr || '')
        setError(rawTopo.length < 180 && rawTopo
          ? `Dibujo guardado, pero no se sincronizó la portada: ${rawTopo}`
          : 'Dibujo guardado, pero no se pudieron sincronizar las coordenadas con la portada.')
        throw topoErr
      }

      const payloadBase = {
        ...(data || {}),
        reporte: {
          ...(data?.reporte || {}),
          // Siempre el FC recién generado (evita conservar dibujo_geojson stale si la API omite jsonb).
          dibujo_geojson: fc,
          dibujo_escena: dibujoEscenaBase,
          tiene_dibujo: true,
          puntos: puntosGuardados,
        },
        puntos: puntosGuardados,
      }

      const plan = planPuenteDibujoGrafico(dibujoEscenaBase)
      const nombreGrafico = DIBUJO_GRAFICO_NOMBRE_DEFAULT(reporte?.numero_reporte)
      const sceneSnap = typeof collectSceneSnapshot === 'function'
        ? collectSceneSnapshot()
        : { objects, origin_lnglat: originFijo, dibujo_tipo: dibujoTipo }

      // Actualización automática: ya hay gráfico ligado.
      if (plan.modo === 'update' && plan.link) {
        try {
          if (typeof captureVistaPng !== 'function') {
            throw new Error('Captura no disponible')
          }
          const dataUrl = await captureVistaPng({ title: plan.link.nombre || nombreGrafico })
          const entrada = await uploadEntradaGrafico({
            dataUrl,
            nombre: plan.link.nombre || nombreGrafico,
            esquemaId: plan.link.esquema_id,
            numero: plan.link.numero,
            scene: sceneSnap,
          })
          const { patches } = planificarActualizacionVersionEsquema({
            registros,
            entradaNueva: entrada,
            isSellado,
          })
          if (patches.length) await aplicarPatches(patches)
          const payloadFinal = await persistirLinkEnDibujo({
            dibujoEscenaBase,
            dibujoGeojson: fc,
            origenLngLat: originFijo,
            link: {
              esquema_id: entrada.esquema_id,
              numero: entrada.numero,
              nombre: entrada.nombre,
              url: entrada.url,
            },
            puntosGuardados,
            dataPrev: payloadBase,
          })
          void ofrecerExportar({
            dataUrl,
            extras: { scene: sceneSnap, entradaNumero: entrada.numero },
            nombre: entrada.nombre,
          })
          cerrarTrasPuente(payloadFinal)
          return
        } catch (grafErr) {
          setAviso('Dibujo guardado. No se pudo actualizar el gráfico.')
          console.error('[SicoeDibujo] actualizar gráfico', grafErr)
          cerrarTrasPuente(payloadBase)
          return
        }
      }

      // Primera vez: ofrecer popup. El dibujo ya está guardado.
      pendingBridgeRef.current = {
        payloadBase,
        dibujoEscenaBase,
        dibujoGeojson: fc,
        origenLngLat: originFijo,
        puntosGuardados,
        captureVistaPng,
        sceneSnap,
        nombreGrafico,
      }
      setOfferOpen(true)
    } catch (e) {
      const raw = String(e?.message || e || '')
      let msg = 'No se pudo guardar el dibujo. Revise la conexión e intente de nuevo.'
      if (/403|permiso|editar/i.test(raw)) {
        msg = 'No tiene permiso para guardar el dibujo de este reporte.'
      } else if (/422|geometr/i.test(raw)) {
        msg = raw.length < 180 ? raw : 'El dibujo no tiene una geometría válida para guardar.'
      } else if (/network|fetch|failed|timeout|timed out/i.test(raw)) {
        msg = 'Error de red al guardar. El dibujo sigue en pantalla: puede reintentar.'
      } else if (/portada|coordenadas|puntos/i.test(raw)) {
        msg = raw.length < 200 ? raw : 'No se pudieron sincronizar las coordenadas con la portada.'
      } else if (raw && raw.length < 180 && !/^Error \d+/.test(raw)) {
        msg = raw
      }
      setError(msg)
      throw e
    } finally {
      setGuardando(false)
    }
  }

  const onOfferNo = () => {
    const pending = pendingBridgeRef.current
    setOfferOpen(false)
    pendingBridgeRef.current = null
    if (pending?.payloadBase) cerrarTrasPuente(pending.payloadBase)
    else onClose?.()
  }

  const onOfferSi = () => {
    setOfferOpen(false)
    setAssignErr('')
    setAssignOpen(true)
  }

  const onAssignCancel = () => {
    if (busyGrafico) return
    const pending = pendingBridgeRef.current
    setAssignOpen(false)
    setAssignErr('')
    pendingBridgeRef.current = null
    // Cancelar asignación: dibujo ya guardado, sin gráfico.
    if (pending?.payloadBase) cerrarTrasPuente(pending.payloadBase)
    else onClose?.()
  }

  const onAssignConfirm = async (ids) => {
    if (!ids?.length) {
      setAssignErr('Seleccione al menos un registro')
      return
    }
    const pending = pendingBridgeRef.current
    if (!pending) {
      setAssignOpen(false)
      onClose?.()
      return
    }
    setBusyGrafico(true)
    setAssignErr('')
    try {
      if (typeof pending.captureVistaPng !== 'function') {
        throw new Error('No se pudo generar el gráfico')
      }
      const dataUrl = await pending.captureVistaPng({ title: pending.nombreGrafico })
      const entrada = await uploadEntradaGrafico({
        dataUrl,
        nombre: pending.nombreGrafico,
        scene: pending.sceneSnap,
      })
      const { patches } = planificarAsignacionEsquema({
        registros,
        entrada,
        idsDeseados: ids,
        isSellado,
      })
      if (!patches.length) throw new Error('Seleccione al menos un registro')
      await aplicarPatches(patches)
      const payloadFinal = await persistirLinkEnDibujo({
        dibujoEscenaBase: pending.dibujoEscenaBase,
        dibujoGeojson: pending.dibujoGeojson,
        origenLngLat: pending.origenLngLat,
        link: {
          esquema_id: entrada.esquema_id,
          numero: entrada.numero,
          nombre: entrada.nombre,
          url: entrada.url,
        },
        puntosGuardados: pending.puntosGuardados,
        dataPrev: pending.payloadBase,
      })
      setAssignOpen(false)
      pendingBridgeRef.current = null
      void ofrecerExportar({
        dataUrl,
        extras: { scene: pending.sceneSnap, entradaNumero: entrada.numero },
        nombre: entrada.nombre,
      })
      cerrarTrasPuente(payloadFinal)
    } catch (e) {
      console.error('[SicoeDibujo] crear gráfico', e)
      setAssignErr('No se pudo crear el gráfico. El dibujo quedó guardado.')
      setAviso('Dibujo guardado. No se pudo crear el gráfico.')
      // Mantener popup abierto con error; usuario puede cancelar y conservar el dibujo.
    } finally {
      setBusyGrafico(false)
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
        iaDoc={{
          ambito: 'sicoe_huella',
          docKey: `sicoe-huella-${reporte?.id || reporte?.numero_reporte || 'nuevo'}`,
        }}
        draftModule="sicoe_huella"
        draftEntityId={reporte?.id || reporte?.numero_reporte || 'nuevo'}
        onSaveHuella={onSaveHuella}
        onClose={onClose}
        onSave={async () => { /* PNG no aplica en huellaMode */ }}
      />

      {offerOpen && (
        <CcOfferPopup
          t={t}
          title="¿Guardar también como gráfico?"
          onYes={onOfferSi}
          onNo={onOfferNo}
        />
      )}

      {assignOpen && (
        <SicoeEsquemaAsignarPopup
          t={t}
          registros={registros}
          isSellado={isSellado}
          initialIds={[]}
          titulo="Asignar dibujo a registros"
          busy={busyGrafico}
          hostError={assignErr}
          onCancel={onAssignCancel}
          onConfirm={(ids) => void onAssignConfirm(ids)}
        />
      )}

      {(error || aviso || guardando) && (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 14600,
            maxWidth: 560,
            margin: '0 auto',
            background: error ? '#dc2626' : (aviso ? '#b45309' : t.primary),
            color: '#fff',
            borderRadius: 10,
            padding: '10px 14px',
            fontWeight: 700,
            fontSize: 'var(--cc-sm)',
            boxShadow: '0 8px 24px rgba(15,23,42,0.35)',
          }}
        >
          {error || aviso || 'Guardando dibujo del reporte…'}
        </div>
      )}
    </>
  )
}
