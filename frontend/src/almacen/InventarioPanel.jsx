import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import PresupuestoItemSelector, { normPptoItem } from './PresupuestoItemSelector'
import {
  fmtCant,
  fmtFechaAlmacenCorta,
  fmtMoney,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

const CHART_COLORS = {
  stock: '#059669',
  entradas: '#0077B6',
  salidas: '#D97706',
}

function fmtNum(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return fmtCant(n)
}

function fmtMoneyOrDash(v, hideEco) {
  if (hideEco) return '—'
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return fmtMoney(n)
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
    ...(it.ordenes_compra || []).flatMap((oc) => [
      oc.numero_oc_fmt, oc.numero_oc, oc.proveedor_nombre, oc.material_descripcion,
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
  // Si hay filtro de ítem o texto, el capítulo queda solo si tiene ítems coincidentes
  if (filtroItem || String(q || '').trim()) {
    return itemsFiltrados.length > 0
  }
  return true
}

function itemLabel(it) {
  const parts = [it.item].filter(Boolean)
  const code = parts.length ? String(parts[0]) : null
  const desc = (it.descripcion || '').trim()
  if (code && desc) return `${code} — ${desc}`
  return code || desc || it.item_key || `Ítem #${it.presupuesto_id}`
}

function ocLabel(oc) {
  const num = oc.numero_oc_fmt || (oc.numero_oc != null ? `#${oc.numero_oc}` : 'Sin OC')
  const prov = (oc.proveedor_nombre || '').trim()
  const mat = (oc.material_descripcion || '').trim()
  const parts = [num]
  if (prov) parts.push(prov)
  if (mat) parts.push(mat)
  return parts.join(' · ')
}

function TruncLabel({ children, title }) {
  const text = typeof children === 'string' ? children : undefined
  return (
    <span
      className="cc-almacen-inventario-trunc"
      title={title || text}
    >
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

function GraficoResumenInventario({ resumen, titulo, ui, hideEco }) {
  const chartData = useMemo(() => ([
    {
      nombre: 'Valores',
      valor_stock: Number(resumen?.valor_stock || 0),
      valor_entradas: Number(resumen?.valor_entradas || 0),
      valor_salidas: Number(resumen?.valor_salidas || 0),
    },
  ]), [resumen])

  if (hideEco) {
    return (
      <div style={{ ...ui.card, marginBottom: 16, fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
        Resumen de valores económicos no disponible para su perfil.
      </div>
    )
  }

  return (
    <div style={{ ...ui.card, marginBottom: 16 }} data-testid="inventario-resumen-chart">
      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 'var(--cc-sm)' }}>
        {titulo || 'Resumen del inventario'}
      </div>
      <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 12 }}>
        Stock: {fmtMoney(resumen?.valor_stock)} · Entradas: {fmtMoney(resumen?.valor_entradas)} · Salidas: {fmtMoney(resumen?.valor_salidas)}
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={ui.textMuted} opacity={0.25} />
            <XAxis dataKey="nombre" tick={{ fill: ui.textMuted, fontSize: 11 }} />
            <YAxis
              tick={{ fill: ui.textMuted, fontSize: 11 }}
              tickFormatter={(v) => fmtMoney(v)}
            />
            <Tooltip formatter={(v) => fmtMoney(v)} />
            <Legend />
            <Bar dataKey="valor_stock" name="Valor stock" fill={CHART_COLORS.stock} radius={[4, 4, 0, 0]} />
            <Bar dataKey="valor_entradas" name="Valor entradas" fill={CHART_COLORS.entradas} radius={[4, 4, 0, 0]} />
            <Bar dataKey="valor_salidas" name="Valor salidas" fill={CHART_COLORS.salidas} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
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
  const [selectedKey, setSelectedKey] = useState(null)
  const [selectedKind, setSelectedKind] = useState(null) // 'capitulo' | 'item'
  const [expandedCaps, setExpandedCaps] = useState(() => new Set())
  const [expandedItems, setExpandedItems] = useState(() => new Set())

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

  const filteredCaps = useMemo(() => {
    return capitulos
      .map((cap) => {
        const itemsFiltrados = (cap.items || []).filter((it) => (
          itemMatchesFiltro(it, filtroCap, filtroItem, q)
        ))
        return { cap, itemsFiltrados }
      })
      .filter(({ cap, itemsFiltrados }) => (
        capituloMatchesFiltro(cap, filtroCap, filtroItem, q, itemsFiltrados)
      ))
  }, [capitulos, filtroCap, filtroItem, q])

  const filteredItemCount = useMemo(
    () => filteredCaps.reduce((n, row) => n + row.itemsFiltrados.length, 0),
    [filteredCaps],
  )

  const selectedCap = useMemo(() => {
    if (selectedKind !== 'capitulo' || !selectedKey) return null
    return capitulos.find((c) => (c.capitulo_key || c.capitulo) === selectedKey) || null
  }, [capitulos, selectedKey, selectedKind])

  const selectedItem = useMemo(() => {
    if (selectedKind !== 'item' || !selectedKey) return null
    return items.find((it) => (it.item_key || String(it.presupuesto_id || '')) === selectedKey) || null
  }, [items, selectedKey, selectedKind])

  const chartResumen = selectedItem
    ? {
      valor_stock: selectedItem.valor_stock,
      valor_entradas: selectedItem.valor_entradas,
      valor_salidas: selectedItem.valor_salidas,
    }
    : selectedCap
      ? {
        valor_stock: selectedCap.valor_stock,
        valor_entradas: selectedCap.valor_entradas,
        valor_salidas: selectedCap.valor_salidas,
      }
      : (arbol?.resumen || {})

  const chartTitulo = selectedItem
    ? `Resumen del ítem: ${itemLabel(selectedItem)}`
    : selectedCap
      ? `Resumen del capítulo: ${selectedCap.capitulo}`
      : 'Resumen general del contrato'

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

  const selectCapitulo = (cap) => {
    setSelectedKind('capitulo')
    setSelectedKey(cap.capitulo_key || cap.capitulo)
  }

  const selectItem = (it) => {
    setSelectedKind('item')
    setSelectedKey(it.item_key || String(it.presupuesto_id || ''))
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

  // Auto-expand chapters when filtering narrows the tree
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
  const colSpan = verEconomicos ? 9 : 6

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📊 Inventario</div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
          Jerarquía Capítulo → Ítem → Orden de compra. Clic en un capítulo o ítem para ver su resumen en el gráfico.
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
          <GraficoResumenInventario
            resumen={chartResumen}
            titulo={chartTitulo}
            ui={ui}
            hideEco={hideEco}
          />

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
              {selectedItem
                ? ` · Gráfico: ${itemLabel(selectedItem)}`
                : selectedCap
                  ? ` · Gráfico: ${selectedCap.capitulo}`
                  : ' · Gráfico: total del contrato'}
            </div>
          </div>

          <div
            style={{ ...ui.sheetWrap, maxHeight: compact ? '70vh' : '72vh', overflow: 'auto' }}
            className="cc-almacen-table-scroll"
            data-testid="inventario-excel-table"
          >
            <table
              className="cc-almacen-inventario-excel"
              style={{
                ...ui.sheetTable,
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: compact ? 860 : 1180,
                tableLayout: 'fixed',
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', width: compact ? '34%' : '40%' }}>
                    Capítulo / Ítem / OC
                  </th>
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>VU Cobro</th>}
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>VU Costo</th>}
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>Utilidad</th>}
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>Valor entradas</th>}
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>Valor salidas</th>}
                  <th style={{ ...th, textAlign: 'right' }}>Entradas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Salidas</th>
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
                  const isSelected = selectedKind === 'capitulo' && selectedKey === capKey
                  return (
                    <FragmentCapitulo
                      key={capKey}
                      cap={cap}
                      items={itemsFiltrados}
                      capKey={capKey}
                      capOpen={capOpen}
                      hasItems={hasItems}
                      isSelected={isSelected}
                      selectCapitulo={selectCapitulo}
                      selectItem={selectItem}
                      toggleCap={toggleCap}
                      toggleItem={toggleItem}
                      expandedItems={expandedItems}
                      selectedKey={selectedKey}
                      selectedKind={selectedKind}
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
  isSelected,
  selectCapitulo,
  selectItem,
  toggleCap,
  toggleItem,
  expandedItems,
  selectedKey,
  selectedKind,
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
        onClick={() => selectCapitulo(cap)}
        style={{
          background: isSelected
            ? 'var(--cc-almacen-accent-soft, rgba(0,119,182,0.12))'
            : (capOpen ? 'var(--cc-almacen-accent-soft, rgba(0,119,182,0.06))' : undefined),
          cursor: 'pointer',
          outline: isSelected ? '2px solid var(--cc-almacen-accent, #0077B6)' : undefined,
          outlineOffset: -2,
        }}
      >
        <td style={tdLabel}>
          <ToggleCell
            open={capOpen}
            onToggle={() => {
              selectCapitulo(cap)
              toggleCap(capKey)
            }}
            label={cap.capitulo || 'Sin capítulo'}
            depth={0}
            disabled={!hasItems}
          />
        </td>
        {verEconomicos && <td style={num}>—</td>}
        {verEconomicos && <td style={num}>—</td>}
        {verEconomicos && <td style={num}>—</td>}
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(cap.valor_entradas, hideEco)}</td>}
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(cap.valor_salidas, hideEco)}</td>}
        <td style={num}>{fmtNum(cap.entradas)}</td>
        <td style={num}>{fmtNum(cap.salidas)}</td>
        <td style={{ ...num, fontWeight: 700 }}>
          {verEconomicos && !hideEco
            ? fmtMoneyOrDash(cap.valor_stock ?? cap.stock, hideEco)
            : fmtNum(cap.saldo)}
        </td>
      </tr>

      {capOpen && items.map((it) => {
        const itemKey = it.item_key || String(it.presupuesto_id || '')
        const itemOpen = expandedItems.has(itemKey)
        const hasOc = (it.ordenes_compra || []).length > 0
        const isItemSelected = selectedKind === 'item' && selectedKey === itemKey
        const utilColor = it.utilidad == null
          ? undefined
          : (Number(it.utilidad) >= 0 ? 'var(--cc-color-success, #059669)' : 'var(--cc-color-danger, #dc2626)')
        return (
          <FragmentItem
            key={itemKey}
            it={it}
            itemKey={itemKey}
            itemOpen={itemOpen}
            hasOc={hasOc}
            isSelected={isItemSelected}
            selectItem={selectItem}
            toggleItem={toggleItem}
            td={td}
            tdLabel={tdLabel}
            num={num}
            ui={ui}
            verEconomicos={verEconomicos}
            hideEco={hideEco}
            utilColor={utilColor}
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
  hasOc,
  isSelected,
  selectItem,
  toggleItem,
  td,
  tdLabel,
  num,
  ui,
  verEconomicos,
  hideEco,
  utilColor,
}) {
  return (
    <>
      <tr
        data-testid={`inventario-item-${itemKey}`}
        onClick={() => selectItem(it)}
        style={{
          background: isSelected
            ? 'var(--cc-almacen-accent-soft, rgba(0,119,182,0.10))'
            : 'var(--cc-almacen-input-bg, rgba(0,0,0,0.02))',
          cursor: 'pointer',
          outline: isSelected ? '2px solid var(--cc-almacen-accent, #0077B6)' : undefined,
          outlineOffset: -2,
        }}
      >
        <td style={{ ...tdLabel, paddingLeft: 22 }}>
          <ToggleCell
            open={itemOpen}
            onToggle={() => {
              selectItem(it)
              toggleItem(itemKey)
            }}
            label={itemLabel(it)}
            depth={1}
            disabled={!hasOc}
          />
        </td>
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(it.vu_cobro, hideEco)}</td>}
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(it.vu_costo, hideEco)}</td>}
        {verEconomicos && (
          <td style={{ ...num, color: utilColor, fontWeight: utilColor ? 700 : undefined }}>
            {fmtMoneyOrDash(it.utilidad, hideEco)}
          </td>
        )}
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(it.valor_entradas, hideEco)}</td>}
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(it.valor_salidas, hideEco)}</td>}
        <td style={num}>{fmtNum(it.entradas)}</td>
        <td style={num}>{fmtNum(it.salidas)}</td>
        <td style={{ ...num, fontWeight: 700 }}>{fmtNum(it.saldo ?? it.stock)}</td>
      </tr>

      {itemOpen && (it.ordenes_compra || []).map((oc) => (
        <tr
          key={`${itemKey}:oc:${oc.orden_compra_id ?? oc.numero_oc ?? oc.numero_oc_fmt}`}
          data-testid={`inventario-oc-${itemKey}-${oc.orden_compra_id ?? oc.numero_oc ?? 'x'}`}
        >
          <td style={{ ...tdLabel, paddingLeft: 44, color: ui.textMuted }}>
            <TruncLabel title={ocLabel(oc)}>
              <span style={{ fontWeight: 600 }}>{oc.numero_oc_fmt || 'Sin OC'}</span>
              {oc.proveedor_nombre ? ` · ${oc.proveedor_nombre}` : ''}
              {oc.material_descripcion ? ` · ${oc.material_descripcion}` : ''}
            </TruncLabel>
          </td>
          {verEconomicos && <td style={num}>—</td>}
          {verEconomicos && (
            <td style={num}>{fmtMoneyOrDash(oc.valor_unitario, hideEco)}</td>
          )}
          {verEconomicos && <td style={num}>—</td>}
          {verEconomicos && <td style={num}>{fmtMoneyOrDash(oc.valor_entradas, hideEco)}</td>}
          {verEconomicos && <td style={num}>{fmtMoneyOrDash(oc.valor_salidas, hideEco)}</td>}
          <td style={num}>{fmtNum(oc.entradas)}</td>
          <td style={num}>{fmtNum(oc.salidas)}</td>
          <td style={{ ...num, fontWeight: 700, color: 'var(--cc-color-success, #059669)' }}>
            {fmtNum(oc.saldo)}
          </td>
        </tr>
      ))}
    </>
  )
}
