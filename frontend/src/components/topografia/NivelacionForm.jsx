import { useCallback, useEffect, useMemo, useState } from 'react'
import FirmaDigital from './FirmaDigital'
import NivelacionGrafico from './NivelacionGrafico'
import PoligonalValidacionPanel from './PoligonalValidacionPanel'
import TopoConfirmModal from './TopoConfirmModal'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import {
  PermisoAviso,
  puede,
  Semaforo,
  TopoHelpIcon,
  coloresBloqueNiv,
  themeColorScheme,
  useTopografiaApi,
  useTopoTheme,
  useTopoViewport,
} from './topografiaShared'
import {
  ABSCISA_NUMERICA_MSG,
  abscisaInvalida,
  inferirTipoNivelFilas,
  filaCierreInfo,
  filasTieneCierre,
  mensajeFilaCierreExistente,
  MSG_VPLUS_SIN_VISTA,
  carteraVplusSinVista,
  calcularVistaNivelacion,
  convertirFilasTipoNivel,
  contarPuntosFilas,
  cotasDesdePuntos,
  filasToLecturas,
  filaTieneVminus,
  filaTieneVplus,
  HILO_INCONGRUENCIA_MSG,
  HILO_INPUT_WIDTH,
  hilosIncongruentes,
  diagnosticoHilosIncongruentes,
  lecturasToFilas,
  metadatosFilaCompletos,
  modoAperturaNivelacion,
  nombreBmDesdeId,
  nuevaFilaCierre,
  nuevaFilaPunto,
  puedeAbrirCircuito,
  puedeAgregarFila,
  puedeIngresarCierre,
  puedeRegistrarVplus,
  puntosBmParaNivelacion,
  resaltadoValidacionUltimaFila,
} from '../../utils/topografia_nivelacion'

const ESTILO_CAMPO_ALERTA = {
  border: '2px solid #dc2626',
  background: 'rgba(220,38,38,0.14)',
  boxShadow: '0 0 0 1px rgba(220,38,38,0.35)',
  color: 'inherit',
}

function estiloCampo(base, alerta) {
  return alerta ? { ...base, ...ESTILO_CAMPO_ALERTA } : base
}

function styleInputHilo(ui, bloques, bk, hk, { alerta = false, opacity = 1 } = {}) {
  const medio = hk === 'hM'
  const bg = alerta
    ? undefined
    : (medio ? (bloques[bk]?.inputMed || `${ui.accent}22`) : (bloques[bk]?.inputTint || ui.compactInput.background))
  return estiloCampo({
    ...ui.compactInput,
    width: HILO_INPUT_WIDTH,
    minWidth: HILO_INPUT_WIDTH,
    padding: '2px 6px',
    textAlign: 'center',
    color: ui.text,
    opacity,
    fontWeight: medio && !alerta ? 600 : 400,
    ...(bg != null ? { background: bg } : {}),
  }, alerta)
}

function styleInputCartera(ui, bloques, bk, extra = {}, alerta = false) {
  return estiloCampo({
    ...ui.compactInput,
    color: ui.text,
    background: bloques[bk]?.inputTint || ui.compactInput.background,
    ...extra,
  }, alerta)
}

const TIPOS_PUNTO = [
  { v: 'estacion', l: 'Estación' },
  { v: 'auxiliar', l: 'Auxiliar' },
  { v: 'cambio', l: 'Cambio' },
]

function fmtN(v, dec = 4) {
  if (v == null || v === '' || Number.isNaN(v)) return '—'
  return Number(v).toFixed(dec)
}

