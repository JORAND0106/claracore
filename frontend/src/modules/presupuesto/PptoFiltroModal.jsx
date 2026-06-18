import { useCallback, useEffect, useMemo, useState } from 'react'
import PptoFiltroCampo from './PptoFiltroCampo'
import {
  PPTO_FILTRO_CATEGORIAS,
  PPTO_FILTRO_MODULO,
  pptoFiltroCatalogoPorCategoria,
  pptoFiltroFromSnapshot,
  pptoFiltroSnapshot,
  pptoFiltroTieneValor,
  pptoFiltroDef,
  pptoFiltroChipResumen,
  pptoFiltrosActivosKeys,
  pptoCmpItemNumero,
} from './pptoFiltroCatalogo'
import {
  crearFiltroPlantilla,
  eliminarFiltroPlantilla,
  fetchFiltrosPlantillas,
  fetchPresupuestoFiltrosOpciones,
} from './filtrosPlantillasApi'
const cc = {
  sm: 'var(--cc-sm)',
  caption: 'var(--cc-caption)',
  md: 'var(--cc-md)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

export default function PptoFiltroModal({
  open,
  onClose,
  t,
  contratoId,
  token,
  fAplicado,
  tipoEjecucionActivo,
  onBuscar,
  onLimpiarAplicado,
  listadoPrecios = [],
  registrosGrilla = [],
  tramoOptions = [],
  calzadaOptions = [],
  semaforo = [],
  buscando = false,
}) {
  const [tab, setTab] = useState('plantillas')
  const [draftF, setDraftF] = useState(fAplicado)
  const [plantillas, setPlantillas] = useState([])
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)
  const [opciones, setOpciones] = useState({})
  const seccionIds = useMemo(() => PPTO_FILTRO_CATEGORIAS.map((c) => c.id), [])
  const [seccionesAbiertas, setSeccionesAbiertas] = useState(() =>
    Object.fromEntries(seccionIds.map((id) => [id, id === 'item'])),
  )

  const catalogoPorCat = pptoFiltroCatalogoPorCategoria()

  const toggleSeccion = (id) => {
    setSeccionesAbiertas((prev) => {
      if (prev[id]) return Object.fromEntries(seccionIds.map((sid) => [sid, false]))
      return Object.fromEntries(seccionIds.map((sid) => [sid, sid === id]))
    })
  }

  useEffect(() => {
    if (!open) return
    setDraftF({ ...fAplicado })
    setTab('plantillas')
    setSeccionesAbiertas(Object.fromEntries(seccionIds.map((sid) => [sid, sid === 'item'])))
  }, [open, fAplicado, seccionIds])

  const cascadeKey = useMemo(() => {
    const capSingle = draftF.caps?.length === 1 ? draftF.caps[0] : (draftF.cap || '')
    const compSingle = draftF.competencias?.length === 1
      ? draftF.competencias[0]
      : (draftF.competencia || '')
    return [capSingle, compSingle, draftF.tramo || '', draftF.calzada || ''].join('|')
  }, [draftF.cap, draftF.caps, draftF.competencia, draftF.competencias, draftF.tramo, draftF.calzada])

  useEffect(() => {
    if (!open || !contratoId || !token) return
    let cancelled = false
    const capSingle = draftF.caps?.length === 1 ? draftF.caps[0] : (draftF.cap || undefined)
    const timer = setTimeout(() => {
      fetchPresupuestoFiltrosOpciones(contratoId, token, {
        capitulo: capSingle,
        tramo: draftF.tramo || undefined,
        calzada: draftF.calzada || undefined,
        tipo_ejecucion: tipoEjecucionActivo,
      })
        .then((data) => { if (!cancelled) setOpciones(data || {}) })
        .catch(() => {})
    }, cascadeKey === '|||' ? 0 : 320)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, contratoId, token, tipoEjecucionActivo, cascadeKey])

  const opcionesConItems = useMemo(() => {
    const base = opciones || {}
    const capsSel = draftF.caps?.length ? draftF.caps : (draftF.cap ? [draftF.cap] : [])
    const compSel = draftF.competencias?.length === 1
      ? draftF.competencias[0]
      : (draftF.competencia || '')
    const compsSel = draftF.competencias?.length
      ? draftF.competencias
      : (compSel ? [compSel] : [])

    const itemsFromGrilla = () => {
      if (!capsSel.length || !(registrosGrilla || []).length) return []
      const seen = new Map()
      for (const r of registrosGrilla) {
        const cap = String(r.capitulo ?? '').trim()
        const item = String(r.item ?? '').trim()
        const comp = String(r.competencia ?? '').trim()
        if (!item || !capsSel.includes(cap)) continue
        if (compsSel.length && !compsSel.includes(comp)) continue
        if (!seen.has(item)) {
          seen.set(item, String(r.descripcion ?? r.item_descripcion ?? '').trim())
        }
      }
      return [...seen.entries()]
        .map(([item, descripcion]) => ({ item, descripcion }))
        .sort((a, b) => pptoCmpItemNumero(a.item, b.item))
    }

    const fromLp = capsSel.length
      ? (listadoPrecios || [])
        .filter((p) => capsSel.includes(p.capitulo))
        .map((p) => ({ item: p.item_numero, descripcion: p.descripcion }))
        .filter((o) => o.item)
        .sort((a, b) => pptoCmpItemNumero(a.item, b.item))
      : []

    const itemsGrilla = itemsFromGrilla()
    const items_opciones = itemsGrilla.length ? itemsGrilla : fromLp

    const capitulos = base.capitulos?.length
      ? base.capitulos
      : [...new Set((listadoPrecios || []).map((p) => p.capitulo).filter(Boolean))]
    return { ...base, capitulos, items_opciones, items: [] }
  }, [opciones, listadoPrecios, registrosGrilla, draftF.cap, draftF.caps, draftF.competencia, draftF.competencias])

  const opcionesResueltas = useMemo(
    () => ({
      ...opcionesConItems,
      tramos: opcionesConItems.tramos || tramoOptions || [],
      calzadas: opcionesConItems.calzadas || calzadaOptions || [],
      revisados: opcionesConItems.revisados?.length
        ? opcionesConItems.revisados
        : (semaforo || []).map((o) => o.valor),
      pre_interv_estados: opcionesConItems.pre_interv_estados?.length
        ? opcionesConItems.pre_interv_estados
        : (semaforo || []).map((o) => o.valor),
    }),
    [opcionesConItems, tramoOptions, calzadaOptions, semaforo],
  )

  const chipKeys = pptoFiltrosActivosKeys(draftF, [])
  const tieneCriteriosParaPlantilla = chipKeys.some((k) => pptoFiltroTieneValor(pptoFiltroDef(k), draftF))

  const itemLabels = useMemo(() => {
    const m = {}
    for (const p of listadoPrecios || []) {
      if (p.item_numero && p.descripcion) m[p.item_numero] = p.descripcion
    }
    for (const o of opcionesConItems.items_opciones || []) {
      if (o?.item && o.descripcion) m[o.item] = o.descripcion
    }
    return m
  }, [listadoPrecios, opcionesConItems])

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
    if (open && tab === 'plantillas') void cargarPlantillas()
  }, [open, tab, cargarPlantillas])

  const aplicarPlantilla = (pl) => {
    const { fObra } = pptoFiltroFromSnapshot(pl?.filtros)
    setDraftF({ ...fObra, tipoEjecucion: draftF.tipoEjecucion || fObra.tipoEjecucion })
    setTab('libre')
  }

  const guardarPlantilla = async () => {
    const nombre = String(nombrePlantilla || '').trim()
    if (!nombre || !token) return
    if (!tieneCriteriosParaPlantilla) {
      window.alert(
        'Primero defina al menos un criterio en «Filtros libres» (capítulo, tramo, ítem, etc.) y pulse + o Buscar. Luego guarde la plantilla.',
      )
      setTab('libre')
      return
    }
    setGuardandoPlantilla(true)
    try {
      await crearFiltroPlantilla(token, {
        modulo: PPTO_FILTRO_MODULO,
        nombre,
        filtros: pptoFiltroSnapshot(draftF, chipKeys),
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
    const te = draftF.tipoEjecucion
    const vacio = {
      cap: '', caps: [], item: '', items: [], idPol: '', pkCriterio: '', texto: '',
      tramo: '', tramos: [], calzada: '', calzadas: [], nodoI: '', nodoF: '', absA: '', absB: '',
      eje: 'interv', revisado: '', preInterv: '', competencia: '', competencias: [], und: '', unds: [],
      sellado: '', dadoDeBaja: '', vlrUnitarioMin: '', vlrUnitarioMax: '', cantTotalMin: '', cantTotalMax: '',
      costoDirectoMin: '', costoDirectoMax: '', tipoEjecucion: te,
    }
    setDraftF(vacio)
  }

  const ejecutarBuscar = async () => {
    const fOut = { ...draftF, eje: draftF.eje || 'interv' }
    try {
      if (typeof onBuscar === 'function') await onBuscar(fOut)
    } finally {
      onClose()
    }
  }

  const ejecutarLimpiarTodo = () => {
    limpiarDraft()
    onLimpiarAplicado()
    onClose()
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
            Configure filtros y pulse Buscar. Al cerrar, se conserva su última búsqueda en esta sesión.
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
              <div
                style={{
                  background: `${t.primary}10`,
                  border: `1px solid ${t.primary}33`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 14,
                  fontSize: cc.sm,
                  color: t.text,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 800, color: t.primary, marginBottom: 8 }}>Cómo crear una plantilla</div>
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  <li>Vaya a la pestaña <strong>Filtros libres</strong>.</li>
                  <li>Agregue criterios (capítulo, tramo, ítem, validación, etc.) con el botón <strong>+</strong>.</li>
                  <li>Opcional: pulse <strong>Buscar</strong> para comprobar resultados.</li>
                  <li>Vuelva aquí, escriba un nombre y pulse <strong>Guardar plantilla</strong>.</li>
                </ol>
                <button
                  type="button"
                  onClick={() => setTab('libre')}
                  style={{
                    marginTop: 10,
                    background: 'transparent',
                    border: `1px solid ${t.primary}`,
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: cc.caption,
                    fontWeight: 700,
                    color: t.primary,
                    cursor: 'pointer',
                  }}
                >
                  Ir a Filtros libres →
                </button>
              </div>
              {!plantillas.length ? (
                <p style={{ fontSize: cc.sm, color: t.textMuted, margin: '0 0 12px' }}>Sin plantillas guardadas.</p>
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
                        title="Eliminar plantilla"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
                <div style={{ fontSize: cc.caption, color: t.textMuted, marginBottom: 8 }}>
                  {tieneCriteriosParaPlantilla
                    ? 'Los criterios de «Filtros libres» están listos. Asigne un nombre y guarde.'
                    : 'Defina criterios en «Filtros libres» antes de guardar.'}
                </div>
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
                    onKeyDown={(e) => e.key === 'Enter' && guardarPlantilla()}
                  />
                  <button
                    type="button"
                    onClick={guardarPlantilla}
                    disabled={guardandoPlantilla || !nombrePlantilla.trim()}
                    style={{ ...btnSec, background: t.primary, color: '#fff', border: 'none', opacity: guardandoPlantilla ? 0.7 : 1 }}
                  >
                    Guardar plantilla
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'libre' && (
            <div>
              <p style={{ margin: '0 0 14px', fontSize: cc.caption, color: t.textMuted, fontStyle: 'italic' }}>
                Combine los criterios que necesite. La vista «{tipoEjecucionActivo}» ya está activa en la barra superior.
              </p>
              {tieneCriteriosParaPlantilla && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                  }}
                >
                  <div style={{ fontSize: cc.caption, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
                    Criterios listos para guardar como plantilla
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {chipKeys
                      .filter((k) => pptoFiltroTieneValor(pptoFiltroDef(k), draftF))
                      .map((k) => {
                        const def = pptoFiltroDef(k)
                        return (
                          <span
                            key={k}
                            style={{
                              fontSize: cc.caption,
                              background: t.primary + '18',
                              border: `1px solid ${t.primary}44`,
                              borderRadius: 12,
                              padding: '2px 8px',
                              color: t.text,
                            }}
                          >
                            {def?.label}: {pptoFiltroChipResumen(def, draftF, itemLabels)}
                          </span>
                        )
                      })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={nombrePlantilla}
                      onChange={(e) => setNombrePlantilla(e.target.value)}
                      placeholder="Nombre de la plantilla…"
                      style={{
                        flex: '1 1 180px',
                        minWidth: 160,
                        background: t.inputBg,
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: cc.sm,
                        color: t.text,
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && guardarPlantilla()}
                    />
                    <button
                      type="button"
                      onClick={guardarPlantilla}
                      disabled={guardandoPlantilla || !nombrePlantilla.trim()}
                      style={{
                        ...btnSec,
                        background: t.primary,
                        color: '#fff',
                        border: 'none',
                        opacity: guardandoPlantilla || !nombrePlantilla.trim() ? 0.6 : 1,
                      }}
                    >
                      {guardandoPlantilla ? 'Guardando…' : 'Guardar plantilla'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('plantillas')}
                      style={{ ...btnSec, fontSize: cc.caption }}
                    >
                      Ver plantillas
                    </button>
                  </div>
                </div>
              )}
              {PPTO_FILTRO_CATEGORIAS.map((cat) => {
                const defs = catalogoPorCat[cat.id] || []
                if (!defs.length) return null
                const abierto = !!seccionesAbiertas[cat.id]
                const activosEnSeccion = defs.filter((d) => pptoFiltroTieneValor(d, draftF)).length
                return (
                  <div
                    key={cat.id}
                    style={{
                      marginBottom: 10,
                      border: `1px solid ${t.border}`,
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: t.bg,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSeccion(cat.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '10px 14px',
                        border: 'none',
                        background: abierto ? `${t.primary}12` : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: cc.caption, fontWeight: 800, color: t.primary, letterSpacing: 0.4 }}>
                        {cat.label.toUpperCase()}
                        {activosEnSeccion > 0 ? (
                          <span style={{ marginLeft: 8, fontWeight: 600, color: t.textMuted }}>
                            ({activosEnSeccion} activo{activosEnSeccion !== 1 ? 's' : ''})
                          </span>
                        ) : null}
                      </span>
                      <span style={{ color: t.textMuted, fontSize: cc.sm, flexShrink: 0 }} aria-hidden>
                        {abierto ? '▼' : '▶'}
                      </span>
                    </button>
                    {abierto && (
                      <div
                        style={{
                          padding: '12px 14px 14px',
                          borderTop: `1px solid ${t.border}`,
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          gap: '14px 18px',
                          alignItems: 'start',
                        }}
                      >
                        {defs.map((def) => (
                          <PptoFiltroCampo
                            key={def.key}
                            def={def}
                            f={draftF}
                            onChange={(patch) => setDraftF((prev) => ({ ...prev, ...patch }))}
                            t={t}
                            opciones={opcionesResueltas}
                            itemLabels={itemLabels}
                          />
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
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <button type="button" onClick={ejecutarLimpiarTodo} disabled={buscando} style={{ ...btnSec, color: t.textMuted }}>
            Limpiar todo
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} disabled={buscando} style={btnSec}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={ejecutarBuscar}
              disabled={buscando}
              style={{
                ...btnSec,
                background: t.primary,
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                cursor: buscando ? 'wait' : 'pointer',
              }}
            >
              {buscando ? '⏳ Buscando…' : 'Buscar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
