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
    ...(it.insumos || []).flatMap((ins) => [ins.codigo, ins.descripcion]),
  ].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(needle)
}

function itemLabel(it) {
  const parts = [it.capitulo, it.item].filter(Boolean)
  const code = parts.length ? parts.join(' · ') : null
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

function rowKey(it) {
  return it.item_key || String(it.presupuesto_id || '')
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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: 'none',
        background: 'transparent',
        padding: 0,
        margin: 0,
        cursor: disabled ? 'default' : 'pointer',
        font: 'inherit',
        fontWeight: depth === 0 ? 700 : 600,
        color: 'inherit',
        textAlign: 'left',
        maxWidth: '100%',
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
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
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
  const items = arbol?.items || []

  const filtered = useMemo(
    () => items.filter((it) => itemMatchesFiltro(it, filtroCap, filtroItem, q)),
    [items, filtroCap, filtroItem, q],
  )

  const selectedItem = useMemo(() => {
    if (!selectedKey) return null
    return items.find((it) => rowKey(it) === selectedKey) || null
  }, [items, selectedKey])

  const chartResumen = selectedItem
    ? {
      valor_stock: selectedItem.valor_stock,
      valor_entradas: selectedItem.valor_entradas,
      valor_salidas: selectedItem.valor_salidas,
    }
    : (arbol?.resumen || {})

  const chartTitulo = selectedItem
    ? `Resumen del ítem: ${itemLabel(selectedItem)}`
    : 'Resumen general del contrato'

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

  const selectItem = (it) => {
    const key = rowKey(it)
    setSelectedKey(key)
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
    padding: '7px 10px',
    verticalAlign: 'middle',
  }
  const num = {
    ...td,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  }

  const filtroActivo = Boolean(filtroCap || filtroItem || q.trim())

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📊 Inventario</div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
          Listado de precios del contrato en tabla Excel. Clic en un ítem para ver su resumen en el gráfico.
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
              Mostrando {filtered.length} de {items.length} ítem{items.length === 1 ? '' : 's'}
              {selectedItem ? ` · Gráfico: ${itemLabel(selectedItem)}` : ' · Gráfico: total del contrato'}
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
                minWidth: compact ? 760 : 1100,
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', minWidth: 220 }}>Ítem / Insumo / Proveedor</th>
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>VU Cobro</th>}
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>VU Costo</th>}
                  <th style={{ ...th, textAlign: 'right' }}>Rendimiento</th>
                  {verEconomicos && <th style={{ ...th, textAlign: 'right' }}>Utilidad</th>}
                  <th style={{ ...th, textAlign: 'right' }}>Entradas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Salidas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={verEconomicos ? 8 : 5}
                      style={{ ...td, color: ui.textMuted, textAlign: 'center', padding: 24 }}
                    >
                      {items.length === 0
                        ? 'No hay ítems en el listado de precios de este contrato.'
                        : 'Ningún ítem coincide con el filtro.'}
                    </td>
                  </tr>
                ) : filtered.map((it) => {
                  const key = rowKey(it)
                  const itemOpen = expandedItems.has(key)
                  const hasInsumos = (it.insumos || []).length > 0
                  const isSelected = selectedKey === key
                  const utilColor = it.utilidad == null
                    ? undefined
                    : (Number(it.utilidad) >= 0 ? 'var(--cc-color-success, #059669)' : 'var(--cc-color-danger, #dc2626)')
                  return (
                    <FragmentItem
                      key={key}
                      it={it}
                      rowId={key}
                      itemOpen={itemOpen}
                      hasInsumos={hasInsumos}
                      isSelected={isSelected}
                      selectItem={selectItem}
                      toggleItem={toggleItem}
                      toggleInsumo={toggleInsumo}
                      expandedInsumos={expandedInsumos}
                      td={td}
                      num={num}
                      ui={ui}
                      verEconomicos={verEconomicos}
                      hideEco={hideEco}
                      utilColor={utilColor}
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

function FragmentItem({
  it,
  rowId,
  itemOpen,
  hasInsumos,
  isSelected,
  selectItem,
  toggleItem,
  toggleInsumo,
  expandedInsumos,
  td,
  num,
  ui,
  verEconomicos,
  hideEco,
  utilColor,
}) {
  return (
    <>
      <tr
        data-testid={`inventario-item-${rowId}`}
        onClick={() => selectItem(it)}
        style={{
          background: isSelected
            ? 'var(--cc-almacen-accent-soft, rgba(0,119,182,0.12))'
            : (itemOpen ? 'var(--cc-almacen-accent-soft, rgba(0,119,182,0.06))' : undefined),
          cursor: 'pointer',
          outline: isSelected ? '2px solid var(--cc-almacen-accent, #0077B6)' : undefined,
          outlineOffset: -2,
        }}
      >
        <td style={td}>
          <ToggleCell
            open={itemOpen}
            onToggle={() => {
              selectItem(it)
              toggleItem(rowId)
            }}
            label={itemLabel(it)}
            depth={0}
            disabled={!hasInsumos}
          />
        </td>
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(it.vu_cobro, hideEco)}</td>}
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(it.vu_costo, hideEco)}</td>}
        <td style={num}>{fmtNum(it.rendimiento)}</td>
        {verEconomicos && (
          <td style={{ ...num, color: utilColor, fontWeight: utilColor ? 700 : undefined }}>
            {fmtMoneyOrDash(it.utilidad, hideEco)}
          </td>
        )}
        <td style={num}>{fmtNum(it.entradas)}</td>
        <td style={num}>{fmtNum(it.salidas)}</td>
        <td style={{ ...num, fontWeight: 700 }}>{fmtNum(it.saldo)}</td>
      </tr>

      {itemOpen && (it.insumos || []).map((ins) => {
        const ikey = `${rowId}:${ins.insumo_id}`
        const insOpen = expandedInsumos.has(ikey)
        const hasProv = (ins.proveedores || []).length > 0
        const utilI = ins.utilidad == null
          ? undefined
          : (Number(ins.utilidad) >= 0 ? 'var(--cc-color-success, #059669)' : 'var(--cc-color-danger, #dc2626)')
        return (
          <FragmentInsumo
            key={ikey}
            ins={ins}
            ikey={ikey}
            insOpen={insOpen}
            hasProv={hasProv}
            toggleInsumo={toggleInsumo}
            td={td}
            num={num}
            ui={ui}
            verEconomicos={verEconomicos}
            hideEco={hideEco}
            utilI={utilI}
          />
        )
      })}
    </>
  )
}

