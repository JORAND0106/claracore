import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import TopoAngularInput from './TopoAngularInput'
import TopoErrorModal from './TopoErrorModal'
import TopoConfirmModal from './TopoConfirmModal'
import PoligonalCalculoTable from './PoligonalCalculoTable'
import PoligonalCierrePanel from './PoligonalCierrePanel'
import PoligonalGrafico from './PoligonalGrafico'
import PoligonalValidacionPanel from './PoligonalValidacionPanel'
import PoligonalArmadaEditModal from './PoligonalArmadaEditModal'
import PoligonalPuntoEditModal from './PoligonalPuntoEditModal'
import PoligonalUndoToast from './PoligonalUndoToast'
import PoligonalPapeleraPanel from './PoligonalPapeleraPanel'
import FirmaPerfilTopo from './FirmaPerfilTopo'
import {
  useTopoTheme,
  useTopoViewport,
  parseApiError,
  puede,
  esDesarrolladorTopo,
} from './topografiaShared'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { btnSuccessStyle } from '../../theme/adminPanelTheme'
import { decimalToGms, fmtRatio, validarGms } from '../../utils/topografia_angular'

/** Metros desde input (acepta coma decimal). */
function parseMetrosInput(v) {
  if (v === '' || v == null) return null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function CampoLabel({ texto, ayuda }) {
  return (
    <span
      style={{
        fontSize: 'var(--cc-xs)',
        color: '#64748b',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        minHeight: 16,
      }}
    >
      {texto}
      {ayuda && (
        <span
          title={ayuda}
          aria-label={ayuda}
          style={{
            display: 'inline-flex',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#cbd5e1',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'help',
            flexShrink: 0,
          }}
        >
          ?
        </span>
      )}
    </span>
  )
}

const setupField = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }

const COLS_GENERAL = [
  { key: 'nombre', label: 'Nombre', ayuda: 'Nombre del circuito en la libreta de cálculo.', width: '14%' },
  {
    key: 'sentido',
    label: 'Sentido',
    ayuda: 'Sentido de recorrido de la poligonal. Horario aplica ángulos exteriores (n+2)×180°; antihorario aplica interiores (n−2)×180°.',
    width: '14%',
  },
  {
    key: 'plano',
    label: 'Plano',
    ayuda: 'Tolerancia de cierre lineal en planta (1:N). Res. 643 Tabla 2: menor a 1 000 m² → 1:20 000; hasta 1 ha → 1:15 000; hasta 10 ha → 1:10 000; ≥10 ha → 1:5 000.',
    width: '10%',
  },
  {
    key: 'angular',
    label: 'Angular',
    ayuda: 'Precisión angular del equipo (segundos). Tolerancia angular = este valor × √vértices (Res. 643 §9.2.2).',
    width: '10%',
  },
  {
    key: 'deltas',
    label: 'Deltas',
    ayuda: 'Longitud máxima recomendada entre deltas consecutivos (m). Referencia técnica 250–300 m; configurable.',
    width: '10%',
  },
  {
    key: 'cota',
    label: 'Cota',
    ayuda: 'Tolerancia de cierre en cota (mm/km de recorrido).',
    width: '10%',
  },
  { key: 'operador', label: 'Operador', ayuda: 'Profesional responsable del levantamiento en campo.', width: '16%' },
  { key: 'fecha', label: 'Fecha', ayuda: 'Fecha en que se realizó el trabajo de campo.', width: '12%' },
]

const COLS_EQUIPO = [
  { key: 'marca', label: 'Marca', ayuda: 'Fabricante del instrumento (estación total, GPS, etc.).' },
  { key: 'modelo', label: 'Modelo', ayuda: 'Referencia o modelo del equipo usado en campo.' },
  { key: 'serie', label: 'Serie', ayuda: 'Número de serie del instrumento según placa o factura.' },
]

const COLS_AMARRE_LIB = [
  { key: 'estacion', label: 'Estación', ayuda: 'Seleccione un BM verificado como punto de estación (amarre inicial), o ingrese coordenadas manualmente abajo.' },
  { key: 'visado', label: 'Visado', ayuda: 'Seleccione un BM verificado como punto de visado (referencia atrás), o ingrese coordenadas manualmente abajo.' },
  { key: 'llegada', label: 'Llegada', ayuda: 'Seleccione un BM verificado como punto de llegada (objetivo del cierre), o ingrese coordenadas manualmente abajo.' },
]

const COLS_AMARRE_COORDS = [
  { key: 'rol', label: 'Rol', width: '12%' },
  { key: 'punto', label: 'Punto', width: '22%' },
  { key: 'norte', label: 'Norte', width: '22%' },
  { key: 'este', label: 'Este', width: '22%' },
  { key: 'cota', label: 'Cota', width: '22%' },
]

/** Amarres de la libreta (estación / visado [/ llegada]). */
const COLS_AMARRES_LIBRETA = [
  { key: 'rol', label: 'Rol', width: '14%' },
  { key: 'punto', label: 'Punto', width: '22%', ayuda: 'Nombre del punto de amarre.' },
  { key: 'norte', label: 'Norte', width: '22%' },
  { key: 'este', label: 'Este', width: '22%' },
  { key: 'cota', label: 'Cota', width: '20%' },
]

/** Grilla compacta de armadas (bajo Amarres). */
const COLS_ARMADAS_COMPACT = [
  { key: 'orden', label: '#', width: '12%', ayuda: 'Número de armada.' },
  { key: 'estacion', label: 'Estación', width: '28%' },
  { key: 'visado', label: 'Visado', width: '28%' },
  { key: 'azimut', label: 'Az', width: '20%' },
  { key: 'ptos', label: 'Ptos', width: '12%' },
]

const COLS_NUEVA_ARMADA_VERT = [
  { key: 'campo', label: 'Campo', width: '36%' },
  { key: 'valor', label: 'Valor', width: '64%' },
]

/** Agregar punto: dos pares Campo|Valor por fila. */
const COLS_AGREGAR_PUNTO_2COL = [
  { key: 'c1', label: 'Campo', width: '18%' },
  { key: 'v1', label: 'Valor', width: '32%' },
  { key: 'c2', label: 'Campo', width: '18%' },
  { key: 'v2', label: 'Valor', width: '32%' },
]

const emptyForm = {
  nombre: '',
  tipo: 'cerrada',
  sentido: 'antihorario',
  tolerancia_relativa: 20000,
  tolerancia_cota_mm_km: 12,
  precision_angular_seg: 10,
  longitud_max_delta_m: 300,
  amarreModo: 'inline',
  punto_inicial_id: '',
  amarre: { nombre: '', norte: '', este: '', cota: '' },
  visadoModo: 'inline',
  punto_visado_id: '',
  visado: { nombre: '', norte: '', este: '', cota: '' },
  finalModo: 'inline',
  punto_final_id: '',
  llegada: { nombre: '', norte: '', este: '', cota: '' },
  operador: '',
  fecha_campo: '',
  observaciones: '',
  equipo_marca: '',
  equipo_referencia: '',
  equipo_serial: '',
}

