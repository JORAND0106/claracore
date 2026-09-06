import { useCallback, useEffect, useMemo, useState } from 'react'
import PresupuestoItemSelector, { normPptoItem } from './PresupuestoItemSelector'
import {
  fmtFechaAlmacenCorta,
  fmtMoney,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

function fmtMoneyOrDash(v, hideEco) {
  if (hideEco) return '—'
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return fmtMoney(n)
}

function fmtPctOrDash(v, hideEco) {
  if (hideEco) return '—'
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(1)} %`
}

function normCap(cap) {
  return String(cap || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function itemMatchesFiltro(it, filtroCap, filtroItem, q) {
  if (filtroCap) {
    const capOk = normCap(it.capitulo) === normCap(filtroCap)
      || normCap(it.capitulo).includes(normCap(filtroCap))
    if (!capOk) return false
  }
  if (filtroItem) {
    const want = normPptoItem(filtroItem).toLowerCase()
    const got = normPptoItem(it.item).toLowerCase()
    if (got !== want && !got.includes(want) && !want.includes(got)) return false
  }
  const needle = String(q || '').trim().toLowerCase()
  if (!needle) return true
  const hay = [
    it.capitulo, it.item, it.descripcion, it.pk_id, it.item_key,
    ...(it.insumos || []).flatMap((ins) => [
      ins.codigo,
      ins.descripcion,
      ...((ins.ordenes_compra || []).flatMap((oc) => [
        oc.numero_oc_fmt,
        oc.numero_oc,
        oc.proveedor_nombre,
        oc.material_descripcion,
      ])),
    ]),
  ].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(needle)
}

function capituloMatchesFiltro(cap, filtroCap, filtroItem, q, itemsFiltrados) {
  if (filtroCap) {
    const capOk = normCap(cap.capitulo) === normCap(filtroCap)
      || normCap(cap.capitulo).includes(normCap(filtroCap))
    if (!capOk) return false
  }
  if (filtroItem || String(q || '').trim()) {
    return itemsFiltrados.length > 0
  }
  return true
}

function itemLabel(it) {
  const code = it.item ? String(it.item) : null
  const desc = (it.descripcion || '').trim()
  if (code && desc) return `${code} — ${desc}`
  return code || desc || it.item_key || `Ítem #${it.presupuesto_id}`
}

function insumoLabel(ins) {
  const code = (ins.codigo || '').trim()
  const desc = (ins.descripcion || '').trim()
  if (code && desc) return `${code} — ${desc}`
  return code || desc || `Insumo #${ins.insumo_id}`
}

function ocLabel(oc) {
  const num = (oc.numero_oc_fmt || '').trim()
    || (oc.numero_oc != null && oc.numero_oc !== '' ? `#${oc.numero_oc}` : 'Sin OC')
  const prov = (oc.proveedor_nombre || '').trim()
  if (prov && prov !== 'Sin proveedor') return `${num} — ${prov}`
  return num
}

function TraceBadge({ ok, labelOk, labelMiss }) {
  return (
    <span
      title={ok ? labelOk : labelMiss}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.02,
        textTransform: 'uppercase',
        color: ok ? 'var(--cc-color-success, #059669)' : 'var(--cc-color-danger, #dc2626)',
        opacity: ok ? 0.95 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden>{ok ? '✓' : '✗'}</span>
      {ok ? labelOk : labelMiss}
    </span>
  )
}

function TruncLabel({ children, title }) {
  const text = typeof children === 'string' ? children : undefined
  return (
    <span className="cc-almacen-inventario-trunc" title={title || text}>
      {children}
    </span>
  )
}

function ToggleCell({ open, onToggle, label, depth = 0, disabled = false }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      disabled={disabled}
      aria-expanded={open}
      className="cc-almacen-inventario-toggle"
      style={{
        fontWeight: depth === 0 ? 700 : (depth === 1 ? 600 : 500),
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.85 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 14,
          textAlign: 'center',
          opacity: disabled ? 0.35 : 1,
          flexShrink: 0,
        }}
      >
        {disabled ? '·' : (open ? '▾' : '▸')}
      </span>
      <TruncLabel title={label}>{label}</TruncLabel>
    </button>
  )
}