function FragmentInsumo({
  ins,
  ikey,
  insOpen,
  hasProv,
  toggleInsumo,
  td,
  num,
  ui,
  verEconomicos,
  hideEco,
  utilI,
}) {
  return (
    <>
      <tr
        data-testid={`inventario-insumo-${ikey}`}
        style={{ background: 'var(--cc-almacen-input-bg, rgba(0,0,0,0.02))' }}
      >
        <td style={{ ...td, paddingLeft: 28 }}>
          <ToggleCell
            open={insOpen}
            onToggle={() => toggleInsumo(ikey)}
            label={insumoLabel(ins)}
            depth={1}
            disabled={!hasProv}
          />
          {ins.es_principal === false && (
            <span style={{
              marginLeft: 8,
              fontSize: 10,
              color: ui.textMuted,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
            >
              asociado
            </span>
          )}
        </td>
        {verEconomicos && <td style={num}>—</td>}
        {verEconomicos && <td style={num}>{fmtMoneyOrDash(ins.vu_costo, hideEco)}</td>}
        <td style={num}>{fmtNum(ins.rendimiento)}</td>
        {verEconomicos && (
          <td style={{ ...num, color: utilI, fontWeight: utilI ? 600 : undefined }}>
            {fmtMoneyOrDash(ins.utilidad, hideEco)}
          </td>
        )}
        <td style={num}>{fmtNum(ins.entradas)}</td>
        <td style={num}>{fmtNum(ins.salidas)}</td>
        <td style={{ ...num, fontWeight: 700 }}>{fmtNum(ins.saldo)}</td>
      </tr>

      {insOpen && (ins.proveedores || []).map((pr) => (
        <tr
          key={`${ikey}:${pr.proveedor_id ?? pr.proveedor_nombre}`}
          data-testid={`inventario-prov-${ikey}-${pr.proveedor_id ?? 'x'}`}
        >
          <td style={{ ...td, paddingLeft: 48, color: ui.textMuted }}>
            <span style={{ fontWeight: 600 }}>{pr.proveedor_nombre || 'Sin proveedor'}</span>
          </td>
          {verEconomicos && <td style={num}>—</td>}
          {verEconomicos && <td style={num}>—</td>}
          <td style={num}>—</td>
          {verEconomicos && <td style={num}>—</td>}
          <td style={num}>{fmtNum(pr.entradas)}</td>
          <td style={num}>{fmtNum(pr.salidas)}</td>
          <td style={{ ...num, fontWeight: 700, color: 'var(--cc-color-success, #059669)' }}>
            {fmtNum(pr.saldo)}
          </td>
        </tr>
      ))}
    </>
  )
}
