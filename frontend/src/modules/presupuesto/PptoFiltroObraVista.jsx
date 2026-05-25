import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PptoFiltroMapaPk from './PptoFiltroMapaPk'
import {
  PPTO_FILTRO_CATEGORIAS,
  PPTO_FILTRO_MODULO,
  pptoFiltroCatalogoPorCategoria,
  pptoFiltroChipResumen,
  pptoFiltroDef,
  pptoFiltroFromSnapshot,
  pptoFiltroPatchActivar,
  pptoFiltroPatchLimpiar,
  pptoFiltroPatchLista,
  pptoFiltroSnapshot,
  pptoFiltrosActivosKeys,
  pptoFiltroTieneValor,
  pptoFiltroValoresLista,
  pptoMergeItemsOpciones,
  pptoMatchItemNumero,
} from './pptoFiltroCatalogo'
import {
  crearFiltroPlantilla,
  eliminarFiltroPlantilla,
  fetchFiltrosPlantillas,
  fetchPresupuestoFiltrosOpciones,
} from './filtrosPlantillasApi'

const inp = (t) => ({
  background: t.inputBg,
  border: `1px solid ${t.border}`,
  borderRadius: 5,
  padding: '4px 8px',
  color: t.text,
  fontSize: 'var(--cc-sm)',
  minWidth: 0,
  lineHeight: 1.25,
  width: '100%',
  boxSizing: 'border-box',
})

function useClickOutside(ref, onClose) {
  useEffect(() => {
    function h(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, onClose])
}

function ItemFiltroPicker({ opts, draftLista, onAdd, t }) {
  const [busq, setBusq] = useState('')
  const [open, setOpen] = useState(true)
  const wrapRef = useRef(null)

  useEffect(() => {
    function h(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const disponibles = useMemo(
    () => opts.filter((o) => !draftLista.some((v) => pptoMatchItemNumero(v, o.value))),
    [opts, draftLista],
  )

  const filtrados = useMemo(() => {
    const q = busq.trim().toLowerCase()
    const base = q
      ? disponibles.filter(
          (o) =>
            o.value.toLowerCase().includes(q) ||
            (o.descripcion || '').toLowerCase().includes(q),
        )
      : disponibles
    return base.slice(0, 80)
  }, [disponibles, busq])

  const pick = (val) => {
    if (!val || draftLista.some((v) => pptoMatchItemNumero(v, val))) return
    onAdd(val)
    setBusq('')
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginBottom: 4 }}>
      <input
        value={busq}
        onChange={(e) => { setBusq(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar ítem por número o descripción…"
        style={{ ...inp(t), width: '100%' }}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtrados[0]) { e.preventDefault(); pick(filtrados[0].value) }
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 70,
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: t.shadow || '0 8px 24px rgba(0,0,0,0.18)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {filtrados.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 'var(--cc-caption)', color: t.textMuted }}>
              {busq.trim() ? 'Sin coincidencias' : 'No hay ítems disponibles'}
            </div>
          ) : (
            filtrados.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${t.border}44`,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  color: t.text,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${t.primary}12` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.primary }}>{o.value}</div>
                {o.descripcion ? (
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.35, marginTop: 2, wordBreak: 'break-word', whiteSpace: 'normal' }}>
                    {o.descripcion}
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontStyle: 'italic', marginTop: 2 }}>
                    Sin descripción en listado
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 4 }}>
        {disponibles.length} ítem{disponibles.length !== 1 ? 's' : ''} disponible{disponibles.length !== 1 ? 's' : ''}. Clic para agregar al filtro.
      </div>
    </div>
  )
}

