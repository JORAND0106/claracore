import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PptoFiltroCampo from '../presupuesto/PptoFiltroCampo'
import {
  crearFiltroPlantilla,
  eliminarFiltroPlantilla,
  fetchFiltrosPlantillas,
} from '../presupuesto/filtrosPlantillasApi'
import SicoeFiltroCapasBlock from './SicoeFiltroCapasBlock'
import SicoeFiltroFechasUsuario from './SicoeFiltroFechasUsuario'
import SicoeFiltroUbicacionInline from './SicoeFiltroUbicacionInline'
import SicoeItemPickerInline from './SicoeItemPickerInline'
import { fetchSicoeFiltrosOpciones, sicoeOpcionActa, sicoeOpcionSemana } from './sicoeFiltrosApi'
import { API_BASE } from '../../apiBase'
import {
  SICOE_FILTRO_CATEGORIAS,
  SICOE_FILTRO_MODULO,
  sicoeBundleTieneCriteriosUsuario,
  sicoeFiltroCatalogoPorCategoria,
  sicoeFiltroChipResumen,
  sicoeFiltroDef,
  sicoeFiltroFromSnapshot,
  sicoeFiltroSnapshot,
  sicoeFiltroTieneValor,
  sicoeFiltrosActivosKeys,
  sicoeFiltroPatchActivar,
  sicoeFiltroPatchLista,
  sicoeFiltroPatchLimpiar,
  sicoeFiltroValoresLista,
  sicoeFSicoeVacios,
  sicoeTieneFiltroFechasUsuario,
  sicoeTienePkSeleccionado,
} from './sicoeFiltroCatalogo'
import { pptoMatchItemNumero } from '../presupuesto/pptoFiltroCatalogo'

const sicoeCatalogHelpers = {
  filtroValoresLista: sicoeFiltroValoresLista,
  filtroPatchLista: sicoeFiltroPatchLista,
  filtroPatchLimpiar: sicoeFiltroPatchLimpiar,
  filtroPatchActivar: sicoeFiltroPatchActivar,
  matchItemNumero: pptoMatchItemNumero,
}

