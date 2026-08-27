import { useCallback, useEffect, useMemo, useState } from 'react'
import FirmaDigital from './FirmaDigital'
import NivelacionGrafico from './NivelacionGrafico'
import PoligonalValidacionPanel from './PoligonalValidacionPanel'
import TopoConfirmModal from './TopoConfirmModal'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import BitacoraMaterialUbicacionModal from '../../modules/seguimiento/BitacoraMaterialUbicacionModal'
import NivelacionCarteraTable from './NivelacionCarteraTable'
import NivelacionIngresoPanel from './NivelacionIngresoPanel'
import NivelacionLecturaEditModal from './NivelacionLecturaEditModal'
import PoligonalUndoToast from './PoligonalUndoToast'
import { fmtN } from './nivelacionUiShared'
import {
  PanelColapsable,
  PermisoAviso,
  puede,
  Semaforo,
  TopoHelpIcon,
  coloresBloqueNiv,
  esDesarrolladorTopo,
  useTopografiaApi,
  useTopoTheme,
  useTopoViewport,
} from './topografiaShared'
import {
  inferirTipoNivelFilas,
  filaCierreInfo,
  filasTieneCierre,
  carteraVplusSinVista,
  calcularVistaNivelacion,
  convertirFilasTipoNivel,
  contarPuntosFilas,
  cotasDesdePuntos,
  filasToLecturas,
  filaTieneVminus,
  lecturasToFilas,
  modoAperturaNivelacion,
  MSG_VPLUS_SIN_VISTA,
  nombreBmDesdeId,
  nuevaFilaCierre,
  nuevaFilaPunto,
  puedeAbrirCircuito,
  puedeAgregarFila,
  puedeIngresarCierre,
  puntosBmParaNivelacion,
  prepararBorradorBmInicial,
  prepararBorradorSiguiente,
  validarBorradorParaAgregar,
} from '../../utils/topografia_nivelacion'

const FORM_VACIO_NIV = {
  nombre: '',
  tipo_contranivelacion: 'circuito',
  tipo_nivel: 'electronico',
  bm_inicial_id: '',
  bm_final_id: '',
  tolerancia_mm_km: 1,
  operador: '',
  equipo_marca: '',
  equipo_referencia: '',
  equipo_serial: '',
  fecha_campo: '',
}

const AYUDA_MODULO_NIVELACION =
  'Registre un circuito o nivelación directa entre puntos con cota en biblioteca (BM inicial y de cierre). '
  + 'Con nivel automático use tres hilos y distancia taquimétrica; con electrónico, V+ y V−. '
  + 'Calcule el cierre y, si es admisible, valide con contratista e interventoría para publicar cotas.'