export default function PoligonalModal({
  open,
  onClose,
  onSaved,
  contratoId,
  api,
  permisos,
  theme: themeProp,
  poligonalId: initialPoligonalId = null,
  initialDetalle = null,
  puntosVerificados = [],
  modoInicial = 'editar',
  usuario = null,
  token = null,
}) {
  const ui = useTopoTheme()
  const { isCompact } = useTopoViewport()
  const theme = themeProp || ui.t
  const sheet = useMemo(() => topoSheetStyles(theme), [theme])
  const [step, setStep] = useState('chooseTipo')
  const [poligonalId, setPoligonalId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [errorModal, setErrorModal] = useState(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState(emptyForm)
  const [operadores, setOperadores] = useState([])

  const [estForm, setEstForm] = useState({
    tipo_punto: 'auxiliar',
    nombre_punto: '',
    angulo_gms: '',
    angulo_vertical_gms: '',
    distancia: '',
    altura_objetivo: '',
  })

  const resetEstForm = () => ({
    tipo_punto: 'auxiliar',
    nombre_punto: '',
    angulo_gms: '',
    angulo_vertical_gms: '',
    distancia: '',
    altura_objetivo: '',
  })

  const [editandoId, setEditandoId] = useState(null)
  const [editPuntoModal, setEditPuntoModal] = useState(null)
  const [editArmadaModal, setEditArmadaModal] = useState(null)
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [undoToast, setUndoToast] = useState(null)
  const [mostrarPapelera, setMostrarPapelera] = useState(false)
  const [papeleraData, setPapeleraData] = useState(null)
  const [papeleraLoading, setPapeleraLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [ultimaSync, setUltimaSync] = useState(null)
  const [syncMsg, setSyncMsg] = useState(null)
  const [modo, setModo] = useState('editar')
  const formRef = useRef(null)
  const [armadaForm, setArmadaForm] = useState({ estacion_nombre: '', visado_nombre: '', altura_instrumento: '' })
  const [mostrarCambioArmada, setMostrarCambioArmada] = useState(false)
  const prevOpenRef = useRef(false)
  const prevPoligonalIdRef = useRef(null)

  const showError = useCallback((err) => {
    const parsed = parseApiError(err?.message || String(err))
    setErrorModal(parsed)
  }, [])

  // Mantener el popup de armada sincronizado tras recálculo / edición de puntos
  const editArmadaId = editArmadaModal?.id
  useEffect(() => {
    if (!editArmadaId || !detalle?.armadas) return
    const fresh = (detalle.armadas || []).find((a) => a.id === editArmadaId)
    if (!fresh) {
      setEditArmadaModal(null)
      return
    }
    setEditArmadaModal(fresh)
  }, [detalle, editArmadaId])

  /**
   * Aplica el detalle del servidor a la UI.
   * Por defecto NO reinicia el formulario «Agregar punto» (estForm): los refrescos
   * de cartera/armadas/HI no deben borrar captura en curso. Usar resetCaptura solo
   * al abrir/cambiar de poligonal o tras acciones que limpian la captura a propósito.
   */
  const aplicarDetalle = useCallback((data, id, opts = {}) => {
    const { resetCaptura = false } = opts
    setDetalle(data)
    setPoligonalId(id)
    setStep('estaciones')
    if (resetCaptura) {
      setEditandoId(null)
      setEstForm(resetEstForm())
    }
    setUltimaSync(Date.now())
    if (!data?.poligonal) return
    const pi = data.punto_inicial
    const pv = data.punto_visado
    setForm({
      nombre: data.poligonal.nombre || '',
      tipo: data.poligonal.tipo || 'cerrada',
      sentido: data.poligonal.sentido || 'antihorario',
      tolerancia_relativa: data.poligonal.tolerancia_relativa ?? 20000,
      tolerancia_cota_mm_km: data.poligonal.tolerancia_cota_mm_km ?? 12,
      precision_angular_seg: data.poligonal.precision_angular_seg ?? 10,
      longitud_max_delta_m: data.poligonal.longitud_max_delta_m ?? 300,
      amarreModo: pi?.verificado ? 'biblioteca' : 'inline',
      punto_inicial_id: data.poligonal.punto_inicial_id || '',
      amarre: {
        nombre: pi?.nombre || '',
        norte: pi?.norte ?? '',
        este: pi?.este ?? '',
        cota: pi?.cota ?? '',
      },
      visadoModo: pv?.verificado ? 'biblioteca' : 'inline',
      punto_visado_id: data.poligonal.punto_visado_id || '',
      visado: {
        nombre: pv?.nombre || '',
        norte: pv?.norte ?? '',
        este: pv?.este ?? '',
        cota: pv?.cota ?? '',
      },
      finalModo: data.punto_final?.verificado ? 'biblioteca' : 'inline',
      punto_final_id: data.poligonal.punto_final_id || '',
      llegada: {
        nombre: data.punto_final?.nombre || '',
        norte: data.punto_final?.norte ?? '',
        este: data.punto_final?.este ?? '',
        cota: data.punto_final?.cota ?? '',
      },
      operador: data.poligonal.operador || '',
      fecha_campo: data.poligonal.fecha_campo || '',
      observaciones: data.poligonal.observaciones || '',
      equipo_marca: data.poligonal.equipo_marca || '',
      equipo_referencia: data.poligonal.equipo_referencia || '',
      equipo_serial: data.poligonal.equipo_serial || '',
    })
  }, [])

  const cargarDetalle = useCallback(async (id, opts = {}) => {
    const { silencioso = false, resetCaptura = false } = opts
    if (!silencioso) setRefreshing(true)
    try {
      const data = await api(`/poligonales/${id}?_=${Date.now()}`)
      aplicarDetalle(data, id, { resetCaptura })
    } finally {
      if (!silencioso) setRefreshing(false)
    }
  }, [api, aplicarDetalle])

  const sincronizarDetalle = useCallback(async (mensaje) => {
    if (!poligonalId) return
    await cargarDetalle(poligonalId)
    onSaved?.(poligonalId)
    if (mensaje) {
      setSyncMsg(mensaje)
      window.setTimeout(() => setSyncMsg(null), 4500)
    }
  }, [poligonalId, cargarDetalle, onSaved])

  const ajustarPoligonal = async () => {
    if (!poligonalId) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/calcular`, { method: 'POST' })
      await sincronizarDetalle('Poligonal corregida y ajustada. Coordenadas listas para validación.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const recalcularPoligonalDev = async () => {
    if (!poligonalId) return
    setBusy(true)
    try {
      const data = await api(`/poligonales/${poligonalId}/recalcular`, { method: 'POST' })
      if (data?.poligonal) {
        aplicarDetalle(data, poligonalId, { resetCaptura: false })
      } else {
        await cargarDetalle(poligonalId)
      }
      onSaved?.(poligonalId)
      setSyncMsg('Poligonal recalculada (ajuste anterior invalidado). Revise cartera y cierre.')
      window.setTimeout(() => setSyncMsg(null), 5000)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false
      prevPoligonalIdRef.current = null
      return
    }
    const justOpened = !prevOpenRef.current
    prevOpenRef.current = true
    if (open) setModo(modoInicial || 'editar')
    setResultado(null)
    if (justOpened) setErrorModal(null)
    // Operadores solo al abrir: evitar trabajo extra en cada cambio de identidad de deps.
    if (justOpened) {
      api('/operadores')
        .then((rows) => setOperadores(Array.isArray(rows) ? rows : []))
        .catch(() => setOperadores([]))
    }
    if (initialPoligonalId) {
      // Hidratar solo al abrir o al cambiar de poligonal. Si el padre refresca
      // initialDetalle tras onSaved (p. ej. tras «Cambiar armada» o HI), NO
      // re-aplicar ni re-fetch: eso reiniciaba «Agregar punto» mientras el
      // usuario escribía. El modal ya mantiene su propio detalle vía sincronizarDetalle.
      const switched = prevPoligonalIdRef.current !== initialPoligonalId
      if (justOpened || switched) {
        prevPoligonalIdRef.current = initialPoligonalId
        const cacheOk = initialDetalle?.poligonal?.id === initialPoligonalId
        if (cacheOk) {
          aplicarDetalle(initialDetalle, initialPoligonalId, { resetCaptura: true })
          cargarDetalle(initialPoligonalId, { silencioso: true }).catch(showError)
        } else {
          cargarDetalle(initialPoligonalId, { resetCaptura: true }).catch(showError)
        }
      }
    } else if (justOpened) {
      // Solo reiniciar al abrir «Nueva»: no borrar la libreta si `api`/`cargarDetalle`
      // cambian de identidad a mitad de la creación (p. ej. contexto offline).
      prevPoligonalIdRef.current = null
      setStep('chooseTipo')
      setPoligonalId(null)
      setDetalle(null)
      setForm(emptyForm)
      setEstForm(resetEstForm())
      setEditandoId(null)
      setMostrarCambioArmada(false)
      setArmadaForm({ estacion_nombre: '', visado_nombre: '', altura_instrumento: '' })
    }
  }, [open, initialPoligonalId, initialDetalle, modoInicial, aplicarDetalle, cargarDetalle, showError, api])

  const puntoBiblioteca = useMemo(
    () => puntosVerificados.find((p) => p.id === form.punto_inicial_id),
    [puntosVerificados, form.punto_inicial_id],
  )

  const previewBase = useMemo(() => {
    const ne = Number(form.amarre.norte)
    const ee = Number(form.amarre.este)
    const nv = Number(form.visado.norte)
    const ev = Number(form.visado.este)
    if (form.amarre.norte === '' || form.amarre.este === '' || form.visado.norte === '' || form.visado.este === '') return null
    if (![ne, ee, nv, ev].every(Number.isFinite)) return null
    const dn = nv - ne
    const de = ev - ee
    const distancia = Math.sqrt(dn * dn + de * de)
    if (distancia === 0) return null
    let az = (Math.atan2(de, dn) * 180) / Math.PI
    if (az < 0) az += 360
    return { azimutDecimal: az, azimutTexto: decimalToGms(az), distancia }
  }, [form.amarre.norte, form.amarre.este, form.visado.norte, form.visado.este])

  const seleccionarBmBiblioteca = (id) => {
    const p = puntosVerificados.find((x) => x.id === id)
    if (!p) {
      setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '' })
      return
    }
    setForm({
      ...form,
      amarreModo: 'biblioteca',
      punto_inicial_id: id,
      amarre: {
        nombre: p.nombre,
        norte: p.norte ?? '',
        este: p.este ?? '',
        cota: p.cota ?? '',
      },
    })
  }

  const seleccionarVisadoBiblioteca = (id) => {
    const p = puntosVerificados.find((x) => x.id === id)
    if (!p) {
      setForm({ ...form, visadoModo: 'inline', punto_visado_id: '' })
      return
    }
    setForm({
      ...form,
      visadoModo: 'biblioteca',
      punto_visado_id: id,
      visado: {
        nombre: p.nombre,
        norte: p.norte ?? '',
        este: p.este ?? '',
        cota: p.cota ?? '',
      },
    })
  }

  const seleccionarLlegadaBiblioteca = (id) => {
    const p = puntosVerificados.find((x) => x.id === id)
    if (!p) {
      setForm({ ...form, finalModo: 'inline', punto_final_id: '' })
      return
    }
    setForm({
      ...form,
      finalModo: 'biblioteca',
      punto_final_id: id,
      llegada: {
        nombre: p.nombre,
        norte: p.norte ?? '',
        este: p.este ?? '',
        cota: p.cota ?? '',
      },
    })
  }

  const elegirTipoPoligonal = (tipo) => {
    setForm({ ...emptyForm, tipo, nombre: form.nombre || '' })
    setStep('setup')
  }

  const iniciarPoligonal = async () => {
    if (!form.nombre.trim()) {
      setErrorModal({
        titulo: 'Nombre requerido',
        mensaje: 'Indique un nombre para identificar la poligonal (ej. Poligonal 1).',
      })
      return
    }
    if (form.amarreModo === 'biblioteca') {
      if (!form.punto_inicial_id) {
        setErrorModal({
          titulo: 'Punto de amarre requerido',
          mensaje: 'Seleccione un BM verificado de la biblioteca o ingrese las coordenadas del punto de amarre.',
        })
        return
      }
    } else if (!form.amarre.nombre.trim() || form.amarre.norte === '' || form.amarre.este === '' || form.amarre.cota === '') {
      setErrorModal({
        titulo: 'Punto de estacion requerido',
        mensaje: 'Indique nombre, Norte, Este y Cota del punto de estacion. La cota es necesaria para el calculo trigonométrico.',
      })
      return
    }
    if (form.visadoModo === 'biblioteca') {
      if (!form.punto_visado_id) {
        setErrorModal({
          titulo: 'Punto de visado requerido',
          mensaje: 'Seleccione un BM verificado de la biblioteca o ingrese las coordenadas del punto de visado.',
        })
        return
      }
    } else if (!form.visado.nombre.trim() || form.visado.norte === '' || form.visado.este === '') {
      setErrorModal({
        titulo: 'Punto de visado requerido',
        mensaje: 'Indique nombre, Norte y Este del punto de visado. Con estas coordenadas se calcula el azimut de partida de la base.',
      })
      return
    }
    if (form.tipo === 'abierta') {
      if (form.finalModo === 'biblioteca') {
        if (!form.punto_final_id) {
          setErrorModal({
            titulo: 'Punto de llegada requerido',
            mensaje: 'Seleccione el BM de llegada o ingrese sus coordenadas.',
          })
          return
        }
      } else if (!form.llegada.nombre.trim() || form.llegada.norte === '' || form.llegada.este === '') {
        setErrorModal({
          titulo: 'Llegada requerida',
          mensaje: 'Indique nombre, Norte y Este del punto de llegada (cierre de la poligonal abierta).',
        })
        return
      }
    }
    setBusy(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        sentido: form.sentido,
        metodo: 'trigonometrica',
        tolerancia_relativa: Number(form.tolerancia_relativa) || 20000,
        tolerancia_cota_mm_km: Number(form.tolerancia_cota_mm_km) || 12,
        precision_angular_seg: Number(form.precision_angular_seg) || 10,
        longitud_max_delta_m: Number(form.longitud_max_delta_m) || 300,
        operador: form.operador || null,
        fecha_campo: form.fecha_campo || null,
        observaciones: form.observaciones || null,
        equipo_marca: form.equipo_marca?.trim() || null,
        equipo_referencia: form.equipo_referencia?.trim() || null,
        equipo_serial: form.equipo_serial?.trim() || null,
      }
      if (form.amarreModo === 'biblioteca') {
        payload.punto_inicial_id = form.punto_inicial_id
      } else {
        payload.amarre_inicial = {
          nombre: form.amarre.nombre.trim(),
          norte: Number(form.amarre.norte),
          este: Number(form.amarre.este),
          cota: form.amarre.cota === '' ? null : Number(form.amarre.cota),
        }
      }
      if (form.tipo === 'abierta') {
        if (form.finalModo === 'biblioteca') {
          payload.punto_final_id = form.punto_final_id
        } else {
          payload.amarre_final = {
            nombre: form.llegada.nombre.trim(),
            norte: Number(form.llegada.norte),
            este: Number(form.llegada.este),
            cota: form.llegada.cota === '' ? null : Number(form.llegada.cota),
          }
        }
      }
      if (form.visadoModo === 'biblioteca') {
        payload.punto_visado_id = form.punto_visado_id
      } else {
        payload.amarre_visado = {
          nombre: form.visado.nombre.trim(),
          norte: Number(form.visado.norte),
          este: Number(form.visado.este),
          cota: form.visado.cota === '' ? null : Number(form.visado.cota),
        }
      }
      const row = await api('/poligonales', { method: 'POST', body: JSON.stringify(payload) })
      if (row?.id) {
        await cargarDetalle(row.id)
        onSaved?.(row.id)
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const agregarPunto = async () => {
    if (!poligonalId) return
    if (!estForm.nombre_punto.trim()) {
      setErrorModal({ titulo: 'Nombre del punto', mensaje: 'Escriba el nombre del punto observado (estacion auxiliar o vertice).' })
      return
    }
    if (!estForm.angulo_gms) {
      setErrorModal({ titulo: 'Angulo horizontal requerido', mensaje: 'Ingrese el angulo horizontal observado en formato GG.MMSS.' })
      return
    }
    if (estForm.distancia !== '' && Number(estForm.distancia) < 0) {
      setErrorModal({ titulo: 'Distancia invalida', mensaje: 'La distancia horizontal no puede ser negativa (metros).' })
      return
    }
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/estaciones`, {
        method: 'POST',
        body: JSON.stringify({
          tipo_punto: estForm.tipo_punto,
          nombre_punto: estForm.nombre_punto.trim(),
          angulo_gms: Number(estForm.angulo_gms),
          angulo_vertical_gms: estForm.angulo_vertical_gms === '' || estForm.angulo_vertical_gms == null ? null : Number(estForm.angulo_vertical_gms),
          distancia: estForm.distancia === '' || estForm.distancia == null ? null : Number(estForm.distancia),
          altura_objetivo: estForm.altura_objetivo === '' ? 0 : Number(estForm.altura_objetivo),
        }),
      })
      setEstForm(resetEstForm())
      setResultado(null)
      await sincronizarDetalle('Punto agregado. Cartera actualizada.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const iniciarEdicion = (p) => {
    setEditandoId(p.id)
    setEditPuntoModal(p)
  }

  const cancelarEdicion = () => {
    setEditandoId(null)
    setEditPuntoModal(null)
    setEstForm(resetEstForm())
  }

  const guardarEdicionPopup = async (payload) => {
    if (!poligonalId || !editPuntoModal?.id) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/estaciones/${editPuntoModal.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setResultado(null)
      await sincronizarDetalle('Punto guardado. Cartera y plano actualizados.')
      cancelarEdicion()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const cerrarCircuito = async () => {
    if (!poligonalId) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/cerrar`, { method: 'POST' })
      setResultado(null)
      await sincronizarDetalle('Poligonal terminada. Pendiente validación contratista e interventoría.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const solicitarEliminarPunto = (puntoOId) => {
    const id = typeof puntoOId === 'object' ? puntoOId?.id : puntoOId
    if (!id) return
    const p = typeof puntoOId === 'object'
      ? puntoOId
      : (detalle?.estaciones || []).find((e) => e.id === id)
    setConfirmEliminar({
      tipo: 'estacion',
      id,
      nombre: p?.nombre_punto || 'punto',
    })
  }

  const solicitarEliminarArmada = (arm) => {
    if (!arm?.id) return
    setConfirmEliminar({
      tipo: 'armada',
      id: arm.id,
      nombre: `armada #${arm.orden} (${arm.estacion_nombre || '?'})`,
    })
  }

  const ejecutarEliminacion = async () => {
    if (!poligonalId || !confirmEliminar) return
    const { tipo, id, nombre } = confirmEliminar
    setBusy(true)
    try {
      if (tipo === 'armada') {
        await api(`/poligonales/${poligonalId}/armadas/${id}`, { method: 'DELETE' })
        setEditArmadaModal(null)
        setConfirmEliminar(null)
        setResultado(null)
        await sincronizarDetalle()
        setUndoToast({
          message: `Armada eliminada — ${nombre}`,
          restorePath: `/poligonales/${poligonalId}/armadas/${id}/restaurar`,
        })
        if (mostrarPapelera) await cargarPapelera()
      } else {
        await api(`/poligonales/${poligonalId}/estaciones/${id}`, { method: 'DELETE' })
        if (editandoId === id) cancelarEdicion()
        setConfirmEliminar(null)
        setResultado(null)
        await sincronizarDetalle()
        setUndoToast({
          message: `Punto eliminado — ${nombre}`,
          restorePath: `/poligonales/${poligonalId}/estaciones/${id}/restaurar`,
        })
        if (mostrarPapelera) await cargarPapelera()
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const deshacerEliminacion = async () => {
    if (!undoToast?.restorePath) return
    const path = undoToast.restorePath
    setUndoToast(null)
    setBusy(true)
    try {
      await api(path, { method: 'PUT' })
      setResultado(null)
      await sincronizarDetalle('Elemento restaurado.')
      if (mostrarPapelera) await cargarPapelera()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const cargarPapelera = useCallback(async () => {
    if (!poligonalId) return
    setPapeleraLoading(true)
    try {
      const data = await api(`/poligonales/${poligonalId}/papelera`)
      setPapeleraData(data)
    } catch (e) {
      showError(e)
    } finally {
      setPapeleraLoading(false)
    }
  }, [api, poligonalId, showError])

  const restaurarDesdePapelera = async (tipo, item) => {
    if (!poligonalId || !item?.id) return
    setBusy(true)
    try {
      const path = tipo === 'armada'
        ? `/poligonales/${poligonalId}/armadas/${item.id}/restaurar`
        : `/poligonales/${poligonalId}/estaciones/${item.id}/restaurar`
      await api(path, { method: 'PUT' })
      setResultado(null)
      await sincronizarDetalle('Elemento restaurado desde papelera.')
      await cargarPapelera()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const purgarDesdePapelera = async (tipo, item) => {
    if (!poligonalId || !item?.id) return
    setConfirmEliminar({
      tipo: tipo === 'armada' ? 'purgar_armada' : 'purgar_estacion',
      id: item.id,
      nombre: tipo === 'armada'
        ? `armada #${item.orden}`
        : (item.nombre_punto || 'punto'),
    })
  }

  const ejecutarPurga = async () => {
    if (!poligonalId || !confirmEliminar) return
    const { tipo, id } = confirmEliminar
    setBusy(true)
    try {
      const path = tipo === 'purgar_armada'
        ? `/poligonales/${poligonalId}/armadas/${id}/purgar`
        : `/poligonales/${poligonalId}/estaciones/${id}/purgar`
      await api(path, { method: 'DELETE' })
      setConfirmEliminar(null)
      await cargarPapelera()
      await sincronizarDetalle('Elemento eliminado definitivamente.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const guardarArmadaPopup = async (payload) => {
    if (!poligonalId || !editArmadaModal?.id) return
    if (!payload.estacion_nombre || !payload.visado_nombre) {
      setErrorModal({ titulo: 'Armada incompleta', mensaje: 'Indique estación y visado.' })
      return
    }
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/armadas/${editArmadaModal.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setResultado(null)
      // Mantener el popup abierto: la revisión integrada requiere seguir viendo los puntos
      await sincronizarDetalle('Armada actualizada. Cartera y plano recalculados.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const guardarPuntoDesdeArmada = async (puntoId, payload) => {
    if (!poligonalId || !puntoId) return false
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/estaciones/${puntoId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setResultado(null)
      await sincronizarDetalle('Punto guardado. Cartera y plano actualizados.')
      return true
    } catch (e) {
      showError(e)
      return false
    } finally {
      setBusy(false)
    }
  }

  const agregarPuntoDesdeArmada = async (payload) => {
    if (!poligonalId || !editArmadaModal?.id) return false
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/estaciones`, {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          armada_id: editArmadaModal.id,
        }),
      })
      setResultado(null)
      await sincronizarDetalle('Punto agregado a la armada. Cartera actualizada.')
      return true
    } catch (e) {
      showError(e)
      return false
    } finally {
      setBusy(false)
    }
  }

  const cambiarSentido = async (nuevo) => {
    if (!poligonalId) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/sentido`, { method: 'POST', body: JSON.stringify({ sentido: nuevo }) })
      setForm((f) => ({ ...f, sentido: nuevo }))
      setResultado(null)
      await sincronizarDetalle()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const crearArmada = async () => {
    if (!poligonalId) return
    if (!armadaForm.estacion_nombre || !armadaForm.visado_nombre) {
      setErrorModal({ titulo: 'Cambio de armada', mensaje: 'Seleccione la nueva estacion (punto tipo estacion ya radiado) y el visado de atras.' })
      return
    }
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/armadas`, {
        method: 'POST',
        body: JSON.stringify({
          estacion_nombre: armadaForm.estacion_nombre,
          visado_nombre: armadaForm.visado_nombre,
          altura_instrumento: armadaForm.altura_instrumento === '' ? null : Number(armadaForm.altura_instrumento),
        }),
      })
      setArmadaForm({ estacion_nombre: '', visado_nombre: '', altura_instrumento: '' })
      setMostrarCambioArmada(false)
      setResultado(null)
      // Tras cambiar de armada la captura queda limpia y lista; el sync posterior
      // no debe volver a tocar estForm (aplicarDetalle ya no lo reinicia).
      setEditandoId(null)
      setEstForm(resetEstForm())
      await sincronizarDetalle('Armada creada.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const actualizarHIArmada = async (armadaId, hi) => {
    if (!poligonalId || !armadaId) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/armadas/${armadaId}`, {
        method: 'PUT',
        body: JSON.stringify({ altura_instrumento: hi === '' ? null : Number(hi) }),
      })
      setResultado(null)
      // Solo refresca cartera/armadas; estForm (Agregar punto) debe persistir.
      await sincronizarDetalle()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const guardarAmarres = async () => {
    if (!poligonalId) return
    const build = (a, etiqueta) => {
      if (!a.nombre?.trim()) {
        setErrorModal({ titulo: 'Amarre incompleto', mensaje: `Indique el nombre del punto de ${etiqueta}.` })
        return null
      }
      const norte = parseMetrosInput(a.norte)
      const este = parseMetrosInput(a.este)
      if (norte == null || este == null) {
        setErrorModal({ titulo: 'Coordenadas requeridas', mensaje: `Norte y Este del ${etiqueta} son obligatorios (metros).` })
        return null
      }
      const cotaRaw = a.cota === '' || a.cota == null ? null : parseMetrosInput(a.cota)
      if (a.cota !== '' && a.cota != null && cotaRaw == null) {
        setErrorModal({ titulo: 'Cota invalida', mensaje: `Revise la cota del ${etiqueta}.` })
        return null
      }
      return { nombre: a.nombre.trim(), norte, este, cota: cotaRaw }
    }
    const estacion = build(form.amarre, 'estación (amarre)')
    if (!estacion) return
    const visado = build(form.visado, 'visado')
    if (!visado) return
    const payload = { estacion, visado }
    if (detalle?.poligonal?.tipo === 'abierta') {
      const llegada = build(form.llegada, 'llegada')
      if (!llegada) return
      payload.llegada = llegada
    }
    const teniaAjuste = Boolean(detalle?.poligonal?.ajustada_at)
    setBusy(true)
    try {
      const data = await api(`/poligonales/${poligonalId}/amarres`, {
        method: 'PUT',
        body: JSON.stringify({ estacion, visado }),
      })
      if (data?.poligonal) {
        aplicarDetalle(data, poligonalId)
        onSaved?.(poligonalId)
      } else {
        await sincronizarDetalle()
      }
      setSyncMsg(
        teniaAjuste
          ? 'Amarres actualizados. Ejecute «Corregir y ajustar» para recalcular la poligonal.'
          : 'Coordenadas de amarre actualizadas. Cartera recalculada.'
      )
      window.setTimeout(() => setSyncMsg(null), 5000)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const overlay = {
    position: 'fixed',
    inset: 0,
    zIndex: 100010,
    background: 'rgba(15, 23, 42, 0.5)',
    display: 'flex',
    alignItems: isCompact ? 'stretch' : 'flex-start',
    justifyContent: 'center',
    padding: isCompact ? 0 : '24px 16px',
    overflowY: 'auto',
  }

  const panel = {
    width: '100%',
    maxWidth: isCompact ? '100%' : 1560,
    minHeight: isCompact ? '100%' : undefined,
    maxHeight: isCompact ? '100dvh' : undefined,
    background: ui.card.background,
    borderRadius: isCompact ? 0 : 14,
    border: ui.card.border,
    boxShadow: theme?.shadow || ui.t?.shadow || '0 24px 64px rgba(0,0,0,0.25)',
    color: ui.text,
    padding: isCompact ? 14 : 20,
    boxSizing: 'border-box',
    overflowY: isCompact ? 'auto' : undefined,
    WebkitOverflowScrolling: isCompact ? 'touch' : undefined,
  }

  return (
    <>
      <div style={overlay} onClick={onClose}>
        <div style={panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <CcModalBrandHeader theme={t} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--cc-lg)' }}>
                {step === 'chooseTipo'
                  ? 'Nueva poligonal'
                  : step === 'setup'
                    ? `Nueva poligonal ${form.tipo === 'abierta' ? 'abierta' : 'cerrada'}`
                    : (() => {
                        const p = detalle?.poligonal
                        const selladaT = (p?.nivel2_estado || '') === 'Aprobado' || Boolean(p?.biblioteca_at)
                        const terminadaT = p?.estado === 'cerrado'
                        const nombre = p?.nombre || 'Poligonal'
                        if (terminadaT && selladaT) return `Ver · ${nombre}`
                        if (terminadaT) return `Validar · ${nombre}`
                        return `Editar · ${nombre}`
                      })()}
              </h2>
              {step === 'estaciones' && (
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 'var(--cc-sm)' }}>
                  {detalle?.poligonal?.estado === 'cerrado'
                    ? 'Coordenadas calculadas y validación.'
                    : 'Libreta de cálculo — ingrese observaciones y termine cuando el cierre sea admisible.'}
                </p>
              )}
              {step !== 'estaciones' && (
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 'var(--cc-sm)' }}>
                Poligonal trigonométrica — ingrese estaciones con angulos horizontal/vertical, HI y distancia.
              </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {step === 'estaciones' && poligonalId && (
                <button
                  type="button"
                  style={ui.btnSecondary}
                  title="Vuelve a leer la poligonal del servidor y recalcula la cartera"
                  onClick={() => sincronizarDetalle('Cartera actualizada desde el servidor.')}
                  disabled={busy || refreshing}
                >
                  {refreshing ? 'Actualizando…' : 'Actualizar'}
                </button>
              )}
              {step === 'estaciones' && poligonalId && esDesarrolladorTopo(usuario) && !((detalle?.poligonal?.nivel2_estado || '') === 'Aprobado' || Boolean(detalle?.poligonal?.biblioteca_at)) && (
                <button
                  type="button"
                  style={ui.btnSecondary}
                  title="Invalida coordenadas/azimuts ajustados y recalcula con la fórmula vigente (Desarrollador)"
                  onClick={recalcularPoligonalDev}
                  disabled={busy || refreshing}
                >
                  {busy ? 'Recalculando…' : 'Recalcular'}
                </button>
              )}
              <button type="button" style={ui.btnSecondary} onClick={onClose}>Cerrar</button>
            </div>
          </div>
          {syncMsg && (
            <p style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, background: '#ecfdf5', color: 'var(--cc-color-success)', fontSize: 'var(--cc-sm)' }}>
              {syncMsg}
            </p>
          )}

          {step === 'chooseTipo' && (
            <div>
              <p style={{ margin: '0 0 16px', fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                Elija el tipo de circuito. La libreta, cálculos y PDF comparten el mismo formato; la abierta cierra al punto de llegada.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => elegirTipoPoligonal('cerrada')}
                  style={{
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 10,
                    border: `2px solid ${ui.accent}`,
                    background: ui.accentSoft,
                    cursor: 'pointer',
                    color: ui.text,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: ui.accent, marginBottom: 6 }}>Poligonal cerrada</div>
                  <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                    Inicio = estación + visado. El circuito regresa al punto inicial. Cierre angular y lineal al amarre de partida.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => elegirTipoPoligonal('abierta')}
                  style={{
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 10,
                    border: `2px solid ${ui.accent}`,
                    background: ui.accentSoft,
                    cursor: 'pointer',
                    color: ui.text,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: ui.accent, marginBottom: 6 }}>Poligonal abierta</div>
                  <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                    Inicio = estación + visado + <strong>llegada</strong> (coordenada objetivo). El cierre se calcula contra la llegada, no al inicio.
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === 'setup' && (
            <div>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={ui.btnSecondary} onClick={() => setStep('chooseTipo')}>← Cambiar tipo</button>
                <span style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: ui.accentSoft, color: ui.accent }}>
                  {form.tipo === 'abierta' ? 'Abierta' : 'Cerrada'}
                </span>
              </div>

              <TopoExcelSheet
                sheet={sheet}
                title="Datos generales"
                columns={COLS_GENERAL}
                minWidth={720}
                cells={[
                  <input
                    key="nombre"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    style={sheet.cellInp}
                    placeholder="Poligonal 1"
                  />,
                  <select
                    key="sentido"
                    value={form.sentido}
                    onChange={(e) => setForm({ ...form, sentido: e.target.value })}
                    style={sheet.cellSelect}
                  >
                    <option value="antihorario">Antihorario (interiores)</option>
                    <option value="horario">Horario (exteriores)</option>
                  </select>,
                  <input
                    key="plano"
                    type="number"
                    value={form.tolerancia_relativa}
                    onChange={(e) => setForm({ ...form, tolerancia_relativa: e.target.value })}
                    style={sheet.cellInp}
                  />,
                  <input
                    key="angular"
                    type="number"
                    step="0.1"
                    value={form.precision_angular_seg}
                    onChange={(e) => setForm({ ...form, precision_angular_seg: e.target.value })}
                    style={sheet.cellInp}
                    placeholder="10"
                  />,
                  <input
                    key="deltas"
                    type="number"
                    value={form.longitud_max_delta_m}
                    onChange={(e) => setForm({ ...form, longitud_max_delta_m: e.target.value })}
                    style={sheet.cellInp}
                    placeholder="300"
                  />,
                  <input
                    key="cota"
                    type="number"
                    value={form.tolerancia_cota_mm_km}
                    onChange={(e) => setForm({ ...form, tolerancia_cota_mm_km: e.target.value })}
                    style={sheet.cellInp}
                  />,
                  <select
                    key="operador"
                    value={form.operador}
                    onChange={(e) => setForm({ ...form, operador: e.target.value })}
                    style={sheet.cellSelect}
                  >
                    <option value="">— Seleccione —</option>
                    {operadores.map((u) => (
                      <option key={u.id} value={u.nombre}>{u.nombre}{u.cargo ? ` (${u.cargo})` : ''}</option>
                    ))}
                    {form.operador && !operadores.some((u) => u.nombre === form.operador) && (
                      <option value={form.operador}>{form.operador}</option>
                    )}
                  </select>,
                  <input
                    key="fecha"
                    type="date"
                    value={form.fecha_campo}
                    onChange={(e) => setForm({ ...form, fecha_campo: e.target.value })}
                    style={sheet.cellInp}
                  />,
                ]}
              />

              <TopoExcelSheet
                sheet={sheet}
                title="Equipo de medición"
                columns={COLS_EQUIPO}
                minWidth={360}
                cells={[
                  <input
                    key="marca"
                    value={form.equipo_marca}
                    onChange={(e) => setForm({ ...form, equipo_marca: e.target.value })}
                    style={sheet.cellInp}
                    placeholder="Ej. Leica"
                  />,
                  <input
                    key="modelo"
                    value={form.equipo_referencia}
                    onChange={(e) => setForm({ ...form, equipo_referencia: e.target.value })}
                    style={sheet.cellInp}
                    placeholder="Ej. TS16"
                  />,
                  <input
                    key="serie"
                    value={form.equipo_serial}
                    onChange={(e) => setForm({ ...form, equipo_serial: e.target.value })}
                    style={sheet.cellInp}
                    placeholder="Ej. 123456"
                  />,
                ]}
              />

              <div style={{ marginBottom: 16 }}>
                <div style={sheet.sectionTitle}>Puntos de amarre (estación y visado)</div>
                <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-sm)', color: sheet.textMuted }}>
                  Defina el punto de estación (inicio del circuito) y el punto de visado (referencia). Con ambas coordenadas se calcula el azimut y la distancia de la base de partida. Al terminar con cierre admisible, la poligonal queda lista para validación; la biblioteca se publica cuando interventoría aprueba.
                </p>

                {puntosVerificados.length > 0 && (
                  <TopoExcelSheet
                    sheet={sheet}
                    columns={form.tipo === 'abierta' ? COLS_AMARRE_LIB : COLS_AMARRE_LIB.slice(0, 2)}
                    minWidth={form.tipo === 'abierta' ? 480 : 360}
                    cells={[
                      <select
                        key="est-lib"
                        value={form.amarreModo === 'biblioteca' ? form.punto_inicial_id : ''}
                        onChange={(e) => seleccionarBmBiblioteca(e.target.value)}
                        style={sheet.cellSelect}
                      >
                        <option value="">— Manual —</option>
                        {puntosVerificados.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                        ))}
                      </select>,
                      <select
                        key="vis-lib"
                        value={form.visadoModo === 'biblioteca' ? form.punto_visado_id : ''}
                        onChange={(e) => seleccionarVisadoBiblioteca(e.target.value)}
                        style={sheet.cellSelect}
                      >
                        <option value="">— Manual —</option>
                        {puntosVerificados.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                        ))}
                      </select>,
                      ...(form.tipo === 'abierta'
                        ? [
                          <select
                            key="lleg-lib"
                            value={form.finalModo === 'biblioteca' ? form.punto_final_id : ''}
                            onChange={(e) => seleccionarLlegadaBiblioteca(e.target.value)}
                            style={sheet.cellSelect}
                          >
                            <option value="">— Manual —</option>
                            {puntosVerificados.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                            ))}
                          </select>,
                        ]
                        : []),
                    ]}
                  />
                )}

                <TopoExcelSheet
                  sheet={sheet}
                  columns={COLS_AMARRE_COORDS}
                  minWidth={560}
                >
                  <tr>
                    <td style={{ ...sheet.td, fontWeight: 600 }}>Estación</td>
                    <td style={sheet.td}>
                      <input
                        value={form.amarre.nombre}
                        disabled={form.amarreModo === 'biblioteca'}
                        onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, nombre: e.target.value } })}
                        style={form.amarreModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                        placeholder="EST-1"
                      />
                    </td>
                    <td style={sheet.td}>
                      <input
                        value={form.amarre.norte}
                        disabled={form.amarreModo === 'biblioteca'}
                        onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, norte: e.target.value } })}
                        style={form.amarreModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                        placeholder="0.000"
                      />
                    </td>
                    <td style={sheet.td}>
                      <input
                        value={form.amarre.este}
                        disabled={form.amarreModo === 'biblioteca'}
                        onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, este: e.target.value } })}
                        style={form.amarreModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                        placeholder="0.000"
                      />
                    </td>
                    <td style={sheet.td}>
                      <input
                        value={form.amarre.cota}
                        disabled={form.amarreModo === 'biblioteca'}
                        onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, cota: e.target.value } })}
                        style={form.amarreModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                        placeholder="Cota"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...sheet.td, fontWeight: 600 }}>Visado</td>
                    <td style={sheet.td}>
                      <input
                        value={form.visado.nombre}
                        disabled={form.visadoModo === 'biblioteca'}
                        onChange={(e) => setForm({ ...form, visadoModo: 'inline', punto_visado_id: '', visado: { ...form.visado, nombre: e.target.value } })}
                        style={form.visadoModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                        placeholder="VIS-1"
                      />
                    </td>
                    <td style={sheet.td}>
                      <input
                        value={form.visado.norte}
                        disabled={form.visadoModo === 'biblioteca'}
                        onChange={(e) => setForm({ ...form, visadoModo: 'inline', punto_visado_id: '', visado: { ...form.visado, norte: e.target.value } })}
                        style={form.visadoModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                        placeholder="0.000"
                      />
                    </td>
                    <td style={sheet.td}>
                      <input
                        value={form.visado.este}
                        disabled={form.visadoModo === 'biblioteca'}
                        onChange={(e) => setForm({ ...form, visadoModo: 'inline', punto_visado_id: '', visado: { ...form.visado, este: e.target.value } })}
                        style={form.visadoModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                        placeholder="0.000"
                      />
                    </td>
                    <td style={sheet.td}>
                      <input
                        value={form.visado.cota}
                        disabled={form.visadoModo === 'biblioteca'}
                        onChange={(e) => setForm({ ...form, visadoModo: 'inline', punto_visado_id: '', visado: { ...form.visado, cota: e.target.value } })}
                        style={form.visadoModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                        placeholder="Opcional"
                      />
                    </td>
                  </tr>
                  {form.tipo === 'abierta' && (
                    <tr>
                      <td style={{ ...sheet.td, fontWeight: 600, color: ui.accent }}>Llegada</td>
                      <td style={sheet.td}>
                        <input
                          value={form.llegada.nombre}
                          disabled={form.finalModo === 'biblioteca'}
                          onChange={(e) => setForm({ ...form, finalModo: 'inline', punto_final_id: '', llegada: { ...form.llegada, nombre: e.target.value } })}
                          style={form.finalModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                          placeholder="FIN"
                        />
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.llegada.norte}
                          disabled={form.finalModo === 'biblioteca'}
                          onChange={(e) => setForm({ ...form, finalModo: 'inline', punto_final_id: '', llegada: { ...form.llegada, norte: e.target.value } })}
                          style={form.finalModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                          placeholder="0.000"
                        />
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.llegada.este}
                          disabled={form.finalModo === 'biblioteca'}
                          onChange={(e) => setForm({ ...form, finalModo: 'inline', punto_final_id: '', llegada: { ...form.llegada, este: e.target.value } })}
                          style={form.finalModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                          placeholder="0.000"
                        />
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.llegada.cota}
                          disabled={form.finalModo === 'biblioteca'}
                          onChange={(e) => setForm({ ...form, finalModo: 'inline', punto_final_id: '', llegada: { ...form.llegada, cota: e.target.value } })}
                          style={form.finalModo === 'biblioteca' ? sheet.cellRo : sheet.cellInp}
                          placeholder="Opcional"
                        />
                      </td>
                    </tr>
                  )}
                </TopoExcelSheet>

                {previewBase && (
                  <div style={{ marginTop: 4, marginBottom: 8, padding: '10px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontSize: 'var(--cc-sm)', color: '#1e3a8a', fontWeight: 600 }}>
                      Base {form.amarre.nombre || 'EST'} → {form.visado.nombre || 'VIS'}
                    </span>
                    <span style={{ fontSize: 'var(--cc-sm)', color: '#1e40af', marginLeft: 10 }}>
                      Azimut: {previewBase.azimutTexto} · Distancia: {previewBase.distancia.toFixed(3)} m
                    </span>
                  </div>
                )}

                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: sheet.textMuted }}>
                  Formula altimetrica: ΔZ = HI + D·tan(angulo vertical) − HT
                </p>

                {form.amarreModo === 'biblioteca' && puntoBiblioteca && (
                  <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: '#166534' }}>
                    Estacion usando BM verificado: {puntoBiblioteca.nombre}
                  </p>
                )}
              </div>

              {form.tipo === 'abierta' && (
                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: ui.accent }}>
                  La llegada es la coordenada objetivo: al terminar el circuito se compara la posición calculada contra este punto.
                </p>
              )}

              {puede(permisos, 'crear') && (
                <button type="button" style={ui.btnPrimary} onClick={iniciarPoligonal} disabled={busy}>
                  {busy ? 'Creando…' : 'Iniciar poligonal'}
                </button>
              )}
            </div>
          )}

          {step === 'estaciones' && detalle && (() => {
            const pol = detalle.poligonal || {}
            const sellada = (pol.nivel2_estado || '') === 'Aprobado' || Boolean(pol.biblioteca_at)
            const terminada = pol.estado === 'cerrado'
            const soloVer = sellada
            const editableLibreta = puede(permisos, 'editar') && !terminada && !soloVer
            const armadas = detalle.armadas || []
            const armadaActual = armadas.length ? armadas[armadas.length - 1] : null
            const estDisp = detalle.puntos_estacion_disponibles || []
            const visDisp = detalle.puntos_visado_disponibles || []
            const fmt = (v, d = 3) => (v === null || v === undefined || v === '') ? '—' : Number(v).toFixed(d)
            return (
            <div>
              {!terminada && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: 'var(--cc-sm)', color: '#475569' }} title="Datos generales del circuito">
                    Libreta · {pol.tipo} · Tol. {fmtRatio(pol.tolerancia_relativa ?? 20000)}
                  </span>
                  {editableLibreta && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <CampoLabel
                      texto="Sentido"
                      ayuda="Horario = ángulos exteriores; antihorario = interiores."
                    />
                    <select
                      value={pol.sentido || 'antihorario'}
                      onChange={(e) => cambiarSentido(e.target.value)}
                      disabled={busy}
                      style={{ ...ui.inputStyle, width: 'auto', padding: '6px 8px' }}
                    >
                      <option value="antihorario">Antihorario (interiores)</option>
                      <option value="horario">Horario (exteriores)</option>
                    </select>
                  </label>
                  )}
                </div>
              </div>
              )}

              {editableLibreta && (() => {
                const sheetInCol = { ...sheet, sectionTitle: { ...sheet.sectionTitle, marginBottom: 4 } }
                const labelCell = {
                  ...sheet.td,
                  fontSize: 10,
                  fontWeight: 700,
                  color: ui.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  whiteSpace: 'nowrap',
                  background: sheet.th?.background || undefined,
                }
                const panelCol = {
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }
                const hiInput = armadaActual ? (
                  <input
                    key={`hi-cur-${armadaActual.id}-${armadaActual.altura_instrumento ?? 'x'}`}
                    type="number"
                    step="0.001"
                    defaultValue={armadaActual.altura_instrumento ?? ''}
                    onBlur={(e) => {
                      if (String(e.target.value) !== String(armadaActual.altura_instrumento ?? '')) {
                        actualizarHIArmada(armadaActual.id, e.target.value)
                      }
                    }}
                    disabled={busy}
                    style={{
                      ...sheet.cellInp,
                      background: armadaActual.altura_instrumento == null ? '#fffbeb' : 'transparent',
                    }}
                    placeholder="1.500"
                    title="Altura del instrumento de la armada actual (m)"
                  />
                ) : (
                  <span key="hi-empty" style={sheet.cellRo}>—</span>
                )
                const fieldPunto = (
                  <input
                    key="punto"
                    value={estForm.nombre_punto}
                    onChange={(e) => setEstForm((f) => ({ ...f, nombre_punto: e.target.value }))}
                    style={sheet.cellInp}
                    placeholder="Ej. P1"
                    title="Nombre del punto observado adelante (o radiado)."
                    data-testid="agregar-punto-nombre"
                  />
                )
                const fieldTipo = (
                  <select
                    key="tipo"
                    value={estForm.tipo_punto}
                    onChange={(e) => setEstForm((f) => ({ ...f, tipo_punto: e.target.value }))}
                    style={sheet.cellSelect}
                    title="Estación = vértice del circuito. Auxiliar = punto de detalle radiado."
                  >
                    <option value="auxiliar">Auxiliar</option>
                    <option value="estacion">Estacion</option>
                  </select>
                )
                const fieldAngH = (
                  <TopoAngularInput
                    key="ang_h"
                    label={null}
                    value={estForm.angulo_gms}
                    onChange={(_, v) => setEstForm((f) => ({ ...f, angulo_gms: v }))}
                    inputStyle={sheet.cellInp}
                  />
                )
                const fieldAngV = (
                  <TopoAngularInput
                    key="ang_v"
                    label={null}
                    value={estForm.angulo_vertical_gms}
                    onChange={(_, v) => setEstForm((f) => ({ ...f, angulo_vertical_gms: v }))}
                    inputStyle={sheet.cellInp}
                  />
                )
                const fieldHt = (
                  <input
                    key="ht"
                    value={estForm.altura_objetivo}
                    onChange={(e) => setEstForm((f) => ({ ...f, altura_objetivo: e.target.value }))}
                    style={sheet.cellInp}
                    placeholder="0"
                    title="HT: altura del prisma u objetivo sobre el punto observado (m)."
                    data-testid="agregar-punto-ht"
                  />
                )
                const fieldDist = (
                  <input
                    key="dist"
                    value={estForm.distancia}
                    onChange={(e) => setEstForm((f) => ({ ...f, distancia: e.target.value }))}
                    style={sheet.cellInp}
                    placeholder="0.000"
                    title="Distancia horizontal medida al punto observado (m)."
                    data-testid="agregar-punto-dist"
                  />
                )
                const agregarPares = [
                  ['Punto', fieldPunto, 'Tipo', fieldTipo],
                  ['Ang. obs.', fieldAngH, 'Ang. vert.', fieldAngV],
                  ['Prisma / HT', fieldHt, 'Distancia', fieldDist],
                  ['HI armada', hiInput, '', null],
                ]
                return (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isCompact ? '1fr' : 'minmax(0, 1.15fr) minmax(0, 1fr)',
                  gap: 10,
                  marginBottom: 12,
                  padding: 10,
                  border: `1px solid ${ui.accent}55`,
                  borderRadius: 8,
                  background: ui.accentSoft || '#f8fafc',
                  alignItems: 'start',
                }}
              >
                {/* Bloque izquierdo — Amarres (Excel) + Puntos de armada apilados */}
                <div style={{ ...panelCol, ...(!isCompact ? { borderRight: `1px solid ${sheet.border}`, paddingRight: 10 } : null) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', color: ui.accent }}>
                      Amarres
                      {detalle.base && (
                        <span style={{ fontWeight: 500, color: ui.textMuted, marginLeft: 6, fontSize: 'var(--cc-xs)' }}>
                          · Az {detalle.base.azimut_texto ?? '—'} · {fmt(detalle.base.distancia, 3)} m
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      style={{ ...ui.btnPrimary, padding: '4px 10px', fontSize: 'var(--cc-xs)' }}
                      onClick={guardarAmarres}
                      disabled={busy}
                      title="Coordenadas provisorias o definitivas; recalcula la cartera"
                    >
                      {busy ? '…' : 'Guardar'}
                    </button>
                  </div>
                  <TopoExcelSheet
                    sheet={sheetInCol}
                    columns={COLS_AMARRES_LIBRETA}
                    style={{ marginBottom: 0 }}
                  >
                    <tr>
                      <td style={{ ...sheet.td, fontWeight: 700, color: ui.accent }} title="Estación (amarre inicial)">
                        Est.{detalle.punto_inicial?.verificado ? ' ✓' : ''}
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.amarre.nombre}
                          disabled={busy || Boolean(detalle.punto_inicial?.verificado)}
                          onChange={(e) => setForm({ ...form, amarre: { ...form.amarre, nombre: e.target.value } })}
                          style={sheet.cellInp}
                          title="Nombre estación / amarre inicial"
                          placeholder="BM1"
                        />
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.amarre.norte}
                          disabled={busy}
                          onChange={(e) => setForm({ ...form, amarre: { ...form.amarre, norte: e.target.value } })}
                          style={sheet.cellInp}
                          title="Norte (m)"
                          placeholder="N"
                        />
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.amarre.este}
                          disabled={busy}
                          onChange={(e) => setForm({ ...form, amarre: { ...form.amarre, este: e.target.value } })}
                          style={sheet.cellInp}
                          title="Este (m)"
                          placeholder="E"
                        />
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.amarre.cota}
                          disabled={busy}
                          onChange={(e) => setForm({ ...form, amarre: { ...form.amarre, cota: e.target.value } })}
                          style={sheet.cellInp}
                          title="Cota (m)"
                          placeholder="Z"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ ...sheet.td, fontWeight: 700, color: ui.accent }} title="Visado (referencia atrás)">
                        Vis.{detalle.punto_visado?.verificado ? ' ✓' : ''}
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.visado.nombre}
                          disabled={busy || Boolean(detalle.punto_visado?.verificado)}
                          onChange={(e) => setForm({ ...form, visado: { ...form.visado, nombre: e.target.value } })}
                          style={sheet.cellInp}
                          title="Nombre visado"
                          placeholder="VIS"
                        />
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.visado.norte}
                          disabled={busy}
                          onChange={(e) => setForm({ ...form, visado: { ...form.visado, norte: e.target.value } })}
                          style={sheet.cellInp}
                          title="Norte (m)"
                          placeholder="N"
                        />
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.visado.este}
                          disabled={busy}
                          onChange={(e) => setForm({ ...form, visado: { ...form.visado, este: e.target.value } })}
                          style={sheet.cellInp}
                          title="Este (m)"
                          placeholder="E"
                        />
                      </td>
                      <td style={sheet.td}>
                        <input
                          value={form.visado.cota}
                          disabled={busy}
                          onChange={(e) => setForm({ ...form, visado: { ...form.visado, cota: e.target.value } })}
                          style={sheet.cellInp}
                          title="Cota (m)"
                          placeholder="Z"
                        />
                      </td>
                    </tr>
                    {pol.tipo === 'abierta' && (
                      <tr>
                        <td style={{ ...sheet.td, fontWeight: 700, color: '#15803d' }} title="Punto de llegada (objetivo)">
                          Llg.{detalle.punto_final?.verificado ? ' ✓' : ''}
                        </td>
                        <td style={sheet.td}>
                          <input
                            value={form.llegada.nombre}
                            disabled={busy || Boolean(detalle.punto_final?.verificado)}
                            onChange={(e) => setForm({ ...form, llegada: { ...form.llegada, nombre: e.target.value } })}
                            style={sheet.cellInp}
                            placeholder="FIN"
                          />
                        </td>
                        <td style={sheet.td}>
                          <input
                            value={form.llegada.norte}
                            disabled={busy}
                            onChange={(e) => setForm({ ...form, llegada: { ...form.llegada, norte: e.target.value } })}
                            style={sheet.cellInp}
                            placeholder="N"
                          />
                        </td>
                        <td style={sheet.td}>
                          <input
                            value={form.llegada.este}
                            disabled={busy}
                            onChange={(e) => setForm({ ...form, llegada: { ...form.llegada, este: e.target.value } })}
                            style={sheet.cellInp}
                            placeholder="E"
                          />
                        </td>
                        <td style={sheet.td}>
                          <input
                            value={form.llegada.cota}
                            disabled={busy}
                            onChange={(e) => setForm({ ...form, llegada: { ...form.llegada, cota: e.target.value } })}
                            style={sheet.cellInp}
                            placeholder="Z"
                          />
                        </td>
                      </tr>
                    )}
                  </TopoExcelSheet>

                  {armadas.length > 0 ? (
                    <TopoExcelSheet
                      sheet={sheetInCol}
                      title="Puntos de armada"
                      columns={COLS_ARMADAS_COMPACT}
                      style={{ marginBottom: 0 }}
                    >
                      {armadas.map((arm) => {
                        const esActual = armadaActual && arm.id === armadaActual.id
                        const ec = arm.estacion_coords || {}
                        return (
                          <tr
                            key={arm.id}
                            style={{
                              ...(esActual ? { background: '#fff' } : undefined),
                              cursor: editableLibreta ? 'pointer' : undefined,
                            }}
                            title={
                              editableLibreta
                                ? 'Clic para editar armada'
                                : (ec.norte != null
                                  ? `Est N ${fmt(ec.norte, 2)} E ${fmt(ec.este, 2)} Z ${fmt(ec.cota, 2)}`
                                  : undefined)
                            }
                            onClick={() => {
                              if (!editableLibreta || busy) return
                              setEditArmadaModal(arm)
                            }}
                          >
                            <td style={sheet.td}>
                              <span style={{ fontWeight: 700 }}>
                                {arm.orden}{esActual ? ' ·' : ''}
                              </span>
                            </td>
                            <td style={sheet.td}><strong>{arm.estacion_nombre || '—'}</strong></td>
                            <td style={sheet.td}><strong>{arm.visado_nombre || '—'}</strong></td>
                            <td style={{ ...sheet.td, color: ui.accent, fontWeight: 700, fontSize: 'var(--cc-xs)' }}>
                              {arm.base_azimut_texto ?? '—'}
                            </td>
                            <td style={sheet.td}>{(arm.puntos || []).length}</td>
                          </tr>
                        )
                      })}
                    </TopoExcelSheet>
                  ) : (
                    <div style={sheet.sectionTitle}>Puntos de armada</div>
                  )}
                  {!mostrarCambioArmada ? (
                    <button
                      type="button"
                      style={{ ...ui.btnSecondary, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 'var(--cc-xs)' }}
                      onClick={() => setMostrarCambioArmada(true)}
                      disabled={busy}
                      title="Traslade el equipo a otra estación"
                    >
                      Cambiar armada
                    </button>
                  ) : (
                    <TopoExcelSheet
                      sheet={sheetInCol}
                      title="Nueva armada"
                      columns={COLS_NUEVA_ARMADA_VERT}
                      style={{ marginBottom: 0 }}
                    >
                      <tr>
                        <td style={labelCell}>Estación</td>
                        <td style={sheet.td}>
                          <select
                            value={armadaForm.estacion_nombre}
                            onChange={(e) => setArmadaForm({ ...armadaForm, estacion_nombre: e.target.value })}
                            style={sheet.cellSelect}
                          >
                            <option value="">— Seleccione —</option>
                            {estDisp.map((p) => (<option key={p.nombre} value={p.nombre}>{p.nombre}</option>))}
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td style={labelCell}>Visado</td>
                        <td style={sheet.td}>
                          <select
                            value={armadaForm.visado_nombre}
                            onChange={(e) => setArmadaForm({ ...armadaForm, visado_nombre: e.target.value })}
                            style={sheet.cellSelect}
                          >
                            <option value="">— Seleccione —</option>
                            {visDisp.map((p) => (<option key={p.nombre} value={p.nombre}>{p.nombre}</option>))}
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td style={labelCell}>HI (m)</td>
                        <td style={sheet.td}>
                          <input
                            value={armadaForm.altura_instrumento}
                            onChange={(e) => setArmadaForm({ ...armadaForm, altura_instrumento: e.target.value })}
                            style={sheet.cellInp}
                            placeholder="1.500"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td style={labelCell} />
                        <td style={sheet.td}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button type="button" style={{ ...ui.btnPrimary, height: 28, padding: '0 10px', fontSize: 'var(--cc-xs)' }} onClick={crearArmada} disabled={busy}>Crear armada</button>
                            <button
                              type="button"
                              style={{ ...ui.btnSecondary, height: 28, padding: '0 10px', fontSize: 'var(--cc-xs)' }}
                              onClick={() => {
                                setMostrarCambioArmada(false)
                                setArmadaForm({ estacion_nombre: '', visado_nombre: '', altura_instrumento: '' })
                              }}
                              disabled={busy}
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    </TopoExcelSheet>
                  )}
                </div>

                {/* Bloque derecho — Punto siguiente */}
                <div ref={formRef} style={panelCol}>
                  {armadaActual ? (
                    <>
                      <TopoExcelSheet
                        sheet={sheetInCol}
                        title={`Punto siguiente (armada ${armadaActual?.orden ?? '—'})`}
                        columns={COLS_AGREGAR_PUNTO_2COL}
                        style={{ marginBottom: 0 }}
                      >
                        {agregarPares.map(([l1, c1, l2, c2]) => (
                          <tr key={`${l1}-${l2 || 'x'}`}>
                            <td style={labelCell}>{l1}</td>
                            <td style={sheet.td}>{c1}</td>
                            <td style={labelCell}>{l2}</td>
                            <td style={sheet.td}>{c2}</td>
                          </tr>
                        ))}
                        <tr>
                          <td style={labelCell} colSpan={2} />
                          <td style={sheet.td} colSpan={2}>
                            <button
                              type="button"
                              style={{ ...ui.btnPrimary, height: 28, padding: '0 10px', fontSize: 'var(--cc-xs)', width: '100%' }}
                              onClick={agregarPunto}
                              disabled={busy}
                            >
                              Punto siguiente
                            </button>
                          </td>
                        </tr>
                      </TopoExcelSheet>
                      {armadaActual?.altura_instrumento == null && (
                        <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: '#b45309' }} title="Defina el HI en este bloque o en la cartera">
                          Falta HI en la armada actual — indíquelo en «HI armada» o en la cartera.
                        </p>
                      )}
                    </>
                  ) : (
                    <div style={{ ...sheet.sectionTitle, color: ui.textMuted }}>Punto siguiente</div>
                  )}
                </div>
              </div>
                )
              })()}

              {editableLibreta && (
              <>
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                  <h4 style={{ margin: 0 }}>Cartera consolidada</h4>
                  <button
                    type="button"
                    style={{ ...ui.btnSecondary, padding: '4px 10px', fontSize: 'var(--cc-xs)' }}
                    onClick={() => sincronizarDetalle('Cartera recalculada.')}
                    disabled={busy || refreshing}
                    title="Recalcular desde el servidor"
                  >
                    {refreshing ? '…' : 'Actualizar'}
                  </button>
                  <button
                    type="button"
                    style={{ ...ui.btnSecondary, padding: '4px 10px', fontSize: 'var(--cc-xs)' }}
                    onClick={() => {
                      const next = !mostrarPapelera
                      setMostrarPapelera(next)
                      if (next) cargarPapelera()
                    }}
                    disabled={busy}
                    title="Ver elementos eliminados (recuperables ~30 días)"
                  >
                    {mostrarPapelera ? 'Ocultar papelera' : 'Papelera'}
                  </button>
                </div>
                <PoligonalCalculoTable
                  key={ultimaSync || 'cartera'}
                  estaciones={detalle.estaciones}
                  poligonal={detalle.poligonal}
                  cierre={detalle.cierre}
                  modoAjuste={!!detalle.poligonal?.ajustada_at}
                  editandoId={editandoId}
                  armadas={armadas}
                  canEditHI={editableLibreta}
                  onUpdateHI={editableLibreta ? actualizarHIArmada : null}
                  onEliminar={editableLibreta ? solicitarEliminarPunto : null}
                  onEditar={editableLibreta ? iniciarEdicion : null}
                />
                {mostrarPapelera && (
                  <PoligonalPapeleraPanel
                    theme={theme}
                    data={papeleraData}
                    loading={papeleraLoading}
                    busy={busy}
                    onRefresh={cargarPapelera}
                    onRestaurarArmada={(a) => restaurarDesdePapelera('armada', a)}
                    onRestaurarEstacion={(e) => restaurarDesdePapelera('estacion', e)}
                    onPurgarArmada={(a) => purgarDesdePapelera('armada', a)}
                    onPurgarEstacion={(e) => purgarDesdePapelera('estacion', e)}
                    onClose={() => setMostrarPapelera(false)}
                  />
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <PoligonalGrafico
                  estaciones={detalle.estaciones}
                  puntoInicial={detalle.punto_inicial}
                  puntoFinal={detalle.punto_final}
                  cierre={detalle.cierre}
                />
              </div>

              {detalle.cierre && (
                <div style={{ marginTop: 16 }}>
                  <PoligonalCierrePanel cierre={detalle.cierre} />
                </div>
              )}

              {editableLibreta && (
                <div className="cc-topo-actions-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  {(() => {
                    const c = detalle.cierre
                    const angOk = c?.admisible_angular !== false
                    const puedeTerminar = !!(c?.cerrado && c?.admisible_lineal && angOk && detalle.estaciones?.length)
                    let title = 'Cierra la libreta y habilita validación contratista / interventoría'
                    if (!c?.cerrado || !c?.admisible_lineal) {
                      title = 'El circuito debe cerrar dentro de tolerancia lineal antes de terminar'
                    } else if (c?.admisible_angular === false) {
                      title = 'El cierre angular está fuera de tolerancia; revise azimuts/ángulos antes de terminar'
                    }
                    return (
                  <button
                    type="button"
                    className="cc-topo-touch-btn"
                    style={{ ...ui.btnPrimary, opacity: puedeTerminar ? 1 : 0.5 }}
                    onClick={cerrarCircuito}
                    disabled={busy || !puedeTerminar}
                    title={title}
                  >
                    {busy ? 'Terminando…' : 'Terminar poligonal'}
                  </button>
                    )
                  })()}
                </div>
              )}
              </>
              )}

              {terminada && (
              <>
              <div style={{ marginTop: 4, marginBottom: 12 }}>
                <PoligonalCierrePanel cierre={detalle.cierre} />
              </div>

              <div style={{ marginTop: 4 }}>
                <h4 style={{ margin: '0 0 8px' }} title="Coordenadas calculadas (ajustadas si aplica)">Coordenadas calculadas</h4>
                <PoligonalCalculoTable
                  key={`term-${ultimaSync || 'cartera'}`}
                  estaciones={detalle.estaciones}
                  poligonal={detalle.poligonal}
                  cierre={detalle.cierre}
                  modoAjuste={!!detalle.poligonal?.ajustada_at}
                  editandoId={null}
                  armadas={armadas}
                  canEditHI={false}
                  onUpdateHI={null}
                  onEliminar={null}
                  onEditar={null}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <PoligonalGrafico
                  estaciones={detalle.estaciones}
                  puntoInicial={detalle.punto_inicial}
                  puntoFinal={detalle.punto_final}
                  cierre={detalle.cierre}
                />
              </div>

              {!sellada && puede(permisos, 'editar') && (
                <div className="cc-topo-actions-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  <button
                    type="button"
                    className="cc-topo-touch-btn"
                    style={btnSuccessStyle({ ...ui.btnPrimary, className: 'cc-topo-touch-btn' })}
                    onClick={ajustarPoligonal}
                    disabled={busy}
                    title="Corrección angular + Bowditch antes de validar"
                  >
                    {busy ? 'Ajustando…' : detalle.poligonal?.ajustada_at ? 'Re-ajustar' : 'Corregir y ajustar'}
                  </button>
                </div>
              )}

              <PoligonalValidacionPanel
                poligonal={detalle.poligonal}
                cierre={detalle.cierre}
                permisos={permisos}
                usuario={usuario}
                contratoId={contratoId}
                token={token}
                api={api}
                soloLectura={sellada}
                onActualizado={() => sincronizarDetalle()}
                onError={showError}
              />

              {!sellada && (
                <div style={{ marginTop: 16 }}>
                  <FirmaPerfilTopo
                    api={api}
                    poligonalId={poligonalId}
                    token={token}
                    onFirmado={() => sincronizarDetalle()}
                  />
                </div>
              )}
              </>
              )}
            </div>
            )
          })()}
        </div>
      </div>

      {errorModal && (
        <TopoErrorModal theme={theme} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}

      {editPuntoModal && (
        <PoligonalPuntoEditModal
          theme={theme}
          punto={editPuntoModal}
          armada={(detalle?.armadas || []).find((a) => a.id === editPuntoModal.armada_id)
            || (detalle?.armadas || []).find((a) => a.orden === editPuntoModal.armada_orden)
            || null}
          busy={busy}
          onSave={guardarEdicionPopup}
          onClose={cancelarEdicion}
          onError={setErrorModal}
        />
      )}

      {editArmadaModal && (
        <PoligonalArmadaEditModal
          theme={theme}
          armada={editArmadaModal}
          puntos={(detalle?.estaciones || []).filter((e) => e.armada_id === editArmadaModal.id)}
          estacionesDisponibles={detalle?.puntos_estacion_disponibles || []}
          visadosDisponibles={detalle?.puntos_visado_disponibles || []}
          canDelete={(detalle?.armadas || []).length > 1}
          canEditPuntos={puede(permisos, 'editar')}
          busy={busy}
          onSave={guardarArmadaPopup}
          onDelete={() => solicitarEliminarArmada(editArmadaModal)}
          onSavePunto={guardarPuntoDesdeArmada}
          onAddPunto={agregarPuntoDesdeArmada}
          onDeletePunto={solicitarEliminarPunto}
          onError={setErrorModal}
          onClose={() => setEditArmadaModal(null)}
        />
      )}

      {confirmEliminar && (
        <TopoConfirmModal
          theme={theme}
          danger
          titulo={
            confirmEliminar.tipo?.startsWith('purgar')
              ? 'Eliminar definitivamente'
              : confirmEliminar.tipo === 'armada'
                ? 'Eliminar armada'
                : 'Eliminar punto'
          }
          confirmLabel={confirmEliminar.tipo?.startsWith('purgar') ? 'Purgar' : 'Eliminar'}
          cancelLabel="Cancelar"
          busy={busy}
          onConfirm={() => {
            if (confirmEliminar.tipo?.startsWith('purgar')) ejecutarPurga()
            else ejecutarEliminacion()
          }}
          onCancel={() => { if (!busy) setConfirmEliminar(null) }}
        >
          {confirmEliminar.tipo?.startsWith('purgar') ? (
            <>¿Eliminar definitivamente «{confirmEliminar.nombre}»? Esta acción no se puede deshacer.</>
          ) : confirmEliminar.tipo === 'armada' ? (
            <>¿Eliminar «{confirmEliminar.nombre}» y sus puntos? Podrá deshacerlo ahora o recuperarlos después desde la papelera (hasta 30 días).</>
          ) : (
            <>¿Eliminar el punto «{confirmEliminar.nombre}»? Podrá deshacerlo ahora o recuperarlo después desde la papelera (hasta 30 días).</>
          )}
        </TopoConfirmModal>
      )}

      {undoToast && (
        <PoligonalUndoToast
          message={undoToast.message}
          onUndo={deshacerEliminacion}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </>
  )
}
