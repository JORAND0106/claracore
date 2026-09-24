import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import IdeaClaraModal from './IdeaClaraModal'
import TemaRichEditor from './TemaRichEditor'
import BitacoraAdjuntos, { BitacoraClipAdjuntos } from './BitacoraAdjuntos'
import BitacoraClimaField from './BitacoraClimaField'
import ActividadesEventoGrid from './ActividadesEventoGrid'
import BitacoraMaterialUbicacionModal from './BitacoraMaterialUbicacionModal'
import EquipoCatalogSelect from './EquipoCatalogSelect'
import MaterialTipoCatalogSelect from './MaterialTipoCatalogSelect'
import NombreRrhhAutocomplete from './NombreRrhhAutocomplete'
import PersonalAsistenciaPanel from './PersonalAsistenciaPanel'
import BitacoraReportePersonalModal from './BitacoraReportePersonalModal'
import EventoBloquesSection from './EventoBloquesSection'
import { eventosFromEntrada, eventosParaPayload, debeMostrarObservacionesDia } from './eventoBloquesHelpers'
import VisitantesEventoGrid, { emptyVisitanteRow, visitantesFromDetalle } from './VisitantesEventoGrid'
import {
  actividadesFromDetalle,
  actividadesParaPayload,
  emptyActividadRow,
} from './bitacoraEventoActividades'
import {
  HINT_OPERADOR_DESDE_RRHH,
  HINT_REGISTRAR_EN_RRHH,
  asistenciaFromEntrada,
  asistenciaParaPayload,
  mapaEstadosRrhh,
  mergePersonalCantidades,
  nombreCompletoRrhh,
  operadorEstaEnRrhh,
  personalAgregadoDesdeAsistencia,
  puedeUsarCargoCantidadAsistencia,
  recoverPersonalManual,
  stripTramoFilasAutocompletar,
} from './personalAsistenciaHelpers'
import {
  HINT_DOCUMENTACION_NO_APROBADA,
  docValidacionEsAprobado,
  policySnapshotAsistenciaRrhh,
} from './bitacoraAsistenciaRrhhPolicy'
import { puedeEditarEntradaBitacora, esReporteAtrasadoLocal } from './bitacoraPermisos'
import {
  EVENTO_TIPOS,
  eventoTieneDestinatario,
  horaInicioLaboresInicial,
  hoyISOBogota,
  labelEventoTipo,
  personalPlantillaVacia,
} from './bitacoraConstants'
import { debeUsarGrillaDiarioCompacta } from './bitacoraDiarioMobile'
import { bitacoraSheetCssVars, bitacoraSheetStyles } from './bitacoraSheetStyles'
import { labelTramoBitacora, normalizeTramoValue } from './bitacoraTramoHelpers'
import { API_BASE } from '../../apiBase'
import { htmlToPlainText, isRichTextEmpty, plainTextToHtml } from './richTextUtils'
import {
  seguimientoModalOverlayStyle,
  seguimientoModalSheetStyle,
  useSeguimientoCompact,
} from './seguimientoShared'

function emptyUso() {
  return {
    equipo_id: null,
    equipo_nombre: '',
    tipo: 'equipo',
    operador: '',
    operador_rrhh_id: null,
    tramo: '',
    cantidad: 1,
    hora_inicio: '',
    hora_fin: '',
    hora_intermedia: '',
    horas_intermedias: [],
    preoperacionales: [],
  }
}

function emptyMaterial() {
  return {
    movimiento: 'ingreso',
    tipo_material: '',
    proveedor: '',
    cantidad: '',
    placa: '',
    numeros_vale: '',
    adjuntos: [],
    tramo: '',
    ubicacion_pk: '',
    ubicacion_pk_id: null,
    ubicacion_tramo: '',
    ubicacion_costado: '',
    ubicacion_infraestructura: '',
    ubicacion_lat: null,
    ubicacion_lng: null,
  }
}

function materialFromApi(m) {
  return {
    ...emptyMaterial(),
    movimiento: m.movimiento === 'salida' ? 'salida' : 'ingreso',
    tipo_material: m.tipo_material || '',
    proveedor: m.proveedor || '',
    cantidad: m.cantidad != null && m.cantidad !== '' ? m.cantidad : '',
    placa: m.placa || '',
    numeros_vale: m.numeros_vale || '',
    adjuntos: Array.isArray(m.adjuntos)
      ? m.adjuntos
      : (Array.isArray(m.vales) && m.vales[0] && typeof m.vales[0] === 'object' ? m.vales : []),
    tramo: normalizeTramoValue(m.tramo) || '',
    ubicacion_pk: m.ubicacion_pk || m.pk_label || '',
    ubicacion_pk_id: m.ubicacion_pk_id != null ? m.ubicacion_pk_id : (m.pk_id_id != null ? m.pk_id_id : null),
    ubicacion_tramo: m.ubicacion_tramo || '',
    ubicacion_costado: m.ubicacion_costado || m.costado || m.calzada || '',
    ubicacion_infraestructura: m.ubicacion_infraestructura || m.infraestructura || '',
    ubicacion_lat: m.ubicacion_lat != null && m.ubicacion_lat !== '' ? Number(m.ubicacion_lat) : null,
    ubicacion_lng: m.ubicacion_lng != null && m.ubicacion_lng !== '' ? Number(m.ubicacion_lng) : null,
  }
}

function mergePersonalPlantilla(plantillaRows, prevPersonal) {
  const base = Array.isArray(plantillaRows) && plantillaRows.length
    ? plantillaRows.map((r) => ({ cargo: r.cargo, cantidad: 0, cargo_otro: '' }))
    : personalPlantillaVacia()
  const prev = Array.isArray(prevPersonal) ? prevPersonal : []
  const byNorm = new Map()
  prev.forEach((p) => {
    const key = String(p.cargo || '').trim().toLowerCase()
    if (key) byNorm.set(key, p)
  })
  const merged = base.map((row) => {
    const found = byNorm.get(String(row.cargo).toLowerCase())
    if (!found) return row
    return {
      ...row,
      cantidad: found.cantidad || 0,
      cargo_otro: found.cargo_otro || '',
    }
  })
  // Cargos del reporte que aún no están en plantilla (históricos)
  const known = new Set(merged.map((r) => String(r.cargo).toLowerCase()))
  prev.forEach((p) => {
    const c = String(p.cargo || '').trim()
    if (!c || known.has(c.toLowerCase()) || c.toLowerCase() === 'otro') return
    // Insertar antes de Otro
    const idx = merged.findIndex((r) => r.cargo === 'Otro')
    const row = { cargo: c, cantidad: p.cantidad || 0, cargo_otro: '' }
    if (idx >= 0) merged.splice(idx, 0, row)
    else merged.push(row)
    known.add(c.toLowerCase())
  })
  return merged
}

function emptyEventoDetalle(tipo) {
  const base = { actividades: [emptyActividadRow()] }
  if (tipo === 'incidente_sst') {
    return {
      ...base,
      descripcion_incidente: '',
      lugar: '',
      personas_involucradas: '',
      acciones_inmediatas: '',
      gravedad: 'leve',
      requiere_seguimiento: false,
    }
  }
  if (tipo === 'visita_terceros') {
    return {
      ...base,
      visitantes: '',
      visitantes_lista: [emptyVisitanteRow()],
      entidad: '',
      motivo: '',
    }
  }
  return base
}

function usoFromApi(u) {
  const horas = Array.isArray(u.horas_intermedias) ? u.horas_intermedias : []
  const primera = horas[0]?.hora ? String(horas[0].hora).slice(0, 5) : ''
  let opRrhh = null
  try {
    opRrhh = u?.operador_rrhh_id != null && u.operador_rrhh_id !== ''
      ? Number(u.operador_rrhh_id)
      : null
    if (!Number.isFinite(opRrhh)) opRrhh = null
  } catch { opRrhh = null }
  return {
    ...emptyUso(),
    ...u,
    operador: u.operador || '',
    operador_rrhh_id: opRrhh,
    tramo: normalizeTramoValue(u.tramo) || '',
    hora_inicio: String(u.hora_inicio || '').slice(0, 5),
    hora_fin: String(u.hora_fin || '').slice(0, 5),
    hora_intermedia: primera,
    horas_intermedias: horas,
    preoperacionales: Array.isArray(u.preoperacionales) ? u.preoperacionales : [],
  }
}

/**
 * Editor modal Excel-like: Reporte Diario / Reporte de Evento.
 */
