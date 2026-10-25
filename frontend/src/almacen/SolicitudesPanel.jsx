import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SolicitudFormModal from './SolicitudFormModal'
import SolicitudDetalleModal from './SolicitudDetalleModal'
import SolicitudesFiltrosModal from './SolicitudesFiltrosModal'
import SolicitudOcsPdfButton from './SolicitudOcsPdfButton'
import AgruparSolicitudesModal from './AgruparSolicitudesModal'
import DeshacerAgruparModal from './DeshacerAgruparModal'
import CcConfirmModal from '../components/CcConfirmModal'
import {
  solicitudPuedeReabrirOc,
  solicitudPuedeValidar,
  solicitudOrdenesCompra,
  solicitudTieneOrdenCompra,
} from './solicitudDetalleHelpers'
import {
  countSolicitudesFiltrosActivos,
  EMPTY_SOLICITUDES_FILTROS,
  filterSolicitudesLista,
} from './solicitudesFiltros'
import {
  AlmacenHelpIcon,
  ESTADO_SOLICITUD_LABEL,
  fmtFechaAlmacenCorta,
  fmtMoneySolicitud as fmtMoney,
  formatEstadoOcMovimiento,
  puedeAnularSolicitud,
  textoAprobacionSolicitud,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'
import { puedeCrearSolicitudAlmacen } from './almacenPermisos'
import { colorEstadoSolicitud, tonoFilaSinInsumo } from './almacenContraste'
import { esDocumentoSistema, ETIQUETA_DOCUMENTO_SISTEMA } from './ocDocumentoSistema'
import AlmacenTrazabilidadButton from './AlmacenTrazabilidadButton'
import {
  partesResaltadas,
  textoConteoBusqueda,
  tokensBusqueda,
} from './solicitudBusqueda'

function ResalteBusqueda({ texto, tokens, accentSoft }) {
  const src = texto == null ? '' : String(texto)
  const parts = partesResaltadas(src, tokens)
  if (!tokens?.length) return src
  return parts.map((p, i) => (
    p.hit ? (
      <mark
        key={i}
        data-testid="busqueda-resalte"
        style={{
          background: accentSoft || 'transparent',
          color: 'inherit',
          fontWeight: 800,
          padding: 0,
          borderRadius: 2,
        }}
      >
        {p.text}
      </mark>
    ) : <span key={i}>{p.text}</span>
  ))
}

export default function SolicitudesPanel({
  permisos, t, token, contratoId, refreshSignal = 0, onDataLoaded,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const tonoFila = tonoFilaSinInsumo(ui)
  const verEconomicos = permisos?.verEconomicos === true
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [reabrirOc, setReabrirOc] = useState(false)
  const [detalleId, setDetalleId] = useState(null)
  const [detalleEpoch, setDetalleEpoch] = useState(0)
  const [seleccionId, setSeleccionId] = useState(null)
  const [detalleTab, setDetalleTab] = useState('portada')
  const [anularTarget, setAnularTarget] = useState(null)
  const [anularBusy, setAnularBusy] = useState(false)
  const [eliminarTarget, setEliminarTarget] = useState(null)
  const [eliminarBusy, setEliminarBusy] = useState(false)
  const [eliminarAviso, setEliminarAviso] = useState('')
  const [filtros, setFiltros] = useState(() => ({ ...EMPTY_SOLICITUDES_FILTROS }))
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [autoriaOpen, setAutoriaOpen] = useState(false)
  const [autoria, setAutoria] = useState(null)
  const [autoriaError, setAutoriaError] = useState('')

  useEffect(() => {
    if (!autoriaOpen) return undefined
    let vivo = true
    setAutoria(null)
    setAutoriaError('')
    api.reporteAutoriaLineas()
      .then((r) => { if (vivo) setAutoria(r) })
      .catch((e) => { if (vivo) setAutoriaError(e.message || 'No se pudo leer el informe.') })
    return () => { vivo = false }
  }, [autoriaOpen, api])
  const [agrupar, setAgrupar] = useState(null)
  const [agruparBusy, setAgruparBusy] = useState(false)
  const [agruparError, setAgruparError] = useState('')
  const [agruparResumen, setAgruparResumen] = useState('')
  const [agruparFase, setAgruparFase] = useState('')
  const [deshacer, setDeshacer] = useState(null)
  const [deshacerError, setDeshacerError] = useState('')
  const [deshacerResumen, setDeshacerResumen] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const busquedaSeq = useRef(0)

  const PAGE_SIZE = 80
  const puedeEliminar = Boolean(permisos?.eliminar)
  const tokens = useMemo(() => tokensBusqueda(q), [q])
  const busquedaActiva = tokens.length > 0
  const busquedaPendiente = tokensBusqueda(qInput).join(' ') !== tokens.join(' ')

  const listaFiltrada = useMemo(
    () => filterSolicitudesLista(lista, filtros),
    [lista, filtros],
  )
  const filtrosActivos = countSolicitudesFiltrosActivos(filtros)

  useEffect(() => {
    const handle = setTimeout(() => setQ(qInput.trim()), 300)
    return () => clearTimeout(handle)
  }, [qInput])

  const reload = useCallback(() => {
    const id = busquedaSeq.current + 1
    busquedaSeq.current = id
    setError('')
    setBuscando(true)
    return api.listSolicitudes(undefined, { resumen: true, limit: PAGE_SIZE, offset: 0, q })
      .then((page) => {
        if (id !== busquedaSeq.current) return
        setLista(page.items || [])
        setHasMore(Boolean(page.has_more))
        setTotalCount(Number(page.total) || (page.items || []).length)
      })
      .catch((e) => {
        if (id !== busquedaSeq.current) return
        setError(e.message)
      })
      .finally(() => {
        if (id !== busquedaSeq.current) return
        setBuscando(false)
        setLoading(false)
        onDataLoaded?.()
      })
  }, [api, onDataLoaded, q])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || buscando) return
    const id = busquedaSeq.current
    setLoadingMore(true)
    api.listSolicitudes(undefined, { resumen: true, limit: PAGE_SIZE, offset: lista.length, q })
      .then((page) => {
        if (id !== busquedaSeq.current) return
        const next = page.items || []
        setLista((prev) => {
          const seen = new Set(prev.map((s) => s.id))
          return [...prev, ...next.filter((s) => !seen.has(s.id))]
        })
        setHasMore(Boolean(page.has_more))
        setTotalCount(Number(page.total) || 0)
      })
      .catch((e) => {
        if (id !== busquedaSeq.current) return
        setError(e.message)
      })
      .finally(() => {
        if (id === busquedaSeq.current) setLoadingMore(false)
      })
  }, [api, buscando, hasMore, lista.length, loadingMore, q])

  useEffect(() => { reload() }, [reload])

  const limpiarBusqueda = () => {
    setQInput('')
    setQ('')
  }

  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    if (refreshSignal > 0) {
      if (!creating && !editId && !detalleId) reloadRef.current()
      else onDataLoaded?.()
    }
  }, [refreshSignal, creating, editId, detalleId, onDataLoaded])

  const abrirDetalle = (s, tab = 'portada') => {
    setDetalleTab(tab)
    setDetalleId(s.id)
    setSeleccionId(s.id)
  }

  const ejecutarAnular = async () => {
    if (!anularTarget) return
    setAnularBusy(true)
    try {
      await api.anularSolicitud(anularTarget.id)
      setAnularTarget(null)
      reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setAnularBusy(false)
    }
  }

  const ejecutarEliminar = async () => {
    if (!eliminarTarget) return
    setEliminarBusy(true)
    setEliminarAviso('')
    try {
      await api.eliminarSolicitud(eliminarTarget.id)
      setEliminarTarget(null)
      if (detalleId === eliminarTarget.id) setDetalleId(null)
      reload()
    } catch (e) {
      setEliminarAviso(e.message)
    } finally {
      setEliminarBusy(false)
    }
  }

  const abrirAgrupar = async () => {
    setAgruparBusy(true)
    setAgruparFase('Leyendo las solicitudes y sus proveedores…')
    setAgruparError('')
    setAgruparResumen('')
    try {
      const vista = await api.vistaPreviaAgruparSolicitudes()
      setAgrupar(vista)
    } catch (e) {
      setError(e.message)
    } finally {
      setAgruparBusy(false)
      setAgruparFase('')
    }
  }

  const confirmarAgrupar = async (body) => {
    setAgruparBusy(true)
    setAgruparFase('Moviendo las líneas y actualizando los nombres…')
    setAgruparError('')
    try {
      const r = await api.agruparSolicitudes(body)
      setAgrupar(r)
      setAgruparResumen(r?.resumen || 'Listo.')
      reload()
    } catch (e) {
      setAgruparError(e.message)
    } finally {
      setAgruparBusy(false)
      setAgruparFase('')
    }
  }

  const abrirDeshacer = async () => {
    setAgruparBusy(true)
    setAgruparFase('Revisando la última agrupación…')
    setDeshacerError('')
    setDeshacerResumen('')
    try {
      const vista = await api.vistaPreviaDeshacerAgrupar()
      setDeshacer(vista)
    } catch (e) {
      setError(e.message)
    } finally {
      setAgruparBusy(false)
      setAgruparFase('')
    }
  }

  const confirmarDeshacer = async () => {
    setAgruparBusy(true)
    setAgruparFase('Devolviendo las líneas a sus solicitudes…')
    setDeshacerError('')
    try {
      const r = await api.deshacerAgrupar()
      setDeshacer(r)
      setDeshacerResumen(r?.resumen || 'Listo.')
      reload()
    } catch (e) {
      setDeshacerError(e.message)
    } finally {
      setAgruparBusy(false)
      setAgruparFase('')
    }
  }

  const formModalOpen = creating || editId

  const cerrarFormModal = () => {
    setEditId(null)
    setCreating(false)
    setReabrirOc(false)
  }

  const abrirReabrirOc = (s) => {
    const id = s?.id
    if (id == null || id === '') return
    setCreating(false)
    setReabrirOc(true)
    setEditId(id)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📋 Solicitudes de materiales</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Genere solicitudes de insumos con ubicación PK-ID, control presupuestal y trazabilidad por línea.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {permisos?.editar && (
            <>
              <button
                type="button"
                style={ui.btnSecondary}
                data-testid="agrupar-solicitudes"
                disabled={agruparBusy}
                onClick={abrirAgrupar}
                title="Reúne las solicitudes sin OC por proveedor"
              >
                {agruparBusy && agruparFase.startsWith('Leyendo') ? 'Leyendo…' : 'Agrupar'}
              </button>
              <button
                type="button"
                style={ui.btnSecondary}
                data-testid="deshacer-agrupar"
                disabled={agruparBusy}
                onClick={abrirDeshacer}
                title="Devuelve la última ejecución de Agrupar"
              >
                {agruparBusy && agruparFase.startsWith('Revisando') ? 'Revisando…' : 'Deshacer'}
              </button>
            </>
          )}
          {permisos?.esDesarrollador && (
            <button
              type="button"
              style={ui.btnSecondary}
              data-testid="reporte-autoria-lineas"
              onClick={() => setAutoriaOpen(true)}
              title="Informe de líneas movidas. No corrige nada."
            >
              Autoría
            </button>
          )}
          <button
            type="button"
            style={ui.btnSecondary}
            onClick={() => setFiltrosOpen(true)}
            title="Filtrar solicitudes"
          >
            🔎 Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''}
          </button>
          {(permisos?.puedeNuevaSolicitud ?? puedeCrearSolicitudAlmacen(permisos)) && (
            <button type="button" style={ui.btnPrimary} onClick={() => { setReabrirOc(false); setCreating(true) }}>
              + Nueva solicitud
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <input
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Buscar insumo, mensaje, proveedor, tramo, PK-ID…"
          aria-label="Buscar solicitudes"
          data-testid="solicitud-busqueda"
          autoComplete="off"
          style={{ ...ui.input, flex: '1 1 240px', minWidth: 200, margin: 0 }}
        />
        {qInput.trim() && (
          <button
            type="button"
            data-testid="solicitud-busqueda-limpiar"
            style={ui.btnSecondary}
            onClick={limpiarBusqueda}
          >
            Limpiar
          </button>
        )}
      </div>
      <div
        data-testid="solicitud-busqueda-conteo"
        aria-live="polite"
        style={{
          fontSize: 'var(--cc-sm)',
          color: ui.textMuted,
          marginBottom: qInput.trim() ? 12 : 0,
        }}
      >
        {qInput.trim()
          ? (buscando || busquedaPendiente ? 'Buscando…' : textoConteoBusqueda(totalCount))
          : ''}
      </div>

      {error && <div style={{ color: tonoFila.error, marginBottom: 12 }}>{error}</div>}

      {loading && lista.length === 0 ? (
        <div style={{ color: ui.textMuted }}>Cargando…</div>
      ) : busquedaActiva && !buscando && lista.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.text }} data-testid="solicitud-busqueda-vacia">
          Ninguna solicitud coincide con la búsqueda.
          {' '}
          <button
            type="button"
            style={{ ...ui.btnSecondary, padding: '4px 10px', fontSize: 'var(--cc-caption)' }}
            onClick={limpiarBusqueda}
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : lista.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
          No hay solicitudes registradas.
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
          Ninguna solicitud coincide con los filtros.
          {' '}
          <button
            type="button"
            style={{ ...ui.btnSecondary, padding: '4px 10px', fontSize: 'var(--cc-caption)' }}
            onClick={() => setFiltros({ ...EMPTY_SOLICITUDES_FILTROS })}
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div style={ui.sheetWrap} className="cc-almacen-table-scroll cc-almacen-items-sheet">
          <table
            className="cc-almacen-responsive-table"
            style={{ ...ui.sheetTable, minWidth: 1180, tableLayout: 'fixed' }}
          >
            <thead>
              <tr>
                <th style={{ ...ui.th, width: 44 }}>#</th>
                <th style={{ ...ui.th, width: '24%' }}>Título</th>
                <th style={{ ...ui.th, width: 118 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Solicitud
                    <AlmacenHelpIcon ayuda="Estado del documento de la solicitud: borrador, enviada, aprobada, rechazada u OC parcial. No indica si la orden de compra ya se envió al proveedor. Eso se ve en la columna OC." />
                  </span>
                </th>
                <th style={{ ...ui.th, width: '12%' }}>Solicitante</th>
                <th style={{ ...ui.th, width: '12%' }}>Aprobación</th>
                <th style={{ ...ui.th, textAlign: 'right', width: 56 }}>Ítems</th>
                {verEconomicos && (
                  <th style={{ ...ui.th, textAlign: 'right', width: 120 }}>Valor</th>
                )}
                <th style={{ ...ui.th, width: 96 }}>Fecha</th>
                <th style={{ ...ui.th, width: 56 }}>OC</th>
                <th style={{ ...ui.th, width: 92 }} title="Entrada vs cantidad de la OC">Entrada</th>
                <th style={{ ...ui.th, width: 92 }} title="Salida vs cantidad recibida en entrada">Salida</th>
                <th style={{ ...ui.th, width: 280 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((s) => {
                const nItems = s.items_count != null ? s.items_count : (s.items || []).length
                const sinInsumo = Number(s.lineas_sin_insumo) > 0
                const vacia = nItems === 0
                const seleccionada = String(seleccionId) === String(s.id)
                const fondo = sinInsumo
                  ? tonoFila.fondo
                  : (seleccionada ? tonoFila.seleccionadoFondo : 'transparent')
                const fondoHover = sinInsumo
                  ? tonoFila.fondoHover
                  : (seleccionada ? tonoFila.seleccionadoFondo : ui.accentSoft)
                const sombras = []
                if (sinInsumo) sombras.push(`inset 4px 0 0 ${tonoFila.barra}`)
                if (seleccionada) sombras.push(`inset 0 0 0 2px ${tonoFila.seleccionadoBorde}`)
                const cellEllipsis = {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }
                const titulo = s.titulo?.trim() || `Solicitud #${s.consecutivo}`
                const estadoTxt = s.oc_parcial || (s.estado === 'enviada' && solicitudTieneOrdenCompra(s))
                  ? 'OC parcial'
                  : ESTADO_SOLICITUD_LABEL[s.estado]
                const aprobacion = textoAprobacionSolicitud(s)
                return (
                <tr
                  key={s.id}
                  data-testid={sinInsumo ? 'solicitud-sin-insumo' : undefined}
                  data-selected={seleccionada ? 'true' : undefined}
                  data-lineas-sin-insumo={sinInsumo ? String(s.lineas_sin_insumo) : undefined}
                  style={{
                    cursor: 'pointer',
                    background: fondo,
                    color: ui.text,
                    boxShadow: sombras.length ? sombras.join(', ') : undefined,
                  }}
                  onClick={() => abrirDetalle(s)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = fondoHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = fondo }}
                >
                  <td style={ui.tdNum} data-label="#">
                    <ResalteBusqueda texto={s.consecutivo} tokens={tokens} accentSoft={ui.accentSoft} />
                  </td>
                  <td
                    style={{ ...ui.td, fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.35 }}
                    data-label="Título"
                  >
                    {Number(s.mensajes_no_leidos) > 0 && (
                      <span
                        data-testid="solicitud-lista-no-leidos"
                        title={`${s.mensajes_no_leidos} mensaje(s) sin leer`}
                        style={{
                          marginLeft: 6,
                          background: '#dc2626',
                          color: '#fff',
                          borderRadius: 10,
                          padding: '0 6px',
                          fontSize: 'var(--cc-xs)',
                          fontWeight: 700,
                        }}
                      >
                        {s.mensajes_no_leidos}
                      </span>
                    )}
                    <ResalteBusqueda texto={titulo} tokens={tokens} accentSoft={ui.accentSoft} />
                    {s.solicitud_origen?.consecutivo ? (
                      <div style={{ fontWeight: 600, fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>
                        Derivada de #{s.solicitud_origen.consecutivo}
                      </div>
                    ) : null}
                    {(s.solicitudes_derivadas || []).length > 0 ? (
                      <div style={{ fontWeight: 600, fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>
                        Derivó {(s.solicitudes_derivadas || []).map((d) => `#${d.consecutivo}`).join(', ')}
                      </div>
                    ) : null}
                    {busquedaActiva && s.busqueda_donde ? (
                      <div
                        data-testid="solicitud-busqueda-donde"
                        style={{ fontWeight: 600, fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}
                      >
                        {s.busqueda_donde}
                      </div>
                    ) : null}
                    {vacia && (
                      <span
                        data-testid="solicitud-vacia"
                        title="Esta solicitud quedó sin líneas al agrupar y se conserva"
                        style={{
                          marginLeft: 6,
                          background: tonoFila.vaciaBg,
                          color: tonoFila.vaciaText,
                          border: `1px solid ${tonoFila.vaciaBorder}`,
                          borderRadius: 10,
                          padding: '0 6px',
                          fontSize: 'var(--cc-xs)',
                          fontWeight: 700,
                        }}
                      >
                        Vacía
                      </span>
                    )}
                    {sinInsumo && (
                      <span
                        title={`${s.lineas_sin_insumo} línea(s) sin insumo asignado`}
                        style={{
                          marginLeft: 6,
                          background: tonoFila.badgeBg,
                          color: tonoFila.badgeText,
                          borderRadius: 10,
                          padding: '0 6px',
                          fontSize: 'var(--cc-xs)',
                          fontWeight: 700,
                        }}
                      >
                        Sin insumo · {s.lineas_sin_insumo}
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      ...ui.td,
                      color: colorEstadoSolicitud(s.estado, tonoFila),
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                    data-label="Solicitud"
                  >
                    <ResalteBusqueda texto={estadoTxt} tokens={tokens} accentSoft={ui.accentSoft} />
                  </td>
                  <td
                    style={{ ...ui.td, ...cellEllipsis }}
                    data-label="Solicitante"
                    title={
                      s.solicitantes_linea_resumen && s.solicitantes_linea_resumen !== s.solicitante_nombre
                        ? `Líneas pedidas por ${s.solicitantes_linea_resumen}. Solicitud de ${s.solicitante_nombre || '—'}`
                        : (s.solicitante_nombre || undefined)
                    }
                  >
                    <ResalteBusqueda
                      texto={
                        s.solicitantes_linea_resumen && s.solicitantes_linea_resumen !== s.solicitante_nombre
                          ? `${s.solicitantes_linea_resumen} · solicitud de ${s.solicitante_nombre || '—'}`
                          : (s.solicitante_nombre || '—')
                      }
                      tokens={tokens}
                      accentSoft={ui.accentSoft}
                    />
                  </td>
                  <td
                    style={{ ...ui.td, ...cellEllipsis }}
                    data-label="Aprobación"
                    title={textoAprobacionSolicitud(s) || undefined}
                  >
                    <ResalteBusqueda texto={aprobacion} tokens={tokens} accentSoft={ui.accentSoft} />
                  </td>
                  <td style={ui.tdNum} data-label="Ítems">{nItems}</td>
                  {verEconomicos && (
                    <td
                      style={{ ...ui.tdNum, whiteSpace: 'nowrap' }}
                      data-label="Valor"
                      data-testid="solicitud-lista-valor"
                    >
                      {s.valor_solicitud == null ? '—' : fmtMoney(s.valor_solicitud)}
                    </td>
                  )}
                  <td style={{ ...ui.td, whiteSpace: 'nowrap' }} data-label="Fecha">
                    <ResalteBusqueda texto={fmtFechaAlmacenCorta(s.created_at)} tokens={tokens} accentSoft={ui.accentSoft} />
                  </td>
                  <td style={{ ...ui.td, whiteSpace: 'nowrap' }} data-label="OC" onClick={(e) => e.stopPropagation()}>
                    {(s.estado === 'aprobada' || solicitudTieneOrdenCompra(s)) && permisos?.exportar
                      && solicitudOrdenesCompra(s).length > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <SolicitudOcsPdfButton
                            solicitudId={s.id}
                            ordenes={solicitudOrdenesCompra(s)}
                            compact
                            puedeExportar
                          />
                          {solicitudOrdenesCompra(s).filter(esDocumentoSistema).map((oc) => (
                            <span
                              key={oc.id}
                              data-testid="oc-documento-sistema"
                              style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.text }}
                            >
                              OC #{oc.numero_oc} · {ETIQUETA_DOCUMENTO_SISTEMA}
                            </span>
                          ))}
                        </span>
                      ) : '—'}
                  </td>
                  <td
                    style={{
                      ...ui.td,
                      fontWeight: s.estado_entrada ? 700 : 400,
                      whiteSpace: 'nowrap',
                      color: s.estado_entrada === 'total'
                        ? tonoFila.movimientoTotal
                        : s.estado_entrada === 'parcial'
                          ? tonoFila.movimientoParcial
                          : ui.textMuted,
                    }}
                    data-label="Entrada"
                    data-testid="solicitud-estado-entrada"
                  >
                    {formatEstadoOcMovimiento(s.estado_entrada)}
                  </td>
                  <td
                    style={{
                      ...ui.td,
                      fontWeight: s.estado_salida ? 700 : 400,
                      whiteSpace: 'nowrap',
                      color: s.estado_salida === 'total'
                        ? tonoFila.movimientoTotal
                        : s.estado_salida === 'parcial'
                          ? tonoFila.movimientoParcial
                          : ui.textMuted,
                    }}
                    data-label="Salida"
                    data-testid="solicitud-estado-salida"
                  >
                    {formatEstadoOcMovimiento(s.estado_salida)}
                  </td>
                  <td style={{ ...ui.td, whiteSpace: 'nowrap' }} data-label="Acciones" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center' }}>
                      <AlmacenTrazabilidadButton
                        token={token}
                        theme={t}
                        ui={ui}
                        compact
                        entidadTipo="solicitud"
                        entidadId={s.id}
                        titulo={`Almacén · Solicitud #${s.consecutivo}${s.titulo?.trim() ? ` · ${s.titulo.trim()}` : ''}`}
                      />
                      {solicitudPuedeValidar(s, permisos) && (
                        <button
                          type="button"
                          style={{ ...ui.btnPrimary, padding: '4px 8px', fontSize: 'var(--cc-caption)', minHeight: 0 }}
                          onClick={() => abrirDetalle(s, 'portada')}
                        >
                          Revisar
                        </button>
                      )}
                      {solicitudPuedeReabrirOc(s, permisos) && (
                        <button
                          type="button"
                          style={{ ...ui.btnPrimary, padding: '4px 8px', fontSize: 'var(--cc-caption)', minHeight: 0 }}
                          title="Agregar insumos adicionales. Si el proveedor es distinto, se genera otra OC."
                          data-testid="reabrir-oc-grid"
                          onClick={() => abrirReabrirOc(s)}
                        >
                          Reabrir OC
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          type="button"
                          style={{
                            ...ui.btnSecondary,
                            padding: '4px 8px',
                            fontSize: 'var(--cc-caption)',
                            minHeight: 0,
                            color: tonoFila.eliminar,
                            borderColor: tonoFila.eliminar,
                          }}
                          title="Eliminar solicitud"
                          data-testid="eliminar-solicitud"
                          onClick={() => {
                            setEliminarAviso('')
                            setEliminarTarget(s)
                          }}
                        >
                          Eliminar
                        </button>
                      )}
                      {puedeAnularSolicitud(s, permisos) && (
                        <button
                          type="button"
                          style={{
                            ...ui.btnSecondary,
                            padding: '4px 8px',
                            fontSize: 'var(--cc-caption)',
                            minHeight: 0,
                            color: tonoFila.anular,
                            borderColor: tonoFila.anular,
                          }}
                          onClick={() => setAnularTarget(s)}
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasMore && !filtrosActivos && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button
            type="button"
            style={ui.btnSecondary}
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? 'Cargando…' : `Cargar más (${lista.length} de ${totalCount || '…'})`}
          </button>
        </div>
      )}

      {!loading && !hasMore && totalCount > PAGE_SIZE && !filtrosActivos && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          Mostrando {lista.length} de {totalCount} solicitudes
        </div>
      )}

      {agruparBusy && agruparFase && (
        <div data-testid="agrupar-progreso" style={{ marginBottom: 10, fontSize: 'var(--cc-sm)', fontWeight: 700 }}>
          {agruparFase}
        </div>
      )}

      {agrupar && (
        <AgruparSolicitudesModal
          vista={agrupar}
          verEconomicos={verEconomicos}
          busy={agruparBusy}
          error={agruparError}
          resumen={agruparResumen}
          fase={agruparFase}
          onCancel={() => {
            setAgrupar(null)
            setAgruparError('')
            setAgruparResumen('')
          }}
          onConfirm={confirmarAgrupar}
        />
      )}

      {deshacer && (
        <DeshacerAgruparModal
          vista={deshacer}
          busy={agruparBusy}
          error={deshacerError}
          resumen={deshacerResumen}
          fase={agruparFase}
          onCancel={() => {
            setDeshacer(null)
            setDeshacerError('')
            setDeshacerResumen('')
          }}
          onConfirm={confirmarDeshacer}
        />
      )}

      {filtrosOpen && (
        <SolicitudesFiltrosModal
          theme={t}
          filtros={filtros}
          onClose={() => setFiltrosOpen(false)}
          onApply={(next) => {
            setFiltros({ ...EMPTY_SOLICITUDES_FILTROS, ...next })
            setFiltrosOpen(false)
          }}
        />
      )}

      {formModalOpen && (
        <SolicitudFormModal
          solicitudId={editId}
          permisos={permisos}
          t={t}
          token={token}
          contratoId={contratoId}
          modoReabrirOc={reabrirOc}
          zIndex={reabrirOc ? 100090 : 100056}
          onClose={cerrarFormModal}
          onSaved={(result) => {
            if (reabrirOc) {
              cerrarFormModal()
              setDetalleEpoch((n) => n + 1)
              reload()
              return
            }
            if (result?.estado === 'borrador' && result?.id) {
              setCreating(false)
              setEditId(result.id)
              reload()
              return
            }
            cerrarFormModal()
            reload()
          }}
        />
      )}

      {detalleId && (
        <SolicitudDetalleModal
          key={`${detalleId || ''}-${detalleEpoch}`}
          solicitudId={detalleId}
          initialSeed={lista.find((s) => String(s.id) === String(detalleId)) || null}
          initialTab={detalleTab}
          permisos={permisos}
          token={token}
          t={t}
          contratoId={contratoId}
          onMensajesLeidos={(n) => {
            setLista((prev) => prev.map((s) => (
              String(s.id) === String(detalleId) ? { ...s, mensajes_no_leidos: n } : s
            )))
          }}
          onClose={() => setDetalleId(null)}
          onUpdated={() => {
            setDetalleId(null)
            reload()
          }}
          onEdit={(sol) => {
            setDetalleId(null)
            setReabrirOc(false)
            setEditId(sol?.id || detalleId)
            setCreating(false)
          }}
          onReabrirOc={(sol) => abrirReabrirOc(sol || { id: detalleId })}
          onAbrirSolicitud={(id) => {
            if (id == null) return
            setDetalleId(id)
            setDetalleEpoch((n) => n + 1)
          }}
        />
      )}

      {anularTarget && (
        <CcConfirmModal
          theme={t}
          tipo="danger"
          titulo="Anular solicitud"
          confirmar="Anular"
          cancelar="Cancelar"
          procesando={anularBusy}
          onCancel={() => !anularBusy && setAnularTarget(null)}
          onConfirm={ejecutarAnular}
        >
          {`¿Anular la solicitud #${anularTarget.consecutivo} enviada? Quedará marcada como rechazada.`}
        </CcConfirmModal>
      )}

      {eliminarTarget && (
        <CcConfirmModal
          theme={t}
          tipo="danger"
          titulo="Eliminar solicitud"
          confirmar="Eliminar"
          cancelar="Cancelar"
          procesando={eliminarBusy}
          onCancel={() => {
            if (eliminarBusy) return
            setEliminarTarget(null)
            setEliminarAviso('')
          }}
          onConfirm={ejecutarEliminar}
        >
          {`¿Eliminar la solicitud #${eliminarTarget.consecutivo}${eliminarTarget.titulo ? ` · ${eliminarTarget.titulo}` : ''}?`}
          <div style={{ marginTop: 10, opacity: 0.9 }}>
            Se quitan la solicitud y sus líneas. Los totales del listado se actualizan. Si alguna línea ya está en una orden de compra, no se elimina nada.
          </div>
          {eliminarAviso && (
            <div style={{ marginTop: 10, color: tonoFila.error }}>{eliminarAviso}</div>
          )}
        </CcConfirmModal>
      )}

      {autoriaOpen && (
        <div
          data-testid="reporte-autoria"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100060,
            background: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setAutoriaOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ ...ui.card, width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 20 }}
          >
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-title)', marginBottom: 8 }}>
              Autoría de líneas movidas
            </div>
            <p style={{ margin: '0 0 12px', color: ui.textMuted, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
              Informe de solo lectura. No restaura solicitantes ni modifica órdenes de compra ya emitidas.
              Lo que no se puede reconstruir queda marcado.
            </p>
            {autoriaError && <div style={{ color: '#b91c1c' }}>{autoriaError}</div>}
            {!autoria && !autoriaError && <div style={{ color: ui.textMuted }}>Leyendo el log…</div>}
            {autoria && (
              <>
                <div style={{ marginBottom: 8 }}>
                  Movidas: {autoria.total_movidas}. Se restauraría el solicitante en {autoria.restaurarian}.
                  Inciertas: {autoria.inciertas}. Ya correctas: {autoria.ya_correctas}.
                </div>
                <div style={{ fontSize: 'var(--cc-sm)', marginBottom: 12 }}>{autoria.trazabilidad}</div>
                <table style={{ width: '100%', fontSize: 'var(--cc-sm)' }}>
                  <thead>
                    <tr>
                      <th style={ui.th}>Línea</th>
                      <th style={ui.th}>Hoy</th>
                      <th style={ui.th}>Se restauraría</th>
                      <th style={ui.th}>Certeza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(autoria.lineas || []).filter((f) => f.accion !== 'ya_correcto').map((f) => (
                      <tr key={f.item_id}>
                        <td style={ui.td}>#{f.item_id} {f.material}</td>
                        <td style={ui.td}>{f.solicitud_actual_de_nombre || '—'}</td>
                        <td style={ui.td}>{f.candidato_nombre || f.motivo || '—'}</td>
                        <td style={ui.td}>{f.cierto ? 'Sí' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" style={ui.btnSecondary} onClick={() => setAutoriaOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