export default function NivelacionForm({ contratoId, token, permisos, usuario }) {
  const ui = useTopoTheme()
  const { isCompact } = useTopoViewport()
  const bloques = useMemo(() => coloresBloqueNiv(ui.t), [ui.t])
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)
  const [lista, setLista] = useState([])
  const [sel, setSel] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [puntos, setPuntos] = useState([])
  const [operadores, setOperadores] = useState([])
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [filas, setFilas] = useState([])
  const [borrador, setBorrador] = useState(() => nuevaFilaPunto(1, true))
  const [pkMapTarget, setPkMapTarget] = useState(null) // 'borrador' | number idx
  const [editIdx, setEditIdx] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [pulsoValidacion, setPulsoValidacion] = useState(false)
  const [modalCierre, setModalCierre] = useState(false)
  const [puntoCierreId, setPuntoCierreId] = useState('')
  const [panelNivAbierto, setPanelNivAbierto] = useState(true)
  const [okMsg, setOkMsg] = useState('')
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [confirmEliminarFila, setConfirmEliminarFila] = useState(null)
  const [undoToast, setUndoToast] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [abriendoCircuito, setAbriendoCircuito] = useState(false)

  const [form, setForm] = useState({ ...FORM_VACIO_NIV })

  const niv = detalle?.nivelacion
  const tipoNivelDeclarado = form.tipo_nivel || niv?.tipo_nivel || 'electronico'
  const tipoNivel = inferirTipoNivelFilas(filas, tipoNivelDeclarado)
  const esAutomatico = tipoNivel === 'automatico'
  const sellada = (niv?.nivel2_estado || '') === 'Aprobado' || Boolean(niv?.biblioteca_at)
  const esDev = esDesarrolladorTopo(usuario)
  const circuitoTerminadoEarly = niv?.estado === 'cerrado'
  const editableCartera = puede(permisos, 'editar') && !sellada && (!circuitoTerminadoEarly || esDev)
  const modoApertura = useMemo(
    () => modoAperturaNivelacion(filas, tipoNivel, niv),
    [filas, tipoNivel, niv],
  )
  const circuitoAbierto = Boolean(niv?.circuito_abierto_at)
  const puedeAbrir = useMemo(
    () => puedeAbrirCircuito(niv, form),
    [niv, form],
  )

  const bmInicialNombre = useMemo(
    () => nombreBmDesdeId(puntos, niv?.bm_inicial_id || form.bm_inicial_id),
    [puntos, niv?.bm_inicial_id, form.bm_inicial_id],
  )

  const bmFinalNombre = useMemo(
    () => nombreBmDesdeId(puntos, niv?.bm_final_id || form.bm_final_id),
    [puntos, niv?.bm_final_id, form.bm_final_id],
  )

  const cotasBib = useMemo(() => cotasDesdePuntos(puntos), [puntos])

  /** BM iniciales/finales: misma biblioteca verificada que el submódulo Biblioteca de puntos. */
  const puntosBm = useMemo(() => puntosBmParaNivelacion(puntos), [puntos])

  const vista = useMemo(
    () => calcularVistaNivelacion(filas, tipoNivel, cotasBib, { distMax: 50 }),
    [filas, tipoNivel, cotasBib],
  )

  const cargarLista = useCallback(async () => {
    const data = await api('/nivelaciones')
    setLista(data || [])
  }, [api])

  const cargarPuntosBib = useCallback(async () => {
    try {
      // Misma fuente que Biblioteca (`/puntos`); el filtro de BM se aplica en cliente.
      const data = await api('/puntos')
      setPuntos(Array.isArray(data) ? data : [])
    } catch {
      setPuntos([])
    }
  }, [api])

  const cargarDetalle = useCallback(async (id) => {
    setCreando(false)
    const data = await api(`/nivelaciones/${id}`)
    setDetalle(data)
    setSel(id)
    const tn = data.nivelacion?.tipo_nivel || 'electronico'
    const nextFilas = lecturasToFilas(data.lecturas || [], tn)
    setFilas(nextFilas)
    setBorrador(nextFilas.length ? prepararBorradorSiguiente(nextFilas.length) : nuevaFilaPunto(1, true))
    setEditIdx(null)
    setUndoToast(null)
    setResultado(null)
    if (data.nivelacion) {
      const n = data.nivelacion
      setForm((f) => ({
        ...f,
        nombre: n.nombre || f.nombre,
        tipo_contranivelacion: n.tipo_contranivelacion || 'circuito',
        tipo_nivel: n.tipo_nivel || 'electronico',
        bm_inicial_id: n.bm_inicial_id != null && n.bm_inicial_id !== '' ? String(n.bm_inicial_id) : '',
        bm_final_id: n.bm_final_id != null && n.bm_final_id !== '' ? String(n.bm_final_id) : '',
        tolerancia_mm_km: n.tolerancia_mm_km ?? 1,
        operador: n.operador || '',
        equipo_marca: n.equipo_marca || '',
        equipo_referencia: n.equipo_referencia || '',
        equipo_serial: n.equipo_serial || '',
        fecha_campo: n.fecha_campo || '',
      }))
    }
  }, [api])

  useEffect(() => {
    if (!bmInicialNombre || sellada) return
    setFilas((rows) => {
      if (!rows.length) return rows
      const first = rows[0]
      if (first.nombre_punto === bmInicialNombre) return rows
      return [{ ...first, nombre_punto: bmInicialNombre, tipo_punto: first.tipo_punto || 'BM' }, ...rows.slice(1)]
    })
    setBorrador((b) => {
      // Prefill panel solo si aún no hay cartera (primera lectura = BM).
      if (filas.length > 0) return b
      if ((b.nombre_punto || '').trim() === bmInicialNombre) return b
      return { ...prepararBorradorBmInicial(bmInicialNombre), abscisa: b.abscisa, ubicacion_pk_id: b.ubicacion_pk_id, ubicacion_pk: b.ubicacion_pk, ubicacion_tramo: b.ubicacion_tramo, ubicacion_costado: b.ubicacion_costado, ubicacion_infraestructura: b.ubicacion_infraestructura, ubicacion_lat: b.ubicacion_lat, ubicacion_lng: b.ubicacion_lng, vplus: b.vplus, vi: b.vi, vminus: b.vminus, dist_vplus_m: b.dist_vplus_m, dist_vminus_m: b.dist_vminus_m }
    })
  }, [bmInicialNombre, sellada, filas.length])

  useEffect(() => {
    cargarLista().catch((e) => setError(e.message))
    cargarPuntosBib()
    api('/operadores').then(setOperadores).catch(() => {})
  }, [api, cargarLista, cargarPuntosBib])

  useEffect(() => {
    if (!lista.length || sel || creando) return
    cargarDetalle(lista[0].id).catch((e) => setError(e.message))
  }, [lista, sel, creando, cargarDetalle])

  const abrirNuevo = () => {
    setCreando(true)
    setSel(null)
    setDetalle(null)
    setForm({ ...FORM_VACIO_NIV })
    setFilas([])
    setBorrador(nuevaFilaPunto(1, true))
    setEditIdx(null)
    setUndoToast(null)
    setResultado(null)
    setError('')
    setOkMsg('')
    cargarPuntosBib()
  }

  const seleccionarTab = (id) => {
    if (sel === id && detalle) return
    setError('')
    setOkMsg('')
    cargarDetalle(id)
  }

  const requisitosN1Ok = useMemo(() => {
    if (!niv) return true
    return Boolean(
      (niv.operador || form.operador)?.trim()
      && (niv.equipo_marca || form.equipo_marca)?.trim()
      && (niv.equipo_referencia || form.equipo_referencia)?.trim()
      && (niv.equipo_serial || form.equipo_serial)?.trim(),
    )
  }, [niv, form])

  const avisoRequisitosN1 = 'Complete operador, marca, modelo y serial del nivel antes de validar (contratista).'

  const cambiarTipoNivel = (nuevo) => {
    const anterior = form.tipo_nivel
    if (anterior === nuevo) return
    setForm({ ...form, tipo_nivel: nuevo })
    if (filas.length) {
      setFilas((rows) => convertirFilasTipoNivel(rows, anterior, nuevo))
    }
  }

  const crear = async () => {
    try {
      const row = await api('/nivelaciones', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          bm_inicial_id: form.bm_inicial_id || null,
          bm_final_id: form.bm_final_id || null,
          fecha_campo: form.fecha_campo || null,
        }),
      })
      await cargarLista()
      setCreando(false)
      if (row?.id) cargarDetalle(row.id)
    } catch (e) {
      setError(e.message)
    }
  }

  const prepararFilasGuardado = useCallback(
    () => filas.map((r, i) => {
      let row = i === 0 && bmInicialNombre
        ? { ...r, nombre_punto: bmInicialNombre, tipo_punto: r.tipo_punto || 'BM' }
        : r
      if (row.es_fila_cierre && !String(row.abscisa ?? '').trim()) {
        row = { ...row, abscisa: '0' }
      }
      return row
    }),
    [filas, bmInicialNombre],
  )

  const aplicarResultadoCalc = useCallback((calc) => {
    if (!calc) return
    setResultado(calc)
    setDetalle((prev) => {
      if (!prev?.nivelacion) return prev
      return {
        ...prev,
        nivelacion: {
          ...prev.nivelacion,
          error_cierre: calc.error_cierre,
          tolerancia_calculada: calc.tolerancia_calculada,
          distancia_vplus_km: calc.distancia_vplus_km,
          distancia_vminus_km: calc.distancia_vminus_km,
          distancia_total_km: calc.distancia_total_km,
          estado: prev.nivelacion.estado === 'cerrado' ? 'cerrado' : 'calculado',
        },
      }
    })
  }, [])

  const guardarCabecera = async (tipoNivelOverride = null) => {
    if (!sel) {
      setError('Seleccione una nivelación en las pestañas.')
      return false
    }
    const tn = tipoNivelOverride || tipoNivel
    try {
      await api(`/nivelaciones/${sel}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: form.nombre || niv?.nombre || 'Nivelación',
          tipo_contranivelacion: form.tipo_contranivelacion,
          tipo_nivel: tn,
          bm_inicial_id: form.bm_inicial_id || null,
          bm_final_id: form.bm_final_id || null,
          tolerancia_mm_km: form.tolerancia_mm_km,
          operador: form.operador || null,
          equipo_marca: form.equipo_marca || null,
          equipo_referencia: form.equipo_referencia || null,
          equipo_serial: form.equipo_serial || null,
          fecha_campo: form.fecha_campo || null,
        }),
      })
      if (tn !== form.tipo_nivel) {
        setForm((f) => ({ ...f, tipo_nivel: tn }))
      }
      return true
    } catch (e) {
      setError(e.message)
      return false
    }
  }

  const guardarLecturas = async (tipoExport = tipoNivel) => {
    if (!sel) {
      const msg = 'Seleccione una nivelación en las pestañas.'
      setError(msg)
      return { ok: false, error: msg }
    }
    const preparadas = prepararFilasGuardado()
    const payload = filasToLecturas(preparadas, tipoExport)
    if (!payload.length) {
      const msg = 'No hay datos para guardar. Registre al menos una lectura (V+, Vi o V−).'
      setError(msg)
      return { ok: false, error: msg }
    }
    try {
      const res = await api(`/nivelaciones/${sel}/lecturas`, {
        method: 'PUT',
        body: JSON.stringify({ lecturas: payload, tipo_nivel: tipoExport }),
      })
      const n = res?.count ?? res?.lecturas?.length ?? 0
      const puntos = res?.puntos ?? contarPuntosFilas(preparadas)
      if (n === 0) {
        const msg = 'El servidor no confirmó el guardado. Reinicie backend (dev-stop → dev-start).'
        setError(msg)
        return { ok: false, error: msg }
      }
      return { ok: true, count: n, puntos }
    } catch (e) {
      setError(e.message)
      return { ok: false, error: e.message }
    }
  }

  const guardarCartera = async () => {
    if (!sel) {
      setError('Seleccione una nivelación en las pestañas.')
      return
    }
    setGuardando(true)
    setError('')
    setOkMsg('')
    try {
      const preparadas = prepararFilasGuardado()
      const tipoExport = inferirTipoNivelFilas(preparadas, tipoNivelDeclarado)
      if (!(await guardarCabecera(tipoExport))) return
      const lectRes = await guardarLecturas(tipoExport)
      if (!lectRes.ok) return
      await cargarDetalle(sel)
      setOkMsg(`Cartera guardada correctamente (${lectRes.puntos} ${lectRes.puntos === 1 ? 'punto' : 'puntos'}).`)
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const finalizarCircuito = async () => {
    if (!sel) {
      setError('Seleccione una nivelación en las pestañas.')
      return
    }
    setGuardando(true)
    setError('')
    setOkMsg('')
    try {
      const preparadas = prepararFilasGuardado()
      const tipoExport = inferirTipoNivelFilas(preparadas, tipoNivelDeclarado)
      if (!(await guardarCabecera(tipoExport))) return
      const lectRes = await guardarLecturas(tipoExport)
      if (!lectRes.ok) return

      const res = await api(`/nivelaciones/${sel}/finalizar`, { method: 'POST' })
      if (res?.resultado) aplicarResultadoCalc(res.resultado)

      if (!res?.ok) {
        setError(res?.mensaje || 'No se pudo terminar la nivelación.')
        return
      }

      if (res.nivelacion) {
        setDetalle((prev) => (prev ? { ...prev, nivelacion: res.nivelacion } : prev))
      }
      await cargarDetalle(sel)
      setOkMsg(res.mensaje || 'Nivelación terminada.')
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminarNivelacion = async () => {
    const id = confirmEliminar?.id
    if (!id) return
    setEliminando(true)
    setError('')
    try {
      await api(`/nivelaciones/${id}`, { method: 'DELETE' })
      const eraActiva = sel === id
      setConfirmEliminar(null)
      const data = await api('/nivelaciones')
      setLista(data || [])
      if (eraActiva) {
        if (data?.length) {
          await cargarDetalle(data[0].id)
        } else {
          setSel(null)
          setDetalle(null)
          setFilas([nuevaFilaPunto(1, true)])
          setResultado(null)
        }
      }
      setOkMsg('Nivelación eliminada.')
    } catch (e) {
      setError(e.message)
    } finally {
      setEliminando(false)
    }
  }

  const puedeNuevaFila = useMemo(
    () => puedeAgregarFila(filas, tipoNivel, bmInicialNombre, { modoApertura }),
    [filas, tipoNivel, bmInicialNombre, modoApertura],
  )

  const puedeCierre = useMemo(
    () => puedeIngresarCierre(filas, tipoNivel, bmInicialNombre),
    [filas, tipoNivel, bmInicialNombre],
  )

  const tieneFilaCierre = useMemo(() => filasTieneCierre(filas), [filas])
  const infoFilaCierre = useMemo(() => filaCierreInfo(filas), [filas])

  const agregarLectura = () => {
    if (!editableCartera) {
      setError(circuitoTerminadoEarly && !esDev
        ? 'Circuito cerrado: solo un Desarrollador puede editar la cartera.'
        : 'No tiene permiso para editar.')
      return
    }
    const gate = validarBorradorParaAgregar(borrador, filas, tipoNivel, bmInicialNombre, {
      modoApertura,
      circuitoAbierto,
    })
    if (!gate.ok) {
      setPulsoValidacion(true)
      setError(gate.msg)
      return
    }
    if (gate.avisosHilos?.length) {
      setOkMsg(`Lectura agregada con aviso: ${gate.avisosHilos[0]}`)
    } else {
      setOkMsg('Lectura agregada a la cartera.')
    }
    setPulsoValidacion(false)
    setError('')
    setFilas((rows) => {
      const next = [...rows, { ...gate.fila, orden: rows.length + 1 }]
      setBorrador(prepararBorradorSiguiente(next.length))
      return next
    })
  }

  const abrirEdicion = (idx) => {
    if (!editableCartera) return
    setEditIdx(idx)
  }

  const guardarEdicionPopup = (patch) => {
    if (editIdx == null) return
    const avisos = patch.avisosHilos || []
    const { avisosHilos: _a, ...rest } = patch
    setFilas((rows) => rows.map((r, i) => (i === editIdx ? { ...r, ...rest } : r)))
    setEditIdx(null)
    setError('')
    setOkMsg(avisos.length
      ? `Lectura actualizada con aviso: ${avisos[0]}`
      : 'Lectura actualizada. H. Instrumento, cota y cierre se recalculan automáticamente.')
  }

  const solicitarEliminarFila = (idx) => {
    if (!editableCartera) return
    const fila = filas[idx]
    setConfirmEliminarFila({
      idx,
      nombre: fila?.nombre_punto || `#${idx + 1}`,
    })
  }

  const confirmarEliminarFila = () => {
    if (confirmEliminarFila == null) return
    const { idx } = confirmEliminarFila
    const snapshot = filas[idx]
    setFilas((rows) => {
      const next = rows.filter((_, i) => i !== idx)
      setBorrador(next.length
        ? prepararBorradorSiguiente(next.length)
        : (bmInicialNombre ? prepararBorradorBmInicial(bmInicialNombre) : nuevaFilaPunto(1, true)))
      return next
    })
    setConfirmEliminarFila(null)
    setEditIdx(null)
    setUndoToast({
      message: `Lectura «${snapshot?.nombre_punto || `#${idx + 1}`}» eliminada`,
      snapshot,
      idx,
    })
  }

  const deshacerEliminarFila = () => {
    if (!undoToast) return
    const { snapshot, idx } = undoToast
    setFilas((rows) => {
      const next = [...rows]
      const at = Math.min(Math.max(0, idx), next.length)
      next.splice(at, 0, snapshot)
      setBorrador(prepararBorradorSiguiente(next.length))
      return next
    })
    setUndoToast(null)
    setOkMsg('Lectura restaurada.')
  }

  const abrirCircuito = async () => {
    if (!sel) {
      setError('Seleccione o cree una nivelación primero.')
      return
    }
    if (!puedeAbrir.ok) {
      setError(puedeAbrir.msg)
      return
    }
    setAbriendoCircuito(true)
    setError('')
    setOkMsg('')
    try {
      if (!(await guardarCabecera())) return
      const res = await api(`/nivelaciones/${sel}/abrir`, { method: 'POST' })
      const nivUp = res?.nivelacion
      if (nivUp) {
        setDetalle((prev) => (prev ? { ...prev, nivelacion: { ...prev.nivelacion, ...nivUp } } : prev))
      } else {
        await cargarDetalle(sel)
      }
      setOkMsg(
        'Circuito abierto. Use el panel de ingreso para registrar V+ en el BM y V− en el siguiente punto.',
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setAbriendoCircuito(false)
    }
  }

  const abrirModalCierre = () => {
    if (!puedeCierre.ok) {
      setPulsoValidacion(true)
      setError(puedeCierre.msg)
      return
    }
    setPuntoCierreId(form.bm_final_id || niv?.bm_final_id || '')
    setModalCierre(true)
  }

  const confirmarIngresarCierre = () => {
    const punto = puntosBm.find((p) => String(p.id) === String(puntoCierreId))
      || puntos.find((p) => String(p.id) === String(puntoCierreId))
    if (!punto) {
      setError('Seleccione un punto de biblioteca para el cierre.')
      return
    }
    setForm((f) => ({ ...f, bm_final_id: String(punto.id) }))
    setFilas((rows) => {
      const ultAbscisa = rows.length ? String(rows[rows.length - 1]?.abscisa ?? '').trim() : ''
      const next = [...rows, nuevaFilaCierre(punto, rows.length + 1, ultAbscisa || '0')]
      setBorrador(prepararBorradorSiguiente(next.length))
      setEditIdx(next.length - 1) // abrir popup para registrar V− de cierre
      return next
    })
    setModalCierre(false)
    setPulsoValidacion(false)
    setError('')
    setOkMsg('Fila de cierre agregada. Registre la V− en el popup.')
  }

  const carteraIncompleta = carteraVplusSinVista(filas, tipoNivel)
  const hayCierreReal = filas.some((f) => f.es_fila_cierre && filaTieneVminus(f, tipoNivel))

  const admisibleNumerico = resultado?.admisible ?? (
    niv?.error_cierre != null
    && niv?.tolerancia_calculada != null
    && Math.abs(Number(niv.error_cierre)) <= Number(niv.tolerancia_calculada)
  )

  const admisible = hayCierreReal && !carteraIncompleta && admisibleNumerico

  const calculado = ['calculado', 'cerrado'].includes(niv?.estado || '')
  const circuitoTerminado = niv?.estado === 'cerrado'
  const cierreCalculoDb = niv?.error_cierre != null && niv?.tolerancia_calculada != null
  const tieneCierre = (hayCierreReal || circuitoTerminado) && cierreCalculoDb
  const cierreOk = circuitoTerminado || (calculado && tieneCierre && admisible)
  const mostrarValidacion = circuitoTerminado
  const distVpKm = (niv?.distancia_vplus_km ?? vista.distancia_vplus_m / 1000)
  const distVmKm = (niv?.distancia_vminus_km ?? vista.distancia_vminus_m / 1000)
  const maxKm = Number(niv?.distancia_max_circuito_km ?? 1)
  const cierreVistaPreview = useMemo(() => {
    if (!hayCierreReal || !bmFinalNombre) return null
    const idx = filas.findIndex((f) => f.es_fila_cierre)
    if (idx < 0) return null
    const cotaCalc = vista.filasVista[idx]?.cota
    const cotaBib = cotasBib[bmFinalNombre]
    if (cotaCalc == null || cotaBib == null) return null
    const errM = Number(cotaCalc) - Number(cotaBib)
    const distKm = (vista.distancia_vplus_m + vista.distancia_vminus_m) / 1000
    const tolMmKm = Number(niv?.tolerancia_mm_km ?? form.tolerancia_mm_km ?? 1)
    const tolM = distKm > 0 ? (tolMmKm * Math.sqrt(distKm)) / 1000 : null
    return {
      errorMm: errM * 1000,
      toleranciaMm: tolM != null ? tolM * 1000 : null,
      admisible: tolM != null && Math.abs(errM) <= tolM,
    }
  }, [hayCierreReal, bmFinalNombre, filas, vista, cotasBib, niv, form.tolerancia_mm_km])

  const hayDatosCierre = hayCierreReal
    || resultado?.error_cierre != null
    || niv?.error_cierre != null

  const errorCierreMm = useMemo(() => {
    const db = resultado?.error_cierre ?? niv?.error_cierre
    if (db != null) return Number(db) * 1000
    if (hayCierreReal) return cierreVistaPreview?.errorMm ?? null
    return null
  }, [hayCierreReal, resultado, niv, cierreVistaPreview])

  const toleranciaMm = useMemo(() => {
    const db = resultado?.tolerancia_calculada ?? niv?.tolerancia_calculada
    if (db != null) return Number(db) * 1000
    if (hayCierreReal) return cierreVistaPreview?.toleranciaMm ?? null
    return null
  }, [hayCierreReal, resultado, niv, cierreVistaPreview])

  const cierreFilaOk = !filasTieneCierre(filas)
    || filas.some((f) => f.es_fila_cierre && filaTieneVminus(f, tipoNivel))
  const cierreGuardado = hayDatosCierre && errorCierreMm != null && toleranciaMm != null
  const admisibleMostrar = resultado?.admisible ?? (
    errorCierreMm != null && toleranciaMm != null && Math.abs(errorCierreMm) <= toleranciaMm
  )

  const polAdaptado = niv
    ? {
        ...niv,
        id: sel,
        estado: niv.estado,
        ajustada_at: ['calculado', 'cerrado'].includes(niv.estado || '') ? (niv.updated_at || true) : null,
      }
    : null

  const cierreAdaptado = {
    cerrado: circuitoTerminado,
    admisible_lineal: circuitoTerminado || Boolean(admisibleMostrar),
  }

  const resumenPanelNiv = [
    form.tipo_contranivelacion === 'directa' ? 'Directa' : 'Circuito',
    esAutomatico ? 'Automático' : 'Electrónico',
    bmInicialNombre ? `BM ini. ${bmInicialNombre}` : null,
  ].filter(Boolean).join(' · ')


  return (
    <div>
      {(error || okMsg) && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${error ? '#fecaca' : '#bbf7d0'}`,
            background: error ? 'rgba(220,38,38,0.12)' : 'rgba(22,163,74,0.12)',
          }}
        >
          {error && <div style={{ color: '#dc2626', fontSize: 'var(--cc-sm)', fontWeight: 600 }}>{error}</div>}
          {okMsg && <div style={{ color: '#16a34a', fontSize: 'var(--cc-sm)', fontWeight: 600 }}>{okMsg}</div>}
        </div>
      )}

      <div style={ui.tabBar} role="tablist" aria-label="Circuitos de nivelación">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <PermisoAviso permisos={permisos} accion="crear">
            <button
              type="button"
              style={{ ...ui.tabBtn(creando), borderStyle: 'dashed', color: ui.accent }}
              onClick={abrirNuevo}
              title="Nuevo circuito de nivelación"
            >
              + Nuevo
            </button>
          </PermisoAviso>
          <TopoHelpIcon ayuda={AYUDA_MODULO_NIVELACION} />
        </div>
        {lista.map((n) => {
          const active = sel === n.id && !creando
          const src = sel === n.id && detalle?.nivelacion ? { ...n, ...detalle.nivelacion } : n
          const label = (src.nombre || n.nombre || '').trim() || 'Sin nombre'
          const tabSellada = (src.nivel2_estado || '') === 'Aprobado' || Boolean(src.biblioteca_at)
          return (
            <div key={n.id} style={{ display: 'inline-flex', alignItems: 'stretch', flexShrink: 0 }}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                style={ui.tabBtn(active)}
                onClick={() => seleccionarTab(n.id)}
                title={`${label} (${src.estado || n.estado})`}
              >
                <span>{label}</span>
                <small style={{ color: ui.textMuted, fontWeight: 400 }}>
                  ({src.estado || n.estado}
                  {(src.nivel1_estado || n.nivel1_estado) && (src.nivel1_estado || n.nivel1_estado) !== 'No Revisado'
                    ? ` · C:${src.nivel1_estado || n.nivel1_estado}` : ''}
                  {(src.nivel2_estado || n.nivel2_estado) && (src.nivel2_estado || n.nivel2_estado) !== 'No Revisado'
                    ? ` · I:${src.nivel2_estado || n.nivel2_estado}` : ''}
                  )
                </small>
              </button>
              {puede(permisos, 'eliminar') && !tabSellada && (
                <button
                  type="button"
                  title="Cerrar / eliminar nivelación"
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmEliminar({ id: n.id, nombre: label })
                  }}
                  style={{
                    ...ui.btnSecondary,
                    color: '#dc2626',
                    padding: '0 8px',
                    marginLeft: -4,
                    borderRadius: '0 8px 0 0',
                    alignSelf: 'stretch',
                    fontSize: 'var(--cc-lg)',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>

      {!lista.length && !creando && (
        <p style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', margin: '0 0 12px' }}>
          Aún no hay nivelaciones. Pulse «+ Nuevo» para comenzar.
        </p>
      )}

      {creando && (
        <PermisoAviso permisos={permisos} accion="crear">
          <div style={{ ...ui.card, marginBottom: 16 }}>
            <TopoExcelSheet
              sheet={sheet}
              title="Nueva nivelación"
              minWidth={isCompact ? undefined : 640}
              compact={isCompact}
              columns={[
                { key: 'nombre', label: 'Nombre', ayuda: 'Identificador del circuito.', width: '20%', compactFull: true },
                { key: 'circuito', label: 'Circuito', ayuda: 'Directa (A→B→A) o circuito cerrado.', width: '18%' },
                { key: 'nivel', label: 'Nivel', ayuda: 'Automático: 3 hilos y distancia taquimétrica. Electrónico: V+ y distancia manual.', width: '18%' },
                { key: 'bm_ini', label: 'BM ini.', ayuda: 'Punto de partida con cota en biblioteca.', width: '22%' },
                { key: 'bm_fin', label: 'BM fin.', ayuda: 'BM de cierre para error de cierre.', width: '22%' },
              ]}
              cells={[
                <input key="n" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={sheet.cellInp} />,
                <select key="c" value={form.tipo_contranivelacion} onChange={(e) => setForm({ ...form, tipo_contranivelacion: e.target.value })} style={sheet.cellSelect}>
                  <option value="circuito">Circuito</option>
                  <option value="directa">Directa</option>
                </select>,
                <select key="nv" value={form.tipo_nivel} onChange={(e) => setForm({ ...form, tipo_nivel: e.target.value })} style={sheet.cellSelect}>
                  <option value="electronico">Electrónico</option>
                  <option value="automatico">Automático</option>
                </select>,
                <select
                  key="bi"
                  value={form.bm_inicial_id}
                  onChange={(e) => setForm({ ...form, bm_inicial_id: e.target.value })}
                  style={sheet.cellSelect}
                >
                  <option value="">{puntosBm.length ? '— Seleccione BM —' : '— Sin puntos en biblioteca —'}</option>
                  {puntosBm.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>{p.nombre} ({p.cota ?? '—'} m)</option>
                  ))}
                </select>,
                <select
                  key="bf"
                  value={form.bm_final_id}
                  onChange={(e) => setForm({ ...form, bm_final_id: e.target.value })}
                  style={sheet.cellSelect}
                >
                  <option value="">—</option>
                  {puntosBm.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>{p.nombre} ({p.cota ?? '—'} m)</option>
                  ))}
                </select>,
              ]}
            />
            {puntosBm.length === 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                No hay puntos verificados en la Biblioteca de puntos de este contrato. Cree o publique un BM allí y vuelva a abrir «Nueva nivelación».
              </p>
            )}
            <button type="button" style={{ ...ui.btnPrimary, marginTop: 4 }} onClick={crear}>Crear</button>
          </div>
        </PermisoAviso>
      )}

      {detalle && niv && !creando && (
        <div>
            <PanelColapsable
              titulo="Información de la nivelación"
              resumen={`${form.nombre || niv.nombre}${resumenPanelNiv ? ` · ${resumenPanelNiv}` : ''}`}
              abierto={panelNivAbierto}
              onToggle={() => setPanelNivAbierto((v) => !v)}
              ui={ui}
            >
              <TopoExcelSheet
                sheet={sheet}
                title="Datos generales"
                minWidth={isCompact ? undefined : 720}
                compact={isCompact}
                columns={[
                  { key: 'nombre', label: 'Nombre', ayuda: 'Identificador del circuito.', width: '16%', compactFull: true },
                  { key: 'circuito', label: 'Circuito', ayuda: 'Directa o circuito cerrado.', width: '14%' },
                  { key: 'nivel', label: 'Nivel', ayuda: 'Automático (3 hilos) o electrónico.', width: '14%' },
                  { key: 'bm_ini', label: 'BM inicio', ayuda: 'Punto de arranque (biblioteca).', width: '18%' },
                  { key: 'bm_fin', label: 'BM fin', ayuda: 'BM de cierre para error de cierre.', width: '18%' },
                  { key: 'operador', label: 'Operador', ayuda: 'Nombre del operador (autocompletado).', width: '20%', compactFull: true },
                ]}
                cells={[
                  <input
                    key="n"
                    value={form.nombre}
                    disabled={sellada}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    style={sellada ? sheet.cellRo : sheet.cellInp}
                  />,
                  <select
                    key="c"
                    value={form.tipo_contranivelacion}
                    disabled={sellada}
                    onChange={(e) => setForm({ ...form, tipo_contranivelacion: e.target.value })}
                    style={sheet.cellSelect}
                  >
                    <option value="circuito">Circuito</option>
                    <option value="directa">Directa</option>
                  </select>,
                  <select
                    key="nv"
                    value={form.tipo_nivel}
                    disabled={sellada}
                    onChange={(e) => cambiarTipoNivel(e.target.value)}
                    style={sheet.cellSelect}
                  >
                    <option value="electronico">Electrónico</option>
                    <option value="automatico">Automático</option>
                  </select>,
                  <select
                    key="bi"
                    value={form.bm_inicial_id}
                    disabled={sellada}
                    onChange={(e) => setForm({ ...form, bm_inicial_id: e.target.value })}
                    style={sheet.cellSelect}
                  >
                    <option value="">{puntosBm.length ? '—' : '— Sin puntos —'}</option>
                    {puntosBm.map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>{p.nombre} ({p.cota ?? '—'} m)</option>
                    ))}
                  </select>,
                  <select
                    key="bf"
                    value={form.bm_final_id}
                    disabled={sellada}
                    onChange={(e) => setForm({ ...form, bm_final_id: e.target.value })}
                    style={sheet.cellSelect}
                  >
                    <option value="">—</option>
                    {puntosBm.map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>{p.nombre} ({p.cota ?? '—'} m)</option>
                    ))}
                  </select>,
                  <select
                    key="op"
                    value={form.operador}
                    disabled={sellada}
                    onChange={(e) => setForm({ ...form, operador: e.target.value })}
                    style={sellada ? sheet.cellRo : sheet.cellSelect}
                    title="Solo usuarios con cargo de topografía (Topógrafo, Cadenero, Coordinador, etc.)"
                  >
                    <option value="">{operadores.length ? '— Seleccione —' : '— Sin operadores topo —'}</option>
                    {operadores.map((u) => (
                      <option key={u.id} value={u.nombre}>{u.nombre}{u.cargo ? ` (${u.cargo})` : ''}</option>
                    ))}
                    {form.operador && !operadores.some((u) => u.nombre === form.operador) && (
                      <option value={form.operador}>{form.operador}</option>
                    )}
                  </select>,
                ]}
              />
              {/* operador estricto por cargo (select arriba) */}
              <TopoExcelSheet
                sheet={sheet}
                title="Equipo de medición"
                minWidth={isCompact ? undefined : 400}
                compact={isCompact}
                columns={[
                  { key: 'marca', label: 'Marca', ayuda: 'Marca del nivel.' },
                  { key: 'modelo', label: 'Modelo', ayuda: 'Modelo / referencia.' },
                  { key: 'serial', label: 'Serial', ayuda: 'Serial del equipo.' },
                  { key: 'fecha', label: 'Fecha', ayuda: 'Fecha de campo.' },
                ]}
                cells={[
                  <input key="m" value={form.equipo_marca} disabled={sellada} onChange={(e) => setForm({ ...form, equipo_marca: e.target.value })} style={sellada ? sheet.cellRo : sheet.cellInp} />,
                  <input key="mo" value={form.equipo_referencia} disabled={sellada} onChange={(e) => setForm({ ...form, equipo_referencia: e.target.value })} style={sellada ? sheet.cellRo : sheet.cellInp} />,
                  <input key="s" value={form.equipo_serial} disabled={sellada} onChange={(e) => setForm({ ...form, equipo_serial: e.target.value })} style={sellada ? sheet.cellRo : sheet.cellInp} />,
                  <input key="f" type="date" value={form.fecha_campo} disabled={sellada} onChange={(e) => setForm({ ...form, fecha_campo: e.target.value })} style={sellada ? sheet.cellRo : sheet.cellInp} />,
                ]}
              />
            </PanelColapsable>

            <div style={{ ...ui.card, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 'var(--cc-sm)' }}>Cierre de nivelación</h4>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isCompact
                    ? '1fr'
                    : (mostrarValidacion ? 'minmax(240px, 1fr) minmax(320px, 1.25fr)' : '1fr'),
                  gap: 16,
                  alignItems: 'start',
                }}
              >
                <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: 'var(--cc-sm)' }}>
                <tbody>
                  <tr>
                    <td style={{ ...ui.td, fontWeight: 600, width: '45%' }}>Error de cierre</td>
                    <td style={ui.td}>
                      {errorCierreMm != null
                        ? `${errorCierreMm.toFixed(2)} mm${!cierreGuardado ? ' (vista previa)' : ''}`
                        : '—'}
                      <span style={{ color: ui.textMuted, fontSize: 'var(--cc-xs)' }}> (cota V− cierre vs biblioteca)</span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...ui.td, fontWeight: 600 }}>Distancia V+</td>
                    <td style={{ ...ui.td, color: distVpKm > maxKm ? '#dc2626' : undefined }}>
                      {fmtN(distVpKm, 3)} km {distVpKm > maxKm ? `(máx. ${maxKm} km)` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...ui.td, fontWeight: 600 }}>Distancia V−</td>
                    <td style={{ ...ui.td, color: distVmKm > maxKm ? '#dc2626' : undefined }}>
                      {fmtN(distVmKm, 3)} km {distVmKm > maxKm ? `(máx. ${maxKm} km)` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...ui.td, fontWeight: 600 }}>Tolerancia</td>
                    <td style={ui.td}>
                      {toleranciaMm != null
                        ? `${toleranciaMm.toFixed(2)} mm${!cierreGuardado ? ' (vista previa)' : ''}`
                        : '—'}
                      <span style={{ color: ui.textMuted, fontSize: 'var(--cc-xs)' }}> ({niv.tolerancia_mm_km ?? 1} mm/km × √km)</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              {hayDatosCierre && errorCierreMm != null && toleranciaMm != null && (
                <Semaforo ok={circuitoTerminado ? admisibleMostrar : Boolean(admisibleMostrar)} />
              )}
              {hayDatosCierre && errorCierreMm != null && toleranciaMm != null && !circuitoTerminado && (
                <p style={{ margin: '4px 0', fontSize: 'var(--cc-sm)', fontWeight: 600, color: admisibleMostrar ? '#16a34a' : '#dc2626' }}>
                  {admisibleMostrar ? 'Cierre ADMISIBLE' : 'Cierre INADMISIBLE'}
                  {' — '}
                  error {errorCierreMm.toFixed(2)} mm / tolerancia {toleranciaMm.toFixed(2)} mm
                  {!cierreGuardado ? ' (vista previa)' : ''}
                </p>
              )}
              {!tieneFilaCierre && !sellada && !circuitoTerminado && (form.bm_final_id || niv?.bm_final_id) && (
                <p style={{ margin: '4px 0', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                  Use «Ingresar cierre» para agregar la V− en el BM final y calcular el error de cierre.
                </p>
              )}
              {tieneFilaCierre && !hayCierreReal && !sellada && !circuitoTerminado && (
                <p style={{ margin: '4px 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                  Complete la V− en la fila de cierre. Puede usar «Guardar cartera» antes de calcular.
                </p>
              )}
              {carteraIncompleta && !sellada && !circuitoTerminado && (
                <p style={{ margin: '4px 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>{MSG_VPLUS_SIN_VISTA}</p>
              )}
              {circuitoTerminado && (
                <p style={{ margin: '4px 0', fontSize: 'var(--cc-xs)', color: '#16a34a' }}>
                  Circuito terminado. Valide con contratista e interventoría.
                </p>
              )}
              {!requisitosN1Ok && !sellada && mostrarValidacion && (
                <p style={{ margin: '4px 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>{avisoRequisitosN1}</p>
              )}
                </div>

              {mostrarValidacion && (
                <div style={{ minWidth: 0 }}>
                  <PoligonalValidacionPanel
                    poligonal={polAdaptado}
                    cierre={cierreAdaptado}
                    permisos={permisos}
                    usuario={usuario}
                    contratoId={contratoId}
                    token={token}
                    api={api}
                    onActualizado={async () => {
                      await cargarDetalle(sel)
                      await cargarLista()
                    }}
                    onError={(e) => setError(e.message)}
                    validarPathPrefix={`/nivelaciones/${sel}`}
                    requisitosN1Ok={requisitosN1Ok}
                    avisoRequisitosN1={avisoRequisitosN1}
                    avisoPreValidacion={null}
                  />
                </div>
              )}
              </div>

              <div className="cc-topo-actions-bar" style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {puede(permisos, 'editar') && !sellada && (
                  <>
                    <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} onClick={guardarCartera} disabled={guardando || !sel}>
                      {guardando ? 'Guardando…' : 'Guardar cartera'}
                    </button>
                    <button
                      type="button"
                      className="cc-topo-touch-btn"
                      style={ui.btnPrimary}
                      onClick={finalizarCircuito}
                      disabled={guardando || !sel || circuitoTerminado}
                      title="Guarda la cartera, calcula el cierre y termina si es admisible"
                    >
                      {guardando ? 'Procesando…' : circuitoTerminado ? 'Nivelación terminada' : 'Calcular y terminar nivelación'}
                    </button>
                  </>
                )}
                {puede(permisos, 'exportar') && (
                  <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} onClick={() => downloadPdf(`/nivelaciones/${sel}/pdf`, 'circuito_nivelacion.pdf')}>Informe PDF</button>
                )}
              </div>
            </div>

            <PermisoAviso permisos={permisos} accion="editar">
              <div style={{ ...ui.card, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <h4 style={{ margin: 0 }}>Captura de lecturas</h4>
                  {editableCartera && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={circuitoAbierto ? ui.btnSecondary : ui.btnPrimary}
                        onClick={abrirCircuito}
                        disabled={circuitoAbierto || abriendoCircuito || !sel}
                        title={
                          circuitoAbierto
                            ? 'Circuito ya abierto'
                            : (!puedeAbrir.ok ? puedeAbrir.msg : 'Declarar el inicio formal del circuito (BM inicial)')
                        }
                      >
                        {abriendoCircuito ? 'Abriendo…' : circuitoAbierto ? 'Circuito abierto' : 'Abrir circuito'}
                      </button>
                      <button
                        type="button"
                        style={ui.btnSecondary}
                        onClick={abrirModalCierre}
                        disabled={tieneFilaCierre || !circuitoAbierto}
                        title={tieneFilaCierre ? 'Ya hay una fila de cierre' : (!puedeCierre.ok ? puedeCierre.msg : 'Agregar lectura V− en BM de cierre')}
                      >
                        Ingresar cierre
                      </button>
                    </div>
                  )}
                </div>

                {tipoNivel !== tipoNivelDeclarado && editableCartera && (
                  <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                    Las lecturas están en modo {tipoNivel === 'automatico' ? 'automático (S/M/I)' : 'electrónico'}.
                    Al guardar se sincronizará el tipo de nivel con los datos de la cartera.
                  </p>
                )}
                {editableCartera && !circuitoAbierto && (
                  <div
                    style={{
                      margin: '0 0 8px',
                      padding: '8px 10px',
                      borderRadius: 8,
                      fontSize: 'var(--cc-xs)',
                      background: 'rgba(37,99,235,0.08)',
                      border: `1px solid ${ui.accent}55`,
                      color: ui.text,
                      lineHeight: 1.4,
                    }}
                  >
                    <strong>Apertura pendiente.</strong>
                    {' '}
                    Pulse «Abrir circuito» (con BM inicial) para habilitar el panel de ingreso y la cartera.
                  </div>
                )}
                {editableCartera && circuitoAbierto && modoApertura && (
                  <div
                    style={{
                      margin: '0 0 8px',
                      padding: '8px 10px',
                      borderRadius: 8,
                      fontSize: 'var(--cc-xs)',
                      background: 'rgba(22,163,74,0.08)',
                      border: '1px solid rgba(22,163,74,0.35)',
                      color: ui.text,
                      lineHeight: 1.4,
                    }}
                  >
                    <strong>Circuito abierto — primera vuelta.</strong>
                    {' '}
                    Capture V+ en el BM y al menos una Vi/V− en el siguiente punto con «Agregar lectura».
                  </div>
                )}
                <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                  {esAutomatico
                    ? 'Automático: hilos S/M/I; cálculo con hilo medio (M). Cambio: V− fija cota → V+ actualiza H.I.'
                    : 'Electrónico: lectura única en V+, Vi o V−; Dist (V+) y Dist (V−) manuales.'}
                </p>
                {infoFilaCierre && editableCartera && (
                  <div
                    style={{
                      margin: '0 0 8px',
                      padding: '8px 10px',
                      borderRadius: 8,
                      fontSize: 'var(--cc-xs)',
                      background: bloques.cierre.row,
                      border: `1px solid ${bloques.cierre.border}`,
                      color: ui.text,
                    }}
                  >
                    <strong>Cierre del circuito — fila {infoFilaCierre.numero}</strong>
                    {' · '}
                    {infoFilaCierre.nombre} ({infoFilaCierre.descripcion}).
                    Pulse la fila para editar la V−. Para agregar tramos, elimine el cierre (papelera / deshacer).
                  </div>
                )}
                {!puedeNuevaFila.ok && !puedeNuevaFila.esCierre && editableCartera && (
                  <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                    {puedeNuevaFila.msg}
                  </p>
                )}
                {vista.avisos.length > 0 && editableCartera && (
                  <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                    {vista.avisos.slice(0, 3).join(' ')}
                  </p>
                )}

                {editableCartera && circuitoAbierto && !tieneFilaCierre && (
                  <NivelacionIngresoPanel
                    borrador={borrador}
                    onChange={setBorrador}
                    onAgregar={agregarLectura}
                    onElegirPk={() => setPkMapTarget('borrador')}
                    esAutomatico={esAutomatico}
                    disabled={!editableCartera || !circuitoAbierto}
                    ui={ui}
                    bloques={bloques}
                    sheet={sheet}
                    isCompact={isCompact}
                    bmInicialNombre={bmInicialNombre}
                    esPrimeraFila={filas.length === 0}
                    puedeAgregar={puedeNuevaFila.ok && circuitoAbierto && !tieneFilaCierre}
                    tituloHint={filas.length === 0
                      ? 'Primera lectura: V+ sobre el BM inicial.'
                      : 'Complete V+/Vi/V− según el punto y pulse Agregar lectura.'}
                  />
                )}

                <h4 style={{ margin: '12px 0 8px', fontSize: 'var(--cc-sm)' }}>Cartera consolidada</h4>
                <NivelacionCarteraTable
                  filas={filas}
                  filasVista={vista.filasVista}
                  tipoNivel={tipoNivel}
                  ui={ui}
                  bloques={bloques}
                  isCompact={isCompact}
                  bmInicialNombre={bmInicialNombre}
                  editandoIdx={editIdx}
                  editable={editableCartera}
                  onEditar={editableCartera ? (idx) => abrirEdicion(idx) : null}
                  onEliminar={editableCartera ? solicitarEliminarFila : null}
                />
              </div>
            </PermisoAviso>

            {vista.filasVista.length >= 2 && (
              <NivelacionGrafico filasVista={vista.filasVista} />
            )}

            <PermisoAviso permisos={permisos} accion="editar">
              <div style={{ marginTop: 16 }}>
                <FirmaDigital onConfirm={(f) => api(`/nivelaciones/${sel}/firma`, { method: 'POST', body: JSON.stringify({ nombre_firmante: 'Topografo', firma_base64: f }) })} />
              </div>
            </PermisoAviso>
          </div>
        )}

      {pkMapTarget != null && (
        <BitacoraMaterialUbicacionModal
          t={ui.t}
          token={token}
          contratoId={contratoId}
          pkId={
            pkMapTarget === 'borrador'
              ? (borrador.ubicacion_pk_id || '')
              : (filas[pkMapTarget]?.ubicacion_pk_id || '')
          }
          pkLabel={
            pkMapTarget === 'borrador'
              ? (borrador.ubicacion_pk || borrador.abscisa || '')
              : (filas[pkMapTarget]?.ubicacion_pk || filas[pkMapTarget]?.abscisa || '')
          }
          tramo={
            pkMapTarget === 'borrador'
              ? (borrador.ubicacion_tramo || '')
              : (filas[pkMapTarget]?.ubicacion_tramo || '')
          }
          costado={
            pkMapTarget === 'borrador'
              ? (borrador.ubicacion_costado || '')
              : (filas[pkMapTarget]?.ubicacion_costado || '')
          }
          infraestructura={
            pkMapTarget === 'borrador'
              ? (borrador.ubicacion_infraestructura || '')
              : (filas[pkMapTarget]?.ubicacion_infraestructura || '')
          }
          readOnly={!editableCartera}
          onClose={() => setPkMapTarget(null)}
          onConfirm={(loc) => {
            const pkLabel = loc?.ubicacion_pk || ''
            const patch = {
              ubicacion_pk_id: loc?.ubicacion_pk_id || null,
              ubicacion_pk: pkLabel,
              ubicacion_tramo: loc?.ubicacion_tramo || '',
              ubicacion_costado: loc?.ubicacion_costado || '',
              ubicacion_infraestructura: loc?.ubicacion_infraestructura || '',
              ubicacion_lat: loc?.ubicacion_lat ?? null,
              ubicacion_lng: loc?.ubicacion_lng ?? null,
              abscisa: pkLabel || '',
            }
            if (pkMapTarget === 'borrador') {
              setBorrador((b) => ({ ...b, ...patch }))
            } else if (typeof pkMapTarget === 'number') {
              setFilas((rows) => rows.map((r, i) => (i === pkMapTarget ? { ...r, ...patch } : r)))
            }
            setPkMapTarget(null)
          }}
        />
      )}

      {editIdx != null && filas[editIdx] && (
        <NivelacionLecturaEditModal
          theme={ui.t}
          ui={ui}
          bloques={bloques}
          fila={filas[editIdx]}
          idx={editIdx}
          esAutomatico={esAutomatico}
          bmInicialNombre={bmInicialNombre}
          vistaRow={vista.filasVista[editIdx]}
          onClose={() => setEditIdx(null)}
          onError={(e) => setError(e?.mensaje || e?.message || 'Error al editar')}
          onElegirPk={() => setPkMapTarget(editIdx)}
          onSave={guardarEdicionPopup}
        />
      )}

      {undoToast && (
        <PoligonalUndoToast
          message={undoToast.message}
          onUndo={deshacerEliminarFila}
          onDismiss={() => setUndoToast(null)}
        />
      )}

      {confirmEliminarFila && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Eliminar lectura"
          confirmLabel="Eliminar"
          onCancel={() => setConfirmEliminarFila(null)}
          onConfirm={confirmarEliminarFila}
        >
          <p style={{ margin: 0 }}>
            ¿Eliminar la lectura <strong>«{confirmEliminarFila.nombre}»</strong> de la cartera?
            Podrá deshacer durante unos segundos. Guarde la cartera para persistir el cambio.
          </p>
        </TopoConfirmModal>
      )}


      {modalCierre && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Ingresar cierre"
          confirmLabel="Agregar fila de cierre"
          onCancel={() => setModalCierre(false)}
          onConfirm={confirmarIngresarCierre}
        >
          <p style={{ margin: '0 0 12px' }}>
            Seleccione el punto de biblioteca donde registrará la lectura V− de cierre.
            Al guardar y calcular, se comparará la cota obtenida con la cota en biblioteca.
          </p>
          <select
            value={puntoCierreId}
            onChange={(e) => setPuntoCierreId(e.target.value)}
            style={{ ...ui.compactInput, width: '100%', maxWidth: 320, textAlign: 'left' }}
          >
            <option value="">— Seleccione punto —</option>
            {puntosBm.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {p.nombre} ({p.cota ?? '—'} m)
              </option>
            ))}
          </select>
        </TopoConfirmModal>
      )}

      {confirmEliminar && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Eliminar nivelación"
          confirmLabel={eliminando ? 'Eliminando…' : 'Eliminar'}
          onCancel={() => { if (!eliminando) setConfirmEliminar(null) }}
          onConfirm={eliminarNivelacion}
        >
          <p style={{ margin: 0 }}>
            ¿Eliminar la nivelación <strong>«{confirmEliminar.nombre}»</strong>?
            Se borrarán sus lecturas. Esta acción no se puede deshacer.
          </p>
        </TopoConfirmModal>
      )}
    </div>
  )
}