function FiltroChipEditor({ def, f, t, opciones, itemLabels, onApply, onClose }) {
  const [draftLista, setDraftLista] = useState(() => pptoFiltroValoresLista(def, f))
  const [draftRango, setDraftRango] = useState(() => ({
    a: f[def.campoFObra] || '',
    b: f[def.campoFObraHasta] || '',
  }))
  const [draftTexto, setDraftTexto] = useState(() => String(f[def.campoFObra] || ''))
  const [draftBool, setDraftBool] = useState(() => {
    const v = f[def.campoFObra]
    return v === true || v === 'true' ? 'true' : v === false || v === 'false' ? 'false' : ''
  })
  const [pickVal, setPickVal] = useState('')

  const optsRaw = def.opcionesKey ? (opciones[def.opcionesKey] || []) : []
  const opts = def.key === 'item'
    ? (opciones.items_opciones || []).map((o) => ({
        value: String(o.item ?? o.value ?? ''),
        descripcion: String(o.descripcion ?? '').trim(),
        label: o.descripcion ? `${o.item} — ${o.descripcion}` : String(o.item ?? o.label ?? ''),
      }))
    : optsRaw.map((o) => ({ value: String(o), label: String(o) }))

  const apply = () => {
    if (def.tipo === 'rango_numerico' || def.key === 'abs_inicio') {
      onApply({ [def.campoFObra]: draftRango.a, [def.campoFObraHasta]: draftRango.b, ...pptoFiltroPatchActivar(def) })
    } else if (def.tipo === 'select_multi' || def.key === 'item') {
      onApply({ ...pptoFiltroPatchLista(def, draftLista), ...pptoFiltroPatchActivar(def) })
    } else if (def.tipo === 'boolean') {
      onApply({
        [def.campoFObra]: draftBool === 'true' ? true : draftBool === 'false' ? false : '',
        ...pptoFiltroPatchActivar(def),
      })
    } else if (def.tipo === 'text') {
      onApply({ [def.campoFObra]: draftTexto, ...pptoFiltroPatchActivar(def) })
    } else {
      onApply({ [def.campoFObra]: pickVal || draftTexto, ...pptoFiltroPatchActivar(def) })
    }
    onClose()
  }

  const limpiarValores = () => {
    if (def.tipo === 'select_multi' || def.key === 'item') setDraftLista([])
    else if (def.tipo === 'rango_numerico' || def.key === 'abs_inicio') setDraftRango({ a: '', b: '' })
    else if (def.tipo === 'boolean') setDraftBool('')
    else setDraftTexto('')
    setPickVal('')
  }

  const agregarValor = () => {
    const v = String(pickVal || '').trim()
    if (!v || draftLista.includes(v)) return
    setDraftLista((prev) => [...prev, v])
    setPickVal('')
  }

  const tagStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: t.primary + '18',
    border: `1px solid ${t.primary}44`,
    borderRadius: 12,
    padding: '2px 8px',
    fontSize: 'var(--cc-caption)',
    color: t.text,
  }

  return (
    <div style={{ padding: 8, minWidth: 240, maxWidth: def.key === 'item' ? 380 : 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>{def.label}</div>
        <button type="button" onClick={limpiarValores} style={{ background: 'transparent', border: 'none', color: t.textMuted, fontSize: 'var(--cc-caption)', cursor: 'pointer', textDecoration: 'underline' }}>
          Limpiar valores
        </button>
      </div>

      {(def.tipo === 'select_multi' || def.key === 'item') && (
        <>
          {draftLista.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {draftLista.map((v) => (
                <span key={v} style={tagStyle}>
                  {def.key === 'item' ? (itemLabels?.[v] || v) : v}
                  <button type="button" onClick={() => setDraftLista((prev) => prev.filter((x) => x !== v))} style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 0, lineHeight: 1 }} aria-label={`Quitar ${v}`}>×</button>
                </span>
              ))}
            </div>
          )}
          {def.key === 'item' ? (
            <ItemFiltroPicker
              opts={opts}
              draftLista={draftLista}
              onAdd={(val) => setDraftLista((prev) => (prev.includes(val) ? prev : [...prev, val]))}
              t={t}
            />
          ) : (
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <select value={pickVal} onChange={(e) => setPickVal(e.target.value)} style={{ ...inp(t), flex: 1 }} autoFocus>
                <option value="">— Agregar valor —</option>
                {opts.filter((o) => !draftLista.includes(o.value)).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button type="button" onClick={agregarValor} disabled={!pickVal} style={{ ...inp(t), width: 'auto', cursor: pickVal ? 'pointer' : 'default', fontWeight: 700, color: t.primary, borderColor: t.primary }}>
                +
              </button>
            </div>
          )}
          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Puede agregar varios valores al mismo filtro.</div>
        </>
      )}

      {(def.tipo === 'rango_numerico' || def.key === 'abs_inicio') && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <input value={draftRango.a} onChange={(e) => setDraftRango((d) => ({ ...d, a: e.target.value }))} placeholder="Desde" style={inp(t)} autoFocus />
          <span style={{ color: t.textMuted }}>–</span>
          <input value={draftRango.b} onChange={(e) => setDraftRango((d) => ({ ...d, b: e.target.value }))} placeholder="Hasta" style={inp(t)} />
        </div>
      )}

      {def.tipo === 'text' && (
        <input value={draftTexto} onChange={(e) => setDraftTexto(e.target.value)} style={inp(t)} autoFocus onKeyDown={(e) => e.key === 'Enter' && apply()} />
      )}

      {def.tipo === 'select' && (
        <select value={pickVal || draftTexto} onChange={(e) => { setPickVal(e.target.value); setDraftTexto(e.target.value) }} style={inp(t)} autoFocus>
          <option value="">— Todos —</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {def.tipo === 'boolean' && (
        <select value={draftBool} onChange={(e) => setDraftBool(e.target.value)} style={inp(t)} autoFocus>
          <option value="">—</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
        <button type="button" onClick={onClose} style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 5, padding: '4px 10px', fontSize: 'var(--cc-caption)', cursor: 'pointer', color: t.textMuted }}>
          Cancelar
        </button>
        <button type="button" onClick={apply} style={{ background: t.primary, color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 'var(--cc-caption)', fontWeight: 700, cursor: 'pointer' }}>
          Aplicar
        </button>
      </div>
    </div>
  )
}

