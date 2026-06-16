import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { matrizConBloquesEntrega } from '../../utils/entrega_dg_bloques'
import EntregaVerificacionMatriz from './EntregaVerificacionMatriz'
import TopoConfirmModal from './TopoConfirmModal'
import TopoErrorModal from './TopoErrorModal'
import {
  PermisoAviso,
  puede,
  TopoHelpIcon,
  parseApiError,
  useTopografiaApi,
  useTopoTheme,
} from './topografiaShared'

const AYUDA =
  'Seguimiento de entrega en obra por eje y capa. Indique el rango de abscisas a verificar; '
  + 'el sistema reconoce el tramo/sector y muestra la matriz Izq · Eje · Der con diseño, terreno (Vi) y diferencias.'

function fmtN(v, dec = 3) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(dec) : '—'
}

function fmtFecha(d) {
  if (!d) return '—'
  return String(d).slice(0, 10)
}

function parseNum(v) {
  if (v === '' || v == null) return null
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function enriquecerDetalleEntrega(data) {
  if (!data) return data
  const bloques = data.bloques || []
  return {
    ...data,
    matriz: matrizConBloquesEntrega(data.matriz || [], bloques),
  }
}

function capaNombreIndice(capas, indiceCapa) {
  const idx = parseInt(indiceCapa, 10) || 0
  if (idx >= capas.length) return 'Terreno natural'
  return capas[idx]?.nombre || 'Capa'
}

function sugerirNombreEntrega(capaNombre) {
  const capa = (capaNombre || 'Capa').trim()
  return `Verificación ${capa}`
}

export default function EntregaDgObraForm({ contratoId, token, permisos, registerUnsavedGuard }) {
  const ui = useTopoTheme()
  const { api } = useTopografiaApi(contratoId, token)

  const [lista, setLista] = useState([])
  const [ejes, setEjes] = useState([])
  const [operadores, setOperadores] = useState([])
  const [puntosNiv, setPuntosNiv] = useState([])
  const [sel, setSel] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [creando, setCreando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [errorModal, setErrorModal] = useState(null)
  const [ejeDetalleCapas, setEjeDetalleCapas] = useState([])
  const [previewRango, setPreviewRango] = useState(null)
  const [scrollAbscisa, setScrollAbscisa] = useState(null)
  const [addingBloqueAt, setAddingBloqueAt] = useState(null)
  const [dragTabIdx, setDragTabIdx] = useState(null)
  const detalleCache = useRef({})
  const listaRef = useRef(lista)
  const matrizRef = useRef(null)
  const nombreManualRef = useRef(false)
  const toleranciaManualRef = useRef(false)
  const [carteraDirty, setCarteraDirty] = useState(false)
  const [salirPendiente, setSalirPendiente] = useState(null)
  const [guardSalidaBusy, setGuardSalidaBusy] = useState(false)

  const [formNuevo, setFormNuevo] = useState({
    nombre: '',
    eje_id: '',
    indice_capa: '0',
    abscisa_desde: '',
    abscisa_hasta: '',
    operador: '',
    fecha_campo: '',
    tolerancia_m: '0.005',
  })

  const showError = useCallback((err) => {
    setErrorModal(parseApiError(err?.message || String(err)))
  }, [])

  const cargarLista = useCallback(async () => {
    try {
      const data = await api(`/entrega-dg?_=${Date.now()}`)
      setLista(Array.isArray(data) ? data : [])
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  const cargarEjes = useCallback(async () => {
    try {
      const data = await api(`/diseno-geometrico/ejes?_=${Date.now()}`)
      const rows = (Array.isArray(data) ? data : []).filter(
        (e) => (e.filas_rasante || 0) > 0 && (e.num_capas || 0) > 0,
      )
      setEjes(rows)
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  const carteraSinGuardar = useCallback(
    () => matrizRef.current?.isDirty?.() ?? carteraDirty,
    [carteraDirty],
  )

  useEffect(() => {
    if (!registerUnsavedGuard) return undefined
    registerUnsavedGuard({
      isDirty: () => matrizRef.current?.isDirty?.() ?? carteraDirty,
      saveCartera: () => matrizRef.current?.saveCartera?.() ?? Promise.resolve(false),
    })
    return () => registerUnsavedGuard(null)
  }, [registerUnsavedGuard, carteraDirty])

  const ejecutarSalidaPendiente = async (guardar) => {
    if (!salirPendiente) return
    setGuardSalidaBusy(true)
    try {
      if (guardar) {
        const ok = await matrizRef.current?.saveCartera?.()
        if (ok === false) return
      }
      if (salirPendiente.type === 'tab') {
        await cargarDetalle(salirPendiente.id)
      } else if (salirPendiente.type === 'nuevo') {
        abrirNuevo()
      }
      setSalirPendiente(null)
    } catch (e) {
      showError(e)
    } finally {
      setGuardSalidaBusy(false)
    }
  }

  const requestCargarDetalle = (id) => {
    if (!creando && sel !== id && carteraSinGuardar()) {
      setSalirPendiente({ type: 'tab', id })
      return
    }
    cargarDetalle(id)
  }

  const requestAbrirNuevo = () => {
    if (detalle && !creando && carteraSinGuardar()) {
      setSalirPendiente({ type: 'nuevo' })
      return
    }
    abrirNuevo()
  }

  const cargarDetalle = useCallback(async (id, { scrollToPendiente = false, force = false } = {}) => {
    setCreando(false)
    setSel(id)
    if (!force && detalleCache.current[id]) {
      setDetalle(detalleCache.current[id])
      if (scrollToPendiente && detalleCache.current[id]?.primera_pendiente?.abscisa != null) {
        setScrollAbscisa(detalleCache.current[id].primera_pendiente.abscisa)
      }
      return
    }
    try {
      const data = enriquecerDetalleEntrega(await api(`/entrega-dg/${id}`))
      detalleCache.current[id] = data
      setDetalle(data)
      if (scrollToPendiente && data?.primera_pendiente?.abscisa != null) {
        setScrollAbscisa(data.primera_pendiente.abscisa)
      }
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  const puedeReordenarTabs = puede(permisos, 'editar')

  const persistirOrdenTabs = useCallback(async () => {
    try {
      await api('/entrega-dg/reordenar', {
        method: 'POST',
        body: JSON.stringify({ ids: listaRef.current.map((n) => n.id) }),
      })
    } catch (e) {
      showError(e)
      cargarLista()
    }
  }, [api, showError, cargarLista])

  const onTabDragStart = (idx) => (e) => {
    if (!puedeReordenarTabs) {
      e.preventDefault()
      return
    }
    setDragTabIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onTabDragOver = (idx) => (e) => {
    e.preventDefault()
    if (!puedeReordenarTabs || dragTabIdx == null || dragTabIdx === idx) return
    setLista((prev) => {
      const next = [...prev]
      const [item] = next.splice(dragTabIdx, 1)
      next.splice(idx, 0, item)
      return next
    })
    setDragTabIdx(idx)
  }

  const onTabDragEnd = () => {
    if (dragTabIdx == null) return
    setDragTabIdx(null)
    persistirOrdenTabs()
  }

  useEffect(() => {
    listaRef.current = lista
  }, [lista])

  useEffect(() => {
    cargarLista()
    cargarEjes()
    api('/operadores').then(setOperadores).catch(() => {})
    api('/puntos/verificados?modulo_origen=nivelacion').then(setPuntosNiv).catch(() => {})
  }, [cargarLista, cargarEjes, api])

  useEffect(() => {
    if (!lista.length || sel || creando) return
    cargarDetalle(lista[0].id)
  }, [lista, sel, creando, cargarDetalle])

  useEffect(() => {
    if (!creando || !formNuevo.eje_id) {
      setEjeDetalleCapas([])
      return
    }
    api(`/diseno-geometrico/ejes/${formNuevo.eje_id}?_=${Date.now()}`)
      .then((d) => setEjeDetalleCapas(d?.capas || []))
      .catch(() => setEjeDetalleCapas([]))
  }, [creando, formNuevo.eje_id, api])

  useEffect(() => {
    if (!creando || !ejeDetalleCapas.length) return
    const idx = parseInt(formNuevo.indice_capa, 10) || 0
    const maxIdx = ejeDetalleCapas.length
    if (idx > maxIdx) {
      setFormNuevo((prev) => ({ ...prev, indice_capa: String(maxIdx) }))
    }
  }, [creando, ejeDetalleCapas, formNuevo.indice_capa])

  useEffect(() => {
    if (!creando || !formNuevo.eje_id) return
    const capaNom = capaNombreIndice(ejeDetalleCapas, formNuevo.indice_capa)
    if (!nombreManualRef.current) {
      setFormNuevo((prev) => ({ ...prev, nombre: sugerirNombreEntrega(capaNom) }))
    }
    if (!toleranciaManualRef.current) {
      const prevEntrega = lista.find(
        (e) => e.eje_id === formNuevo.eje_id && String(e.indice_capa) === String(formNuevo.indice_capa),
      )
      const tol = prevEntrega?.tolerancia_m ?? 0.005
      setFormNuevo((prev) => ({ ...prev, tolerancia_m: String(tol) }))
    }
  }, [creando, formNuevo.eje_id, formNuevo.indice_capa, ejeDetalleCapas, lista])

  useEffect(() => {
    if (!creando || !formNuevo.eje_id) {
      setPreviewRango(null)
      return
    }
    const desde = parseNum(formNuevo.abscisa_desde)
    const hasta = parseNum(formNuevo.abscisa_hasta)
    const q = new URLSearchParams({
      eje_id: formNuevo.eje_id,
      indice_capa: String(formNuevo.indice_capa),
    })
    if (desde != null) q.set('abscisa_desde', String(desde))
    if (hasta != null) q.set('abscisa_hasta', String(hasta))
    const t = setTimeout(() => {
      api(`/entrega-dg/preview-rango?${q}`)
        .then(setPreviewRango)
        .catch(() => setPreviewRango(null))
    }, 350)
    return () => clearTimeout(t)
  }, [
    creando,
    formNuevo.eje_id,
    formNuevo.indice_capa,
    formNuevo.abscisa_desde,
    formNuevo.abscisa_hasta,
    api,
  ])

  const abrirNuevo = () => {
    nombreManualRef.current = false
    toleranciaManualRef.current = false
    setCreando(true)
    setSel(null)
    setDetalle(null)
    setPreviewRango(null)
    const ejeId = ejes[0]?.id || ''
    setFormNuevo({
      nombre: '',
      eje_id: ejeId,
      indice_capa: '0',
      abscisa_desde: '',
      abscisa_hasta: '',
      operador: '',
      fecha_campo: new Date().toISOString().slice(0, 10),
      tolerancia_m: '0.005',
    })
  }

  const crearEntrega = async () => {
    const nombre = formNuevo.nombre.trim()
    if (!nombre) {
      showError(new Error('Indique un nombre para la entrega.'))
      return
    }
    if (!formNuevo.eje_id) {
      showError(new Error('Seleccione el eje de diseño.'))
      return
    }
    const desde = parseNum(formNuevo.abscisa_desde)
    const hasta = parseNum(formNuevo.abscisa_hasta)
    if (desde == null || hasta == null) {
      showError(new Error('Indique abscisa desde y hasta del tramo a entregar.'))
      return
    }
    if (desde > hasta) {
      showError(new Error('Abscisa desde debe ser menor o igual que abscisa hasta.'))
      return
    }
    setBusy(true)
    try {
      const row = await api('/entrega-dg', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          eje_id: formNuevo.eje_id,
          indice_capa: parseInt(formNuevo.indice_capa, 10) || 0,
          abscisa_desde: desde,
          abscisa_hasta: hasta,
          operador: formNuevo.operador.trim() || null,
          fecha_campo: formNuevo.fecha_campo || null,
          tolerancia_m: parseFloat(String(formNuevo.tolerancia_m).replace(',', '.')) || 0.01,
        }),
      })
      await cargarLista()
      if (row?.id) await cargarDetalle(row.id, { scrollToPendiente: true })
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const eliminarEntrega = async () => {
    const id = confirmEliminar?.id
    if (!id) return
    setBusy(true)
    try {
      await api(`/entrega-dg/${id}`, { method: 'DELETE' })
      if (sel === id) {
        setSel(null)
        setDetalle(null)
      }
      setConfirmEliminar(null)
      await cargarLista()
      if (sel === id) {
        const rest = lista.filter((e) => e.id !== id)
        if (rest[0]) await cargarDetalle(rest[0].id)
        else setCreando(true)
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const guardarCartera = async (payload) => {
    if (!sel) return
    try {
      const data = enriquecerDetalleEntrega(await api(`/entrega-dg/${sel}/guardar-cartera`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }))
      detalleCache.current[sel] = data
      setDetalle(data)
      cargarLista().catch(() => {})
    } catch (e) {
      showError(e)
      throw e
    }
  }

  const agregarBloque = async (abscisaInicio) => {
    if (!sel || addingBloqueAt != null) return
    setAddingBloqueAt(abscisaInicio ?? null)
    try {
      const bloque = await api(`/entrega-dg/${sel}/bloques`, {
        method: 'POST',
        body: JSON.stringify({ abscisa_inicio: abscisaInicio ?? null }),
      })
      setDetalle((prev) => {
        if (!prev || !bloque?.id) return prev
        const bloques = [...(prev.bloques || []), bloque].sort(
          (a, b) => (a.orden || 0) - (b.orden || 0),
        )
        return enriquecerDetalleEntrega({
          ...prev,
          bloques,
          matriz: matrizConBloquesEntrega(prev.matriz || [], bloques),
        })
      })
      if (abscisaInicio != null) setScrollAbscisa(abscisaInicio)
    } catch (e) {
      showError(e)
    } finally {
      setAddingBloqueAt(null)
    }
  }

  const recalcular = async () => {
    if (!sel) return
    setBusy(true)
    try {
      const data = enriquecerDetalleEntrega(await api(`/entrega-dg/${sel}/recalcular`, { method: 'POST' }))
      detalleCache.current[sel] = data
      setDetalle(data)
      await cargarLista()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const entrega = detalle?.entrega
  const capaNombreVigente = detalle?.analisis?.capa_nombre
    || detalle?.capa?.nombre
    || entrega?.capa_nombre
    || 'Capa'
  const resumen = detalle?.resumen
  const ejeInfo = detalle?.eje
  const sector = detalle?.sector

  const sectorLabel = useMemo(() => {
    if (!sector?.tramos?.length) return null
    return sector.tramos.map((t) => `${t.tramo} (PK ${fmtN(t.abscisa_min, 2)}–${fmtN(t.abscisa_max, 2)})`).join(' · ')
  }, [sector])

  return (
    <div>
      <datalist id="topo-operadores-entrega">
        {operadores.map((u) => (
          <option key={u.id || u.nombre} value={u.nombre} />
        ))}
      </datalist>

      <div style={ui.tabBar} role="tablist" aria-label="Entregas DG Obra">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <PermisoAviso permisos={permisos} accion="crear">
            <button
              type="button"
              style={{ ...ui.tabBtn(creando), borderStyle: 'dashed', color: ui.accent }}
              onClick={requestAbrirNuevo}
              title="Nueva entrega"
            >
              + Nuevo
            </button>
          </PermisoAviso>
          <TopoHelpIcon ayuda={AYUDA} />
        </div>
        {lista.map((n, tabIdx) => {
          const active = sel === n.id && !creando
          const label = (n.nombre || '').trim() || 'Sin nombre'
          const dragging = dragTabIdx === tabIdx
          return (
            <div
              key={n.id}
              style={{
                display: 'inline-flex',
                alignItems: 'stretch',
                flexShrink: 0,
                opacity: dragging ? 0.55 : 1,
              }}
              draggable={puedeReordenarTabs}
              onDragStart={onTabDragStart(tabIdx)}
              onDragOver={onTabDragOver(tabIdx)}
              onDragEnd={onTabDragEnd}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                style={{
                  ...ui.tabBtn(active),
                  cursor: puedeReordenarTabs ? (dragging ? 'grabbing' : 'grab') : 'pointer',
                }}
                onClick={() => requestCargarDetalle(n.id)}
                title={puedeReordenarTabs
                  ? `${label} — arrastre para cambiar el orden`
                  : label}
              >
                <span>{label}</span>
                <small style={{ color: ui.textMuted, fontWeight: 400 }}>
                  ({n.capa_nombre || 'capa'} · {n.avance_pct ?? 0}%)
                </small>
              </button>
              {puede(permisos, 'eliminar') && (
                <button
                  type="button"
                  title="Eliminar entrega"
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
          Aún no hay entregas. Pulse «+ Nuevo» para crear un seguimiento (requiere eje con rasante y estructura en Configuración DG).
        </p>
      )}

      {creando && (
        <PermisoAviso permisos={permisos} accion="crear">
          <div style={{ ...ui.card, marginBottom: 16, padding: '14px 16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 'var(--cc-base)', color: ui.text }}>
              Nueva entrega DG Obra
            </h3>
            {!ejes.length && (
              <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: ui.t?.warn || '#b45309' }}>
                No hay ejes listos. Complete Configuración DG (rasante + estructura) primero.
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <label>
                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Nombre</span>
                <input
                  value={formNuevo.nombre}
                  onChange={(e) => {
                    nombreManualRef.current = true
                    setFormNuevo({ ...formNuevo, nombre: e.target.value })
                  }}
                  placeholder="Entrega MD-12 tramo 1"
                  style={{ ...ui.inputStyle, display: 'block', marginTop: 4, width: '100%' }}
                />
              </label>
              <label>
                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Eje</span>
                <select
                  value={formNuevo.eje_id}
                  onChange={(e) => {
                    nombreManualRef.current = false
                    toleranciaManualRef.current = false
                    setFormNuevo({ ...formNuevo, eje_id: e.target.value, indice_capa: '0' })
                  }}
                  style={{ ...ui.inputStyle, display: 'block', marginTop: 4, width: '100%' }}
                >
                  <option value="">—</option>
                  {ejes.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Capa a verificar</span>
                <select
                  value={formNuevo.indice_capa}
                  onChange={(e) => {
                    nombreManualRef.current = false
                    toleranciaManualRef.current = false
                    setFormNuevo({ ...formNuevo, indice_capa: e.target.value })
                  }}
                  style={{ ...ui.inputStyle, display: 'block', marginTop: 4, width: '100%' }}
                >
                  {ejeDetalleCapas.map((c, i) => (
                    <option key={i} value={String(i)}>
                      {c.nombre} ({fmtN(c.espesor_m, 3)} m)
                    </option>
                  ))}
                  {ejeDetalleCapas.length > 0 && (
                    <option value={String(ejeDetalleCapas.length)}>Terreno natural</option>
                  )}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Abscisa desde (PK)</span>
                <input
                  value={formNuevo.abscisa_desde}
                  onChange={(e) => setFormNuevo({ ...formNuevo, abscisa_desde: e.target.value })}
                  placeholder="0+000"
                  style={{ ...ui.inputStyle, display: 'block', marginTop: 4, width: '100%' }}
                />
              </label>
              <label>
                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Abscisa hasta (PK)</span>
                <input
                  value={formNuevo.abscisa_hasta}
                  onChange={(e) => setFormNuevo({ ...formNuevo, abscisa_hasta: e.target.value })}
                  placeholder="1+200"
                  style={{ ...ui.inputStyle, display: 'block', marginTop: 4, width: '100%' }}
                />
              </label>
              <label>
                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Operador</span>
                <input
                  list="topo-operadores-entrega"
                  value={formNuevo.operador}
                  onChange={(e) => setFormNuevo({ ...formNuevo, operador: e.target.value })}
                  style={{ ...ui.inputStyle, display: 'block', marginTop: 4, width: '100%' }}
                />
              </label>
              <label>
                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Fecha campo</span>
                <input
                  type="date"
                  value={formNuevo.fecha_campo}
                  onChange={(e) => setFormNuevo({ ...formNuevo, fecha_campo: e.target.value })}
                  style={{ ...ui.inputStyle, display: 'block', marginTop: 4, width: '100%' }}
                />
              </label>
              <label>
                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Tolerancia (m)</span>
                <input
                  value={formNuevo.tolerancia_m}
                  onChange={(e) => {
                    toleranciaManualRef.current = true
                    setFormNuevo({ ...formNuevo, tolerancia_m: e.target.value })
                  }}
                  style={{ ...ui.inputStyle, display: 'block', marginTop: 4, width: '100%' }}
                />
              </label>
            </div>

            {(previewRango || (creando && formNuevo.eje_id && ejeDetalleCapas.length > 0)) && (
              <div style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 8,
                background: `${ui.accent}12`,
                fontSize: 'var(--cc-sm)',
                lineHeight: 1.55,
              }}
              >
                {previewRango?.analisis && (
                  <div style={{ marginBottom: previewRango?.sector?.tramos?.length ? 8 : 0 }}>
                    <strong>Capa:</strong>{' '}
                    {previewRango.analisis.capa_nombre}
                    {previewRango.analisis.espesor_diseno_m != null && (
                      <span> · esp. diseño {fmtN(previewRango.analisis.espesor_diseno_m, 3)} m</span>
                    )}
                    {previewRango.capa?.sobre_ancho_m != null && Number(previewRango.capa.sobre_ancho_m) > 0 && (
                      <span> · sobre-ancho {fmtN(previewRango.capa.sobre_ancho_m, 3)} m</span>
                    )}
                    {previewRango.analisis.referencia_nombre && (
                      <span style={{ color: ui.textMuted }}>
                        {' '}· ref. {previewRango.analisis.referencia_nombre}
                      </span>
                    )}
                    {previewRango.eje?.ancho_via_m != null && (
                      <span style={{ color: ui.textMuted }}>
                        {' '}· ancho vía {fmtN(previewRango.eje.ancho_via_m, 2)} m
                      </span>
                    )}
                    {previewRango.ordenadas_ref && (
                      <span style={{ color: ui.textMuted }}>
                        {' '}· ordenadas {Object.values(previewRango.ordenadas_ref).map((v) => fmtN(v, 2)).join(' · ')} m
                      </span>
                    )}
                  </div>
                )}
                {previewRango?.sector?.tramos?.length > 0 && (
                  <>
                    <strong>Sector reconocido:</strong>{' '}
                    {previewRango.sector.tramos.map((t) => (
                      <span key={t.tramo}>
                        {t.tramo} — PK {fmtN(t.abscisa_min, 2)} a {fmtN(t.abscisa_max, 2)} ({t.abscisas} est.)
                      </span>
                    ))}
                    {previewRango.abscisas?.length > 0 && (
                      <span style={{ color: ui.textMuted }}>
                        {' '}· {previewRango.abscisas.length} estaciones de referencia en rango
                      </span>
                    )}
                  </>
                )}
                {!previewRango?.sector?.tramos?.length && previewRango?.analisis && (
                  <span style={{ color: ui.textMuted }}>
                    Indique abscisa desde y hasta para reconocer el sector y las estaciones.
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              style={{ ...ui.btnPrimary, marginTop: 12 }}
              onClick={crearEntrega}
              disabled={busy || !ejes.length}
            >
              {busy ? 'Creando…' : 'Crear entrega e ir al sector'}
            </button>
          </div>
        </PermisoAviso>
      )}

      {detalle && entrega && !creando && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...ui.card, padding: '14px 16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', alignItems: 'baseline' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--cc-lg)', color: ui.text }}>{entrega.nombre}</h3>
              <span style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                Eje: <strong style={{ color: ui.text }}>{ejeInfo?.nombre}</strong>
              </span>
              <span style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                Capa: <strong style={{ color: ui.text }}>{capaNombreVigente}</strong>
                {' '}(esp. {fmtN(detalle.capa?.espesor_m, 3)} m)
              </span>
              {entrega.operador && (
                <span style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                  Operador: {entrega.operador}
                </span>
              )}
              <span style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                PK {fmtN(entrega.abscisa_desde, 2)} – {fmtN(entrega.abscisa_hasta, 2)}
              </span>
              <span style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                {fmtFecha(entrega.fecha_campo)} · Tol. ±{fmtN(entrega.tolerancia_m, 3)} m
              </span>
            </div>

            {sectorLabel && (
              <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-sm)', color: ui.accent }}>
                Sector: {sectorLabel}
                {detalle.primera_pendiente && (
                  <button
                    type="button"
                    style={{ ...ui.btnSecondary, marginLeft: 10, padding: '2px 8px', fontSize: 'var(--cc-xs)' }}
                    onClick={() => setScrollAbscisa(detalle.primera_pendiente.abscisa)}
                  >
                    Ir a PK {fmtN(detalle.primera_pendiente.abscisa, 2)} pendiente
                  </button>
                )}
              </p>
            )}

            {resumen?.totales && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                marginTop: 14,
                padding: '10px 12px',
                borderRadius: 8,
                background: `${ui.t?.success || '#047857'}18`,
              }}
              >
                <span style={{ fontSize: 'var(--cc-sm)' }}>
                  Avance: <strong>{resumen.totales.avance_pct}%</strong>
                </span>
                <span style={{ fontSize: 'var(--cc-sm)', color: '#047857' }}>
                  Entregadas: <strong>{resumen.totales.entregadas}</strong>
                </span>
                <span style={{ fontSize: 'var(--cc-sm)', color: '#2563eb' }}>
                  Parciales: <strong>{resumen.totales.parciales}</strong>
                </span>
                <span style={{ fontSize: 'var(--cc-sm)', color: '#b45309' }}>
                  Pendientes: <strong>{resumen.totales.pendientes}</strong>
                </span>
                <span style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                  de {resumen.totales.abscisas} estaciones
                </span>
              </div>
            )}
          </div>

          <EntregaVerificacionMatriz
            ref={matrizRef}
            key={entrega.id}
            ui={ui}
            detalle={detalle}
            permisos={permisos}
            busy={busy}
            puntosNiv={puntosNiv}
            onGuardarCartera={guardarCartera}
            onDirtyChange={setCarteraDirty}
            onAddBloque={agregarBloque}
            onRecalcular={recalcular}
            scrollToAbscisa={scrollAbscisa}
            addingBloqueAt={addingBloqueAt}
          />

        </div>
      )}

      {salirPendiente && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Cartera sin guardar"
          confirmLabel="Guardar"
          cancelLabel="Cancelar"
          secondaryLabel="Salir sin guardar"
          onCancel={() => { if (!guardSalidaBusy) setSalirPendiente(null) }}
          onSecondary={() => ejecutarSalidaPendiente(false)}
          onConfirm={() => ejecutarSalidaPendiente(true)}
          busy={guardSalidaBusy}
        >
          Hay cambios sin guardar.
        </TopoConfirmModal>
      )}

      {confirmEliminar && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Eliminar entrega"
          confirmLabel={busy ? 'Eliminando…' : 'Eliminar'}
          onCancel={() => { if (!busy) setConfirmEliminar(null) }}
          onConfirm={eliminarEntrega}
        >
          ¿Eliminar la entrega <strong>«{confirmEliminar.nombre}»</strong> y todas sus lecturas?
        </TopoConfirmModal>
      )}

      {errorModal && (
        <TopoErrorModal theme={ui.t} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </div>
  )
}
