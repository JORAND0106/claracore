import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { fmtMoneda } from './subcontratistasDocsHelpers'

/**
 * Confirmación de pegado de columna VU Costo M.O. (estilo hoja de cálculo).
 * Sincronizado con tema activo y --cc-* (tamaño de fuente del usuario).
 */
export default function PreciosPasteConfirmModal({
  open,
  theme,
  plan = null,
  procesando = false,
  onCancel,
  onConfirm,
}) {
  const t = theme || {}
  if (!open || !plan) return null

  const surface = t.bgCard || '#ffffff'
  const text = t.text || '#0f172a'
  const border = t.border || '#e2e8f0'
  const primary = t.primary || '#0077B6'
  const muted = t.textMuted || '#64748b'
  const warn = t.warn || '#D97706'
  const danger = t.danger || '#DC2626'
  const success = t.success || '#16a34a'

  const fmtVu = (v) => (v == null || v === '' ? '—' : fmtMoneda(v))

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10085,
        background: t.overlay || 'rgba(15, 23, 42, 0.48)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !procesando && onCancel?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="precios-paste-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '90vh',
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          color: text,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${border}`,
          background: `color-mix(in srgb, ${primary} 12%, ${surface})`,
        }}
        >
          <div
            id="precios-paste-title"
            style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: primary }}
          >
            Confirmar pegado — VU Costo M.O.
          </div>
          <div style={{ fontSize: 'var(--cc-caption)', color: muted, marginTop: 4, lineHeight: 1.4 }}>
            Los valores se asignan por posición desde la fila activa.
            No se guardan hasta que pulse Guardar en la hoja.
          </div>
        </div>

        <div style={{ padding: '12px 18px', overflow: 'auto', flex: 1 }}>
          {(plan.invalidos?.length > 0 || plan.sobrantesCount > 0) && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: `color-mix(in srgb, ${warn} 14%, ${surface})`,
              border: `1px solid color-mix(in srgb, ${warn} 40%, ${border})`,
              fontSize: 'var(--cc-caption)',
              lineHeight: 1.45,
              color: warn,
              fontWeight: 600,
            }}
            >
              {plan.invalidos?.length > 0 && (
                <div>
                  {plan.invalidos.length} valor{plan.invalidos.length === 1 ? '' : 'es'} no numérico
                  {plan.invalidos.length === 1 ? '' : 's'} — se ignoran (la fila conserva su valor actual).
                  {' '}
                  {plan.invalidos.slice(0, 4).map((x) => `"${x.raw}"`).join(', ')}
                  {plan.invalidos.length > 4 ? '…' : ''}
                </div>
              )}
              {plan.sobrantesCount > 0 && (
                <div style={{ marginTop: plan.invalidos?.length ? 6 : 0 }}>
                  {plan.sobrantesCount} valor{plan.sobrantesCount === 1 ? '' : 'es'} de más
                  (no hay filas suficientes desde la posición actual) — se ignoran.
                </div>
              )}
            </div>
          )}

          {plan.aplicaran?.length === 0 ? (
            <div style={{ color: muted, fontSize: 'var(--cc-sm)' }}>
              No hay valores aplicables para pegar.
            </div>
          ) : (
            <div style={{
              border: `1px solid ${border}`,
              borderRadius: 8,
              overflow: 'hidden',
            }}
            >
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 'var(--cc-sm)',
              }}
              >
                <thead>
                  <tr style={{ background: `color-mix(in srgb, ${primary} 16%, ${surface})` }}>
                    <th style={thStyle(border, text)}>Ítem</th>
                    <th style={thStyle(border, text)}>Descripción</th>
                    <th style={{ ...thStyle(border, text), textAlign: 'right' }}>Actual</th>
                    <th style={{ ...thStyle(border, text), textAlign: 'right' }}>Nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.aplicaran.map((row) => (
                    <tr key={row.key}>
                      <td style={tdStyle(border)}>{row.item}</td>
                      <td style={{ ...tdStyle(border), color: muted, maxWidth: 220 }}>
                        <span style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        >
                          {row.descripcion}
                        </span>
                      </td>
                      <td style={{ ...tdStyle(border), textAlign: 'right', color: muted }}>
                        {fmtVu(row.actual)}
                      </td>
                      <td style={{
                        ...tdStyle(border),
                        textAlign: 'right',
                        fontWeight: 700,
                        color: row.vacio ? danger : success,
                      }}
                      >
                        {row.vacio ? '(vacío)' : fmtVu(row.nuevo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{
            marginTop: 10,
            fontSize: 'var(--cc-caption)',
            color: muted,
          }}
          >
            Se aplicarán {plan.aplicaran?.length || 0} de {plan.totalPegados} valor
            {(plan.totalPegados || 0) === 1 ? '' : 'es'} pegado
            {(plan.totalPegados || 0) === 1 ? '' : 's'}.
          </div>
        </div>

        <div style={{
          padding: '12px 18px 16px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          borderTop: `1px solid ${border}`,
        }}
        >
          <button
            type="button"
            disabled={procesando}
            onClick={onCancel}
            style={{
              background: 'transparent',
              color: muted,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
              cursor: procesando ? 'wait' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={procesando || !plan.puedeAplicar}
            onClick={() => onConfirm?.(plan)}
            style={{
              background: plan.puedeAplicar ? primary : muted,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: (!plan.puedeAplicar || procesando) ? 'not-allowed' : 'pointer',
              opacity: procesando ? 0.75 : 1,
            }}
          >
            Aplicar pegado
          </button>
        </div>
      </div>
    </div>
  )
}

function thStyle(border, text) {
  return {
    padding: '8px 10px',
    textAlign: 'left',
    borderBottom: `1px solid ${border}`,
    fontWeight: 700,
    color: text,
    fontSize: 'var(--cc-caption)',
  }
}

function tdStyle(border) {
  return {
    padding: '7px 10px',
    borderBottom: `1px solid ${border}`,
    verticalAlign: 'middle',
  }
}