/**
 * Barra compacta de filtros tipo chips + plantillas. Reemplaza la UI rígida anterior.
 */
export default function PptoFiltroObraVista({
  t,
  contratoId,
  token,
  f,
  onF,
  onBuscar,
  onLimpiar,
  filtroResetKey = 0,
  onRestablecerPksItem,
  onRevisorTramos,
  semaforo,
  barraResumen,
  buscando,
  onActualizar,
  actualizarDisabled,
  onMapPkPick,
  onExportarExcel,
  exportandoExcel,
  pkIdsDeGrilla,
  mostrarToggleTipoEjecucion = false,
  onTipoEjecucionChange,
  mostrarVersionador = false,
  esVersionInicial = true,
  onAbrirCrearVersion,
  onAbrirPanelVersiones,
  tramoOptions: _tramoOptions,
  calzadaOptions: _calzadaOptions,
  listadoPrecios = [],
}) {
  const [activeKeys, setActiveKeys] = useState([])
  const [menuFiltroOpen, setMenuFiltroOpen] = useState(false)
  const [menuPlantillasOpen, setMenuPlantillasOpen] = useState(false)
  const [chipEditKey, setChipEditKey] = useState(null)
  const [mapaOpen, setMapaOpen] = useState(false)
  const [plantillas, setPlantillas] = useState([])
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [opciones, setOpciones] = useState({})
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)

  const menuFiltroRef = useRef(null)
  const menuPlantillasRef = useRef(null)
  const chipEditRef = useRef(null)
  const mapPkSelRef = useRef('')

  useClickOutside(menuFiltroRef, () => setMenuFiltroOpen(false))
  useClickOutside(menuPlantillasRef, () => setMenuPlantillasOpen(false))
  useClickOutside(chipEditRef, () => setChipEditKey(null))

  useEffect(() => {
    setActiveKeys([])
    setChipEditKey(null)
    mapPkSelRef.current = ''
  }, [filtroResetKey])

  const catalogoPorCat = pptoFiltroCatalogoPorCategoria()
  const tipoEjecucionActivo = f.tipoEjecucion || 'Presupuesto de Obra'

  const hayFiltroFinoPks = !!(
    (f.pkCriterio && String(f.pkCriterio).trim()) ||
    (f.idPol && String(f.idPol).trim()) ||
    (f.texto && String(f.texto).trim())
  )
  const hayCap = !!(f.cap && String(f.cap).trim())

  const chipKeys = pptoFiltrosActivosKeys(f, activeKeys)

  const opcionesConItems = useMemo(() => {
    const base = opciones || {}
    const fromApi = Array.isArray(base.items_opciones) ? base.items_opciones : []
    const fromLp = (listadoPrecios || [])
      .filter((p) => {
        if (!f.cap && !(f.caps?.length)) return true
        const caps = f.caps?.length ? f.caps : (f.cap ? [f.cap] : [])
        return !caps.length || caps.includes(p.capitulo)
      })
      .map((p) => ({ item: p.item_numero, descripcion: p.descripcion }))
    return { ...base, items_opciones: pptoMergeItemsOpciones(fromApi, fromLp) }
  }, [opciones, listadoPrecios, f.cap, f.caps])

  const itemLabels = useMemo(() => {
    const m = {}
    for (const o of opcionesConItems.items_opciones || []) {
      const num = String(o.item ?? '').trim()
      if (!num) continue
      const desc = String(o.descripcion ?? '').trim()
      m[num] = desc ? `${num} — ${desc}` : num
    }
    for (const p of listadoPrecios || []) {
      const num = String(p.item_numero ?? '').trim()
      if (!num) continue
      const desc = String(p.descripcion ?? '').trim()
      const key = Object.keys(m).find((k) => pptoMatchItemNumero(k, num)) || num
      if (!m[key] || (desc && !String(m[key]).includes('—'))) {
        m[key] = desc ? `${num} — ${desc}` : num
      }
    }
    return m
  }, [listadoPrecios, opcionesConItems.items_opciones])

  useEffect(() => {
    mapPkSelRef.current = String(f.pkCriterio || '').trim()
  }, [f.pkCriterio])

  useEffect(() => {
    if (!contratoId || !token) return
    let cancelled = false
    fetchPresupuestoFiltrosOpciones(contratoId, token, {
      capitulo: f.cap || undefined,
      item: f.item || undefined,
      tramo: f.tramo || undefined,
      calzada: f.calzada || undefined,
    })
      .then((data) => {
        if (!cancelled) setOpciones(data || {})
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [contratoId, token, f.cap, f.item, f.tramo, f.calzada])

  const cargarPlantillas = useCallback(async () => {
    if (!token) return
    try {
      const rows = await fetchFiltrosPlantillas(token, PPTO_FILTRO_MODULO)
      setPlantillas(Array.isArray(rows) ? rows : [])
    } catch {
      setPlantillas([])
    }
  }, [token])

  useEffect(() => {
    if (menuPlantillasOpen) void cargarPlantillas()
  }, [menuPlantillasOpen, cargarPlantillas])

  const activarFiltro = (key) => {
    const def = pptoFiltroDef(key)
    if (!def) return
    setActiveKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
    onF(pptoFiltroPatchActivar(def))
    setMenuFiltroOpen(false)
    setChipEditKey(key)
  }

  const removerFiltro = (key) => {
    const def = pptoFiltroDef(key)
    setActiveKeys((prev) => prev.filter((k) => k !== key))
    onF(pptoFiltroPatchLimpiar(def))
    if (key === 'pk_id') mapPkSelRef.current = ''
    setChipEditKey(null)
  }

  const limpiarTodo = () => {
    setActiveKeys([])
    setChipEditKey(null)
    mapPkSelRef.current = ''
    onLimpiar()
  }

  const guardarPlantilla = async () => {
    const nombre = String(nombrePlantilla || '').trim()
    if (!nombre || !token) return
    if (!chipKeys.some((k) => pptoFiltroTieneValor(pptoFiltroDef(k), f))) {
      window.alert('Configure al menos un filtro con valor antes de guardar la plantilla (clic en el chip → Aplicar).')
      return
    }
    setGuardandoPlantilla(true)
    try {
      await crearFiltroPlantilla(token, {
        modulo: PPTO_FILTRO_MODULO,
        nombre,
        filtros: pptoFiltroSnapshot(f, chipKeys),
      })
      setNombrePlantilla('')
      await cargarPlantillas()
      window.alert(`Plantilla «${nombre}» guardada. Ábrala desde la lista para reutilizarla.`)
    } catch (e) {
      window.alert(e?.message || 'No se pudo guardar la plantilla.')
    } finally {
      setGuardandoPlantilla(false)
    }
  }

  const aplicarPlantilla = (pl) => {
    const { fObra, activeKeys: keys } = pptoFiltroFromSnapshot(pl?.filtros)
    setActiveKeys(keys)
    onF(fObra)
    setMenuPlantillasOpen(false)
    mapPkSelRef.current = String(fObra.pkCriterio || '').trim()
    if (typeof onBuscar === 'function') onBuscar(fObra)
  }

  const eliminarPlantilla = async (id, ev) => {
    ev.stopPropagation()
    if (!token || !window.confirm('¿Eliminar esta plantilla?')) return
    try {
      await eliminarFiltroPlantilla(token, id)
      await cargarPlantillas()
    } catch {
      window.alert('No se pudo eliminar.')
    }
  }

  const onPkFromMap = useCallback(
    (pkVal) => {
      const v = String(pkVal || '').trim()
      if (!v) return
      mapPkSelRef.current = v
      setActiveKeys((prev) => (prev.includes('pk_id') ? prev : [...prev, 'pk_id']))
      if (onMapPkPick) onMapPkPick(v)
    },
    [onMapPkPick]
  )

  const onMapClearPk = useCallback(() => {
    mapPkSelRef.current = ''
    setActiveKeys((prev) => prev.filter((k) => k !== 'pk_id'))
    onF({ pkCriterio: '' })
  }, [onF])

  const popover = (children, ref) => (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 4,
        zIndex: 60,
        background: t.bgCard,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        boxShadow: t.shadow,
      }}
    >
      {children}
    </div>
  )

  const btnSec = {
    background: 'transparent',
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 'var(--cc-caption)',
    fontWeight: 600,
    color: t.text,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 25,
        marginBottom: 10,
        background: t.bgCard,
        borderRadius: 8,
        boxShadow: t.shadow,
        border: `1px solid ${t.border}`,
        padding: '6px 10px',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, rowGap: 6 }}>
        {/* Plantillas */}
        <div style={{ position: 'relative' }} ref={menuPlantillasRef}>
          <button type="button" onClick={() => setMenuPlantillasOpen((o) => !o)} style={btnSec}>
            Plantillas
          </button>
          {menuPlantillasOpen &&
            popover(
              <div style={{ padding: 8, minWidth: 260, maxWidth: 320 }}>
                {!plantillas.length ? (
                  <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 8 }}>Sin plantillas guardadas</div>
                ) : (
                  <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 8 }}>
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
                          gap: 6,
                          padding: '6px 8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 'var(--cc-sm)',
                          color: t.text,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = t.bg
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.nombre}</span>
                        <button
                          type="button"
                          onClick={(ev) => eliminarPlantilla(pl.id, ev)}
                          style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
                          title="Eliminar plantilla"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, borderTop: `1px solid ${t.border}`, paddingTop: 8, flexDirection: 'column' }}>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.35 }}>
                    1) Configure filtros (+ Filtro → clic chip → Aplicar). 2) Escriba nombre. 3) Guardar.
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={nombrePlantilla}
                    onChange={(e) => setNombrePlantilla(e.target.value)}
                    placeholder="Nombre plantilla…"
                    style={{ ...inp(t), flex: 1 }}
                    onKeyDown={(e) => e.key === 'Enter' && guardarPlantilla()}
                  />
                  <button
                    type="button"
                    onClick={guardarPlantilla}
                    disabled={guardandoPlantilla || !nombrePlantilla.trim()}
                    style={{ ...btnSec, background: t.primary, color: '#fff', border: 'none', opacity: guardandoPlantilla ? 0.7 : 1 }}
                  >
                    Guardar
                  </button>
                  </div>
                </div>
              </div>,
              menuPlantillasRef
            )}
        </div>

        <button type="button" onClick={limpiarTodo} style={{ ...btnSec, color: t.textMuted }}>
          Limpiar
        </button>
        <button
          type="button"
          onClick={() => onBuscar?.(f)}
          disabled={buscando}
          style={{ ...btnSec, background: t.primary, color: '#fff', border: 'none', fontWeight: 700, cursor: buscando ? 'wait' : 'pointer' }}
        >
          {buscando ? '⏳…' : 'Buscar'}
        </button>

        {/* Mapa PK */}
        <button
          type="button"
          onClick={() => setMapaOpen(true)}
          title="Plano PK"
          style={{ ...btnSec, padding: '5px 8px' }}
        >
          🗺️
        </button>

        {mostrarToggleTipoEjecucion && typeof onTipoEjecucionChange === 'function' && (
          <div
            role="group"
            aria-label="Tipo de ejecución"
            style={{ display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}
          >
            {[
              ['Presupuesto de Obra', 'Presupuesto de Obra'],
              ['Obra Ejecutada', 'Obra Ejecutada'],
            ].map(([valor, etiqueta], idx) => {
              const activo = tipoEjecucionActivo === valor
              return (
                <button
                  key={valor}
                  type="button"
                  onClick={() => onTipoEjecucionChange(valor)}
                  disabled={buscando}
                  style={{
                    background: activo ? t.primary : t.bg,
                    color: activo ? '#fff' : t.textMuted,
                    border: 'none',
                    borderRight: idx === 0 ? `1px solid ${t.border}` : 'none',
                    padding: '5px 10px',
                    fontSize: 'var(--cc-caption)',
                    fontWeight: activo ? 700 : 500,
                    cursor: buscando ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {etiqueta}
                </button>
              )
            })}
          </div>
        )}

        {barraResumen != null && (
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, whiteSpace: 'nowrap' }}>{barraResumen}</div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {typeof onActualizar === 'function' && (
            <button type="button" onClick={onActualizar} disabled={!!actualizarDisabled} title="Recarga capítulos y datos del filtro actual" style={{ ...btnSec, border: 'none', color: '#94a3b8', opacity: actualizarDisabled ? 0.5 : 0.92 }}>
              🔄 Actualizar
            </button>
          )}
          {typeof onExportarExcel === 'function' && (
            <button type="button" onClick={onExportarExcel} disabled={!!exportandoExcel} style={{ ...btnSec, background: '#0077B618', borderColor: '#0077B6', color: '#0077B6', fontWeight: 700 }}>
              {exportandoExcel ? '⏳…' : '📥 Excel'}
            </button>
          )}
          {onRestablecerPksItem && hayFiltroFinoPks && hayCap && (
            <button type="button" onClick={onRestablecerPksItem} disabled={buscando} style={{ ...btnSec, background: '#0D948820', borderColor: '#0D9488', color: '#0D9488', fontWeight: 700 }}>
              Ver PK
            </button>
          )}
          <button type="button" onClick={onRevisorTramos} style={{ ...btnSec, background: '#0D948820', borderColor: '#0D9488', color: '#0D9488', fontWeight: 700 }}>
            🛣️ Tramos
          </button>
          {mostrarVersionador && typeof onAbrirCrearVersion === 'function' && (
            <button
              type="button"
              onClick={onAbrirCrearVersion}
              style={{
                ...btnSec,
                background: esVersionInicial ? t.primary : `${t.primary}18`,
                color: esVersionInicial ? '#fff' : t.primary,
                borderColor: t.primary,
                fontWeight: 800,
              }}
            >
              {esVersionInicial ? 'Crear versión inicial' : 'Nueva versión'}
            </button>
          )}
          {mostrarVersionador && typeof onAbrirPanelVersiones === 'function' && (
            <button type="button" onClick={onAbrirPanelVersiones} style={btnSec}>
              Versiones
            </button>
          )}
        </div>
      </div>

      {/* Fila inferior: filtros activos */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          rowGap: 6,
          marginTop: 6,
          paddingTop: 6,
          borderTop: `1px solid ${t.border}`,
        }}
      >
        <div style={{ position: 'relative' }} ref={menuFiltroRef}>
          <button type="button" onClick={() => setMenuFiltroOpen((o) => !o)} style={{ ...btnSec, fontWeight: 700, color: t.primary, borderColor: t.primary }}>
            + Filtro
          </button>
          {menuFiltroOpen &&
            popover(
              <div style={{ padding: 8, maxHeight: 360, overflow: 'auto', minWidth: 220 }}>
                {PPTO_FILTRO_CATEGORIAS.map((cat) => {
                  const defs = catalogoPorCat[cat.id] || []
                  if (!defs.length) return null
                  return (
                    <div key={cat.id} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 800, color: t.textMuted, marginBottom: 4 }}>{cat.label}</div>
                      {defs.map((def) => (
                        <button
                          key={def.key}
                          type="button"
                          disabled={chipKeys.includes(def.key)}
                          onClick={() => activarFiltro(def.key)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            background: chipKeys.includes(def.key) ? t.primary + '15' : 'transparent',
                            border: 'none',
                            borderRadius: 4,
                            padding: '5px 8px',
                            fontSize: 'var(--cc-sm)',
                            color: chipKeys.includes(def.key) ? t.textMuted : t.text,
                            cursor: chipKeys.includes(def.key) ? 'default' : 'pointer',
                          }}
                        >
                          {def.label}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>,
              menuFiltroRef
            )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', flex: '1 1 160px', minWidth: 0 }}>
          {chipKeys.length === 0 ? (
            <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontStyle: 'italic' }}>
              Sin filtros adicionales — el toggle ya define la búsqueda; use + Filtro para acotar o pulse Buscar
            </span>
          ) : chipKeys.map((key) => {
            const def = pptoFiltroDef(key)
            if (!def) return null
            const resumen = pptoFiltroChipResumen(def, f, itemLabels)
            const vacio = !pptoFiltroTieneValor(def, f)
            return (
              <div key={key} style={{ position: 'relative' }} ref={chipEditKey === key ? chipEditRef : null}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: vacio ? t.bg : t.primary + '18',
                    border: `1px solid ${vacio ? t.border : t.primary}`,
                    borderRadius: 16,
                    padding: '2px 4px 2px 10px',
                    fontSize: 'var(--cc-caption)',
                    color: t.text,
                    maxWidth: 260,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setChipEditKey((k) => (k === key ? null : key))}
                    style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: t.text, fontSize: 'inherit', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 210 }}
                    title={`${def.label}: ${resumen}`}
                  >
                    <strong>{def.label}:</strong> {resumen}
                  </button>
                  <button
                    type="button"
                    onClick={() => removerFiltro(key)}
                    aria-label={`Quitar ${def.label}`}
                    style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px' }}
                  >
                    ×
                  </button>
                </span>
                {chipEditKey === key &&
                  popover(
                    <FiltroChipEditor
                      def={def}
                      f={f}
                      t={t}
                      itemLabels={itemLabels}
                      opciones={{
                        ...opcionesConItems,
                        tramos: opcionesConItems.tramos || _tramoOptions || [],
                        calzadas: opcionesConItems.calzadas || _calzadaOptions || [],
                        revisados: (opcionesConItems.revisados?.length ? opcionesConItems.revisados : (semaforo || []).map((o) => o.valor)),
                        pre_interv_estados: opcionesConItems.pre_interv_estados?.length
                          ? opcionesConItems.pre_interv_estados
                          : (semaforo || []).map((o) => o.valor),
                      }}
                      onApply={(patch) => onF(patch)}
                      onClose={() => setChipEditKey(null)}
                    />,
                    chipEditRef
                  )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Drawer mapa PK */}
      {mapaOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setMapaOpen(false)}
        >
          <div
            style={{
              width: 'min(480px, 92vw)',
              height: '100%',
              background: t.bgCard,
              borderLeft: `1px solid ${t.border}`,
              boxShadow: t.shadow,
              display: 'flex',
              flexDirection: 'column',
              padding: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text }}>Plano · PK</div>
              <button type="button" onClick={() => setMapaOpen(false)} style={{ ...btnSec, padding: '4px 10px' }}>
                Cerrar
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <PptoFiltroMapaPk
                t={t}
                token={token}
                contratoId={contratoId}
                onPkPick={onPkFromMap}
                pkIdsDeGrilla={pkIdsDeGrilla}
                selectedPk={mapPkSelRef.current || f.pkCriterio}
                onClearSelection={onMapClearPk}
                height="100%"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
