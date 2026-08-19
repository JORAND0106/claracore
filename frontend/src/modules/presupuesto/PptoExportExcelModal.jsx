/** Modal de exportación Excel — tipografía vía `--cc-*` (Pequeña / Mediana / Grande). */
const cc = {
  caption: 'var(--cc-caption)',
  label: 'var(--cc-label)',
  sm: 'var(--cc-sm)',
  body: 'var(--cc-body)',
  md: 'var(--cc-md)',
  lg: 'var(--cc-lg)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

const EXPORT_DESC = {
  informe: {
    presupuesto_obra: 'Resumen por ítem con cantidades, soporte y costo directo.',
    obra_ejecutada:
      'Resumen y memorias: ítems de Presupuesto más ítems solo cobrados en SICOE Obra (misma lógica del Dashboard Ppto vs Capítulo).',
  },
  crudo: {
    presupuesto_obra: 'Base completa en una sola pestaña (todas las columnas).',
    obra_ejecutada: 'Base de Obra Ejecutada en una pestaña, con filtros activos.',
  },
}

export default function PptoExportExcelModal({
  open,
  onClose,
  t,
  busy = false,
  error = null,
  formato = 'informe',
  onFormatoChange,
  vistaLabel = '',
  exportTipoVista = 'presupuesto_obra',
  estimado = { cargando: false, registros: null, alcance: '', esGrande: false },
  onDownload,
}) {
  if (!open) return null

  const btnSec = {
    background: 'transparent',
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: `${cc.padSm} 18px`,
    fontSize: cc.label,
    fontWeight: 600,
    color: t.text,
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'inherit',
  }

  const desc = EXPORT_DESC[formato]?.[exportTipoVista] || '—'
  const notaInterv =
    formato === 'informe' && exportTipoVista === 'obra_ejecutada'
      ? ' Solo aprobados: filtre «Estado interventoría = Aprobado».'
      : ''

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ppto-export-titulo"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: cc.pad,
        fontSize: cc.body,
        lineHeight: 1.45,
        fontFamily: 'inherit',
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        style={{
          width: 'min(440px, 96vw)',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          fontSize: 'inherit',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: `${cc.pad} 20px ${cc.padSm}`,
            borderBottom: `1px solid ${t.border}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <div id="ppto-export-titulo" style={{ fontSize: cc.md, fontWeight: 800, color: t.primary }}>
                Exportar Excel
              </div>
              {vistaLabel ? (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 10px',
                    borderRadius: 999,
                    fontSize: cc.caption,
                    fontWeight: 700,
                    color: t.primary,
                    background: `${t.primary}18`,
                    border: `1px solid ${t.primary}33`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {vistaLabel}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: cc.sm, color: t.textMuted, marginTop: 6 }}>
              Se exporta la vista y filtros activos de la grilla.
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: cc.lg,
              lineHeight: 1,
              cursor: busy ? 'wait' : 'pointer',
              color: t.textMuted,
              flexShrink: 0,
              padding: 0,
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${t.border}`,
            padding: `0 14px`,
          }}
        >
          {[
            { id: 'informe', label: 'Informe' },
            { id: 'crudo', label: 'Crudo' },
          ].map(({ id, label }) => {
            const active = formato === id
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => onFormatoChange?.(id)}
                style={{
                  flex: 1,
                  padding: `${cc.padSm} 12px`,
                  border: 'none',
                  borderBottom: active ? `3px solid ${t.primary}` : '3px solid transparent',
                  background: 'transparent',
                  color: active ? t.primary : t.textMuted,
                  fontWeight: active ? 700 : 500,
                  fontSize: cc.sm,
                  cursor: busy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div style={{ padding: `${cc.pad} 20px` }}>
          <div
            style={{
              padding: `${cc.padSm} ${cc.pad}`,
              borderRadius: 10,
              background: t.bg,
              border: `1px solid ${t.border}`,
              borderLeft: `3px solid ${t.primary}`,
            }}
          >
            <div style={{ fontSize: cc.caption, fontWeight: 700, color: t.textMuted, letterSpacing: 0.35, marginBottom: 4 }}>
              {formato === 'crudo' ? 'BASE CRUDA' : 'INFORME'}
            </div>
            <p style={{ margin: 0, fontSize: cc.sm, color: t.text, lineHeight: 1.45 }}>
              {desc}
              {notaInterv ? (
                <span style={{ color: t.textMuted }}>{notaInterv}</span>
              ) : null}
            </p>
          </div>

          <div
            style={{
              marginTop: cc.padSm,
              padding: `${cc.padSm} ${cc.pad}`,
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.bgCard,
            }}
          >
            <div style={{ fontSize: cc.caption, fontWeight: 700, color: t.textMuted, letterSpacing: 0.35, marginBottom: 4 }}>
              ALCANCE
            </div>
            <div style={{ fontSize: cc.sm, color: t.text, lineHeight: 1.45 }}>
              {estimado.cargando ? (
                <span style={{ color: t.textMuted }}>Calculando…</span>
              ) : (
                estimado.alcance || '—'
              )}
            </div>
          </div>

          {estimado.esGrande && !estimado.cargando && (
            <div
              style={{
                marginTop: cc.padSm,
                padding: `${cc.padSm} ${cc.pad}`,
                borderRadius: 10,
                background: '#FFFBEB',
                border: '1px solid #FCD34D',
                borderLeft: '3px solid #F59E0B',
                color: '#92400E',
                fontSize: cc.sm,
                lineHeight: 1.45,
              }}
            >
              <strong style={{ fontSize: cc.label }}>Volumen alto</strong>
              {' — '}
              {estimado.registros != null
                ? `${estimado.registros.toLocaleString('es-CO')} registros. `
                : 'Muchos registros. '}
              Puede tardar varios minutos; filtre por capítulo o ítem para acelerar.
            </div>
          )}

          {error ? (
            <div
              style={{
                marginTop: cc.padSm,
                padding: `${cc.padSm} ${cc.pad}`,
                borderRadius: 10,
                background: '#FEE2E2',
                border: '1px solid #FECACA',
                color: '#B91C1C',
                fontSize: cc.sm,
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <div
          style={{
            padding: `14px 20px`,
            borderTop: `1px solid ${t.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button type="button" onClick={onClose} disabled={busy} style={btnSec}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void onDownload?.()}
            disabled={busy}
            style={{
              background: busy ? '#94a3b8' : t.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: `${cc.padSm} 22px`,
              fontWeight: 700,
              fontSize: cc.label,
              cursor: busy ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: busy ? 0.85 : 1,
            }}
          >
            {busy ? 'Generando…' : 'Descargar Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}
