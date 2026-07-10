import { useCallback, useEffect, useState } from 'react'
import {
  fmtCant,
  SemaforoDot,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

const SEMAFORO_TEXTO = {
  verde: 'Dentro de presupuesto',
  amarillo: 'Cerca del límite',
  rojo: 'Superado',
}

export default function InventarioPanel({ permisos, token }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [rows, setRows] = useState([])
  const [alertas, setAlertas] = useState([])
  const [movs, setMovs] = useState([])
  const [sel, setSel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportBusy, setExportBusy] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([api.listInventario(), api.getAlertasVencimiento()])
      .then(([inv, al]) => { setRows(inv); setAlertas(al) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [api])

  useEffect(() => { reload() }, [reload])

  const verHistorial = async (r) => {
    setSel(r)
    try {
      const m = await api.listMovimientos(r.presupuesto_id, r.material_descripcion)
      setMovs(m)
    } catch (e) {
      setError(e.message)
    }
  }

  const exportar = async () => {
    setExportBusy(true)
    try {
      await api.exportInventarioExcel()
    } catch (e) {
      setError(e.message)
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📊 Inventario</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Stock disponible por material. Semáforo: ingresado vs presupuestado por ítem.
          </div>
        </div>
        {permisos?.exportar && (
          <button type="button" style={ui.btnPrimary} disabled={exportBusy} onClick={exportar}>
            {exportBusy ? 'Exportando…' : '📥 Exportar Excel'}
          </button>
        )}
      </div>

      {alertas.length > 0 && (
        <div style={{ ...ui.card, marginBottom: 16, borderColor: '#eab308', background: '#fefce822' }}>
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
        <div style={{ color: ui.textMuted }}>Cargando…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
          Sin stock registrado. Registre entradas de material para ver el inventario.
        </div>
      ) : (
        <div style={{ ...ui.card, padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={ui.th}>Semáforo</th>
                <th style={ui.th}>Material</th>
                <th style={ui.th}>Stock</th>
                <th style={ui.th}>Presupuestado</th>
                <th style={ui.th}>Ingresado</th>
                <th style={ui.th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={ui.td} title={SEMAFORO_TEXTO[r.semaforo]}>
                    <SemaforoDot estado={r.semaforo} />
                    {SEMAFORO_TEXTO[r.semaforo]}
                  </td>
                  <td style={ui.td}>{r.material_descripcion}</td>
                  <td style={ui.td}>{fmtCant(r.stock_disponible)} {r.unidad}</td>
                  <td style={ui.td}>{fmtCant(r.cant_presupuestada)}</td>
                  <td style={ui.td}>{fmtCant(r.ingresado_acumulado)}</td>
                  <td style={ui.td}>
                    <button type="button" style={ui.btnSecondary} onClick={() => verHistorial(r)}>
                      Historial
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <div style={{ ...ui.card, marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Historial — {sel.material_descripcion}
            <button type="button" style={{ ...ui.btnSecondary, marginLeft: 12, padding: '4px 10px' }} onClick={() => setSel(null)}>Cerrar</button>
          </div>
          {movs.length === 0 ? (
            <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>Sin movimientos.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={ui.th}>Fecha</th>
                  <th style={ui.th}>Tipo</th>
                  <th style={ui.th}>Cantidad</th>
                  <th style={ui.th}>Lote</th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id}>
                    <td style={ui.td}>{m.created_at?.slice(0, 10)}</td>
                    <td style={ui.td}>{m.tipo}</td>
                    <td style={ui.td}>{fmtCant(m.cantidad)}</td>
                    <td style={ui.td}>{m.lote || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
