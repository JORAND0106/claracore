import { useEffect, useState } from 'react'
import { AlmacenFieldLabel, fmtCant, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function PresupuestoRegistroGrid({
  capitulo,
  item,
  pkId,
  presupuestoId,
  excludeSolicitudId,
  disabled,
  onSelect,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!capitulo || !item || !pkId) {
      setData(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    api.getPresupuestoRegistros(capitulo, item, pkId, excludeSolicitudId)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null)
          setError(e.message || 'No se pudieron cargar los registros de presupuesto.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [api, capitulo, item, pkId, excludeSolicitudId])

  useEffect(() => {
    if (!data?.registros?.length || presupuestoId || disabled) return
    if (data.registros.length === 1) {
      onSelect?.(data.registros[0])
    }
  }, [data, presupuestoId, disabled, onSelect])

  if (!pkId || !capitulo || !item) return null

  if (loading) {
    return (
      <div style={{ marginTop: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
        Cargando registros de presupuesto…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ marginTop: 8, fontSize: 'var(--cc-xs)', color: '#dc2626' }}>
        {error}
      </div>
    )
  }

  const registros = data?.registros || []
  if (!registros.length) {
    return (
      <div style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 6,
        background: '#fef2f2',
        border: '1px solid #fecaca',
        fontSize: 'var(--cc-xs)',
        color: '#991b1b',
      }}
      >
        No hay registros de presupuesto para este capítulo, ítem y PK-ID.
      </div>
    )
  }

  const th = {
    ...ui.th,
    padding: '5px 6px',
  }
  const td = {
    ...ui.td,
    padding: '4px 6px',
  }
  const tdNum = {
    ...ui.tdNum,
    padding: '4px 6px',
  }

  return (
    <div style={{ marginTop: 8 }}>
      <AlmacenFieldLabel
        icon="📊"
        label="Registro de presupuesto"
        compact
        ayuda="Seleccione el tramo/abscisa contra el cual consumirá cantidad."
      />
      {data?.registros_count > 1 && (
        <div style={{ fontSize: 'var(--cc-caption)', color: ui.textMuted, marginBottom: 4 }}>
          Total ítem en PK ({data.registros_count} registros):{' '}
          <strong>{fmtCant(data.cant_presupuestada_combo)}</strong>
          {registros[0]?.unidad ? ` ${registros[0].unidad}` : ''}
        </div>
      )}
      <div style={ui.sheetWrap} className="cc-almacen-table-scroll">
        <table style={{ ...ui.sheetTable, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 28 }} />
              <th style={th}>Tramo</th>
              <th style={th}>Absc. ini.</th>
              <th style={th}>Absc. fin.</th>
              <th style={th}>Nodo</th>
              <th style={{ ...th, textAlign: 'right' }}>Ppto</th>
              <th style={{ ...th, textAlign: 'right' }}>Acum.</th>
              <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => {
              const selected = presupuestoId && Number(presupuestoId) === Number(r.presupuesto_id)
              const nodo = [r.nodo_inicio, r.nodo_final].filter(Boolean).join(' → ') || '—'
              return (
                <tr
                  key={r.presupuesto_id}
                  style={{
                    background: selected ? `${ui.accentSoft}` : 'transparent',
                    cursor: disabled ? 'default' : 'pointer',
                  }}
                  title={`${r.abs_inicio || ''} — ${r.abs_final || ''}`}
                  onClick={() => !disabled && onSelect?.(r)}
                >
                  <td style={td}>
                    <input
                      type="radio"
                      checked={!!selected}
                      readOnly
                      disabled={disabled}
                      onChange={() => !disabled && onSelect?.(r)}
                    />
                  </td>
                  <td style={td}>{r.tramo || '—'}</td>
                  <td style={td}>{r.abs_inicio || '—'}</td>
                  <td style={td}>{r.abs_final || '—'}</td>
                  <td style={td}>{nodo}</td>
                  <td style={tdNum}>{fmtCant(r.cant_total)} {r.unidad || ''}</td>
                  <td style={tdNum}>{fmtCant(r.cant_solicitada_acumulada)}</td>
                  <td style={{
                    ...tdNum,
                    color: (r.saldo_disponible ?? 0) < 0 ? 'var(--cc-color-danger)' : 'var(--cc-color-positive)',
                  }}
                  >
                    {fmtCant(r.saldo_disponible)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