export default function BitacoraEntradaEditor({
  t,
  api,
  usuario,
  token,
  contratoId,
  permisos,
  modo,
  entrada = null,
  /** Fecha YYYY-MM-DD al crear desde el calendario (día seleccionado). */
  fechaInicial = null,
  onClose,
  onSaved,
  viewportCompact: viewportCompactProp,
}) {
  const viewportCompactHook = useSeguimientoCompact()
  const viewportCompact = viewportCompactProp ?? viewportCompactHook
  const grillaCompacta = debeUsarGrillaDiarioCompacta(viewportCompact)
  const ui = bitacoraSheetStyles(t)
  const sheetCssVars = bitacoraSheetCssVars(t)
  const esNuevo = !entrada?.id
  // Unificación: solo Reporte Diario; eventos viven como bloques internos.
  const tipo = 'diario'
  void modo
  const editable = useMemo(() => {
    if (esNuevo) return Boolean(permisos?.crear)
    return puedeEditarEntradaBitacora(
      entrada?.tipo === 'evento' ? { ...entrada, tipo: 'diario', estado: entrada.estado || 'abierto' } : entrada,
      permisos,
    )
  }, [esNuevo, entrada, permisos])

  const [fecha, setFecha] = useState(
    entrada?.fecha || (fechaInicial ? String(fechaInicial).slice(0, 10) : '') || hoyISOBogota(),
  )
  const [tramosCatalogo, setTramosCatalogo] = useState([])
  const [horaInicio, setHoraInicio] = useState(() => horaInicioLaboresInicial(entrada))
  const [clima, setClima] = useState({
    clima_codigo: entrada?.clima_codigo ?? null,
    clima_temp_c: entrada?.clima_temp_c ?? null,
    clima_descripcion: entrada?.clima_descripcion || '',
    clima_editado_manual: Boolean(entrada?.clima_editado_manual),
  })
  const [personal, setPersonal] = useState(() => {
    const prev = Array.isArray(entrada?.personal) ? entrada.personal : []
    return mergePersonalPlantilla(personalPlantillaVacia(), prev)
  })
  const [asistencia, setAsistencia] = useState(() => asistenciaFromEntrada(entrada))
  const [personalManual, setPersonalManual] = useState(() => (
    recoverPersonalManual(entrada?.personal, entrada?.asistencia_colaboradores)
  ))
  const [rrhhCatalogo, setRrhhCatalogo] = useState([])
  const [excluidosRrhhIds, setExcluidosRrhhIds] = useState([])
  const [cargosCatalogo, setCargosCatalogo] = useState([])
  const [contratoNumero, setContratoNumero] = useState('')
  const [asistenciaRrhhPolicy, setAsistenciaRrhhPolicy] = useState(() =>
    policySnapshotAsistenciaRrhh({ contratoId }),
  )
  const [usos, setUsos] = useState(
    Array.isArray(entrada?.equipos_uso) && entrada.equipos_uso.length
      ? entrada.equipos_uso.map(usoFromApi)
      : [emptyUso()],
  )
  const [materiales, setMateriales] = useState(
    Array.isArray(entrada?.materiales) && entrada.materiales.length
      ? entrada.materiales.map(materialFromApi)
      : [emptyMaterial()],
  )
  const [eventos, setEventos] = useState(() => eventosFromEntrada(entrada))
  const [eventoTipo, setEventoTipo] = useState(entrada?.evento_tipo || 'reporte_actividades')
  const [dirigidoA, setDirigidoA] = useState(entrada?.dirigido_a || '')
  const [eventoDetalle, setEventoDetalle] = useState(() => {
    const tipoIni = entrada?.evento_tipo || 'reporte_actividades'
    const base = entrada?.evento_detalle && typeof entrada.evento_detalle === 'object'
      ? { ...emptyEventoDetalle(tipoIni), ...entrada.evento_detalle }
      : emptyEventoDetalle(tipoIni)
    const withActs = { ...base, actividades: actividadesFromDetalle(base) }
    if (tipoIni === 'visita_terceros' || Array.isArray(base.visitantes_lista) || base.visitantes) {
      return { ...withActs, visitantes_lista: visitantesFromDetalle(base) }
    }
    return withActs
  })
  const [cuerpoHtml, setCuerpoHtml] = useState(entrada?.cuerpo_html || '')
  const [imagenes, setImagenes] = useState(Array.isArray(entrada?.imagenes) ? entrada.imagenes : [])
  const [localId, setLocalId] = useState(entrada?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [claraOpen, setClaraOpen] = useState(false)
  const [autoBusy, setAutoBusy] = useState(false)
  /** @type {[null|{kind:'material'|'actividad', idx:number, bloqueId?:string}, Function]} */
  const [mapTarget, setMapTarget] = useState(null)
  const [contratoCentro, setContratoCentro] = useState({ lat: 4.711, lng: -74.0721 })
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [reportePersonalOpen, setReportePersonalOpen] = useState(false)
  const [contratoMeta, setContratoMeta] = useState({})

  // Plantilla de cargos: se mantiene para sync de catálogo; el resumen se deriva de asistencia.
  useEffect(() => {
    if (tipo !== 'diario' || !api?.listBitacoraCargos) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.listBitacoraCargos()
        if (cancelled) return
        const plantilla = Array.isArray(data?.plantilla) ? data.plantilla : []
        setPersonal((prev) => mergePersonalPlantilla(plantilla, prev))
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [api, tipo])

  // Catálogo de tramos (mismo maestro PK que Materiales / Presupuesto).
  useEffect(() => {
    if (tipo !== 'diario' || !contratoId || !token) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/presupuesto/${contratoId}/maestro-ubicacion-pk`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok || cancelled) return
        const data = await res.json()
        const list = (Array.isArray(data?.tramos) ? data.tramos : [])
          .map((x) => normalizeTramoValue(x))
          .filter(Boolean)
        if (!cancelled) setTramosCatalogo(list)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [tipo, contratoId, token])

  // Catálogo RRHH (Personal en obra — autocompletado).
  // Consolidado y cargos se derivan aquí (sin esperar /rrhh-cargos).
  useEffect(() => {
    if (tipo !== 'diario' || !api?.listBitacoraRrhhTrabajadores) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.listBitacoraRrhhTrabajadores()
        const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
        const excluidos = Array.isArray(data?.excluidos_rrhh_ids) ? data.excluidos_rrhh_ids : []
        if (!cancelled) {
          setRrhhCatalogo(items)
          setExcluidosRrhhIds(excluidos)
          const fromTrab = []
          const seen = new Set()
          for (const t of items) {
            const c = String(t?.cargo_aspira || t?.cargo || '').trim()
            if (!c) continue
            const key = c.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            fromTrab.push(c)
          }
          setCargosCatalogo(fromTrab)
        }
      } catch { /* sin permiso / red */ }
    })()
    return () => { cancelled = true }
  }, [api, tipo, asistenciaRrhhPolicy?.requiere_rrhh_aprobado])

  // Política Bitácora ↔ RRHH (corte / contrato 3 / toggle).
  useEffect(() => {
    if (!api?.getBitacoraAsistenciaRrhhPolicy) {
      setAsistenciaRrhhPolicy(policySnapshotAsistenciaRrhh({ contratoId }))
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getBitacoraAsistenciaRrhhPolicy()
        if (!cancelled && data && typeof data === 'object') {
          setAsistenciaRrhhPolicy(data)
        }
      } catch {
        if (!cancelled) {
          setAsistenciaRrhhPolicy(policySnapshotAsistenciaRrhh({ contratoId }))
        }
      }
    })()
    return () => { cancelled = true }
  }, [api, contratoId])

  // Resumen: live RRHH si abierto; snapshot si cerrado; + registro directo temporal.
  const resumenCongelado = !editable && String(entrada?.estado || '').toLowerCase() === 'cerrado'
  const gateRrhhAprobado = Boolean(asistenciaRrhhPolicy?.requiere_rrhh_aprobado)
  const permitirCargoCantidad = puedeUsarCargoCantidadAsistencia({
    esDesarrollador: Boolean(permisos?.esDesarrollador),
    contratoNumero,
    permiteCargoCuadrilla: Boolean(asistenciaRrhhPolicy?.permite_cargo_cuadrilla),
  })
  useEffect(() => {
    if (tipo !== 'diario') return
    const liveMap = resumenCongelado ? null : mapaEstadosRrhh(rrhhCatalogo)
    const aggRrhh = personalAgregadoDesdeAsistencia(asistencia, { liveEstadosByRrhhId: liveMap })
    const agg = mergePersonalCantidades(aggRrhh, personalManual)
    setPersonal((prev) => mergePersonalPlantilla(prev, agg.map((r) => ({
      cargo: r.cargo,
      cantidad: r.cantidad,
      cargo_otro: '',
    }))))
  }, [asistencia, tipo, rrhhCatalogo, resumenCongelado, personalManual])

  useEffect(() => {
    if (!contratoId || !token) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const { API_BASE } = await import('../../apiBase')
        const res = await fetch(`${API_BASE}/contratos/${contratoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) {
          if (data?.numero) setContratoNumero(String(data.numero))
          setContratoMeta({
            numero: data?.numero != null ? String(data.numero) : '',
            objeto: data?.objeto != null ? String(data.objeto) : '',
            contratista: data?.contratista != null ? String(data.contratista) : '',
            logo_contratista: data?.logo_contratista || '',
          })
        }
        let lat = data?.centro_lat != null ? Number(data.centro_lat) : null
        let lng = data?.centro_lng != null ? Number(data.centro_lng) : null
        if ((lat == null || lng == null) && data?.plano_geojson) {
          // fallback simple: no parsear geojson completo aquí
        }
        if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
          setContratoCentro({ lat, lng })
        }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [contratoId, token])

  const exportarPdfDia = async ({ preview = false } = {}) => {
    if (!api?.exportBitacoraPdfBlob || !fecha) return
    setPdfBusy(true)
    setError('')
    try {
      const blob = await api.exportBitacoraPdfBlob(fecha, {
        entradaId: localId || undefined,
      })
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      if (preview) {
        setPdfPreviewOpen(true)
        setOkMsg('Vista previa lista.')
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = `bitacora_${fecha}.pdf`
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        setOkMsg('PDF descargado.')
      }
    } catch (e) {
      setError(e.message || 'No se pudo generar el PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  useEffect(() => {
    setEventoDetalle((d) => {
      const next = { ...emptyEventoDetalle(eventoTipo), ...d }
      if (eventoTipo === 'visita_terceros') {
        next.visitantes_lista = visitantesFromDetalle(next)
      }
      return next
    })
  }, [eventoTipo])

  const btnPrimary = {
    background: t.primary, color: '#fff', border: 'none', borderRadius: 6,
    padding: '7px 12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1, fontSize: 'var(--cc-sm)',
  }
  const btnGhost = {
    background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6,
    padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 'var(--cc-sm)',
  }

  const buildUsosPayload = () => usos
    .filter((u) => String(u.equipo_nombre || '').trim())
    .map((u, i) => {
      // <input type="time"> vacío muestra "--:-- -----"; nunca enviar placeholders.
      const limpiaHora = (v) => {
        const s = String(v || '').trim()
        if (!s || /^[\-–—_:.\s]+$/.test(s)) return null
        return s.slice(0, 5)
      }
      const inter = limpiaHora(u.hora_intermedia)
      const horas = inter
        ? [{ hora: inter, ...(u.horas_intermedias?.[0]?.nota ? { nota: u.horas_intermedias[0].nota } : {}) }]
        : []
      let opRrhh = null
      try {
        opRrhh = u.operador_rrhh_id != null && u.operador_rrhh_id !== ''
          ? Number(u.operador_rrhh_id)
          : null
        if (!Number.isFinite(opRrhh)) opRrhh = null
      } catch { opRrhh = null }
      return {
        equipo_id: u.equipo_id,
        equipo_nombre: u.equipo_nombre,
        tipo: u.tipo || 'equipo',
        operador: u.operador || '',
        operador_rrhh_id: opRrhh,
        tramo: normalizeTramoValue(u.tramo),
        cantidad: Number(u.cantidad) || 1,
        hora_inicio: limpiaHora(u.hora_inicio),
        hora_fin: limpiaHora(u.hora_fin),
        horas_intermedias: horas,
        preoperacionales: u.preoperacionales || [],
        orden: i,
      }
    })

  const materialRowNoVacia = (m) => (
    m.tipo_material || m.proveedor || m.placa || m.numeros_vale
    || Number(m.cantidad) > 0 || (m.adjuntos || []).length
    || m.ubicacion_pk || m.ubicacion_pk_id != null
    || m.ubicacion_tramo || m.ubicacion_costado || m.ubicacion_infraestructura
    || (m.ubicacion_lat != null && m.ubicacion_lng != null)
  )

  const guardarDiario = async () => {
    setBusy(true)
    setError('')
    setOkMsg('')
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    try {
      const asistenciaPayload = asistenciaParaPayload(asistencia)
      const sinRrhh = asistenciaPayload.filter(
        (r) => r.nombre && r.rrhh_trabajador_id == null && r.origen !== 'legado',
      )
      // Tras el corte (y en contrato 3 activado): identificación individual obligatoria.
      // Antes del corte / contrato 3 exento: se permite cargo/cuadrilla sin RRHH id.
      if (sinRrhh.length && (gateRrhhAprobado || !permitirCargoCantidad)) {
        setError(HINT_REGISTRAR_EN_RRHH)
        setBusy(false)
        return
      }
      if (gateRrhhAprobado) {
        const noAprob = asistenciaPayload.filter((r) => {
          if (r.rrhh_trabajador_id == null) return false
          const trab = (rrhhCatalogo || []).find((t) => Number(t.id) === Number(r.rrhh_trabajador_id))
          if (!trab) return false
          return !docValidacionEsAprobado(trab.doc_validacion_estado)
        })
        if (noAprob.length) {
          setError(HINT_DOCUMENTACION_NO_APROBADA)
          setBusy(false)
          return
        }
      }
      const sinTramoPersonal = asistenciaPayload.filter((r) => r.nombre && !normalizeTramoValue(r.tramo))
      if (sinTramoPersonal.length) {
        setError('Cada colaborador en Personal debe tener Tramo asignado.')
        setBusy(false)
        return
      }
      const usosConEquipo = usos.filter((u) => String(u.equipo_nombre || '').trim())
      const sinTramoUso = usosConEquipo.filter((u) => !normalizeTramoValue(u.tramo))
      if (sinTramoUso.length) {
        setError('Cada fila de Maquinaria con equipo debe tener Tramo asignado.')
        setBusy(false)
        return
      }
      const sinOperadorRrhh = usosConEquipo.filter(
        (u) => !operadorEstaEnRrhh(u, rrhhCatalogo),
      )
      if (sinOperadorRrhh.length) {
        setError(HINT_OPERADOR_DESDE_RRHH)
        setBusy(false)
        return
      }
      const matsFilled = materiales.filter(materialRowNoVacia)
      const sinTramoMat = matsFilled.filter((m) => !normalizeTramoValue(m.tramo))
      if (sinTramoMat.length) {
        setError(
          'Debe seleccionar un Tramo en cada fila de Materiales. '
          + 'Hay filas con datos que aún muestran «Seleccione…» en Tramo.',
        )
        setBusy(false)
        return
      }
      const liveMap = mapaEstadosRrhh(rrhhCatalogo)
      const personalRrhh = personalAgregadoDesdeAsistencia(
        asistenciaPayload,
        { liveEstadosByRrhhId: liveMap },
      )
      const personalManualPayload = permitirCargoCantidad
        ? mergePersonalCantidades(personalManual)
        : []
      const personalPayload = mergePersonalCantidades(personalRrhh, personalManualPayload)
      const materialesPayload = matsFilled
        .map((m) => ({
          movimiento: m.movimiento === 'salida' ? 'salida' : 'ingreso',
          tipo_material: m.tipo_material || '',
          proveedor: m.proveedor || '',
          cantidad: Number(m.cantidad) || 0,
          placa: m.placa || '',
          numeros_vale: m.numeros_vale || '',
          adjuntos: (m.adjuntos || []).slice(0, 2),
          tramo: normalizeTramoValue(m.tramo),
          ...(m.ubicacion_pk ? { ubicacion_pk: m.ubicacion_pk } : {}),
          ...(m.ubicacion_pk_id != null ? { ubicacion_pk_id: m.ubicacion_pk_id } : {}),
          ...(m.ubicacion_tramo ? { ubicacion_tramo: m.ubicacion_tramo } : {}),
          ...(m.ubicacion_costado ? { ubicacion_costado: m.ubicacion_costado } : {}),
          ...(m.ubicacion_infraestructura ? { ubicacion_infraestructura: m.ubicacion_infraestructura } : {}),
          ...(m.ubicacion_lat != null && m.ubicacion_lng != null
            ? { ubicacion_lat: Number(m.ubicacion_lat), ubicacion_lng: Number(m.ubicacion_lng) }
            : {}),
        }))
      const usosPayload = buildUsosPayload()
      const payload = {
        fecha,
        tramo: null,
        hora_inicio_labores: horaInicio || null,
        ...clima,
        personal: personalPayload,
        personal_manual: personalManualPayload,
        asistencia_colaboradores: asistenciaPayload,
        equipos_uso: usosPayload,
        materiales: materialesPayload,
        cuerpo_html: cuerpoHtml,
        eventos: eventosParaPayload(eventos),
      }
      let row
      const tNet0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      if (localId == null) {
        row = await api.createBitacoraDiario(payload)
        setLocalId(row.id)
      } else {
        row = await api.updateBitacoraEntrada(localId, payload)
      }
      const tNet1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      const pending = (imagenes || []).filter((im) => im.pending && im.data_uri)
      for (const im of pending) {
        row = await api.pegarImagenBitacora(row.id, {
          nombre: im.nombre || `foto-${Date.now()}.png`,
          data_base64: im.data_uri,
          mime_type: im.mime_type || 'image/png',
          origen: im.origen || 'archivo',
          ...(im.pie ? { pie: im.pie } : {}),
        })
      }
      const ms = Math.round(tNet1 - tNet0)
      const total = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0)
      const server = row?._perf_ms?.total
      setOkMsg(
        server != null
          ? `Bitácora guardada (${ms} ms red · ${Math.round(server)} ms servidor).`
          : `Bitácora guardada (${total} ms).`,
      )
      // No propagar métricas internas al estado de imágenes
      const { _perf_ms: _omit, ...rowClean } = row || {}
      void _omit
      setImagenes(Array.isArray(rowClean.imagenes) ? rowClean.imagenes : [])
      if (Array.isArray(rowClean.asistencia_colaboradores)) {
        setAsistencia(asistenciaFromEntrada(rowClean))
        setPersonalManual(recoverPersonalManual(
          rowClean.personal,
          rowClean.asistencia_colaboradores,
        ))
      }
      // Rehidratar Maquinaria solo si el servidor devolvió filas coherentes.
      // Si enviamos usos y la respuesta viene vacía, NO borrar el estado local
      // (síntoma del bug DELETE+insert silencioso).
      if (Array.isArray(rowClean.equipos_uso)) {
        if (usosPayload.length > 0 && rowClean.equipos_uso.length === 0) {
          setError(
            'La maquinaria no se persistió en el servidor. Revise la conexión e intente guardar de nuevo.',
          )
        } else {
          setUsos(
            rowClean.equipos_uso.length
              ? rowClean.equipos_uso.map(usoFromApi)
              : [emptyUso()],
          )
        }
      }
      if (Array.isArray(rowClean.materiales)) {
        if (materialesPayload.length > 0 && rowClean.materiales.length === 0) {
          setError(
            'Los materiales no se persistieron en el servidor. Intente guardar de nuevo.',
          )
        } else {
          setMateriales(
            rowClean.materiales.length
              ? rowClean.materiales.map(materialFromApi)
              : [emptyMaterial()],
          )
        }
      }
      if (Array.isArray(rowClean.eventos)) {
        setEventos(eventosFromEntrada(rowClean))
      }
      onSaved?.(rowClean)
    } catch (e) {
      setError(e.message || 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const autocompletarDesdeAnterior = async () => {
    if (!esNuevo || tipo !== 'diario' || !editable) return
    setAutoBusy(true)
    setError('')
    setOkMsg('')
    try {
      const data = await api.plantillaAutocompletarDiario()
      const prevAsist = stripTramoFilasAutocompletar(asistenciaFromEntrada(data))
      const hasManual = Array.isArray(data.personal_manual) && data.personal_manual.length
      if (!data || (!prevAsist.length && !data.personal?.length && !hasManual && !data.equipos_uso?.length)) {
        setError('No hay una Bitácora anterior para autocompletar.')
        return
      }
      // No tocar fecha / hora / clima ni materiales; tramo por fila queda vacío.
      if (prevAsist.length) {
        setAsistencia(prevAsist)
      }
      // Cargo/cantidad temporal (y legado personal): recuperar aporte manual.
      const manualPrev = Array.isArray(data.personal_manual) && data.personal_manual.length
        ? mergePersonalCantidades(data.personal_manual)
        : recoverPersonalManual(data.personal, prevAsist)
      if (manualPrev.length) {
        setPersonalManual(manualPrev)
      } else if (!prevAsist.length && Array.isArray(data.personal)) {
        // Solo personal legado sin asistencia RRHH → todo como registro directo.
        setPersonalManual(mergePersonalCantidades(data.personal))
        setPersonal((prev) => mergePersonalPlantilla(prev, data.personal))
      }
      if (Array.isArray(data.equipos_uso) && data.equipos_uso.length) {
        setUsos(stripTramoFilasAutocompletar(data.equipos_uso.map(usoFromApi)))
      }
      // Materiales siempre vacíos al autocompletar (movimientos del día)
      setMateriales([emptyMaterial()])
      const fuente = [
        data.fuente_fecha ? data.fuente_fecha : null,
        data.fuente_tramo ? labelTramoBitacora(data.fuente_tramo) : null,
      ].filter(Boolean).join(' · ')
      setOkMsg(
        `Asistencia, cargos y maquinaria cargados desde el reporte anterior${fuente ? ` (${fuente})` : ''}. `
        + 'Materiales quedan vacíos. Asigne Tramo en cada fila. Fecha, hora y clima no se modificaron.',
      )
    } catch (e) {
      setError(e.message || 'No se pudo autocompletar')
    } finally {
      setAutoBusy(false)
    }
  }

  const crearEvento = async () => {
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      if (isRichTextEmpty(cuerpoHtml) && eventoTipo === 'reporte_actividades') {
        throw new Error('Describa las actividades del día en el texto libre')
      }
      const detallePayload = { ...eventoDetalle }
      detallePayload.actividades = actividadesParaPayload(eventoDetalle.actividades)
      if (eventoTipo === 'visita_terceros') {
        const lista = (eventoDetalle.visitantes_lista || [])
          .filter((v) => v && String(v.nombre || '').trim())
          .map((v) => ({
            visitante_id: v.visitante_id ?? null,
            usuario_id: v.usuario_id ?? null,
            nombre: String(v.nombre).trim(),
            cargo: String(v.cargo || '').trim(),
            origen: v.origen || (v.usuario_id ? 'plataforma' : 'catalogo'),
          }))
        detallePayload.visitantes_lista = lista
        detallePayload.visitantes = lista
          .map((v) => (v.cargo ? `${v.nombre} (${v.cargo})` : v.nombre))
          .join(', ')
      }
      const row = await api.createBitacoraEvento({
        fecha,
        evento_tipo: eventoTipo,
        evento_detalle: detallePayload,
        dirigido_a: eventoTieneDestinatario(eventoTipo) ? dirigidoA : '',
        cuerpo_html: cuerpoHtml,
        imagenes: (imagenes || [])
          .filter((im) => im.data_uri || im.data_base64 || im.blob_path || im.url)
          .map((im) => ({
            nombre: im.nombre || `foto-${Date.now()}.png`,
            data_uri: im.data_uri || im.data_base64 || undefined,
            blob_path: im.blob_path || undefined,
            url: im.url || undefined,
            content_hash: im.content_hash || undefined,
            mime_type: im.mime_type || 'image/png',
            origen: im.origen || 'archivo',
            ...(im.pie ? { pie: im.pie } : {}),
          })),
      })
      setOkMsg('Reporte de Evento registrado. Editable durante el día de creación.')
      onSaved?.(row)
      onClose?.()
    } catch (e) {
      setError(e.message || 'No se pudo crear el evento')
    } finally {
      setBusy(false)
    }
  }

  const guardarEvento = async () => {
    if (localId == null) return
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      if (isRichTextEmpty(cuerpoHtml) && eventoTipo === 'reporte_actividades') {
        throw new Error('Describa las actividades del día en el texto libre')
      }
      const detallePayload = { ...eventoDetalle }
      detallePayload.actividades = actividadesParaPayload(eventoDetalle.actividades)
      if (eventoTipo === 'visita_terceros') {
        const lista = (eventoDetalle.visitantes_lista || [])
          .filter((v) => v && String(v.nombre || '').trim())
          .map((v) => ({
            visitante_id: v.visitante_id ?? null,
            usuario_id: v.usuario_id ?? null,
            nombre: String(v.nombre).trim(),
            cargo: String(v.cargo || '').trim(),
            origen: v.origen || (v.usuario_id ? 'plataforma' : 'catalogo'),
          }))
        detallePayload.visitantes_lista = lista
        detallePayload.visitantes = lista
          .map((v) => (v.cargo ? `${v.nombre} (${v.cargo})` : v.nombre))
          .join(', ')
      }
      let row = await api.updateBitacoraEntrada(localId, {
        evento_tipo: eventoTipo,
        evento_detalle: detallePayload,
        dirigido_a: eventoTieneDestinatario(eventoTipo) ? dirigidoA : '',
        cuerpo_html: cuerpoHtml,
        imagenes: (imagenes || [])
          .filter((im) => im.data_uri || im.data_base64 || im.blob_path || im.url)
          .map((im) => ({
            nombre: im.nombre || `foto-${Date.now()}.png`,
            data_uri: im.data_uri || im.data_base64 || undefined,
            blob_path: im.blob_path || undefined,
            url: im.url || undefined,
            content_hash: im.content_hash || undefined,
            mime_type: im.mime_type || 'image/png',
            origen: im.origen || 'archivo',
            ...(im.pie ? { pie: im.pie } : {}),
          })),
      })
      const pending = (imagenes || []).filter((im) => im.pending && im.data_uri)
      for (const im of pending) {
        row = await api.pegarImagenBitacora(row.id, {
          nombre: im.nombre || `foto-${Date.now()}.png`,
          data_base64: im.data_uri,
          mime_type: im.mime_type || 'image/png',
          origen: im.origen || 'archivo',
          ...(im.pie ? { pie: im.pie } : {}),
        })
      }
      setOkMsg('Reporte de Evento guardado.')
      onSaved?.(row)
    } catch (e) {
      setError(e.message || 'No se pudo guardar el evento')
    } finally {
      setBusy(false)
    }
  }

  const titulo = tipo === 'evento'
    ? (esNuevo ? 'Nuevo Reporte de Evento' : `Evento · ${labelEventoTipo(entrada?.evento_tipo)}`)
    : (esNuevo ? 'Nueva Bitácora' : `Bitácora · ${entrada?.fecha || fecha}`)

  const fechaRo = tipo === 'diario' || !esNuevo

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
      style={seguimientoModalOverlayStyle(viewportCompact)}
    >
      <div
        className={
          viewportCompact
            ? 'cc-seguim-modal-sheet cc-bitacora-entrada cc-bitacora-entrada--compact'
            : 'cc-seguim-modal-sheet--desktop cc-bitacora-entrada'
        }
        style={{
          ...seguimientoModalSheetStyle(viewportCompact, { wide: true }),
          ...sheetCssVars,
          background: t.bgCard,
          border: viewportCompact ? 'none' : `1px solid ${t.border}`,
          boxShadow: t.shadow || '0 20px 50px rgba(0,0,0,0.2)',
          // Ancho dinámico: hereda min(1640px, 98vw) de wide; no fijar 1180.
          maxHeight: viewportCompact ? '96dvh' : '94vh',
          padding: viewportCompact ? undefined : 12,
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          position: 'sticky', top: 0, zIndex: 3,
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: `1px solid ${ui.border}`,
          background: t.bgCard,
        }}>
          <div>
            <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-title)' }}>{titulo}</div>
            <div style={{ fontSize: 11, color: t.textMuted }}>
              {tipo === 'diario'
                ? (editable
                  ? (esReporteAtrasadoLocal(entrada) || (!esNuevo && entrada?.es_atrasado)
                    ? 'Atrasada — editable hasta las 23:59:59 del día en que se creó'
                    : 'Abierta — editable dentro de la ventana de gracia (hasta 23:59:59 del día siguiente)')
                  : 'Cerrada / bloqueada — solo lectura')
                : 'Inmutable desde su creación'}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {tipo === 'diario' && esNuevo && editable && (
              <button
                type="button"
                disabled={autoBusy || busy}
                onClick={() => void autocompletarDesdeAnterior()}
                style={btnGhost}
                title="Carga asistencia y maquinaria de la bitácora anterior. Materiales no se autocompletan. No modifica fecha, hora ni clima. Debe asignar Tramo en cada fila."
              >
                {autoBusy ? 'Cargando…' : 'Autocompletar desde día anterior'}
              </button>
            )}
            {tipo === 'diario' && (permisos?.ver || permisos?.exportar) && (
              <>
                <button
                  type="button"
                  disabled={busy || !fecha}
                  onClick={() => setReportePersonalOpen(true)}
                  style={btnGhost}
                  title="Resumen cruzado Tramo × Empresa (personal y maquinaria). Vista = PNG."
                >
                  Resumen por tramo y empresa
                </button>
                <button
                  type="button"
                  disabled={pdfBusy || busy || !fecha}
                  onClick={() => void exportarPdfDia({ preview: true })}
                  style={btnGhost}
                  title="Vista previa PDF del reporte de este día (datos guardados en servidor)"
                >
                  {pdfBusy ? '…' : 'Vista previa'}
                </button>
                <button
                  type="button"
                  disabled={pdfBusy || busy || !fecha}
                  onClick={() => void exportarPdfDia({ preview: false })}
                  style={btnPrimary}
                  title="Descargar PDF del reporte de este día (datos guardados en servidor)"
                >
                  {pdfBusy ? '…' : 'Descargar PDF'}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} style={btnGhost}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{
              background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA',
              borderRadius: 6, padding: '6px 8px', fontSize: 12,
            }}>{error}</div>
          )}
          {okMsg && (
            <div style={{
              background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0',
              borderRadius: 6, padding: '6px 8px', fontSize: 12,
            }}>{okMsg}</div>
          )}
          {entrada?._merged_pendiente_persistir && Array.isArray(entrada?._merged_from_ids) && (
            <div style={{
              background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A',
              borderRadius: 6, padding: '8px 10px', fontSize: 12, lineHeight: 1.4,
            }}>
              Se unieron temporalmente {entrada._merged_from_ids.length} reportes de tramo
              de esta fecha para mostrar todo el Personal y Maquinaria.
              Pulse <strong>Guardar</strong> para persistir la consolidación en este diario.
            </div>
          )}

          {/* Encabezado Excel: Fecha | Hora | Clima | Elaborado por */}
          <div style={ui.sheetWrap} className="cc-bitacora-sheet-scroll">
            <table
              className="cc-bitacora-responsive-table cc-bitacora-meta-table"
              style={{
                ...ui.sheetTable,
                tableLayout: grillaCompacta ? 'auto' : 'fixed',
                minWidth: grillaCompacta ? 0 : undefined,
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...ui.th, width: '18%' }}>Fecha</th>
                  {tipo === 'diario' && (
                    <th style={{ ...ui.th, width: '14%' }}>Hora inicio</th>
                  )}
                  {tipo === 'diario' && (
                    <th style={{ ...ui.th, width: '36%' }}>Clima</th>
                  )}
                  <th style={{ ...ui.th, width: tipo === 'diario' ? '32%' : '82%' }}>Elaborado por</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={ui.td} data-label="Fecha">
                    {fechaRo ? (
                      <div style={{ ...ui.cellRo, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>{fecha}</div>
                    ) : (
                      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={ui.cellInp} />
                    )}
                  </td>
                  {tipo === 'diario' && (
                    <td style={ui.td} data-label="Hora inicio">
                      {editable ? (
                        <input
                          type="time"
                          step={1}
                          value={(horaInicio || '').slice(0, 8)}
                          onChange={(e) => setHoraInicio(e.target.value)}
                          style={ui.cellInp}
                          title="Por defecto 07:30; editable mientras la bitácora esté abierta"
                        />
                      ) : (
                        <div style={ui.cellRo}>{horaInicio || '—'}</div>
                      )}
                    </td>
                  )}
                  {tipo === 'diario' && (
                    <td style={{ ...ui.td, padding: 0 }} data-label="Clima">
                      <BitacoraClimaField
                        t={t}
                        contratoId={contratoId}
                        token={token}
                        fecha={fecha}
                        horaPreferida={horaInicio}
                        value={clima}
                        onChange={setClima}
                        disabled={!editable}
                        compact
                        embedded
                      />
                    </td>
                  )}
                  <td style={ui.td} data-label="Elaborado por">
                    <div style={{
                      ...ui.cellRo,
                      fontFamily: 'inherit',
                      fontWeight: 600,
                      height: 'auto',
                      minHeight: 28,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {entrada?.created_by_nombre
                        || [usuario?.nombre, usuario?.apellido].filter(Boolean).join(' ')
                        || '—'}
                      {entrada?.created_by_rol ? ` · ${entrada.created_by_rol}` : ''}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {tipo === 'diario' && (
            <>
              <PersonalAsistenciaPanel
                t={t}
                rows={asistencia}
                onChange={setAsistencia}
                disabled={!editable}
                sheetStyles={ui}
                compact={grillaCompacta}
                rrhhCatalogo={rrhhCatalogo}
                excluidosRrhhIds={excluidosRrhhIds}
                cargosCatalogo={cargosCatalogo}
                tramosCatalogo={tramosCatalogo}
                resumenCongelado={resumenCongelado}
                personalManual={personalManual}
                onChangePersonalManual={setPersonalManual}
                permitirCargoCantidad={permitirCargoCantidad && editable}
                gateRrhhAprobado={gateRrhhAprobado}
                fetchPlantillaAutocompletar={
                  editable && esNuevo
                    ? () => api.plantillaAutocompletarDiario()
                    : null
                }
              />

              {/* Maquinaria Excel */}
              <div>
                <div style={ui.sectionBar}>
                  <span>Maquinaria, equipos y volquetas</span>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => setUsos((u) => [...u, emptyUso()])}
                      style={{ ...btnGhost, padding: '4px 8px', fontSize: 'var(--cc-caption)' }}
                    >
                      + Fila
                    </button>
                  )}
                </div>
                <div style={ui.sheetWrapFlush} className="cc-bitacora-sheet-scroll">
                  <table
                    className="cc-bitacora-responsive-table cc-bitacora-maquinaria-table"
                    style={{
                      ...ui.sheetTable,
                      tableLayout: grillaCompacta ? 'auto' : 'fixed',
                      minWidth: grillaCompacta ? 0 : undefined,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ ...ui.th, width: '18%' }}>Equipo / máquina</th>
                        <th style={{ ...ui.th, width: '14%' }}>Tramo *</th>
                        <th style={{ ...ui.th, width: '16%' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}>
                            Operador
                            <span
                              title={HINT_OPERADOR_DESDE_RRHH}
                              aria-label={HINT_OPERADOR_DESDE_RRHH}
                              style={{
                                display: 'inline-flex',
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                background: t.textMuted || '#94a3b8',
                                color: '#fff',
                                fontSize: 9,
                                fontWeight: 800,
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'help',
                                flexShrink: 0,
                                textTransform: 'none',
                                letterSpacing: 0,
                                lineHeight: 1,
                              }}
                            >
                              ?
                            </span>
                          </span>
                        </th>
                        <th style={{ ...ui.th, width: '7%' }}>Cant.</th>
                        <th style={{ ...ui.th, width: '10%' }}>Hora inicio</th>
                        <th style={{ ...ui.th, width: '10%' }}>Hora fin</th>
                        <th style={{ ...ui.th, width: '10%' }}>Hora interm.</th>
                        <th style={{ ...ui.th, width: '8%', textAlign: 'center' }}>Preop.</th>
                        {editable && <th style={{ ...ui.th, width: '5%' }} />}
                      </tr>
                    </thead>
                    <tbody>
                      {usos.map((u, idx) => (
                        <tr key={`uso-${idx}`}>
                          <td style={ui.td} data-label="Equipo / máquina">
                            <EquipoCatalogSelect
                              t={t}
                              api={api}
                              disabled={!editable}
                              value={u.equipo_nombre}
                              equipoId={u.equipo_id}
                              onChange={(sel) => setUsos((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, ...sel } : r
                              )))}
                            />
                          </td>
                          <td style={ui.td} data-label="Tramo">
                            {editable ? (
                              <select
                                value={u.tramo || ''}
                                onChange={(e) => setUsos((rows) => rows.map((r, i) => (
                                  i === idx ? { ...r, tramo: e.target.value } : r
                                )))}
                                style={{ ...ui.cellInp, height: 28 }}
                                required
                                title="Tramo obligatorio por fila de maquinaria"
                              >
                                <option value="">Seleccione…</option>
                                {tramosCatalogo.map((tr) => (
                                  <option key={tr} value={tr}>{tr}</option>
                                ))}
                                {u.tramo && !tramosCatalogo.includes(u.tramo) ? (
                                  <option value={u.tramo}>{u.tramo}</option>
                                ) : null}
                              </select>
                            ) : (
                              <div style={ui.cellRo}>{u.tramo || '—'}</div>
                            )}
                          </td>
                          <td style={ui.td} data-label="Operador">
                            {!editable ? (
                              <div style={ui.cellRo}>{u.operador || '—'}</div>
                            ) : (
                              <NombreRrhhAutocomplete
                                t={t}
                                value={u.operador || ''}
                                catalogo={rrhhCatalogo}
                                style={{ ...ui.cellInp, height: 28 }}
                                onPick={(trab) => {
                                  const tid = trab?.id != null ? Number(trab.id) : null
                                  setUsos((rows) => rows.map((r, i) => (
                                    i === idx ? {
                                      ...r,
                                      operador: nombreCompletoRrhh(trab),
                                      operador_rrhh_id: Number.isFinite(tid) ? tid : null,
                                    } : r
                                  )))
                                }}
                              />
                            )}
                          </td>
                          <td style={ui.td} data-label="Cant.">
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              disabled={!editable}
                              value={u.cantidad}
                              onChange={(e) => setUsos((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, cantidad: e.target.value } : r
                              )))}
                              style={{ ...ui.cellInp, textAlign: 'center' }}
                            />
                          </td>
                          <td style={ui.td} data-label="Hora inicio">
                            <input
                              type="time"
                              disabled={!editable}
                              value={u.hora_inicio || ''}
                              onChange={(e) => setUsos((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, hora_inicio: e.target.value } : r
                              )))}
                              style={ui.cellInp}
                            />
                          </td>
                          <td style={ui.td} data-label="Hora fin">
                            <input
                              type="time"
                              disabled={!editable}
                              value={u.hora_fin || ''}
                              onChange={(e) => setUsos((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, hora_fin: e.target.value } : r
                              )))}
                              style={ui.cellInp}
                            />
                          </td>
                          <td style={ui.td} data-label="Hora interm.">
                            <input
                              type="time"
                              disabled={!editable}
                              value={u.hora_intermedia || ''}
                              onChange={(e) => setUsos((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, hora_intermedia: e.target.value } : r
                              )))}
                              style={ui.cellInp}
                            />
                          </td>
                          <td style={{ ...ui.td, textAlign: 'center' }} data-label="Preop.">
                            <BitacoraClipAdjuntos
                              t={t}
                              files={u.preoperacionales || []}
                              disabled={!editable}
                              title="Escáner preoperacionales"
                              onChange={(files) => setUsos((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, preoperacionales: files } : r
                              )))}
                            />
                          </td>
                          {editable && (
                            <td style={{ ...ui.td, textAlign: 'center' }} data-label="">
                              {usos.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setUsos((rows) => rows.filter((_, i) => i !== idx))}
                                  style={{ ...ui.clipBtn, color: '#B91C1C' }}
                                >
                                  ×
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Materiales Excel — ingreso/salida */}
              <div>
                <div style={ui.sectionBar}>
                  <span>Materiales de obra (ingreso / salida)</span>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => setMateriales((m) => [...m, emptyMaterial()])}
                      style={{ ...btnGhost, padding: '4px 8px', fontSize: 'var(--cc-caption)' }}
                    >
                      + Fila
                    </button>
                  )}
                </div>
                <div style={ui.sheetWrapFlush} className="cc-bitacora-sheet-scroll">
                  <table
                    className="cc-bitacora-responsive-table cc-bitacora-materiales-table"
                    style={{
                      ...ui.sheetTable,
                      tableLayout: grillaCompacta ? 'auto' : 'fixed',
                      minWidth: grillaCompacta ? 0 : undefined,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ ...ui.th, width: '10%' }}>Movimiento</th>
                        <th style={{ ...ui.th, width: '12%' }}>Tramo *</th>
                        <th style={{ ...ui.th, width: '18%' }}>Tipo de material</th>
                        <th style={{ ...ui.th, width: '12%' }}>Proveedor</th>
                        <th style={{ ...ui.th, width: '7%' }}>Cant.</th>
                        <th style={{ ...ui.th, width: '14%' }}>Nº vale(s)</th>
                        <th style={{ ...ui.th, width: '9%', textAlign: 'center' }}>Remisión</th>
                        <th style={{ ...ui.th, width: '9%', textAlign: 'center' }}>PK</th>
                        {editable && <th style={{ ...ui.th, width: '5%' }} />}
                      </tr>
                    </thead>
                    <tbody>
                      {materiales.map((m, idx) => (
                        <tr key={`mat-${idx}`}>
                          <td style={ui.td} data-label="Movimiento">
                            <select
                              disabled={!editable}
                              value={m.movimiento || 'ingreso'}
                              onChange={(e) => setMateriales((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, movimiento: e.target.value } : r
                              )))}
                              style={{ ...ui.cellInp, height: 28 }}
                            >
                              <option value="ingreso">Ingreso</option>
                              <option value="salida">Salida</option>
                            </select>
                          </td>
                          <td style={ui.td} data-label="Tramo">
                            {editable ? (
                              <select
                                value={m.tramo || ''}
                                onChange={(e) => setMateriales((rows) => rows.map((r, i) => (
                                  i === idx ? { ...r, tramo: e.target.value } : r
                                )))}
                                style={{ ...ui.cellInp, height: 28 }}
                                required
                                title="Tramo obligatorio por fila de materiales"
                              >
                                <option value="">Seleccione…</option>
                                {tramosCatalogo.map((tr) => (
                                  <option key={tr} value={tr}>{tr}</option>
                                ))}
                                {m.tramo && !tramosCatalogo.includes(m.tramo) ? (
                                  <option value={m.tramo}>{m.tramo}</option>
                                ) : null}
                              </select>
                            ) : (
                              <div style={ui.cellRo}>{m.tramo || '—'}</div>
                            )}
                          </td>
                          <td style={ui.td} data-label="Tipo de material">
                            {/* Catálogo Bitácora propio — no Almacén/insumos */}
                            <MaterialTipoCatalogSelect
                              t={t}
                              api={api}
                              disabled={!editable}
                              value={m.tipo_material}
                              placeholder="Ej. Concreto 3000 PSI"
                              inputStyle={ui.cellInp}
                              onChange={(nombre) => setMateriales((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, tipo_material: nombre } : r
                              )))}
                            />
                          </td>
                          <td style={ui.td} data-label="Proveedor">
                            <input
                              disabled={!editable}
                              value={m.proveedor}
                              onChange={(e) => setMateriales((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, proveedor: e.target.value } : r
                              )))}
                              style={ui.cellInp}
                            />
                          </td>
                          <td style={ui.td} data-label="Cant.">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              disabled={!editable}
                              value={m.cantidad}
                              onChange={(e) => setMateriales((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, cantidad: e.target.value } : r
                              )))}
                              style={{ ...ui.cellInp, textAlign: 'center' }}
                            />
                          </td>
                          <td style={ui.td} data-label="Nº vale(s)">
                            <input
                              disabled={!editable}
                              value={m.numeros_vale}
                              onChange={(e) => setMateriales((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, numeros_vale: e.target.value } : r
                              )))}
                              style={ui.cellInp}
                              placeholder="Ej. 101, 102"
                              title="Número(s) de vale"
                            />
                          </td>
                          <td style={{ ...ui.td, textAlign: 'center' }} data-label="Remisión">
                            <BitacoraClipAdjuntos
                              t={t}
                              files={(m.adjuntos || []).slice(0, 2)}
                              disabled={!editable}
                              title="Foto remisión / soporte (máx. 2)"
                              accept="image/*,application/pdf"
                              onChange={(files) => setMateriales((rows) => rows.map((r, i) => (
                                i === idx ? { ...r, adjuntos: (files || []).slice(0, 2) } : r
                              )))}
                            />
                          </td>
                          <td style={{ ...ui.td, textAlign: 'center' }} data-label="PK">
                            <button
                              type="button"
                              title={m.ubicacion_pk
                                ? [
                                  `PK: ${m.ubicacion_pk}`,
                                  m.ubicacion_tramo ? `Tramo: ${m.ubicacion_tramo}` : null,
                                  m.ubicacion_costado ? `Costado: ${m.ubicacion_costado}` : null,
                                  m.ubicacion_infraestructura ? `Infra: ${m.ubicacion_infraestructura}` : null,
                                ].filter(Boolean).join(' · ')
                                : 'Seleccionar PK en mapa'}
                              onClick={() => setMapTarget({ kind: 'material', idx })}
                              style={{
                                ...ui.clipBtn,
                                color: m.ubicacion_pk || m.ubicacion_pk_id
                                  ? (t.primary || '#0f766e')
                                  : t.textMuted,
                                fontWeight: 800,
                                fontSize: 11,
                                maxWidth: grillaCompacta ? '100%' : 72,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {m.ubicacion_pk ? `PK ${m.ubicacion_pk}` : '🗺 PK'}
                            </button>
                          </td>
                          {editable && (
                            <td style={{ ...ui.td, textAlign: 'center' }} data-label="">
                              {materiales.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setMateriales((rows) => rows.filter((_, i) => i !== idx))}
                                  style={{ ...ui.clipBtn, color: '#B91C1C' }}
                                >
                                  ×
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: t.textMuted }}>
                  El número de vale es el dato de correlación. Ubicación: PK del plano.
                </div>
              </div>

              <EventoBloquesSection
                t={t}
                api={api}
                ui={ui}
                eventos={eventos}
                onChange={setEventos}
                disabled={!editable}
                compact={grillaCompacta}
                contratoId={contratoId}
                onPickMapActividad={(bloqueId, idx) => setMapTarget({ kind: 'actividad', idx, bloqueId })}
              />
            </>
          )}

          {false && tipo === 'evento' && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ ...ui.sheetWrap, flex: '1 1 240px' }}>
                  <table style={ui.sheetTable}>
                    <thead>
                      <tr><th style={ui.th}>Tipo de evento</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={ui.td}>
                          <select
                            disabled={!esNuevo}
                            value={eventoTipo}
                            onChange={(e) => {
                              const nextTipo = e.target.value
                              setEventoTipo(nextTipo)
                              setEventoDetalle((prev) => ({
                                ...emptyEventoDetalle(nextTipo),
                                actividades: Array.isArray(prev.actividades) && prev.actividades.length
                                  ? prev.actividades
                                  : [emptyActividadRow()],
                              }))
                            }}
                            style={{ ...ui.cellInp, height: 30 }}
                          >
                            {EVENTO_TIPOS.map((x) => (
                              <option key={x.value} value={x.value}>{x.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {eventoTieneDestinatario(eventoTipo) && (
                  <div style={{ ...ui.sheetWrap, flex: '1 1 240px' }}>
                    <table style={ui.sheetTable}>
                      <thead>
                        <tr><th style={ui.th}>A quién se dirige</th></tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={ui.td}>
                            <input
                              disabled={!editable && !esNuevo}
                              value={dirigidoA}
                              onChange={(e) => setDirigidoA(e.target.value)}
                              placeholder="Destinatario…"
                              style={ui.cellInp}
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {eventoTipo === 'incidente_sst' && (
                <div style={ui.sheetWrap}>
                  <table style={ui.sheetTable}>
                    <thead>
                      <tr>
                        <th style={ui.th} colSpan={2}>Incidente SST (independiente de Auditor SST IA)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['descripcion_incidente', 'Descripción'],
                        ['lugar', 'Lugar'],
                        ['personas_involucradas', 'Personas involucradas'],
                        ['acciones_inmediatas', 'Acciones inmediatas'],
                      ].map(([key, lab]) => (
                        <tr key={key}>
                          <td style={{ ...ui.td, width: '22%', fontWeight: 600, fontSize: 12 }}>{lab}</td>
                          <td style={ui.td}>
                            <input
                              disabled={!editable && !esNuevo}
                              value={eventoDetalle[key] || ''}
                              onChange={(e) => setEventoDetalle((d) => ({ ...d, [key]: e.target.value }))}
                              style={ui.cellInp}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ ...ui.td, fontWeight: 600, fontSize: 12 }}>Gravedad</td>
                        <td style={ui.td}>
                          <select
                            disabled={!editable && !esNuevo}
                            value={eventoDetalle.gravedad || 'leve'}
                            onChange={(e) => setEventoDetalle((d) => ({ ...d, gravedad: e.target.value }))}
                            style={{ ...ui.cellInp, height: 30 }}
                          >
                            <option value="leve">Leve</option>
                            <option value="moderada">Moderada</option>
                            <option value="grave">Grave</option>
                          </select>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {eventoTipo === 'visita_terceros' && (
                <div style={ui.sheetWrap}>
                  <VisitantesEventoGrid
                    t={t}
                    api={api}
                    rows={eventoDetalle.visitantes_lista || [emptyVisitanteRow()]}
                    disabled={!editable && !esNuevo}
                    sheetStyles={ui}
                    onChange={(lista) => setEventoDetalle((d) => ({
                      ...d,
                      visitantes_lista: lista,
                      visitantes: (lista || [])
                        .filter((v) => v && String(v.nombre || '').trim())
                        .map((v) => (v.cargo ? `${v.nombre} (${v.cargo})` : v.nombre))
                        .join(', '),
                    }))}
                  />
                  <table style={{ ...ui.sheetTable, marginTop: 10 }}>
                    <tbody>
                      {[
                        ['entidad', 'Entidad'],
                        ['motivo', 'Motivo'],
                      ].map(([key, lab]) => (
                        <tr key={key}>
                          <td style={{ ...ui.td, width: '22%', fontWeight: 600, fontSize: 12 }}>{lab}</td>
                          <td style={ui.td}>
                            <input
                              disabled={!editable && !esNuevo}
                              value={eventoDetalle[key] || ''}
                              onChange={(e) => setEventoDetalle((d) => ({ ...d, [key]: e.target.value }))}
                              style={ui.cellInp}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Evento: Actividades arriba (ancho completo) + texto libre debajo */}
          {tipo === 'evento' ? (
            <div className="cc-bitacora-evento-stack">
              <div className="cc-bitacora-evento-stack__actividades">
                <ActividadesEventoGrid
                  t={t}
                  rows={eventoDetalle.actividades || [emptyActividadRow()]}
                  disabled={!editable && !esNuevo}
                  sheetStyles={ui}
                  compact={grillaCompacta}
                  onChange={(lista) => setEventoDetalle((d) => ({ ...d, actividades: lista }))}
                  onPickUbicacion={(idx) => setMapTarget({ kind: 'actividad', idx })}
                />
              </div>
              <div className="cc-bitacora-evento-stack__texto">
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: 6,
                }}>
                  <div style={{ ...ui.sectionTitle, marginBottom: 0 }}>
                    Reporte
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, alignItems: 'center', overflowX: 'auto' }}>
                    {(editable || esNuevo) && (
                      <button type="button" onClick={() => setClaraOpen(true)} style={btnGhost}>
                        Redactar con Clara
                      </button>
                    )}
                  </div>
                </div>
                <TemaRichEditor
                  t={t}
                  value={cuerpoHtml}
                  onChange={setCuerpoHtml}
                  editable={editable || esNuevo}
                  minHeight={110}
                  placeholder="Describa el evento…"
                />
                <div style={{ marginTop: 8 }}>
                  <BitacoraAdjuntos
                    t={t}
                    api={api}
                    imagenes={imagenes}
                    onChange={setImagenes}
                    disabled={!(editable || esNuevo)}
                    entradaId={localId}
                    singleLine
                    contratoId={contratoId}
                    mapLocation={(() => {
                      const withPk = (materiales || []).find((m) => (
                        m?.ubicacion_pk
                        || (m?.ubicacion_lat != null && m?.ubicacion_lng != null)
                      ))
                      if (!withPk) return null
                      const lat = Number(withPk.ubicacion_lat)
                      const lng = Number(withPk.ubicacion_lng)
                      return {
                        pkId: String(withPk.ubicacion_pk || '').trim() || undefined,
                        ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
                      }
                    })()}
                    onUploadPersisted={localId != null ? async (body) => {
                      const row = await api.pegarImagenBitacora(localId, body)
                      setImagenes(Array.isArray(row.imagenes) ? row.imagenes : [])
                      onSaved?.(row)
                    } : undefined}
                  />
                </div>
              </div>
            </div>
          ) : (
            debeMostrarObservacionesDia(eventos) ? (
              <div>
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: 6,
                }}>
                  <div style={{ ...ui.sectionTitle, marginBottom: 0 }}>
                    Observaciones
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, alignItems: 'center', overflowX: 'auto' }}>
                    {(editable || esNuevo) && (
                      <button type="button" onClick={() => setClaraOpen(true)} style={btnGhost}>
                        Redactar con Clara
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ ...ui.sheetWrap, padding: 0, overflow: 'visible' }}>
                  <div style={{
                    ...ui.th,
                    position: 'static',
                    borderBottom: `1px solid ${ui.border}`,
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none',
                  }}>
                    Notas del día
                  </div>
                  <div style={{ padding: 8 }}>
                    <TemaRichEditor
                      t={t}
                      value={cuerpoHtml}
                      onChange={setCuerpoHtml}
                      editable={editable || esNuevo}
                      minHeight={110}
                      placeholder="Notas del día (opcional)…"
                    />
                  </div>
                  <div style={{
                    borderTop: `1px solid ${ui.border}`,
                    padding: 8,
                    background: t.inputBg || t.bg || 'transparent',
                  }}>
                    <BitacoraAdjuntos
                      t={t}
                      api={api}
                      imagenes={imagenes}
                      onChange={setImagenes}
                      disabled={!(editable || esNuevo)}
                      entradaId={localId}
                      singleLine
                      contratoId={contratoId}
                      mapLocation={(() => {
                        const withPk = (materiales || []).find((m) => (
                          m?.ubicacion_pk
                          || (m?.ubicacion_lat != null && m?.ubicacion_lng != null)
                        ))
                        if (!withPk) return null
                        const lat = Number(withPk.ubicacion_lat)
                        const lng = Number(withPk.ubicacion_lng)
                        return {
                          pkId: String(withPk.ubicacion_pk || '').trim() || undefined,
                          ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
                        }
                      })()}
                      onUploadPersisted={localId != null ? async (body) => {
                        const row = await api.pegarImagenBitacora(localId, body)
                        setImagenes(Array.isArray(row.imagenes) ? row.imagenes : [])
                        onSaved?.(row)
                      } : undefined}
                    />
                  </div>
                </div>
              </div>
            ) : null
          )}

          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end',
            borderTop: `1px solid ${ui.border}`, paddingTop: 10,
          }}>
            {tipo === 'diario' && (permisos?.ver || permisos?.exportar) && (
              <div style={{ display: 'flex', gap: 8, marginRight: 'auto', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busy || !fecha}
                  onClick={() => setReportePersonalOpen(true)}
                  style={btnGhost}
                  title="Resumen cruzado Tramo × Empresa (personal y maquinaria). Vista = PNG."
                >
                  Resumen por tramo y empresa
                </button>
                <button
                  type="button"
                  disabled={pdfBusy || busy || !fecha}
                  onClick={() => void exportarPdfDia({ preview: true })}
                  style={btnGhost}
                  title="Vista previa PDF del reporte de este día (datos guardados en servidor)"
                >
                  {pdfBusy ? '…' : 'Vista previa'}
                </button>
                <button
                  type="button"
                  disabled={pdfBusy || busy || !fecha}
                  onClick={() => void exportarPdfDia({ preview: false })}
                  style={btnPrimary}
                  title="Descargar PDF del reporte de este día (datos guardados en servidor)"
                >
                  {pdfBusy ? '…' : 'Descargar PDF'}
                </button>
              </div>
            )}
            {tipo === 'diario' && editable && (
              <button type="button" disabled={busy} onClick={() => void guardarDiario()} style={btnPrimary}>
                Guardar
              </button>
            )}
            {tipo === 'evento' && !esNuevo && editable && (
              <button type="button" disabled={busy} onClick={() => void guardarEvento()} style={btnPrimary}>
                Guardar
              </button>
            )}
            {tipo === 'diario' && !editable && permisos?.esDesarrollador && entrada?.estado === 'cerrado' && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const row = await api.revertirBitacoraDiario(localId)
                    onSaved?.(row)
                    setOkMsg('Reporte reabierto (Desarrollador).')
                  } catch (e) {
                    setError(e.message || 'No se pudo revertir')
                  } finally {
                    setBusy(false)
                  }
                }}
                style={btnGhost}
              >
                Reabrir (Desarrollador)
              </button>
            )}
            {tipo === 'evento' && esNuevo && permisos?.crear && (
              <button type="button" disabled={busy} onClick={() => void crearEvento()} style={btnPrimary}>
                Registrar evento
              </button>
            )}
            {permisos?.esDesarrollador && localId != null && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm('¿Eliminar definitivamente esta entrada?')) return
                  setBusy(true)
                  try {
                    await api.deleteBitacoraEntrada(localId)
                    onSaved?.(null)
                    onClose?.()
                  } catch (e) {
                    setError(e.message || 'No se pudo eliminar')
                  } finally {
                    setBusy(false)
                  }
                }}
                style={{ ...btnGhost, color: '#B91C1C' }}
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>

      {mapTarget?.kind === 'material' && materiales[mapTarget.idx] && (
        <BitacoraMaterialUbicacionModal
          t={t}
          token={token}
          contratoId={contratoId}
          pkId={materiales[mapTarget.idx].ubicacion_pk_id}
          pkLabel={materiales[mapTarget.idx].ubicacion_pk}
          tramo={materiales[mapTarget.idx].ubicacion_tramo}
          costado={materiales[mapTarget.idx].ubicacion_costado}
          infraestructura={materiales[mapTarget.idx].ubicacion_infraestructura}
          readOnly={!editable}
          onClose={() => setMapTarget(null)}
          onConfirm={(loc) => {
            const idx = mapTarget.idx
            setMateriales((rows) => rows.map((r, i) => (
              i === idx
                ? {
                  ...r,
                  ubicacion_pk: loc.ubicacion_pk || '',
                  ubicacion_pk_id: loc.ubicacion_pk_id,
                  ubicacion_tramo: loc.ubicacion_tramo || '',
                  ubicacion_costado: loc.ubicacion_costado || '',
                  ubicacion_infraestructura: loc.ubicacion_infraestructura || '',
                  ubicacion_lat: loc.ubicacion_lat,
                  ubicacion_lng: loc.ubicacion_lng,
                }
                : r
            )))
            setMapTarget(null)
          }}
        />
      )}

      {mapTarget?.kind === 'actividad' && mapTarget.bloqueId && (() => {
        const bloque = eventos.find((b) => b.id === mapTarget.bloqueId)
        const acts = bloque?.evento_detalle?.actividades || []
        const row = acts[mapTarget.idx]
        if (!row) return null
        return (
          <BitacoraMaterialUbicacionModal
            t={t}
            token={token}
            contratoId={contratoId}
            pkId={row.ubicacion_pk_id}
            pkLabel={row.ubicacion_pk}
            tramo={row.ubicacion_tramo}
            costado={row.ubicacion_costado}
            infraestructura={row.ubicacion_infraestructura}
            readOnly={!editable}
            onClose={() => setMapTarget(null)}
            onConfirm={(loc) => {
              const idx = mapTarget.idx
              const bloqueId = mapTarget.bloqueId
              setEventos((lista) => lista.map((b) => {
                if (b.id !== bloqueId) return b
                const det = b.evento_detalle && typeof b.evento_detalle === 'object' ? b.evento_detalle : {}
                const list = Array.isArray(det.actividades) && det.actividades.length
                  ? det.actividades
                  : [emptyActividadRow()]
                return {
                  ...b,
                  evento_detalle: {
                    ...det,
                    actividades: list.map((r, i) => (
                      i === idx
                        ? {
                          ...r,
                          ubicacion_pk: loc.ubicacion_pk || '',
                          ubicacion_pk_id: loc.ubicacion_pk_id,
                          ubicacion_tramo: loc.ubicacion_tramo || '',
                          ubicacion_costado: loc.ubicacion_costado || '',
                          ubicacion_infraestructura: loc.ubicacion_infraestructura || '',
                          ubicacion_lat: loc.ubicacion_lat,
                          ubicacion_lng: loc.ubicacion_lng,
                        }
                        : r
                    )),
                  },
                }
              }))
              setMapTarget(null)
            }}
          />
        )
      })()}

      {mapTarget?.kind === 'actividad' && !mapTarget.bloqueId && (eventoDetalle.actividades || [])[mapTarget.idx] && (
        <BitacoraMaterialUbicacionModal
          t={t}
          token={token}
          contratoId={contratoId}
          pkId={(eventoDetalle.actividades || [])[mapTarget.idx].ubicacion_pk_id}
          pkLabel={(eventoDetalle.actividades || [])[mapTarget.idx].ubicacion_pk}
          tramo={(eventoDetalle.actividades || [])[mapTarget.idx].ubicacion_tramo}
          costado={(eventoDetalle.actividades || [])[mapTarget.idx].ubicacion_costado}
          infraestructura={(eventoDetalle.actividades || [])[mapTarget.idx].ubicacion_infraestructura}
          readOnly={!editable && !esNuevo}
          onClose={() => setMapTarget(null)}
          onConfirm={(loc) => {
            const idx = mapTarget.idx
            setEventoDetalle((d) => {
              const list = Array.isArray(d.actividades) && d.actividades.length
                ? d.actividades
                : [emptyActividadRow()]
              return {
                ...d,
                actividades: list.map((r, i) => (
                  i === idx
                    ? {
                      ...r,
                      ubicacion_pk: loc.ubicacion_pk || '',
                      ubicacion_pk_id: loc.ubicacion_pk_id,
                      ubicacion_tramo: loc.ubicacion_tramo || '',
                      ubicacion_costado: loc.ubicacion_costado || '',
                      ubicacion_infraestructura: loc.ubicacion_infraestructura || '',
                      ubicacion_lat: loc.ubicacion_lat,
                      ubicacion_lng: loc.ubicacion_lng,
                    }
                    : r
                )),
              }
            })
            setMapTarget(null)
          }}
        />
      )}

      <BitacoraReportePersonalModal
        open={reportePersonalOpen}
        onClose={() => setReportePersonalOpen(false)}
        t={t}
        fecha={fecha}
        asistencia={asistencia}
        usos={usos}
        materiales={materiales}
        rrhhCatalogo={rrhhCatalogo}
        contratoId={contratoId}
        token={token}
        contratoMeta={contratoMeta}
      />

      {pdfPreviewOpen && pdfUrl && (
        <div
          role="presentation"
          onClick={() => setPdfPreviewOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 5700, background: 'rgba(15,23,42,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(960px, 96vw)', height: 'min(860px, 92vh)',
              background: t.bgCard || '#fff', borderRadius: 12,
              border: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderBottom: `1px solid ${t.border}`, gap: 8,
            }}>
              <div style={{ fontWeight: 800, color: t.text }}>Vista previa</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    const a = document.createElement('a')
                    a.href = pdfUrl
                    a.download = `bitacora_${fecha}.pdf`
                    a.click()
                  }}
                  style={btnPrimary}
                >
                  Descargar PDF
                </button>
                <button type="button" onClick={() => setPdfPreviewOpen(false)} style={btnGhost}>
                  Cerrar
                </button>
              </div>
            </div>
            <iframe
              title="Vista previa PDF bitácora"
              src={pdfUrl}
              style={{ flex: 1, width: '100%', border: 'none', background: '#525659' }}
            />
          </div>
        </div>
      )}

      {claraOpen && debeMostrarObservacionesDia(eventos) && (
        <IdeaClaraModal
          t={t}
          api={api}
          textoInicial={htmlToPlainText(cuerpoHtml)}
          onClose={() => setClaraOpen(false)}
          aplicarLabel="Aplicar al reporte"
          subtitulo="Mejore la redacción del texto de la bitácora con Clara."
          textoLabel="Texto del reporte"
          modo="redaccion"
          zIndex={14000}
          onEnviarAlActa={(texto) => {
            setCuerpoHtml(plainTextToHtml(texto))
            setClaraOpen(false)
          }}
        />
      )}
    </div>
  )
}
