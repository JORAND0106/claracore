import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { formatCOP } from '../../utils/formatCOP'
import { downloadVersionCompareExcel, fetchVersionCompareTramosData } from './presupuestoVersionCompareExportExcel'

/** Token fresco desde almacenamiento; el prop se congela en el render (ver PptoVersionador). */
function tokenFresco(fallback) {
  if (typeof window === 'undefined') return fallback
  return (
    window.localStorage?.getItem('cc_token') ||
    window.sessionStorage?.getItem('cc_token') ||
    fallback
  )
}

function cmpCapitulo(a, b) {
  const key = (c) => {
    const m = String(c ?? '').match(/^(\d+)/)
    return m ? [0, parseInt(m[1], 10), c] : [1, 0, c]
  }
  const ka = key(a)
  const kb = key(b)
  if (ka[0] !== kb[0]) return ka[0] - kb[0]
  if (ka[1] !== kb[1]) return ka[1] - kb[1]
  return String(ka[2] ?? '').localeCompare(String(kb[2] ?? ''), 'es', { numeric: true })
}

function fmtQty(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n))
}

function fmtDelta(prev, curr, { money = false } = {}) {
  if (prev == null && curr == null) return '—'
  const p = prev == null ? 0 : Number(prev)
  const c = curr == null ? 0 : Number(curr)
  if (Number.isNaN(p) || Number.isNaN(c)) return '—'
  const d = c - p
  if (d === 0) return '—'
  const s = money ? formatCOP(Math.abs(d)) : fmtQty(Math.abs(d))
  return d > 0 ? `▲ ${s}` : `▼ ${s}`
}

function deltaColor(prev, curr, t) {
  if (prev == null || curr == null) return t.textMuted
  const p = Number(prev)
  const c = Number(curr)
  if (Number.isNaN(p) || Number.isNaN(c)) return t.textMuted
  if (c > p) return '#059669'
  if (c < p) return '#DC2626'
  return t.textMuted
}

function itemTags(existsFlags) {
  const tags = new Set()
  for (let i = 0; i < existsFlags.length - 1; i += 1) {
    if (!existsFlags[i] && existsFlags[i + 1]) tags.add('Nuevo')
    if (existsFlags[i] && !existsFlags[i + 1]) tags.add('Dado de baja')
  }
  return [...tags]
}

function versionIdsKey(list) {
  return list.map((v) => String(v.id)).join(',')
}

const th = { padding: '6px 8px', fontSize: 'var(--cc-caption)', fontWeight: 700, whiteSpace: 'nowrap' }
const td = { padding: '6px 8px', fontSize: 'var(--cc-sm)', verticalAlign: 'middle' }

/**
 * Modal de comparación multinivel (capítulos → ítems) con alcance general o por tramo.
 */
