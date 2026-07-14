import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import PresupuestoItemSelector from './PresupuestoItemSelector'
import {
  fmtCant,
  fmtFechaAlmacenCorta,
  fmtMoney,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

const CHART_COLORS = ['#0077B6', '#10B981', '#F59E0B', '#7C3AED']

function fmtTooltipCant(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return fmtCant(n)
}

function fmtTooltipMoney(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return fmtMoney(n)
}

function filtroLabel(capitulo, item) {
  if (capitulo && item) return `${capitulo} · ítem ${item}`
  if (capitulo) return `Capítulo ${capitulo}`
  return 'Todo el contrato'
}

function GraficoComparacion({
  titulo, data, labelA, labelB, ui, moneda = false,
}) {
  const fmt = moneda ? fmtTooltipMoney : fmtTooltipCant
  const fmtSummary = moneda ? fmtMoney : fmtCant
  const chartData = useMemo(() => ([
    { nombre: 'Total', a: data.a, b: data.b },
  ]), [data.a, data.b])

  return (
    <div style={{ ...ui.card, flex: '1 1 280px', minWidth: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 'var(--cc-sm)' }}>{titulo}</div>
      <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 12 }}>
        {labelA}: {fmtSummary(data.a)} · {labelB}: {fmtSummary(data.b)}
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={ui.textMuted} opacity={0.25} />
            <XAxis dataKey="nombre" tick={{ fill: ui.textMuted, fontSize: 11 }} />
            <YAxis tick={{ fill: ui.textMuted, fontSize: 11 }} tickFormatter={fmt} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Legend />
            <Bar dataKey="a" name={labelA} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="b" name={labelB} fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function GraficoPorItem({
  titulo, items, keyA, keyB, labelA, labelB, ui, moneda = false, nameKey,
}) {
  const fmt = moneda ? fmtTooltipMoney : fmtTooltipCant
  const chartData = useMemo(() => (
    (items || []).slice(0, 8).map((it) => ({
      nombre: nameKey
        ? String(it[nameKey] || '').slice(0, 28)
        : [it.item, it.material_descripcion || it.descripcion].filter(Boolean).join(' · ').slice(0, 28)
          || `#${it.presupuesto_id}`,
      a: Number(it[keyA] || 0),
      b: Number(it[keyB] || 0),
    }))
  ), [items, keyA, keyB, nameKey])

  if (!chartData.length) {
    return (
      <div style={{ ...ui.card, flex: '1 1 100%', color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
        {titulo}: sin datos para el filtro seleccionado.
      </div>
    )
  }

  return (
    <div style={{ ...ui.card, flex: '1 1 100%' }}>
      <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 'var(--cc-sm)' }}>{titulo} — por ítem</div>
      <div style={{ width: '100%', height: Math.max(240, chartData.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={ui.textMuted} opacity={0.25} />
            <XAxis type="number" tick={{ fill: ui.textMuted, fontSize: 11 }} tickFormatter={fmt} />
            <YAxis type="category" dataKey="nombre" width={120} tick={{ fill: ui.textMuted, fontSize: 10 }} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Legend />
            <Bar dataKey="a" name={labelA} fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
            <Bar dataKey="b" name={labelB} fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
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
  const [graficos, setGraficos] = useState(null)
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtroCap, setFiltroCap] = useState('')
  const [filtroItem, setFiltroItem] = useState('')

  const reload = useCallback(() => {
    setLoading(true)
    return Promise.all([
      api.getInventarioGraficos(filtroCap || undefined, filtroItem || undefined),
      api.getAlertasVencimiento(),
    ])
      .then(([g, al]) => {
        setGraficos(g)
        setAlertas(Array.isArray(al) ? al : [])
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false)
        onDataLoaded?.()
      })
  }, [api, filtroCap, filtroItem, onDataLoaded])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (refreshSignal > 0) reload()
  }, [refreshSignal, reload])

  const tot = graficos?.totales || {}
  const porItem = graficos?.por_item || []
  const porItemValor = graficos?.por_item_valor || []
  const filtroActivo = filtroCap || filtroItem

  const onFiltroChange = ({ capitulo, item }) => {
    setFiltroCap(capitulo || '')
    setFiltroItem(item || '')
  }

  const limpiarFiltro = () => {
    setFiltroCap('')
    setFiltroItem('')
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📊 Inventario</div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
          Comparativos agregados: valor de cobro vs. costo de insumos, entradas/salidas y cobro SICOE Obra.
        </div>
        {graficos?.generado_at && (
          <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 4 }}>
            Actualizado: {fmtFechaAlmacenCorta(graficos.generado_at)}
          </div>
        )}
      </div>

      <div style={{ ...ui.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 'var(--cc-sm)' }}>
          Filtro por capítulo e ítem
        </div>
        <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 10 }}>
          Aplica a los tres gráficos. Deje vacío para ver todo el contrato.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <PresupuestoItemSelector
              capitulo={filtroCap}
              item={filtroItem}
              onChange={onFiltroChange}
            />
          </div>
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
              Ver todo el contrato
            </button>
          )}
        </div>
        <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 8 }}>
          Vista: {filtroLabel(filtroCap, filtroItem)}
        </div>
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
        <div style={{ color: ui.textMuted }}>Cargando gráficos…</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <GraficoComparacion
              titulo="Valor del ítem vs. Costo de insumos"
              data={{ a: tot.valor_cobro, b: tot.costo_insumos }}
              labelA="Valor según contrato"
              labelB="Costo total insumos"
              ui={ui}
              moneda
            />
            <GraficoComparacion
              titulo="Entradas vs. Salidas"
              data={{ a: tot.entradas, b: tot.salidas }}
              labelA="Entradas"
              labelB="Salidas a obra"
              ui={ui}
            />
            <GraficoComparacion
              titulo="Salidas vs. Cobro (SICOE Obra)"
              data={{ a: tot.salidas, b: tot.cobrado }}
              labelA="Salidas almacén"
              labelB="Reportado y cobrado"
              ui={ui}
            />
          </div>

          <GraficoPorItem
            titulo="Valor del ítem vs. Costo de insumos"
            items={porItemValor}
            keyA="valor_cobro"
            keyB="costo_insumos"
            labelA="Valor contrato"
            labelB="Costo insumos"
            ui={ui}
            moneda
            nameKey={null}
          />
          <div style={{ height: 16 }} />
          <GraficoPorItem
            titulo="Entradas vs. Salidas"
            items={porItem}
            keyA="entradas"
            keyB="salidas"
            labelA="Entradas"
            labelB="Salidas"
            ui={ui}
          />
          <div style={{ height: 16 }} />
          <GraficoPorItem
            titulo="Salidas vs. Cobro"
            items={porItem}
            keyA="salidas"
            keyB="cobrado"
            labelA="Salidas"
            labelB="Cobrado SICOE"
            ui={ui}
          />
        </>
      )}
    </div>
  )
}
