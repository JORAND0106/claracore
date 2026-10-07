import { useEffect, useMemo, useState } from 'react'
import { pptoSheetStyles } from './pptoSheetStyles'
import {
  cantidadTrasRedistribucion,
  fmtCantPpto,
  proporcionesIguales,
  sumProporciones,
  validarProporciones,
} from './pptoSubRedistribucion'

function sheetInp(sheet, t, active) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${active ? (t.primary || sheet.primary) : sheet.border}`,
    borderRadius: 4,
    background: sheet.inputBg,
    color: sheet.text,
    fontSize: 'var(--cc-input)',
    padding: '6px 8px',
    minHeight: 32,
    fontFamily: 'inherit',
  }
}

/**
 * Popup tipo hoja de cálculo: confirma/ajusta proporciones al compartir
 * cantidades de presupuesto entre varios subcontratistas.
 */
export default function PptoSubRedistribucionModal({
  open,
  theme,
  preview,
  onCancel,
  onConfirm,
  aplicando = false,
}) {
  const t = theme || {}
  const sheet = pptoSheetStyles(t)
  const participantes = preview?.participantes || []
  const partIds = useMemo(
    () => participantes.map((p) => Number(p.id)).filter((n) => n > 0),
    [participantes],
  )

  const [props, setProps] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !preview) return
    const def = preview.proporciones_default || {}
    const next = {}
    for (const id of partIds) {
      const raw = def[id] ?? def[String(id)]
      next[id] = raw != null ? Number(raw) : (proporcionesIguales(partIds)[id] ?? 0)
    }
    setProps(next)
    setError('')
  }, [open, preview, partIds])

  if (!open || !preview) return null

  const filas = preview.filas_redistribuir || []
  const bloqueadas = preview.filas_bloqueadas || []
  const simples = preview.filas_simples || []
  const advertencias = preview.advertencias || []
  const suma = sumProporciones(props)
  const errProp = validarProporciones(props, partIds)

  const setProp = (id, val) => {
    setProps((prev) => ({ ...prev, [id]: val }))
    setError('')
  }

  const handleConfirm = async () => {
    const err = validarProporciones(props, partIds)
    if (err) {
      setError(err)
      return
    }
    const payload = {}
    for (const id of partIds) payload[String(id)] = Number(props[id])
    await onConfirm?.({ proporciones: payload, preview })
  }

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    zIndex: 10060,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }
  const card = {
    background: t.bgCard || '#fff',
    color: t.text || '#0f172a',
    borderRadius: 8,
    border: `1px solid ${t.border || '#e2e8f0'}`,
    width: 'min(1100px, 96vw)',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Redistribuir cantidades">
      <div style={card}>
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${t.border || '#e2e8f0'}`,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
        }}
        >
          <div>
            <div style={{
              fontSize: 'var(--cc-caption)',
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: t.primary || '#0077B6',
              marginBottom: 4,
            }}
            >
              Redistribución de cantidades
            </div>
            <div style={{ fontSize: 'var(--cc-body)', color: t.textMuted || '#64748b', lineHeight: 1.4 }}>
              Nuevo subcontratista:{' '}
              <strong style={{ color: t.text }}>{preview.nuevo_subcontratista_label || '—'}</strong>
              . El ejecutado conciliado queda fijo; el saldo se reparte según la proporción (debe sumar 1.00).
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={aplicando}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: t.textMuted,
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
          {advertencias.length > 0 && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 6,
              background: t.warningBg || '#fff7ed',
              border: `1px solid ${t.warningBorder || '#fdba74'}`,
              color: t.warningText || '#9a3412',
              fontSize: 'var(--cc-caption)',
            }}
            >
              {advertencias.map((a) => (
                <div key={a} style={{ marginBottom: 4 }}>{a}</div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 'var(--cc-caption)',
              fontWeight: 700,
              color: t.primary,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.04,
            }}
            >
              Proporciones (decimal)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              {participantes.map((p) => (
                <label key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
                  <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 600 }}>
                    {p.label}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={props[p.id] ?? ''}
                    onChange={(e) => setProp(Number(p.id), e.target.value === '' ? '' : Number(e.target.value))}
                    style={{
                      ...sheetInp(sheet, t, true),
                      width: 110,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </label>
              ))}
              <div style={{
                fontSize: 'var(--cc-caption)',
                fontWeight: 700,
                color: Math.abs(suma - 1) < 1e-6 ? (t.success || '#15803d') : (t.danger || '#b91c1c'),
                paddingBottom: 8,
              }}
              >
                Suma: {Number.isFinite(suma) ? suma.toFixed(2) : '—'}
              </div>
            </div>
          </div>

          <div style={sheet.sheetWrap}>
            <table style={{ ...sheet.sheetTable, minWidth: 780 }}>
              <thead>
                <tr>
                  {['PK / Ítem', 'Presupuestado', 'Ejecutado conciliado', 'Saldo', ...participantes.map((p) => `${p.label} (nueva)`)].map((h) => (
                    <th key={h} style={sheet.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.presupuesto_id}>
                    <td style={sheet.td}>
                      <div style={{ fontWeight: 700 }}>{f.pk_id || f.presupuesto_id}</div>
                      <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
                        {f.item || '—'}{f.tramo ? ` · ${f.tramo}` : ''}
                      </div>
                    </td>
                    <td style={{ ...sheet.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCantPpto(f.presupuestado)}
                    </td>
                    <td style={sheet.td}>
                      {(f.participantes || []).map((sid) => {
                        const info = (f.ejecutados || {})[sid] || (f.ejecutados || {})[String(sid)] || {}
                        return (
                          <div key={sid} style={{ fontSize: 'var(--cc-caption)', fontVariantNumeric: 'tabular-nums' }}>
                            {info.label || `#${sid}`}: {fmtCantPpto(info.ejecutado)}
                          </div>
                        )
                      })}
                    </td>
                    <td style={{ ...sheet.td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCantPpto(f.saldo)}
                    </td>
                    {participantes.map((p) => {
                      const info = (f.ejecutados || {})[p.id] || (f.ejecutados || {})[String(p.id)] || {}
                      const nueva = cantidadTrasRedistribucion(info.ejecutado, props[p.id], f.saldo)
                      return (
                        <td
                          key={p.id}
                          style={{ ...sheet.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                        >
                          {fmtCantPpto(nueva)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {!filas.length && (
                  <tr>
                    <td style={sheet.td} colSpan={4 + participantes.length}>
                      No hay filas para redistribuir.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(simples.length > 0 || bloqueadas.length > 0) && (
            <div style={{ marginTop: 12, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
              {simples.length > 0 && (
                <div>
                  {simples.length} registro(s) sin asignación previa se asignarán completos al nuevo subcontratista.
                </div>
              )}
              {bloqueadas.length > 0 && (
                <div style={{ color: t.danger || '#b91c1c', marginTop: 4 }}>
                  {bloqueadas.length} registro(s) con saldo 0 se omitirán (no se asigna el nuevo subcontratista).
                </div>
              )}
            </div>
          )}

          {(error || errProp) && (
            <div style={{ marginTop: 10, color: t.danger || '#b91c1c', fontSize: 'var(--cc-caption)', fontWeight: 600 }}>
              {error || errProp}
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${t.border || '#e2e8f0'}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={aplicando}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: `1px solid ${t.border || '#cbd5e1'}`,
              background: t.bgCard || '#fff',
              color: t.text,
              cursor: 'pointer',
              fontSize: 'var(--cc-body)',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={aplicando || !!errProp}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: 'none',
              background: errProp ? (t.textMuted || '#94a3b8') : (t.primary || '#0077B6'),
              color: '#fff',
              cursor: errProp ? 'not-allowed' : 'pointer',
              fontSize: 'var(--cc-body)',
              fontWeight: 700,
            }}
          >
            {aplicando ? 'Aplicando…' : 'Confirmar redistribución'}
          </button>
        </div>
      </div>
    </div>
  )
}