export default function InventarioPanel({
  permisos, token, refreshSignal = 0, onDataLoaded,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const verEconomicos = permisos?.verEconomicos !== false

  const [arbol, setArbol] = useState(null)
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filtroCap, setFiltroCap] = useState('')
  const [filtroItem, setFiltroItem] = useState('')
  const [expandedCaps, setExpandedCaps] = useState(() => new Set())
  const [expandedItems, setExpandedItems] = useState(() => new Set())
  const [expandedInsumos, setExpandedInsumos] = useState(() => new Set())

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    return Promise.all([
      api.getInventarioArbol(),
      api.getAlertasVencimiento(),
    ])
      .then(([tree, al]) => {
        setArbol(tree)
        setAlertas(Array.isArray(al) ? al : [])
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false)
        onDataLoaded?.()
      })
  }, [api, onDataLoaded])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (refreshSignal > 0) reload()
  }, [refreshSignal, reload])

  const hideEco = !verEconomicos || Boolean(arbol?.resumen?.economicos_ocultos)
  const capitulos = arbol?.capitulos || []
  const items = arbol?.items || []

  const filteredCaps = useMemo(() => (
    capitulos
      .map((cap) => {
        const itemsFiltrados = (cap.items || []).filter((it) => (
          itemMatchesFiltro(it, filtroCap, filtroItem, q)
        ))
        return { cap, itemsFiltrados }
      })
      .filter(({ cap, itemsFiltrados }) => (
        capituloMatchesFiltro(cap, filtroCap, filtroItem, q, itemsFiltrados)
      ))
  ), [capitulos, filtroCap, filtroItem, q])

  const filteredItemCount = useMemo(
    () => filteredCaps.reduce((n, row) => n + row.itemsFiltrados.length, 0),
    [filteredCaps],
  )

  const toggleCap = (key) => {
    setExpandedCaps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleItem = (key) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleInsumo = (key) => {
    setExpandedInsumos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const onFiltroChange = ({ capitulo, item }) => {
    setFiltroCap(capitulo || '')
    setFiltroItem(item || '')
  }

  const limpiarFiltro = () => {
    setFiltroCap('')
    setFiltroItem('')
    setQ('')
  }

  useEffect(() => {
    if (!filtroCap && !filtroItem && !q.trim()) return
    const keys = filteredCaps.map(({ cap }) => cap.capitulo_key || cap.capitulo)
    setExpandedCaps((prev) => {
      let changed = false
      const next = new Set(prev)
      keys.forEach((k) => {
        if (!next.has(k)) {
          next.add(k)
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [filtroCap, filtroItem, q, filteredCaps])

  const th = {
    ...ui.th,
    fontSize: 'var(--cc-xs)',
    padding: '8px 10px',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  }
  const td = {
    ...ui.td,
    fontSize: 'var(--cc-xs)',
    padding: '6px 10px',
    verticalAlign: 'middle',
    height: 36,
    maxHeight: 36,
    lineHeight: '22px',
  }
  const tdLabel = {
    ...td,
    minWidth: compact ? 280 : 420,
    maxWidth: compact ? 420 : 640,
    width: compact ? '36%' : '42%',
    overflow: 'hidden',
  }
  const num = {
    ...td,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  }

  const filtroActivo = Boolean(filtroCap || filtroItem || q.trim())
  const colSpan = verEconomicos ? 8 : 4

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📊 Inventario</div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
          Capítulo → Ítem → Insumo → OC. Valores por insumo y trazabilidad OC → Entrada → Salida.
        </div>
        {arbol?.generado_at && (
          <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 4 }}>
            Actualizado: {fmtFechaAlmacenCorta(arbol.generado_at)}
          </div>
        )}
      </div>

      {alertas.length > 0 && (
        <div style={{
          ...ui.card,
          marginBottom: 16,
          borderColor: 'var(--cc-almacen-border)',
          background: 'var(--cc-almacen-input-bg)',
        }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ Alertas de vencimiento</div>
          {alertas.map((a) => (
            <div key={a.entrada_item_id} style={{ fontSize: 'var(--cc-sm)', marginBottom: 4 }}>
              {a.material_descripcion} — Lote {a.lote || 'N/D'} — Vence {a.fecha_vencimiento}
              {a.vencido ? ' (VENCIDO)' : ` (${a.dias_restantes} días)`}
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ color: ui.textMuted }}>Cargando inventario…</div>
      ) : (
        <>
          <div style={{ ...ui.card, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 'var(--cc-sm)' }}>
              Filtro por capítulo e ítem
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <PresupuestoItemSelector
                  capitulo={filtroCap}
                  item={filtroItem}
                  onChange={onFiltroChange}
                />
              </div>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar texto libre…"
                aria-label="Buscar en inventario"
                data-testid="inventario-busqueda"
                style={{ ...ui.input, flex: '1 1 200px', margin: 0, maxWidth: 280 }}
              />
              {filtroActivo && (
                <button
                  type="button"
                  onClick={limpiarFiltro}
                  style={{
                    ...ui.btnSecondary,
                    padding: '8px 12px',
                    fontSize: 'var(--cc-sm)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Ver todo el listado
                </button>
              )}
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 8 }}>
              Mostrando {filteredCaps.length} capítulo{filteredCaps.length === 1 ? '' : 's'}
              {' · '}
              {filteredItemCount} ítem{filteredItemCount === 1 ? '' : 's'}
              {' de '}
              {items.length}
            </div>
          </div>

          <div
            style={{ ...ui.sheetWrap, maxHeight: compact ? '70vh' : '78vh', overflow: 'auto' }}
            className="cc-almacen-table-scroll"
            data-testid="inventario-excel-table"
          >
            <table
              className="cc-almacen-inventario-excel"
              style={{
                ...ui.sheetTable,
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: compact ? 820 : 1120,
                tableLayout: 'fixed',
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', width: compact ? '34%' : '40%' }}>
                    Capítulo / Ítem / Insumo / OC
                  </th>
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>VU Cobro</th>}
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>VU Costo</th>}
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>Utilidad</th>}
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>% Rentabilidad</th>}
                  <th style={{ ...th, textAlign: 'right' }}>Valor entradas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor salidas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredCaps.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colSpan}
                      style={{ ...td, color: ui.textMuted, textAlign: 'center', padding: 24 }}
                    >
                      {items.length === 0
                        ? 'No hay ítems en el listado de precios de este contrato.'
                        : 'Ningún capítulo/ítem coincide con el filtro.'}
                    </td>
                  </tr>
                ) : filteredCaps.map(({ cap, itemsFiltrados }) => {
                  const capKey = cap.capitulo_key || cap.capitulo
                  const capOpen = expandedCaps.has(capKey)
                  const hasItems = itemsFiltrados.length > 0
                  return (
                    <FragmentCapitulo
                      key={capKey}
                      cap={cap}
                      items={itemsFiltrados}
                      capKey={capKey}
                      capOpen={capOpen}
                      hasItems={hasItems}
                      toggleCap={toggleCap}
                      toggleItem={toggleItem}
                      toggleInsumo={toggleInsumo}
                      expandedItems={expandedItems}
                      expandedInsumos={expandedInsumos}
                      td={td}
                      tdLabel={tdLabel}
                      num={num}
                      ui={ui}
                      verEconomicos={verEconomicos}
                      hideEco={hideEco}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function FragmentCapitulo({
  cap,
  items,
  capKey,
  capOpen,
  hasItems,
  toggleCap,
  toggleItem,
  toggleInsumo,
  expandedItems,
  expandedInsumos,
  td,
  tdLabel,
  num,
  ui,
  verEconomicos,
  hideEco,
}) {
  return (
    <>
      <tr
        data-testid={`inventario-cap-${capKey}`}
        style={{
          background: capOpen
            ? 'var(--cc-almacen-accent-soft, rgba(0,119,182,0.06))'
            : undefined,
        }}
      >
        <td style={tdLabel}>
          <ToggleCell
            open={capOpen}
            onToggle={() => toggleCap(capKey)}
            label={cap.capitulo || 'Sin capítulo'}
            depth={0}
            disabled={!hasItems}
          />
        </td>
        {verEconomicos && <td style={num}>—</td>}
        {verEconomicos && <td style={num}>—</td>}
        {verEconomicos && <td style={num}>—</td>}
        {verEconomicos && <td style={num}>—</td>}
        <td style={num}>{fmtMoneyOrDash(cap.valor_entradas, hideEco)}</td>
        <td style={num}>{fmtMoneyOrDash(cap.valor_salidas, hideEco)}</td>
        <td style={{ ...num, fontWeight: 700 }}>
          {fmtMoneyOrDash(cap.valor_stock ?? cap.stock, hideEco)}
        </td>
      </tr>

      {capOpen && items.map((it) => {
        const itemKey = it.item_key || String(it.presupuesto_id || '')
        const itemOpen = expandedItems.has(itemKey)
        const hasInsumos = (it.insumos || []).length > 0
        const utilColor = it.utilidad == null
          ? undefined
          : (Number(it.utilidad) >= 0 ? 'var(--cc-color-success, #059669)' : 'var(--cc-color-danger, #dc2626)')
        const rentColor = it.rentabilidad_pct == null
          ? undefined
          : (Number(it.rentabilidad_pct) >= 0 ? 'var(--cc-color-success, #059669)' : 'var(--cc-color-danger, #dc2626)')
        return (
          <FragmentItem
            key={itemKey}
            it={it}
            itemKey={itemKey}
            itemOpen={itemOpen}
            hasInsumos={hasInsumos}
            toggleItem={toggleItem}
            toggleInsumo={toggleInsumo}
            expandedInsumos={expandedInsumos}
            td={td}
            tdLabel={tdLabel}
            num={num}
            ui={ui}
            verEconomicos={verEconomicos}
            hideEco={hideEco}
            utilColor={utilColor}
            rentColor={rentColor}
          />
        )
      })}
    </>
  )
}

function FragmentItem({
  it,
  itemKey,
  itemOpen,
  hasInsumos,
  toggleItem,
  toggleInsumo,
  expandedInsumos,
  td,
  tdLabel,
  num,
  ui,
  verEconomicos,
  hideEco,
  utilColor,
  rentColor,
}) {
  return (
    <>
      <tr
        data-testid={`inventario-item-${itemKey}`}
        style={{
          background: 'var(--cc-almacen-input-bg, rgba(0,0,0,0.02))',
        }}
      >
        <td style={{ ...tdLabel, paddingLeft: 22 }}>
          <ToggleCell
            open={itemOpen}
            onToggle={() => toggleItem(itemKey)}
            label={itemLabel(it)}
            depth={1}
            disabled={!hasInsumos}
          />
        </td>
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(it.vu_cobro, hideEco)}</td>}
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(it.vu_costo, hideEco)}</td>}
        {verEconomicos && (
          <td style={{ ...num, color: utilColor, fontWeight: utilColor ? 700 : undefined }}>
            {fmtMoneyOrDash(it.utilidad, hideEco)}
          </td>
        )}
        {verEconomicos && (
          <td style={{ ...num, color: rentColor, fontWeight: rentColor ? 700 : undefined }}>
            {fmtPctOrDash(it.rentabilidad_pct, hideEco)}
          </td>
        )}
        <td style={num}>{fmtMoneyOrDash(it.valor_entradas, hideEco)}</td>
        <td style={num}>{fmtMoneyOrDash(it.valor_salidas, hideEco)}</td>
        <td style={{ ...num, fontWeight: 700 }}>
          {fmtMoneyOrDash(it.valor_stock ?? it.stock, hideEco)}
        </td>
      </tr>

      {itemOpen && (it.insumos || []).map((ins) => {
        const insKey = `${itemKey}:ins:${ins.insumo_id}`
        const insOpen = expandedInsumos.has(insKey)
        const ocs = ins.ordenes_compra || []
        const hasOcs = ocs.length > 0
        return (
          <FragmentInsumo
            key={insKey}
            ins={ins}
            insKey={insKey}
            insOpen={insOpen}
            hasOcs={hasOcs}
            toggleInsumo={toggleInsumo}
            td={td}
            tdLabel={tdLabel}
            num={num}
            ui={ui}
            verEconomicos={verEconomicos}
            hideEco={hideEco}
          />
        )
      })}
    </>
  )
}

function FragmentInsumo({
  ins,
  insKey,
  insOpen,
  hasOcs,
  toggleInsumo,
  td,
  tdLabel,
  num,
  ui,
  verEconomicos,
  hideEco,
}) {
  const ocs = ins.ordenes_compra || []
  const tdOc = {
    ...td,
    height: 'auto',
    maxHeight: 'none',
    lineHeight: 1.35,
    paddingTop: 8,
    paddingBottom: 8,
    verticalAlign: 'top',
  }
  const tdOcLabel = {
    ...tdLabel,
    ...tdOc,
  }
  const numOc = {
    ...num,
    ...tdOc,
  }
  return (
    <>
      <tr
        data-testid={`inventario-insumo-${insKey}`}
        style={{
          background: insOpen
            ? 'var(--cc-almacen-accent-soft, rgba(0,119,182,0.04))'
            : undefined,
        }}
      >
        <td style={{ ...tdLabel, paddingLeft: 44, color: ui.textMuted }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <ToggleCell
              open={insOpen}
              onToggle={() => toggleInsumo(insKey)}
              label={insumoLabel(ins)}
              depth={2}
              disabled={!hasOcs}
            />
            {ins.es_principal === false && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                opacity: 0.85,
                flexShrink: 0,
              }}
              >
                asociado
              </span>
            )}
          </div>
        </td>
        {verEconomicos && <td style={num}>—</td>}
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(ins.vu_costo, hideEco)}</td>}
        {verEconomicos && <td style={num}>—</td>}
        {verEconomicos && <td style={num}>—</td>}
        <td style={num}>{fmtMoneyOrDash(ins.valor_entradas, hideEco)}</td>
        <td style={num}>{fmtMoneyOrDash(ins.valor_salidas, hideEco)}</td>
        <td style={{ ...num, fontWeight: 600 }}>
          {fmtMoneyOrDash(ins.valor_stock ?? ins.stock, hideEco)}
        </td>
      </tr>

      {insOpen && ocs.map((oc) => {
        const ocId = oc.orden_compra_id ?? oc.numero_oc ?? 'x'
        return (
          <tr
            key={`${insKey}:oc:${ocId}`}
            data-testid={`inventario-oc-${insKey}-${ocId}`}
          >
            <td style={{ ...tdOcLabel, paddingLeft: 66, color: ui.textMuted }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <TruncLabel title={ocLabel(oc)}>
                  <span style={{ fontWeight: 600 }}>{ocLabel(oc)}</span>
                </TruncLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px' }}>
                  <TraceBadge
                    ok={Boolean(oc.tiene_entrada)}
                    labelOk="Entrada"
                    labelMiss="Sin entrada"
                  />
                  <TraceBadge
                    ok={Boolean(oc.tiene_salida)}
                    labelOk="Salida"
                    labelMiss="Sin salida"
                  />
                </div>
              </div>
            </td>
            {verEconomicos && <td style={numOc}>—</td>}
            {verEconomicos && (
              <td style={numOc}>{fmtMoneyOrDash(oc.valor_unitario, hideEco)}</td>
            )}
            {verEconomicos && <td style={numOc}>—</td>}
            {verEconomicos && <td style={numOc}>—</td>}
            <td style={numOc}>{fmtMoneyOrDash(oc.valor_entradas, hideEco)}</td>
            <td style={numOc}>{fmtMoneyOrDash(oc.valor_salidas, hideEco)}</td>
            <td style={numOc}>{fmtMoneyOrDash(oc.valor_stock ?? oc.saldo, hideEco)}</td>
          </tr>
        )
      })}
    </>
  )
}
