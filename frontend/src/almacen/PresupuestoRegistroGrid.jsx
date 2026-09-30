import { useEffect, useState } from 'react'
import { AlmacenFieldLabel, fmtCant, useAlmacenApi, useAlmacenTheme } from './almacenShared'
import { normalizePresupuestoIds, totalSaldoRegistros } from './presupuestoReparto'

export default function PresupuestoRegistroGrid({
  capitulo,
  item,
  pkId,
  presupuestoId,
  presupuestoIds,
  excludeSolicitudId,
  disabled,
  onToggle,
  onSelect,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedIds = normalizePresupuestoIds(
    presupuestoIds?.length ? presupuestoIds : (presupuestoId != null ? [presupuestoId] : []),
  )
  const selectedSet = new Set(selectedIds)

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
    if (!data?.registros?.length || selectedIds.length || disabled) return
    if (data.registros.length === 1) {
      const reg = data.registros[0]
      if (onToggle) onToggle(reg, true)
      else onSelect?.(reg)
    }
  }, [data, selectedIds.length, disabled, onToggle, onSelect])

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

  const selectedRegs = registros.filter((r) => selectedSet.has(Number(r.presupuesto_id)))
  const saldoSeleccionado = totalSaldoRegistros(selectedRegs)
  const unidad = registros[0]?.unidad || ''

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

  const handleToggle = (reg) => {
    if (disabled) return
    const pid = Number(reg.presupuesto_id)
    const nextChecked = !selectedSet.has(pid)
    if (onToggle) {
      onToggle(reg, nextChecked)
      return
    }
    onSelect?.(reg)
  }

  return (
    <div style={{ marginTop: 8 }}>
      <AlmacenFieldLabel
        icon="📊"
        label="Registro de presupuesto"
        compact
        ayuda="Seleccione uno o varios tramos/abscisas; el consumo se reparte proporcionalmente al saldo de cada registro."
      />
      {data?.registros_count > 1 && (
        <div style={{ fontSize: 'var(--cc-caption)', color: ui.textMuted, marginBottom: 4 }}>
          Total ítem en PK ({data.registros_count} registros):{' '}
          <strong>{fmtCant(data.cant_presupuestada_combo)}</strong>
          {unidad ? ` ${unidad}` : ''}
        </div>
      )}
      {selectedRegs.length > 0 && (
        <div style={{
          fontSize: 'var(--cc-caption)',
          color: ui.text,
          marginBottom: 6,
          fontWeight: 600,
        }}
        >
          Seleccionados ({selectedRegs.length}): saldo disponible{' '}
          <strong style={{ color: saldoSeleccionado < 0 ? 'var(--cc-color-danger)' : 'var(--cc-color-positive)' }}>
            {fmtCant(saldoSeleccionado)}
          </strong>
          {unidad ? ` ${unidad}` : ''}
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
              const selected = selectedSet.has(Number(r.presupuesto_id))
              const nodo = [r.nodo_inicio, r.nodo_final].filter(Boolean).join(' → ') || '—'
              return (
                <tr
                  key={r.presupuesto_id}
                  style={{
                    background: selected ? `${ui.accentSoft}` : 'transparent',
                    cursor: disabled ? 'default' : 'pointer',
                  }}
                  title={`${r.abs_inicio || ''} — ${r.abs_final || ''}`}
                  onClick={() => handleToggle(r)}
                >
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!selected}
                      disabled={disabled}
                      onChange={() => handleToggle(r)}
                      aria-label={`Seleccionar registro ${r.presupuesto_id}`}
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
