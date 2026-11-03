import { useCallback, useEffect, useMemo, useState } from 'react'
import { tFrom, isDarkMode } from '../../theme/adminPanelTheme'
import { formatCOP } from '../../utils/formatCOP'
import { subcontratistasSheetCssVars, subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'

function emptyRow(orden = 0) {
  return {
    _key: `n-${orden}-${Math.random().toString(36).slice(2, 7)}`,
    concepto: '',
    tarifa_mensual: '',
    cantidad_profesionales: '1',
    orden,
  }
}

/**
 * Hoja tipo Excel: Tarifas pactadas (subcontratista por_servicios).
 */
export default function TarifasPactadasSheet({
  theme,
  call,
  subId,
  canEdit = false,
  onMsg,
}) {
  const tTok = tFrom(theme)
  const ui = subcontratistasSheetStyles(tTok)
  const S = subUi(theme, tTok)
  const cssVars = subcontratistasSheetCssVars(tTok)
  const [rows, setRows] = useState([emptyRow(0)])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const cargar = useCallback(async () => {
    if (!subId || !call) return
    setLoading(true)
    try {
      const data = await call('GET', `/subcontratistas/${subId}/tarifas-servicio`)
      const list = Array.isArray(data) ? data : (data?.items || [])
      if (list.length) {
        setRows(
          list.map((r, i) => ({
            _key: `id-${r.id || i}`,
            id: r.id,
            concepto: r.concepto || '',
            tarifa_mensual: r.tarifa_mensual ?? '',
            cantidad_profesionales: r.cantidad_profesionales ?? 1,
            orden: r.orden ?? i,
          })),
        )
      } else {
        setRows([emptyRow(0)])
      }
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudieron cargar las tarifas.' })
      setRows([emptyRow(0)])
    } finally {
      setLoading(false)
    }
  }, [subId, call, onMsg])

  useEffect(() => { cargar() }, [cargar])

  const patch = (idx, fields) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...fields } : r)))
  }

  const addRow = () => setRows((prev) => [...prev, emptyRow(prev.length)])
  const removeRow = (idx) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      return next.length ? next : [emptyRow(0)]
    })
  }

  const guardar = async () => {
    if (!canEdit || !subId) return
    setSaving(true)
    try {
      const items = rows
        .filter((r) => String(r.concepto || '').trim())
        .map((r, i) => ({
          concepto: String(r.concepto).trim(),
          tarifa_mensual: Number(r.tarifa_mensual) || 0,
          cantidad_profesionales: Number(r.cantidad_profesionales) > 0 ? Number(r.cantidad_profesionales) : 1,
          orden: i,
        }))
      await call('PUT', `/subcontratistas/${subId}/tarifas-servicio`, { items })
      onMsg?.({ type: 'success', text: 'Tarifas pactadas guardadas.' })
      await cargar()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudieron guardar las tarifas.' })
    } finally {
      setSaving(false)
    }
  }

  const totalMensual = useMemo(
    () => rows.reduce((s, r) => {
      const t = Number(r.tarifa_mensual)
      const c = Number(r.cantidad_profesionales)
      if (!Number.isFinite(t) || !Number.isFinite(c)) return s
      return s + t * (c > 0 ? c : 1)
    }, 0),
    [rows],
  )

  const lblHint = {
    fontSize: 'var(--cc-caption)',
    color: tTok.textMuted,
    marginBottom: 10,
    lineHeight: 1.4,
  }

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)', fontFamily: 'inherit' }}>
      <div style={ui.sectionTitle}>Tarifas pactadas</div>
      <div style={lblHint}>
        Conceptos mensuales (p. ej. Topógrafo, Cadenero). El valor del corte será
        tarifa × cantidad de profesionales × 0,5 (quincenal) o × 1 (mensual). El AIU/IVA
        único del subcontratista se configura en Datos / tributos.
      </div>
      {loading ? (
        <div style={{ color: tTok.textMuted }}>Cargando…</div>
      ) : (
        <div style={{ ...ui.sheetWrap, maxHeight: 'min(480px, 55vh)' }}>
          <table style={{ ...ui.sheetTable, minWidth: 560 }}>
            <thead>
              <tr>
                {['Concepto', 'Tarifa mensual', 'Cant. profesionales', ''].map((h) => (
                  <th key={h || 'x'} style={ui.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r._key}>
                  <td style={ui.td}>
                    <input
                      style={ui.cellInp}
                      disabled={!canEdit}
                      value={r.concepto}
                      placeholder="Ej. Topógrafo"
                      onChange={(e) => patch(idx, { concepto: e.target.value })}
                    />
                  </td>
                  <td style={ui.td}>
                    <input
                      style={{ ...ui.cellInp, textAlign: 'right' }}
                      disabled={!canEdit}
                      inputMode="decimal"
                      value={r.tarifa_mensual}
                      placeholder="0"
                      onChange={(e) => patch(idx, { tarifa_mensual: e.target.value.replace(/[^0-9.,-]/g, '') })}
                    />
                  </td>
                  <td style={ui.td}>
                    <input
                      style={{ ...ui.cellInp, textAlign: 'right' }}
                      disabled={!canEdit}
                      inputMode="decimal"
                      value={r.cantidad_profesionales}
                      onChange={(e) => patch(idx, { cantidad_profesionales: e.target.value.replace(/[^0-9.,]/g, '') })}
                    />
                  </td>
                  <td style={{ ...ui.td, width: 44, textAlign: 'center' }}>
                    {canEdit && (
                      <button type="button" style={S.btn('ghost', true)} onClick={() => removeRow(idx)} title="Quitar">
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        marginTop: 12,
        justifyContent: 'space-between',
      }}
      >
        <div style={{ fontSize: 'var(--cc-sm)', color: tTok.textMuted }}>
          Total mensual pactado:{' '}
          <strong style={{ color: isDarkMode(theme) ? '#e2e8f0' : '#0f172a' }}>
            {formatCOP(totalMensual)}
          </strong>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && (
            <>
              <button type="button" style={S.btn('ghost', true)} onClick={addRow}>+ Concepto</button>
              <button type="button" style={S.btn('primary', true)} disabled={saving} onClick={guardar}>
                {saving ? 'Guardando…' : 'Guardar tarifas'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
