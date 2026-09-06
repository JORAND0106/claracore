import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
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

function itemLabel(it) {
  const parts = [it.capitulo, it.item].filter(Boolean)
  const code = parts.length ? parts.join(' · ') : null
  const desc = (it.descripcion || '').trim()
  if (code && desc) return `${code} — ${desc}`
  return code || desc || `Ítem #${it.presupuesto_id}`
}

function insumoLabel(ins) {
  const code = (ins.codigo || '').trim()
  const desc = (ins.descripcion || '').trim()
  if (code && desc) return `${code} — ${desc}`
  return code || desc || `Insumo #${ins.insumo_id}`
}

function ToggleCell({ open, onToggle, label, depth = 0, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
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

function GraficoResumenInventario({ resumen, ui, hideEco }) {
  const chartData = useMemo(() => ([
    {
      nombre: 'Contrato',
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
        Resumen general del inventario
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((it) => {
      const hay = [
        it.capitulo, it.item, it.descripcion, it.pk_id,
        ...(it.insumos || []).flatMap((ins) => [ins.codigo, ins.descripcion]),
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q])

  const toggleItem = (presupuestoId) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(presupuestoId)) next.delete(presupuestoId)
      else next.add(presupuestoId)
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

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📊 Inventario</div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
          Tabla tipo Excel con drill-down por ítem, insumo y proveedor. Filas contraídas por defecto.
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
          <GraficoResumenInventario resumen={arbol?.resumen} ui={ui} hideEco={hideEco} />

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            marginBottom: 10,
          }}
          >
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar capítulo, ítem, insumo…"
              aria-label="Buscar en inventario"
              style={{ ...ui.input, flex: '1 1 240px', margin: 0, maxWidth: 420 }}
            />
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
              {filtered.length} ítem{filtered.length === 1 ? '' : 's'}
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
                      No hay ítems para mostrar.
                    </td>
                  </tr>
                ) : filtered.map((it) => {
                  const itemOpen = expandedItems.has(it.presupuesto_id)
                  const hasInsumos = (it.insumos || []).length > 0
                  const utilColor = it.utilidad == null
                    ? undefined
                    : (Number(it.utilidad) >= 0 ? 'var(--cc-color-success, #059669)' : 'var(--cc-color-danger, #dc2626)')
                  return (
                    <FragmentItem
                      key={it.presupuesto_id}
                      it={it}
                      itemOpen={itemOpen}
                      hasInsumos={hasInsumos}
                      toggleItem={toggleItem}
                      toggleInsumo={toggleInsumo}
                      expandedInsumos={expandedInsumos}
                      th={th}
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
  itemOpen,
  hasInsumos,
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
        data-testid={`inventario-item-${it.presupuesto_id}`}
        style={{ background: itemOpen ? 'var(--cc-almacen-accent-soft, rgba(0,119,182,0.06))' : undefined }}
      >
        <td style={td}>
          <ToggleCell
            open={itemOpen}
            onToggle={() => toggleItem(it.presupuesto_id)}
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
        const ikey = `${it.presupuesto_id}:${ins.insumo_id}`
        const insOpen = expandedInsumos.has(ikey)
        const hasProv = (ins.proveedores || []).length > 0
        const utilI = ins.utilidad == null
          ? undefined
          : (Number(ins.utilidad) >= 0 ? 'var(--cc-color-success, #059669)' : 'var(--cc-color-danger, #dc2626)')
        return (
          <FragmentInsumo
            key={ikey}
            it={it}
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
  it,
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