const cc = {
  sm: 'var(--cc-sm)',
  caption: 'var(--cc-caption)',
  md: 'var(--cc-md)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

export default function SicoeFiltroModal({
  open,
  onClose,
  t,
  contratoId,
  token,
  bundleAplicado,
  onBuscar,
  onLimpiarAplicado,
  buscando = false,
  puedeVerSubcontratista = true,
  estadosReporte = [],
  etiquetasValidacion = [],
  nivelesDisponibles = [1, 2, 3],
  encabezadoPorNivel = {},
  estiloChipCapa,
  avisoCapasY,
  filtroSubcList = [],
  pkList = [],
}) {
  const [tab, setTab] = useState('plantillas')
  const [draftF, setDraftF] = useState(sicoeFSicoeVacios())
  const [draftCapas, setDraftCapas] = useState([])
  const [draftCapasOp, setDraftCapasOp] = useState('and')
  const [capaTemp, setCapaTemp] = useState({ nivel: '', estado: '' })
  const [combCapasPendiente, setCombCapasPendiente] = useState(null)
  const [plantillas, setPlantillas] = useState([])
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)
  const [opciones, setOpciones] = useState({})
  const seccionIds = useMemo(() => SICOE_FILTRO_CATEGORIAS.map((c) => c.id), [])
  const [seccionesAbiertas, setSeccionesAbiertas] = useState(() =>
    Object.fromEntries(seccionIds.map((id) => [id, false])),
  )
  const [usuariosActivos, setUsuariosActivos] = useState([])
  const modalAbiertoPrevRef = useRef(false)

  const catalogoPorCat = sicoeFiltroCatalogoPorCategoria()

  const toggleSeccion = (id) => {
    setSeccionesAbiertas((prev) => {
      if (prev[id]) return Object.fromEntries(seccionIds.map((sid) => [sid, false]))
      return Object.fromEntries(seccionIds.map((sid) => [sid, sid === id]))
    })
  }

  useEffect(() => {
    if (!open) {
      modalAbiertoPrevRef.current = false
      return
    }
    const recienAbierto = !modalAbiertoPrevRef.current
    modalAbiertoPrevRef.current = true
    if (!recienAbierto) return
    const snap = sicoeFiltroFromSnapshot(bundleAplicado)
    setDraftF({ ...snap.fSicoe })
    setDraftCapas(Array.isArray(snap.capasValidacion) ? [...snap.capasValidacion] : [])
    setDraftCapasOp(snap.capasValidacionOp || 'and')
    setCapaTemp({ nivel: '', estado: '' })
    setCombCapasPendiente(null)
    setTab('libre')
    setSeccionesAbiertas(Object.fromEntries(seccionIds.map((sid) => [sid, sid === 'reporte'])))
  }, [open, bundleAplicado, seccionIds])

  const cascadeKey = useMemo(
    () => [draftF.capitulo, draftF.acta_rpo, draftF.semana, draftF.subcontratista_id].join('|'),
    [draftF.capitulo, draftF.acta_rpo, draftF.semana, draftF.subcontratista_id],
  )

  useEffect(() => {
    if (!open || !token || !contratoId) return
    let cancelled = false
    fetch(`${API_BASE}/actas/${contratoId}/usuarios-contrato`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (cancelled) return
        setUsuariosActivos(Array.isArray(rows) ? rows : [])
      })
      .catch(() => { if (!cancelled) setUsuariosActivos([]) })
    return () => { cancelled = true }
  }, [open, token, contratoId])

  useEffect(() => {
    if (!open || !contratoId || !token) return
    let cancelled = false
    const timer = setTimeout(() => {
      fetchSicoeFiltrosOpciones(contratoId, token, {
        capitulo: draftF.capitulo || undefined,
        acta_rpo: draftF.acta_rpo || undefined,
        semana: draftF.semana || undefined,
        subcontratista_id: draftF.subcontratista_id || undefined,
        omitSubcontratistas: !puedeVerSubcontratista,
      })
        .then((data) => { if (!cancelled) setOpciones(data || {}) })
        .catch(() => {})
    }, cascadeKey === '|||' ? 0 : 320)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, contratoId, token, cascadeKey, puedeVerSubcontratista])

  const opcionesResueltas = useMemo(() => {
    const subOpts = (filtroSubcList.length ? filtroSubcList : opciones.subcontratistas || []).map((s) => ({
      value: String(s.id),
      label: s.nombre || String(s.id),
    }))
    return {
      ...opciones,
      subcontratistas_opts: subOpts,
      estados_reporte: estadosReporte.map((e) => ({ value: e, label: e })),
      etiquetas_validacion: etiquetasValidacion.map((e) => ({ value: e, label: e })),
      capitulos: (opciones.capitulos || []).map((c) => ({ value: c, label: c })),
      tramos: (opciones.tramos || []).map((v) => ({ value: v, label: v })),
      costados: (opciones.costados || []).map((v) => ({ value: v, label: v })),
      semanas_opts: (opciones.semanas || [])
        .map(sicoeOpcionSemana)
        .filter(Boolean)
        .sort((a, b) => Number(b.value) - Number(a.value)),
      actas_opts: (opciones.actas || [])
        .map(sicoeOpcionActa)
        .filter(Boolean)
        .sort((a, b) => Number(b.value) - Number(a.value)),
      items_opciones: opciones.items_opciones || [],
    }
  }, [opciones, filtroSubcList, estadosReporte, etiquetasValidacion])

  const nivelMaximo = useMemo(() => {
    const nums = (nivelesDisponibles || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    return nums.length ? Math.max(...nums) : null
  }, [nivelesDisponibles])

  const itemLabels = useMemo(() => {
    const m = {}
    for (const o of opcionesResueltas.items_opciones || []) {
      if (o?.item && o.descripcion) m[o.item] = o.descripcion
    }
    return m
  }, [opcionesResueltas])

  const chipKeys = sicoeFiltrosActivosKeys(draftF, { capasValidacion: draftCapas })
  const tieneCriteriosParaPlantilla =
    chipKeys.some((k) => k !== '_capas' && sicoeFiltroTieneValor(sicoeFiltroDef(k), draftF)) || draftCapas.length > 0

  const cargarPlantillas = useCallback(async () => {
    if (!token) return
    try {
      const rows = await fetchFiltrosPlantillas(token, SICOE_FILTRO_MODULO)
      setPlantillas(Array.isArray(rows) ? rows : [])
    } catch {
      setPlantillas([])
    }
  }, [token])

  useEffect(() => {
    if (open && tab === 'plantillas') void cargarPlantillas()
  }, [open, tab, cargarPlantillas])

  const aplicarPlantilla = (pl) => {
    const snap = sicoeFiltroFromSnapshot(pl?.filtros)
    setDraftF({ ...snap.fSicoe })
    setDraftCapas(snap.capasValidacion || [])
    setDraftCapasOp(snap.capasValidacionOp || 'and')
    setTab('libre')
  }

  const guardarPlantilla = async () => {
    const nombre = String(nombrePlantilla || '').trim()
    if (!nombre || !token) return
    if (!tieneCriteriosParaPlantilla) {
      window.alert('Defina al menos un criterio en «Filtros libres» antes de guardar la plantilla.')
      setTab('libre')
      return
    }
    setGuardandoPlantilla(true)
    try {
      const itemsChips = draftF.items?.length ? [...draftF.items] : sicoeFiltroValoresLista(sicoeFiltroDef('item'), draftF)
      await crearFiltroPlantilla(token, {
        modulo: SICOE_FILTRO_MODULO,
        nombre,
        filtros: sicoeFiltroSnapshot({
          fSicoe: draftF,
          itemsChips,
          itemsOp: draftF.itemsOp,
          capasValidacion: draftCapas,
          capasValidacionOp: draftCapasOp,
          q_observacion: draftF.q_observacion,
          q_nodo: draftF.q_nodo,
        }),
      })
      setNombrePlantilla('')
      await cargarPlantillas()
      window.alert(`Plantilla «${nombre}» guardada.`)
    } catch (e) {
      window.alert(e?.message || 'No se pudo guardar la plantilla.')
    } finally {
      setGuardandoPlantilla(false)
    }
  }

  const eliminarPlantilla = async (id, ev) => {
    ev?.stopPropagation()
    if (!token || !window.confirm('¿Eliminar esta plantilla?')) return
    try {
      await eliminarFiltroPlantilla(token, id)
      await cargarPlantillas()
    } catch {
      window.alert('No se pudo eliminar.')
    }
  }

  const limpiarDraft = () => {
    setDraftF(sicoeFSicoeVacios())
    setDraftCapas([])
    setDraftCapasOp('and')
    setCapaTemp({ nivel: '', estado: '' })
    setCombCapasPendiente(null)
  }

  const ejecutarBuscar = () => {
    const snap = sicoeFiltroSnapshot({
      fSicoe: draftF,
      itemsChips: sicoeFiltroValoresLista(sicoeFiltroDef('item'), draftF),
      itemsOp: draftF.itemsOp,
      capasValidacion: draftCapas,
      capasValidacionOp: draftCapasOp,
      q_observacion: draftF.q_observacion,
      q_nodo: draftF.q_nodo,
    })
    if (!sicoeBundleTieneCriteriosUsuario(snap)) {
      window.alert('Defina al menos un criterio de búsqueda antes de continuar.')
      return
    }
    onBuscar(snap)
    onClose()
  }

  const ejecutarLimpiarTodo = () => {
    onLimpiarAplicado?.()
    limpiarDraft()
    onClose()
  }

  const defsVisibles = (catId) => {
    const defs = catalogoPorCat[catId] || []
    if (catId === 'reporte' && !puedeVerSubcontratista) {
      return defs.filter((d) => d.key !== 'subcontratista_id')
    }
    if (catId === 'ubicacion') {
      return defs.filter((d) => !['tramo', 'costado', 'abs_inicio'].includes(d.key))
    }
    return defs
  }

  if (!open) return null

  const btnSec = {
    background: 'transparent',
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: cc.sm,
    fontWeight: 600,
    color: t.text,
    cursor: 'pointer',
  }

  const itemsLista = sicoeFiltroValoresLista(sicoeFiltroDef('item'), draftF)

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4500,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: cc.pad,
      }}
      onClick={(e) => e.target === e.currentTarget && !buscando && onClose()}
    >
      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          width: 'min(920px, 96vw)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: `${cc.pad} 20px ${cc.padSm}`, borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: cc.md, fontWeight: 800, color: t.primary }}>Filtros de búsqueda</div>
          <div style={{ fontSize: cc.sm, color: t.textMuted, marginTop: 4 }}>
            Configure filtros y pulse Buscar. Los demás criterios pueden conservarse al cerrar; las capas de validación no. Limpiar todo vacía criterios, resultados y capas de validación.
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, padding: '0 12px' }}>
          {[
            ['plantillas', 'Plantillas'],
            ['libre', 'Filtros libres'],
          ].map(([id, label]) => {
            const activo = tab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                style={{
                  padding: '12px 18px',
                  border: 'none',
                  borderBottom: activo ? `3px solid ${t.primary}` : '3px solid transparent',
                  background: 'transparent',
                  color: activo ? t.primary : t.textMuted,
                  fontWeight: activo ? 700 : 500,
                  fontSize: cc.sm,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {tab === 'plantillas' && (
            <div>
              {!plantillas.length ? (
                <p style={{ fontSize: cc.sm, color: t.textMuted }}>Sin plantillas guardadas.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {plantillas.map((pl) => (
                    <div
                      key={pl.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => aplicarPlantilla(pl)}
                      onKeyDown={(e) => e.key === 'Enter' && aplicarPlantilla(pl)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1px solid ${t.border}`,
                        cursor: 'pointer',
                        background: t.bg,
                      }}
                    >
                      <span style={{ fontSize: cc.sm, fontWeight: 600, color: t.text }}>{pl.nombre}</span>
                      <button
                        type="button"
                        onClick={(ev) => eliminarPlantilla(pl.id, ev)}
                        style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 18 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={nombrePlantilla}
                  onChange={(e) => setNombrePlantilla(e.target.value)}
                  placeholder="Nombre de la plantilla…"
                  style={{
                    flex: 1,
                    background: t.inputBg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: cc.sm,
                    color: t.text,
                  }}
                />
                <button
                  type="button"
                  onClick={guardarPlantilla}
                  disabled={guardandoPlantilla || !nombrePlantilla.trim()}
                  style={{ ...btnSec, background: t.primary, color: '#fff', border: 'none' }}
                >
                  Guardar plantilla
                </button>
              </div>
            </div>
          )}

          {tab === 'libre' && (
            <div>
              <p style={{ margin: '0 0 14px', fontSize: cc.caption, color: t.textMuted, fontStyle: 'italic' }}>
                Combine los criterios que necesite. La sección Valores filtra por cantidad y costo directo de cada línea de obra.
              </p>
              {SICOE_FILTRO_CATEGORIAS.map((cat) => {
                const defs = defsVisibles(cat.id)
                if (cat.id === 'fechas') {
                  const abierto = !!seccionesAbiertas.fechas
                  const activos = sicoeTieneFiltroFechasUsuario(draftF) ? 1 : 0
                  return (
                    <div
                      key="fechas"
                      style={{ marginBottom: 10, border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden', background: t.bg }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSeccion('fechas')}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', border: 'none',
                          background: abierto ? `${t.primary}12` : 'transparent', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: cc.caption, fontWeight: 800, color: t.primary }}>
                          FECHAS Y USUARIO{activos ? ' (activo)' : ''}
                        </span>
                        <span style={{ color: t.textMuted }}>{abierto ? '▼' : '▶'}</span>
                      </button>
                      {abierto && (
                        <div style={{ padding: '12px 14px', borderTop: `1px solid ${t.border}` }}>
                          <SicoeFiltroFechasUsuario
                            t={t}
                            f={draftF}
                            onChange={(patch) => setDraftF((prev) => ({ ...prev, ...patch }))}
                            usuarios={usuariosActivos}
                          />
                        </div>
                      )}
                    </div>
                  )
                }
                if (cat.id === 'validacion') {
                  const abierto = !!seccionesAbiertas.validacion
                  const activos = draftCapas.length
                  return (
                    <div
                      key="validacion"
                      style={{ marginBottom: 10, border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden', background: t.bg }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSeccion('validacion')}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', border: 'none',
                          background: abierto ? `${t.primary}12` : 'transparent', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: cc.caption, fontWeight: 800, color: t.primary }}>
                          VALIDACIÓN{activos ? ` (${activos} capa${activos !== 1 ? 's' : ''})` : ''}
                        </span>
                        <span style={{ color: t.textMuted }}>{abierto ? '▼' : '▶'}</span>
                      </button>
                      {abierto && (
                        <div style={{ padding: '12px 14px', borderTop: `1px solid ${t.border}` }}>
                          <SicoeFiltroCapasBlock
                            t={t}
                            capas={draftCapas}
                            capasOp={draftCapasOp}
                            onCapasChange={setDraftCapas}
                            onCapasOpChange={setDraftCapasOp}
                            capaTemp={capaTemp}
                            onCapaTempChange={setCapaTemp}
                            nivelesDisponibles={nivelesDisponibles}
                            encabezadoPorNivel={encabezadoPorNivel}
                            estiloChipCapa={estiloChipCapa}
                            onPedirCombinacion={(nueva) => setCombCapasPendiente(nueva)}
                            avisoCapasY={avisoCapasY}
                            nivelMaximo={nivelMaximo}
                          />
                          {combCapasPendiente && (
                            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgCard }}>
                              <div style={{ fontSize: cc.caption, color: t.textMuted, marginBottom: 8 }}>
                                ¿Cómo combinar la nueva capa con las existentes?
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDraftCapas((p) => [...p, combCapasPendiente])
                                    setDraftCapasOp('and')
                                    setCapaTemp({ nivel: '', estado: '' })
                                    setCombCapasPendiente(null)
                                  }}
                                  style={{ ...btnSec, background: t.primary, color: '#fff', border: 'none' }}
                                >
                                  Y (todas)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDraftCapas((p) => [...p, combCapasPendiente])
                                    setDraftCapasOp('or')
                                    setCapaTemp({ nivel: '', estado: '' })
                                    setCombCapasPendiente(null)
                                  }}
                                  style={{ ...btnSec, background: t.primary, color: '#fff', border: 'none' }}
                                >
                                  O (cualquiera)
                                </button>
                                <button type="button" onClick={() => setCombCapasPendiente(null)} style={btnSec}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                }
                if (cat.id !== 'ubicacion' && !defs.length) return null
                const abierto = !!seccionesAbiertas[cat.id]
                const activosUbicacion =
                  (sicoeFiltroTieneValor(sicoeFiltroDef('tramo'), draftF) ? 1 : 0) +
                  (sicoeFiltroTieneValor(sicoeFiltroDef('costado'), draftF) ? 1 : 0) +
                  (sicoeFiltroTieneValor(sicoeFiltroDef('abs_inicio'), draftF) ? 1 : 0) +
                  (sicoeTienePkSeleccionado(draftF) ? 1 : 0)
                const activosEnSeccion =
                  cat.id === 'ubicacion'
                    ? activosUbicacion
                    : defs.filter((d) => sicoeFiltroTieneValor(d, draftF)).length
                return (
                  <div
                    key={cat.id}
                    style={{ marginBottom: 10, border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden', background: t.bg }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSeccion(cat.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', border: 'none',
                        background: abierto ? `${t.primary}12` : 'transparent', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: cc.caption, fontWeight: 800, color: t.primary }}>
                        {cat.label.toUpperCase()}
                        {activosEnSeccion > 0 ? ` (${activosEnSeccion})` : ''}
                      </span>
                      <span style={{ color: t.textMuted }}>{abierto ? '▼' : '▶'}</span>
                    </button>
                    {abierto && (
                      <div
                        style={{
                          padding: '12px 14px 14px',
                          borderTop: `1px solid ${t.border}`,
                          display: cat.id === 'ubicacion' ? 'block' : 'grid',
                          gridTemplateColumns: cat.id === 'ubicacion' ? undefined : 'repeat(2, minmax(0, 1fr))',
                          gap: cat.id === 'ubicacion' ? undefined : '14px 18px',
                        }}
                      >
                        {cat.id === 'ubicacion' ? (
                          <div>
                            <SicoeFiltroUbicacionInline
                              t={t}
                              token={token}
                              contratoId={contratoId}
                              f={draftF}
                              onChange={(patch) => setDraftF((prev) => ({ ...prev, ...patch }))}
                              opciones={opcionesResueltas}
                              pkList={pkList}
                              catalogHelpers={sicoeCatalogHelpers}
                            />
                          </div>
                        ) : null}
                        {defs.map((def) => (
                          <div key={def.key}>
                            {def.key === 'item' ? (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <label style={{ fontSize: cc.caption, fontWeight: 700, color: t.text }}>{def.label}</label>
                                  {itemsLista.length > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => setDraftF((p) => ({ ...p, ...sicoeFiltroPatchLimpiar(def) }))}
                                      style={{ background: 'transparent', border: 'none', color: t.textMuted, fontSize: cc.caption, cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                      Limpiar
                                    </button>
                                  ) : null}
                                </div>
                                <SicoeItemPickerInline
                                  t={t}
                                  contratoId={contratoId}
                                  token={token}
                                  lista={itemsLista}
                                  onChangeLista={(next) =>
                                    setDraftF((prev) => ({
                                      ...prev,
                                      ...sicoeFiltroPatchLista(def, next),
                                      ...sicoeFiltroPatchActivar(def),
                                    }))
                                  }
                                  itemLabels={itemLabels}
                                  acta_rpo={draftF.acta_rpo}
                                  capitulo={draftF.capitulo}
                                  semana={draftF.semana}
                                  opcionesLocales={opcionesResueltas.items_opciones}
                                />
                              </div>
                            ) : (
                              <PptoFiltroCampo
                                def={def}
                                f={draftF}
                                onChange={(patch) => setDraftF((prev) => ({ ...prev, ...patch }))}
                                t={t}
                                opciones={opcionesResueltas}
                                itemLabels={itemLabels}
                                catalogHelpers={sicoeCatalogHelpers}
                              />
                            )}
                            {def.key === 'item' && itemsLista.length >= 2 && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: cc.caption, color: t.textMuted, fontWeight: 700 }}>Combinar ítems:</span>
                                {['and', 'or'].map((op) => (
                                  <button
                                    key={op}
                                    type="button"
                                    onClick={() => setDraftF((p) => ({ ...p, itemsOp: op }))}
                                    style={{
                                      fontSize: cc.caption, fontWeight: 800, padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                                      border: `1px solid ${draftF.itemsOp === op ? t.primary : t.border}`,
                                      background: draftF.itemsOp === op ? `${t.primary}18` : t.bg,
                                      color: draftF.itemsOp === op ? t.primary : t.textMuted,
                                    }}
                                  >
                                    {op === 'and' ? 'Y (misma línea)' : 'O (cualquiera)'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${t.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <button type="button" onClick={ejecutarLimpiarTodo} disabled={buscando} style={{ ...btnSec, color: t.textMuted }}>
            Limpiar todo
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} disabled={buscando} style={btnSec}>Cancelar</button>
            <button
              type="button"
              onClick={ejecutarBuscar}
              disabled={buscando}
              style={{ ...btnSec, background: t.primary, color: '#fff', border: 'none', fontWeight: 700 }}
            >
              {buscando ? '⏳ Buscando…' : 'Buscar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
