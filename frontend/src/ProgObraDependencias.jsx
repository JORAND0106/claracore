/**
 * ProgObraDependencias — dependencias CPM por capitulo o por agrupador.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, Plus, AlertCircle, GitFork } from 'lucide-react'
import ProgObraDepAyuda, { DepAyudaButton } from './ProgObraDepAyuda'

const TIPOS = ['FS', 'SS', 'FF', 'SF']

const inputStyle = (t) => ({
  padding: '5px 8px',
  fontSize: 'var(--cc-sm)',
  border: `1px solid ${t.border}`,
  borderRadius: 6,
  background: t.bgCard,
  color: t.text,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
})

function agLabel(ag) {
  if (!ag) return ''
  const code = ag.codigo_wbs || ''
  const name = ag.agrupador_nombre || ''
  return code && name ? `${code} · ${name}` : code || name || `Agrupador ${ag.agrupador_id}`
}

function truncateText(text, maxLen = 40) {
  const s = String(text || '').trim()
  if (s.length <= maxLen) return s
  return `${s.slice(0, maxLen)}...`
}

function lookupAgrupador(estructuraMap, pk, capitulo, agrupadorId) {
  if (agrupadorId == null || agrupadorId === '') return null
  const cap = estructuraMap?.[pk]?.[capitulo]
  return (cap?.agrupadores || []).find((a) => String(a.agrupador_id) === String(agrupadorId)) || null
}

function depEndpointShort(dep, side, estructuraMap) {
  const pk = side === 'orig' ? dep.pk_id_origen : dep.pk_id_destino
  const cap = side === 'orig' ? dep.capitulo_origen : dep.capitulo_destino
  const agId = side === 'orig' ? dep.agrupador_id_origen : dep.agrupador_id_destino
  if (agId != null && agId !== '') {
    const ag = lookupAgrupador(estructuraMap, pk, cap, agId)
    return agLabel(ag) || `Agr. ${agId}`
  }
  return truncateText(cap, 40)
}

function depEndpointTooltipLine(dep, side, estructuraMap) {
  const pk = String(side === 'orig' ? dep.pk_id_origen : dep.pk_id_destino || '').trim()
  const cap = String(side === 'orig' ? dep.capitulo_origen : dep.capitulo_destino || '').trim()
  const agId = side === 'orig' ? dep.agrupador_id_origen : dep.agrupador_id_destino
  const otherPk = String(side === 'orig' ? dep.pk_id_destino : dep.pk_id_origen || '').trim()
  const showPk = pk && otherPk && pk !== otherPk
  const parts = []
  if (showPk) parts.push(pk)
  if (cap) parts.push(cap)
  if (agId != null && agId !== '') {
    const ag = lookupAgrupador(estructuraMap, pk, cap, agId)
    parts.push(agLabel(ag) || `Agr. ${agId}`)
  }
  return parts.join(' / ')
}

function formatDepCellText(dep, estructuraMap) {
  const orig = depEndpointShort(dep, 'orig', estructuraMap)
  const dest = depEndpointShort(dep, 'dest', estructuraMap)
  const tipo = dep.tipo || 'FS'
  return `${orig}  →${tipo}→  ${dest}`
}

function formatDepTooltip(dep, estructuraMap) {
  const orig = depEndpointTooltipLine(dep, 'orig', estructuraMap)
  const dest = depEndpointTooltipLine(dep, 'dest', estructuraMap)
  const tipo = dep.tipo || 'FS'
  const lag = Number(dep.lag_dias) || 0
  const lagLine = lag !== 0 ? `\nLag: ${lag} día${lag !== 1 ? 's' : ''}` : ''
  return `${orig}\n→${tipo}→\n${dest}${lagLine}`
}

function estructuraCapMapFromResponse(data) {
  const map = {}
  for (const c of data?.capitulos || []) {
    const cap = String(c?.capitulo || '').trim()
    if (cap) map[cap] = c
  }
  return map
}

function agOptionKey(ag) {
  return `${ag.pk_id}\u0000${ag.capitulo}\u0000${ag.agrupador_id}`
}

function findAgByKey(list, key) {
  return list.find((a) => agOptionKey(a) === key)
}

function flattenAgrupadores(estructuraPorCapitulo, capitulos, pkId) {
  const list = []
  for (const cap of capitulos || []) {
    for (const ag of estructuraPorCapitulo?.[cap]?.agrupadores || []) {
      list.push({ ...ag, capitulo: cap, pk_id: pkId })
    }
  }
  return list
}

function DepPanel({ title, t, children }) {
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '12px 14px', background: t.bg }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--cc-caption)', color: t.textMuted, letterSpacing: '0.04em', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function ProgObraDependencias({
  cid,
  token,
  API,
  t,
  activePk,
  versionId,
  capitulosOrigen,
  estructuraPorCapitulo = {},
  allPkIds,
  editable,
  showToast,
  onCpmCalculated,
  cpmDirty: cpmDirtyProp,
  onCpmDirtyChange,
  tramoMode = false,
  tramoLabel = null,
  tramoPkIds = null,
}) {
  const [deps, setDeps] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [cpmDirtyLocal, setCpmDirtyLocal] = useState(false)
  const cpmDirty = cpmDirtyProp ?? cpmDirtyLocal
  const setCpmDirty = onCpmDirtyChange ?? setCpmDirtyLocal
  const [cpmCalculando, setCpmCalculando] = useState(false)
  const [cpmResultados, setCpmResultados] = useState([])

  const [capOrig, setCapOrig] = useState('')
  const [capDest, setCapDest] = useState('')
  const [capTipo, setCapTipo] = useState('FS')
  const [capLag, setCapLag] = useState('0')

  const [agOrig, setAgOrig] = useState('')
  const [agDest, setAgDest] = useState('')
  const [agCrossPk, setAgCrossPk] = useState(false)
  const [agPkDest, setAgPkDest] = useState('')
  const [agTipo, setAgTipo] = useState('FS')
  const [agLag, setAgLag] = useState('0')
  const [estructuraDestPk, setEstructuraDestPk] = useState({})
  const [capsDestPk, setCapsDestPk] = useState([])

  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [ayudaOpen, setAyudaOpen] = useState(false)
  const [estructuraByPk, setEstructuraByPk] = useState({})

  const onCpmRef = useRef(onCpmCalculated)
  onCpmRef.current = onCpmCalculated
  const estructuraFetchRef = useRef(new Set())

  const hdrs = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  )

  const agrupadoresOrigen = useMemo(
    () => flattenAgrupadores(estructuraPorCapitulo, capitulosOrigen, activePk),
    [estructuraPorCapitulo, capitulosOrigen, activePk],
  )

  const agrupadoresDest = useMemo(() => {
    const pk = agCrossPk && agPkDest ? agPkDest : activePk
    const caps = pk === activePk ? capitulosOrigen : capsDestPk
    const estructura = pk === activePk ? estructuraPorCapitulo : estructuraDestPk
    return flattenAgrupadores(estructura, caps, pk)
  }, [agCrossPk, agPkDest, activePk, capitulosOrigen, capsDestPk, estructuraPorCapitulo, estructuraDestPk])

  const estructuraMap = useMemo(() => {
    const map = { ...estructuraByPk }
    if (activePk && estructuraPorCapitulo) {
      map[activePk] = estructuraPorCapitulo
    }
    return map
  }, [estructuraByPk, activePk, estructuraPorCapitulo])

  useEffect(() => {
    if (capitulosOrigen.length > 0 && !capOrig) setCapOrig(capitulosOrigen[0])
    if (capitulosOrigen.length > 1 && !capDest) setCapDest(capitulosOrigen[1] || capitulosOrigen[0])
  }, [capitulosOrigen, capOrig, capDest])

  useEffect(() => {
    if (!versionId) {
      setLoaded(false)
      setDeps([])
      return undefined
    }
    let cancel = false
    setLoaded(false)
    ;(async () => {
      try {
        const [resDeps, resCpm] = await Promise.all([
          fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/dependencias`, { headers: hdrs }),
          fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/cpm-resultados`, { headers: hdrs }),
        ])
        if (cancel) return
        if (resDeps.ok) setDeps(await resDeps.json())
        if (resCpm.ok) {
          const cpmData = await resCpm.json()
          setCpmDirty(!!cpmData.cpm_dirty)
          const resultados = cpmData.resultados || []
          setCpmResultados(resultados)
          onCpmRef.current?.(resultados)
        }
      } catch {
        // silencioso
      } finally {
        if (!cancel) setLoaded(true)
      }
    })()
    return () => { cancel = true }
  }, [versionId, cid, API, hdrs])

  useEffect(() => {
    if (!loaded || !cid || !token || !deps.length) return undefined
    let cancel = false
    const pksNeeded = [
      ...new Set(
        deps.flatMap((d) => [d.pk_id_origen, d.pk_id_destino].map((p) => String(p || '').trim()).filter(Boolean)),
      ),
    ]
    ;(async () => {
      for (const pk of pksNeeded) {
        if (cancel) return
        if (pk === activePk && estructuraPorCapitulo && Object.keys(estructuraPorCapitulo).length) continue
        if (estructuraFetchRef.current.has(pk)) continue
        estructuraFetchRef.current.add(pk)
        try {
          const res = await fetch(
            `${API}/prog-obra/${cid}/programacion-estructura?pk_id=${encodeURIComponent(pk)}`,
            { headers: hdrs },
          )
          if (cancel || !res.ok) continue
          const data = await res.json()
          setEstructuraByPk((prev) => (prev[pk] ? prev : { ...prev, [pk]: estructuraCapMapFromResponse(data) }))
        } catch {
          /* ignore */
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [loaded, deps, cid, token, API, hdrs, activePk, estructuraPorCapitulo])

  useEffect(() => {
    if (!agCrossPk || !agPkDest || agPkDest === activePk) {
      setEstructuraDestPk({})
      setCapsDestPk(capitulosOrigen)
      return
    }
    fetch(`${API}/prog-obra/${cid}/programacion-estructura?pk_id=${encodeURIComponent(agPkDest)}`, { headers: hdrs })
      .then((r) => (r.ok ? r.json() : { capitulos: [] }))
      .then((d) => {
        const map = {}
        const caps = []
        for (const c of d.capitulos || []) {
          if (c?.capitulo != null) {
            map[c.capitulo] = c
            caps.push(c.capitulo)
          }
        }
        setEstructuraDestPk(map)
        setCapsDestPk(caps)
      })
      .catch(() => {
        setEstructuraDestPk({})
        setCapsDestPk([])
      })
  }, [agCrossPk, agPkDest, activePk, cid, API, hdrs, capitulosOrigen])

  useEffect(() => {
    setAgDest('')
  }, [agOrig, agCrossPk, agPkDest])

  useEffect(() => {
    if (!agCrossPk) setAgPkDest('')
  }, [agCrossPk])

  const postDep = async (body) => {
    const res = await fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/dependencias`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.detail || 'Error al agregar dependencia.')
    return data
  }

  const handleAddCap = async () => {
    setFormError(null)
    if (!capOrig || !capDest) {
      setFormError('Selecciona capitulo origen y destino.')
      return
    }
    if (capOrig === capDest) {
      setFormError('El capitulo origen y destino deben ser distintos.')
      return
    }
    setSaving(true)
    try {
      const data = await postDep({
        pk_id_origen: activePk,
        capitulo_origen: capOrig,
        pk_id_destino: activePk,
        capitulo_destino: capDest,
        tipo: capTipo,
        lag_dias: parseInt(capLag, 10) || 0,
      })
      setDeps((prev) => [...prev, data])
      setCpmDirty(true)
      showToast?.('Dependencia por capitulo agregada.', 'ok')
    } catch (e) {
      setFormError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddAg = async () => {
    setFormError(null)
    if (agCrossPk && !agPkDest) {
      setFormError('Selecciona el PK destino.')
      return
    }
    const orig = findAgByKey(agrupadoresOrigen, agOrig)
    const destPk = agCrossPk && agPkDest ? agPkDest : activePk
    const dest = findAgByKey(agrupadoresDest, agDest)
    if (!orig || !dest) {
      setFormError('Selecciona agrupador origen y destino.')
      return
    }
    if (orig.pk_id === destPk && orig.capitulo === dest.capitulo && String(orig.agrupador_id) === String(dest.agrupador_id)) {
      setFormError('El origen y destino no pueden ser el mismo agrupador.')
      return
    }
    setSaving(true)
    try {
      const data = await postDep({
        pk_id_origen: activePk,
        capitulo_origen: orig.capitulo,
        agrupador_id_origen: String(orig.agrupador_id),
        pk_id_destino: destPk,
        capitulo_destino: dest.capitulo,
        agrupador_id_destino: String(dest.agrupador_id),
        tipo: agTipo,
        lag_dias: parseInt(agLag, 10) || 0,
      })
      setDeps((prev) => [...prev, data])
      setCpmDirty(true)
      showToast?.('Dependencia por agrupador agregada.', 'ok')
    } catch (e) {
      setFormError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (depId) => {
    if (!window.confirm('Eliminar esta dependencia?')) return
    setDeletingId(depId)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/dependencias/${depId}`, { method: 'DELETE', headers: hdrs })
      if (!res.ok) {
        showToast?.('Error al eliminar dependencia.', 'err')
        return
      }
      setDeps((prev) => prev.filter((d) => d.id !== depId))
      setCpmDirty(true)
      showToast?.('Dependencia eliminada.', 'ok')
    } catch {
      showToast?.('Error de red al eliminar.', 'err')
    } finally {
      setDeletingId(null)
    }
  }

  const recargarCpm = useCallback(async () => {
    const res = await fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/cpm-resultados`, { headers: hdrs })
    if (res.ok) {
      const cpmData = await res.json()
      setCpmDirty(!!cpmData.cpm_dirty)
      setCpmResultados(cpmData.resultados || [])
      onCpmRef.current?.(cpmData.resultados || [])
    }
  }, [cid, versionId, API, hdrs])

  const handleCalcularCpm = async () => {
    setCpmCalculando(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/calcular-cpm`, { method: 'POST', headers: hdrs })
      const data = await res.json()
      if (!res.ok) {
        showToast?.(data?.detail || 'Error en CPM.', 'err')
        return
      }
      setCpmDirty(false)
      showToast?.(`CPM calculado (${data.tiempo_ms || '?'} ms).`, 'ok')
      await recargarCpm()
    } catch {
      showToast?.('Error de red al calcular CPM.', 'err')
    } finally {
      setCpmCalculando(false)
    }
  }

  const depsDelPk = useMemo(() => {
    if (tramoMode && tramoPkIds?.length) {
      const pkSet = new Set(tramoPkIds.map((p) => String(p).trim()))
      return deps.filter(
        (d) => pkSet.has(String(d.pk_id_origen || '').trim()) || pkSet.has(String(d.pk_id_destino || '').trim()),
      )
    }
    return deps.filter((d) => d.pk_id_origen === activePk || d.pk_id_destino === activePk)
  }, [deps, activePk, tramoMode, tramoPkIds])

  const crossPk = useMemo(() => {
    const pool = tramoMode && tramoPkIds?.length ? tramoPkIds : (allPkIds || [])
    return pool.filter((pk) => pk !== activePk)
  }, [allPkIds, activePk, tramoMode, tramoPkIds])

  const gridRow = {
    display: 'grid',
    gridTemplateColumns: 'minmax(140px,1.4fr) 72px 64px minmax(140px,1.4fr) auto',
    gap: 8,
    alignItems: 'end',
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitFork size={16} color={t.primary} />
          <span style={{ fontWeight: 700, fontSize: 'var(--cc-sm)' }}>
            {tramoMode && tramoLabel
              ? `Dependencias CPM — ${tramoLabel}`
              : `Dependencias CPM — PK ${activePk}`}
          </span>
          <DepAyudaButton t={t} onClick={() => setAyudaOpen(true)} />
          {cpmDirty && (
            <span style={{ fontSize: 'var(--cc-caption)', background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '2px 6px' }}>CPM desactualizado</span>
          )}
        </div>
        <button type="button" disabled={cpmCalculando || !versionId} onClick={handleCalcularCpm}
          style={{ padding: '6px 14px', fontSize: 'var(--cc-caption)', fontWeight: 600, borderRadius: 6, border: `1px solid ${t.primary}`, background: t.bgCard, color: t.primary, cursor: 'pointer' }}>
          {cpmCalculando ? 'Calculando…' : 'Calcular CPM'}
        </button>
      </div>

      <div>
        <div style={{ fontWeight: 600, fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 6 }}>DEPENDENCIAS DEFINIDAS</div>
        {!loaded ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>Cargando…</div>
        ) : depsDelPk.length === 0 ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', fontStyle: 'italic' }}>
            {tramoMode ? 'Sin dependencias para los PKs de este tramo.' : 'Sin dependencias para este PK.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--cc-caption)' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: t.textMuted }}>Dependencia</th>
                  <th style={{ padding: '6px 8px', width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {depsDelPk.map((dep) => (
                  <tr key={dep.id} style={{ borderBottom: `1px solid ${t.border}22` }}>
                    <td
                      style={{
                        padding: '6px 8px',
                        color: t.text,
                        maxWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={formatDepTooltip(dep, estructuraMap)}
                    >
                      {formatDepCellText(dep, estructuraMap)}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      {editable && (
                        <button type="button" disabled={deletingId === dep.id} onClick={() => handleEliminar(dep.id)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editable && (
        <>
          <DepPanel title="DEPENDENCIAS POR CAPITULO" t={t}>
            <div style={gridRow}>
              <div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Origen</div>
                <select value={capOrig} onChange={(e) => setCapOrig(e.target.value)} style={inputStyle(t)}>
                  {capitulosOrigen.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Tipo</div>
                <select value={capTipo} onChange={(e) => setCapTipo(e.target.value)} style={inputStyle(t)}>
                  {TIPOS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Dias</div>
                <input type="number" value={capLag} onChange={(e) => setCapLag(e.target.value)} style={inputStyle(t)} />
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Destino (PK {activePk})</div>
                <select value={capDest} onChange={(e) => setCapDest(e.target.value)} style={inputStyle(t)}>
                  {capitulosOrigen.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="button" disabled={saving} onClick={handleAddCap}
                style={{ padding: '6px 12px', fontWeight: 600, borderRadius: 6, border: 'none', background: t.primary, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                + Agregar
              </button>
            </div>
          </DepPanel>

          <DepPanel title="DEPENDENCIAS POR AGRUPADOR" t={t}>
            {crossPk.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 'var(--cc-sm)', color: t.text, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={agCrossPk}
                  onChange={(e) => setAgCrossPk(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                Cruza a otro PK
              </label>
            )}
            {agCrossPk && crossPk.length > 0 && (
              <div style={{ marginBottom: 10, maxWidth: 220 }}>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>PK destino</div>
                <select value={agPkDest} onChange={(e) => setAgPkDest(e.target.value)} style={inputStyle(t)}>
                  <option value="">— Seleccionar PK —</option>
                  {crossPk.map((pk) => <option key={pk} value={pk}>{pk}</option>)}
                </select>
              </div>
            )}
            <div style={gridRow}>
              <div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Origen</div>
                <select value={agOrig} onChange={(e) => setAgOrig(e.target.value)} style={inputStyle(t)}>
                  <option value="">— Seleccionar —</option>
                  {agrupadoresOrigen.map((ag) => (
                    <option key={agOptionKey(ag)} value={agOptionKey(ag)}>{agLabel(ag)}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Tipo</div>
                <select value={agTipo} onChange={(e) => setAgTipo(e.target.value)} style={inputStyle(t)}>
                  {TIPOS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Dias</div>
                <input type="number" value={agLag} onChange={(e) => setAgLag(e.target.value)} style={inputStyle(t)} />
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Destino</div>
                <select value={agDest} onChange={(e) => setAgDest(e.target.value)} style={inputStyle(t)}>
                  <option value="">— Seleccionar —</option>
                  {agrupadoresDest.map((ag) => (
                    <option key={agOptionKey(ag)} value={agOptionKey(ag)}>{agLabel(ag)}</option>
                  ))}
                </select>
              </div>
              <button type="button" disabled={saving || !agOrig || !agDest} onClick={handleAddAg}
                style={{ padding: '6px 12px', fontWeight: 600, borderRadius: 6, border: 'none', background: t.primary, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                + Agregar
              </button>
            </div>
          </DepPanel>

          {formError && (
            <div style={{ display: 'flex', gap: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 12px', color: '#991B1B', fontSize: 'var(--cc-caption)' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{formError}</span>
            </div>
          )}
        </>
      )}

      {loaded && cpmResultados.length > 0 && (
        <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
          Resultados CPM cargados: {cpmResultados.filter((r) => r.pk_id === activePk).length} capitulos en PK {activePk}.
        </div>
      )}

      <ProgObraDepAyuda open={ayudaOpen} onClose={() => setAyudaOpen(false)} t={t} />
    </div>
  )
}