function PanelColapsable({ titulo, resumen, abierto, onToggle, ui, children }) {
  return (
    <div style={{ ...ui.card, marginBottom: 16 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          color: ui.text,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 'var(--cc-base)', fontWeight: 700, margin: 0, color: ui.text }}>{titulo}</div>
          {!abierto && resumen && (
            <div style={{ marginTop: 4, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{resumen}</div>
          )}
        </div>
        <span style={{ fontSize: 'var(--cc-lg)', color: ui.textMuted, lineHeight: 1, flexShrink: 0 }} aria-hidden>
          {abierto ? '▾' : '▸'}
        </span>
      </button>
      {abierto && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  )
}

function AlertaHilos({ title, compact = false }) {
  if (compact) {
    return (
      <div
        role="status"
        style={{
          marginTop: 4,
          padding: '4px 6px',
          borderRadius: 6,
          fontSize: 'var(--cc-xxs)',
          fontWeight: 600,
          lineHeight: 1.35,
          color: '#991b1b',
          background: 'rgba(220,38,38,0.12)',
          border: '1px solid rgba(220,38,38,0.35)',
        }}
      >
        {title}
      </div>
    )
  }
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: '#dc2626',
        color: '#fff',
        fontSize: 9,
        fontWeight: 700,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'help',
        marginLeft: 2,
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    >
      ?
    </span>
  )
}

function HilosCell({ bloque, onChange, disabled, ui, alerta, bloques, bk = 'vplus' }) {
  return (
    <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
      {['hS', 'hM', 'hI'].map((k) => (
        <input
          key={k}
          title={['Sup', 'Med', 'Inf'][['hS', 'hM', 'hI'].indexOf(k)]}
          disabled={disabled}
          value={bloque?.[k] ?? ''}
          onChange={(e) => onChange({ ...bloque, [k]: e.target.value })}
          style={styleInputHilo(ui, bloques, bk, k, { alerta, opacity: disabled && !alerta ? 0.45 : 1 })}
          placeholder={k === 'hS' ? 'S' : k === 'hM' ? 'M' : 'I'}
        />
      ))}
    </div>
  )
}

function LecturaCell({ bloque, onChange, disabled, ui, alerta, bloqueKey = 'vplus', bloques }) {
  return (
    <input
      disabled={disabled}
      value={bloque?.lectura ?? ''}
      onChange={(e) => onChange({ ...bloque, lectura: e.target.value })}
      style={styleInputCartera(ui, bloques, bloqueKey, { width: 56, textAlign: 'center' }, alerta)}
      placeholder="M"
      title="Lectura hilo medio (electrónico)"
    />
  )
}

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
  const [filas, setFilas] = useState([nuevaFilaPunto(1, true)])
  const [guardando, setGuardando] = useState(false)
  const [pulsoValidacion, setPulsoValidacion] = useState(false)
  const [modalCierre, setModalCierre] = useState(false)
  const [puntoCierreId, setPuntoCierreId] = useState('')
  const [panelNivAbierto, setPanelNivAbierto] = useState(true)
  const [okMsg, setOkMsg] = useState('')
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [abriendoCircuito, setAbriendoCircuito] = useState(false)

  const [form, setForm] = useState({ ...FORM_VACIO_NIV })

  const niv = detalle?.nivelacion
  const tipoNivelDeclarado = form.tipo_nivel || niv?.tipo_nivel || 'electronico'
  const tipoNivel = inferirTipoNivelFilas(filas, tipoNivelDeclarado)
  const esAutomatico = tipoNivel === 'automatico'
  const sellada = (niv?.nivel2_estado || '') === 'Aprobado' || Boolean(niv?.biblioteca_at)
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
    setFilas(lecturasToFilas(data.lecturas || [], tn))
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
      if (!rows.length) return [{ ...nuevaFilaPunto(1, true), nombre_punto: bmInicialNombre }]
      const first = rows[0]
      if (first.nombre_punto === bmInicialNombre) return rows
      return [{ ...first, nombre_punto: bmInicialNombre, tipo_punto: first.tipo_punto || 'BM' }, ...rows.slice(1)]
    })
  }, [bmInicialNombre, sellada])

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
    setFilas([nuevaFilaPunto(1, true)])
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

  const resaltarUltima = useMemo(() => {
    if (sellada || puedeNuevaFila.ok) return null
    return resaltadoValidacionUltimaFila(filas, tipoNivel, bmInicialNombre)
  }, [filas, tipoNivel, bmInicialNombre, sellada, puedeNuevaFila.ok])

  const updateFila = (idx, patch) => {
    if (idx === filas.length - 1) setPulsoValidacion(false)
    setFilas((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const updateBloque = (idx, bloqueKey, bloque) => {
    if (
      !modoApertura
      && bloqueKey === 'vplus'
      && idx > 0
      && !puedeRegistrarVplus({ ...filas[idx], vplus: bloque }, idx, tipoNivel).ok
    ) {
      const tieneEntrada = esAutomatico
        ? [bloque?.hS, bloque?.hM, bloque?.hI].some((v) => v !== '' && v != null)
        : bloque?.lectura !== '' && bloque?.lectura != null
      if (tieneEntrada) {
        setError('Registre V− en esta fila antes de V+ (cambio de instrumento).')
        return
      }
    }
    setFilas((rows) => rows.map((r, i) => (i === idx ? { ...r, [bloqueKey]: bloque } : r)))
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
      // Persistir BM / fecha / equipo antes de marcar apertura.
      if (!(await guardarCabecera())) return
      const res = await api(`/nivelaciones/${sel}/abrir`, { method: 'POST' })
      const nivUp = res?.nivelacion
      if (nivUp) {
        setDetalle((prev) => (prev ? { ...prev, nivelacion: { ...prev.nivelacion, ...nivUp } } : prev))
      } else {
        await cargarDetalle(sel)
      }
      setOkMsg(
        'Circuito abierto. Registre V+ en el BM y V− en el siguiente punto; al completar la primera vuelta aplican las validaciones de tramo.',
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setAbriendoCircuito(false)
    }
  }

  const addFila = () => {
    if (tieneFilaCierre) {
      setError(mensajeFilaCierreExistente(filas))
      return
    }
    if (!circuitoAbierto) {
      setError('Abra el circuito antes de agregar filas de la primera vuelta.')
      return
    }
    if (!puedeNuevaFila.ok) {
      setPulsoValidacion(true)
      setError(puedeNuevaFila.msg)
      return
    }
    setPulsoValidacion(false)
    setError('')
    setFilas((rows) => [...rows, nuevaFilaPunto(rows.length + 1, false)])
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
      return [...rows, nuevaFilaCierre(punto, rows.length + 1, ultAbscisa || '0')]
    })
    setModalCierre(false)
    setPulsoValidacion(false)
    setError('')
  }

  const removeFila = (idx) => {
    setFilas((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)))
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

  // Cartera de lecturas: mismos divisores tipo Excel que el resto del módulo Topografía.
  const cellBorder = sheet.border
  const thBase = { ...sheet.th, position: 'sticky', top: 0, zIndex: 2 }
  const tdBase = { ...sheet.td }

  const thGroup = {
    ...thBase,
    textAlign: 'center',
    borderLeft: `1px solid ${cellBorder}`,
  }

  const thPunto = { ...thBase, width: '72px', maxWidth: '90px' }
  const thTipo = { ...thBase, width: '118px', minWidth: '118px' }
  const tdPunto = { ...tdBase, maxWidth: '90px' }
  const tdTipo = { ...tdBase, minWidth: '118px' }

  const tdGroup = {
    ...tdBase,
    textAlign: 'center',
    verticalAlign: 'middle',
    borderLeft: `1px solid ${cellBorder}`,
  }

  const thGroupColor = (bk) => ({
    ...thGroup,
    background: bloques[bk]?.header || sheet.th.background,
    boxShadow: `inset 0 3px 0 ${bloques[bk]?.accent || ui.accent}`,
  })

  const thSubGroupColor = (bk) => ({
    ...thBase,
    fontSize: 'var(--cc-xxs)',
    textAlign: 'center',
    background: bloques[bk]?.header || sheet.th.background,
    borderLeft: `1px solid ${cellBorder}`,
  })

  const tdGroupColor = (bk) => ({
    ...tdGroup,
    background: bloques[bk]?.bg,
  })

  const renderBloque = (fila, idx, bloqueKey, alerta = false) => {
    const vplusBloqueado = !modoApertura && bloqueKey === 'vplus' && idx > 0 && !filaTieneVminus(fila, tipoNivel)
    if (sellada) {
      const b = fila[bloqueKey]
      if (esAutomatico) {
        const has = [b?.hS, b?.hM, b?.hI].some((v) => v !== '' && v != null)
        return has ? `${fmtN(b.hS, 3)} / ${fmtN(b.hM, 3)} / ${fmtN(b.hI, 3)}` : '—'
      }
      return b?.lectura !== '' && b?.lectura != null ? fmtN(b.lectura) : '—'
    }
    if (esAutomatico) {
      return (
        <HilosCell
          bloque={fila[bloqueKey]}
          onChange={(b) => updateBloque(idx, bloqueKey, b)}
          disabled={vplusBloqueado && !alerta}
          ui={ui}
          alerta={alerta}
          bloques={bloques}
          bk={bloqueKey}
        />
      )
    }
    return (
      <LecturaCell
        bloque={fila[bloqueKey]}
        onChange={(b) => updateBloque(idx, bloqueKey, b)}
        disabled={vplusBloqueado && !alerta}
        ui={ui}
        alerta={alerta}
        bloqueKey={bloqueKey}
        bloques={bloques}
      />
    )
  }

  const renderCeldasHilos = (fila, idx, bk, vplusAlerta) => {
    const vplusOff = !modoApertura && bk === 'vplus' && idx > 0 && !filaTieneVminus(fila, tipoNivel)
    const vplusResaltar = bk === 'vplus' && vplusAlerta
    const hilosAlerta = esAutomatico && hilosIncongruentes(fila[bk], tipoNivel)
    const hilosDiag = esAutomatico ? diagnosticoHilosIncongruentes(fila[bk], tipoNivel) : null
    const tdStyle = tdGroupColor(bk)
    if (fila.es_fila_cierre && bk !== 'vminus') {
      if (!esAutomatico) {
        return <td key={bk} style={tdStyle}>—</td>
      }
      return ['hS', 'hM', 'hI'].map((hk) => (
        <td key={`${bk}-${hk}`} style={tdStyle}>—</td>
      ))
    }
    if (!esAutomatico) {
      return (
        <td key={bk} style={tdStyle}>
          {renderBloque(fila, idx, bk, vplusResaltar)}
        </td>
      )
    }
    return ['hS', 'hM', 'hI'].map((hk, hi) => (
      <td key={`${bk}-${hk}`} style={tdStyle}>
        {sellada ? fmtN(fila[bk]?.[hk], 3) : (
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <input
                value={fila[bk]?.[hk] ?? ''}
                disabled={vplusOff && !vplusResaltar}
                onChange={(e) => updateBloque(idx, bk, { ...fila[bk], [hk]: e.target.value })}
                style={styleInputHilo(ui, bloques, bk, hk, {
                  alerta: vplusResaltar || hilosAlerta,
                  opacity: vplusOff && !vplusResaltar ? 0.45 : 1,
                })}
                title={
                  hilosAlerta
                    ? (hilosDiag?.msg || HILO_INCONGRUENCIA_MSG)
                    : vplusOff
                      ? 'Registre V− antes de V+'
                      : hk === 'hM'
                        ? 'Hilo medio (lectura de cálculo)'
                        : ['Superior', 'Medio', 'Inferior'][['hS', 'hM', 'hI'].indexOf(hk)]
                }
              />
              {hk === 'hM' && hilosAlerta && <AlertaHilos title={hilosDiag?.msg || HILO_INCONGRUENCIA_MSG} />}
            </span>
            {hk === 'hM' && hilosAlerta && (
              <span style={{ fontSize: 'var(--cc-xxs)', color: '#991b1b', fontWeight: 600, maxWidth: 120, lineHeight: 1.25, textAlign: 'center' }}>
                {(hilosDiag?.msg || HILO_INCONGRUENCIA_MSG).split(':')[0]}
              </span>
            )}
          </span>
        )}
      </td>
    ))
  }

  const renderDistVplus = (fila, idx, vistaRow) => {
    if (fila.es_fila_cierre) {
      return <td style={tdGroupColor('vplus')}>—</td>
    }
    const dist = vistaRow.distancia_vplus_calc
    const over = dist != null && dist > 50
    const tieneVplus = filaTieneVplus(fila, tipoNivel)
    return (
      <td style={{ ...tdGroupColor('vplus'), color: over ? '#dc2626' : undefined, fontWeight: over ? 600 : 400 }}>
        {esAutomatico ? (
          fmtN(dist, 2)
        ) : sellada ? (
          fmtN(fila.dist_vplus_m, 2)
        ) : (
          <input
            value={fila.dist_vplus_m}
            disabled={!tieneVplus}
            onChange={(e) => updateFila(idx, { dist_vplus_m: e.target.value })}
            style={styleInputCartera(ui, bloques, 'vplus', { width: 56, textAlign: 'center', opacity: tieneVplus ? 1 : 0.45 })}
            title={tieneVplus ? 'Distancia V+ (tope 50 m)' : 'Registre V+ para distancia'}
          />
        )}
      </td>
    )
  }

  const renderDistVminus = (fila, idx, vistaRow) => {
    const dist = vistaRow.distancia_vminus_calc
    const over = dist != null && dist > 50
    const tieneVminus = filaTieneVminus(fila, tipoNivel)
    return (
      <td style={{ ...tdGroupColor('vminus'), color: over ? '#dc2626' : undefined, fontWeight: over ? 600 : 400 }}>
        {esAutomatico ? (
          fmtN(dist, 2)
        ) : sellada ? (
          fmtN(fila.dist_vminus_m, 2)
        ) : (
          <input
            value={fila.dist_vminus_m}
            disabled={!tieneVminus}
            onChange={(e) => updateFila(idx, { dist_vminus_m: e.target.value })}
            style={styleInputCartera(ui, bloques, 'vminus', { width: 56, textAlign: 'center', opacity: tieneVminus ? 1 : 0.45 })}
            title={tieneVminus ? 'Distancia V− (tope 50 m)' : 'Registre V− para distancia'}
          />
        )}
      </td>
    )
  }

  /** Bloque V+/Vi/V− en tarjeta móvil (HS|HM|HI|Dist) — misma lógica que la tabla escritorio. */
  const renderBloqueHilosMovil = (fila, idx, bk, vistaRow, vplusAlerta = false) => {
    const labels = { vplus: 'V+', vi: 'Vi', vminus: 'V−' }
    const accent = bloques[bk]?.accent || ui.accent
    const vplusOff = !modoApertura && bk === 'vplus' && idx > 0 && !filaTieneVminus(fila, tipoNivel)
    const cierreSoloVminus = Boolean(fila.es_fila_cierre) && bk !== 'vminus'
    const hilosAlerta = esAutomatico && hilosIncongruentes(fila[bk], tipoNivel)
    const hilosDiag = esAutomatico ? diagnosticoHilosIncongruentes(fila[bk], tipoNivel) : null
    const distCalc = bk === 'vplus' ? vistaRow.distancia_vplus_calc : bk === 'vminus' ? vistaRow.distancia_vminus_calc : null
    const distOver = distCalc != null && distCalc > 50
    const conDist = bk === 'vplus' || bk === 'vminus'

    const cellInp = (hk) => (
      <label key={hk} style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 0', minWidth: 0 }}>
        <span style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted, textAlign: 'center' }}>
          {hk === 'hS' ? 'HS' : hk === 'hM' ? 'HM' : 'HI'}
        </span>
        {sellada || cierreSoloVminus ? (
          <span style={{ textAlign: 'center', fontSize: 'var(--cc-sm)', fontWeight: hk === 'hM' ? 600 : 400 }}>
            {cierreSoloVminus ? '—' : fmtN(fila[bk]?.[hk], 3)}
          </span>
        ) : (
          <input
            value={fila[bk]?.[hk] ?? ''}
            disabled={vplusOff && !vplusAlerta}
            onChange={(e) => updateBloque(idx, bk, { ...fila[bk], [hk]: e.target.value })}
            style={{
              ...styleInputHilo(ui, bloques, bk, hk, {
                alerta: vplusAlerta || hilosAlerta,
                opacity: vplusOff && !vplusAlerta ? 0.45 : 1,
              }),
              width: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
            title={hilosAlerta ? (hilosDiag?.msg || HILO_INCONGRUENCIA_MSG) : undefined}
          />
        )}
      </label>
    )

    return (
      <div
        key={bk}
        style={{
          marginTop: 8,
          padding: '8px 8px 6px',
          borderRadius: 8,
          background: bloques[bk]?.bg || ui.t?.bgSoft || 'transparent',
          border: `1px solid ${bloques[bk]?.border || ui.t?.border || '#e2e8f0'}`,
          boxShadow: `inset 3px 0 0 ${accent}`,
        }}
      >
        <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 800, color: accent, marginBottom: 6, letterSpacing: 0.3 }}>
          {labels[bk]}
          {esAutomatico ? ' · HS | HM | HI' : ''}
          {conDist ? (esAutomatico ? ' | Dist' : ' · Lect | Dist') : (esAutomatico ? '' : ' · Lect')}
        </div>
        {cierreSoloVminus ? (
          <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>—</div>
        ) : esAutomatico ? (
          <>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              {['hS', 'hM', 'hI'].map(cellInp)}
              {conDist && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 0', minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted, textAlign: 'center' }}>Dist</span>
                  <span style={{ textAlign: 'center', fontSize: 'var(--cc-sm)', fontWeight: distOver ? 700 : 400, color: distOver ? '#dc2626' : ui.text }}>
                    {fmtN(distCalc, 2)}
                  </span>
                </label>
              )}
            </div>
            {hilosAlerta && !sellada && (
              <AlertaHilos compact title={hilosDiag?.msg || HILO_INCONGRUENCIA_MSG} />
            )}
          </>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 0', minWidth: 0 }}>
              <span style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted, textAlign: 'center' }}>Lect</span>
              {sellada ? (
                <span style={{ textAlign: 'center', fontSize: 'var(--cc-sm)' }}>{fmtN(fila[bk]?.lectura)}</span>
              ) : (
                <input
                  value={fila[bk]?.lectura ?? ''}
                  disabled={vplusOff && !vplusAlerta}
                  onChange={(e) => updateBloque(idx, bk, { ...fila[bk], lectura: e.target.value })}
                  style={{
                    ...styleInputCartera(ui, bloques, bk, { width: '100%', textAlign: 'center', boxSizing: 'border-box', opacity: vplusOff && !vplusAlerta ? 0.45 : 1 }, vplusAlerta),
                    minWidth: 0,
                  }}
                  placeholder="M"
                />
              )}
            </label>
            {conDist && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 0', minWidth: 0 }}>
                <span style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted, textAlign: 'center' }}>Dist</span>
                {esAutomatico ? null : sellada ? (
                  <span style={{ textAlign: 'center', fontSize: 'var(--cc-sm)', color: distOver ? '#dc2626' : undefined }}>
                    {fmtN(bk === 'vplus' ? fila.dist_vplus_m : fila.dist_vminus_m, 2)}
                  </span>
                ) : (
                  <input
                    value={bk === 'vplus' ? fila.dist_vplus_m : fila.dist_vminus_m}
                    disabled={bk === 'vplus' ? !filaTieneVplus(fila, tipoNivel) : !filaTieneVminus(fila, tipoNivel)}
                    onChange={(e) => updateFila(idx, bk === 'vplus' ? { dist_vplus_m: e.target.value } : { dist_vminus_m: e.target.value })}
                    style={{
                      ...styleInputCartera(ui, bloques, bk, {
                        width: '100%',
                        textAlign: 'center',
                        boxSizing: 'border-box',
                        opacity: (bk === 'vplus' ? filaTieneVplus(fila, tipoNivel) : filaTieneVminus(fila, tipoNivel)) ? 1 : 0.45,
                      }, distOver),
                      minWidth: 0,
                    }}
                  />
                )}
              </label>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderFilaCarteraMovil = (vistaRow, idx) => {
    const fila = filas[idx] || vistaRow
    const distVp = vistaRow.distancia_vplus_calc
    const distVm = vistaRow.distancia_vminus_calc
    const distOver = (distVp != null && distVp > 50) || (distVm != null && distVm > 50)
    const esUltimaResaltada = resaltarUltima?.idx === idx
    const metaAlerta = esUltimaResaltada ? resaltarUltima.meta : null
    const vplusAlerta = esUltimaResaltada && resaltarUltima.vminusSinVplus
    const filaResaltada = esUltimaResaltada && (resaltarUltima.incompleta || resaltarUltima.vminusSinVplus)
    const abscisaFmtInvalida = abscisaInvalida(fila)
    const abscisaAlerta = metaAlerta?.abscisa || abscisaFmtInvalida
    const esCierre = Boolean(fila.es_fila_cierre)
    const border = ui.t?.border || '#e2e8f0'
    return (
      <div
        key={idx}
        style={{
          marginBottom: 10,
          padding: 10,
          borderRadius: 10,
          border: `1px solid ${esCierre ? bloques.cierre.border : border}`,
          background: esCierre
            ? bloques.cierre.row
            : filaResaltada
              ? bloques.aviso.row
              : distOver
                ? bloques.alerta.row
                : (ui.t?.bgCard || '#fff'),
          boxShadow: esCierre ? `inset 3px 0 0 ${bloques.cierre.border}` : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <div style={{ flexShrink: 0, minWidth: 28 }}>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)' }}>#{idx + 1}</div>
            {esCierre && (
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 2,
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontSize: 'var(--cc-xxs)',
                  fontWeight: 800,
                  color: '#fff',
                  background: '#7c3aed',
                }}
              >
                CIERRE
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sellada || esCierre ? (
              <span style={{ fontWeight: esCierre ? 700 : 600 }}>{fila.nombre_punto || '—'}</span>
            ) : idx === 0 && bmInicialNombre ? (
              <span style={{ fontWeight: 600 }} title="BM de amarre (biblioteca)">{bmInicialNombre}</span>
            ) : (
              <input
                value={fila.nombre_punto}
                onChange={(e) => updateFila(idx, { nombre_punto: e.target.value })}
                style={estiloCampo({ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }, metaAlerta?.nombre)}
                placeholder="Punto"
              />
            )}
            {sellada || esCierre ? (
              <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{idx === 0 ? 'BM' : (fila.tipo_punto || '—')}</span>
            ) : idx === 0 ? (
              <span style={{ fontSize: 'var(--cc-xs)', fontWeight: 600, color: ui.textMuted }}>BM</span>
            ) : (
              <select
                value={fila.tipo_punto || ''}
                onChange={(e) => updateFila(idx, { tipo_punto: e.target.value })}
                style={estiloCampo({ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }, metaAlerta?.tipo)}
              >
                <option value="">Tipo —</option>
                {TIPOS_PUNTO.map(({ v, l }) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
          </div>
          {!sellada && (
            <button type="button" style={{ ...ui.btnSecondary, padding: '4px 10px', flexShrink: 0 }} onClick={() => removeFila(idx)} title="Eliminar fila">×</button>
          )}
        </div>

        {renderBloqueHilosMovil(fila, idx, 'vplus', vistaRow, vplusAlerta)}
        {renderBloqueHilosMovil(fila, idx, 'vi', vistaRow, false)}
        {renderBloqueHilosMovil(fila, idx, 'vminus', vistaRow, false)}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6,
            marginTop: 8,
            paddingTop: 8,
            borderTop: `1px solid ${border}`,
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted }}>H. ins.</div>
            <div style={{ fontWeight: 600, color: ui.accent, fontSize: 'var(--cc-sm)' }}>{fmtN(vistaRow.altura_instrumento)}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted }}>Cota</div>
            <div style={{ fontWeight: 600, fontSize: 'var(--cc-sm)' }}>{fmtN(vistaRow.cota)}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted }}>Abscisa</div>
            {sellada ? (
              <div style={{ fontSize: 'var(--cc-sm)' }}>{fila.abscisa || '—'}</div>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={fila.abscisa}
                onChange={(e) => updateFila(idx, { abscisa: e.target.value })}
                style={estiloCampo({ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }, abscisaAlerta)}
                placeholder="0+000"
              />
            )}
          </div>
        </div>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted, marginBottom: 2 }}>Descripción</div>
          {sellada ? (
            <div style={{ fontSize: 'var(--cc-sm)' }}>{fila.descripcion_punto || '—'}</div>
          ) : (
            <input
              value={fila.descripcion_punto}
              onChange={(e) => updateFila(idx, { descripcion_punto: e.target.value })}
              style={estiloCampo({ ...ui.compactInput, color: ui.text, width: '100%', boxSizing: 'border-box' }, metaAlerta?.descripcion)}
              placeholder="Descripción del punto"
            />
          )}
        </div>
      </div>
    )
  }

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
      <datalist id="topo-operadores-niv">
        {operadores.map((u) => (
          <option key={u.id || u.nombre} value={u.nombre} />
        ))}
      </datalist>

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
                  <input
                    key="op"
                    list="topo-operadores-niv"
                    value={form.operador}
                    disabled={sellada}
                    onChange={(e) => setForm({ ...form, operador: e.target.value })}
                    style={sellada ? sheet.cellRo : sheet.cellInp}
                    placeholder="Buscar operador…"
                    autoComplete="off"
                  />,
                ]}
              />
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0 }}>Cartera de lecturas</h4>
                  {!sellada && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={ui.btnSecondary}
                        onClick={addFila}
                        disabled={tieneFilaCierre || !circuitoAbierto}
                        title={
                          !circuitoAbierto
                            ? 'Abra el circuito para agregar filas'
                            : (tieneFilaCierre ? 'Elimine la fila de cierre para agregar tramos' : (!puedeNuevaFila.ok ? puedeNuevaFila.msg : 'Agregar fila'))
                        }
                      >
                        + Fila
                      </button>
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
                        disabled={tieneFilaCierre}
                        title={tieneFilaCierre ? 'Ya hay una fila de cierre' : (!puedeCierre.ok ? puedeCierre.msg : 'Agregar lectura V− en BM de cierre')}
                      >
                        Ingresar cierre
                      </button>
                    </div>
                  )}
                </div>
                {tipoNivel !== tipoNivelDeclarado && !sellada && (
                  <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                    Las lecturas están en modo {tipoNivel === 'automatico' ? 'automático (S/M/I)' : 'electrónico'}.
                    Al guardar se sincronizará el tipo de nivel con los datos de la cartera.
                  </p>
                )}
                {!sellada && !circuitoAbierto && (
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
                    Pulse «Abrir circuito» (con BM inicial) para iniciar la captura.
                    En la primera vuelta puede registrar V+ en el BM y V− en otro punto sin bloqueo de tramo.
                  </div>
                )}
                {!sellada && circuitoAbierto && modoApertura && (
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
                    Complete V+ en el BM y al menos una Vi/V− en el siguiente punto.
                    Después aplican las validaciones estrictas de cambio/tramo.
                  </div>
                )}
                <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                  {esAutomatico
                    ? 'Automático: hilos S/M/I; cálculo con hilo medio (M). Cambio: V− fija cota → V+ actualiza H.I. Vi/V− intermedios sin cambiar H.I.'
                    : 'Electrónico: lectura única en V+, Vi o V−; Dist (V+) y Dist (V−) manuales junto a cada columna.'}
                </p>
                {infoFilaCierre && !sellada && (
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
                    Registre la V− en esa fila. Para agregar tramos intermedios, elimínela con × al final de la fila.
                  </div>
                )}
                {!puedeNuevaFila.ok && !puedeNuevaFila.esCierre && !sellada && (
                  <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                    {puedeNuevaFila.msg}
                  </p>
                )}
                {vista.avisos.length > 0 && !sellada && (
                  <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                    {vista.avisos.slice(0, 3).join(' ')}
                  </p>
                )}
                {isCompact ? (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {vista.filasVista.map((vistaRow, idx) => renderFilaCarteraMovil(vistaRow, idx))}
                    {!sellada && (
                      <button
                        type="button"
                        style={{ ...ui.btnSecondary, alignSelf: 'stretch', marginTop: 4 }}
                        onClick={addFila}
                        disabled={tieneFilaCierre || !circuitoAbierto}
                        title={
                          !circuitoAbierto
                            ? 'Abra el circuito para agregar filas'
                            : (tieneFilaCierre ? 'Elimine la fila de cierre para agregar tramos' : (!puedeNuevaFila.ok ? puedeNuevaFila.msg : 'Agregar fila'))
                        }
                      >
                        + Fila
                      </button>
                    )}
                  </div>
                ) : (
                <div style={{ ...sheet.sheetWrap, WebkitOverflowScrolling: 'touch', colorScheme: themeColorScheme(ui.t) }} className="cc-topo-table-scroll">
                  <table style={{ ...sheet.sheetTable, tableLayout: 'auto' }}>
                    <thead>
                      <tr>
                        <th style={thBase} rowSpan={2}>#</th>
                        <th style={thPunto} rowSpan={2}>Punto</th>
                        <th style={thTipo} rowSpan={2}>Tipo</th>
                        <th style={thGroupColor('vplus')} colSpan={esAutomatico ? 4 : 2}>V+ {esAutomatico ? '(3 hilos)' : ''}</th>
                        <th style={thGroupColor('vi')} colSpan={esAutomatico ? 3 : 1}>Vi {esAutomatico ? '(3 hilos)' : ''}</th>
                        <th style={thGroupColor('vminus')} colSpan={esAutomatico ? 4 : 2}>V− {esAutomatico ? '(3 hilos)' : ''}</th>
                        <th style={thGroup} rowSpan={2}>H. ins.</th>
                        <th style={thGroup} rowSpan={2}>Cota</th>
                        <th style={thBase} rowSpan={2}>Abscisa</th>
                        <th style={thBase} rowSpan={2}>Descripción de punto</th>
                        {!sellada && <th style={thBase} rowSpan={2} />}
                      </tr>
                      {esAutomatico && (
                        <tr>
                          {['V+', 'Vi', 'V−'].flatMap((label) => {
                            const cols = ['S', 'M', 'I'].map((h) => (
                              <th key={`${label}-${h}`} style={{ ...thBase, fontSize: 'var(--cc-xxs)', textAlign: 'center' }}>{h}</th>
                            ))
                            if (label === 'V+') {
                              cols.push(
                                <th key="V+-dist" style={{ ...thBase, fontSize: 'var(--cc-xxs)', textAlign: 'center' }}>Dist (V+)</th>,
                              )
                            }
                            if (label === 'V−') {
                              cols.push(
                                <th key="V--dist" style={{ ...thBase, fontSize: 'var(--cc-xxs)', textAlign: 'center' }}>Dist (V−)</th>,
                              )
                            }
                            return cols
                          })}
                        </tr>
                      )}
                      {!esAutomatico && (
                        <tr>
                          <th style={thSubGroupColor('vplus')}>Lect.</th>
                          <th style={thSubGroupColor('vplus')}>Dist (V+)</th>
                          <th style={thSubGroupColor('vi')}>Lect.</th>
                          <th style={thSubGroupColor('vminus')}>Lect.</th>
                          <th style={thSubGroupColor('vminus')}>Dist (V−)</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {vista.filasVista.map((vistaRow, idx) => {
                        const fila = filas[idx] || vistaRow
                        const distVp = vistaRow.distancia_vplus_calc
                        const distVm = vistaRow.distancia_vminus_calc
                        const distOver = (distVp != null && distVp > 50) || (distVm != null && distVm > 50)
                        const esUltimaResaltada = resaltarUltima?.idx === idx
                        const metaAlerta = esUltimaResaltada ? resaltarUltima.meta : null
                        const vplusAlerta = esUltimaResaltada && resaltarUltima.vminusSinVplus
                        const filaResaltada = esUltimaResaltada && (resaltarUltima.incompleta || resaltarUltima.vminusSinVplus)
                        const abscisaFmtInvalida = abscisaInvalida(fila)
                        const abscisaAlerta = metaAlerta?.abscisa || abscisaFmtInvalida
                        const esCierre = Boolean(fila.es_fila_cierre)
                        return (
                          <tr
                            key={idx}
                            style={
                              esCierre
                                ? { background: bloques.cierre.row, outline: `2px solid ${bloques.cierre.border}`, boxShadow: `inset 3px 0 0 ${bloques.cierre.border}` }
                                : filaResaltada
                                  ? { background: bloques.aviso.row }
                                  : distOver
                                    ? { background: bloques.alerta.row }
                                    : undefined
                            }
                          >
                            <td style={tdBase}>
                              {idx + 1}
                              {esCierre && (
                                <span
                                  title="Fila de cierre: registre V− para calcular error de cierre"
                                  style={{
                                    display: 'inline-block',
                                    marginTop: 2,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    fontSize: 'var(--cc-xxs)',
                                    fontWeight: 800,
                                    color: '#fff',
                                    background: '#7c3aed',
                                    letterSpacing: '0.3px',
                                  }}
                                >
                                  CIERRE
                                </span>
                              )}
                            </td>
                            <td style={tdPunto}>
                              {sellada || esCierre ? (
                                <span style={{ fontWeight: esCierre ? 700 : 400 }} title={esCierre ? 'Punto de cierre (biblioteca)' : undefined}>
                                  {fila.nombre_punto}
                                </span>
                              ) : idx === 0 && bmInicialNombre ? (
                                <span style={{ fontWeight: 600 }} title="BM de amarre (biblioteca)">{bmInicialNombre}</span>
                              ) : (
                                <input
                                  value={fila.nombre_punto}
                                  onChange={(e) => updateFila(idx, { nombre_punto: e.target.value })}
                                  style={estiloCampo({ ...ui.compactInput, color: ui.text, maxWidth: 84 }, metaAlerta?.nombre)}
                                  placeholder="Nombre"
                                />
                              )}
                            </td>
                            <td style={tdTipo}>
                              {sellada || esCierre ? (
                                idx === 0 ? 'BM' : (fila.tipo_punto || '—')
                              ) : idx === 0 ? (
                                <span style={{ fontWeight: 600 }} title="BM de amarre">BM</span>
                              ) : (
                                <select
                                  value={fila.tipo_punto || ''}
                                  onChange={(e) => updateFila(idx, { tipo_punto: e.target.value })}
                                  style={estiloCampo({ ...ui.compactInput, color: ui.text, minWidth: 108 }, metaAlerta?.tipo)}
                                >
                                  <option value="">—</option>
                                  {TIPOS_PUNTO.map(({ v, l }) => <option key={v} value={v}>{l}</option>)}
                                </select>
                              )}
                            </td>
                            {renderCeldasHilos(fila, idx, 'vplus', vplusAlerta)}
                            {renderDistVplus(fila, idx, vistaRow)}
                            {renderCeldasHilos(fila, idx, 'vi', false)}
                            {renderCeldasHilos(fila, idx, 'vminus', false)}
                            {renderDistVminus(fila, idx, vistaRow)}
                            <td style={{ ...tdGroup, fontWeight: 600, color: ui.accent }}>
                              {fmtN(vistaRow.altura_instrumento)}
                            </td>
                            <td style={{ ...tdGroup, fontWeight: 600 }}>
                              {fmtN(vistaRow.cota)}
                            </td>
                            <td style={tdBase}>
                              {sellada ? (fila.abscisa || '—') : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={fila.abscisa}
                                  onChange={(e) => updateFila(idx, { abscisa: e.target.value })}
                                  style={estiloCampo({ ...ui.compactInput, color: ui.text, minWidth: 72 }, abscisaAlerta)}
                                  placeholder="0"
                                  title={abscisaFmtInvalida ? ABSCISA_NUMERICA_MSG : 'Abscisa en metros (numérico)'}
                                  aria-invalid={abscisaAlerta || undefined}
                                />
                              )}
                            </td>
                            <td style={tdBase}>
                              {sellada ? (fila.descripcion_punto || '—') : (
                                <input
                                  value={fila.descripcion_punto}
                                  onChange={(e) => updateFila(idx, { descripcion_punto: e.target.value })}
                                  style={estiloCampo({ ...ui.compactInput, color: ui.text, minWidth: 120 }, metaAlerta?.descripcion)}
                                  placeholder="Descripción del punto"
                                  aria-invalid={metaAlerta?.descripcion || undefined}
                                />
                              )}
                            </td>
                            {!sellada && (
                              <td style={tdBase}>
                                <button type="button" style={ui.btnSecondary} onClick={() => removeFila(idx)} title="Eliminar fila">×</button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                )}
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