export default function PptoVersionCompareModal({ open, onClose, versions = [], contratoId, token, API, t, usuario }) {
  const openPrevRef = useRef(false)
  const sessionKeyRef = useRef('')

  /** Versiones congeladas al abrir la sesión; evita resets por recargas del padre. */
  const [activeVersions, setActiveVersions] = useState([])

  const versionesOrd = useMemo(
    () =>
      activeVersions.length
        ? activeVersions
        : [...versions].sort((a, b) => (Number(a.numero_version) || 0) - (Number(b.numero_version) || 0)),
    [activeVersions, versions],
  )

  const [alcance, setAlcance] = useState('general')
  const [tramo, setTramo] = useState('')
  const [tramos, setTramos] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)
  const [capsByVersion, setCapsByVersion] = useState([])
  const [expandedCap, setExpandedCap] = useState(null)
  const [itemsByCap, setItemsByCap] = useState({})
  const [itemsLoading, setItemsLoading] = useState(null)
  const [aiuByVersion, setAiuByVersion] = useState({})

  const resetSesion = useCallback(
    (nextVersions) => {
      setActiveVersions(nextVersions)
      setAlcance('general')
      setTramo('')
      setLoaded(false)
      setError(null)
      setCapsByVersion([])
      setExpandedCap(null)
      setItemsByCap({})
      const initAiu = {}
      nextVersions.forEach((v) => {
        initAiu[String(v.id)] = v.aiu_porcentaje != null ? String(v.aiu_porcentaje) : '0'
      })
      setAiuByVersion(initAiu)
    },
    [],
  )

  /** Solo reinicia al abrir el modal o al cambiar el conjunto de versiones comparadas. */
  useEffect(() => {
    if (!open || !contratoId) {
      openPrevRef.current = false
      return
    }

    const sorted = [...versions].sort(
      (a, b) => (Number(a.numero_version) || 0) - (Number(b.numero_version) || 0),
    )
    const nextKey = versionIdsKey(sorted)
    const abriendo = !openPrevRef.current
    const nuevasVersiones = openPrevRef.current && sessionKeyRef.current !== nextKey

    openPrevRef.current = true
    sessionKeyRef.current = nextKey

    if (abriendo || nuevasVersiones) {
      resetSesion(sorted)
    }
  }, [open, contratoId, versions, resetSesion])

  useEffect(() => {
    if (!open || !contratoId) return
    fetch(`${API}/presupuesto/${contratoId}/maestro-ubicacion-pk`, {
      headers: { Authorization: `Bearer ${tokenFresco(token)}` },
    })
      .then((r) => (r.ok ? r.json() : { tramos: [] }))
      .then((d) => setTramos(Array.isArray(d?.tramos) ? d.tramos : []))
      .catch(() => setTramos([]))
  }, [open, contratoId, API])

  const cargarComparacion = useCallback(async () => {
    if (!contratoId || versionesOrd.length < 2) return
    if (alcance === 'tramo' && !String(tramo).trim()) {
      setError('Seleccione un tramo para comparar por alcance geográfico.')
      return
    }
    setLoading(true)
    setError(null)
    setExpandedCap(null)
    setItemsByCap({})
    try {
      const qs =
        alcance === 'tramo' && String(tramo).trim()
          ? `?tramo=${encodeURIComponent(String(tramo).trim())}`
          : ''
      const result = await Promise.all(
        versionesOrd.map(async (v) => {
          const res = await fetch(
            `${API}/presupuesto/${contratoId}/versiones/${v.id}/capitulos-lista${qs}`,
            { headers: { Authorization: `Bearer ${tokenFresco(token)}` } },
          )
          const caps = res.ok ? await res.json() : []
          return { version: v, caps: Array.isArray(caps) ? caps : [] }
        }),
      )
      setCapsByVersion(result)
      setLoaded(true)
    } catch {
      setError('No se pudo cargar la comparación.')
      setLoaded(false)
    } finally {
      setLoading(false)
    }
  }, [API, alcance, contratoId, token, tramo, versionesOrd])

  const capitulosUnion = useMemo(() => {
    const set = new Set()
    capsByVersion.forEach(({ caps }) => caps.forEach((c) => set.add(c.capitulo)))
    return [...set].sort(cmpCapitulo)
  }, [capsByVersion])

  const getCapData = useCallback(
    (versionId, capitulo) => {
      const block = capsByVersion.find((x) => String(x.version.id) === String(versionId))
      return block?.caps?.find((c) => c.capitulo === capitulo) || null
    },
    [capsByVersion],
  )

  const totalesPorVersion = useMemo(() => {
    const out = {}
    versionesOrd.forEach((v) => {
      const block = capsByVersion.find((x) => String(x.version.id) === String(v.id))
      const costo = (block?.caps || []).reduce((s, c) => s + Math.round(Number(c.costo_total) || 0), 0)
      out[String(v.id)] = costo
    })
    return out
  }, [capsByVersion, versionesOrd])

  const fetchItemsCapitulo = useCallback(
    async (capitulo) => {
      const rows = await Promise.all(
        versionesOrd.map(async (v) => {
          const p = new URLSearchParams({ capitulo })
          if (alcance === 'tramo' && String(tramo).trim()) p.set('tramo', String(tramo).trim())
          const res = await fetch(
            `${API}/presupuesto/${contratoId}/versiones/${v.id}/items-lista?${p.toString()}`,
            { headers: { Authorization: `Bearer ${tokenFresco(token)}` } },
          )
          const items = res.ok ? await res.json() : []
          return { version: v, items: Array.isArray(items) ? items : [] }
        }),
      )
      return rows
    },
    [API, alcance, contratoId, token, tramo, versionesOrd],
  )

  const expandirCapitulo = useCallback(
    async (capitulo) => {
      if (expandedCap === capitulo) {
        setExpandedCap(null)
        return
      }
      setExpandedCap(capitulo)
      if (itemsByCap[capitulo]) return
      setItemsLoading(capitulo)
      try {
        const rows = await fetchItemsCapitulo(capitulo)
        setItemsByCap((prev) => ({ ...prev, [capitulo]: rows }))
      } catch {
        window.alert('No se pudieron cargar los ítems del capítulo.')
      } finally {
        setItemsLoading(null)
      }
    },
    [expandedCap, fetchItemsCapitulo, itemsByCap],
  )

  const exportarExcel = useCallback(async () => {
    if (!loaded || !capitulosUnion.length) return
    setExporting(true)
    try {
      const allItems = { ...itemsByCap }
      const faltantes = capitulosUnion.filter((cap) => !allItems[cap])
      if (faltantes.length) {
        const fetched = await Promise.all(
          faltantes.map(async (cap) => {
            const rows = await fetchItemsCapitulo(cap)
            return [cap, rows]
          }),
        )
        fetched.forEach(([cap, rows]) => {
          allItems[cap] = rows
        })
      }

      const tramosData = await fetchVersionCompareTramosData({
        API,
        contratoId,
        token: tokenFresco(token),
        versionesOrd,
        tramosList: tramos,
      })

      let metaContrato = null
      try {
        const resMeta = await fetch(`${API}/contratos/${contratoId}`, {
          headers: { Authorization: `Bearer ${tokenFresco(token)}` },
        })
        if (resMeta.ok) metaContrato = await resMeta.json()
      } catch {
        metaContrato = null
      }

      const alcanceLabel =
        alcance === 'tramo' && String(tramo).trim() ? `Tramo: ${String(tramo).trim()}` : 'General'

      const exportadoPor = (() => {
        if (!usuario) return undefined
        const nombre = [usuario.nombre, usuario.apellidos].filter(Boolean).join(' ').trim()
        if (nombre && usuario.email) return `${nombre} (${usuario.email})`
        return nombre || usuario.email || undefined
      })()

      await downloadVersionCompareExcel({
        versionesOrd,
        capitulosUnion,
        itemsByCap: allItems,
        tramosData,
        metaContrato,
        alcanceLabel,
        contratoId,
        exportadoPor,
        usuario,
      })
    } catch {
      window.alert('No se pudo exportar el Excel de comparación.')
    } finally {
      setExporting(false)
    }
  }, [
    alcance,
    capitulosUnion,
    contratoId,
    fetchItemsCapitulo,
    itemsByCap,
    loaded,
    tramo,
    tramos,
    versionesOrd,
    usuario,
  ])

  if (!open) return null

  const numSubCols = versionesOrd.length > 0 ? versionesOrd.length * 4 - 2 : 0

  const renderVersionCells = (getValues) =>
    versionesOrd.map((v, vi) => {
      const { cant, costo } = getValues(v, vi)
      const prevV = vi > 0 ? versionesOrd[vi - 1] : null
      const prevVals = prevV ? getValues(prevV, vi - 1) : { cant: null, costo: null }
      const cells = []

      cells.push(
        <Fragment key={`${v.id}-vals`}>
          <span style={{ ...td, display: 'block', textAlign: 'right', color: cant != null ? t.text : t.textMuted }}>
            {cant != null ? fmtQty(cant) : '—'}
          </span>
          <span style={{ ...td, display: 'block', textAlign: 'right', color: costo != null ? t.text : t.textMuted }}>
            {costo != null ? formatCOP(costo) : '—'}
          </span>
        </Fragment>,
      )

      if (vi > 0) {
        cells.push(
          <Fragment key={`${v.id}-delta`}>
            <span
              style={{
                ...td,
                display: 'block',
                textAlign: 'right',
                color: deltaColor(prevVals.cant, cant, t),
                fontWeight: 700,
                fontSize: 'var(--cc-caption)',
              }}
            >
              {fmtDelta(prevVals.cant, cant)}
            </span>
            <span
              style={{
                ...td,
                display: 'block',
                textAlign: 'right',
                color: deltaColor(prevVals.costo, costo, t),
                fontWeight: 700,
                fontSize: 'var(--cc-caption)',
              }}
            >
              {fmtDelta(prevVals.costo, costo, { money: true })}
            </span>
          </Fragment>,
        )
      }

      const colSpan = vi > 0 ? 4 : 2
      return (
        <td key={`pair-${v.id}`} colSpan={colSpan} style={{ padding: 0, borderLeft: `1px solid ${t.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: vi > 0 ? '1fr 1fr 1fr 1fr' : '1fr 1fr' }}>{cells}</div>
        </td>
      )
    })

  return (
    <div
      className="cc-ppto-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={onClose}
    >
      <div
        className="cc-ppto-modal-sheet"
        style={{
          width: '100%',
          maxWidth: 1200,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          background: t.bgCard,
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          boxShadow: '0 28px 90px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >        <CcModalBrandHeader theme={t} />

        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${t.border}`,
            background: '#0F1923',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 900, color: '#fff', fontSize: 'var(--cc-body)' }}>Comparación de versiones</div>
            <div style={{ fontSize: 'var(--cc-caption)', color: '#94A3B8', marginTop: 4 }}>
              {versionesOrd.map((v) => v.etiqueta).join(' · ')}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 18 }}>
            ✕
          </button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, background: t.bg }}>
          <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 800, color: t.textMuted, marginBottom: 8 }}>Alcance del análisis</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--cc-sm)' }}>
              <input type="radio" name="cmp-alcance" checked={alcance === 'general'} onChange={() => { setAlcance('general'); setLoaded(false) }} />
              General
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--cc-sm)' }}>
              <input type="radio" name="cmp-alcance" checked={alcance === 'tramo'} onChange={() => { setAlcance('tramo'); setLoaded(false) }} />
              Por tramo
            </label>
            {alcance === 'tramo' && (
              <select
                value={tramo}
                onChange={(e) => { setTramo(e.target.value); setLoaded(false) }}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: `1px solid ${t.border}`,
                  background: t.inputBg || t.bgCard,
                  color: t.text,
                  minWidth: 160,
                }}
              >
                <option value="">— Tramo —</option>
                {tramos.map((tr) => (
                  <option key={tr} value={tr}>{tr}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void cargarComparacion()}
              disabled={loading}
              style={{
                marginLeft: 'auto',
                background: t.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontWeight: 700,
                fontSize: 'var(--cc-caption)',
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? '⏳ Cargando…' : loaded ? 'Actualizar comparación' : 'Ver comparación'}
            </button>
            {loaded && (
              <button
                type="button"
                onClick={() => void exportarExcel()}
                disabled={exporting}
                title="Descargar Excel"
                aria-label="Descargar Excel"
                style={{
                  background: '#0077B618',
                  color: '#0077B6',
                  border: '1px solid #0077B6',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontWeight: 700,
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: exporting ? 'wait' : 'pointer',
                  opacity: exporting ? 0.65 : 1,
                }}
              >
                {exporting ? '⏳' : '📥'}
              </button>
            )}
          </div>
          {error && <div style={{ color: '#DC2626', fontSize: 'var(--cc-caption)', marginTop: 8 }}>{error}</div>}
        </div>

        <div className="cc-ppto-compare-scroll" style={{ flex: 1, overflow: 'auto', padding: '0 0 8px', WebkitOverflowScrolling: 'touch' }}>
          {!loaded ? (
            <div style={{ padding: 24, color: t.textMuted, fontSize: 'var(--cc-sm)', textAlign: 'center' }}>
              Elija el alcance y pulse «Ver comparación» para cargar capítulos e ítems.
            </div>
          ) : (
            <table className="cc-ppto-compare-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(820, 220 + numSubCols * 100) }}>
              <thead>
                <tr style={{ background: `${t.primary}12`, position: 'sticky', top: 0, zIndex: 2 }}>
                  <th rowSpan={2} style={{ ...th, textAlign: 'left', minWidth: 200 }}>Capítulo / Ítem</th>
                  {versionesOrd.map((v, vi) => (
                    <th
                      key={v.id}
                      colSpan={vi > 0 ? 4 : 2}
                      style={{
                        ...th,
                        textAlign: 'center',
                        borderLeft: `1px solid ${t.border}`,
                        background: v.es_vigente ? `${t.primary}28` : undefined,
                        color: v.es_vigente ? t.primary : t.text,
                      }}
                    >
                      {v.etiqueta}
                      {v.es_vigente && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800 }}>(Vigente)</span>}
                    </th>
                  ))}
                </tr>
                <tr style={{ background: `${t.primary}08`, position: 'sticky', top: 28, zIndex: 2 }}>
                  {versionesOrd.map((v, vi) => (
                    <th key={`${v.id}-sub`} colSpan={vi > 0 ? 4 : 2} style={{ padding: 0, borderLeft: `1px solid ${t.border}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: vi > 0 ? '1fr 1fr 1fr 1fr' : '1fr 1fr' }}>
                        <span style={{ ...th, display: 'block', textAlign: 'right' }}>Cantidad</span>
                        <span style={{ ...th, display: 'block', textAlign: 'right' }}>Costo dir.</span>
                        {vi > 0 && (
                          <>
                            <span style={{ ...th, display: 'block', textAlign: 'right', color: '#059669' }}>▲ Cant.</span>
                            <span style={{ ...th, display: 'block', textAlign: 'right', color: '#059669' }}>▲ Costo</span>
                          </>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {capitulosUnion.map((cap) => {
                  const openRow = expandedCap === cap
                  const itemRows = itemsByCap[cap]
                  const itemKeys = openRow && itemRows
                    ? [...new Set(itemRows.flatMap(({ items }) => items.map((it) => String(it.item))))].sort((a, b) =>
                        a.localeCompare(b, 'es', { numeric: true }),
                      )
                    : []
                  return (
                    <Fragment key={cap}>
                      <tr
                        onClick={() => void expandirCapitulo(cap)}
                        style={{
                          borderTop: `1px solid ${t.border}`,
                          cursor: 'pointer',
                          background: openRow ? `${t.primary}0A` : undefined,
                        }}
                        title="Clic para ver ítems"
                      >
                        <td style={{ ...td, fontWeight: 700 }}>
                          <span style={{ marginRight: 6 }}>{openRow ? '▼' : '▶'}</span>
                          {cap}
                        </td>
                        {renderVersionCells((v) => {
                          const data = getCapData(v.id, cap)
                          return {
                            cant: data ? Number(data.cant_total) : null,
                            costo: data ? Math.round(Number(data.costo_total) || 0) : null,
                          }
                        })}
                      </tr>
                      {openRow && itemsLoading === cap && (
                        <tr>
                          <td colSpan={1 + numSubCols} style={{ ...td, color: t.textMuted, fontStyle: 'italic' }}>
                            Cargando ítems…
                          </td>
                        </tr>
                      )}
                      {itemKeys.map((itemKey) => {
                          const existsFlags = versionesOrd.map((v) => {
                            const block = itemRows.find((x) => String(x.version.id) === String(v.id))
                            return !!block?.items?.some((it) => String(it.item) === itemKey)
                          })
                          const tags = itemTags(existsFlags)
                          const desc =
                            itemRows
                              .map((x) => x.items.find((it) => String(it.item) === itemKey)?.descripcion)
                              .find(Boolean) || ''
                          return (
                            <tr key={`${cap}-${itemKey}`} style={{ background: t.bg, borderTop: `1px dashed ${t.border}` }}>
                              <td style={{ ...td, paddingLeft: 28 }}>
                                <div style={{ fontWeight: 600 }}>{itemKey}</div>
                                {desc && <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>{desc}</div>}
                                {tags.length > 0 && (
                                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                    {tags.includes('Nuevo') && (
                                      <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#D1FAE5', padding: '1px 6px', borderRadius: 4 }}>Nuevo</span>
                                    )}
                                    {tags.includes('Dado de baja') && (
                                      <span style={{ fontSize: 10, fontWeight: 800, color: '#DC2626', background: '#FEE2E2', padding: '1px 6px', borderRadius: 4 }}>Dado de baja</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              {renderVersionCells((v) => {
                                const block = itemRows.find((x) => String(x.version.id) === String(v.id))
                                const hit = block?.items?.find((it) => String(it.item) === itemKey)
                                return {
                                  cant: hit ? Number(hit.cant_total) : null,
                                  costo: hit ? Math.round(Number(hit.costo_total) || 0) : null,
                                }
                              })}
                            </tr>
                          )
                        })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {loaded && (
          <div style={{ borderTop: `2px solid ${t.border}`, padding: '12px 16px', background: t.bg }}>
            <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 800, color: t.textMuted, marginBottom: 8 }}>Totales del alcance activo</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(versionesOrd.length, 3)}, minmax(200px, 1fr))`, gap: 12 }}>
              {versionesOrd.map((v) => {
                const vid = String(v.id)
                const costo = totalesPorVersion[vid] || 0
                const aiuStr = aiuByVersion[vid] ?? '0'
                const aiuN = parseFloat(String(aiuStr).replace(',', '.'))
                const aiuSafe = Number.isFinite(aiuN) ? Math.max(0, aiuN) : 0
                const conAiu = Math.round(costo * (1 + aiuSafe / 100))
                return (
                  <div
                    key={v.id}
                    style={{
                      border: `1px solid ${v.es_vigente ? t.primary : t.border}`,
                      borderRadius: 8,
                      padding: 10,
                      background: v.es_vigente ? `${t.primary}0A` : t.bgCard,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', marginBottom: 6 }}>{v.etiqueta}</div>
                    <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>Costo directo</div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{formatCOP(costo)}</div>
                    <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 2 }}>AIU (%)</div>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={aiuStr}
                      onChange={(e) => setAiuByVersion((p) => ({ ...p, [vid]: e.target.value }))}
                      style={{ width: 72, padding: '3px 6px', borderRadius: 4, border: `1px solid ${t.border}`, marginBottom: 6 }}
                    />
                    <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>Directo + AIU</div>
                    <div style={{ fontWeight: 800, color: t.primary }}>{formatCOP(conAiu)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
